import os from "node:os";
import path from "node:path";
import { access, readFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { parse as parseYaml } from "yaml";
const DEFAULT_CONFIG_PATH = "mempalace.yaml";
export const DEFAULT_CONFIG = {
    autosave: {
        enabled: true,
        threshold: 15,
    },
    compaction: {
        preIngest: true,
        timeoutMs: 30_000,
    },
    palace: {
        dir: null,
    },
    runtime: {
        pythonOverride: null,
        encoding: "utf-8",
    },
    logging: {
        level: "info",
        file: "~/.pi/agent/mempalace-lite.log",
    },
};
export async function loadConfig(projectRootOrOptions) {
    const options = typeof projectRootOrOptions === "string"
        ? { projectRoot: projectRootOrOptions }
        : projectRootOrOptions ?? {};
    const env = options.env ?? process.env;
    const configPath = resolveConfigPath(options.projectRoot, options.configPath);
    const rawConfig = await readRawConfig(configPath);
    const warnings = [];
    const config = applyEnvOverrides(normalizeConfig(rawConfig, warnings), env);
    return {
        config,
        source: {
            path: configPath,
            exists: rawConfig !== null,
        },
        warnings,
    };
}
export function resolveConfigPath(projectRoot, explicitPath) {
    if (explicitPath) {
        return path.resolve(expandHomeDir(explicitPath));
    }
    if (projectRoot) {
        return path.resolve(projectRoot, DEFAULT_CONFIG_PATH);
    }
    return path.resolve(process.cwd(), DEFAULT_CONFIG_PATH);
}
export function expandHomeDir(inputPath) {
    if (inputPath === "~") {
        return os.homedir();
    }
    if (inputPath.startsWith("~/") || inputPath.startsWith("~\\")) {
        return path.join(os.homedir(), inputPath.slice(2));
    }
    return inputPath;
}
function normalizeConfig(rawConfig, warnings) {
    const mergedConfig = {
        autosave: {
            enabled: coerceBoolean(rawConfig?.autosave?.enabled, DEFAULT_CONFIG.autosave.enabled, "autosave.enabled", warnings),
            threshold: coercePositiveInteger(rawConfig?.autosave?.threshold, DEFAULT_CONFIG.autosave.threshold, "autosave.threshold", warnings),
        },
        compaction: {
            preIngest: coerceBoolean(rawConfig?.compaction?.pre_ingest, DEFAULT_CONFIG.compaction.preIngest, "compaction.pre_ingest", warnings),
            timeoutMs: coercePositiveInteger(rawConfig?.compaction?.timeout_ms, DEFAULT_CONFIG.compaction.timeoutMs, "compaction.timeout_ms", warnings),
        },
        palace: {
            dir: normalizeNullablePath(rawConfig?.palace?.dir, "palace.dir", warnings),
        },
        runtime: {
            pythonOverride: normalizeNullablePath(rawConfig?.runtime?.python_override, "runtime.python_override", warnings),
            encoding: coerceNonEmptyString(rawConfig?.runtime?.encoding, DEFAULT_CONFIG.runtime.encoding, "runtime.encoding", warnings),
        },
        logging: {
            level: normalizeLogLevel(rawConfig?.logging?.level, warnings),
            file: expandHomeDir(coerceNonEmptyString(rawConfig?.logging?.file, DEFAULT_CONFIG.logging.file, "logging.file", warnings)),
        },
    };
    return {
        ...mergedConfig,
        palace: {
            dir: mergedConfig.palace.dir
                ? path.resolve(expandHomeDir(mergedConfig.palace.dir))
                : null,
        },
        runtime: {
            ...mergedConfig.runtime,
            pythonOverride: mergedConfig.runtime.pythonOverride
                ? path.resolve(expandHomeDir(mergedConfig.runtime.pythonOverride))
                : null,
        },
    };
}
function applyEnvOverrides(config, env) {
    const autosaveDisabled = env.MEMPALACE_AUTOSAVE_DISABLE === "1";
    const pythonOverride = env.MEMPALACE_PYTHON?.trim();
    const palaceDir = env.MEMPAL_DIR?.trim();
    const logLevel = normalizeOptionalLogLevel(env.MEMPALACE_LOG_LEVEL);
    return {
        ...config,
        autosave: {
            ...config.autosave,
            enabled: autosaveDisabled ? false : config.autosave.enabled,
        },
        palace: {
            dir: palaceDir ? path.resolve(expandHomeDir(palaceDir)) : config.palace.dir,
        },
        runtime: {
            ...config.runtime,
            pythonOverride: pythonOverride
                ? path.resolve(expandHomeDir(pythonOverride))
                : config.runtime.pythonOverride,
        },
        logging: {
            ...config.logging,
            level: logLevel ?? config.logging.level,
        },
    };
}
function normalizeNullablePath(input, fieldPath, warnings) {
    if (input == null) {
        return null;
    }
    if (typeof input !== "string") {
        warnings.push({
            path: fieldPath,
            message: "Expected a string or null. Falling back to default.",
        });
        return null;
    }
    const value = input.trim();
    return value.length > 0 ? value : null;
}
function normalizeLogLevel(input, warnings) {
    switch (input) {
        case "debug":
        case "info":
        case "warn":
        case "error":
            return input;
        case undefined:
            return DEFAULT_CONFIG.logging.level;
        default:
            warnings.push({
                path: "logging.level",
                message: `Expected one of debug, info, warn or error. Falling back to ${DEFAULT_CONFIG.logging.level}.`,
            });
            return DEFAULT_CONFIG.logging.level;
    }
}
function normalizeOptionalLogLevel(input) {
    switch (input) {
        case "debug":
        case "info":
        case "warn":
        case "error":
            return input;
        default:
            return null;
    }
}
async function readRawConfig(configPath) {
    const fileExists = await pathExists(configPath);
    if (!fileExists) {
        return null;
    }
    const fileContent = await readFile(configPath, "utf8");
    if (fileContent.trim().length === 0) {
        return null;
    }
    const parsed = parseYaml(fileContent);
    if (!parsed || typeof parsed !== "object") {
        return null;
    }
    return parsed;
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
function coerceBoolean(input, fallback, fieldPath, warnings) {
    if (typeof input === "boolean") {
        return input;
    }
    if (input === undefined) {
        return fallback;
    }
    warnings.push({
        path: fieldPath,
        message: `Expected a boolean. Falling back to ${String(fallback)}.`,
    });
    return fallback;
}
function coercePositiveInteger(input, fallback, fieldPath, warnings) {
    if (typeof input === "number" && Number.isInteger(input) && input > 0) {
        return input;
    }
    if (input === undefined) {
        return fallback;
    }
    warnings.push({
        path: fieldPath,
        message: `Expected a positive integer. Falling back to ${fallback}.`,
    });
    return fallback;
}
function coerceNonEmptyString(input, fallback, fieldPath, warnings) {
    if (typeof input === "string" && input.trim().length > 0) {
        return input;
    }
    if (input === undefined) {
        return fallback;
    }
    warnings.push({
        path: fieldPath,
        message: `Expected a non-empty string. Falling back to ${fallback}.`,
    });
    return fallback;
}
