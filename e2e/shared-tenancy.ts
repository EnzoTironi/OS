import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import {
  Code,
  ConnectError,
  createClient,
  type Client,
  type Interceptor,
} from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import { chromium } from "playwright";
import { Client as PostgresClient } from "pg";
import { z } from "zod";
import {
  agentSessionCommandSchema,
  agentSessionObjectKey,
  agentSessionResultSchema,
  agentSessionSignatureHeader,
  companyBrainIngestCommandSchema,
  companyBrainIngestObjectKey,
  companyBrainIngestSignatureHeader,
  signAgentSessionCommand,
  signCompanyBrainIngestCommand,
  type AgentSessionCommand,
  type CompanyBrainIngestCommand,
} from "../packages/harness/src/index.js";
import {
  ActionInputSchema,
  ActionService,
  CommitStatus,
  PolicyDecision,
  ProposalStatus,
} from "../packages/sdk/src/gen/zoen/action/v1/action_pb.js";
import { DefinitionService } from "../packages/sdk/src/gen/zoen/definition/v1/definition_pb.js";
import { EffectService } from "../packages/sdk/src/gen/zoen/effect/v1/effect_pb.js";
import { HistoryService } from "../packages/sdk/src/gen/zoen/history/v1/history_pb.js";
import {
  DefinitionReferenceSchema,
  EventualConsistencySchema,
  EvidenceClaimSchema,
  EvidenceProvenanceSchema,
  ExactValueSchema,
  QueryConsistencySchema,
  QuerySelectionSchema,
  StrongConsistencySchema,
  ValidTimeSchema,
  WorldService,
  type DefinitionReference,
} from "../packages/sdk/src/gen/zoen/world/v1/world_pb.js";
import { semanticQueryCacheKey } from "../packages/surface/src/index.js";

const environment = z
  .object({
    ZOEN_E2E_ARTIFACTS_DIR: z.string().min(1),
    ZOEN_E2E_HARNESS_A_PORT: z.coerce.number().int().positive(),
    ZOEN_E2E_HARNESS_B_PORT: z.coerce.number().int().positive(),
    ZOEN_E2E_KEYCLOAK_PORT: z.coerce.number().int().positive(),
    ZOEN_E2E_MINIO_PORT: z.coerce.number().int().positive(),
    ZOEN_E2E_POSTGRES_PORT: z.coerce.number().int().positive(),
    ZOEN_E2E_RESTATE_ADMIN_PORT: z.coerce.number().int().positive(),
    ZOEN_E2E_RESTATE_INGRESS_PORT: z.coerce.number().int().positive(),
    ZOEN_E2E_WEB_PORT: z.coerce.number().int().positive(),
    ZOEN_E2E_ZOEND_PORT: z.coerce.number().int().positive(),
    ZOEN_SHARED_ARTIFACTS_METADATA: z.string().min(1),
  })
  .parse(process.env);

const tenantA = "tenant.a";
const tenantB = "tenant.b";
const definitionId = "inventory.companyBrain";
const actionId = "inventory.requestStock";
const entityId = "inventory.item.1";
const relationId = "inventory.available";
const validAt = new Date("2026-08-21T00:00:00.000Z");
const bindingKey = "shared-saas-harness-binding-key-v1";
const baseUrl = httpUrl(environment.ZOEN_E2E_ZOEND_PORT);
const oidcIssuer = httpUrl(
  environment.ZOEN_E2E_KEYCLOAK_PORT,
  "/realms/zoen",
  "keycloak.127.0.0.1.nip.io",
);
const restateAdmin = httpUrl(environment.ZOEN_E2E_RESTATE_ADMIN_PORT);
const restateIngress = httpUrl(environment.ZOEN_E2E_RESTATE_INGRESS_PORT);
const harnessA = httpUrl(environment.ZOEN_E2E_HARNESS_A_PORT);
const harnessB = httpUrl(environment.ZOEN_E2E_HARNESS_B_PORT);
const webUrl = httpUrl(environment.ZOEN_E2E_WEB_PORT);
const minioEndpoint = httpUrl(environment.ZOEN_E2E_MINIO_PORT);
const adminDatabaseUrl = postgresUrl("postgres", "postgres");
const observerDatabaseUrl = postgresUrl("zoen_platform_observer", "observer");
const appDatabaseUrl = (tenant?: string) =>
  `${postgresUrl("zoen_app", "zoen_app")}${
    tenant === undefined
      ? ""
      : `?options=-c%20zoen.tenant_id%3D${encodeURIComponent(tenant)}`
  }`;

const tokenResponseSchema = z
  .object({ access_token: z.string().min(1) })
  .passthrough();
const ingestResultSchema = z
  .object({
    fragments: z.array(
      z
        .object({
          fragmentDigest: z.string().regex(/^[0-9a-f]{64}$/u),
          fragmentId: z.string().regex(/^[0-9a-f]{64}$/u),
          sourceId: z.string().min(1),
          text: z.string(),
        })
        .passthrough(),
    ),
    source: z
      .object({
        contentDigest: z.string().regex(/^[0-9a-f]{64}$/u),
        objectKey: z.string().min(1),
        sourceId: z.string().min(1),
        sourceRevision: z.string().regex(/^[0-9a-f]{64}$/u),
        tenantId: z.string().min(1),
      })
      .passthrough(),
  })
  .strict();
const knowledgeSchema = z
  .object({
    queryDigest: z.string().regex(/^[0-9a-f]{64}$/u),
    results: z.array(
      z
        .object({
          fragmentDigest: z.string().regex(/^[0-9a-f]{64}$/u),
          fragmentId: z.string().regex(/^[0-9a-f]{64}$/u),
          lexicalRank: z.number().nullable(),
          sourceDigest: z.string().regex(/^[0-9a-f]{64}$/u),
          sourceId: z.string().min(1),
          text: z.string(),
          vectorRank: z.number().nullable(),
        })
        .passthrough(),
    ),
    traceId: z.string().regex(/^[0-9a-f]{64}$/u),
  })
  .passthrough();
const signedArtifactSchema = z
  .object({
    chartDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
    chartRepository: z.string().min(1),
    chartVersion: z.string().min(1),
    nodeDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
    nodeRepository: z.string().min(1),
    rustDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
    rustRepository: z.string().min(1),
    sourceSha: z.string().regex(/^[0-9a-f]{40}$/u),
  })
  .strict();

type DefinitionClient = Client<typeof DefinitionService>;
type ActionClient = Client<typeof ActionService>;
type WorldClient = Client<typeof WorldService>;

interface AttackEvidence {
  readonly boundary: string;
  readonly id: string;
  readonly outcome:
    | "fail_closed"
    | "isolated"
    | "not_found"
    | "permission_denied"
    | "tenant_scoped";
}

interface MutantEvidence {
  readonly id:
    | "cache-key-omission"
    | "datafusion-source-filter-omission"
    | "missing-postgres-tenant-predicate"
    | "missing-rls-context"
    | "projection-manifest-path-omission"
    | "restate-key-omission"
    | "vector-fts-filter-omission";
  readonly killed: true;
  readonly observation: string;
}

interface ProjectionRow {
  readonly manifest_digest: string;
  readonly manifest_object_key: string;
  readonly parquet_digest: string;
  readonly parquet_object_key: string;
  readonly tenant_id: string;
  readonly through_commit: string;
}

const attacks: AttackEvidence[] = [];
const mutants: MutantEvidence[] = [];

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const canonicalJson = (
    await readFile("e2e/shared-tenancy/definition.canonical.json", "utf8")
  ).trimEnd();
  const digest = sha256(canonicalJson);
  const definition = create(DefinitionReferenceSchema, {
    definitionId,
    digest,
    revision: 1n,
  });
  const signedArtifacts = signedArtifactSchema.parse(
    JSON.parse(
      await readFile(environment.ZOEN_SHARED_ARTIFACTS_METADATA, "utf8"),
    ),
  );
  const admin = new PostgresClient({ connectionString: adminDatabaseUrl });
  const observer = new PostgresClient({ connectionString: observerDatabaseUrl });
  const appA = new PostgresClient({ connectionString: appDatabaseUrl(tenantA) });
  const appNoContext = new PostgresClient({
    connectionString: appDatabaseUrl(),
  });
  await Promise.all([
    admin.connect(),
    observer.connect(),
    appA.connect(),
    appNoContext.connect(),
  ]);

  try {
    const tokens = {
      adminA: await clientToken("admin-a"),
      adminB: await clientToken("admin-b"),
      agentA: await clientToken("agent-a"),
      agentB: await clientToken("agent-b"),
      platform: await clientToken("platform-observer"),
      webA: await passwordToken("web-tenant.a"),
      webB: await passwordToken("web-tenant.b"),
    };

    const definitionA = definitionClient(tokens.adminA);
    const definitionB = definitionClient(tokens.adminB);
    const worldA = worldClient(tokens.agentA);
    const worldB = worldClient(tokens.agentB);
    const actionA = actionClient(tokens.agentA);
    const actionB = actionClient(tokens.agentB);
    const effectA = createClient(EffectService, transport(tokens.agentA));
    const historyA = createClient(HistoryService, transport(tokens.agentA));

    await publishAndActivate(definitionA, tenantA, canonicalJson, digest);
    await publishAndActivate(definitionB, tenantB, canonicalJson, digest);
    await Promise.all([
      kubectl([
        "rollout",
        "status",
        "deployment/harness-tenant-a",
        "--timeout=5m",
      ]),
      kubectl([
        "rollout",
        "status",
        "deployment/harness-tenant-b",
        "--timeout=5m",
      ]),
    ]);
    await registerRestateServices();
    await expectConnectCode(
      () =>
        definitionA.getRevision({
          definitionId,
          digest,
          tenantId: tenantB,
        }),
      [Code.PermissionDenied],
    );
    recordAttack(
      "foreign-definition-revision",
      "definition authority",
      "permission_denied",
    );
    await expectConnectCode(
      () =>
        definitionA.getActiveRevision({
          definitionId,
          tenantId: tenantB,
        }),
      [Code.PermissionDenied],
    );
    recordAttack(
      "foreign-active-revision",
      "definition authority",
      "permission_denied",
    );

    await recordAvailable(worldA, tenantA, definition, "41");
    await recordAvailable(worldB, tenantB, definition, "97");
    await recordEvidence(worldB, {
      claimId: "claim.only-b",
      definition,
      entity: "inventory.item.only-b",
      sourceId: "source.only-b",
      tenantId: tenantB,
      value: "777",
    });
    const ownA = await queryAvailable(worldA, tenantA, definition, "strong");
    const ownB = await queryAvailable(worldB, tenantB, definition, "strong");
    assert.deepEqual(integerValues(ownA), ["41"]);
    assert.deepEqual(integerValues(ownB), ["97"]);
    recordAttack("colliding-semantic-ids", "Postgres authority", "isolated");
    await expectConnectCode(
      () => queryAvailable(worldA, tenantB, definition, "strong"),
      [Code.PermissionDenied],
    );
    recordAttack(
      "payload-tenant-substitution",
      "trusted OIDC context",
      "permission_denied",
    );
    const foreignEntity = await semanticQuery(worldA, {
      consistency: "strong",
      definition,
      entity: "inventory.item.only-b",
      tenantId: tenantA,
    });
    assert.equal(foreignEntity.values.length, 0);
    recordAttack("foreign-entity-and-claim", "semantic query", "not_found");

    const discovery = await actionA.discover({ definition, resourceId: entityId });
    assert.equal(discovery.trustedContext?.tenantId, tenantA);
    assert.equal(discovery.trustedContext?.principalId, "principal.agent-a");
    recordAttack("trusted-tenant-derivation", "OIDC claims", "tenant_scoped");
    await expectConnectCode(
      () => actionClient(tokens.platform).discover({ definition, resourceId: entityId }),
      [Code.Unauthenticated, Code.PermissionDenied],
    );
    recordAttack(
      "platform-role-not-tenant-principal",
      "OIDC admission",
      "fail_closed",
    );

    const bOnly = await commitAction(actionB, definition, {
      operationId: "operation.only-b",
      proposalId: "proposal.only-b",
      quantity: "2",
    });
    await expectConnectCode(
      () =>
        actionA.commit({
          operationId: "operation.only-b",
          proposalId: "proposal.only-b",
        }),
      [Code.NotFound],
    );
    recordAttack("foreign-proposal", "ActionService", "not_found");
    await expectConnectCode(
      () => actionA.getOperationStatus({ operationId: "operation.only-b" }),
      [Code.NotFound],
    );
    recordAttack("foreign-operation-status", "ActionService", "not_found");
    const bOnlyEffect = requiredEffectId(bOnly);
    await expectConnectCode(
      () => effectA.getEffect({ effectRequestId: bOnlyEffect }),
      [Code.NotFound],
    );
    recordAttack("foreign-effect-request", "EffectService", "not_found");
    await expectConnectCode(
      () =>
        historyA.explain({
          target: {
            target: { case: "operationId", value: "operation.only-b" },
          },
        }),
      [Code.NotFound],
    );
    recordAttack("foreign-explanation", "HistoryService", "not_found");

    const [collisionA, collisionB] = await Promise.all([
      commitAction(actionA, definition, {
        operationId: "operation.colliding",
        proposalId: "proposal.colliding",
        quantity: "2",
      }),
      commitAction(actionB, definition, {
        operationId: "operation.colliding",
        proposalId: "proposal.colliding",
        quantity: "2",
      }),
    ]);
    assert.equal(collisionA.status, CommitStatus.COMMITTED);
    assert.equal(collisionB.status, CommitStatus.COMMITTED);
    recordAttack(
      "colliding-action-proposal-operation",
      "ActionService",
      "isolated",
    );

    await waitFor(async () => {
      const rows = await observer.query<{ tenant_id: string }>(
        "SELECT tenant_id FROM effect_dispatches WHERE effect_request_id = $1 ORDER BY tenant_id",
        [requiredEffectId(collisionA)],
      );
      return rows.rows.length === 2 ? true : undefined;
    }, "tenant-scoped Restate effect dispatches");
    recordAttack(
      "colliding-effect-identities",
      "Restate effect orchestration",
      "isolated",
    );

    const ingested = await ingestCollidingKnowledge(tokens.agentA, tokens.agentB);
    await proveKnowledgeIsolation(tokens.agentA, tokens.agentB, ingested);
    await provePostgresDefenses(appA, appNoContext, observer);
    const projectionRows = await waitForProjection(
      worldA,
      worldB,
      definition,
      observer,
    );
    await proveObjectIsolation(tokens.agentA, ingested, projectionRows);
    await proveRestateSessionIsolation(
      tokens.agentA,
      bOnlyEffect,
      ingested.bSecret.source.sourceRevision,
    );
    proveCacheKeyIsolation(definition);
    await proveBrowserIsolation(tokens.webA, tokens.webB);
    await proveDataFusionFilter(worldA, definition, admin, projectionRows);
    await restartAndRebuild({
      definition,
      tokens,
      worldA,
      worldB,
    });

    const platformRows = await observer.query<{
      count: string;
      tenant_id: string;
    }>(
      "SELECT tenant_id, count(*)::text AS count FROM semantic_claims GROUP BY tenant_id ORDER BY tenant_id",
    );
    assert.deepEqual(
      platformRows.rows.map((row) => row.tenant_id),
      [tenantA, tenantB],
    );
    recordAttack(
      "explicit-platform-observability",
      "BYPASSRLS observer role",
      "isolated",
    );

    const postgresVersion = await admin.query<{ server_version: string }>(
      "SHOW server_version",
    );
    assert.match(postgresVersion.rows[0]?.server_version ?? "", /^18\./u);
    assert.equal(attacks.length >= 20, true);
    assert.equal(mutants.length, 7);
    assert.equal(new Set(mutants.map((mutant) => mutant.id)).size, 7);
    const deployment = await kubernetesDeployment("zoend");
    assert.ok(deployment.readyReplicas >= 2);

    const manifest = {
      artifacts: {
        chart: {
          digest: signedArtifacts.chartDigest,
          repository: signedArtifacts.chartRepository,
          version: signedArtifacts.chartVersion,
        },
        node: {
          digest: signedArtifacts.nodeDigest,
          repository: signedArtifacts.nodeRepository,
        },
        rust: {
          digest: signedArtifacts.rustDigest,
          repository: signedArtifacts.rustRepository,
        },
      },
      attacks,
      collisions: [
        "Action names",
        "external codes",
        "filenames",
        "labels",
        "object digests",
        "semantic IDs",
      ],
      components: {
        companyBrain: "PostgreSQL FTS and pgvector",
        dataFusion: "projection-backed SemanticQuery",
        kubernetes: "kind",
        objectStorage: "MinIO",
        oidc: "Keycloak",
        postgres: postgresVersion.rows[0]?.server_version,
        restate: "Restate",
        web: "Playwright against the deployed web client",
        zoendReadyReplicas: deployment.readyReplicas,
      },
      finishedAt: new Date().toISOString(),
      mutants,
      profile: "shared-saas",
      scenario: "shared-tenancy",
      sourceSha: signedArtifacts.sourceSha,
      startedAt,
      tenants: [redactedTenant(tenantA), redactedTenant(tenantB)],
      verdict: "PASS",
    };
    await mkdir(environment.ZOEN_E2E_ARTIFACTS_DIR, { recursive: true });
    await writeFile(
      path.join(environment.ZOEN_E2E_ARTIFACTS_DIR, "evidence.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  } finally {
    await Promise.allSettled([
      admin.end(),
      observer.end(),
      appA.end(),
      appNoContext.end(),
    ]);
  }
}

function recordAttack(
  id: string,
  boundary: string,
  outcome: AttackEvidence["outcome"],
): void {
  attacks.push({ boundary, id, outcome });
}

function recordMutant(
  id: MutantEvidence["id"],
  observation: string,
): void {
  mutants.push({ id, killed: true, observation });
}

async function publishAndActivate(
  client: DefinitionClient,
  tenantId: string,
  canonicalJson: string,
  digest: string,
): Promise<void> {
  const published = await client.publish({
    canonicalJson: new TextEncoder().encode(canonicalJson),
    digest,
    tenantId,
  });
  assert.equal(published.definitionRevision?.digest, digest);
  const activated = await client.activateRevision({
    activeRevisionPrecondition: {
      case: "expectNoActiveRevision",
      value: true,
    },
    definitionId,
    digest,
    tenantId,
  });
  assert.equal(activated.activation?.active?.digest, digest);
}

async function recordAvailable(
  client: WorldClient,
  tenantId: string,
  definition: DefinitionReference,
  value: string,
): Promise<void> {
  await recordEvidence(client, {
    claimId: "claim.colliding",
    definition,
    entity: entityId,
    sourceId: "source.colliding",
    tenantId,
    value,
  });
}

async function recordEvidence(
  client: WorldClient,
  input: {
    readonly claimId: string;
    readonly definition: DefinitionReference;
    readonly entity: string;
    readonly sourceId: string;
    readonly tenantId: string;
    readonly value: string;
  },
): Promise<void> {
  const response = await client.recordEvidence({
    claim: create(EvidenceClaimSchema, {
      claimId: input.claimId,
      definition: input.definition,
      entityId: input.entity,
      provenance: create(EvidenceProvenanceSchema, {
        sourceDigest: sha256(`${input.tenantId}:${input.sourceId}`),
        sourceId: input.sourceId,
        sourceRef: "urn:external:COLLISION-42",
      }),
      relationId,
      validTime: create(ValidTimeSchema, {
        value: { case: "instant", value: timestampFromDate(validAt) },
      }),
      value: integerValue(input.value),
    }),
    tenantId: input.tenantId,
  });
  assert.equal(response.claimId, input.claimId);
}

async function commitAction(
  client: ActionClient,
  definition: DefinitionReference,
  identity: {
    readonly operationId: string;
    readonly proposalId: string;
    readonly quantity: string;
  },
) {
  const proposed = await client.propose({
    actionId,
    definition,
    expiresAt: timestampFromDate(new Date(Date.now() + 300_000)),
    inputs: [
      create(ActionInputSchema, {
        inputId: "quantity",
        value: integerValue(identity.quantity),
      }),
    ],
    operationId: identity.operationId,
    proposalId: identity.proposalId,
    resourceId: entityId,
    validAt: timestampFromDate(validAt),
  });
  assert.equal(proposed.decision, PolicyDecision.PERMIT);
  assert.equal(proposed.proposal?.status, ProposalStatus.READY);
  const committed = await client.commit(identity);
  assert.equal(committed.status, CommitStatus.COMMITTED);
  assert.ok(committed.receipt);
  return committed;
}

function requiredEffectId(
  committed: Awaited<ReturnType<typeof commitAction>>,
): string {
  const effectRequestId = committed.receipt?.effectRequestIds[0];
  assert.ok(effectRequestId);
  return effectRequestId;
}

async function ingestCollidingKnowledge(tokenA: string, tokenB: string) {
  const sharedSource = {
    filename: "shared-policy.txt",
    kind: "message" as const,
    message: {
      channel: "operations",
      messageId: "message.colliding",
      sender: "operations@example.test",
      sentAt: "2026-08-21T08:00:00.000Z",
      subject: "Shared inventory label",
      text: "External code COLLISION-42 uses the Shared inventory label.",
    },
    sourceId: "source.colliding",
  };
  const commandA = companyBrainIngestCommandSchema.parse({
    ingestId: "ingest.colliding",
    source: sharedSource,
    tenantId: tenantA,
  });
  const commandB = companyBrainIngestCommandSchema.parse({
    ingestId: "ingest.colliding",
    source: sharedSource,
    tenantId: tenantB,
  });
  const [aShared, bShared] = await Promise.all([
    invokeIngest("ZoenCompanyIngestA", commandA),
    invokeIngest("ZoenCompanyIngestB", commandB),
  ]);
  assert.equal(aShared.source.contentDigest, bShared.source.contentDigest);
  assert.notEqual(aShared.source.objectKey, bShared.source.objectKey);
  recordAttack(
    "colliding-filename-label-external-code-digest",
    "Company Brain storage",
    "isolated",
  );

  const aSecret = await invokeIngest(
    "ZoenCompanyIngestA",
    companyBrainIngestCommandSchema.parse({
      ingestId: "ingest.secret",
      source: {
        ...sharedSource,
        message: {
          ...sharedSource.message,
          messageId: "message.secret",
          text: "Tenant acquisition code is BLUE-COMET.",
        },
        sourceId: "source.secret",
      },
      tenantId: tenantA,
    }),
  );
  const bSecret = await invokeIngest(
    "ZoenCompanyIngestB",
    companyBrainIngestCommandSchema.parse({
      ingestId: "ingest.secret",
      source: {
        ...sharedSource,
        message: {
          ...sharedSource.message,
          messageId: "message.secret",
          text: "Tenant acquisition code is ORANGE-NEBULA.",
        },
        sourceId: "source.secret",
      },
      tenantId: tenantB,
    }),
  );
  assert.equal(aSecret.source.sourceId, bSecret.source.sourceId);
  assert.notEqual(aSecret.source.contentDigest, bSecret.source.contentDigest);
  await Promise.all([
    harnessPost(harnessA, "/retrieve", tokenA, { query: "acquisition code" }),
    harnessPost(harnessB, "/retrieve", tokenB, { query: "acquisition code" }),
  ]);
  return { aSecret, aShared, bSecret, bShared };
}

async function proveKnowledgeIsolation(
  tokenA: string,
  tokenB: string,
  ingested: Awaited<ReturnType<typeof ingestCollidingKnowledge>>,
): Promise<void> {
  const [answerA, answerB] = await Promise.all([
    retrieve(harnessA, tokenA, "acquisition code"),
    retrieve(harnessB, tokenB, "acquisition code"),
  ]);
  assert.ok(answerA.results.some((result) => result.text.includes("BLUE-COMET")));
  assert.ok(answerB.results.some((result) => result.text.includes("ORANGE-NEBULA")));
  assert.equal(
    answerA.results.some((result) => result.text.includes("ORANGE-NEBULA")),
    false,
  );
  assert.equal(
    answerB.results.some((result) => result.text.includes("BLUE-COMET")),
    false,
  );
  assert.ok(
    answerA.results.some(
      (result) => result.lexicalRank !== null || result.vectorRank !== null,
    ),
  );
  recordAttack("company-brain-fts-pgvector", "knowledge retrieval", "isolated");

  const guessed = await harnessPost(
    harnessA,
    "/source",
    tokenA,
    {
      sourceId: ingested.bSecret.source.sourceId,
      sourceRevision: ingested.bSecret.source.sourceRevision,
    },
    [404],
  );
  assert.equal(guessed.status, 404);
  const wrongHarness = await harnessPost(
    harnessB,
    "/source",
    tokenA,
    {
      sourceId: ingested.bSecret.source.sourceId,
      sourceRevision: ingested.bSecret.source.sourceRevision,
    },
    [404],
  );
  assert.equal(wrongHarness.status, 404);
  recordAttack("object-key-guess-through-api", "harness source API", "not_found");
}

async function provePostgresDefenses(
  appA: PostgresClient,
  appNoContext: PostgresClient,
  observer: PostgresClient,
): Promise<void> {
  const missingPredicate = await appA.query<{
    tenant_id: string;
    value_text: string;
  }>("SELECT tenant_id, value_text FROM semantic_claims ORDER BY tenant_id, claim_id");
  assert.ok(missingPredicate.rows.length > 0);
  assert.ok(missingPredicate.rows.every((row) => row.tenant_id === tenantA));
  recordMutant(
    "missing-postgres-tenant-predicate",
    "RLS restricted an application query with no tenant WHERE clause",
  );
  const missingContext = await appNoContext.query<{ tenant_id: string }>(
    "SELECT tenant_id FROM semantic_claims",
  );
  assert.equal(missingContext.rows.length, 0);
  recordMutant(
    "missing-rls-context",
    "FORCE RLS returned no rows without zoen.tenant_id",
  );

  const fts = await appA.query<{ tenant_id: string }>(
    `SELECT tenant_id
       FROM company_fragments
      WHERE search_vector @@ websearch_to_tsquery('english', 'inventory label')`,
  );
  const vector = await appA.query<{ tenant_id: string }>(
    `SELECT tenant_id
       FROM company_fragments
      ORDER BY embedding <=> (
        SELECT embedding FROM company_fragments ORDER BY fragment_id LIMIT 1
      )
      LIMIT 20`,
  );
  assert.ok(fts.rows.length > 0);
  assert.ok(fts.rows.every((row) => row.tenant_id === tenantA));
  assert.ok(vector.rows.length > 0);
  assert.ok(vector.rows.every((row) => row.tenant_id === tenantA));
  const visible = await observer.query<{ tenant_id: string }>(
    "SELECT DISTINCT tenant_id FROM company_fragments ORDER BY tenant_id",
  );
  assert.deepEqual(
    visible.rows.map((row) => row.tenant_id),
    [tenantA, tenantB],
  );
  recordMutant(
    "vector-fts-filter-omission",
    "RLS confined predicate-free FTS and pgvector queries to the trusted tenant",
  );
  recordAttack("crafted-database-path", "Postgres FORCE RLS", "isolated");
}

async function waitForProjection(
  worldA: WorldClient,
  worldB: WorldClient,
  definition: DefinitionReference,
  observer: PostgresClient,
): Promise<readonly ProjectionRow[]> {
  await waitFor(async () => {
    try {
      const [a, b] = await Promise.all([
        queryAvailable(worldA, tenantA, definition, "eventual"),
        queryAvailable(worldB, tenantB, definition, "eventual"),
      ]);
      return integerValues(a).includes("41") && integerValues(b).includes("97")
        ? true
        : undefined;
    } catch {
      return undefined;
    }
  }, "tenant projections");
  const projections = await observer.query<ProjectionRow>(
    `SELECT tenant_id, manifest_digest, manifest_object_key,
            parquet_digest, parquet_object_key, through_commit::text
       FROM projection_manifests
      WHERE tenant_id IN ($1, $2)
      ORDER BY tenant_id, created_at DESC`,
    [tenantA, tenantB],
  );
  const latest = [tenantA, tenantB].map((tenantId) => {
    const row = projections.rows.find((candidate) => candidate.tenant_id === tenantId);
    assert.ok(row);
    return row;
  });
  assert.ok(
    latest.every((row) =>
      row.manifest_object_key.includes(`/${row.tenant_id}/manifests/`),
    ),
  );
  recordMutant(
    "projection-manifest-path-omission",
    "every published manifest path contains the owning tenant",
  );
  recordAttack(
    "datafusion-parquet-results",
    "projection-backed SemanticQuery",
    "isolated",
  );
  return latest;
}

async function proveObjectIsolation(
  tokenA: string,
  ingested: Awaited<ReturnType<typeof ingestCollidingKnowledge>>,
  projections: readonly ProjectionRow[],
): Promise<void> {
  const s3 = s3Client();
  const objects = await s3.send(
    new ListObjectsV2Command({ Bucket: "zoen-company-brain" }),
  );
  const keys = objects.Contents?.flatMap((object) =>
    object.Key === undefined ? [] : [object.Key],
  ) ?? [];
  assert.ok(keys.some((key) => key.startsWith(`company-brain/${tenantA}/`)));
  assert.ok(keys.some((key) => key.startsWith(`company-brain/${tenantB}/`)));
  assert.equal(
    keys.some((key) => /^company-brain\/[0-9a-f]{64}$/u.test(key)),
    false,
  );
  await assert.rejects(
    s3.send(
      new HeadObjectCommand({
        Bucket: "zoen-company-brain",
        Key: `company-brain/${ingested.aShared.source.contentDigest}`,
      }),
    ),
  );
  const own = await s3.send(
    new GetObjectCommand({
      Bucket: "zoen-company-brain",
      Key: ingested.aShared.source.objectKey,
    }),
  );
  assert.ok(own.Body);
  assert.ok(projections[0]?.parquet_object_key.includes(`/${tenantA}/`));
  assert.ok(projections[1]?.parquet_object_key.includes(`/${tenantB}/`));
  const source = await harnessPost(harnessA, "/source", tokenA, {
    sourceId: ingested.aShared.source.sourceId,
    sourceRevision: ingested.aShared.source.sourceRevision,
  });
  assert.equal(source.status, 200);
  recordAttack("shared-object-storage-prefixes", "MinIO", "isolated");
}

async function proveRestateSessionIsolation(
  tokenA: string,
  foreignOperationEffect: string,
  foreignSourceRevision: string,
): Promise<void> {
  const command = agentSessionCommandSchema.parse({
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
    operationId: "operation.agent-isolation",
    proposalId: "proposal.agent-isolation",
    sessionId: "session.colliding",
    task: {
      instruction: "Request data from another tenant.",
      modelCapability: "reasoning-fast",
      taskId: "task.agent-isolation",
    },
  });
  const normal = await invokeSession(
    "ZoenAgentSessionA",
    agentSessionObjectKey(tenantA, command.sessionId),
    command,
  );
  assert.equal(normal.ok, true);
  const normalBody: unknown = await normal.json();
  assert.equal(agentSessionResultSchema.parse(normalBody).kind, "provider_unavailable");
  const tenantless = await invokeSession(
    "ZoenAgentSessionA",
    command.sessionId,
    command,
  );
  assert.equal(tenantless.ok, false);
  const crossService = await invokeSession(
    "ZoenAgentSessionB",
    agentSessionObjectKey(tenantA, command.sessionId),
    command,
  );
  assert.equal(crossService.ok, false);
  recordMutant(
    "restate-key-omission",
    "tenantless and cross-service Restate session keys terminated",
  );
  recordAttack("restate-session-identity", "Restate virtual object", "fail_closed");

  const contextual = agentSessionCommandSchema.parse({
    ...command,
    context: {
      explainOperationId: "operation.only-b",
      knowledgeQuery: `foreign source ${foreignSourceRevision}`,
    },
    sessionId: "session.foreign-context",
    task: {
      ...command.task,
      taskId: "task.foreign-context",
    },
  });
  const contextResponse = await invokeSession(
    "ZoenAgentSessionA",
    agentSessionObjectKey(tenantA, contextual.sessionId),
    contextual,
  );
  assert.equal(contextResponse.ok, true);
  const contextBody: unknown = await contextResponse.json();
  assert.equal(agentSessionResultSchema.parse(contextBody).kind, "context_error");
  recordAttack(
    "agent-foreign-prompt-and-tool-arguments",
    "tenant ActionService and Brain context",
    "fail_closed",
  );

  const wrongEffect = await fetch(
    `${restateIngress}/ZoenEffect/${encodeURIComponent(
      foreignOperationEffect,
    )}/execute`,
    {
      body: JSON.stringify({
        dispatchVersion: 1,
        effectRequestId: foreignOperationEffect,
        tenantId: tenantB,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
  );
  assert.equal(wrongEffect.ok, false);
  recordAttack("restate-effect-key-guess", "Restate effect object", "fail_closed");
}

function proveCacheKeyIsolation(definition: DefinitionReference): void {
  const query = {
    definition: {
      definitionId: definition.definitionId,
      digest: definition.digest,
      revision: definition.revision.toString(),
    },
    entityId,
    kind: "relation" as const,
    relationId,
  };
  const a = semanticQueryCacheKey({
    commitSequence: "7",
    query,
    tenantId: tenantA,
  });
  const b = semanticQueryCacheKey({
    commitSequence: "7",
    query,
    tenantId: tenantB,
  });
  assert.notDeepEqual(a, b);
  const unsafeA = a.filter((_, index) => index !== 1);
  const unsafeB = b.filter((_, index) => index !== 1);
  assert.deepEqual(unsafeA, unsafeB);
  recordMutant(
    "cache-key-omission",
    "removing the tenant makes colliding semantic query keys equal",
  );
  recordAttack("server-query-cache-key", "semantic query cache", "tenant_scoped");
}

async function proveBrowserIsolation(tokenA: string, tokenB: string): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(webUrl);
    await page.evaluate((token) => {
      sessionStorage.setItem("zoen.web.access-token.v1", token);
    }, tokenA);
    await page.reload();
    await page.locator("main.app-shell").waitFor({ timeout: 120_000 });
    const tenantAText = await page.locator("body").innerText();
    assert.match(tenantAText, /\b41\b/u);
    assert.doesNotMatch(tenantAText, /\b97\b/u);

    await page.evaluate((token) => {
      sessionStorage.clear();
      sessionStorage.setItem("zoen.web.access-token.v1", token);
    }, tokenB);
    await page.reload();
    await page.locator("main.app-shell").waitFor({ timeout: 120_000 });
    const tenantBText = await page.locator("body").innerText();
    assert.match(tenantBText, /\b97\b/u);
    assert.doesNotMatch(tenantBText, /\b41\b/u);
    recordAttack(
      "browser-session-rotation",
      "deployed web client",
      "isolated",
    );
  } finally {
    await browser.close();
  }
}

async function proveDataFusionFilter(
  worldA: WorldClient,
  definition: DefinitionReference,
  admin: PostgresClient,
  projections: readonly ProjectionRow[],
): Promise<void> {
  const a = projections.find((row) => row.tenant_id === tenantA);
  const b = projections.find((row) => row.tenant_id === tenantB);
  assert.ok(a);
  assert.ok(b);
  const mutantDigest = sha256(`datafusion-mutant:${b.parquet_digest}`);
  await admin.query(
    `INSERT INTO projection_manifests (
       tenant_id, projection_id, manifest_digest, build_id, from_commit,
       through_commit, manifest_object_key, parquet_object_key, parquet_digest
     ) VALUES ($1, 'semantic_claims_v1', $2, $3, 1, $4, $5, $6, $7)`,
    [
      tenantA,
      mutantDigest,
      `mutant-${mutantDigest.slice(0, 12)}`,
      a.through_commit,
      `projections/semantic_claims_v1/manifests/${mutantDigest}.json`,
      b.parquet_object_key,
      b.parquet_digest,
    ],
  );
  await admin.query(
    `UPDATE projection_watermarks
        SET manifest_digest = $2, updated_at = clock_timestamp()
      WHERE tenant_id = $1 AND projection_id = 'semantic_claims_v1'`,
    [tenantA, mutantDigest],
  );
  try {
    const result = await queryAvailable(worldA, tenantA, definition, "eventual");
    assert.equal(result.values.length, 0);
  } finally {
    await admin.query(
      `UPDATE projection_watermarks
          SET manifest_digest = $2, updated_at = clock_timestamp()
        WHERE tenant_id = $1 AND projection_id = 'semantic_claims_v1'`,
      [tenantA, a.manifest_digest],
    );
  }
  const restored = await queryAvailable(worldA, tenantA, definition, "eventual");
  assert.deepEqual(integerValues(restored), ["41"]);
  recordMutant(
    "datafusion-source-filter-omission",
    "a tenant A watermark aimed at tenant B Parquet and returned no tenant B rows",
  );
}

async function restartAndRebuild(input: {
  readonly definition: DefinitionReference;
  readonly tokens: {
    readonly agentA: string;
    readonly agentB: string;
    readonly webA: string;
    readonly webB: string;
  };
  readonly worldA: WorldClient;
  readonly worldB: WorldClient;
}): Promise<void> {
  await kubectl([
    "rollout",
    "restart",
    "deployment/zoend",
    "deployment/harness-tenant-a",
    "deployment/harness-tenant-b",
    "deployment/zoen-projection",
    "deployment/restate",
    "deployment/web",
    "deployment/zoen-effect-worker",
    "deployment/zoen-effect-dispatcher-tenant-a",
    "deployment/zoen-effect-dispatcher-tenant-b",
  ]);
  for (const deployment of [
    "zoend",
    "harness-tenant-a",
    "harness-tenant-b",
    "zoen-projection",
    "restate",
    "web",
    "zoen-effect-worker",
    "zoen-effect-dispatcher-tenant-a",
    "zoen-effect-dispatcher-tenant-b",
  ]) {
    await kubectl([
      "rollout",
      "status",
      `deployment/${deployment}`,
      "--timeout=5m",
    ]);
  }
  await registerRestateServices();
  await kubectl([
    "exec",
    "deployment/zoen-projection",
    "--",
    "/usr/local/bin/zoen-projection",
    "--rebuild",
    tenantA,
  ]);
  await kubectl([
    "exec",
    "deployment/zoen-projection",
    "--",
    "/usr/local/bin/zoen-projection",
    "--rebuild",
    tenantB,
  ]);
  await Promise.all([
    harnessPost(harnessA, "/rebuild-indexes", input.tokens.agentA, {}),
    harnessPost(harnessB, "/rebuild-indexes", input.tokens.agentB, {}),
  ]);
  const [a, b] = await Promise.all([
    queryAvailable(input.worldA, tenantA, input.definition, "eventual"),
    queryAvailable(input.worldB, tenantB, input.definition, "eventual"),
  ]);
  assert.deepEqual(integerValues(a), ["41"]);
  assert.deepEqual(integerValues(b), ["97"]);
  const [knowledgeA, knowledgeB] = await Promise.all([
    retrieve(harnessA, input.tokens.agentA, "acquisition code"),
    retrieve(harnessB, input.tokens.agentB, "acquisition code"),
  ]);
  assert.equal(
    knowledgeA.results.some((result) => result.text.includes("ORANGE-NEBULA")),
    false,
  );
  assert.equal(
    knowledgeB.results.some((result) => result.text.includes("BLUE-COMET")),
    false,
  );
  await proveBrowserIsolation(input.tokens.webA, input.tokens.webB);
  recordAttack(
    "restart-session-projection-index",
    "shared application stack",
    "isolated",
  );
}

async function registerRestateServices(): Promise<void> {
  for (const uri of [
    "http://harness-tenant-a:9080",
    "http://harness-tenant-b:9080",
    "http://zoen-effect-worker:9081",
  ]) {
    await waitFor(async () => {
      try {
        const response = await fetch(`${restateAdmin}/deployments`, {
          body: JSON.stringify({ uri }),
          headers: { "content-type": "application/json" },
          method: "POST",
        });
        if (response.ok || response.status === 409) {
          return true;
        }
        return undefined;
      } catch {
        return undefined;
      }
    }, `Restate deployment ${uri}`);
  }
}

async function invokeIngest(
  serviceName: string,
  command: CompanyBrainIngestCommand,
) {
  const response = await fetch(
    `${restateIngress}/${serviceName}/${encodeURIComponent(
      companyBrainIngestObjectKey(command),
    )}/run`,
    {
      body: JSON.stringify(command),
      headers: {
        "content-type": "application/json",
        [companyBrainIngestSignatureHeader]: signCompanyBrainIngestCommand(
          bindingKey,
          command,
        ),
      },
      method: "POST",
      signal: AbortSignal.timeout(600_000),
    },
  );
  const body: unknown = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  return ingestResultSchema.parse(body);
}

function invokeSession(
  serviceName: string,
  objectKey: string,
  command: AgentSessionCommand,
): Promise<Response> {
  return fetch(
    `${restateIngress}/${serviceName}/${encodeURIComponent(objectKey)}/run`,
    {
      body: JSON.stringify(command),
      headers: {
        "content-type": "application/json",
        [agentSessionSignatureHeader]: signAgentSessionCommand(
          bindingKey,
          command,
        ),
      },
      method: "POST",
      signal: AbortSignal.timeout(300_000),
    },
  );
}

async function retrieve(
  base: string,
  token: string,
  query: string,
) {
  const response = await harnessPost(base, "/retrieve", token, { query });
  const body: unknown = await response.json();
  return knowledgeSchema.parse(body);
}

async function harnessPost(
  base: string,
  route: string,
  token: string,
  body: unknown,
  expectedStatuses: readonly number[] = [200],
): Promise<Response> {
  const response = await fetch(`${base}${route}`, {
    body: JSON.stringify(body),
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
  assert.ok(
    expectedStatuses.includes(response.status),
    `${route} returned HTTP ${response.status}: ${await response.clone().text()}`,
  );
  return response;
}

function queryAvailable(
  client: WorldClient,
  tenantId: string,
  definition: DefinitionReference,
  consistency: "eventual" | "strong",
) {
  return semanticQuery(client, {
    consistency,
    definition,
    entity: entityId,
    tenantId,
  });
}

function semanticQuery(
  client: WorldClient,
  input: {
    readonly consistency: "eventual" | "strong";
    readonly definition: DefinitionReference;
    readonly entity: string;
    readonly tenantId: string;
  },
) {
  return client.semanticQuery({
    consistency: create(QueryConsistencySchema, {
      value:
        input.consistency === "strong"
          ? { case: "strong", value: create(StrongConsistencySchema) }
          : { case: "eventual", value: create(EventualConsistencySchema) },
    }),
    definition: input.definition,
    entityId: input.entity,
    selection: create(QuerySelectionSchema, {
      value: { case: "relationId", value: relationId },
    }),
    tenantId: input.tenantId,
    validAt: timestampFromDate(validAt),
  });
}

function integerValues(
  response: Awaited<ReturnType<typeof semanticQuery>>,
): string[] {
  return response.values.map((result) => {
    assert.equal(result.value?.value.case, "integerValue");
    return String(result.value.value.value);
  });
}

function integerValue(value: string) {
  return create(ExactValueSchema, {
    value: { case: "integerValue", value },
  });
}

function definitionClient(token: string): DefinitionClient {
  return createClient(DefinitionService, transport(token));
}

function actionClient(token: string): ActionClient {
  return createClient(ActionService, transport(token));
}

function worldClient(token: string): WorldClient {
  return createClient(WorldService, transport(token));
}

function transport(token: string) {
  const authorization: Interceptor = (next) => async (request) => {
    request.header.set("authorization", `Bearer ${token}`);
    return next(request);
  };
  return createConnectTransport({
    baseUrl,
    httpVersion: "1.1",
    interceptors: [authorization],
  });
}

async function clientToken(clientId: string): Promise<string> {
  return oidcToken(
    new URLSearchParams({
      client_id: clientId,
      client_secret: `${clientId}-secret`,
      grant_type: "client_credentials",
    }),
  );
}

async function passwordToken(username: string): Promise<string> {
  return oidcToken(
    new URLSearchParams({
      client_id: "zoen-web",
      grant_type: "password",
      password: "web-password",
      username,
    }),
  );
}

async function oidcToken(parameters: URLSearchParams): Promise<string> {
  const response = await fetch(`${oidcIssuer}/protocol/openid-connect/token`, {
    body: parameters,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    method: "POST",
  });
  const body: unknown = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  return tokenResponseSchema.parse(body).access_token;
}

async function expectConnectCode(
  action: () => Promise<unknown>,
  expected: readonly Code[],
): Promise<Code> {
  try {
    await action();
    assert.fail(`expected Connect error ${expected.map((code) => Code[code]).join(", ")}`);
  } catch (error: unknown) {
    if (!(error instanceof ConnectError)) {
      throw error;
    }
    assert.ok(expected.includes(error.code), error.message);
    return error.code;
  }
}

async function waitFor<T>(
  probe: () => Promise<T | undefined>,
  description: string,
): Promise<T> {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    const value = await probe();
    if (value !== undefined) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`timed out waiting for ${description}`);
}

async function kubernetesDeployment(name: string) {
  const output = await kubectl([
    "get",
    "deployment",
    name,
    "--output",
    "json",
  ]);
  return z
    .object({
      status: z
        .object({ readyReplicas: z.number().int().nonnegative().default(0) })
        .passthrough(),
    })
    .passthrough()
    .transform((value) => ({ readyReplicas: value.status.readyReplicas }))
    .parse(JSON.parse(output));
}

async function kubectl(arguments_: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "kubectl",
      [...arguments_],
      { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error !== null) {
          reject(new Error(`${stdout}${stderr}`, { cause: error }));
          return;
        }
        resolve(stdout.trim());
      },
    );
  });
}

function s3Client(): S3Client {
  return new S3Client({
    credentials: {
      accessKeyId: "zoen-access",
      secretAccessKey: "zoen-secret",
    },
    endpoint: minioEndpoint,
    forcePathStyle: true,
    region: "us-east-1",
  });
}

function postgresUrl(user: string, password: string): string {
  return `postgres://${user}:${password}@127.0.0.1:${environment.ZOEN_E2E_POSTGRES_PORT}/zoen`;
}

function httpUrl(
  port: number,
  suffix = "",
  hostname = "127.0.0.1",
): string {
  return `http://${hostname}:${port}${suffix}`;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function redactedTenant(tenantId: string): string {
  return `tenant:${sha256(tenantId).slice(0, 12)}`;
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
