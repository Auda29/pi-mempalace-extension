import test from "node:test";
import assert from "node:assert/strict";
import { __internal as hooksInternal } from "../dist-test/hooks.js";

test("isTrackableUserMessage ignores slash commands and steering prompts", () => {
  assert.equal(hooksInternal.isTrackableUserMessage(""), false);
  assert.equal(hooksInternal.isTrackableUserMessage("/mempalace:status"), false);
  assert.equal(
    hooksInternal.isTrackableUserMessage("[pi-mempalace] Use the mempalace_status tool"),
    false,
  );
  assert.equal(hooksInternal.isTrackableUserMessage("regular user message"), true);
});

test("resolvePreIngestTarget prefers config palace dir over context paths", () => {
  const config = {
    palace: {
      dir: "C:/palace/from-config",
    },
  };

  const result = hooksInternal.resolvePreIngestTarget(config, {
    cwd: "C:/project",
    sessionPath: "C:/sessions/chat/session.jsonl",
  });

  assert.match(result, /palace[\\/]from-config$/);
});

test("resolvePreIngestTarget falls back to session path then cwd", () => {
  const configWithoutPalace = {
    palace: {
      dir: null,
    },
  };

  const fromSession = hooksInternal.resolvePreIngestTarget(configWithoutPalace, {
    cwd: "C:/project",
    sessionPath: "C:/sessions/chat/session.jsonl",
  });
  assert.match(fromSession, /sessions[\\/]chat$/);

  const fromCwd = hooksInternal.resolvePreIngestTarget(configWithoutPalace, {
    cwd: "C:/project",
  });
  assert.match(fromCwd, /C:[\\/]project$/);
});
