import test from "node:test";
import assert from "node:assert/strict";

test("scaffold is in place", () => {
  assert.equal(typeof process.version, "string");
});
