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
const tokens = {
  "tenant.a": await token("effect-worker-a"),
  "tenant.b": await token("effect-worker-b"),
};
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
      ZOEN_EFFECT_SERVICE_BEARER_TOKENS: JSON.stringify(tokens),
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

async function token(clientId) {
  const response = await fetch(tokenEndpoint, {
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: `${clientId}-secret`,
      grant_type: "client_credentials",
    }),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(
      `token request for ${clientId} returned HTTP ${response.status}`,
    );
  }
  const body = await response.json();
  if (
    typeof body !== "object" ||
    body === null ||
    !("access_token" in body) ||
    typeof body.access_token !== "string" ||
    body.access_token === ""
  ) {
    throw new Error(`token request for ${clientId} returned no access token`);
  }
  return body.access_token;
}
