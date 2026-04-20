import type { Logger } from "./logger.js";
import type { MempalaceConfig, RuntimePromiseContext } from "./types.js";

interface ToolRegistrationDeps extends RuntimePromiseContext {
  config: MempalaceConfig;
  logger: Logger;
}

export function registerTools(
  pi: unknown,
  deps: ToolRegistrationDeps,
): void {
  void pi;
  void deps.config;

  deps.logger.info("tools", "tool registration placeholder ready");

  // Keep the resolver lazy: observe failures only when the promise settles,
  // without blocking extension startup.
  void deps.runtimePromise.then((runtime) => {
    deps.logger.debug("tools", "tool runtime availability checked", {
      available: runtime !== null,
    });
  });
}
