import { loadConfig } from "./config.js";
import { registerCommands } from "./commands.js";
import { initLogger } from "./logger.js";

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

  registerCommands(pi, {
    config,
    logger,
  });

  logger.info("extension", "doctor commands ready");
}
