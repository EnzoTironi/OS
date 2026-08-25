import assert from "node:assert/strict";
import {
  execFile,
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { once } from "node:events";
import { createConnection } from "node:net";
import path from "node:path";
import { createClient, type Client, type Interceptor } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import { Client as PostgresClient } from "pg";
import { z } from "zod";
import { ActionService } from "../../packages/sdk/src/gen/zoen/action/v1/action_pb.js";
import { DefinitionService } from "../../packages/sdk/src/gen/zoen/definition/v1/definition_pb.js";
import { EffectService } from "../../packages/sdk/src/gen/zoen/effect/v1/effect_pb.js";
import { WorldService } from "../../packages/sdk/src/gen/zoen/world/v1/world_pb.js";
import {
  e2eHttpUrl,
  e2eListenAddr,
  e2ePort,
  e2ePostgresUrl,
} from "../host-env.js";

export const repositoryRoot = process.cwd();
const postgresPortFallback = 55_441;
const zoendPortFallback = 58_111;
const keycloakPortFallback = 58_110;
const restateIngressFallback = 58_112;
const restateUiFallback = 59_071;
const connectorPortFallback = 58_113;
const providerPortFallback = 58_114;
const workerPortFallback = 58_115;
const zoendPort = e2ePort("ZOEN_E2E_ZOEND_PORT", zoendPortFallback);
const connectorPort = e2ePort("ZOEN_E2E_CONNECTOR_PORT", connectorPortFallback);
const providerPort = e2ePort(
  "ZOEN_E2E_EFFECT_PROVIDER_PORT",
  e2ePort("ZOEN_E2E_PROVIDER_PORT", providerPortFallback),
);
const workerPort = e2ePort(
  "ZOEN_E2E_EFFECT_WORKER_PORT",
  e2ePort("ZOEN_E2E_WORKER_PORT", workerPortFallback),
);
export const applicationDatabaseUrl = e2ePostgresUrl(
  "zoen_app",
  "zoen_app",
  postgresPortFallback,
);
export const adminDatabaseUrl = e2ePostgresUrl(
  "postgres",
  "postgres",
  postgresPortFallback,
);
export const zoenBaseUrl = e2eHttpUrl("ZOEN_E2E_ZOEND_PORT", zoendPortFallback);
export const oidcIssuer = e2eHttpUrl(
  "ZOEN_E2E_KEYCLOAK_PORT",
  keycloakPortFallback,
  "/realms/zoen",
);
export const oidcAudience = "zoend";
export const restateIngress = e2eHttpUrl(
  "ZOEN_E2E_RESTATE_INGRESS_PORT",
  restateIngressFallback,
);
export const restateAdmin = e2eHttpUrl(
  "ZOEN_E2E_RESTATE_UI_PORT",
  restateUiFallback,
);
export const connectorUrl = e2eHttpUrl(
  "ZOEN_E2E_CONNECTOR_PORT",
  connectorPortFallback,
  "/v1/effects",
);
export const providerUrl = e2eHttpUrl(
  "ZOEN_E2E_EFFECT_PROVIDER_PORT",
  providerPort,
  "/v1/operations",
);
export const connectorCallerToken = "connector-worker-token";
export const tenantA = "tenant.a";
export const tenantB = "tenant.b";

const composeFile = path.join("e2e", "effects", "compose.yaml");
const composeProject = "zoen-effects";
const targetDirectory = path.join(repositoryRoot, "target", "debug");
const distDirectory = path.join(repositoryRoot, "dist");
const tokenResponseSchema = z
  .object({ access_token: z.string().min(1) })
  .passthrough();
const providerOperationSchema = z
  .object({
    evidenceDigest: z.string().regex(/^[0-9a-f]{64}$/),
    idempotencyKey: z.string().min(1),
    observedAtMicros: z.string().regex(/^[0-9]+$/),
    outcome: z.enum(["confirmed", "no_effect", "pending"]),
    providerOperationId: z.string().min(1),
    requests: z.number().int().positive(),
    sourceRef: z.string().min(1),
  })
  .strict();
const connectorStatusSchema = providerOperationSchema.omit({ requests: true });
const invocationLookupSchema = z
  .object({ invocationId: z.string().min(1) })
  .passthrough();

export type ActionClient = Client<typeof ActionService>;
export type DefinitionClient = Client<typeof DefinitionService>;
export type EffectClient = Client<typeof EffectService>;
export type WorldClient = Client<typeof WorldService>;
export type ProviderOperation = z.infer<typeof providerOperationSchema>;
export type ConnectorStatus = z.infer<typeof connectorStatusSchema>;

export interface ManagedProcess {
  child: ChildProcessWithoutNullStreams;
  name: string;
  output: string[];
  stderr: string[];
}

export function adminClient(): PostgresClient {
  return new PostgresClient({ connectionString: adminDatabaseUrl });
}

export function actionClient(token: string): ActionClient {
  return createClient(ActionService, transport(token));
}

export function definitionClient(token: string): DefinitionClient {
  return createClient(DefinitionService, transport(token));
}

export function effectClient(token: string): EffectClient {
  return createClient(EffectService, transport(token));
}

export function worldClient(token: string): WorldClient {
  return createClient(WorldService, transport(token));
}

export async function oidcToken(clientId: string): Promise<string> {
  const response = await fetch(`${oidcIssuer}/protocol/openid-connect/token`, {
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: `${clientId}-secret`,
      grant_type: "client_credentials",
    }),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    method: "POST",
  });
  const body: unknown = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  return tokenResponseSchema.parse(body).access_token;
}

export async function startZoend(policyManifestPath: string): Promise<ManagedProcess> {
  return startProcess({
    command: path.join(targetDirectory, "zoend"),
    environment: {
      DATABASE_URL: applicationDatabaseUrl,
      ZOEN_CEDAR_POLICY_MANIFEST: policyManifestPath,
      ZOEN_LISTEN_ADDR: e2eListenAddr("ZOEN_E2E_ZOEND_PORT", zoendPortFallback),
      ZOEN_OIDC_AUDIENCE: oidcAudience,
      ZOEN_OIDC_ISSUER: oidcIssuer,
    },
    name: "zoend",
    port: zoendPort,
  });
}

export async function startFaultProvider(): Promise<ManagedProcess> {
  return startProcess({
    command: process.execPath,
    arguments: [
      path.join(distDirectory, "e2e", "effects", "fault-provider.js"),
    ],
    environment: {
      ZOEN_E2E_PROVIDER_PORT: providerPort.toString(),
    },
    name: "fault provider",
    port: providerPort,
  });
}

export async function startConnector(options?: {
  credentials?: Readonly<
    Record<string, { readonly secret: string; readonly tenantId: string }>
  >;
  providerUrl?: string;
  timeoutMs?: number;
}): Promise<ManagedProcess> {
  return startProcess({
    command: path.join(targetDirectory, "zoen-http-connector"),
    environment: {
      ZOEN_CONNECTOR_CREDENTIALS: JSON.stringify(
        options?.credentials ?? {
          "secret.provider.a": {
            secret: "provider-secret",
            tenantId: tenantA,
          },
          "secret.provider.b": {
            secret: "provider-secret",
            tenantId: tenantB,
          },
        },
      ),
      ZOEN_CONNECTOR_CALLER_TOKEN: connectorCallerToken,
      ZOEN_CONNECTOR_LISTEN_ADDR: e2eListenAddr(
        "ZOEN_E2E_CONNECTOR_PORT",
        connectorPortFallback,
      ),
      ZOEN_CONNECTOR_PROVIDER_TIMEOUT_MS: (
        options?.timeoutMs ?? 250
      ).toString(),
      ZOEN_CONNECTOR_PROVIDER_URL: options?.providerUrl ?? providerUrl,
    },
    name: "HTTP connector",
    port: connectorPort,
  });
}

export async function startWorker(tokens: {
  readonly [tenantA]: string;
  readonly [tenantB]: string;
}): Promise<ManagedProcess> {
  return startProcess({
    command: process.execPath,
    arguments: [
      path.join(
        distDirectory,
        "archive",
        "packages",
        "effect-worker",
        "src",
        "index.js",
      ),
    ],
    environment: {
      ZOEN_CONNECTOR_CALLER_TOKEN: connectorCallerToken,
      ZOEN_CONNECTOR_CREDENTIAL_REFS: JSON.stringify({
        [tenantA]: "secret.provider.a",
        [tenantB]: "secret.provider.b",
      }),
      ZOEN_EFFECT_CONNECTOR_URL: connectorUrl,
      ZOEN_EFFECT_SERVICE_BEARER_TOKENS: JSON.stringify(tokens),
      ZOEN_EFFECT_SERVICE_URL: zoenBaseUrl,
      ZOEN_EFFECT_WORKER_PORT: workerPort.toString(),
    },
    name: "Restate effect worker",
    port: workerPort,
  });
}

export async function stopProcess(process: ManagedProcess): Promise<void> {
  if (process.child.exitCode !== null) {
    return;
  }
  process.child.kill("SIGINT");
  await once(process.child, "exit");
  assert.ok(
    process.child.exitCode === 0 || process.child.signalCode === "SIGINT",
    `${process.name} failed during shutdown:\n${process.output.join("")}`,
  );
}

export async function dispatchOnce(tenantId = tenantA): Promise<void> {
  await runProcess(
    path.join(targetDirectory, "zoen-effect-dispatcher"),
    [],
    {
      DATABASE_URL: applicationDatabaseUrl,
      RESTATE_INGRESS: restateIngress,
      ZOEN_EFFECT_DISPATCH_ONCE: "true",
      ZOEN_TENANT_ID: tenantId,
    },
  );
}

export async function registerWorker(): Promise<string> {
  const response = await fetch(`${restateAdmin}/deployments`, {
    body: JSON.stringify({
      uri: `http://host.docker.internal:${workerPort}`,
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const body = await response.text();
  assert.ok(response.ok, `Restate deployment registration failed: ${body}`);
  return body;
}

export async function lookupInvocation(
  effectRequestId: string,
  dispatchVersion: string,
  tenantId = tenantA,
): Promise<string> {
  const key = `${tenantId}:${effectRequestId}:${dispatchVersion}`;
  const response = await fetch(`${restateIngress}/restate/lookup`, {
    body: JSON.stringify({
      handler: "execute",
      idempotencyKey: key,
      key,
      service: "ZoenEffect",
      target: "idempotentInvocation",
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const body: unknown = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  return invocationLookupSchema.parse(body).invocationId;
}

export async function setProviderMode(
  mode:
    | "accepted_pending"
    | "confirmed"
    | "confirmed_no_effect"
    | "hold_confirmed"
    | "parse_error"
    | "schema_error"
    | "timeout_after_delivery"
    | "unavailable",
): Promise<void> {
  const response = await fetch(
    `${e2eHttpUrl("ZOEN_E2E_EFFECT_PROVIDER_PORT", providerPort)}/control`,
    {
      body: JSON.stringify({ mode }),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
  );
  assert.equal(response.ok, true, await response.text());
}

export async function providerOperation(
  idempotencyKey: string,
): Promise<ProviderOperation | undefined> {
  const response = await fetch(
    `${e2eHttpUrl("ZOEN_E2E_EFFECT_PROVIDER_PORT", providerPort)}/v1/operations/by-idempotency/${encodeURIComponent(idempotencyKey)}`,
    { headers: { authorization: "Bearer provider-secret" } },
  );
  if (response.status === 404) {
    return undefined;
  }
  const body: unknown = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  return providerOperationSchema.parse(body);
}

export async function connectorStatus(
  idempotencyKey: string,
  tenantId = tenantA,
  credentialRef = tenantId === tenantA
    ? "secret.provider.a"
    : "secret.provider.b",
): Promise<ConnectorStatus | undefined> {
  const response = await fetch(`${connectorUrl}/status`, {
    body: JSON.stringify({ credentialRef, idempotencyKey, tenantId }),
    headers: {
      authorization: `Bearer ${connectorCallerToken}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
  if (response.status === 404) {
    return undefined;
  }
  const body: unknown = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  return connectorStatusSchema.parse(body);
}

export async function stopRestate(): Promise<void> {
  await compose("stop", "restate");
}

export async function startRestate(): Promise<void> {
  await compose("start", "restate");
  await waitForPort(e2ePort("ZOEN_E2E_RESTATE_UI_PORT", restateUiFallback));
  await waitForPort(
    e2ePort("ZOEN_E2E_RESTATE_INGRESS_PORT", restateIngressFallback),
  );
}

export async function restartRestate(): Promise<void> {
  await compose("restart", "restate");
  await waitForPort(e2ePort("ZOEN_E2E_RESTATE_UI_PORT", restateUiFallback));
  await waitForPort(
    e2ePort("ZOEN_E2E_RESTATE_INGRESS_PORT", restateIngressFallback),
  );
}

export async function waitFor<T>(
  probe: () => Promise<T | undefined>,
  description: string,
  attempts = 200,
): Promise<T> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await probe();
    if (result !== undefined) {
      return result;
    }
    await delay(50);
  }
  throw new Error(`timed out waiting for ${description}`);
}

async function startProcess(options: {
  arguments?: readonly string[];
  command: string;
  environment: Readonly<Record<string, string>>;
  name: string;
  port: number;
}): Promise<ManagedProcess> {
  const output: string[] = [];
  const stderr: string[] = [];
  const child = spawn(options.command, [...(options.arguments ?? [])], {
    cwd: repositoryRoot,
    env: { ...process.env, ...options.environment },
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdin.end();
  child.stdout.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    output.push(text);
    stderr.push(text);
  });
  const managedProcess = { child, name: options.name, output, stderr };
  await waitForPort(options.port, managedProcess);
  return managedProcess;
}

async function waitForPort(
  port: number,
  process?: ManagedProcess,
): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (process !== undefined && process.child.exitCode !== null) {
      throw new Error(
        `${process.name} exited during startup:\n${process.output.join("")}`,
      );
    }
    if (await canConnect(port)) {
      return;
    }
    await delay(50);
  }
  throw new Error(
    `${process?.name ?? `service on port ${port}`} did not start:\n${
      process?.output.join("") ?? ""
    }`,
  );
}

function canConnect(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    let settled = false;
    const finish = (connected: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(connected);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(200, () => finish(false));
  });
}

function transport(token: string) {
  const authorization: Interceptor = (next) => async (request) => {
    request.header.set("authorization", `Bearer ${token}`);
    return next(request);
  };
  return createConnectTransport({
    baseUrl: zoenBaseUrl,
    httpVersion: "1.1",
    interceptors: [authorization],
  });
}

function compose(...arguments_: readonly string[]): Promise<string> {
  return runProcess("docker", [
    "compose",
    "--project-name",
    composeProject,
    "--file",
    composeFile,
    ...arguments_,
  ]);
}

function runProcess(
  command: string,
  arguments_: readonly string[],
  environment: Readonly<Record<string, string>> = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      [...arguments_],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: { ...process.env, ...environment },
      },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve(stdout);
        } else {
          reject(
            new Error(
              `${command} ${arguments_.join(" ")} failed:\n${stdout}${stderr}`,
              { cause: error },
            ),
          );
        }
      },
    );
  });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
