import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { expandHomeDir } from "./config.js";
const execFile = promisify(execFileCallback);
const DEFAULT_ENCODING = "utf-8";
const PROBE_TIMEOUT_MS = 5_000;
const CACHE_FILENAME = "mempalace-lite-resolver.json";
const PYTHON_PROBE = [
    "import json, sys",
    "from importlib.metadata import PackageNotFoundError, version as package_version",
    "import mempalace",
    "try:",
    "    resolved_version = getattr(mempalace, '__version__', None) or package_version('mempalace')",
    "except PackageNotFoundError:",
    "    raise RuntimeError('mempalace package metadata is not installed')",
    "if not resolved_version:",
    "    raise RuntimeError('mempalace version metadata is unavailable')",
    "print(json.dumps({'version': resolved_version, 'exe': sys.executable}))",
].join("; ");
export async function resolveRuntime(options = {}) {
    const env = options.env ?? process.env;
    const logger = options.logger;
    if (!options.forceRefresh) {
        const cachedRuntime = await readValidCache(logger);
        if (cachedRuntime) {
            logger?.debug("resolver", "runtime cache hit", {
                exe: cachedRuntime.exe,
                kind: cachedRuntime.kind,
            });
            return cachedRuntime;
        }
    }
    const candidates = buildRuntimeCandidates(env, options.runtimeConfig);
    const errors = [];
    for (const candidate of candidates) {
        try {
            const probe = await validateCandidate(candidate, env, options.runtimeConfig);
            await writeCache({
                kind: probe.runtime.kind,
                exe: probe.runtime.exe,
                args: probe.runtime.args,
                version: probe.runtime.version,
                binaryPath: probe.binaryPath,
                binaryHash: probe.binaryHash,
                savedAt: new Date().toISOString(),
            });
            logger?.info("resolver", "runtime resolved", {
                exe: probe.runtime.exe,
                kind: probe.runtime.kind,
                source: candidate.source,
                version: probe.runtime.version,
            });
            return {
                ...normalizeResolvedRuntime(probe.runtime),
                cacheHit: false,
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            errors.push(`${candidate.source}: ${message}`);
            logger?.debug("resolver", "runtime candidate failed", {
                exe: candidate.exe,
                source: candidate.source,
                error: message,
            });
        }
    }
    throw new Error([
        "Unable to resolve a MemPalace runtime.",
        "Tried candidates:",
        ...errors.map((entry) => `- ${entry}`),
    ].join("\n"));
}
export function buildResolverEnv(env = process.env, encoding = DEFAULT_ENCODING) {
    return {
        ...env,
        PYTHONIOENCODING: encoding,
        PYTHONUTF8: "1",
    };
}
export function getResolverCachePath() {
    return path.join(os.homedir(), ".pi", "agent", CACHE_FILENAME);
}
function buildRuntimeCandidates(env, runtimeConfig) {
    const candidates = [];
    const seen = new Set();
    const pythonOverride = runtimeConfig?.pythonOverride?.trim() ||
        normalizeEnvPath(env.MEMPALACE_PYTHON) ||
        null;
    const venvDir = normalizeEnvPath(env.MEMPALACE_VENV);
    const defaultVenvPython = getDefaultVenvPythonPath();
    const addCandidate = (kind, exe, args, source) => {
        const key = `${kind}:${exe}:${args.join("\u0000")}`;
        if (!exe || seen.has(key)) {
            return;
        }
        seen.add(key);
        candidates.push({
            kind,
            exe,
            probeArgs: args,
            runtimeArgs: kind === "python" ? [...args, "-m", "mempalace"] : args,
            source,
        });
    };
    if (pythonOverride) {
        addCandidate("python", path.resolve(pythonOverride), [], "MEMPALACE_PYTHON");
    }
    if (venvDir) {
        addCandidate("python", getVenvPythonPath(venvDir), [], "MEMPALACE_VENV");
    }
    addCandidate("python", defaultVenvPython, [], "default-venv");
    if (process.platform === "win32") {
        addCandidate("python", "py", ["-3"], "python-launcher");
    }
    addCandidate("python", "python3", [], "python3");
    addCandidate("python", "python", [], "python");
    const mempalaceBinary = process.platform === "win32" ? "mempalace.exe" : "mempalace";
    addCandidate("cli", mempalaceBinary, [], "standalone-cli");
    return candidates;
}
function normalizeEnvPath(input) {
    if (!input) {
        return null;
    }
    const trimmed = input.trim();
    if (!trimmed) {
        return null;
    }
    return expandHomeDir(trimmed);
}
async function validateCandidate(candidate, env, runtimeConfig) {
    if (candidate.kind === "python") {
        return validatePythonCandidate(candidate, env, runtimeConfig?.encoding);
    }
    return validateCliCandidate(candidate, env);
}
async function validatePythonCandidate(candidate, env, encoding = DEFAULT_ENCODING) {
    const probeArgs = [...candidate.probeArgs, "-c", PYTHON_PROBE];
    const { stdout, stderr } = await execFile(candidate.exe, probeArgs, {
        env: buildResolverEnv(env, encoding),
        timeout: PROBE_TIMEOUT_MS,
        windowsHide: true,
    });
    const parsed = parsePythonProbe(stdout);
    const binaryPath = path.resolve(parsed.exe);
    const binaryHash = await tryHashFile(binaryPath);
    if (!binaryHash) {
        throw new Error(stderr?.trim() || `resolved python binary is not readable: ${binaryPath}`);
    }
    return {
        runtime: {
            kind: "python",
            exe: candidate.exe,
            args: candidate.runtimeArgs,
            version: parsed.version,
        },
        binaryPath,
        binaryHash,
    };
}
async function validateCliCandidate(candidate, env) {
    const { stdout, stderr } = await execFile(candidate.exe, [...candidate.probeArgs, "--version"], {
        env,
        timeout: PROBE_TIMEOUT_MS,
        windowsHide: true,
    });
    const version = parseCliVersion(stdout || stderr);
    if (!version) {
        throw new Error("unable to parse mempalace CLI version");
    }
    return {
        runtime: {
            kind: "cli",
            exe: candidate.exe,
            args: candidate.runtimeArgs,
            version,
        },
        binaryPath: null,
        binaryHash: null,
    };
}
function parsePythonProbe(output) {
    let parsed;
    try {
        parsed = JSON.parse(output.trim());
    }
    catch {
        throw new Error("python probe did not return valid JSON");
    }
    if (!parsed || typeof parsed !== "object") {
        throw new Error("python probe returned an invalid payload");
    }
    const version = Reflect.get(parsed, "version");
    const exe = Reflect.get(parsed, "exe");
    if (typeof version !== "string" || version.trim().length === 0) {
        throw new Error("python probe did not include a MemPalace version");
    }
    if (typeof exe !== "string" || exe.trim().length === 0) {
        throw new Error("python probe did not include a Python executable path");
    }
    return {
        version,
        exe,
    };
}
function parseCliVersion(output) {
    const match = output.trim().match(/(\d+\.\d+\.\d+(?:[-+][^\s]+)?)/);
    return match ? match[1] : null;
}
function getDefaultVenvPythonPath() {
    return getVenvPythonPath(path.join(os.homedir(), ".mempalace", ".venv"));
}
function getVenvPythonPath(venvDir) {
    return path.resolve(venvDir, process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
}
async function readValidCache(logger) {
    const cache = await readCacheFile();
    if (!cache) {
        return null;
    }
    if (cache.binaryPath && cache.binaryHash) {
        const binaryExists = await pathExists(cache.binaryPath);
        if (!binaryExists) {
            logger?.debug("resolver", "runtime cache invalidated: binary missing", {
                binaryPath: cache.binaryPath,
            });
            return null;
        }
        const currentHash = await tryHashFile(cache.binaryPath);
        if (!currentHash || currentHash !== cache.binaryHash) {
            logger?.debug("resolver", "runtime cache invalidated: hash mismatch", {
                binaryPath: cache.binaryPath,
            });
            return null;
        }
    }
    return {
        ...normalizeResolvedRuntime({
            kind: cache.kind,
            exe: cache.exe,
            args: cache.args,
            version: cache.version,
            cacheHit: true,
        }),
        cacheHit: true,
    };
}
async function readCacheFile() {
    try {
        const raw = await readFile(getResolverCachePath(), "utf8");
        const parsed = JSON.parse(raw);
        if ((parsed.kind !== "python" && parsed.kind !== "cli") ||
            typeof parsed.exe !== "string" ||
            !Array.isArray(parsed.args) ||
            typeof parsed.version !== "string") {
            return null;
        }
        if (parsed.binaryPath !== null &&
            parsed.binaryPath !== undefined &&
            typeof parsed.binaryPath !== "string") {
            return null;
        }
        if (parsed.binaryHash !== null &&
            parsed.binaryHash !== undefined &&
            typeof parsed.binaryHash !== "string") {
            return null;
        }
        return {
            kind: parsed.kind,
            exe: parsed.exe,
            args: parsed.args.filter((arg) => typeof arg === "string"),
            version: parsed.version,
            binaryPath: parsed.binaryPath ?? null,
            binaryHash: parsed.binaryHash ?? null,
            savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : "",
        };
    }
    catch {
        return null;
    }
}
async function writeCache(cache) {
    try {
        const cachePath = getResolverCachePath();
        await mkdir(path.dirname(cachePath), { recursive: true });
        await writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
    }
    catch {
        // Cache persistence is optional.
    }
}
async function tryHashFile(targetPath) {
    try {
        const fileContent = await readFile(targetPath);
        return createHash("sha256").update(fileContent).digest("hex");
    }
    catch {
        return null;
    }
}
async function pathExists(targetPath) {
    try {
        await access(targetPath, fsConstants.F_OK);
        return true;
    }
    catch {
        return false;
    }
}
function normalizeResolvedRuntime(runtime) {
    if (runtime.kind !== "python") {
        return {
            kind: runtime.kind,
            exe: runtime.exe,
            args: runtime.args,
            version: runtime.version,
        };
    }
    return {
        kind: runtime.kind,
        exe: runtime.exe,
        args: ensurePythonRuntimeArgs(runtime.args),
        version: runtime.version,
    };
}
function ensurePythonRuntimeArgs(args) {
    if (args.length >= 2 && args.at(-2) === "-m" && args.at(-1) === "mempalace") {
        return args;
    }
    return [...args, "-m", "mempalace"];
}
export const __internal = {
    ensurePythonRuntimeArgs,
    normalizeEnvPath,
};
