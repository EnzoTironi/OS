import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import * as restate from "@restatedev/restate-sdk";
import { parseRestateIdentityKeys } from "./identity.js";

const publicKey = readFileSync(
  path.join(
    process.cwd(),
    "testdata",
    "restate-request-identity",
    "publickeyv1",
  ),
  "utf8",
).trim();
const identityKeys = parseRestateIdentityKeys(JSON.stringify([publicKey]));

test("Restate identity keys fail closed when missing or empty", () => {
  assert.throws(() => parseRestateIdentityKeys("[]"));
  assert.throws(() => parseRestateIdentityKeys(""));
  assert.throws(() => parseRestateIdentityKeys('["not-a-restate-key"]'));
});

test("unauthenticated ZoenEffect execute is rejected", async () => {
  let executed = false;
  const zoenEffect = restate.object({
    name: "ZoenEffect",
    handlers: {
      execute: async () => {
        executed = true;
      },
    },
  });
  const handler = restate.createEndpointHandler({
    bidirectional: false,
    identityKeys,
    services: [zoenEffect],
  });
  const server = createServer(handler);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address !== null && typeof address !== "string");
  try {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/invoke/ZoenEffect/execute`,
      {
        body: JSON.stringify({
          dispatchVersion: 1,
          effectRequestId: "effect.attacker",
          tenantId: "tenant.attacker",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    );
    assert.equal(response.status, 401);
    assert.equal(await response.text(), '{"message":"Unauthorized"}');
    assert.equal(executed, false);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
});
