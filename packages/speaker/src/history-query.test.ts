import assert from "node:assert/strict";
import test from "node:test";
import { createHistoryQueryClientFromEnv } from "./history-query.js";

test("createHistoryQueryClientFromEnv uses World identity env and skips without it", () => {
  const client = createHistoryQueryClientFromEnv({
    ZOEN_AGENT_BEARER_TOKEN: "token",
    ZOEN_IDENTITY_BASE_URL: "https://identity.zoen.local",
  });
  assert.ok(client);
  assert.equal(createHistoryQueryClientFromEnv({}), undefined);
  assert.equal(
    createHistoryQueryClientFromEnv({
      ZOEN_AGENT_BEARER_TOKEN: "token",
    }),
    undefined,
  );
});
