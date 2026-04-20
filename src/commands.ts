import { renderDoctorReport, runDoctor } from "./doctor.js";
import type { Logger } from "./logger.js";
import type { MempalaceConfig } from "./types.js";

interface CommandRegistrationDeps {
  config: MempalaceConfig;
  logger: Logger;
}

interface CommandDefinition {
  name: string;
  description: string;
  execute: () => Promise<string>;
}

type CommandHost = Record<string, unknown>;

export function registerCommands(
  pi: unknown,
  deps: CommandRegistrationDeps,
): void {
  const host = pi as CommandHost;
  const commands: CommandDefinition[] = [
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
      name: "/mempalace:help",
      description: "Show the available MemPalace commands.",
      execute: async () =>
        [
          "MemPalace commands",
          "/mempalace:doctor  Run setup diagnostics.",
          "/mempalace:help    Show this help text.",
        ].join("\n"),
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
  const handler = async () => command.execute();

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
  handler: () => Promise<string>,
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
