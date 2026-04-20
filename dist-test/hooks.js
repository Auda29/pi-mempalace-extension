import path from "node:path";
const DEFAULT_SESSION_ID = "default";
export const AUTOSAVE_PROMPT = "[pi-mempalace] Consider saving recent progress to MemPalace before continuing.";
function extractText(context) {
    return typeof context.message === "string"
        ? context.message
        : typeof context.prompt === "string"
            ? context.prompt
            : "";
}
function getSessionId(context) {
    return context.sessionId?.trim() || DEFAULT_SESSION_ID;
}
function isTrackableUserMessage(message) {
    const trimmed = message.trim();
    if (!trimmed) {
        return false;
    }
    if (trimmed.startsWith("/")) {
        return false;
    }
    return !trimmed.startsWith("[pi-mempalace]");
}
const autosaveCounters = new Map();
const autosaveFingerprints = new Map();
export function consumeAutosaveReminder(config, sessionId, message) {
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
export function resetAutosaveCounter(sessionId) {
    const normalizedSessionId = sessionId?.trim() || DEFAULT_SESSION_ID;
    autosaveCounters.delete(normalizedSessionId);
    autosaveFingerprints.delete(normalizedSessionId);
}
export function resolvePreIngestTarget(config, context) {
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
