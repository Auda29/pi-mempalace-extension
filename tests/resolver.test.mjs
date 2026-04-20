import test from "node:test";
import assert from "node:assert/strict";
import { __internal as resolverInternal, buildResolverEnv } from "../dist-test/resolver.js";

test("buildResolverEnv injects UTF-8 defaults", () => {
  const env = buildResolverEnv({ PATH: "X" });

  assert.equal(env.PATH, "X");
  assert.equal(env.PYTHONIOENCODING, "utf-8");
  assert.equal(env.PYTHONUTF8, "1");
});

test("ensurePythonRuntimeArgs appends -m mempalace once", () => {
  assert.deepEqual(resolverInternal.ensurePythonRuntimeArgs([]), ["-m", "mempalace"]);
  assert.deepEqual(
    resolverInternal.ensurePythonRuntimeArgs(["-3"]),
    ["-3", "-m", "mempalace"],
  );
  assert.deepEqual(
    resolverInternal.ensurePythonRuntimeArgs(["-3", "-m", "mempalace"]),
    ["-3", "-m", "mempalace"],
  );
});
