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
import {
  actionClient,
  actionId,
  activationActionId,
  adminClient,
  applicationDatabaseUrl,
  authDatabaseUrl,
  command,
  compileCommercial,
  definitionClient,
  definitionReference,
  explainOperation,
  generatedDirectory,
  historyClient,
  neighborOrderLineId,
  neighborQuoteId,
  neighborRequestId,
  permittedOrderLineId,
  permittedQuoteId,
  permittedRequestId,
  publish,
  recordQuoteRequest,
  recordRequestReference,
  repositoryRoot,
  sha256,
  startServer,
  stopServer,
  tenantA,
  worldClient,
  writePolicyManifest,
  zoendBaseUrl,
  type ServerProcess,
} from "./cedar-object-projection/support.js";

const scenario = "cedar-object-projection";
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
    "commercialCompilesRecordQuote",
    commercial.definition.definitionId === "commercial.sales" &&
      commercial.canonicalJson.includes('"id":"commercial.recordQuote"') &&
      commercial.canonicalJson.includes('"id":"commercial.OrderLine"') &&
      commercial.canonicalJson.includes('"id":"commercial.Quote"') &&
      commercial.canonicalJson.includes('"sourceType":"commercial.OrderLine"'),
  );

  const policyManifestPath = path.join(generatedDirectory, "policies.json");
  const actionPolicyDigest = await writePolicyManifest(
    policyManifestPath,
    commercial,
  );
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
        [
          commercial.definition.definitionId,
          permittedOrderLineId,
          neighborOrderLineId,
          permittedQuoteId,
          neighborQuoteId,
          permittedRequestId,
          neighborRequestId,
        ],
        [activationActionId, actionId],
      ),
      zoendBaseUrl,
    });
    const token = sessionOf(planted, "admin-a").token;
    const definitions = definitionClient(token, tenantA);
    const actions = actionClient(token, tenantA);
    const world = worldClient(token, tenantA);
    const history = historyClient(token, tenantA);
    const published = await publish(definitions, commercial);
    observe(
      "commercialPublished",
      published.digest === commercial.digest &&
        published.revision === BigInt(commercial.definition.revision),
    );
    const definition = definitionReference(commercial);
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

    await recordRequestReference(
      world,
      definition,
      "claim.request.permitted",
      permittedOrderLineId,
      permittedRequestId,
    );
    await recordRequestReference(
      world,
      definition,
      "claim.request.neighbor",
      neighborOrderLineId,
      neighborRequestId,
    );

    const permittedRequest = recordQuoteRequest(
      definition,
      "permitted",
      permittedOrderLineId,
      permittedQuoteId,
    );
    const proposed = await actions.propose(permittedRequest);
    assert.equal(proposed.decision, PolicyDecision.PERMIT);
    assert.equal(proposed.proposal?.status, ProposalStatus.READY);
    assert.ok(proposed.proposal);
    const committed = await actions.commit({
      operationId: permittedRequest.operationId,
      proposalId: permittedRequest.proposalId,
    });
    assert.equal(committed.status, CommitStatus.COMMITTED);
    assert.ok(committed.receipt);
    observe(
      "permittedOrderLineCommitted",
      committed.receipt.recordIds.length === 1 &&
        committed.receipt.operationId === permittedRequest.operationId &&
        committed.receipt.policy?.revision?.policyId ===
          "policy.recordQuote.r1" &&
        committed.receipt.policy?.revision?.revision === 1n &&
        committed.receipt.policy?.revision?.digest === actionPolicyDigest,
    );

    const neighborRequest = recordQuoteRequest(
      definition,
      "neighbor",
      neighborOrderLineId,
      neighborQuoteId,
    );
    const denied = await actions.propose(neighborRequest);
    inject("neighbor-order-line-denied");
    observe(
      "neighborOrderLineDenied",
      denied.decision === PolicyDecision.DENY &&
        denied.proposal === undefined &&
        denied.policy?.revision?.policyId === "policy.recordQuote.r1",
    );
    observe(
      "evaluatorFailureIsNotPermit",
      denied.decision !== PolicyDecision.EVALUATION_ERROR &&
        denied.decision === PolicyDecision.DENY,
    );

    const explanation = await explainOperation(
      history,
      committed.receipt.operationId,
    );
    observe(
      "explanationSubjectIsAction",
      explanation.subject.case === "action",
    );
    const actionExplanation =
      explanation.subject.case === "action"
        ? explanation.subject.value
        : undefined;
    const policyRevisions = (actionExplanation?.policies ?? [])
      .map((policy) => policy.policy?.revision)
      .filter((revision) => revision !== undefined);
    observe(
      "determiningPolicyRevisionInExplanation",
      policyRevisions.some(
        (revision) =>
          revision.policyId === "policy.recordQuote.r1" &&
          revision.revision === 1n &&
          revision.digest === actionPolicyDigest,
      ),
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
      neighborOrderLineId,
      operationId: committed.receipt.operationId,
      permittedOrderLineId,
      policies: [actionId, activationActionId],
      policyRevision: {
        digest: actionPolicyDigest,
        policyId: "policy.recordQuote.r1",
        revision: 1,
      },
      protocolDigest: sha256(commercial.canonicalJson),
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
