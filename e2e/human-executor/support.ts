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
const postgresPortFallback = 55_484;
const zoendPortFallback = 58_521;
const keycloakPortFallback = 58_520;
const restateIngressFallback = 58_522;
const restateUiFallback = 59_100;
const workerPortFallback = 58_523;

const zoendPort = e2ePort("ZOEN_E2E_ZOEND_PORT", zoendPortFallback);
const workerPort = e2ePort("ZOEN_E2E_EFFECT_WORKER_PORT", e2ePort("ZOEN_E2E_WORKER_PORT", workerPortFallback));

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
export const tenantA = "tenant.a";
export const tenantB = "tenant.b";
export const humanExecutorWorkload = "workload.human-executor";

const composeFile = path.join("e2e", "human-executor", "compose.yaml");
const composeProject = "zoen-human-executor";
const targetDirectory = path.join(repositoryRoot, "target", "debug");
const distDirectory = path.join(repositoryRoot, "dist");
const tokenResponseSchema = z
  .object({ access_token: z.string().min(1) })
  .passthrough();

export type ActionClient = Client<typeof ActionService>;
export type DefinitionClient = Client<typeof DefinitionService>;
export type EffectClient = Client<typeof EffectService>;
export type WorldClient = Client<typeof WorldService>;

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
      ZOEN_HUMAN_EXECUTOR_WORKLOAD_IDS: humanExecutorWorkload,
      ZOEN_LISTEN_ADDR: e2eListenAddr("ZOEN_E2E_ZOEND_PORT", zoendPortFallback),
      ZOEN_OIDC_AUDIENCE: oidcAudience,
      ZOEN_OIDC_ISSUER: oidcIssuer,
    },
    name: "zoend",
    port: zoendPort,
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
      ZOEN_CONNECTOR_CALLER_TOKEN: "unused-human-executor",
      ZOEN_CONNECTOR_CREDENTIAL_REFS: JSON.stringify({
        [tenantA]: "secret.provider.a",
        [tenantB]: "secret.provider.b",
      }),
      ZOEN_EFFECT_CONNECTOR_URL: e2eHttpUrl(
        "ZOEN_E2E_CONNECTOR_PORT",
        58_524,
        "/v1/effects",
      ),
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
