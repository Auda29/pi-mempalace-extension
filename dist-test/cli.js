import { execa } from "execa";
import { buildResolverEnv, resolveRuntime } from "./resolver.js";
const DEFAULT_TIMEOUT_MS = 15_000;
export async function runMempalace(args, options = {}) {
    const startedAt = Date.now();
    const env = options.env ?? process.env;
    try {
        const runtime = options.runtime ??
            (await resolveRuntime({
                env,
                logger: options.logger,
                runtimeConfig: options.runtimeConfig,
            }));
        const finalArgs = buildCommandArgs(runtime.args, args, options.json);
        const command = formatCommand(runtime.exe, finalArgs);
        const runtimeEnv = runtime.kind === "python"
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
            const normalizedError = normalizeCliError(result.timedOut
                ? buildTimeoutMessage(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, stderr)
                : stderr || "MemPalace command failed.");
            return {
                ok: false,
                stderr: normalizedError,
                durationMs,
                command,
            };
        }
        if (!options.json) {
            return {
                ok: true,
                data: undefined,
                stdout: normalizeStdout(result.stdout),
                stderr,
                durationMs,
                command,
            };
        }
        try {
            const data = JSON.parse(result.stdout);
            return {
                ok: true,
                data,
                stdout: normalizeStdout(result.stdout),
                stderr,
                durationMs,
                command,
            };
        }
        catch {
            return {
                ok: false,
                stderr: collectJsonParseError(result.stdout, stderr),
                durationMs,
                command,
            };
        }
    }
    catch (error) {
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
function buildCommandArgs(runtimeArgs, args, json) {
    const commandArgs = [...runtimeArgs, ...args];
    if (json && !commandArgs.includes("--json")) {
        commandArgs.push("--json");
    }
    return commandArgs;
}
function formatCommand(exe, args) {
    return [exe, ...args].map(formatArg).join(" ");
}
function formatArg(arg) {
    return /\s/.test(arg) ? `"${arg.replaceAll('"', '\\"')}"` : arg;
}
function collectStderr(stderr, combinedOutput) {
    const normalizedStderr = stderr.trim();
    if (normalizedStderr.length > 0) {
        return normalizedStderr;
    }
    const normalizedCombinedOutput = combinedOutput?.trim();
    return normalizedCombinedOutput && normalizedCombinedOutput.length > 0
        ? normalizedCombinedOutput
        : undefined;
}
function collectJsonParseError(stdout, stderr) {
    const normalizedStdout = stdout.trim();
    if (normalizedStdout.length > 0) {
        return `Failed to parse JSON output from MemPalace.\n${normalizedStdout}`;
    }
    return stderr ?? "Failed to parse JSON output from MemPalace.";
}
function normalizeStdout(stdout) {
    const normalized = stdout.trim();
    return normalized.length > 0 ? normalized : undefined;
}
function buildTimeoutMessage(timeoutMs, stderr) {
    const baseMessage = `Command timed out after ${timeoutMs} ms.`;
    if (!stderr) {
        return baseMessage;
    }
    return `${baseMessage}\n${stderr}`;
}
function normalizeCliError(stderr) {
    if (!/EOFError:\s*EOF when reading a line/i.test(stderr)) {
        return stderr;
    }
    return [
        "MemPalace requested interactive input, but Pi tools run non-interactively.",
        "This command needs a non-interactive CLI path such as `--yes`, or it must be adapted before it can run inside Pi.",
        "",
        stderr,
    ].join("\n");
}
export const __internal = {
    buildCommandArgs,
    normalizeCliError,
    buildTimeoutMessage,
    collectStderr,
    collectJsonParseError,
    normalizeStdout,
};
