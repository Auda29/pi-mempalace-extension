import { loadConfig } from "./config.js";
import { initLogger } from "./logger.js";
import { resolveRuntime } from "./resolver.js";
export async function createExtensionRuntime(context = {}) {
    const loadedConfig = await loadConfig(context.projectRoot);
    const { config } = loadedConfig;
    const logger = initLogger(config.logging);
    logger.info("extension", "initializing runtime", {
        projectRoot: context.projectRoot ?? null,
    });
    if (loadedConfig.warnings.length > 0) {
        logger.warn("extension", "config warnings detected", {
            warnings: loadedConfig.warnings,
            configPath: loadedConfig.source.path,
        });
    }
    const runtimePromise = resolveRuntime({
        runtimeConfig: config.runtime,
        logger,
    }).catch((error) => {
        logger.warn("extension", "lazy runtime resolution failed", {
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    });
    return {
        config,
        logger,
        runtimePromise,
        projectRoot: context.projectRoot,
    };
}
export default async function initExtension(context = {}) {
    const runtime = await createExtensionRuntime(context);
    runtime.logger.info("extension", "core runtime ready");
    return runtime;
}
