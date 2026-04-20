import { execa } from "execa";
import { buildResolverEnv, resolveRuntime } from "./resolver.js";
import type { Logger } from "./logger.js";
import type { CliResult, ResolvedRuntime, RuntimeConfig } from "./types.js";

const DEFAULT_TIMEOUT_MS = 15_000;

export interface RunMempalaceOptions {
  cwd?: string;
  timeoutMs?: number;
  input?: string;
  json?: boolean;
  signal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
  runtimeConfig?: Pick<RuntimeConfig, "pythonOverride" | "encoding">;
  runtime?: ResolvedRuntime | null;
  logger?: Logger;
}

export async function runMempalace<T = unknown>(
  args: string[],
  options: RunMempalaceOptions = {},
): Promise<CliResult<T>> {
  const startedAt = Date.now();
  const env = options.env ?? process.env;

  try {
    const runtime =
      options.runtime ??
      (await resolveRuntime({
        env,
        logger: options.logger,
        runtimeConfig: options.runtimeConfig,
      }));

    const finalArgs = buildCommandArgs(runtime.args, args, options.json);
    const command = formatCommand(runtime.exe, finalArgs);
    const runtimeEnv =
      runtime.kind === "python"
        ? buildResolverEnv(env, options.runtimeConfig?.encoding)
        : env;

    const result = await execa(runtime.exe, finalArgs, {
      all: true,
      cwd: options.cwd,
      env: runtimeEnv,
      input: options.input,
      reject: false,
      cancelSignal: options.signal,
      stdin: options.input === undefined ? "ignore" : "pipe",
      timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      windowsHide: true,
    });

    const durationMs = Date.now() - startedAt;
    const stderr = collectStderr(result.stderr, result.all);

    options.logger?.info("cli", "mempalace command finished", {
      command,
      durationMs,
      exitCode: result.exitCode,
      failed: result.failed,
      timedOut: result.timedOut,
    });

    if (result.exitCode !== 0 || result.failed || result.timedOut) {
      return {
        ok: false,
        stderr: result.timedOut
          ? buildTimeoutMessage(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, stderr)
          : stderr || "MemPalace command failed.",
        durationMs,
        command,
      };
    }

    if (!options.json) {
      return {
        ok: true,
        data: undefined,
        stderr,
        durationMs,
        command,
      };
    }

    try {
      const data = JSON.parse(result.stdout) as T;
      return {
        ok: true,
        data,
        stderr,
        durationMs,
        command,
      };
    } catch {
      return {
        ok: false,
        stderr: collectJsonParseError(result.stdout, stderr),
        durationMs,
        command,
      };
    }
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : String(error);

    options.logger?.error("cli", "mempalace command failed before execution", {
      args,
      durationMs,
      error: message,
    });

    return {
      ok: false,
      stderr: message,
      durationMs,
      command: formatCommand("<unresolved-runtime>", args),
    };
  }
}

function buildCommandArgs(
  runtimeArgs: string[],
  args: string[],
  json: boolean | undefined,
): string[] {
  const commandArgs = [...runtimeArgs, ...args];

  if (json && !commandArgs.includes("--json")) {
    commandArgs.push("--json");
  }

  return commandArgs;
}

function formatCommand(exe: string, args: string[]): string {
  return [exe, ...args].map(formatArg).join(" ");
}

function formatArg(arg: string): string {
  return /\s/.test(arg) ? `"${arg.replaceAll('"', '\\"')}"` : arg;
}

function collectStderr(stderr: string, combinedOutput: string | undefined): string | undefined {
  const normalizedStderr = stderr.trim();
  if (normalizedStderr.length > 0) {
    return normalizedStderr;
  }

  const normalizedCombinedOutput = combinedOutput?.trim();
  return normalizedCombinedOutput && normalizedCombinedOutput.length > 0
    ? normalizedCombinedOutput
    : undefined;
}

function collectJsonParseError(
  stdout: string,
  stderr: string | undefined,
): string {
  const normalizedStdout = stdout.trim();
  if (normalizedStdout.length > 0) {
    return `Failed to parse JSON output from MemPalace.\n${normalizedStdout}`;
  }

  return stderr ?? "Failed to parse JSON output from MemPalace.";
}

function buildTimeoutMessage(
  timeoutMs: number,
  stderr: string | undefined,
): string {
  const baseMessage = `Command timed out after ${timeoutMs} ms.`;
  if (!stderr) {
    return baseMessage;
  }

  return `${baseMessage}\n${stderr}`;
}

export const __internal = {
  buildCommandArgs,
  buildTimeoutMessage,
  collectStderr,
  collectJsonParseError,
};
