import { spawn } from "node:child_process";
import { once } from "node:events";

const required = [
  "ZOEN_EFFECT_SERVICE_URL",
  "ZOEN_EFFECT_TOKEN_ENDPOINT",
  "ZOEN_EFFECT_WORKER_PORT",
];
for (const name of required) {
  if (process.env[name] === undefined || process.env[name] === "") {
    throw new Error(`${name} is required`);
  }
}

const tokenEndpoint = process.env.ZOEN_EFFECT_TOKEN_ENDPOINT;
const worker = spawn(
  process.execPath,
  ["/app/dist/packages/effect-worker/src/index.js"],
  {
    env: {
      ...process.env,
      ZOEN_CONNECTOR_CALLER_TOKEN: "shared-saas-connector-token",
      ZOEN_CONNECTOR_CREDENTIAL_REFS: JSON.stringify({
        "tenant.a": "secret.provider.a",
        "tenant.b": "secret.provider.b",
      }),
      ZOEN_EFFECT_CONNECTOR_URL: "http://zoen-http-connector:8080/v1/effects",
      ZOEN_EFFECT_SERVICE_OIDC_CLIENTS: JSON.stringify({
        "tenant.a": {
          clientId: "effect-worker-a",
          clientSecret: "effect-worker-a-secret",
        },
        "tenant.b": {
          clientId: "effect-worker-b",
          clientSecret: "effect-worker-b-secret",
        },
      }),
      ZOEN_EFFECT_SERVICE_OIDC_TOKEN_ENDPOINT: tokenEndpoint,
    },
    stdio: "inherit",
  },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => worker.kill(signal));
}
const [code, signal] = await once(worker, "exit");
if (code !== 0 && signal === null) {
  throw new Error(`effect worker exited with code ${String(code)}`);
}
