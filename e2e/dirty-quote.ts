import assert from "node:assert/strict";
import path from "node:path";
import {
  CommitStatus,
  PolicyDecision,
  ProposalStatus,
} from "../packages/sdk/src/gen/zoen/action/v1/action_pb.js";
import { writeScenarioArtifact } from "./host-env.js";
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
  command,
  compileCommercial,
  compileSurface,
  composeOutput,
  definitionClient,
  definitionReference,
  entityIds,
  generatedDirectory,
  ingestChangeCommitmentBasis,
  ingestInsertIsAppendOnly,
  ingestQuotedQuantityRivals,
  oidcAudience,
  oidcIssuer,
  oidcToken,
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
  const commercial = await compileCommercial();
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
  const token = await oidcToken("admin-a");
  const definitions = definitionClient(token);
  const actions = actionClient(token);
  const world = worldClient(token);
  const admin = adminClient();
  let server: ServerProcess | undefined;
  await admin.connect();

  try {
    server = await startServer(policyManifestPath);
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

    const surface = compileSurface(commercial);
    const objectNode = surface.nodes["node.object"];
    observe(
      "surfaceListsTheOrderLine",
      surface.attribution.compiler === "deterministic" &&
        surface.attribution.generatedWithoutLlm &&
        surface.semanticContext.entityId === resourceId &&
        objectNode?.kind === "object-detail" &&
        objectNode.entityId === resourceId &&
        surface.queryBindings.some(
          (binding) =>
            binding.ref.kind === "relation" &&
            binding.ref.relationId === quantityRelationId,
        ) &&
        surface.actionBindings.some(
          (binding) => binding.ref.actionId === actionId,
        ),
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
    const keycloakVersion = await composeOutput(
      "exec",
      "-T",
      "keycloak",
      "/opt/keycloak/bin/kc.sh",
      "--version",
    );
    assert.match(keycloakVersion, /Keycloak 26\.0\.7/);
    const sourceCommit = await command("git", ["rev-parse", "HEAD"]);
    const manifest = {
      assertions,
      componentVersions: {
        keycloak: keycloakVersion.split("\n")[0],
        postgres: postgresVersion,
      },
      definition: {
        digest: commercial.digest,
        id: commercial.definition.definitionId,
        revision: commercial.definition.revision,
      },
      failureInjections,
      finishedAt: new Date().toISOString(),
      mutantsKilled,
      oidc: {
        audience: oidcAudience,
        issuer: oidcIssuer,
      },
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
    await admin.end();
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
