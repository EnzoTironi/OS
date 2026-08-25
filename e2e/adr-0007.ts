import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import {
  CommitStatus,
  PolicyDecision,
  ProposalStatus,
} from "../packages/sdk/src/gen/zoen/action/v1/action_pb.js";
import {
  EffectAttemptReason,
  EffectKnowledgeState,
} from "../packages/sdk/src/gen/zoen/effect/v1/effect_pb.js";
import { writeScenarioArtifact } from "./host-env.js";
import {
  actionClient,
  activateDefinition,
  adminClient,
  changeCommitmentRequest,
  compileCommercial,
  definitionClient,
  delay,
  dispatchOnce,
  effectClient,
  entityIds,
  generatedDirectory,
  ingestChangeCommitmentBasis,
  ingestQuotedQuantityRivals,
  oidcAudience,
  oidcIssuer,
  oidcToken,
  providerOperation,
  publishDefinition,
  quantityLabels,
  quantityRelationId,
  queryOrderLines,
  queryRelation,
  registerWorker,
  repositoryRoot,
  resourceId,
  scenario,
  semanticClaimCount,
  setProviderMode,
  sourceIds,
  startConnector,
  startFaultProvider,
  startWorker,
  startZoend,
  stopProcess,
  tenantA,
  tenantB,
  waitForProviderOperation,
  waitForState,
  worldClient,
  writePolicyManifest,
  type ManagedProcess,
} from "./adr-0007/support.js";

const assertions: Record<string, boolean> = {};
const failureInjections: string[] = [];

function observe(name: string, condition: boolean): void {
  assert.ok(condition, name);
  assertions[name] = condition;
}

function inject(name: string): void {
  failureInjections.push(name);
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const commercial = await compileCommercial();
  observe(
    "commercialCompilesChangeCommitment",
    commercial.metadata.definitionId === "commercial.sales" &&
      commercial.canonicalJson.includes('"id":"commercial.changeCommitment"') &&
      commercial.canonicalJson.includes('"id":"commercial.OrderLine"') &&
      commercial.canonicalJson.includes('"id":"commercial.quotedQuantity"'),
  );

  const policyManifestPath = path.join(generatedDirectory, "policies.json");
  await writePolicyManifest(policyManifestPath, commercial);
  const [adminToken, workerAToken, workerBToken] = await Promise.all([
    oidcToken("admin-a"),
    oidcToken("effect-worker-a"),
    oidcToken("effect-worker-b"),
  ]);
  const definitions = definitionClient(adminToken);
  const actions = actionClient(adminToken);
  const world = worldClient(adminToken);
  const effect = effectClient(adminToken);
  const admin = adminClient();
  const processes: ManagedProcess[] = [];
  await admin.connect();

  try {
    processes.push(await startZoend(policyManifestPath));
    processes.push(await startFaultProvider());
    processes.push(await startConnector());
    processes.push(
      await startWorker({
        [tenantA]: workerAToken,
        [tenantB]: workerBToken,
      }),
    );
    const registration = await registerWorker();
    observe(
      "realRestateWorkerRegistered",
      /ZoenEffect|deployment/iu.test(registration),
    );

    const published = await publishDefinition(definitions, tenantA, commercial);
    observe("commercialPublished", published > 0n);
    const activated = await activateDefinition(
      definitions,
      tenantA,
      commercial,
    );
    observe("commercialActivated", activated > 0n);

    const ingest = await ingestQuotedQuantityRivals(world, commercial);
    inject("second-quantity-claim-after-sheet");
    const quoted = await queryRelation(
      world,
      commercial.definition,
      quantityRelationId,
    );
    const quoteClaimRows = await semanticClaimCount(admin, quantityRelationId);
    observe(
      "twoRivalQuantityClaimsCoexist",
      ingest.afterSheet < ingest.afterErp &&
        quoteClaimRows === 2 &&
        quantityLabels(quoted).join(",") === "10 each,12 each" &&
        sourceIds(quoted).join(",") === "source.erp,source.sheet",
    );

    const listed = await queryOrderLines(world, commercial.definition);
    observe(
      "semanticQueryListsTheOrderLine",
      entityIds(listed).includes(resourceId),
    );

    await ingestChangeCommitmentBasis(world, commercial);
    const claimsBeforePreview = await semanticClaimCount(admin);
    const committedBeforePreview = await queryRelation(
      world,
      commercial.definition,
      "commercial.committedQuantity",
    );
    const previewRequest = changeCommitmentRequest(commercial, "preview");
    const preview = await actions.propose(previewRequest);
    const claimsAfterPreview = await semanticClaimCount(admin);
    const committedAfterPreview = await queryRelation(
      world,
      commercial.definition,
      "commercial.committedQuantity",
    );
    const quotedAfterPreview = await queryRelation(
      world,
      commercial.definition,
      quantityRelationId,
    );
    inject("propose-changeCommitment-without-commit");
    observe(
      "previewDoesNotWriteBelief",
      preview.decision === PolicyDecision.PERMIT &&
        preview.proposal?.status === ProposalStatus.READY &&
        claimsAfterPreview === claimsBeforePreview &&
        quantityLabels(committedAfterPreview).join(",") ===
          quantityLabels(committedBeforePreview).join(",") &&
        quantityLabels(quotedAfterPreview).join(",") === "10 each,12 each",
    );

    const commitRequest = changeCommitmentRequest(commercial, "commit");
    const proposed = await actions.propose(commitRequest);
    assert.equal(proposed.decision, PolicyDecision.PERMIT);
    assert.equal(proposed.proposal?.status, ProposalStatus.READY);
    const committed = await actions.commit({
      operationId: commitRequest.operationId,
      proposalId: commitRequest.proposalId,
    });
    assert.equal(committed.status, CommitStatus.COMMITTED);
    assert.ok(committed.receipt);
    const effectRequestIds = committed.receipt.effectRequestIds;
    assert.ok(effectRequestIds.length > 0);
    const committedAfterAction = await queryRelation(
      world,
      commercial.definition,
      "commercial.committedQuantity",
    );
    const quotedAfterAction = await queryRelation(
      world,
      commercial.definition,
      quantityRelationId,
    );
    observe(
      "commitThroughAction",
      committed.receipt.operationId === commitRequest.operationId &&
        committed.receipt.recordIds.length > 0 &&
        quantityLabels(committedAfterAction).includes("8 each") &&
        quantityLabels(quotedAfterAction).join(",") === "10 each,12 each",
    );

    await setProviderMode("timeout_after_delivery");
    inject("timeout-after-possible-delivery");
    await dispatchOnce();
    const unknownSnapshots = await Promise.all(
      effectRequestIds.map((effectRequestId) =>
        waitForState(effect, effectRequestId, EffectKnowledgeState.UNKNOWN),
      ),
    );
    const providerOps = await Promise.all(
      unknownSnapshots.map((snapshot) => {
        const key = snapshot.request?.idempotencyKey;
        assert.ok(key);
        return waitForProviderOperation(key);
      }),
    );
    observe(
      "timeoutMapsToUnknown",
      unknownSnapshots.every(
        (snapshot) =>
          snapshot.request?.state === EffectKnowledgeState.UNKNOWN &&
          snapshot.attempts[0]?.reason ===
            EffectAttemptReason.TIMEOUT_AFTER_POSSIBLE_DELIVERY,
      ) && providerOps.every((operation) => operation.requests === 1),
    );

    await delay(1_100);
    await dispatchOnce();
    const afterRetry = await Promise.all(
      effectRequestIds.map(async (effectRequestId, index) => {
        const response = await effect.getEffect({ effectRequestId });
        const key = unknownSnapshots[index]?.request?.idempotencyKey;
        assert.ok(key);
        const remote = await providerOperation(key);
        return { remote, snapshot: response.snapshot };
      }),
    );
    observe(
      "noUnsafeRetry",
      afterRetry.every(
        (entry) =>
          entry.snapshot?.request?.state === EffectKnowledgeState.UNKNOWN &&
          entry.remote?.requests === 1,
      ),
    );

    const postgresVersion = (
      await admin.query<{ server_version: string }>("SHOW server_version")
    ).rows[0]?.server_version;
    assert.match(postgresVersion ?? "", /^18\./);
    const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).trim();
    const manifest = {
      assertions,
      componentVersions: {
        keycloak: "26.0.7",
        postgres: postgresVersion,
        restate: "1.7.2",
      },
      definition: {
        digest: commercial.digest,
        id: commercial.metadata.definitionId,
        revision: commercial.metadata.revision,
      },
      effectRequestIds,
      failureInjections,
      finishedAt: new Date().toISOString(),
      knowledgeState: "unknown",
      oidc: {
        audience: oidcAudience,
        issuer: oidcIssuer,
      },
      operationId: committed.receipt.operationId,
      providerRequests: afterRetry.map((entry) => entry.remote?.requests ?? 0),
      resourceId,
      rivals: {
        relationId: quantityRelationId,
        sources: sourceIds(quotedAfterAction),
        values: quantityLabels(quotedAfterAction),
      },
      scenario,
      sourceCommit,
      startedAt,
      tenant: tenantA,
    };
    await writeScenarioArtifact(repositoryRoot, scenario, manifest);
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  } finally {
    await admin.end();
    for (const process of processes.reverse()) {
      if (process.child.exitCode === null && process.child.signalCode === null) {
        await stopProcess(process);
      }
    }
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
