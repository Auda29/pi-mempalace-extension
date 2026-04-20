import path from "node:path";
import type { MempalaceConfig } from "./types.js";

export interface HookContext {
  cwd?: string;
  message?: string;
  prompt?: string;
  sessionId?: string;
  sessionPath?: string;
  filePath?: string;
}

const DEFAULT_SESSION_ID = "default";
export const AUTOSAVE_PROMPT =
  "[pi-mempalace] Consider saving recent progress to MemPalace before continuing.";

function extractText(context: HookContext): string {
  return typeof context.message === "string"
    ? context.message
    : typeof context.prompt === "string"
      ? context.prompt
      : "";
}

function getSessionId(context: HookContext): string {
  return context.sessionId?.trim() || DEFAULT_SESSION_ID;
}

function isTrackableUserMessage(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) {
    return false;
  }

  if (trimmed.startsWith("/")) {
    return false;
  }

  return !trimmed.startsWith("[pi-mempalace]");
}

const autosaveCounters = new Map<string, number>();
const autosaveFingerprints = new Map<string, string>();

export function consumeAutosaveReminder(
  config: MempalaceConfig,
  sessionId: string | undefined,
  message: string,
): string | undefined {
  if (!config.autosave.enabled || !isTrackableUserMessage(message)) {
    return undefined;
  }

  const normalizedSessionId = sessionId?.trim() || DEFAULT_SESSION_ID;
  const fingerprint = `${normalizedSessionId}:${message.trim()}`;
  if (autosaveFingerprints.get(normalizedSessionId) === fingerprint) {
    return undefined;
  }

  autosaveFingerprints.set(normalizedSessionId, fingerprint);
  const nextCount = (autosaveCounters.get(normalizedSessionId) ?? 0) + 1;
  autosaveCounters.set(normalizedSessionId, nextCount);

  if (nextCount < config.autosave.threshold) {
    return undefined;
  }

  autosaveCounters.set(normalizedSessionId, 0);
  return AUTOSAVE_PROMPT;
}

export function resetAutosaveCounter(sessionId: string | undefined): void {
  const normalizedSessionId = sessionId?.trim() || DEFAULT_SESSION_ID;
  autosaveCounters.delete(normalizedSessionId);
  autosaveFingerprints.delete(normalizedSessionId);
}

export function resolvePreIngestTarget(
  config: MempalaceConfig,
  context: HookContext,
): string {
  const envTarget = process.env.MEMPAL_DIR?.trim();
  if (envTarget) {
    return path.resolve(envTarget);
  }

  if (config.palace.dir) {
    return path.resolve(config.palace.dir);
  }

  const sessionPath = context.sessionPath || context.filePath;
  if (sessionPath) {
    return path.dirname(path.resolve(sessionPath));
  }

  return path.resolve(context.cwd ?? process.cwd());
}

export const __internal = {
  extractText,
  getSessionId,
  isTrackableUserMessage,
  resolvePreIngestTarget,
};
