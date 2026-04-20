import { loadConfig } from "./config.js";
import { initLogger } from "./logger.js";
import { resolveRuntime } from "./resolver.js";

export interface ExtensionBootstrapContext {
  projectRoot?: string;
}

export interface ExtensionRuntime {
  projectRoot?: string;
  config: Awaited<ReturnType<typeof loadConfig>>["config"];
  runtimePromise: ReturnType<typeof resolveRuntime> extends Promise<infer T>
    ? Promise<T | null>
    : Promise<null>;
  logger: ReturnType<typeof initLogger>;
}

export async function createExtensionRuntime(
  context: ExtensionBootstrapContext = {},
): Promise<ExtensionRuntime> {
  const { config } = await loadConfig(context.projectRoot);
  const logger = initLogger(config.logging);

  logger.info("extension", "initializing runtime", {
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

  return {
    config,
    logger,
    runtimePromise,
    projectRoot: context.projectRoot,
  };
}

export default async function initExtension(
  context: ExtensionBootstrapContext = {},
): Promise<ExtensionRuntime> {
  const runtime = await createExtensionRuntime(context);
  runtime.logger.info("extension", "core runtime ready");
  return runtime;
}
