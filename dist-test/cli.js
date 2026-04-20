import { execa } from "execa";
import { buildResolverEnv, resolveRuntime } from "./resolver.js";
const DEFAULT_TIMEOUT_MS = 15_000;
export async function runMempalace(args, options = {}) {
    const startedAt = Date.now();
    const env = options.env ?? process.env;
    try {
        const runtime = await resolveRuntime({
            env,
            logger: options.logger,
            runtimeConfig: options.runtimeConfig,
        });
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
            signal: options.signal,
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
                stderr: stderr ||
                    (result.timedOut
                        ? `Command timed out after ${options.timeoutMs ?? DEFAULT_TIMEOUT_MS} ms.`
                        : "MemPalace command failed."),
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
            const data = JSON.parse(result.stdout);
            return {
                ok: true,
                data,
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
export const __internal = {
    buildCommandArgs,
    collectStderr,
    collectJsonParseError,
};
