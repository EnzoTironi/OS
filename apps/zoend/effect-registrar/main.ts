import { constants } from "node:fs";
import { type FileHandle, open } from "node:fs/promises";
import { createServer } from "node:http";
import { connect } from "node:http2";
import { z } from "zod";
import {
  effectHandlerMetadata,
  loadEffectHandlerArtifact,
  ZOEN_EFFECT_HANDLER_NAME,
  ZOEN_EFFECT_OWNER,
  ZOEN_EFFECT_SERVICE_NAME,
} from "../effect-handler/artifact.js";

const effectHandlerArtifact = loadEffectHandlerArtifact();
const artifactMetadata = effectHandlerMetadata(effectHandlerArtifact);
const trailingSlashesPattern = /\/+$/;
const trailingSlashPattern = /\/$/;
const loopbackHosts = new Set(["127.0.0.1", "[::1]", "localhost"]);

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(["production", "test"]).default("production"),
    RESTATE_ADMIN_URL: z.url().default("http://127.0.0.1:9070"),
    ZOEN_EFFECT_CONNECTOR_HEALTH_URL: z
      .url()
      .default("http://127.0.0.1:8081/health"),
    ZOEN_EFFECT_HANDLER_HEALTH_URL: z
      .url()
      .default("http://127.0.0.1:9081/health"),
    ZOEN_EFFECT_HANDLER_IDENTITY_URL: z
      .url()
      .default("http://127.0.0.1:9081/zoen/artifact"),
    ZOEN_EFFECT_HANDLER_REGISTRATION_URI: z
      .url()
      .default("http://127.0.0.1:9081"),
    ZOEN_EFFECT_REGISTRAR_LISTEN_ADDR: z
      .string()
      .regex(/^127\.0\.0\.1:[1-9][0-9]{0,4}$/)
      .default("127.0.0.1:9082"),
    ZOEN_EFFECT_REGISTRATION_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(100)
      .max(60_000)
      .default(1000),
    ZOEN_EFFECT_WORKER_ACTOR_ID: z.string().min(1),
    ZOEN_EFFECT_WORKER_CREDENTIAL_MAX_AGE_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .max(300_000)
      .default(15_000),
    ZOEN_EFFECT_WORKER_CREDENTIAL_READY_FILE: z
      .string()
      .min(1)
      .default("/run/zoen/effect-worker-credential.ready"),
    ZOEN_EFFECT_WORKER_PRINCIPAL_ID: z.string().min(1),
    ZOEN_EFFECT_WORKER_WORKLOAD_ID: z
      .literal("workload.effect-worker")
      .default("workload.effect-worker"),
    ZOEN_TENANT_ID: z.string().min(1),
    ZOEN_ZOEND: z.url().default("http://127.0.0.1:58701"),
  })
  .passthrough();

const credentialMarkerSchema = z
  .object({
    actorId: z.string().min(1),
    checkedAtMicros: z.string().regex(/^[0-9]+$/),
    credentialId: z.string().min(1),
    principalId: z.string().min(1),
    tenantId: z.string().min(1),
    workloadId: z.literal("workload.effect-worker"),
  })
  .strict();

const handlerSchema = z
  .object({
    metadata: z.record(z.string(), z.string()).default({}),
    name: z.string(),
    public: z.boolean(),
    ty: z.string(),
  })
  .passthrough();

const serviceSchema = z
  .object({
    handlers: z.array(handlerSchema),
    metadata: z.record(z.string(), z.string()).default({}),
    name: z.string(),
    ty: z.string(),
  })
  .passthrough();

const deploymentSchema = z
  .object({
    id: z.string().min(1),
    metadata: z.record(z.string(), z.string()).default({}),
    services: z.array(
      z.union([
        serviceSchema,
        z.object({ name: z.string().min(1) }).passthrough(),
      ])
    ),
    uri: z.url(),
  })
  .passthrough();

const deploymentsSchema = z
  .object({ deployments: z.array(deploymentSchema) })
  .passthrough();
const discoverySchema = z
  .object({
    id: z.string().min(1),
    services: z.array(serviceSchema),
  })
  .passthrough();
const handlerIdentitySchema = z
  .object({
    artifact: z.string().min(1),
    handler: z.literal(ZOEN_EFFECT_HANDLER_NAME),
    owner: z.literal(ZOEN_EFFECT_OWNER),
    service: z.literal(ZOEN_EFFECT_SERVICE_NAME),
  })
  .strict();

const environment = environmentSchema.parse(process.env);
requirePrivateHttpUrl(environment.RESTATE_ADMIN_URL, "RESTATE_ADMIN_URL", "/");
requirePrivateHttpUrl(
  environment.ZOEN_EFFECT_CONNECTOR_HEALTH_URL,
  "ZOEN_EFFECT_CONNECTOR_HEALTH_URL",
  "/health"
);
requirePrivateHttpUrl(
  environment.ZOEN_EFFECT_HANDLER_HEALTH_URL,
  "ZOEN_EFFECT_HANDLER_HEALTH_URL",
  "/health"
);
requirePrivateHttpUrl(
  environment.ZOEN_EFFECT_HANDLER_IDENTITY_URL,
  "ZOEN_EFFECT_HANDLER_IDENTITY_URL",
  "/zoen/artifact"
);
requirePrivateHttpUrl(
  environment.ZOEN_EFFECT_HANDLER_REGISTRATION_URI,
  "ZOEN_EFFECT_HANDLER_REGISTRATION_URI",
  "/",
  environment.NODE_ENV === "test"
);
requirePrivateHttpUrl(environment.ZOEN_ZOEND, "ZOEN_ZOEND", "/");
const [registrarHost, registrarPortText] =
  environment.ZOEN_EFFECT_REGISTRAR_LISTEN_ADDR.split(":");
const registrarPort = Number(registrarPortText);

interface RegistrationState {
  artifact: string;
  deploymentId?: string;
  ready: boolean;
  reason: string;
  updatedAt: string;
}

let registrationState: RegistrationState = {
  artifact: effectHandlerArtifact.revision,
  ready: false,
  reason: "registration has not been checked",
  updatedAt: new Date().toISOString(),
};
let stopping = false;

const probeServer = createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(registrationState.ready ? 204 : 503).end();
    return;
  }
  if (request.url === "/status") {
    response
      .writeHead(200, { "content-type": "application/json" })
      .end(JSON.stringify(registrationState));
    return;
  }
  response.writeHead(404).end();
});

probeServer.listen(registrarPort, registrarHost, () => {
  console.log(
    `effect registrar probe listening on ${environment.ZOEN_EFFECT_REGISTRAR_LISTEN_ADDR}`
  );
});

process.once("SIGINT", beginShutdown);
process.once("SIGTERM", beginShutdown);

await runRegistrationLoop();

await new Promise<void>((resolve, reject) => {
  probeServer.close((error) =>
    error === undefined ? resolve() : reject(error)
  );
});

async function reconcile(): Promise<string> {
  await requireCredentialMarker();
  await Promise.all([
    requireHttpHealth(new URL("/live", environment.ZOEN_ZOEND).toString()),
    requireHttpHealth(
      new URL("/health", environment.RESTATE_ADMIN_URL).toString()
    ),
    requireHttpHealth(environment.ZOEN_EFFECT_CONNECTOR_HEALTH_URL),
    requireHttp2Health(environment.ZOEN_EFFECT_HANDLER_HEALTH_URL),
    requireHttp2Artifact(environment.ZOEN_EFFECT_HANDLER_IDENTITY_URL),
  ]);

  const deployments = await adminJson("/deployments", deploymentsSchema);
  const serviceDeployments = deployments.deployments.filter((deployment) =>
    deployment.services.some(
      (service) => service.name === ZOEN_EFFECT_SERVICE_NAME
    )
  );
  if (serviceDeployments.length > 1) {
    throw new Error("multiple ZoenEffect deployments are registered");
  }
  if (serviceDeployments.length === 1) {
    const [existing] = serviceDeployments;
    if (existing === undefined) {
      throw new Error("ZoenEffect deployment lookup was inconsistent");
    }
    await requireExactDeployment(existing.id);
    return existing.id;
  }

  const expectedUri = canonicalUri(
    environment.ZOEN_EFFECT_HANDLER_REGISTRATION_URI
  );
  const sameUri = deployments.deployments.find(
    (deployment) => canonicalUri(deployment.uri) === expectedUri
  );
  if (sameUri !== undefined) {
    throw new Error(
      "the stable effect handler URI is occupied by an incompatible deployment"
    );
  }

  const registration = {
    breaking: false,
    dry_run: true,
    force: false,
    metadata: artifactMetadata,
    uri: environment.ZOEN_EFFECT_HANDLER_REGISTRATION_URI,
  };
  const preview = await adminJson(
    "/deployments",
    discoverySchema,
    registration
  );
  requireExactServices(preview.services);

  const created = await adminJson("/deployments", discoverySchema, {
    ...registration,
    dry_run: false,
  });
  await requireExactDeployment(created.id);
  return created.id;
}

async function requireCredentialMarker(): Promise<void> {
  const markerPath = environment.ZOEN_EFFECT_WORKER_CREDENTIAL_READY_FILE;
  let markerFile: FileHandle | undefined;
  try {
    markerFile = await open(markerPath, constants.O_NOFOLLOW);
    const markerStat = await markerFile.stat();
    if (!markerStat.isFile() || markerStat.mode % 0o1000 !== 0o600) {
      throw new Error(
        "effect worker credential marker is not a mode-0600 regular file"
      );
    }
    const parsed: unknown = JSON.parse(await markerFile.readFile("utf8"));
    const marker = credentialMarkerSchema.parse(parsed);
    requireCurrentCredentialMarker(marker);
  } catch (error: unknown) {
    if (error instanceof Error && error.message.startsWith("effect worker")) {
      throw error;
    }
    throw new Error("effect worker credential marker cannot be read", {
      cause: error,
    });
  } finally {
    await markerFile?.close();
  }
}

function requireCurrentCredentialMarker(
  marker: z.infer<typeof credentialMarkerSchema>
): void {
  if (
    marker.tenantId !== environment.ZOEN_TENANT_ID ||
    marker.workloadId !== environment.ZOEN_EFFECT_WORKER_WORKLOAD_ID ||
    marker.principalId !== environment.ZOEN_EFFECT_WORKER_PRINCIPAL_ID ||
    marker.actorId !== environment.ZOEN_EFFECT_WORKER_ACTOR_ID
  ) {
    throw new Error("effect worker credential marker identity does not match");
  }
  const ageMicros =
    BigInt(Date.now()) * 1_000n - BigInt(marker.checkedAtMicros);
  if (
    ageMicros < 0n ||
    ageMicros >
      BigInt(environment.ZOEN_EFFECT_WORKER_CREDENTIAL_MAX_AGE_MS) * 1_000n
  ) {
    throw new Error("effect worker credential validation is stale");
  }
}

async function requireExactDeployment(deploymentId: string): Promise<void> {
  const deployment = await adminJson(
    `/deployments/${encodeURIComponent(deploymentId)}`,
    deploymentSchema
  );
  requireExactShape(deployment);
}

function requireExactShape(deployment: z.infer<typeof deploymentSchema>): void {
  if (
    canonicalUri(deployment.uri) !==
    canonicalUri(environment.ZOEN_EFFECT_HANDLER_REGISTRATION_URI)
  ) {
    throw new Error("ZoenEffect deployment URI does not match the stable URI");
  }
  requireMetadata(deployment.metadata, "deployment");
  requireExactServices(deployment.services);
}

function requireExactServices(services: readonly unknown[]): void {
  if (services.length !== 1) {
    throw new Error("effect deployment must expose exactly one service");
  }
  const parsedService = serviceSchema.safeParse(services[0]);
  if (!parsedService.success) {
    throw new Error("ZoenEffect deployment detail omitted its service shape");
  }
  const service = parsedService.data;
  if (
    service.name !== ZOEN_EFFECT_SERVICE_NAME ||
    service.ty !== "VirtualObject"
  ) {
    throw new Error("effect service name or type does not match");
  }
  requireMetadata(service.metadata, "service");
  if (service.handlers.length !== 1) {
    throw new Error("ZoenEffect must expose exactly one handler");
  }
  const [handler] = service.handlers;
  if (
    handler === undefined ||
    handler.name !== ZOEN_EFFECT_HANDLER_NAME ||
    handler.ty !== "Exclusive" ||
    !handler.public
  ) {
    throw new Error("ZoenEffect execute handler shape does not match");
  }
  requireMetadata(handler.metadata, "handler");
}

function requireMetadata(
  metadata: Readonly<Record<string, string>>,
  subject: string
): void {
  if (
    metadata["zoen.owner"] !== artifactMetadata["zoen.owner"] ||
    metadata["zoen.artifact"] !== artifactMetadata["zoen.artifact"]
  ) {
    throw new Error(`${subject} owner or artifact metadata does not match`);
  }
}

async function adminJson<T>(
  path: string,
  schema: z.ZodType<T>,
  body?: unknown
): Promise<T> {
  const response = await fetch(
    new URL(path, environment.RESTATE_ADMIN_URL).toString(),
    {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers:
        body === undefined ? undefined : { "content-type": "application/json" },
      method: body === undefined ? "GET" : "POST",
      signal: AbortSignal.timeout(5000),
    }
  );
  if (!response.ok) {
    await cancelResponse(response);
    throw new Error(`Restate Admin ${path} returned HTTP ${response.status}`);
  }
  return schema.parse(await response.json());
}

async function requireHttpHealth(url: string): Promise<void> {
  const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
  await cancelResponse(response);
  if (!response.ok) {
    throw new Error(
      `${new URL(url).pathname} returned HTTP ${response.status}`
    );
  }
}

async function cancelResponse(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // The response is already unusable; cancellation is best-effort cleanup.
  }
}

async function requireHttp2Health(value: string): Promise<void> {
  const url = new URL(value);
  await new Promise<void>((resolve, reject) => {
    const client = connect(url.origin);
    const request = client.request({ ":method": "GET", ":path": url.pathname });
    let settled = false;
    const timer = setTimeout(() => {
      finishError(new Error("effect handler health probe timed out"));
    }, 2000);
    client.once("error", finishError);
    request.once("error", finishError);
    request.once("response", (headers) => {
      const status = headers[":status"];
      if (status !== 200 && status !== 204) {
        finishError(new Error(`effect handler health returned HTTP ${status}`));
        return;
      }
      request.resume();
      request.once("end", finish);
    });
    request.end();

    function finish(): void {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      client.close(resolve);
    }

    function finishError(error: Error): void {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      request.destroy();
      client.destroy();
      reject(error);
    }
  });
}

async function requireHttp2Artifact(value: string): Promise<void> {
  const document = await http2Text(value);
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(document);
  } catch (error: unknown) {
    throw new Error("effect handler artifact probe returned malformed JSON", {
      cause: error,
    });
  }
  const parsed = handlerIdentitySchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new Error(
      "effect handler artifact probe returned a malformed identity"
    );
  }
  if (parsed.data.artifact !== effectHandlerArtifact.revision) {
    throw new Error("effect handler artifact does not match this image");
  }
}

function http2Text(value: string): Promise<string> {
  const url = new URL(value);
  return new Promise((resolve, reject) => {
    const client = connect(url.origin);
    const request = client.request({ ":method": "GET", ":path": url.pathname });
    const chunks: Buffer[] = [];
    let bytes = 0;
    let settled = false;
    const timer = setTimeout(() => {
      finishError(new Error("effect handler artifact probe timed out"));
    }, 2000);
    client.once("error", finishError);
    request.once("error", finishError);
    request.once("response", (headers) => {
      const status = headers[":status"];
      if (status !== 200) {
        finishError(
          new Error(`effect handler artifact probe returned HTTP ${status}`)
        );
      }
    });
    request.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 4096) {
        finishError(new Error("effect handler artifact probe is too large"));
        return;
      }
      chunks.push(chunk);
    });
    request.once("end", () => finish(Buffer.concat(chunks).toString("utf8")));
    request.end();

    function finish(document: string): void {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      client.close(() => resolve(document));
    }

    function finishError(error: Error): void {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      request.destroy();
      client.destroy();
      reject(error);
    }
  });
}

function canonicalUri(value: string): string {
  const url = new URL(value);
  url.pathname = url.pathname.replace(trailingSlashesPattern, "");
  return url.toString().replace(trailingSlashPattern, "");
}

function requirePrivateHttpUrl(
  value: string,
  name: string,
  expectedPath: string,
  allowDockerTestHost = false
): void {
  const url = new URL(value);
  const allowedHost =
    loopbackHosts.has(url.hostname) ||
    (allowDockerTestHost && url.hostname === "host.docker.internal");
  if (
    url.protocol !== "http:" ||
    !allowedHost ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.pathname !== expectedPath ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    throw new Error(
      `${name} must be a private HTTP URL with path ${expectedPath}`
    );
  }
}

function runRegistrationLoop(): Promise<void> {
  return new Promise((resolve) => {
    const run = (): void => {
      reconcile()
        .then((deploymentId) => {
          updateState(true, "exact registration verified", deploymentId);
        })
        .catch((error: unknown) => {
          updateState(false, sanitizedMessage(error));
        })
        .finally(() => {
          if (stopping) {
            resolve();
          } else {
            setTimeout(run, environment.ZOEN_EFFECT_REGISTRATION_INTERVAL_MS);
          }
        });
    };
    run();
  });
}

function updateState(
  ready: boolean,
  reason: string,
  deploymentId?: string
): void {
  if (
    registrationState.ready !== ready ||
    registrationState.reason !== reason ||
    registrationState.deploymentId !== deploymentId
  ) {
    console.log(
      `effect registration state: ${ready ? "ready" : "blocked"}: ${reason}`
    );
  }
  registrationState = {
    artifact: effectHandlerArtifact.revision,
    ...(deploymentId === undefined ? {} : { deploymentId }),
    ready,
    reason,
    updatedAt: new Date().toISOString(),
  };
}

function sanitizedMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "registration check failed";
}

function beginShutdown(): void {
  stopping = true;
}
