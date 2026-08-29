import assert from "node:assert/strict";
import path from "node:path";
import { Code } from "@connectrpc/connect";
import {
  CommitStatus,
  PolicyDecision,
  ProposalStatus,
} from "../gen/connect/zoen/action/v1/action_pb.js";
import { writeScenarioArtifact } from "./host-env.js";
import {
  actionClient,
  actionId,
  activationActionId,
  adminClient,
  command,
  compileCommercial,
  composeOutput,
  definitionClient,
  definitionReference,
  expectConnectCode,
  generatedDirectory,
  oidcAudience,
  oidcIssuer,
  oidcToken,
  publish,
  queryQuoteReference,
  quoteEntityId,
  recordQuoteRequest,
  recordQuoteText,
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
} from "./commercial-identity/support.js";

const scenario = "commercial-identity";
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
  const definition = definitionReference(commercial);
  const identityRelationIds = [
    "commercial.buyerPartyReference",
    "commercial.cancellationOf",
    "commercial.commitmentReference",
    "commercial.correctionOf",
    "commercial.productReference",
    "commercial.proposedByMessage",
    "commercial.quoteReference",
    "commercial.requestReference",
  ] as const;
  const document = JSON.parse(commercial.canonicalJson) as {
    readonly relations: readonly {
      readonly id: string;
      readonly target: { readonly kind: string };
    }[];
    readonly revision: number;
  };
  observe(
    "commercialCompilesIdentityTypeTargets",
    commercial.definition.definitionId === "commercial.sales" &&
      commercial.definition.revision === 2 &&
      document.revision === 2 &&
      identityRelationIds.every((relationId) => {
        const relation = document.relations.find((item) => item.id === relationId);
        return relation?.target.kind === "type";
      }) &&
      /"id":"commercial.recordQuote"/.test(commercial.canonicalJson) &&
      commercial.canonicalJson.includes('"typeId":"commercial.Quote"'),
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

    const textInputCode = await expectConnectCode(
      () =>
        actions.propose({
          ...recordQuoteRequest(definition, "text", quoteEntityId),
          inputs: [textInput("quoteReference", "quote.q-1001")],
        }),
      Code.InvalidArgument,
    );
    inject("text-action-input");
    observe(
      "entityInputRejectsText",
      textInputCode === Code.InvalidArgument,
    );

    const textEvidenceCode = await expectConnectCode(
      () => recordQuoteText(world, definition, "claim.quote.text"),
      Code.InvalidArgument,
    );
    inject("text-quote-evidence");
    observe(
      "quoteRelationRejectsText",
      textEvidenceCode === Code.InvalidArgument,
    );

    const request = recordQuoteRequest(definition, "q-1", quoteEntityId);
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
      "recordQuoteCommitted",
      committed.receipt.recordIds.length === 1 &&
        committed.receipt.operationId === request.operationId,
    );

    const queried = await queryQuoteReference(world, definition);
    const written = queried.values[0]?.value?.value;
    observe(
      "semanticQueryReturnsWrittenEntity",
      queried.values.length === 1 &&
        written?.case === "entityRefValue" &&
        written.value === quoteEntityId,
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
      oidc: {
        audience: oidcAudience,
        issuer: oidcIssuer,
      },
      operationId: committed.receipt.operationId,
      policies: [actionId, activationActionId],
      protocolDigest: sha256(commercial.canonicalJson),
      quoteEntityId,
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
