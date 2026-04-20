import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { buildResolverEnv, resolveRuntime } from "./resolver.js";
const execFile = promisify(execFileCallback);
const DOCTOR_TIMEOUT_MS = 10_000;
const FAST_RESPONSE_MS = 2_000;
const WARN_RESPONSE_MS = 10_000;
const MIN_PYTHON_VERSION = { major: 3, minor: 9 };
export async function runDoctor(options) {
    const env = options.env ?? process.env;
    const logger = options.logger;
    const runtimeResult = await resolveRuntimeForDoctor(options.config, env, logger);
    const checks = await Promise.all([
        checkPythonRuntime(runtimeResult, env, options.config),
        checkMempalacePackage(runtimeResult),
        checkMempalaceVersionCommand(runtimeResult, env, options.config),
        checkMempalDir(env, options.config),
        checkWindowsUtf8(runtimeResult, env, options.config),
    ]);
    logger?.info("doctor", "doctor report generated", {
        statuses: checks.map((check) => ({ id: check.id, status: check.status })),
    });
    return {
        generatedAt: new Date().toISOString(),
        checks,
    };
}
export function renderDoctorReport(report) {
    const lines = ["MemPalace Doctor", `Generated: ${report.generatedAt}`, ""];
    for (const check of report.checks) {
        lines.push(`${statusLabel(check.status)} ${check.title}`);
        lines.push(`  ${check.summary}`);
        if (check.fix) {
            lines.push("  Fix:");
            for (const line of check.fix.split("\n")) {
                lines.push(`    ${line}`);
            }
        }
        lines.push("");
    }
    return lines.join("\n").trimEnd();
}
async function resolveRuntimeForDoctor(config, env, logger) {
    try {
        return await resolveRuntime({
            env,
            logger,
            runtimeConfig: config.runtime,
        });
    }
    catch (error) {
        logger?.warn("doctor", "runtime resolution failed for doctor", {
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
}
async function checkPythonRuntime(runtime, env, config) {
    if (!runtime || runtime.kind !== "python") {
        return {
            id: "python-runtime",
            title: "Python runtime resolved",
            status: "fail",
            summary: "No Python-based MemPalace runtime could be resolved.",
            fix: buildPythonFix(config),
        };
    }
    try {
        const { stdout, stderr } = await execFile(runtime.exe, [...getPythonLauncherArgs(runtime), "--version"], {
            env: buildResolverEnv(env, config.runtime.encoding),
            timeout: DOCTOR_TIMEOUT_MS,
            windowsHide: true,
        });
        const versionText = `${stdout} ${stderr}`.trim();
        const parsed = parsePythonVersion(versionText);
        if (!parsed) {
            return {
                id: "python-runtime",
                title: "Python runtime resolved",
                status: "fail",
                summary: "Python was resolved, but its version could not be parsed.",
                fix: buildPythonFix(config),
            };
        }
        const version = `${parsed.major}.${parsed.minor}.${parsed.patch}`;
        const meetsMinimum = parsed.major > MIN_PYTHON_VERSION.major ||
            (parsed.major === MIN_PYTHON_VERSION.major &&
                parsed.minor >= MIN_PYTHON_VERSION.minor);
        return {
            id: "python-runtime",
            title: "Python runtime resolved",
            status: meetsMinimum ? "pass" : "warn",
            summary: meetsMinimum
                ? `Resolved Python runtime ${version}.`
                : `Resolved Python runtime ${version}, which is below the recommended minimum 3.9.`,
            fix: meetsMinimum ? undefined : buildPythonFix(config),
            details: {
                exe: runtime.exe,
                version,
            },
        };
    }
    catch (error) {
        return {
            id: "python-runtime",
            title: "Python runtime resolved",
            status: "fail",
            summary: `Python runtime probe failed: ${errorMessage(error)}`,
            fix: buildPythonFix(config),
        };
    }
}
async function checkMempalacePackage(runtime) {
    if (!runtime || runtime.kind !== "python") {
        return {
            id: "mempalace-package",
            title: "mempalace package importable",
            status: "fail",
            summary: "The mempalace Python package is not currently importable via a resolved Python runtime.",
            fix: "Install the package into the Python interpreter used for this extension.\npython -m pip install --upgrade mempalace",
        };
    }
    return {
        id: "mempalace-package",
        title: "mempalace package importable",
        status: "pass",
        summary: `mempalace ${runtime.version} is importable with the resolved Python runtime.`,
        details: {
            version: runtime.version,
            exe: runtime.exe,
        },
    };
}
async function checkMempalaceVersionCommand(runtime, env, config) {
    if (!runtime) {
        return {
            id: "mempalace-version",
            title: "mempalace --version responds",
            status: "fail",
            summary: "No runtime is available for a MemPalace version probe.",
            fix: buildPythonFix(config),
        };
    }
    const startedAt = Date.now();
    try {
        const { stdout, stderr } = await execFile(runtime.exe, getMempalaceCommandArgs(runtime, ["--version"]), {
            env: runtime.kind === "python"
                ? buildResolverEnv(env, config.runtime.encoding)
                : env,
            timeout: DOCTOR_TIMEOUT_MS,
            windowsHide: true,
        });
        const durationMs = Date.now() - startedAt;
        const versionText = (stdout || stderr).trim();
        if (durationMs < FAST_RESPONSE_MS) {
            return {
                id: "mempalace-version",
                title: "mempalace --version responds",
                status: "pass",
                summary: `${versionText || "MemPalace version command responded"} in ${durationMs} ms.`,
                details: {
                    durationMs,
                },
            };
        }
        if (durationMs <= WARN_RESPONSE_MS) {
            return {
                id: "mempalace-version",
                title: "mempalace --version responds",
                status: "warn",
                summary: `${versionText || "MemPalace version command responded"} in ${durationMs} ms, which is slower than expected.`,
                details: {
                    durationMs,
                },
            };
        }
        return {
            id: "mempalace-version",
            title: "mempalace --version responds",
            status: "fail",
            summary: `MemPalace version command took ${durationMs} ms and exceeded the acceptable threshold.`,
            fix: "Retry the command manually and verify the Python environment or CLI installation is responsive.",
            details: {
                durationMs,
            },
        };
    }
    catch (error) {
        return {
            id: "mempalace-version",
            title: "mempalace --version responds",
            status: "fail",
            summary: `MemPalace version probe failed: ${errorMessage(error)}`,
            fix: "Verify that MemPalace is installed and available in the resolved runtime.",
        };
    }
}
async function checkMempalDir(env, config) {
    const configuredPath = env.MEMPAL_DIR?.trim() || config.palace.dir;
    if (!configuredPath) {
        return {
            id: "mempal-dir",
            title: "MEMPAL_DIR exists and is writable",
            status: "fail",
            summary: "No palace directory is configured via MEMPAL_DIR or config.",
            fix: 'Set a palace directory, for example:\n$env:MEMPAL_DIR = "C:\\Path\\To\\Palace"',
        };
    }
    const targetPath = path.resolve(configuredPath);
    try {
        await access(targetPath, fsConstants.F_OK);
    }
    catch {
        return {
            id: "mempal-dir",
            title: "MEMPAL_DIR exists and is writable",
            status: "fail",
            summary: `Configured palace directory does not exist: ${targetPath}`,
            fix: `Create the directory or point MEMPAL_DIR to an existing palace directory.\nCurrent value: ${targetPath}`,
        };
    }
    try {
        await access(targetPath, fsConstants.W_OK);
        return {
            id: "mempal-dir",
            title: "MEMPAL_DIR exists and is writable",
            status: "pass",
            summary: `Palace directory is available and writable: ${targetPath}`,
        };
    }
    catch {
        return {
            id: "mempal-dir",
            title: "MEMPAL_DIR exists and is writable",
            status: "warn",
            summary: `Palace directory exists but is not writable: ${targetPath}`,
            fix: "Adjust directory permissions or choose a writable palace directory.",
        };
    }
}
async function checkWindowsUtf8(runtime, env, config) {
    if (process.platform !== "win32") {
        return {
            id: "windows-utf8",
            title: "Windows UTF-8 mode effective",
            status: "skip",
            summary: "UTF-8 environment probe skipped because the current platform is not Windows.",
        };
    }
    if (!runtime || runtime.kind !== "python") {
        return {
            id: "windows-utf8",
            title: "Windows UTF-8 mode effective",
            status: "fail",
            summary: "Windows UTF-8 probe requires a resolved Python runtime.",
            fix: buildPythonFix(config),
        };
    }
    try {
        const { stdout } = await execFile(runtime.exe, [
            ...getPythonLauncherArgs(runtime),
            "-c",
            [
                "import json, os, sys",
                "print(json.dumps({'utf8_mode': sys.flags.utf8_mode, 'pythonioencoding': os.environ.get('PYTHONIOENCODING')}))",
            ].join("; "),
        ], {
            env: buildResolverEnv(env, config.runtime.encoding),
            timeout: DOCTOR_TIMEOUT_MS,
            windowsHide: true,
        });
        const parsed = JSON.parse(stdout.trim());
        const encoding = parsed.pythonioencoding?.toLowerCase() ?? null;
        const effective = parsed.utf8_mode === 1 || encoding === "utf-8";
        return {
            id: "windows-utf8",
            title: "Windows UTF-8 mode effective",
            status: effective ? "pass" : "fail",
            summary: effective
                ? "UTF-8 mode is active for Python child processes on Windows."
                : "UTF-8 mode is not active for Python child processes on Windows.",
            fix: effective
                ? undefined
                : 'Set UTF-8 environment overrides or use the resolver defaults.\nExpected: PYTHONIOENCODING=utf-8 and PYTHONUTF8=1',
            details: {
                utf8Mode: parsed.utf8_mode ?? null,
                pythonioencoding: parsed.pythonioencoding ?? null,
            },
        };
    }
    catch (error) {
        return {
            id: "windows-utf8",
            title: "Windows UTF-8 mode effective",
            status: "fail",
            summary: `Windows UTF-8 probe failed: ${errorMessage(error)}`,
            fix: 'Retry with PYTHONIOENCODING=utf-8 and PYTHONUTF8=1 in the environment.',
        };
    }
}
function getPythonLauncherArgs(runtime) {
    if (runtime.kind === "python" &&
        runtime.args.length >= 2 &&
        runtime.args.at(-2) === "-m" &&
        runtime.args.at(-1) === "mempalace") {
        return runtime.args.slice(0, -2);
    }
    return runtime.args;
}
function getMempalaceCommandArgs(runtime, extraArgs) {
    if (runtime.kind !== "python") {
        return [...runtime.args, ...extraArgs];
    }
    const baseArgs = runtime.args.length >= 2 &&
        runtime.args.at(-2) === "-m" &&
        runtime.args.at(-1) === "mempalace"
        ? runtime.args
        : [...runtime.args, "-m", "mempalace"];
    return [...baseArgs, ...extraArgs];
}
function parsePythonVersion(versionOutput) {
    const match = versionOutput.match(/Python\s+(\d+)\.(\d+)\.(\d+)/i);
    if (!match) {
        return null;
    }
    return {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3]),
    };
}
function statusLabel(status) {
    switch (status) {
        case "pass":
            return "[PASS]";
        case "warn":
            return "[WARN]";
        case "fail":
            return "[FAIL]";
        case "skip":
            return "[SKIP]";
    }
}
function buildPythonFix(config) {
    const overrideHint = config.runtime.pythonOverride
        ? `Current python_override: ${config.runtime.pythonOverride}`
        : 'Set MEMPALACE_PYTHON, for example:\n$env:MEMPALACE_PYTHON = "C:\\Path\\To\\Python\\python.exe"';
    return [
        "Install MemPalace into the intended Python interpreter:",
        "python -m pip install --upgrade mempalace",
        "",
        overrideHint,
    ].join("\n");
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
