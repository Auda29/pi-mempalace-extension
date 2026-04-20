import { runMempalace } from "./cli.js";
import { renderDoctorReport, runDoctor } from "./doctor.js";
import type { Logger } from "./logger.js";
import type { MempalaceConfig, ResolvedRuntime } from "./types.js";

interface ToolRegistrationDeps {
  config: MempalaceConfig;
  logger: Logger;
  runtimePromise: Promise<ResolvedRuntime | null>;
}

interface PiToolResponse {
  content: Array<{ type: "text"; text: string }>;
  details?: unknown;
}

export interface PiToolDefinitionLike {
  name: string;
  label: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (
    toolCallId: string,
    params: unknown,
    signal?: AbortSignal,
    onUpdate?: unknown,
    ctx?: unknown,
  ) => Promise<PiToolResponse>;
}

interface ToolSpec {
  name: string;
  label: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (
    deps: ToolRegistrationDeps,
    input: Record<string, unknown>,
    signal?: AbortSignal,
  ) => Promise<PiToolResponse>;
}

const SETUP_INCOMPLETE_MESSAGE =
  "Setup incomplete, run the mempalace_doctor tool.";

function textContent(text: string): Array<{ type: "text"; text: string }> {
  return [{ type: "text", text }];
}

function formatResultSummary(result: unknown): string {
  if (typeof result === "string") {
    return result;
  }

  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

async function runToolCommand(
  deps: ToolRegistrationDeps,
  toolName: string,
  args: string[],
  options: {
    cwd?: string;
    json: boolean;
    successMessage: string;
    signal?: AbortSignal;
  },
): Promise<PiToolResponse> {
  const runtime = await deps.runtimePromise;
  if (runtime === null) {
    throw new Error(SETUP_INCOMPLETE_MESSAGE);
  }

  const cliResult = await runMempalace(args, {
    cwd: options.cwd,
    json: options.json,
    logger: deps.logger,
    runtimeConfig: deps.config.runtime,
    signal: options.signal,
  });

  if (!cliResult.ok) {
    deps.logger.warn(`tool:${toolName}`, "tool execution failed", {
      command: cliResult.command,
      stderr: cliResult.stderr ?? null,
      durationMs: cliResult.durationMs,
    });

    throw new Error(cliResult.stderr ?? "MemPalace command failed.");
  }

  deps.logger.info(`tool:${toolName}`, "tool execution succeeded", {
    command: cliResult.command,
    durationMs: cliResult.durationMs,
  });

  return {
    content: textContent(
      [options.successMessage, formatResultSummary(cliResult.data ?? "Done.")].join("\n\n"),
    ),
    details: {
      result: cliResult.data,
      command: cliResult.command,
      durationMs: cliResult.durationMs,
      source: "cli",
    },
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

function getToolSpecs(): ToolSpec[] {
  return [
    {
      name: "mempalace_search",
      label: "MemPalace Search",
      description: "Search the MemPalace knowledge base.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          cwd: { type: "string" },
        },
        required: ["query"],
        additionalProperties: false,
      },
      execute: async (deps, input, signal) => {
        const query = getRequiredString(input, "query");
        const cwd = getOptionalString(input, "cwd");

        return runToolCommand(deps, "mempalace_search", ["search", query], {
          cwd,
          json: true,
          signal,
          successMessage: `MemPalace search completed for "${query}".`,
        });
      },
    },
    {
      name: "mempalace_mine",
      label: "MemPalace Mine",
      description: "Mine files or directories into MemPalace.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          cwd: { type: "string" },
        },
        additionalProperties: false,
      },
      execute: async (deps, input, signal) => {
        const toolPath = getOptionalString(input, "path");
        const cwd = getOptionalString(input, "cwd");
        const targetPath = toolPath ?? cwd ?? process.cwd();

        return runToolCommand(deps, "mempalace_mine", ["mine", targetPath], {
          cwd,
          json: true,
          signal,
          successMessage: `MemPalace mine completed for "${targetPath}".`,
        });
      },
    },
    {
      name: "mempalace_status",
      label: "MemPalace Status",
      description: "Show MemPalace status information.",
      parameters: {
        type: "object",
        properties: {
          cwd: { type: "string" },
        },
        additionalProperties: false,
      },
      execute: async (deps, input, signal) => {
        const cwd = getOptionalString(input, "cwd");

        return runToolCommand(deps, "mempalace_status", ["status"], {
          cwd,
          json: true,
          signal,
          successMessage: "MemPalace status loaded.",
        });
      },
    },
    {
      name: "mempalace_init",
      label: "MemPalace Init",
      description: "Initialize a new MemPalace directory.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          cwd: { type: "string" },
        },
        additionalProperties: false,
      },
      execute: async (deps, input, signal) => {
        const toolPath = getOptionalString(input, "path");
        const cwd = getOptionalString(input, "cwd");
        const targetPath = toolPath ?? cwd ?? process.cwd();

        return runToolCommand(deps, "mempalace_init", ["init", targetPath], {
          cwd,
          json: false,
          signal,
          successMessage: `MemPalace initialized at "${targetPath}".`,
        });
      },
    },
    {
      name: "mempalace_wake_up",
      label: "MemPalace Wake Up",
      description: "Load MemPalace context for a new session.",
      parameters: {
        type: "object",
        properties: {
          cwd: { type: "string" },
        },
        additionalProperties: false,
      },
      execute: async (deps, input, signal) => {
        const cwd = getOptionalString(input, "cwd");

        return runToolCommand(deps, "mempalace_wake_up", ["wake-up"], {
          cwd,
          json: true,
          signal,
          successMessage: "MemPalace wake-up completed.",
        });
      },
    },
    {
      name: "mempalace_doctor",
      label: "MemPalace Doctor",
      description: "Run setup diagnostics for the MemPalace extension.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: async (deps) => {
        const report = await runDoctor({
          config: deps.config,
          logger: deps.logger,
        });

        return {
          content: textContent(renderDoctorReport(report)),
          details: report,
        };
      },
    },
  ];
}

export function createPiToolDefinitions(
  bootstrap: Promise<ToolRegistrationDeps>,
): PiToolDefinitionLike[] {
  return getToolSpecs().map((tool) => ({
    name: tool.name,
    label: tool.label,
    description: tool.description,
    parameters: tool.parameters,
    async execute(_toolCallId, params, signal) {
      const deps = await bootstrap;

      try {
        return await tool.execute(
          deps,
          (params ?? {}) as Record<string, unknown>,
          signal,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        deps.logger.warn(`tool:${tool.name}`, "tool input or execution error", {
          error: message,
        });
        throw error;
      }
    },
  }));
}
