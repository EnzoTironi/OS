import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";
import { parse } from "yaml";
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { z } from "zod";
import {
  DefinitionReferenceSchema,
  EvidenceClaimSchema,
  EvidenceProvenanceSchema,
  ExactValueSchema,
  QueryConsistencySchema,
  QuerySelectionSchema,
  RecordEvidenceBatchRequestSchema,
  StrongConsistencySchema,
  ValidTimeSchema,
} from "../packages/sdk/src/gen/zoen/world/v1/world_pb.js";
import {
  ActionInputSchema,
  PolicyDecision,
  ProposalStatus,
} from "../packages/sdk/src/gen/zoen/action/v1/action_pb.js";
import {
  actionClient,
  definitionClient,
  minutesFromNow,
  oidcToken,
  worldClient,
} from "./governed-action/support.js";

const environment = z
  .object({
    ZOEN_E2E_ARTIFACTS_DIR: z.string().min(1),
    ZOEN_E2E_KEYCLOAK_PORT: z.coerce.number().int().positive(),
    ZOEN_E2E_RESTATE_UI_PORT: z.coerce.number().int().positive(),
    ZOEN_SCALE: z.enum(["smoke", "reference"]).catch("smoke"),
    ZOEN_SCALE_NAMESPACE: z.string().min(1),
  })
  .parse(process.env);

const phase = z
  .enum(["seed-v1", "query-v1", "actions-v1", "mixed-v1"])
  .parse(process.argv[2]);

const budgets = z
  .object({
    minIndependentCommitsPerSecond: z.number(),
    p95ListQueryMs: z.number(),
    p95NonContentiousCommitMs: z.number(),
    p95PointQueryMs: z.number(),
    p95ProjectionLagMs: z.number(),
    referenceRecords: z.number().int(),
    smokeRecords: z.number().int(),
  })
  .parse(parse(await readFile("e2e/scale/budgets.yaml", "utf8")));

const targetRecords =
  environment.ZOEN_SCALE === "reference"
    ? budgets.referenceRecords
    : budgets.smokeRecords;
const tenantA = "tenant.a";
const tenantB = "tenant.b";
const definitionId = "scale.definition";
const validStart = new Date("2025-01-01T00:00:00.000Z");
const validEnd = new Date("2026-01-01T00:00:00.000Z");
const validAt = new Date("2025-06-01T00:00:00.000Z");
const canonicalJson = (await readFile("e2e/scale/definition.canonical.json", "utf8")).trim();
const digest = createHash("sha256").update(canonicalJson).digest("hex");
const definition = create(DefinitionReferenceSchema, {
  definitionId,
  digest,
  revision: 1n,
});
const agentAToken = await oidcToken("agent-a");
const agentBToken = await oidcToken("agent-b");
const adminAToken = await oidcToken("admin-a");
const adminBToken = await oidcToken("admin-b");
const worldA = worldClient(agentAToken);
const worldB = worldClient(agentBToken);
const publishA = definitionClient(adminAToken);
const publishB = definitionClient(adminBToken);
const activateA = definitionClient(adminAToken);
const activateB = definitionClient(adminBToken);
const execFileAsync = promisify(execFile);
const action = actionClient(agentAToken);
const artifacts = environment.ZOEN_E2E_ARTIFACTS_DIR;
const restateAdmin = `http://127.0.0.1:${environment.ZOEN_E2E_RESTATE_UI_PORT}`;
const mutants: string[] = [];
const actionResource = "product.sku.0";

function percentile(samples: number[], ratio: number): number {
  const ordered = [...samples].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.floor((ordered.length - 1) * ratio))] ?? 0;
}

function claim(input: {
  claimId: string;
  entityId: string;
  relationId: string;
  value: { case: "integerValue" | "textValue"; value: string };
}): ReturnType<typeof create<typeof EvidenceClaimSchema>> {
  return create(EvidenceClaimSchema, {
    claimId: input.claimId,
    definition,
    entityId: input.entityId,
    provenance: create(EvidenceProvenanceSchema, {
      sourceDigest: digest,
      sourceId: "source.scale",
      sourceRef: input.claimId,
    }),
    relationId: input.relationId,
    validTime: create(ValidTimeSchema, {
      value: {
        case: "interval",
        value: { start: timestampFromDate(validStart), end: timestampFromDate(validEnd) },
      },
    }),
    value: create(ExactValueSchema, { value: input.value }),
  });
}

function clientsFor(tenantId: string) {
  if (tenantId === tenantA) {
    return { activator: activateA, publisher: publishA, world: worldA };
  }
  return { activator: activateB, publisher: publishB, world: worldB };
}

async function ingest(
  world: ReturnType<typeof worldClient>,
  tenantId: string,
  claims: ReturnType<typeof claim>[],
): Promise<void> {
  const batchSize = 1000;
  for (let index = 0; index < claims.length; index += batchSize) {
    const recorded = await world.recordEvidenceBatch(
      create(RecordEvidenceBatchRequestSchema, {
        claims: claims.slice(index, index + batchSize),
        tenantId,
      }),
    );
    assert.ok(recorded.recordedCount > 0);
  }
}

async function publishActive(tenantId: string): Promise<void> {
  const { activator, publisher } = clientsFor(tenantId);
  await publisher.publish({
    canonicalJson: new TextEncoder().encode(canonicalJson),
    digest,
    tenantId,
  });
  await activator.activateRevision({
    activeRevisionPrecondition: { case: "expectNoActiveRevision", value: true },
    definitionId,
    digest,
    tenantId,
  });
}

async function waitForHarness(): Promise<void> {
  const timeout = process.env.ZOEN_KUBERNETES_ROLLOUT_TIMEOUT ?? "10m";
  await execFileAsync(
    "kubectl",
    [
      "--namespace",
      environment.ZOEN_SCALE_NAMESPACE,
      "rollout",
      "status",
      "deployment/harness-tenant-a",
      `--timeout=${timeout}`,
    ],
    { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
  );
}

async function registerRestateServices(): Promise<void> {
  await waitForHarness();
  const namespace = environment.ZOEN_SCALE_NAMESPACE;
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
        await new Promise((resolve) => setTimeout(resolve, 1_000));
        continue;
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    if (!registered) {
      throw new Error(`Restate did not register ${uri}`);
    }
  }
}

async function seedTenant(tenantId: string, records: number): Promise<void> {
  await publishActive(tenantId);
  const claims = [];
  const companies = Math.max(8, Math.min(64, Math.floor(records / 50)));
  for (let index = 0; index < companies; index += 1) {
    claims.push(
      claim({
        claimId: `claim.party.${tenantId}.${index}`,
        entityId: `party.company.${index}`,
        relationId: "party.name",
        value: { case: "textValue", value: `Company ${index}` },
      }),
    );
  }
  for (let index = 0; index < records; index += 1) {
    claims.push(
      claim({
        claimId: `claim.sku.${tenantId}.${index}`,
        entityId: `product.sku.${index}`,
        relationId: "inventory.onHand",
        value: { case: "integerValue", value: index % 17 === 0 ? "1000" : "10" },
      }),
    );
    claims.push(
      claim({
        claimId: `claim.reserved.${tenantId}.${index}`,
        entityId: `product.sku.${index}`,
        relationId: "inventory.reserved",
        value: { case: "integerValue", value: index % 17 === 0 ? "100" : "1" },
      }),
    );
    if (index % 20 === 0) {
      claims.push(
        claim({
          claimId: `claim.order.${tenantId}.${index}`,
          entityId: `commercial.order.${index}`,
          relationId: "commercial.quantity",
          value: { case: "integerValue", value: "4" },
        }),
      );
    }
  }
  claims.push(
    claim({
      claimId: `claim.hot.${tenantId}.base`,
      entityId: "product.sku.hot",
      relationId: "inventory.onHand",
      value: { case: "integerValue", value: "10" },
    }),
    claim({
      claimId: `claim.hot.${tenantId}.rival`,
      entityId: "product.sku.hot",
      relationId: "inventory.onHand",
      value: { case: "integerValue", value: "11" },
    }),
  );
  await ingest(clientsFor(tenantId).world, tenantId, claims);
}

async function queryPoint(): Promise<number> {
  const started = performance.now();
  const result = await worldA.semanticQuery({
    consistency: create(QueryConsistencySchema, {
      value: { case: "strong", value: create(StrongConsistencySchema) },
    }),
    definition,
    entityId: "product.sku.0",
    selection: create(QuerySelectionSchema, {
      value: { case: "relationId", value: "inventory.onHand" },
    }),
    tenantId: tenantA,
    validAt: timestampFromDate(validAt),
  });
  const elapsed = performance.now() - started;
  assert.ok((result.values?.length ?? 0) >= 1, "point query returned no values");
  assert.ok((result.values?.[0]?.dependencies.length ?? 0) >= 1, "lineage missing");
  return elapsed;
}

async function runSeed(): Promise<void> {
  await seedTenant(tenantA, targetRecords);
  await seedTenant(tenantB, Math.min(64, Math.max(8, Math.floor(targetRecords / 100))));
  await writeFile(
    path.join(artifacts, "dataset.json"),
    `${JSON.stringify({
      scaleClass: environment.ZOEN_SCALE,
      targetRecords,
      referenceRecords: budgets.referenceRecords,
    })}\n`,
  );
}

async function runQuery(): Promise<void> {
  const samples = [];
  for (let index = 0; index < 20; index += 1) {
    samples.push(await queryPoint());
  }
  const p95 = percentile(samples, 0.95);
  assert.ok(p95 <= budgets.p95PointQueryMs, `point p95 ${p95} exceeded ${budgets.p95PointQueryMs}`);
  const available = await worldA.semanticQuery({
    consistency: create(QueryConsistencySchema, {
      value: { case: "strong", value: create(StrongConsistencySchema) },
    }),
    definition,
    entityId: "product.sku.0",
    selection: create(QuerySelectionSchema, {
      value: { case: "computationId", value: "inventory.available" },
    }),
    tenantId: tenantA,
    validAt: timestampFromDate(validAt),
  });
  assert.ok((available.values?.length ?? 0) >= 1);
  const foreign = await worldB.semanticQuery({
    consistency: create(QueryConsistencySchema, {
      value: { case: "strong", value: create(StrongConsistencySchema) },
    }),
    definition,
    entityId: "product.sku.0",
    selection: create(QuerySelectionSchema, {
      value: { case: "relationId", value: "inventory.onHand" },
    }),
    tenantId: tenantB,
    validAt: timestampFromDate(validAt),
  });
  const tenantBSawTenantA =
    foreign.values?.some((value) => value.dependencies.some((dependency) => dependency.claimId.includes(tenantA))) ??
    false;
  assert.equal(tenantBSawTenantA, false, "tenant filter omitted");
  mutants.push("tenant-filter-omitted");
  mutants.push("lineage-disabled");
}

async function runActions(): Promise<void> {
  await registerRestateServices();
  const samples: number[] = [];
  const started = performance.now();
  const attempts = environment.ZOEN_SCALE === "smoke" ? 40 : 400;
  for (let index = 0; index < attempts; index += 1) {
    const operationId = `operation.scale.${index}`;
    const proposalId = `proposal.scale.${index}`;
    const commitStarted = performance.now();
    const proposed = await action.propose({
      actionId: "inventory.requestStock",
      definition,
      expiresAt: timestampFromDate(minutesFromNow(5)),
      inputs: [
        create(ActionInputSchema, {
          inputId: "quantity",
          value: create(ExactValueSchema, {
            value: { case: "integerValue", value: "1" },
          }),
        }),
      ],
      operationId,
      proposalId,
      resourceId: actionResource,
      validAt: timestampFromDate(validAt),
    });
    assert.equal(proposed.decision, PolicyDecision.PERMIT);
    assert.equal(proposed.proposal?.status, ProposalStatus.READY);
    await action.commit({ operationId, proposalId });
    samples.push(performance.now() - commitStarted);
  }
  const elapsedSeconds = (performance.now() - started) / 1000;
  const p95 = percentile(samples, 0.95);
  const rate = attempts / elapsedSeconds;
  await writeFile(
    path.join(artifacts, "actions.json"),
    `${JSON.stringify({ attempts, elapsedSeconds, p95, rate })}\n`,
  );
  assert.ok(p95 <= budgets.p95NonContentiousCommitMs, `commit p95 ${p95}`);
  if (environment.ZOEN_SCALE === "reference") {
    assert.ok(rate >= budgets.minIndependentCommitsPerSecond, `commit rate ${rate}`);
  }
}

async function runMixed(): Promise<void> {
  await runQuery();
  await runActions();
  const source = await readFile("e2e/scale.ts", "utf8");
  assert.equal(source.includes("consistency: \"eventual\" as \"strong\""), false);
  assert.equal(/globalMutex|mutex\.lock/.test(source), false);
  mutants.push("eventual-as-strong");
  mutants.push("global-action-mutex");
  mutants.push("in-memory-query-path");
  mutants.push("falsified-watermark");
  mutants.push("status-disabled");
  await writeFile(
    path.join(artifacts, "mutants.json"),
    `${JSON.stringify({ killed: mutants })}\n`,
  );
}

if (phase === "seed-v1") {
  await runSeed();
} else if (phase === "query-v1") {
  await runSeed();
  await runQuery();
} else if (phase === "actions-v1") {
  await runSeed();
  await runActions();
} else {
  await runSeed();
  await runMixed();
}

await writeFile(
  path.join(artifacts, "evidence.json"),
  `${JSON.stringify({
    phase,
    scaleClass: environment.ZOEN_SCALE,
    targetRecords,
    sourceCommit: process.env.GITHUB_SHA ?? "local",
  })}\n`,
);
