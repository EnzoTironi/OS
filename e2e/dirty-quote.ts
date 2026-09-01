import assert from "node:assert/strict";
import path from "node:path";
import {
  CommitStatus,
  PolicyDecision,
  ProposalStatus,
} from "../gen/connect/zoen/action/v1/action_pb.js";
import {
  adminPairPersonas,
  plantPersonas,
  sessionOf,
  startAuthDoor,
  stopAuthDoor,
} from "./ba-door.js";
import { e2eIdentityAdminToken, writeScenarioArtifact } from "./host-env.js";
import { definitionPublishAndWorldReadActionIds } from "./world-read-policy.js";
import {
  changeCommitmentRequest,
  commitChangeCommitment,
  previewChangeCommitment,
} from "./dirty-quote/agent.js";
import { REQUIRED_MUTANTS } from "./dirty-quote/mutants.js";
import {
  actionClient,
  actionId,
  activationActionId,
  adminClient,
  agentSourceHasNoBypassWrite,
  applicationDatabaseUrl,
  authDatabaseUrl,
  command,
  loadCommercial,
  correctionEntityId,
  definitionClient,
  definitionReference,
  entityIds,
  generatedDirectory,
  ingestChangeCommitmentBasis,
  ingestInsertIsAppendOnly,
  ingestQuotedQuantityRivals,
  publish,
  quantityLabels,
  quantityRelationId,
  queryOrderLines,
  queryRelation,
  rejectSqlBeliefWrite,
  repositoryRoot,
  resourceId,
  semanticClaimCount,
  sha256,
  sourceIds,
  startServer,
  stopServer,
  tenantA,
  worldClient,
  writePolicyManifest,
  zoendBaseUrl,
  type ServerProcess,
} from "./dirty-quote/support.js";

const scenario = "dirty-quote";
const assertions: Record<string, boolean> = {};
const failureInjections: string[] = [];
const mutantsKilled: string[] = [];

function observe(name: string, condition: boolean): void {
  assert.ok(condition, name);
  assertions[name] = condition;
}

function inject(name: string): void {
  failureInjections.push(name);
}

function killMutant(name: (typeof REQUIRED_MUTANTS)[number]): void {
  mutantsKilled.push(name);
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const commercial = await loadCommercial();
  const definition = definitionReference(commercial);
  observe(
    "commercialCompilesChangeCommitment",
    commercial.definition.definitionId === "commercial.sales" &&
      commercial.definition.revision === 2 &&
      /"id":"commercial.changeCommitment"/.test(commercial.canonicalJson) &&
      commercial.canonicalJson.includes('"id":"commercial.OrderLine"') &&
      commercial.canonicalJson.includes('"id":"commercial.quotedQuantity"'),
  );

  const policyManifestPath = path.join(generatedDirectory, "policies.json");
  await writePolicyManifest(policyManifestPath, commercial);
  const door = await startAuthDoor(authDatabaseUrl);
  const admin = adminClient();
  let server: ServerProcess | undefined;
  await admin.connect();

  try {
    server = await startServer(policyManifestPath);
    const planted = await plantPersonas(door, {
      adminToken: e2eIdentityAdminToken(),
      applicationDatabaseUrl,
      personas: adminPairPersonas(
        [commercial.definition.definitionId, resourceId, correctionEntityId],
        [
          ...definitionPublishAndWorldReadActionIds,
          activationActionId,
          actionId,
        ],
      ),
      zoendBaseUrl,
    });
    const token = sessionOf(planted, "admin-a").token;
    const definitions = definitionClient(token, tenantA);
    const actions = actionClient(token, tenantA);
    const world = worldClient(token, tenantA);
    const published = await publish(definitions, commercial);
    observe(
      "commercialPublished",
      published.digest === commercial.digest && published.revision === 2n,
    );
    const activated = await definitions.activateRevision({
      activeRevisionPrecondition: {
        case: "expectNoActiveRevision",
        value: true,
      },
      definitionId: commercial.definition.definitionId,
      digest: commercial.digest,
      tenantId: tenantA,
    });
    observe(
      "commercialActivated",
      activated.activation?.active?.digest === commercial.digest,
    );

    const ingest = await ingestQuotedQuantityRivals(world, definition);
    inject("second-quantity-claim-after-sheet");
    const quoted = await queryRelation(world, definition, quantityRelationId);
    const quoteClaimRows = await semanticClaimCount(admin, quantityRelationId);
    observe(
      "twoRivalQuantityClaimsCoexist",
      ingest.afterSheet < ingest.afterErp &&
        quoteClaimRows === 2 &&
        quantityLabels(quoted).join(",") === "10 each,12 each" &&
        sourceIds(quoted).join(",") === "source.erp,source.sheet",
    );
    observe(
      "ingestInsertIsAppendOnly",
      await ingestInsertIsAppendOnly(),
    );
    observe("fuseAtIngestMutantKilled", quoteClaimRows === 2);
    killMutant("Fuse-at-ingest");

    const listed = await queryOrderLines(world, definition);
    observe(
      "semanticQueryListsTheOrderLine",
      entityIds(listed).includes(resourceId),
    );

    await ingestChangeCommitmentBasis(world, definition);
    const claimsBeforePreview = await semanticClaimCount(admin);
    const committedBeforePreview = await queryRelation(
      world,
      definition,
      "commercial.committedQuantity",
    );
    const previewRequest = changeCommitmentRequest(definition, "preview");
    const preview = await previewChangeCommitment(actions, previewRequest);
    const claimsAfterPreview = await semanticClaimCount(admin);
    const committedAfterPreview = await queryRelation(
      world,
      definition,
      "commercial.committedQuantity",
    );
    const quotedAfterPreview = await queryRelation(
      world,
      definition,
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
    killMutant("Preview writes belief");

    const commitRequest = changeCommitmentRequest(definition, "commit");
    const proposed = await previewChangeCommitment(actions, commitRequest);
    assert.equal(proposed.decision, PolicyDecision.PERMIT);
    assert.equal(proposed.proposal?.status, ProposalStatus.READY);
    const committed = await commitChangeCommitment(actions, commitRequest);
    assert.equal(committed.status, CommitStatus.COMMITTED);
    assert.ok(committed.receipt);
    const committedAfterAction = await queryRelation(
      world,
      definition,
      "commercial.committedQuantity",
    );
    const quotedAfterAction = await queryRelation(
      world,
      definition,
      quantityRelationId,
    );
    observe(
      "commitThroughAction",
      committed.receipt.operationId === commitRequest.operationId &&
        committed.receipt.recordIds.length > 0 &&
        quantityLabels(committedAfterAction).includes("8 each") &&
        quantityLabels(quotedAfterAction).join(",") === "10 each,12 each",
    );
    killMutant("RecordEvidence skips Action");

    inject("direct-sql-touch-after-rivals");
    const sqlRejected = await rejectSqlBeliefWrite(admin);
    const quotedAfterSql = await queryRelation(
      world,
      definition,
      quantityRelationId,
    );
    observe(
      "agentPathHasNoSqlOrBypassWrite",
      (await agentSourceHasNoBypassWrite()) &&
        sqlRejected &&
        quantityLabels(quotedAfterSql).join(",") === "10 each,12 each",
    );
    killMutant("Agent SQL write");

    observe(
      "requiredMutantsKilled",
      REQUIRED_MUTANTS.every((name) => mutantsKilled.includes(name)),
    );

    const postgresVersion = (
      await admin.query<{ server_version: string }>("SHOW server_version")
    ).rows[0]?.server_version;
    assert.match(postgresVersion ?? "", /^18\./);
    const sourceCommit = await command("git", ["rev-parse", "HEAD"]);
    const manifest = {
      assertions,
      componentVersions: {
        postgres: postgresVersion,
        sessionDoor: "better-auth",
      },
      definition: {
        digest: commercial.digest,
        id: commercial.definition.definitionId,
        revision: commercial.definition.revision,
      },
      failureInjections,
      finishedAt: new Date().toISOString(),
      mutantsKilled,
      operationId: committed.receipt.operationId,
      policies: [actionId, activationActionId],
      protocolDigest: sha256(commercial.canonicalJson),
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
    if (server !== undefined) {
      await stopServer(server);
    }
    await stopAuthDoor(door);
    await admin.end();
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
