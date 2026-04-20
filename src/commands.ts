import { runMempalace } from "./cli.js";
import { renderDoctorReport, runDoctor } from "./doctor.js";
import type { Logger } from "./logger.js";
import type { MempalaceConfig, RuntimePromiseContext } from "./types.js";

interface CommandRegistrationDeps extends RuntimePromiseContext {
  config: MempalaceConfig;
  logger: Logger;
}

interface CommandDefinition {
  name: string;
  description: string;
  execute: (...args: unknown[]) => Promise<string>;
}

type CommandHost = Record<string, unknown>;

const SETUP_INCOMPLETE_MESSAGE = "Setup incomplete, run /mempalace:doctor.";

export function registerCommands(
  pi: unknown,
  deps: CommandRegistrationDeps,
): void {
  const host = pi as CommandHost;

  const commands: CommandDefinition[] = [
    {
      name: "/mempalace:help",
      description: "Show the available MemPalace commands.",
      execute: async () => renderHelpText(),
    },
    {
      name: "/mempalace:doctor",
      description: "Run setup diagnostics for the MemPalace extension.",
      execute: async () => {
        deps.logger.info("command:doctor", "running doctor command");
        const report = await runDoctor({
          config: deps.config,
          logger: deps.logger,
        });
        return renderDoctorReport(report);
      },
    },
    {
      name: "/mempalace:init",
      description: "Ask the agent to initialize a MemPalace directory.",
      execute: async (...args) =>
        queueAgentInstruction(
          host,
          deps,
          "init",
          buildInitPrompt(extractCommandText(args)),
        ),
    },
    {
      name: "/mempalace:init!",
      description: "Run MemPalace init directly without an agent round-trip.",
      execute: async (...args) =>
        runRawCommand(deps, "init", extractCommandText(args), {
          json: false,
        }),
    },
    {
      name: "/mempalace:mine",
      description: "Ask the agent to mine files or directories into MemPalace.",
      execute: async (...args) =>
        queueAgentInstruction(
          host,
          deps,
          "mine",
          buildMinePrompt(extractCommandText(args)),
        ),
    },
    {
      name: "/mempalace:mine!",
      description: "Run MemPalace mine directly without an agent round-trip.",
      execute: async (...args) =>
        runRawCommand(deps, "mine", extractCommandText(args), {
          json: true,
        }),
    },
    {
      name: "/mempalace:search",
      description: "Ask the agent to search MemPalace.",
      execute: async (...args) =>
        queueAgentInstruction(
          host,
          deps,
          "search",
          buildSearchPrompt(extractCommandText(args)),
        ),
    },
    {
      name: "/mempalace:search!",
      description: "Run MemPalace search directly without an agent round-trip.",
      execute: async (...args) =>
        runRawCommand(deps, "search", extractCommandText(args), {
          json: true,
        }),
    },
    {
      name: "/mempalace:status",
      description: "Ask the agent to report MemPalace status.",
      execute: async () =>
        queueAgentInstruction(host, deps, "status", buildStatusPrompt()),
    },
    {
      name: "/mempalace:status!",
      description: "Run MemPalace status directly without an agent round-trip.",
      execute: async () =>
        runDirectCliCommand(deps, "status", ["status"], {
          json: true,
        }),
    },
    {
      name: "/mempalace:wake-up",
      description: "Ask the agent to load MemPalace session context.",
      execute: async () =>
        queueAgentInstruction(host, deps, "wake-up", buildWakeUpPrompt()),
    },
    {
      name: "/mempalace:wake-up!",
      description: "Run MemPalace wake-up directly without an agent round-trip.",
      execute: async () =>
        runDirectCliCommand(deps, "wake-up", ["wake-up"], {
          json: true,
        }),
    },
  ];

  for (const command of commands) {
    registerCommand(host, command, deps.logger);
  }
}

function registerCommand(
  pi: CommandHost,
  command: CommandDefinition,
  logger: Logger,
): void {
  const handler = async (...args: unknown[]) => {
    try {
      return await command.execute(...args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn("command", "command execution failed", {
        name: command.name,
        error: message,
      });
      return message;
    }
  };

  const registrationAttempts: Array<() => boolean> = [
    () =>
      tryRegisterObjectCall(pi.registerSlashCommand, {
        name: command.name,
        description: command.description,
        handler,
      }),
    () =>
      tryRegisterPositionalCall(
        pi.registerSlashCommand,
        command.name,
        command.description,
        handler,
      ),
    () =>
      tryRegisterObjectCall(pi.registerCommand, {
        name: command.name,
        description: command.description,
        handler,
      }),
    () =>
      tryRegisterPositionalCall(
        pi.registerCommand,
        command.name,
        command.description,
        handler,
      ),
  ];

  for (const attempt of registrationAttempts) {
    if (attempt()) {
      logger.info("command", "registered command", {
        name: command.name,
      });
      return;
    }
  }

  logger.warn("command", "unable to register command with current host API", {
    name: command.name,
  });
}

async function queueAgentInstruction(
  host: CommandHost,
  deps: CommandRegistrationDeps,
  commandName: string,
  prompt: string,
): Promise<string> {
  deps.logger.info(`command:${commandName}`, "queueing agent instruction", {
    prompt,
  });

  const queued = tryQueuePrompt(host, prompt);
  if (queued) {
    return `Queued agent instruction for /mempalace:${commandName}.`;
  }

  deps.logger.warn(`command:${commandName}`, "unable to queue prompt via host API", {
    prompt,
  });

  return [
    "Unable to inject a prompt through the current host API.",
    "",
    "Use this instruction with the agent:",
    prompt,
  ].join("\n");
}

async function runRawCommand(
  deps: CommandRegistrationDeps,
  commandName: "init" | "mine" | "search",
  inputText: string,
  options: { json: boolean },
): Promise<string> {
  const trimmedInput = inputText.trim();

  switch (commandName) {
    case "search":
      if (!trimmedInput) {
        return 'Usage: /mempalace:search "query"';
      }
      return runDirectCliCommand(deps, commandName, ["search", trimmedInput], options);
    case "init":
    case "mine": {
      const targetPath = trimmedInput || process.cwd();
      return runDirectCliCommand(deps, commandName, [commandName, targetPath], options);
    }
  }
}

async function runDirectCliCommand(
  deps: CommandRegistrationDeps,
  commandName: string,
  args: string[],
  options: { json: boolean },
): Promise<string> {
  const runtime = await deps.runtimePromise;
  if (runtime === null) {
    return SETUP_INCOMPLETE_MESSAGE;
  }

  deps.logger.info(`command:${commandName}`, "running raw mempalace command", {
    args,
  });

  const result = await runMempalace(args, {
    json: options.json,
    logger: deps.logger,
    runtimeConfig: deps.config.runtime,
  });

  if (!result.ok) {
    return [
      `Command failed: ${result.command}`,
      result.stderr ?? "MemPalace command failed.",
    ].join("\n");
  }

  if (!options.json) {
    return [`Command finished: ${result.command}`].join("\n");
  }

  return [
    `Command finished: ${result.command}`,
    "",
    JSON.stringify(result.data ?? {}, null, 2),
  ].join("\n");
}

function buildSearchPrompt(inputText: string): string {
  const query = inputText.trim();
  if (!query) {
    throw new Error('Usage: /mempalace:search "query"');
  }

  return [
    "[pi-mempalace] Use the mempalace_search tool to search the palace for:",
    `query: "${query}"`,
    "",
    "Show the top results to me, then summarize the most relevant ones.",
  ].join("\n");
}

function buildInitPrompt(inputText: string): string {
  const targetPath = inputText.trim() || process.cwd();

  return [
    "[pi-mempalace] Use the mempalace_init tool to initialize a palace directory.",
    `path: "${targetPath}"`,
    "",
    "Then confirm where the palace was initialized.",
  ].join("\n");
}

function buildMinePrompt(inputText: string): string {
  const targetPath = inputText.trim() || process.cwd();

  return [
    "[pi-mempalace] Use the mempalace_mine tool to mine content into the palace.",
    `path: "${targetPath}"`,
    "",
    "Then summarize what was ingested or report any issues.",
  ].join("\n");
}

function buildStatusPrompt(): string {
  return [
    "[pi-mempalace] Use the mempalace_status tool to report palace state.",
    "",
    "Summarize the current palace metadata and highlight anything relevant.",
  ].join("\n");
}

function buildWakeUpPrompt(): string {
  return [
    "[pi-mempalace] Use the mempalace_wake_up tool to load session context.",
    "",
    "Summarize the most useful context for continuing this session.",
  ].join("\n");
}

function renderHelpText(): string {
  return [
    "MemPalace commands",
    "/mempalace:doctor     Run setup diagnostics.",
    "/mempalace:help       Show this help text.",
    "/mempalace:init       Ask the agent to initialize a palace directory.",
    "/mempalace:init!      Run MemPalace init directly.",
    "/mempalace:mine       Ask the agent to mine files or directories.",
    "/mempalace:mine!      Run MemPalace mine directly.",
    "/mempalace:search     Ask the agent to search MemPalace.",
    "/mempalace:search!    Run MemPalace search directly.",
    "/mempalace:status     Ask the agent for palace status.",
    "/mempalace:status!    Run MemPalace status directly.",
    "/mempalace:wake-up    Ask the agent to load session context.",
    "/mempalace:wake-up!   Run MemPalace wake-up directly.",
  ].join("\n");
}

function extractCommandText(args: unknown[]): string {
  if (args.length === 0) {
    return "";
  }

  const [firstArg] = args;

  if (typeof firstArg === "string") {
    return firstArg.trim();
  }

  if (Array.isArray(firstArg)) {
    return firstArg.filter((item) => typeof item === "string").join(" ").trim();
  }

  if (firstArg && typeof firstArg === "object") {
    const textCandidates = ["text", "input", "args", "query", "path"];
    for (const key of textCandidates) {
      const value = Reflect.get(firstArg, key);
      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
    }
  }

  return args
    .filter((value) => typeof value === "string")
    .join(" ")
    .trim();
}

function tryQueuePrompt(host: CommandHost, prompt: string): boolean {
  const queueAttempts: Array<() => boolean> = [
    () => tryCallWithSingleArg(host.queuePrompt, prompt),
    () => tryCallWithSingleArg(host.enqueuePrompt, prompt),
    () => tryCallWithSingleArg(host.addPrompt, prompt),
    () =>
      tryCallWithSingleArg(host.beforeAgentStart, {
        prompt,
      }),
  ];

  for (const attempt of queueAttempts) {
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
  description: string,
  handler: (...args: unknown[]) => Promise<string>,
): boolean {
  if (typeof method !== "function") {
    return false;
  }

  try {
    method(name, description, handler);
    return true;
  } catch {
    return false;
  }
}
