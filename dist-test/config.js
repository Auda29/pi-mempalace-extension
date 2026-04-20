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
    const config = applyEnvOverrides(normalizeConfig(rawConfig), env);
    return {
        config,
        source: {
            path: configPath,
            exists: rawConfig !== null,
        },
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
function normalizeConfig(rawConfig) {
    const mergedConfig = {
        autosave: {
            enabled: rawConfig?.autosave?.enabled ?? DEFAULT_CONFIG.autosave.enabled,
            threshold: rawConfig?.autosave?.threshold ?? DEFAULT_CONFIG.autosave.threshold,
        },
        compaction: {
            preIngest: rawConfig?.compaction?.pre_ingest ?? DEFAULT_CONFIG.compaction.preIngest,
            timeoutMs: rawConfig?.compaction?.timeout_ms ?? DEFAULT_CONFIG.compaction.timeoutMs,
        },
        palace: {
            dir: normalizeNullablePath(rawConfig?.palace?.dir),
        },
        runtime: {
            pythonOverride: normalizeNullablePath(rawConfig?.runtime?.python_override),
            encoding: rawConfig?.runtime?.encoding ?? DEFAULT_CONFIG.runtime.encoding,
        },
        logging: {
            level: normalizeLogLevel(rawConfig?.logging?.level),
            file: expandHomeDir(rawConfig?.logging?.file ?? DEFAULT_CONFIG.logging.file),
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
function normalizeNullablePath(input) {
    if (input == null) {
        return null;
    }
    const value = input.trim();
    return value.length > 0 ? value : null;
}
function normalizeLogLevel(input) {
    switch (input) {
        case "debug":
        case "info":
        case "warn":
        case "error":
            return input;
        default:
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
