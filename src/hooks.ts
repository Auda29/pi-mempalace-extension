import path from "node:path";
import { runMempalace } from "./cli.js";
import type { Logger } from "./logger.js";
import type { MempalaceConfig, RuntimePromiseContext } from "./types.js";

interface HookRegistrationDeps extends RuntimePromiseContext {
  config: MempalaceConfig;
  logger: Logger;
}

type HookHost = Record<string, unknown>;

interface HookContext {
  cwd?: string;
  message?: string;
  prompt?: string;
  sessionId?: string;
  sessionPath?: string;
  filePath?: string;
}

const DEFAULT_SESSION_ID = "default";
const AUTOSAVE_PROMPT =
  "[pi-mempalace] Consider saving recent progress to MemPalace before continuing.";

export function registerHooks(
  pi: unknown,
  deps: HookRegistrationDeps,
): void {
  const host = pi as HookHost;
  const autosaveCounters = new Map<string, number>();

  registerHook(
    host,
    {
      name: "user_message",
      execute: async (context) =>
        handleUserMessageHook(host, deps, autosaveCounters, context),
    },
    deps.logger,
  );

  registerHook(
    host,
    {
      name: "session_before_compact",
      execute: async (context) =>
        handleBeforeCompactHook(deps, autosaveCounters, context),
    },
    deps.logger,
  );

  void deps.runtimePromise.then((runtime) => {
    deps.logger.debug("hooks", "hook runtime availability checked", {
      available: runtime !== null,
    });
  });
}

async function handleUserMessageHook(
  host: HookHost,
  deps: HookRegistrationDeps,
  counters: Map<string, number>,
  context: HookContext,
): Promise<string | undefined> {
  if (!deps.config.autosave.enabled) {
    return undefined;
  }

  const message = extractText(context);
  if (!isTrackableUserMessage(message)) {
    return undefined;
  }

  const sessionId = getSessionId(context);
  const nextCount = (counters.get(sessionId) ?? 0) + 1;
  counters.set(sessionId, nextCount);

  deps.logger.debug("hook:user_message", "tracked user message", {
    sessionId,
    count: nextCount,
  });

  if (nextCount < deps.config.autosave.threshold) {
    return undefined;
  }

  counters.set(sessionId, 0);
  const queued = tryQueuePrompt(host, AUTOSAVE_PROMPT);

  deps.logger.info("hook:user_message", "autosave reminder triggered", {
    sessionId,
    queued,
  });

  return queued ? undefined : AUTOSAVE_PROMPT;
}

async function handleBeforeCompactHook(
  deps: HookRegistrationDeps,
  counters: Map<string, number>,
  context: HookContext,
): Promise<string | undefined> {
  if (!deps.config.compaction.preIngest) {
    return undefined;
  }

  const runtime = await deps.runtimePromise;
  if (runtime === null) {
    deps.logger.warn("hook:session_before_compact", "skipping pre-ingest because runtime is unavailable");
    return undefined;
  }

  const targetPath = resolvePreIngestTarget(deps.config, context);
  const result = await runMempalace(["mine", targetPath], {
    cwd: context.cwd,
    json: true,
    logger: deps.logger,
    runtimeConfig: deps.config.runtime,
    timeoutMs: deps.config.compaction.timeoutMs,
  });

  if (!result.ok) {
    deps.logger.warn("hook:session_before_compact", "pre-compaction ingest failed", {
      targetPath,
      stderr: result.stderr ?? null,
      command: result.command,
    });
    return undefined;
  }

  counters.set(getSessionId(context), 0);
  deps.logger.info("hook:session_before_compact", "pre-compaction ingest succeeded", {
    targetPath,
    command: result.command,
    durationMs: result.durationMs,
  });

  return `Pre-compaction MemPalace ingest finished for "${targetPath}".`;
}

function registerHook(
  host: HookHost,
  hook: {
    name: string;
    execute: (context: HookContext) => Promise<string | undefined>;
  },
  logger: Logger,
): void {
  const handler = async (context: HookContext = {}) => {
    try {
      return await hook.execute(context);
    } catch (error) {
      logger.warn("hooks", "hook execution failed", {
        name: hook.name,
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  };

  const attempts: Array<() => boolean> = [
    () =>
      tryRegisterObjectCall(host.registerHook, {
        event: hook.name,
        handler,
      }),
    () =>
      tryRegisterObjectCall(host.registerLifecycleHook, {
        event: hook.name,
        handler,
      }),
    () => tryRegisterPositionalCall(host.registerHook, hook.name, handler),
    () =>
      tryRegisterPositionalCall(host.registerLifecycleHook, hook.name, handler),
  ];

  for (const attempt of attempts) {
    if (attempt()) {
      logger.info("hooks", "registered hook", {
        name: hook.name,
      });
      return;
    }
  }

  logger.warn("hooks", "unable to register hook with current host API", {
    name: hook.name,
  });
}

function tryRegisterObjectCall(
  method: unknown,
  payload: Record<string, unknown>,
): boolean {
  if (typeof method !== "function") {
    return false;
  }

  try {
    method(payload);
    return true;
  } catch {
    return false;
  }
}

function tryRegisterPositionalCall(
  method: unknown,
  name: string,
  handler: (context?: HookContext) => Promise<string | undefined>,
): boolean {
  if (typeof method !== "function") {
    return false;
  }

  try {
    method(name, handler);
    return true;
  } catch {
    return false;
  }
}

function extractText(context: HookContext): string {
  return typeof context.message === "string"
    ? context.message
    : typeof context.prompt === "string"
      ? context.prompt
      : "";
}

function getSessionId(context: HookContext): string {
  return context.sessionId?.trim() || DEFAULT_SESSION_ID;
}

function isTrackableUserMessage(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) {
    return false;
  }

  if (trimmed.startsWith("/")) {
    return false;
  }

  return !trimmed.startsWith("[pi-mempalace]");
}

function tryQueuePrompt(host: HookHost, prompt: string): boolean {
  const attempts: Array<() => boolean> = [
    () => tryCallWithSingleArg(host.queuePrompt, prompt),
    () => tryCallWithSingleArg(host.enqueuePrompt, prompt),
    () => tryCallWithSingleArg(host.addPrompt, prompt),
  ];

  for (const attempt of attempts) {
    if (attempt()) {
      return true;
    }
  }

  return false;
}

function tryCallWithSingleArg(method: unknown, arg: unknown): boolean {
  if (typeof method !== "function") {
    return false;
  }

  try {
    method(arg);
    return true;
  } catch {
    return false;
  }
}

function resolvePreIngestTarget(
  config: MempalaceConfig,
  context: HookContext,
): string {
  const envTarget = process.env.MEMPAL_DIR?.trim();
  if (envTarget) {
    return path.resolve(envTarget);
  }

  if (config.palace.dir) {
    return path.resolve(config.palace.dir);
  }

  const sessionPath = context.sessionPath || context.filePath;
  if (sessionPath) {
    return path.dirname(path.resolve(sessionPath));
  }

  return path.resolve(context.cwd ?? process.cwd());
}

export const __internal = {
  isTrackableUserMessage,
  resolvePreIngestTarget,
};
