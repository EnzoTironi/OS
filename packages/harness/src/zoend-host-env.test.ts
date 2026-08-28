import assert from "node:assert/strict";
import test from "node:test";
import { readZoendHostEnv } from "./zoend-host-env.js";

test("readZoendHostEnv keeps personal and world definition paths", () => {
  const parsed = readZoendHostEnv({
    ZOEN_AGENT_BEARER_TOKEN: "tok",
    ZOEN_IDENTITY_BASE_URL: "http://127.0.0.1:58701",
    ZOEN_PERSONAL_DEFINITION_PATH: "/etc/zoen/personal.zoen.ts",
    ZOEN_TENANT_ID: "tenant.a",
    ZOEN_WORLD_DEFINITION_PATH: "/etc/zoen/commercial.zoen.ts",
  });
  assert.equal(parsed?.definitionPath, "/etc/zoen/personal.zoen.ts");
  assert.equal(parsed?.worldDefinitionPath, "/etc/zoen/commercial.zoen.ts");
});
