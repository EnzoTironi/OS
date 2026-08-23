import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { S3Client } from "@aws-sdk/client-s3";
import * as restate from "@restatedev/restate-sdk";
import { Pool } from "pg";
import { z } from "zod";
import {
  createTrustTaggedAssembler,
  HistoryContextSource,
  KnowledgeContextSource,
  TrustTaggedAgentContextAssembler,
  WorldContextSource,
} from "./context.js";
import {
  defaultEmbeddingModelPath,
  defaultEmbeddingRoute,
} from "./default-embedding.js";
import { LocalTransformerEmbeddingProvider } from "./embeddings.js";
import { createCompanyBrainIngestService } from "./ingestion.js";
import { CompanyBrain } from "./knowledge.js";
import { AgentRegistry } from "./registry.js";
import { createAgentSessionService } from "./session.js";
import { semanticCapabilityScopeSchema } from "./types.js";
import { connectZoenAgent } from "./zoen.js";

const environment = z
  .object({
    DATABASE_URL: z.string().min(1),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_BUCKET: z.string().min(1),
    S3_ENDPOINT: z.url(),
    S3_REGION: z.string().min(1),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
    ZOEN_HARNESS_BINDING_KEY: z.string().min(32),
    ZOEN_HARNESS_CLIENT_ID: z.string().min(1),
    ZOEN_HARNESS_CLIENT_SECRET: z.string().min(1),
    ZOEN_HARNESS_CONTROL_PORT: z.coerce
      .number()
      .int()
      .min(1)
      .max(65_535),
    ZOEN_HARNESS_DEFINITION_DIGEST: z.string().regex(/^[0-9a-f]{64}$/u),
    ZOEN_HARNESS_DEFINITION_ID: z.string().min(1),
    ZOEN_HARNESS_SERVICE_SUFFIX: z.string().regex(/^[A-Za-z0-9]+$/u),
    ZOEN_HARNESS_TOKEN_ENDPOINT: z.url(),
    ZOEN_HARNESS_VALID_AT: z.iso.datetime(),
    ZOEN_HARNESS_WORKER_PORT: z.coerce
      .number()
      .int()
      .min(1)
      .max(65_535),
    ZOEN_SERVICE_URL: z.url(),
  })
  .parse(process.env);

const definition = {
  definitionId: environment.ZOEN_HARNESS_DEFINITION_ID,
  digest: environment.ZOEN_HARNESS_DEFINITION_DIGEST,
  revision: 1,
};
const validAt = environment.ZOEN_HARNESS_VALID_AT;
const scopes = [
  semanticCapabilityScopeSchema.parse({
    actionId: "inventory.requestStock",
    definition,
    kind: "action",
    resourceId: "inventory.item.1",
    validAt,
  }),
  semanticCapabilityScopeSchema.parse({
    definition,
    entityId: "inventory.item.1",
    kind: "query",
    selection: { id: "inventory.available", kind: "relation" },
    validAt,
  }),
];
const tokenResponseSchema = z
  .object({ access_token: z.string().min(1) })
  .passthrough();

const serviceToken = await retry("OIDC service token", () => oidcToken());
const connected = await retry("Zoen authority", () =>
  connectZoenAgent(
    {
      baseUrl: environment.ZOEN_SERVICE_URL,
      bearerToken: serviceToken,
    },
    scopes,
  ),
);
const registry = new AgentRegistry();
for (const scope of scopes) {
  registry.registerCapabilityScope(scope);
}
registry.registerEmbeddingProvider(
  new LocalTransformerEmbeddingProvider(defaultEmbeddingRoute, {
    kind: "local",
    path: defaultEmbeddingModelPath,
  }),
);
const pool = new Pool({ connectionString: environment.DATABASE_URL });
const brain = new CompanyBrain({
  bucket: environment.S3_BUCKET,
  embeddingCapability: defaultEmbeddingRoute.capability,
  pool,
  registry,
  s3: new S3Client({
    credentials: {
      accessKeyId: environment.S3_ACCESS_KEY_ID,
      secretAccessKey: environment.S3_SECRET_ACCESS_KEY,
    },
    endpoint: environment.S3_ENDPOINT,
    forcePathStyle: true,
    region: environment.S3_REGION,
  }),
});
await brain.initialize();

const controlServer = createServer((request, response) => {
  void routeControl(request, response).catch((error: unknown) => {
    if (!(error instanceof BoundaryError)) {
      reportUnexpectedControlError(request, error);
    }
    const status = error instanceof BoundaryError ? error.status : 500;
    sendJson(response, status, {
      code: status === 404 ? "not_found" : "request_denied",
    });
  });
});
controlServer.listen(environment.ZOEN_HARNESS_CONTROL_PORT, "0.0.0.0");

await restate.serve({
  port: environment.ZOEN_HARNESS_WORKER_PORT,
  services: [
    createCompanyBrainIngestService(
      brain,
      connected.trustedContext,
      environment.ZOEN_HARNESS_BINDING_KEY,
      {},
      {
        serviceName: `ZoenCompanyIngest${environment.ZOEN_HARNESS_SERVICE_SUFFIX}`,
      },
    ),
    createAgentSessionService(
      {
        authority: connected.authority,
        contextAssembler: new TrustTaggedAgentContextAssembler(
          createTrustTaggedAssembler({
            sources: [
              new KnowledgeContextSource(brain),
              new WorldContextSource(connected.authority),
              new HistoryContextSource(connected.authority),
            ],
          }),
        ),
        registry,
      },
      connected.trustedContext,
      environment.ZOEN_HARNESS_BINDING_KEY,
      {
        serviceName: `ZoenAgentSession${environment.ZOEN_HARNESS_SERVICE_SUFFIX}`,
      },
    ),
  ],
});

async function routeControl(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://harness");
  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, {
      embeddingVersionDigest: defaultEmbeddingRoute.versionDigest,
      ready: true,
    });
    return;
  }
  const context = await authenticatedContext(request);
  if (context.tenantId !== connected.trustedContext.tenantId) {
    throw new BoundaryError(404);
  }
  if (request.method === "POST" && url.pathname === "/retrieve") {
    const body = z
      .object({ query: z.string().min(1).max(16_000) })
      .strict()
      .parse(await requestJson(request));
    sendJson(response, 200, await brain.retrieve(context.tenantId, body.query));
    return;
  }
  if (request.method === "POST" && url.pathname === "/source") {
    const body = z
      .object({
        sourceId: z.string().min(1),
        sourceRevision: z.string().regex(/^[0-9a-f]{64}$/u),
      })
      .strict()
      .parse(await requestJson(request));
    try {
      const bytes = await brain.sourceBytes(
        context.tenantId,
        body.sourceId,
        body.sourceRevision,
      );
      sendJson(response, 200, { contentBase64: Buffer.from(bytes).toString("base64") });
    } catch {
      throw new BoundaryError(404);
    }
    return;
  }
  if (request.method === "GET" && url.pathname === "/fragment-ids") {
    sendJson(response, 200, {
      fragmentIds: await brain.fragmentIds(context.tenantId),
    });
    return;
  }
  if (request.method === "POST" && url.pathname === "/rebuild-indexes") {
    await brain.rebuildIndexes();
    sendJson(response, 200, { rebuilt: true });
    return;
  }
  throw new BoundaryError(404);
}

async function authenticatedContext(request: IncomingMessage) {
  const authorization = request.headers.authorization;
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : undefined;
  if (token === undefined || token.length === 0) {
    throw new BoundaryError(401);
  }
  try {
    return (
      await connectZoenAgent(
        {
          baseUrl: environment.ZOEN_SERVICE_URL,
          bearerToken: token,
        },
        scopes,
      )
    ).trustedContext;
  } catch {
    throw new BoundaryError(401);
  }
}

async function oidcToken(): Promise<string> {
  const response = await fetch(environment.ZOEN_HARNESS_TOKEN_ENDPOINT, {
    body: new URLSearchParams({
      client_id: environment.ZOEN_HARNESS_CLIENT_ID,
      client_secret: environment.ZOEN_HARNESS_CLIENT_SECRET,
      grant_type: "client_credentials",
    }),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`OIDC token endpoint returned HTTP ${response.status}`);
  }
  const body: unknown = await response.json();
  return tokenResponseSchema.parse(body).access_token;
}

async function retry<T>(
  description: string,
  operation: () => Promise<T>,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 180; attempt += 1) {
    try {
      return await operation();
    } catch (error: unknown) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
  throw new Error(`${description} did not become ready`, { cause: lastError });
}

function requestJson(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.once("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error: unknown) {
        reject(error);
      }
    });
    request.once("error", reject);
  });
}

function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function reportUnexpectedControlError(
  request: IncomingMessage,
  error: unknown,
): void {
  const message =
    error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(
    `${JSON.stringify({
      error: message,
      event: "harness_control_request_failed",
      method: request.method,
      path: request.url ?? "/",
    })}\n`,
  );
}

class BoundaryError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`boundary rejected request with HTTP ${status}`);
    this.status = status;
  }
}
