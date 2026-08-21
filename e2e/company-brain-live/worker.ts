import { createHash } from "node:crypto";
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
  CompanyBrainContextAssembler,
  LocalTransformerEmbeddingProvider,
  connectZoenAgent,
  createAgentSessionService,
  createCompanyBrainIngestService,
  embeddingProviderRouteSchema,
  parseLiveProviderConfig,
  providerRouteSchema,
  registerLiveProviders,
  semanticCapabilityScopeSchema,
} from "../../packages/harness/src/index.js";
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
    ZOEN_PAUSE_INGEST_BEFORE_INDEX: z.literal("true").optional(),
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
const workerControlPort = e2ePort("ZOEN_E2E_WORKER_CONTROL_PORT", 58_166);
const workerPort = e2ePort("ZOEN_E2E_WORKER_PORT", 58_165);
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

const connected = await connectZoenAgent(
  {
    baseUrl: environment.ZOEN_AGENT_SERVICE_URL,
    bearerToken: environment.ZOEN_AGENT_BEARER_TOKEN,
  },
  scopes,
);
const registry = new AgentRegistry();
for (const scope of scopes) {
  registry.registerCapabilityScope(scope);
}
registerLiveProviders(
  registry,
  parseLiveProviderConfig({ routes }),
  [
    {
      apiKey: environment.OPENCODE_API_KEY,
      baseURL: environment.OPENCODE_BASE_URL,
      kind: "openai-compatible",
    },
  ],
);
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

let ingestPaused = false;
const neverResume = new Promise<void>(() => undefined);
const ingestHooks = {
  beforeStep: async (name: string) => {
    if (
      environment.ZOEN_PAUSE_INGEST_BEFORE_INDEX === "true" &&
      name === "embed and index company fragments"
    ) {
      ingestPaused = true;
      await neverResume;
    }
  },
};
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
    const discovery = await connected.authority.discover(
      registry.capabilityScopes(),
    );
    sendJson(response, 200, {
      capabilities: discovery.capabilities
        .map((capability) => capability.alias)
        .sort(),
      embedding: embeddingRoute,
      ingestPaused,
      providers: [...registry.providerRouteIds()].sort(),
      trustedContext: discovery.trustedContext,
    });
    return;
  }
  if (request.method === "POST" && url.pathname === "/retrieve") {
    const body = z
      .object({ query: z.string().min(1).max(16_000) })
      .strict()
      .parse(await requestJson(request));
    sendJson(
      response,
      200,
      await brain.retrieve(connected.trustedContext.tenantId, body.query),
    );
    return;
  }
  if (request.method === "GET" && url.pathname === "/fragment-ids") {
    sendJson(response, 200, {
      fragmentIds: await brain.fragmentIds(connected.trustedContext.tenantId),
    });
    return;
  }
  if (request.method === "POST" && url.pathname === "/rebuild-indexes") {
    await brain.rebuildIndexes();
    sendJson(response, 200, { rebuilt: true });
    return;
  }
  sendJson(response, 404, { error: "control route not found" });
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
      connected.trustedContext,
      environment.ZOEN_AGENT_BEARER_TOKEN,
      ingestHooks,
    ),
    createAgentSessionService(
      {
        authority: connected.authority,
        contextAssembler: new CompanyBrainContextAssembler(brain),
        registry,
      },
      connected.trustedContext,
      environment.ZOEN_AGENT_BEARER_TOKEN,
    ),
  ],
});
