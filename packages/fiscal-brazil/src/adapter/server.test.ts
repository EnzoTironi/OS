import assert from "node:assert/strict";
import test from "node:test";
import { configFromEnvironment } from "./server.js";

const baseEnvironment: NodeJS.ProcessEnv = {
  ZOEN_FISCAL_ADAPTER_CALLER_BINDINGS: JSON.stringify({
    "0123456789abcdef": "tenant-a",
  }),
  ZOEN_FISCAL_ADAPTER_LISTEN_ADDR: "127.0.0.1:18080",
  ZOEN_FISCAL_ADAPTER_OIDC_CLIENTS: JSON.stringify({
    "tenant-a": {
      clientId: "fiscal-adapter-a",
      clientSecret: "fiscal-adapter-a-secret",
    },
  }),
  ZOEN_FISCAL_ADAPTER_OIDC_TOKEN_URL: "http://127.0.0.1:8080/token",
  ZOEN_FISCAL_ADAPTER_ZOEN_URL: "http://127.0.0.1:8080",
};

test("configFromEnvironment requires ZOEN_FISCAL_ADAPTER_ROUTES", () => {
  assert.throws(
    () => configFromEnvironment({ ...baseEnvironment }),
    (error: unknown) =>
      error instanceof Error &&
      error.message === "ZOEN_FISCAL_ADAPTER_ROUTES is required",
  );
});

test("configFromEnvironment rejects empty ZOEN_FISCAL_ADAPTER_ROUTES", () => {
  assert.throws(
    () =>
      configFromEnvironment({
        ...baseEnvironment,
        ZOEN_FISCAL_ADAPTER_ROUTES: "",
      }),
    (error: unknown) =>
      error instanceof Error &&
      error.message === "ZOEN_FISCAL_ADAPTER_ROUTES is required",
  );
});

test("configFromEnvironment parses ZOEN_FISCAL_ADAPTER_ROUTES JSON", () => {
  const routes = {
    documents: {
      "*": {
        baseUrl: "http://127.0.0.1:19000",
        credential: "secret",
        provider: "plugnotas",
        timeoutMs: 5_000,
      },
    },
  };
  const config = configFromEnvironment({
    ...baseEnvironment,
    ZOEN_FISCAL_ADAPTER_ROUTES: JSON.stringify(routes),
  });
  assert.deepEqual(config.providerRoutes, routes);
});
