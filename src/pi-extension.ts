import { runMempalace } from "./cli.js";
import {
  consumeAutosaveReminder,
  resetAutosaveCounter,
  resolvePreIngestTarget,
} from "./hooks.js";
import { createExtensionRuntime, type ExtensionRuntime } from "./index.js";
import { createPiToolDefinitions, type PiToolDefinitionLike } from "./tools.js";

interface PiContentText {
  type: "text";
  text: string;
}

interface PiToolResponse {
  content: PiContentText[];
  details?: unknown;
}

interface PiUiApi {
  setStatus?: (id: string, message?: string) => void;
  notify?: (message: string, level?: string) => void;
}

interface PiEventContext {
  ui?: PiUiApi;
}

interface BeforeAgentStartEvent {
  systemPrompt: string;
}

interface ContextMessage {
  role?: string;
  content?: unknown;
}

interface ContextEvent {
  sessionId?: string;
  messages: ContextMessage[];
}

interface SessionShutdownEvent {
  sessionId?: string;
}

interface SessionBeforeCompactEvent {
  sessionId?: string;
  cwd?: string;
  sessionPath?: string;
  filePath?: string;
}

interface PiExtensionApiLike {
  projectRoot?: string;
  registerTool?: (tool: PiToolDefinitionLike) => void;
  on?: (eventName: string, handler: (...args: any[]) => unknown) => void;
}

function reportBootstrapFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[pi-mempalace-extension] bootstrap failed: ${message}\n`);
}

function textContent(text: string): PiContentText[] {
  return [{ type: "text", text }];
}

function safeJson(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function buildContextMessage(content: string): ContextMessage {
  return {
    role: "user",
    content,
  };
}

function extractMessageText(message: ContextMessage): string {
  const content = message.content;
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (part && typeof part === "object" && "text" in part) {
          const text = Reflect.get(part, "text");
          return typeof text === "string" ? text : "";
        }

        return "";
      })
      .join("\n")
      .trim();
  }

  return "";
}

function findLastUserMessageText(event: ContextEvent): string {
  for (let index = event.messages.length - 1; index >= 0; index -= 1) {
    const message = event.messages[index];
    if (message?.role === "user") {
      return extractMessageText(message);
    }
  }

  return "";
}

function setStatus(ctx: PiEventContext | undefined, message: string | undefined): void {
  ctx?.ui?.setStatus?.("mempalace", message);
}

async function buildWakeUpPrompt(runtime: ExtensionRuntime): Promise<string | null> {
  const resolved = await runtime.runtimePromise;
  if (resolved === null) {
    return null;
  }

  const result = await runMempalace(["wake-up"], {
    json: true,
    logger: runtime.logger,
    runtimeConfig: runtime.config.runtime,
  });

  if (!result.ok || result.data === undefined) {
    runtime.logger.warn("pi-extension", "wake-up context load failed", {
      stderr: result.stderr ?? null,
      command: result.command,
    });
    return null;
  }

  return [
    "MemPalace wake-up context:",
    safeJson(result.data),
  ].join("\n");
}

async function runPreCompactionIngest(
  runtime: ExtensionRuntime,
  event: SessionBeforeCompactEvent,
): Promise<string | null> {
  const resolved = await runtime.runtimePromise;
  if (resolved === null || !runtime.config.compaction.preIngest) {
    return null;
  }

  const targetPath = resolvePreIngestTarget(runtime.config, event);
  const result = await runMempalace(["mine", targetPath], {
    cwd: event.cwd,
    json: true,
    logger: runtime.logger,
    runtimeConfig: runtime.config.runtime,
    timeoutMs: runtime.config.compaction.timeoutMs,
  });

  if (!result.ok) {
    runtime.logger.warn("pi-extension", "pre-compaction ingest failed", {
      targetPath,
      stderr: result.stderr ?? null,
      command: result.command,
    });
    return null;
  }

  resetAutosaveCounter(event.sessionId);
  runtime.logger.info("pi-extension", "pre-compaction ingest succeeded", {
    targetPath,
    command: result.command,
    durationMs: result.durationMs,
  });

  return `MemPalace pre-compaction ingest finished for "${targetPath}".`;
}

export default function mempalacePiExtension(pi: PiExtensionApiLike): void {
  const runtimePromise = createExtensionRuntime({
    projectRoot: pi.projectRoot,
  }).catch((error) => {
    reportBootstrapFailure(error);
    throw error;
  });

  for (const tool of createPiToolDefinitions(runtimePromise)) {
    pi.registerTool?.(tool);
  }

  pi.on?.("session_start", async (_event: unknown, ctx?: PiEventContext) => {
    const runtime = await runtimePromise.catch(() => null);
    if (runtime === null) {
      setStatus(ctx, "MemPalace bootstrap failed, inspect extension logs");
      return;
    }

    const resolved = await runtime.runtimePromise;
    setStatus(
      ctx,
      resolved
        ? `MemPalace ready (${resolved.kind} ${resolved.version})`
        : "MemPalace unavailable, run mempalace_doctor",
    );
  });

  pi.on?.("before_agent_start", async (event: BeforeAgentStartEvent) => {
    const runtime = await runtimePromise.catch(() => null);
    if (runtime === null) {
      return;
    }

    const wakeUpContext = await buildWakeUpPrompt(runtime);
    if (!wakeUpContext) {
      return;
    }

    return {
      systemPrompt: `${event.systemPrompt}\n\n${wakeUpContext}`,
    };
  });

  pi.on?.("context", async (event: ContextEvent) => {
    const runtime = await runtimePromise.catch(() => null);
    if (runtime === null) {
      return;
    }

    const reminder = consumeAutosaveReminder(
      runtime.config,
      event.sessionId,
      findLastUserMessageText(event),
    );

    if (!reminder) {
      return;
    }

    return {
      messages: [...event.messages, buildContextMessage(reminder)],
    };
  });

  pi.on?.("session_before_compact", async (event: SessionBeforeCompactEvent) => {
    const runtime = await runtimePromise.catch(() => null);
    if (runtime === null) {
      return;
    }

    const notice = await runPreCompactionIngest(runtime, event);
    if (!notice) {
      return;
    }

    return {
      messages: [buildContextMessage(notice)],
    };
  });

  pi.on?.("session_shutdown", async (event: SessionShutdownEvent, ctx?: PiEventContext) => {
    const runtime = await runtimePromise.catch(() => null);
    resetAutosaveCounter(event.sessionId);
    setStatus(ctx, undefined);
    await runtime?.logger.flush();
  });

  pi.on?.("tool_call", async () => undefined);

  void runtimePromise.catch(() => undefined);
}
