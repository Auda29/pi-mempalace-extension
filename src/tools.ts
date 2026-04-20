import { runMempalace } from "./cli.js";
import type { Logger } from "./logger.js";
import type { MempalaceConfig, RuntimePromiseContext } from "./types.js";

interface ToolRegistrationDeps extends RuntimePromiseContext {
  config: MempalaceConfig;
  logger: Logger;
}

interface ToolDetails {
  command: string;
  durationMs: number;
  source: "cli";
}

interface ToolResult {
  success: boolean;
  result?: unknown;
  message: string;
  details?: ToolDetails;
}

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: Record<string, unknown>) => Promise<ToolResult>;
}

type ToolHost = Record<string, unknown>;

const SETUP_INCOMPLETE_MESSAGE =
  "Setup incomplete, run /mempalace:doctor.";

export function registerTools(
  pi: unknown,
  deps: ToolRegistrationDeps,
): void {
  const host = pi as ToolHost;
  const tools = createToolDefinitions(deps);

  for (const tool of tools) {
    registerTool(host, tool, deps.logger);
  }

  void deps.runtimePromise.then((runtime) => {
    deps.logger.debug("tools", "tool runtime availability checked", {
      available: runtime !== null,
    });
  });
}

function createToolDefinitions(deps: ToolRegistrationDeps): ToolDefinition[] {
  return [
    {
      name: "mempalace_search",
      description: "Search the MemPalace knowledge base.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
          cwd: { type: "string" },
        },
        required: ["query"],
        additionalProperties: false,
      },
      execute: async (input) => {
        const query = getRequiredString(input, "query");
        const cwd = getOptionalString(input, "cwd");

        return runToolCommand(deps, "mempalace_search", ["search", query], {
          cwd,
          json: true,
          successMessage: `MemPalace search completed for "${query}".`,
        });
      },
    },
    {
      name: "mempalace_mine",
      description: "Mine files or directories into MemPalace.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string" },
          cwd: { type: "string" },
        },
        additionalProperties: false,
      },
      execute: async (input) => {
        const toolPath = getOptionalString(input, "path");
        const cwd = getOptionalString(input, "cwd");
        const targetPath = toolPath ?? cwd ?? process.cwd();

        return runToolCommand(deps, "mempalace_mine", ["mine", targetPath], {
          cwd,
          json: true,
          successMessage: `MemPalace mine completed for "${targetPath}".`,
        });
      },
    },
    {
      name: "mempalace_status",
      description: "Show MemPalace status information.",
      inputSchema: {
        type: "object",
        properties: {
          cwd: { type: "string" },
        },
        additionalProperties: false,
      },
      execute: async (input) => {
        const cwd = getOptionalString(input, "cwd");

        return runToolCommand(deps, "mempalace_status", ["status"], {
          cwd,
          json: true,
          successMessage: "MemPalace status loaded.",
        });
      },
    },
    {
      name: "mempalace_init",
      description: "Initialize a new MemPalace directory.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string" },
          cwd: { type: "string" },
        },
        additionalProperties: false,
      },
      execute: async (input) => {
        const toolPath = getOptionalString(input, "path");
        const cwd = getOptionalString(input, "cwd");
        const targetPath = toolPath ?? cwd ?? process.cwd();

        return runToolCommand(deps, "mempalace_init", ["init", targetPath], {
          cwd,
          json: false,
          successMessage: `MemPalace initialized at "${targetPath}".`,
        });
      },
    },
    {
      name: "mempalace_wake_up",
      description: "Load MemPalace context for a new session.",
      inputSchema: {
        type: "object",
        properties: {
          cwd: { type: "string" },
        },
        additionalProperties: false,
      },
      execute: async (input) => {
        const cwd = getOptionalString(input, "cwd");

        return runToolCommand(deps, "mempalace_wake_up", ["wake-up"], {
          cwd,
          json: true,
          successMessage: "MemPalace wake-up completed.",
        });
      },
    },
  ];
}

async function runToolCommand(
  deps: ToolRegistrationDeps,
  toolName: string,
  args: string[],
  options: {
    cwd?: string;
    json: boolean;
    successMessage: string;
  },
): Promise<ToolResult> {
  const runtime = await deps.runtimePromise;
  if (runtime === null) {
    return createSetupIncompleteResult();
  }

  const cliResult = await runMempalace(args, {
    cwd: options.cwd,
    json: options.json,
    logger: deps.logger,
    runtimeConfig: deps.config.runtime,
  });

  if (!cliResult.ok) {
    deps.logger.warn(`tool:${toolName}`, "tool execution failed", {
      command: cliResult.command,
      stderr: cliResult.stderr ?? null,
      durationMs: cliResult.durationMs,
    });

    return {
      success: false,
      message: cliResult.stderr ?? "MemPalace command failed.",
      details: createToolDetails(cliResult.command, cliResult.durationMs),
    };
  }

  deps.logger.info(`tool:${toolName}`, "tool execution succeeded", {
    command: cliResult.command,
    durationMs: cliResult.durationMs,
  });

  return {
    success: true,
    result: cliResult.data,
    message: options.successMessage,
    details: createToolDetails(cliResult.command, cliResult.durationMs),
  };
}

function registerTool(
  pi: ToolHost,
  tool: ToolDefinition,
  logger: Logger,
): void {
  const handler = async (input: Record<string, unknown> = {}) => {
    try {
      return await tool.execute(input);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      logger.warn(`tool:${tool.name}`, "tool input or execution error", {
        error: message,
      });

      return {
        success: false,
        message,
      };
    }
  };

  const registrationAttempts: Array<() => boolean> = [
    () =>
      tryRegisterObjectCall(pi.registerTool, {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        handler,
      }),
    () =>
      tryRegisterObjectCall(pi.registerAgentTool, {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        handler,
      }),
    () =>
      tryRegisterPositionalCall(
        pi.registerTool,
        tool.name,
        tool.description,
        tool.inputSchema,
        handler,
      ),
    () =>
      tryRegisterPositionalCall(
        pi.registerAgentTool,
        tool.name,
        tool.description,
        tool.inputSchema,
        handler,
      ),
  ];

  for (const attempt of registrationAttempts) {
    if (attempt()) {
      logger.info("tools", "registered tool", {
        name: tool.name,
      });
      return;
    }
  }

  logger.warn("tools", "unable to register tool with current host API", {
    name: tool.name,
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
  inputSchema: Record<string, unknown>,
  handler: (input?: Record<string, unknown>) => Promise<ToolResult>,
): boolean {
  if (typeof method !== "function") {
    return false;
  }

  try {
    method(name, description, inputSchema, handler);
    return true;
  } catch {
    return false;
  }
}

function createSetupIncompleteResult(): ToolResult {
  return {
    success: false,
    message: SETUP_INCOMPLETE_MESSAGE,
  };
}

function createToolDetails(command: string, durationMs: number): ToolDetails {
  return {
    command,
    durationMs,
    source: "cli",
  };
}

function getRequiredString(
  input: Record<string, unknown>,
  key: string,
): string {
  const value = getOptionalString(input, key);
  if (!value) {
    throw new Error(`Missing required string input: ${key}`);
  }

  return value;
}

function getOptionalString(
  input: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = input[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}
