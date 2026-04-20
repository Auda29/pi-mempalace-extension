import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import type { Logger } from "./logger.js";
import type { ResolvedRuntime, RuntimeConfig, RuntimeKind } from "./types.js";

const execFile = promisify(execFileCallback);

const DEFAULT_ENCODING = "utf-8";
const PROBE_TIMEOUT_MS = 5_000;
const CACHE_FILENAME = "mempalace-lite-resolver.json";
const PYTHON_PROBE = [
  "import json, sys",
  "import mempalace",
  "print(json.dumps({'version': mempalace.__version__, 'exe': sys.executable}))",
].join("; ");

interface ResolveRuntimeOptions {
  forceRefresh?: boolean;
  env?: NodeJS.ProcessEnv;
  runtimeConfig?: Pick<RuntimeConfig, "pythonOverride" | "encoding">;
  logger?: Logger;
}

interface RuntimeCandidate {
  kind: RuntimeKind;
  exe: string;
  probeArgs: string[];
  runtimeArgs: string[];
  source: string;
}

interface ProbeSuccess {
  runtime: Omit<ResolvedRuntime, "cacheHit">;
  binaryPath: string | null;
  binaryHash: string | null;
}

interface CachedRuntimeRecord {
  kind: RuntimeKind;
  exe: string;
  args: string[];
  version: string;
  binaryPath: string | null;
  binaryHash: string | null;
  savedAt: string;
}

export async function resolveRuntime(
  options: ResolveRuntimeOptions = {},
): Promise<ResolvedRuntime> {
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
  const errors: string[] = [];

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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${candidate.source}: ${message}`);
      logger?.debug("resolver", "runtime candidate failed", {
        exe: candidate.exe,
        source: candidate.source,
        error: message,
      });
    }
  }

  throw new Error(
    [
      "Unable to resolve a MemPalace runtime.",
      "Tried candidates:",
      ...errors.map((entry) => `- ${entry}`),
    ].join("\n"),
  );
}

export function buildResolverEnv(
  env: NodeJS.ProcessEnv = process.env,
  encoding = DEFAULT_ENCODING,
): NodeJS.ProcessEnv {
  return {
    ...env,
    PYTHONIOENCODING: encoding,
    PYTHONUTF8: "1",
  };
}

export function getResolverCachePath(): string {
  return path.join(os.homedir(), ".pi", "agent", CACHE_FILENAME);
}

function buildRuntimeCandidates(
  env: NodeJS.ProcessEnv,
  runtimeConfig?: Pick<RuntimeConfig, "pythonOverride" | "encoding">,
): RuntimeCandidate[] {
  const candidates: RuntimeCandidate[] = [];
  const seen = new Set<string>();
  const pythonOverride =
    runtimeConfig?.pythonOverride?.trim() || env.MEMPALACE_PYTHON?.trim() || null;
  const venvDir = env.MEMPALACE_VENV?.trim() || null;
  const defaultVenvPython = getDefaultVenvPythonPath();

  const addCandidate = (
    kind: RuntimeKind,
    exe: string,
    args: string[],
    source: string,
  ) => {
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
    addCandidate(
      "python",
      getVenvPythonPath(venvDir),
      [],
      "MEMPALACE_VENV",
    );
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

async function validateCandidate(
  candidate: RuntimeCandidate,
  env: NodeJS.ProcessEnv,
  runtimeConfig?: Pick<RuntimeConfig, "pythonOverride" | "encoding">,
): Promise<ProbeSuccess> {
  if (candidate.kind === "python") {
    return validatePythonCandidate(candidate, env, runtimeConfig?.encoding);
  }

  return validateCliCandidate(candidate, env);
}

async function validatePythonCandidate(
  candidate: RuntimeCandidate,
  env: NodeJS.ProcessEnv,
  encoding = DEFAULT_ENCODING,
): Promise<ProbeSuccess> {
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
    throw new Error(
      stderr?.trim() || `resolved python binary is not readable: ${binaryPath}`,
    );
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

async function validateCliCandidate(
  candidate: RuntimeCandidate,
  env: NodeJS.ProcessEnv,
): Promise<ProbeSuccess> {
  const { stdout, stderr } = await execFile(
    candidate.exe,
    [...candidate.probeArgs, "--version"],
    {
      env,
      timeout: PROBE_TIMEOUT_MS,
      windowsHide: true,
    },
  );

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

function parsePythonProbe(output: string): { version: string; exe: string } {
  let parsed: unknown;

  try {
    parsed = JSON.parse(output.trim());
  } catch {
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

function parseCliVersion(output: string): string | null {
  const match = output.trim().match(/(\d+\.\d+\.\d+(?:[-+][^\s]+)?)/);
  return match ? match[1] : null;
}

function getDefaultVenvPythonPath(): string {
  return getVenvPythonPath(path.join(os.homedir(), ".mempalace", ".venv"));
}

function getVenvPythonPath(venvDir: string): string {
  return path.resolve(
    venvDir,
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
  );
}

async function readValidCache(logger?: Logger): Promise<ResolvedRuntime | null> {
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

async function readCacheFile(): Promise<CachedRuntimeRecord | null> {
  try {
    const raw = await readFile(getResolverCachePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<CachedRuntimeRecord>;

    if (
      (parsed.kind !== "python" && parsed.kind !== "cli") ||
      typeof parsed.exe !== "string" ||
      !Array.isArray(parsed.args) ||
      typeof parsed.version !== "string"
    ) {
      return null;
    }

    if (
      parsed.binaryPath !== null &&
      parsed.binaryPath !== undefined &&
      typeof parsed.binaryPath !== "string"
    ) {
      return null;
    }

    if (
      parsed.binaryHash !== null &&
      parsed.binaryHash !== undefined &&
      typeof parsed.binaryHash !== "string"
    ) {
      return null;
    }

    return {
      kind: parsed.kind,
      exe: parsed.exe,
      args: parsed.args.filter((arg): arg is string => typeof arg === "string"),
      version: parsed.version,
      binaryPath: parsed.binaryPath ?? null,
      binaryHash: parsed.binaryHash ?? null,
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : "",
    };
  } catch {
    return null;
  }
}

async function writeCache(cache: CachedRuntimeRecord): Promise<void> {
  try {
    const cachePath = getResolverCachePath();
    await mkdir(path.dirname(cachePath), { recursive: true });
    await writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
  } catch {
    // Cache persistence is optional.
  }
}

async function tryHashFile(targetPath: string): Promise<string | null> {
  try {
    const fileContent = await readFile(targetPath);
    return createHash("sha256").update(fileContent).digest("hex");
  } catch {
    return null;
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function normalizeResolvedRuntime(runtime: Omit<ResolvedRuntime, "cacheHit"> | ResolvedRuntime):
  Omit<ResolvedRuntime, "cacheHit"> {
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

function ensurePythonRuntimeArgs(args: string[]): string[] {
  if (args.length >= 2 && args.at(-2) === "-m" && args.at(-1) === "mempalace") {
    return args;
  }

  return [...args, "-m", "mempalace"];
}

export const __internal = {
  ensurePythonRuntimeArgs,
};
