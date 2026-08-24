import assert from "node:assert/strict";
import path from "node:path";
import { Code } from "@connectrpc/connect";
import {
  CommitStatus,
  PolicyDecision,
  ProposalStatus,
} from "../packages/sdk/src/gen/zoen/action/v1/action_pb.js";
import { writeScenarioArtifact } from "./host-env.js";
import {
  actionClient,
  actionId,
  activationActionId,
  adminClient,
  assignLocationRequest,
  command,
  compileInventory,
  composeOutput,
  definitionClient,
  definitionReference,
  expectConnectCode,
  generatedDirectory,
  locationEntityId,
  oidcAudience,
  oidcIssuer,
  oidcToken,
  publish,
  queryLocation,
  recordLocationText,
  repositoryRoot,
  resourceId,
  sha256,
  startServer,
  stopServer,
  tenantA,
  textInput,
  worldClient,
  writePolicyManifest,
  type ServerProcess,
} from "./entity-location/support.js";

const scenario = "entity-location";
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
  const inventory = await compileInventory();
  const definition = definitionReference(inventory);
  observe(
    "inventoryCompilesAssignLocation",
    inventory.definition.definitionId === "inventory.operations" &&
      inventory.canonicalJson.includes('"kind":"entity"') &&
      inventory.canonicalJson.includes('"typeId":"inventory.Location"') &&
      /"id":"inventory.assignLocation"/.test(inventory.canonicalJson),
  );

  const policyManifestPath = path.join(generatedDirectory, "policies.json");
  await writePolicyManifest(policyManifestPath, inventory);
  const token = await oidcToken("admin-a");
  const definitions = definitionClient(token);
  const actions = actionClient(token);
  const world = worldClient(token);
  const admin = adminClient();
  let server: ServerProcess | undefined;
  await admin.connect();

  try {
    server = await startServer(policyManifestPath);
    const published = await publish(definitions, inventory);
    observe(
      "inventoryPublished",
      published.digest === inventory.digest && published.revision === 1n,
    );
    const activated = await definitions.activateRevision({
      activeRevisionPrecondition: {
        case: "expectNoActiveRevision",
        value: true,
      },
      definitionId: inventory.definition.definitionId,
      digest: inventory.digest,
      tenantId: tenantA,
    });
    observe(
      "inventoryActivated",
      activated.activation?.active?.digest === inventory.digest,
    );

    const textInputCode = await expectConnectCode(
      () =>
        actions.propose({
          ...assignLocationRequest(definition, "text", locationEntityId),
          inputs: [textInput("location", "warehouse-1")],
        }),
      Code.InvalidArgument,
    );
    inject("text-action-input");
    observe(
      "entityInputRejectsText",
      textInputCode === Code.InvalidArgument,
    );

    const textEvidenceCode = await expectConnectCode(
      () => recordLocationText(world, definition, "claim.location.text"),
      Code.InvalidArgument,
    );
    inject("text-location-evidence");
    observe(
      "locationRelationRejectsText",
      textEvidenceCode === Code.InvalidArgument,
    );

    const request = assignLocationRequest(definition, "wh-1", locationEntityId);
    const proposed = await actions.propose(request);
    assert.equal(proposed.decision, PolicyDecision.PERMIT);
    assert.equal(proposed.proposal?.status, ProposalStatus.READY);
    assert.ok(proposed.proposal);
    const committed = await actions.commit({
      operationId: request.operationId,
      proposalId: request.proposalId,
    });
    assert.equal(committed.status, CommitStatus.COMMITTED);
    assert.ok(committed.receipt);
    observe(
      "assignLocationCommitted",
      committed.receipt.recordIds.length === 1 &&
        committed.receipt.operationId === request.operationId,
    );

    const queried = await queryLocation(world, definition);
    const written = queried.values[0]?.value?.value;
    observe(
      "semanticQueryReturnsWrittenEntity",
      queried.values.length === 1 &&
        written?.case === "entityRefValue" &&
        written.value === locationEntityId,
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
        digest: inventory.digest,
        id: inventory.definition.definitionId,
        revision: inventory.definition.revision,
      },
      failureInjections,
      finishedAt: new Date().toISOString(),
      locationEntityId,
      oidc: {
        audience: oidcAudience,
        issuer: oidcIssuer,
      },
      operationId: committed.receipt.operationId,
      policies: [actionId, activationActionId],
      protocolDigest: sha256(inventory.canonicalJson),
      resourceId,
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
