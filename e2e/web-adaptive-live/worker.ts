import { createHash, randomUUID } from "node:crypto";
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
  AgentRegistry,
  CompanyBrain,
  LocalTransformerEmbeddingProvider,
  PostgresAdaptiveSurfaceSessionStore,
  connectZoenAgent,
  createCompanyBrainIngestService,
  embeddingProviderRouteSchema,
  generateAdaptiveDecisionSurface,
  modelCapabilityAliasSchema,
  parseLiveProviderConfig,
  providerRouteSchema,
  registerLiveProviders,
  semanticCapabilityScopeSchema,
} from "../../packages/harness/src/index.js";
import type { AdaptiveSurfaceSession } from "../../packages/surface/src/index.js";
import { e2ePort } from "../host-env.js";

const environment = z
  .object({
    DATABASE_URL: z.string().min(1),
    OPENCODE_API_KEY: z.string().min(1),
    OPENCODE_BASE_URL: z.url(),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_BUCKET: z.string().min(1),
    S3_ENDPOINT: z.url(),
    S3_REGION: z.string().min(1),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
    ZOEN_AGENT_BEARER_TOKEN: z.string().min(1),
    ZOEN_AGENT_DEFINITION_DIGEST: z.string().regex(/^[0-9a-f]{64}$/),
    ZOEN_AGENT_SERVICE_URL: z.url(),
    ZOEN_BASELINE_OPERATION_ID: z.string().min(1),
    ZOEN_PROVIDER_A_ID: z.string().min(1),
    ZOEN_PROVIDER_A_MODEL: z.string().min(1),
    ZOEN_PROVIDER_B_ID: z.string().min(1),
    ZOEN_PROVIDER_B_MODEL: z.string().min(1),
  })
  .parse(process.env);
const embeddingModelId = "Xenova/all-MiniLM-L6-v2";
const embeddingModelRevision = "751bff37182d3f1213fa05d7196b954e230abad9";
const embeddingVersionDigest = createHash("sha256")
  .update(
    JSON.stringify({
      dimensions: 384,
      dtype: "q8",
      modelId: embeddingModelId,
      modelRevision: embeddingModelRevision,
      normalize: true,
      pooling: "mean",
    }),
  )
  .digest("hex");
const workerControlPort = e2ePort("ZOEN_E2E_WORKER_CONTROL_PORT", 58_196);
const workerPort = e2ePort("ZOEN_E2E_WORKER_PORT", 58_195);
const definition = {
  definitionId: "inventory.companyBrain",
  digest: environment.ZOEN_AGENT_DEFINITION_DIGEST,
  revision: 1,
};
const validAt = "2026-08-20T00:00:00.000Z";
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
const routes = [
  providerRouteSchema.parse({
    capability: "reasoning-fast",
    id: environment.ZOEN_PROVIDER_A_ID,
    modelId: environment.ZOEN_PROVIDER_A_MODEL,
    provider: "openai-compatible",
  }),
  providerRouteSchema.parse({
    capability: "reasoning-high",
    id: environment.ZOEN_PROVIDER_B_ID,
    modelId: environment.ZOEN_PROVIDER_B_MODEL,
    provider: "openai-compatible",
  }),
];
const embeddingRoute = embeddingProviderRouteSchema.parse({
  capability: "embedding-default",
  dimensions: 384,
  id: "local-minilm",
  kind: "local-embedding",
  modelId: embeddingModelId,
  modelRevision: embeddingModelRevision,
  versionDigest: embeddingVersionDigest,
});

const registry = new AgentRegistry();
for (const scope of scopes) {
  registry.registerCapabilityScope(scope);
}
registerLiveProviders(registry, parseLiveProviderConfig({ routes }), [
  {
    apiKey: environment.OPENCODE_API_KEY,
    baseURL: environment.OPENCODE_BASE_URL,
    kind: "openai-compatible",
  },
]);
registry.registerEmbeddingProvider(
  new LocalTransformerEmbeddingProvider(embeddingRoute),
);
const pool = new Pool({ connectionString: environment.DATABASE_URL });
const brain = new CompanyBrain({
  bucket: environment.S3_BUCKET,
  embeddingCapability: embeddingRoute.capability,
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
const sessionStore = new PostgresAdaptiveSurfaceSessionStore(pool);
const ingestConnection = await connectZoenAgent(
  {
    baseUrl: environment.ZOEN_AGENT_SERVICE_URL,
    bearerToken: environment.ZOEN_AGENT_BEARER_TOKEN,
  },
  scopes,
);

const controlServer = createServer((request, response) => {
  void routeControl(request, response).catch((error: unknown) => {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : String(error),
    });
  });
});
controlServer.listen(workerControlPort, "127.0.0.1");

async function routeControl(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (request.method === "GET" && url.pathname === "/health") {
    const discovery = await ingestConnection.authority.discover(
      registry.capabilityScopes(),
    );
    sendJson(response, 200, {
      capabilities: discovery.capabilities
        .map((capability) => capability.alias)
        .sort(),
      embedding: embeddingRoute,
      ingestPaused: false,
      providers: [...registry.providerRouteIds()].sort(),
      trustedContext: discovery.trustedContext,
    });
    return;
  }
  if (url.pathname !== "/surface") {
    sendJson(response, 404, { error: "control route not found" });
    return;
  }
  const bearerToken = requestBearerToken(request);
  const caller = await connectZoenAgent(
    {
      baseUrl: environment.ZOEN_AGENT_SERVICE_URL,
      bearerToken,
    },
    scopes,
  );
  if (request.method === "GET") {
    const sessionId = z
      .string()
      .min(1)
      .max(200)
      .parse(url.searchParams.get("sessionId"));
    const session = await sessionStore.load(
      caller.trustedContext.tenantId,
      sessionId,
    );
    if (session === undefined) {
      sendJson(response, 404, { error: "adaptive session not found" });
      return;
    }
    if (!(await sourcesRemainCurrent(caller.trustedContext.tenantId, session))) {
      sendJson(response, 409, { error: "Company Brain evidence is stale" });
      return;
    }
    sendJson(response, 200, session);
    return;
  }
  if (request.method === "POST") {
    const body = z
      .object({ question: z.string().min(1).max(16_000) })
      .strict()
      .parse(await requestJson(request));
    const result = await generateAdaptiveDecisionSurface({
      authority: caller.authority,
      brain,
      explainOperationId: environment.ZOEN_BASELINE_OPERATION_ID,
      generatedAt: new Date().toISOString(),
      knowledgeQuery: body.question,
      modelCapability: modelCapabilityAliasSchema.parse("reasoning-fast"),
      question: body.question,
      registry,
      sessionId: `session.web-adaptive.${randomUUID()}`,
      sessionStore,
    });
    if (result.kind !== "generated") {
      sendJson(response, 422, result);
      return;
    }
    sendJson(response, 200, result.session);
    return;
  }
  sendJson(response, 405, { error: "method not allowed" });
}

async function sourcesRemainCurrent(
  tenantId: string,
  session: AdaptiveSurfaceSession,
): Promise<boolean> {
  const checks = await Promise.all(
    session.context.evidence.map(async (reference) => {
      const result = await pool.query<{ current: boolean }>(
        `
          SELECT EXISTS (
            SELECT 1
            FROM company_sources AS source
            JOIN company_fragments AS fragment
              ON fragment.tenant_id = source.tenant_id
             AND fragment.source_id = source.source_id
             AND fragment.source_revision = source.source_revision
            WHERE source.tenant_id = $1
              AND source.source_id = $2
              AND source.source_revision = $3
              AND source.content_digest = $4
              AND source.status = 'indexed'
              AND fragment.fragment_id = $5
              AND fragment.fragment_digest = $6
              AND source.source_revision = (
                SELECT latest.source_revision
                FROM company_sources AS latest
                WHERE latest.tenant_id = source.tenant_id
                  AND latest.source_id = source.source_id
                  AND latest.status = 'indexed'
                ORDER BY latest.updated_at DESC
                LIMIT 1
              )
          ) AS current
        `,
        [
          tenantId,
          reference.sourceId,
          reference.sourceRevision,
          reference.sourceDigest,
          reference.fragmentId,
          reference.fragmentDigest,
        ],
      );
      return result.rows[0]?.current === true;
    }),
  );
  return checks.every(Boolean);
}

function requestBearerToken(request: IncomingMessage): string {
  const authorization = request.headers.authorization;
  if (authorization === undefined || !authorization.startsWith("Bearer ")) {
    throw new Error("OIDC bearer token is required");
  }
  return authorization.slice("Bearer ".length);
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

await restate.serve({
  port: workerPort,
  services: [
    createCompanyBrainIngestService(
      brain,
      ingestConnection.trustedContext,
      environment.ZOEN_AGENT_BEARER_TOKEN,
    ),
  ],
});
