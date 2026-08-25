process.env.ZOEN_ALLOW_JS_SANDBOX = "1";

import assert from "node:assert/strict";
import test from "node:test";
import { runExecuteTypescript } from "./code-mode.js";
import { createExecutionAgent } from "./execution.js";
import { assertJsSandboxAllowed, JS_SANDBOX_FLAG } from "./js-sandbox-gate.js";
import { inspectBashInvocation } from "./vfs-guard.js";

const destination = "/workspace/tenant.a/membership.1";

test("JS sandbox is fail-closed without the explicit flag", () => {
  const previous = process.env[JS_SANDBOX_FLAG];
  delete process.env[JS_SANDBOX_FLAG];
  try {
    assert.throws(() => assertJsSandboxAllowed(), /ZOEN_ALLOW_JS_SANDBOX/);
  } finally {
    if (previous === undefined) {
      process.env[JS_SANDBOX_FLAG] = "1";
    } else {
      process.env[JS_SANDBOX_FLAG] = previous;
    }
  }
});

test("VFS rejects traversal, symlink, network, process, secrets, and exhaustion", () => {
  assert.equal(
    inspectBashInvocation("cat ../secret", destination).kind,
    "deny",
  );
  assert.equal(
    inspectBashInvocation("cat /etc/passwd", destination).kind,
    "deny",
  );
  assert.equal(
    inspectBashInvocation("ln -s /etc/passwd leak", destination).kind,
    "deny",
  );
  assert.equal(
    inspectBashInvocation("curl https://example.com", destination).kind,
    "deny",
  );
  assert.equal(
    inspectBashInvocation("node -e 'process.exit(0)'", destination).kind,
    "deny",
  );
  assert.equal(
    inspectBashInvocation("printenv ZOEN_IDENTITY_ADMIN_TOKEN", destination)
      .kind,
    "deny",
  );
  assert.equal(
    inspectBashInvocation("a".repeat(9_000), destination).kind,
    "deny",
  );
  assert.equal(
    inspectBashInvocation("ls note.txt", destination).kind,
    "allow",
  );
});

test("node:vm execute_typescript times out and cannot touch process", async () => {
  const escaped = await runExecuteTypescript({
    externals: {},
    source: "process.exit(0)",
    timeoutMs: 50,
  });
  assert.equal(escaped.kind, "denied");

  const hung = await runExecuteTypescript({
    externals: {},
    source: "while (true) {}",
    timeoutMs: 20,
  });
  assert.equal(hung.kind, "failed");
  if (hung.kind === "failed") {
    assert.equal(hung.reason, "timeout");
  }
});

test("gated workbench is created only with the JS sandbox flag", async () => {
  const workbench = await createExecutionAgent({
    destination,
    files: { "note.txt": "ok" },
    model: {
      doGenerate: async () => {
        throw new Error("model unused");
      },
    } as never,
  });
  assert.equal(workbench.destination, destination);
});
