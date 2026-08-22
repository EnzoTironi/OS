import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { Code, type Client } from "@connectrpc/connect";
import { chromium } from "playwright";
import { Client as PostgresClient } from "pg";
import { z } from "zod";
import {
  CommitStatus,
  PolicyDecision,
  ProposalStatus,
} from "../packages/sdk/src/gen/zoen/action/v1/action_pb.js";
import {
  EffectKnowledgeState,
} from "../packages/sdk/src/gen/zoen/effect/v1/effect_pb.js";
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
    ZOEN_DEPLOYMENT_ARTIFACTS_DIR: z.string().min(1),
    ZOEN_DEPLOYMENT_NAMESPACE: z.string().min(1),
    ZOEN_DEPLOYMENT_PROFILE: z.enum(["dedicated", "self-hosted"]),
    ZOEN_E2E_KEYCLOAK_PORT: z.coerce.number().int().positive(),
    ZOEN_E2E_POSTGRES_PORT: z.coerce.number().int().positive(),
    ZOEN_E2E_WEB_PORT: z.coerce.number().int().positive(),
  })
  .parse(process.env);

const mode = z.enum(["initial", "verify"]).parse(process.argv[2]);
const expectedPath = process.argv[3];
const fixture = await loadFixture("direct", 1);
const operationId = "operation.deployment-portability";
const proposalId = "proposal.deployment-portability";
const relationId = "inventory.available";
const validAt = new Date("2026-08-19T00:00:00.000Z");
const statePath = path.join(
  environment.ZOEN_DEPLOYMENT_ARTIFACTS_DIR,
  "semantic-state.json",
);

const semanticStateSchema = z
  .object({
    authorityDigest: z.string().regex(/^[0-9a-f]{64}$/u),
    definitionDigest: z.string().regex(/^[0-9a-f]{64}$/u),
    effectRequestId: z.string().min(1),
    effectState: z.number().int(),
    explanationComplete: z.boolean(),
    operationId: z.string().min(1),
    proposalId: z.string().min(1),
    queryValues: z.array(z.string()),
    semanticDigest: z.string().regex(/^[0-9a-f]{64}$/u),
    tenantDerived: z.boolean(),
    uiObserved: z.boolean(),
  })
  .strict();

const agentToken = await oidcToken("agent-a");
const adminToken = await oidcToken("admin-a");
const action = actionClient(agentToken);
const definition = definitionClient(agentToken);
const definitionAdmin = definitionClient(adminToken);
const world = worldClient(agentToken);
const effect = effectClient(agentToken);
const history = historyClient(agentToken);

if (mode === "initial") {
  await publishDefinition(definition, tenantA, fixture);
  await activateDefinition(definitionAdmin, tenantA, fixture);
  await kubectl([
    "--namespace",
    environment.ZOEN_DEPLOYMENT_NAMESPACE,
    "rollout",
    "status",
    "deployment/harness-tenant-a",
    "--timeout=5m",
  ]);
  await registerRestateServices(environment.ZOEN_DEPLOYMENT_NAMESPACE);
  await recordAvailable(world, {
    claimId: "claim.deployment-portability.available",
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
  const effectRequestId = committed.receipt.effectRequestIds[0];
  assert.ok(effectRequestId);
  await waitForEffect(effect, effectRequestId);
}

const expected =
  mode === "verify"
    ? semanticStateSchema.parse(
        JSON.parse(await readFile(requiredExpectedPath(), "utf8")),
      )
    : undefined;
if (mode === "verify") {
  await registerRestateServices(environment.ZOEN_DEPLOYMENT_NAMESPACE);
}
const observed = await observeState({
  effect,
  history,
  world,
});
if (expected !== undefined) {
  assert.deepEqual(observed, expected);
}
await writeFile(statePath, `${JSON.stringify(observed, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(observed, null, 2)}\n`);

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
  assert.equal(explanation.target?.target.case, "operationId");
  assert.equal(explanation.target.target.value, operationId);
  const uiObserved = await verifyWeb();
  const authorityDigest = await authorityDigestForTenant();
  const semanticResult = {
    definitionDigest: fixture.digest,
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
    uiObserved,
  };
  return semanticStateSchema.parse({
    ...semanticResult,
    authorityDigest,
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

async function waitForEffect(
  client: EffectClient,
  effectRequestId: string,
) {
  for (let attempt = 0; attempt < 180; attempt += 1) {
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

async function verifyWeb(): Promise<boolean> {
  const token = await passwordToken();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${environment.ZOEN_E2E_WEB_PORT}`);
    await page.evaluate((accessToken) => {
      sessionStorage.setItem("zoen.web.access-token.v1", accessToken);
    }, token);
    await page.reload();
    await page.locator("main.app-shell").waitFor({ timeout: 120_000 });
    const body = await page.locator("body").innerText();
    assert.match(body, /\b10\b/u);
    return true;
  } finally {
    await browser.close();
  }
}

async function passwordToken(): Promise<string> {
  const response = await fetch(
    `http://keycloak.127.0.0.1.nip.io:${environment.ZOEN_E2E_KEYCLOAK_PORT}/realms/zoen/protocol/openid-connect/token`,
    {
      body: new URLSearchParams({
        client_id: "zoen-web",
        grant_type: "password",
        password: "web-password",
        username: "web-tenant.a",
      }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
    },
  );
  const body: unknown = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  return z
    .object({ access_token: z.string().min(1) })
    .passthrough()
    .parse(body).access_token;
}

async function authorityDigestForTenant(): Promise<string> {
  const client = new PostgresClient({
    connectionString: `postgres://postgres:postgres@127.0.0.1:${environment.ZOEN_E2E_POSTGRES_PORT}/zoen`,
  });
  await client.connect();
  try {
    const tables = [
      { name: "action_operations", volatileColumns: [] },
      { name: "action_proposals", volatileColumns: [] },
      { name: "definition_activations", volatileColumns: [] },
      { name: "definition_revisions", volatileColumns: [] },
      {
        name: "effect_requests",
        volatileColumns: ["last_commit_sequence", "state", "updated_at"],
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
    return sha256(rows.join("\n"));
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

function kubectl(arguments_: readonly string[]): Promise<string> {
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
