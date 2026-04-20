import type { Logger } from "./logger.js";
import type { MempalaceConfig, RuntimePromiseContext } from "./types.js";

interface HookRegistrationDeps extends RuntimePromiseContext {
  config: MempalaceConfig;
  logger: Logger;
}

export function registerHooks(
  pi: unknown,
  deps: HookRegistrationDeps,
): void {
  void pi;
  void deps.config;

  deps.logger.info("hooks", "hook registration placeholder ready");

  // Keep the lazy runtime on the same wiring path as the future hooks.
  void deps.runtimePromise.then((runtime) => {
    deps.logger.debug("hooks", "hook runtime availability checked", {
      available: runtime !== null,
    });
  });
}
