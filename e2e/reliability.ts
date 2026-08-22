import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { Code, type Client } from "@connectrpc/connect";
import { Client as PostgresClient } from "pg";
import { z } from "zod";
import {
  CommitStatus,
  PolicyDecision,
  ProposalStatus,
} from "../packages/sdk/src/gen/zoen/action/v1/action_pb.js";
import { EffectKnowledgeState } from "../packages/sdk/src/gen/zoen/effect/v1/effect_pb.js";
import {
  type CausalExplanation,
  HistoryService,
} from "../packages/sdk/src/gen/zoen/history/v1/history_pb.js";
import {
  QueryConsistencySchema,
  QuerySelectionSchema,
  StrongConsistencySchema,
  type DefinitionReference,
} from "../packages/sdk/src/gen/zoen/world/v1/world_pb.js";
import {
  actionClient,
  activateDefinition,
  definitionClient,
  expectConnectCode,
  loadFixture,
  minutesFromNow,
  oidcToken,
  propose,
  publishDefinition,
  recordAvailable,
  resourceId,
  tenantA,
  worldClient,
} from "./governed-action/support.js";
import {
  effectClient,
  restateAdmin,
  type EffectClient,
  type WorldClient,
} from "./effects/support.js";
import { historyClient } from "./explain/support.js";

const environment = z
  .object({
    ZOEN_E2E_ARTIFACTS_DIR: z.string().min(1),
    ZOEN_E2E_KEYCLOAK_PORT: z.coerce.number().int().positive(),
    ZOEN_E2E_POSTGRES_PORT: z.coerce.number().int().positive(),
    ZOEN_RELIABILITY_NAMESPACE: z.string().min(1),
  })
  .parse(process.env);

const mode = z
  .enum([
    "seed",
    "observe",
    "canary",
    "digest",
    "verify",
    "verify-rolling",
    "login",
    "propose",
    "commit",
  ])
  .parse(process.argv[2]);
const expectedPath = process.argv[3];
const fixture = await loadFixture("direct", 1);
const operationId = "operation.reliability";
const proposalId = "proposal.reliability";
const relationId = "inventory.available";
const validAt = new Date("2026-08-19T00:00:00.000Z");
const artifacts = environment.ZOEN_E2E_ARTIFACTS_DIR;
const statePath = path.join(artifacts, "semantic-state.json");
const digestPath = path.join(artifacts, "authority-digest.json");
const canaryPath = path.join(artifacts, "canaries.jsonl");

const semanticStateSchema = z
  .object({
    authorityDigest: z.string().regex(/^[0-9a-f]{64}$/u),
    commitSequence: z.number().int().nonnegative(),
    companySourceCount: z.number().int().nonnegative(),
    definitionDigest: z.string().regex(/^[0-9a-f]{64}$/u),
    definitionHistoryCount: z.number().int().positive(),
    effectRequestId: z.string().min(1),
    effectState: z.number().int(),
    explanationComplete: z.boolean(),
    operationId: z.string().min(1),
    proposalId: z.string().min(1),
    queryValues: z.array(z.string()),
    semanticDigest: z.string().regex(/^[0-9a-f]{64}$/u),
    tenantDerived: z.boolean(),
  })
  .strict();

if (mode === "digest") {
  const digest = await authoritySnapshot();
  await writeFile(digestPath, `${JSON.stringify(digest, null, 2)}\n`);
  process.stdout.write(`${digest.authorityDigest}\n`);
  process.exit(0);
}

if (mode === "login") {
  const response = await fetch(
    `http://127.0.0.1:${environment.ZOEN_E2E_KEYCLOAK_PORT}/realms/zoen/protocol/openid-connect/token`,
    {
      body: new URLSearchParams({
        client_id: "agent-a",
        client_secret: "agent-a-secret",
        grant_type: "client_credentials",
      }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
      signal: AbortSignal.timeout(5_000),
    },
  );
  assert.equal(response.ok, true, await response.text());
  process.stdout.write("login-ok\n");
  process.exit(0);
}

const agentToken =
  process.env.ZOEN_E2E_ACCESS_TOKEN ?? (await oidcToken("agent-a"));
const action = actionClient(agentToken);
const world = worldClient(agentToken);
const effect = effectClient(agentToken);
const history = historyClient(agentToken);

if (mode === "canary") {
  const committedAt = new Date().toISOString();
  const claimId = `claim.canary.${Date.now()}`;
  await recordAvailable(world, {
    claimId,
    fixture,
    resource: resourceId,
    tenantId: tenantA,
    value: "10",
  });
  await appendFile(
    canaryPath,
    `${JSON.stringify({ claimId, committedAt })}\n`,
  );
  process.stdout.write(`${JSON.stringify({ claimId, committedAt })}\n`);
  process.exit(0);
}

if (mode === "propose" || mode === "commit") {
  const targetOperationId = process.argv[3] ?? operationId;
  const targetProposalId = process.argv[4] ?? proposalId;
  if (mode === "propose") {
    const proposed = await propose(action, {
      expiresAt: minutesFromNow(5),
      fixture,
      operationId: targetOperationId,
      proposalId: targetProposalId,
      quantity: "1",
    });
    assert.equal(proposed.decision, PolicyDecision.PERMIT);
    assert.equal(proposed.proposal?.status, ProposalStatus.READY);
  } else {
    const committed = await action.commit({
      operationId: targetOperationId,
      proposalId: targetProposalId,
    });
    assert.equal(committed.status, CommitStatus.COMMITTED);
  }
  process.stdout.write(`${targetOperationId}\n`);
  process.exit(0);
}

if (mode === "seed") {
  const definition = definitionClient(agentToken);
  const definitionAdmin = definitionClient(await oidcToken("admin-a"));
  await publishDefinition(definition, tenantA, fixture);
  await activateDefinition(definitionAdmin, tenantA, fixture);
  await registerRestateServices(environment.ZOEN_RELIABILITY_NAMESPACE);
  await recordAvailable(world, {
    claimId: "claim.reliability.available",
    fixture,
    resource: resourceId,
    tenantId: tenantA,
    value: "10",
  });
  const proposed = await propose(action, {
    expiresAt: minutesFromNow(5),
    fixture,
    operationId,
    proposalId,
    quantity: "2",
  });
  assert.equal(proposed.decision, PolicyDecision.PERMIT);
  assert.equal(proposed.proposal?.status, ProposalStatus.READY);
  const committed = await action.commit({ operationId, proposalId });
  assert.equal(committed.status, CommitStatus.COMMITTED);
  assert.ok(committed.receipt);
  await insertCompanySource();
}

if (
  mode === "observe" ||
  mode === "verify" ||
  mode === "verify-rolling" ||
  mode === "seed"
) {
  await registerRestateServices(environment.ZOEN_RELIABILITY_NAMESPACE);
  const observed = await observeState({ effect, history, world });
  if (mode === "verify" || mode === "verify-rolling") {
    const expected = semanticStateSchema.parse(
      JSON.parse(await readFile(requiredExpectedPath(), "utf8")),
    );
    if (mode === "verify") {
      assert.deepEqual(observed, expected);
    } else {
      await assertRollingCompatible(observed, expected);
    }
  }
  await writeFile(statePath, `${JSON.stringify(observed, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(observed, null, 2)}\n`);
}

async function assertRollingCompatible(
  observed: z.infer<typeof semanticStateSchema>,
  expected: z.infer<typeof semanticStateSchema>,
): Promise<void> {
  assert.equal(observed.definitionDigest, expected.definitionDigest);
  assert.equal(observed.definitionHistoryCount, expected.definitionHistoryCount);
  assert.equal(observed.operationId, expected.operationId);
  assert.equal(observed.proposalId, expected.proposalId);
  assert.deepEqual(observed.queryValues, expected.queryValues);
  assert.equal(observed.tenantDerived, expected.tenantDerived);
  assert.equal(observed.explanationComplete, expected.explanationComplete);
  assert.equal(observed.companySourceCount, expected.companySourceCount);
  assert.equal(observed.effectRequestId, expected.effectRequestId);
  const client = new PostgresClient({
    connectionString: `postgres://postgres:postgres@127.0.0.1:${environment.ZOEN_E2E_POSTGRES_PORT}/zoen`,
  });
  await client.connect();
  try {
    const operations = await client.query<{ count: string; operations: string }>(
      `SELECT count(*)::text AS count,
              count(DISTINCT operation_id)::text AS operations
         FROM action_operations
        WHERE tenant_id = $1`,
      [tenantA],
    );
    assert.equal(Number(operations.rows[0]?.operations ?? "0"), 1);
    assert.equal(Number(operations.rows[0]?.count ?? "0"), 1);
  } finally {
    await client.end();
  }
}

async function observeState(input: {
  readonly effect: EffectClient;
  readonly history: Client<typeof HistoryService>;
  readonly world: WorldClient;
}) {
  const status = await action.getOperationStatus({ operationId });
  assert.equal(status.status, CommitStatus.COMMITTED);
  assert.equal(status.receipt?.proposalId, proposalId);
  const effectRequestId = status.receipt?.effectRequestIds[0];
  assert.ok(effectRequestId);
  const effectSnapshot = await waitForEffect(input.effect, effectRequestId);
  const queryResult = await queryAvailable(input.world, fixture.definition);
  const queryValues = queryResult.values.map((result) => {
    assert.equal(result.value?.value.case, "integerValue");
    return String(result.value.value.value);
  });
  assert.deepEqual(queryValues, ["10"]);
  const discovery = await action.discover({
    definition: fixture.definition,
    resourceId,
  });
  assert.equal(discovery.trustedContext?.tenantId, tenantA);
  await expectConnectCode(
    () => queryAvailable(input.world, fixture.definition, "tenant.b"),
    Code.PermissionDenied,
  );
  const explanation = await explainOperation(input.history);
  assert.equal(explanation.complete, true);
  const snapshot = await authoritySnapshot();
  const semanticResult = {
    commitSequence: snapshot.commitSequence,
    companySourceCount: snapshot.companySourceCount,
    definitionDigest: fixture.digest,
    definitionHistoryCount: snapshot.definitionHistoryCount,
    effectRequestId,
    effectState: comparableEffectState(
      effectSnapshot.snapshot?.request?.state ??
        EffectKnowledgeState.UNSPECIFIED,
    ),
    explanationComplete: explanation.complete,
    operationId,
    proposalId,
    queryValues,
    tenantDerived: discovery.trustedContext?.tenantId === tenantA,
  };
  return semanticStateSchema.parse({
    ...semanticResult,
    authorityDigest: snapshot.authorityDigest,
    semanticDigest: sha256(JSON.stringify(semanticResult)),
  });
}

function comparableEffectState(
  state: EffectKnowledgeState,
): EffectKnowledgeState {
  switch (state) {
    case EffectKnowledgeState.UNSPECIFIED:
    case EffectKnowledgeState.NOT_ATTEMPTED:
    case EffectKnowledgeState.DEFINITELY_NOT_SENT:
    case EffectKnowledgeState.UNKNOWN:
    case EffectKnowledgeState.ACCEPTED_PENDING:
      return EffectKnowledgeState.UNKNOWN;
    case EffectKnowledgeState.CONFIRMED:
    case EffectKnowledgeState.CONFIRMED_NO_EFFECT:
    case EffectKnowledgeState.CONTRADICTED:
      return state;
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

async function waitForEffect(client: EffectClient, effectRequestId: string) {
  const attempts = Number(process.env.ZOEN_E2E_EFFECT_WAIT_ATTEMPTS ?? "180");
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const snapshot = await client.getEffect({ effectRequestId });
    if (
      snapshot.snapshot?.request?.state ===
        EffectKnowledgeState.DEFINITELY_NOT_SENT ||
      snapshot.snapshot?.request?.state === EffectKnowledgeState.UNKNOWN ||
      snapshot.snapshot?.request?.state === EffectKnowledgeState.CONFIRMED ||
      snapshot.snapshot?.request?.state ===
        EffectKnowledgeState.CONFIRMED_NO_EFFECT
    ) {
      return snapshot;
    }
    await delay(1_000);
  }
  throw new Error(`effect ${effectRequestId} did not reach a durable state`);
}

function queryAvailable(
  client: WorldClient,
  definitionReference: DefinitionReference,
  tenantId = tenantA,
) {
  return client.semanticQuery({
    consistency: create(QueryConsistencySchema, {
      value: {
        case: "strong",
        value: create(StrongConsistencySchema),
      },
    }),
    definition: definitionReference,
    entityId: resourceId,
    selection: create(QuerySelectionSchema, {
      value: { case: "relationId", value: relationId },
    }),
    tenantId,
    validAt: timestampFromDate(validAt),
  });
}

async function explainOperation(
  client: Client<typeof HistoryService>,
): Promise<CausalExplanation> {
  const response = await client.explain({
    target: {
      target: { case: "operationId", value: operationId },
    },
  });
  assert.ok(response.explanation);
  return response.explanation;
}

async function authoritySnapshot(): Promise<{
  authorityDigest: string;
  commitSequence: number;
  companySourceCount: number;
  definitionHistoryCount: number;
}> {
  const client = new PostgresClient({
    connectionString: `postgres://postgres:postgres@127.0.0.1:${environment.ZOEN_E2E_POSTGRES_PORT}/zoen`,
  });
  await client.connect();
  try {
    const tables = [
      { name: "action_operations", volatileColumns: [] },
      { name: "action_proposals", volatileColumns: [] },
      { name: "authority_commits", volatileColumns: ["committed_at"] },
      { name: "authority_heads", volatileColumns: [] },
      { name: "company_sources", volatileColumns: ["updated_at", "created_at"] },
      {
        name: "company_surface_sessions",
        volatileColumns: ["created_at"],
      },
      { name: "definition_activations", volatileColumns: [] },
      { name: "definition_revisions", volatileColumns: [] },
      {
        name: "effect_requests",
        volatileColumns: ["last_commit_sequence", "knowledge_state", "updated_at"],
      },
      { name: "semantic_claims", volatileColumns: [] },
    ] as const;
    const rows: string[] = [];
    for (const table of tables) {
      const result = await client.query<{ row: string }>(
        `SELECT normalized.row::text AS row
           FROM (
             SELECT to_jsonb(value) - $2::text[] AS row
               FROM (SELECT * FROM ${table.name} WHERE tenant_id = $1) AS value
           ) AS normalized
          ORDER BY normalized.row::text`,
        [tenantA, table.volatileColumns],
      );
      rows.push(table.name, ...result.rows.map((row) => row.row));
    }
    const sequence = await client.query<{ commit_sequence: string }>(
      `SELECT coalesce(max(commit_sequence), 0)::text AS commit_sequence
         FROM authority_commits
        WHERE tenant_id = $1`,
      [tenantA],
    );
    const sources = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM company_sources WHERE tenant_id = $1`,
      [tenantA],
    );
    const history = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM definition_revisions
        WHERE tenant_id = $1`,
      [tenantA],
    );
    const commitSequence = Number(sequence.rows[0]?.commit_sequence ?? "0");
    const companySourceCount = Number(sources.rows[0]?.count ?? "0");
    const definitionHistoryCount = Number(history.rows[0]?.count ?? "0");
    rows.push(
      "commitSequence",
      String(commitSequence),
      "companySourceCount",
      String(companySourceCount),
      "definitionHistoryCount",
      String(definitionHistoryCount),
    );
    return {
      authorityDigest: sha256(rows.join("\n")),
      commitSequence,
      companySourceCount,
      definitionHistoryCount,
    };
  } finally {
    await client.end();
  }
}

async function insertCompanySource(): Promise<void> {
  const client = new PostgresClient({
    connectionString: `postgres://postgres:postgres@127.0.0.1:${environment.ZOEN_E2E_POSTGRES_PORT}/zoen`,
  });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO company_sources (
         tenant_id, source_id, source_revision, kind, filename, media_type,
         content_digest, object_key, extraction_version, parser_name,
         parser_version_digest, status
       ) VALUES (
         $1, 'source.reliability', '1', 'document', 'reliability.txt', 'text/plain',
         $2, 'company-brain/reliability.txt', 'v1', 'reliability',
         $2, 'stored'
       )
       ON CONFLICT (tenant_id, source_id, source_revision) DO NOTHING`,
      [tenantA, "0".repeat(64)],
    );
  } finally {
    await client.end();
  }
}

async function registerRestateServices(namespace: string): Promise<void> {
  for (const uri of [
    `http://harness-tenant-a.${namespace}.svc.cluster.local:9080`,
    `http://zoen-effect-worker.${namespace}.svc.cluster.local:9081`,
  ]) {
    let registered = false;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      try {
        const response = await fetch(`${restateAdmin}/deployments`, {
          body: JSON.stringify({ uri }),
          headers: { "content-type": "application/json" },
          method: "POST",
          signal: AbortSignal.timeout(1_000),
        });
        if (response.ok || response.status === 409) {
          registered = true;
          break;
        }
      } catch {
        await delay(1_000);
        continue;
      }
      await delay(1_000);
    }
    if (!registered) {
      throw new Error(`Restate did not register ${uri}`);
    }
  }
}

function requiredExpectedPath(): string {
  if (expectedPath === undefined || expectedPath === "") {
    throw new Error("verify mode requires the expected semantic state path");
  }
  return expectedPath;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
