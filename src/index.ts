import { loadConfig } from "./config.js";
import { registerCommands } from "./commands.js";
import { initLogger } from "./logger.js";
import { resolveRuntime } from "./resolver.js";
import { registerTools } from "./tools.js";
import { registerHooks } from "./hooks.js";

interface ExtensionContext {
  projectRoot?: string;
}

export default async function initExtension(pi: unknown): Promise<void> {
  const context = pi as ExtensionContext;
  const { config } = await loadConfig(context.projectRoot);
  const logger = initLogger(config.logging);

  logger.info("extension", "initializing extension", {
    projectRoot: context.projectRoot ?? null,
  });

  const runtimePromise = resolveRuntime({
    runtimeConfig: config.runtime,
    logger,
  }).catch((error) => {
    logger.warn("extension", "lazy runtime resolution failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  });

  registerCommands(pi, {
    config,
    logger,
    runtimePromise,
  });
  registerTools(pi, {
    config,
    logger,
    runtimePromise,
  });
  registerHooks(pi, {
    config,
    logger,
    runtimePromise,
  });

  logger.info("extension", "extension wiring ready");
}
