import test from "node:test";
import assert from "node:assert/strict";
import { __internal as cliInternal } from "../dist-test/cli.js";

test("buildCommandArgs appends --json only when missing", () => {
  assert.deepEqual(
    cliInternal.buildCommandArgs(["-m", "mempalace"], ["search", "foo"], true),
    ["-m", "mempalace", "search", "foo", "--json"],
  );

  assert.deepEqual(
    cliInternal.buildCommandArgs(["-m", "mempalace"], ["status", "--json"], true),
    ["-m", "mempalace", "status", "--json"],
  );
});

test("collectStderr falls back to combined output", () => {
  assert.equal(
    cliInternal.collectStderr("", "warning from stdout"),
    "warning from stdout",
  );
  assert.equal(cliInternal.collectStderr("hard failure", "ignored"), "hard failure");
});

test("collectJsonParseError includes stdout when available", () => {
  const message = cliInternal.collectJsonParseError('{"broken"', "stderr text");
  assert.match(message, /Failed to parse JSON output/);
  assert.match(message, /\{"broken"/);
});

test("buildCommandArgs preserves runtime-prefixed mempalace invocation", () => {
  assert.deepEqual(
    cliInternal.buildCommandArgs(["-m", "mempalace"], ["status"], false),
    ["-m", "mempalace", "status"],
  );
});
