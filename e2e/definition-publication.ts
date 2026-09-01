import assert from "node:assert/strict";
import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import path from "node:path";
import { once } from "node:events";
import {
  Code,
  ConnectError,
  createClient,
  type Client,
  type Interceptor,
} from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import { Client as PostgresClient } from "pg";
import {
  DefinitionService,
  type DefinitionPublication,
  type DefinitionRevision,
} from "../gen/connect/zoen/definition/v1/definition_pb.js";
import {
  loadCanonicalDefinition,
  type CompiledDefinition,
} from "./canonical-definition.js";
import {
  e2eAuthDatabaseUrl,
  invitePersona,
  plantPersonas,
  sessionDoorProcessEnv,
  sessionOf,
  startAuthDoor,
  stopAuthDoor,
} from "./ba-door.js";
import {
  e2eGeneratedDirectory,
  e2eHttpUrl,
  e2eIdentityAdminToken,
  e2eListenAddr,
  e2ePort,
  e2ePostgresUrl,
  writeScenarioArtifact,
} from "./host-env.js";
import {
  definitionPublishActionId,
  definitionPublishPolicy,
  type DefinitionPublishPolicy,
} from "./definition-publish-policy.js";

const repositoryRoot = process.cwd();
const fixtureDirectory = path.join(
  repositoryRoot,
  "testdata",
  "definitions",
);
const serverPath = path.join(repositoryRoot, "target", "debug", "zoen");
const postgresPortFallback = 55_432;
const zoendPortFallback = 58_080;
const zoendPort = e2ePort("ZOEN_E2E_ZOEND_PORT", zoendPortFallback);
const applicationDatabaseUrl = e2ePostgresUrl(
  "zoen_app",
  "zoen_app",
  postgresPortFallback,
);
const adminDatabaseUrl = e2ePostgresUrl(
  "postgres",
  "postgres",
  postgresPortFallback,
);
const baseUrl = e2eHttpUrl("ZOEN_E2E_ZOEND_PORT", zoendPortFallback);
const authDatabaseUrl = e2eAuthDatabaseUrl(postgresPortFallback);
const generatedDirectory = e2eGeneratedDirectory(
  repositoryRoot,
  "definition-publication",
);
const tenantA = "tenant.a";
const tenantB = "tenant.b";

type DefinitionClient = Client<typeof DefinitionService>;

interface ServerProcess {
  child: ChildProcessWithoutNullStreams;
  output: string[];
}

interface PublicationState {
  authorityCommits: number;
  authorityHead: number | null;
  definitionPublicationGrants: number;
  definitionPublications: number;
  definitionRevisions: number;
  projectionOutbox: number;
}

const assertions: Record<string, boolean> = {};

function recordAssertion(name: string): void {
  assertions[name] = true;
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const first = await loadCanonicalDefinition(
    path.join(fixtureDirectory, "inventory.canonical.json"),
  );
  const expectedCanonical = first.canonicalJson;
  const expectedDigest = (
    await readFile(path.join(fixtureDirectory, "inventory.sha256"), "utf8")
  ).trim();
  assert.equal(first.digest, expectedDigest);
  recordAssertion("canonicalFixtureMatched");

  const computationMutationJson = first.canonicalJson.replace(
    '"operator":"subtract"',
    '"operator":"add"',
  );
  assert.notEqual(computationMutationJson, first.canonicalJson);
  assert.notEqual(sha256(computationMutationJson), first.digest);
  const actionMutation = await loadCanonicalDefinition(
    path.join(fixtureDirectory, "inventory-amount-rev2.canonical.json"),
  );
  assert.notEqual(first.digest, actionMutation.digest);
  recordAssertion("computationMutationChangedDigest");

  const publicationSource = `permit (
    principal,
    action == Action::"publish_definition",
    resource
)
when {
    context.actionId == "zoen.definition.publish" &&
    (
        principal == Zoen::Principal::"principal.builder.a" ||
        principal == Zoen::Principal::"principal.builder.b"
    )
};
`;
  const publicationPolicies = [first, actionMutation].map((definition) =>
    definitionPublishPolicy({
      definitionDigest: definition.digest,
      policyId: `policy.definition.publish.inventory.r${definition.definition.revision}`,
      revision: definition.definition.revision,
      source: publicationSource,
    }),
  );
  const policyManifestPath = path.join(generatedDirectory, "policies.json");
  await writePolicyManifest(policyManifestPath, publicationPolicies);

  const door = await startAuthDoor(authDatabaseUrl);
  const admin = new PostgresClient({ connectionString: adminDatabaseUrl });
  let server: ServerProcess | undefined;
  try {
    server = await startServer(policyManifestPath);
    await admin.connect();
    const planted = await plantPersonas(door, {
      adminToken: e2eIdentityAdminToken(),
      applicationDatabaseUrl: adminDatabaseUrl,
      personas: [
        invitePersona({
          actionIds: [definitionPublishActionId],
          actorId: "actor.builder.a",
          id: "builder-a",
          principalId: "principal.builder.a",
          resourceIds: [first.definition.definitionId],
          tenantId: tenantA,
          workloadId: "workload.builder.a",
        }),
        invitePersona({
          actionIds: [definitionPublishActionId],
          actorId: "actor.observer.a",
          id: "observer-a",
          principalId: "principal.observer.a",
          resourceIds: [first.definition.definitionId],
          tenantId: tenantA,
          workloadId: "workload.observer.a",
        }),
        invitePersona({
          actionIds: ["zoen.definition.activate"],
          actorId: "actor.no-publish.a",
          id: "no-publish-a",
          principalId: "principal.no-publish.a",
          resourceIds: [first.definition.definitionId],
          tenantId: tenantA,
          workloadId: "workload.no-publish.a",
        }),
        invitePersona({
          actionIds: [definitionPublishActionId],
          actorId: "actor.builder.b",
          id: "builder-b",
          principalId: "principal.builder.b",
          resourceIds: [first.definition.definitionId],
          tenantId: tenantB,
          workloadId: "workload.builder.b",
        }),
      ],
      zoendBaseUrl: baseUrl,
    });
    const builderA = sessionOf(planted, "builder-a");
    const tokenA = builderA.token;
    const tokenB = sessionOf(planted, "builder-b").token;
    const clientA = definitionClient(tokenA, tenantA);
    const clientB = definitionClient(tokenB, tenantB);
    const observerA = definitionClient(
      sessionOf(planted, "observer-a").token,
      tenantA,
    );
    const noPublishA = definitionClient(
      sessionOf(planted, "no-publish-a").token,
      tenantA,
    );
    const publishedA = await publish(clientA, tenantA, first);
    const publishedRevisionA = requiredPublicationRevision(publishedA);
    assert.equal(publishedRevisionA.commitSequence, 1n);
    assert.equal(publishedRevisionA.digest, expectedDigest);
    assert.equal(decode(publishedRevisionA.canonicalJson), expectedCanonical);
    assert.equal(publishedA.publishedBy, "actor.builder.a");
    assert.equal(publishedA.principalId, "principal.builder.a");
    assert.equal(publishedA.workloadId, "workload.builder.a");
    const publishedAtMicros = timestampMicros(publishedA.publishedAt);
    assert.ok(publishedAtMicros > 0n);
    assertPublicationPolicy(publishedA, publicationPolicies[0]);
    await assertStoredPublication(admin, tenantA, publishedA);
    recordAssertion("builderPublishPermitted");
    recordAssertion("publicationEvidenceRoundTripped");

    const replayedA = await publish(clientA, tenantA, first);
    assert.equal(requiredPublicationRevision(replayedA).commitSequence, 1n);
    assert.deepEqual(replayedA.policy, publishedA.policy);
    assert.deepEqual(replayedA.publishedAt, publishedA.publishedAt);
    assert.equal(replayedA.publishedBy, publishedA.publishedBy);
    assert.equal(replayedA.principalId, publishedA.principalId);
    assert.equal(replayedA.workloadId, publishedA.workloadId);
    assert.equal(await rowCount(admin, "authority_commits", tenantA), 1);
    assert.equal(await rowCount(admin, "definition_revisions", tenantA), 1);
    assert.equal(await rowCount(admin, "definition_publications", tenantA), 1);
    assert.equal(
      await rowCount(admin, "definition_publication_grants", tenantA),
      1,
    );
    assert.equal(await rowCount(admin, "projection_outbox", tenantA), 1);
    assert.deepEqual(await projectionEvent(admin, tenantA, 1), {
      eventType: "DefinitionPublished",
      eventVersion: 2,
      payload: {
        definitionId: first.definition.definitionId,
        determiningPolicies: publishedA.policy?.determiningPolicyIds,
        digest: first.digest,
        policyDigest: publishedA.policy?.revision?.digest,
        policyId: publishedA.policy?.revision?.policyId,
        policyRevision: Number(publishedA.policy?.revision?.revision),
        principalId: publishedA.principalId,
        publishedAtMicros: Number(publishedAtMicros),
        publishedBy: publishedA.publishedBy,
        revision: 1,
        workloadId: publishedA.workloadId,
      },
    });
    recordAssertion("authorityCommitParentPersisted");
    recordAssertion("definitionPublishedEventPersisted");
    recordAssertion("outboxAndCommitSequencePersisted");
    recordAssertion("authorizedReplayReturnedOriginalEvidence");

    await expectNoPublicationWrites(
      admin,
      tenantA,
      () => publish(observerA, tenantA, first),
      Code.PermissionDenied,
    );
    recordAssertion("sameWorldObserverDeniedByCedar");

    await expectNoPublicationWrites(
      admin,
      tenantA,
      () => publish(noPublishA, tenantA, first),
      Code.PermissionDenied,
    );
    recordAssertion("delegationDeniedBeforeStore");

    await expectNoPublicationWrites(
      admin,
      tenantA,
      () =>
        publishCanonical(
          clientA,
          tenantA,
          computationMutationJson,
          sha256(computationMutationJson),
        ),
      Code.FailedPrecondition,
    );
    recordAssertion("missingCandidatePolicyFailedClosed");

    await expectNoPublicationWrites(
      admin,
      tenantB,
      () => publish(clientA, tenantB, first),
      Code.PermissionDenied,
    );
    recordAssertion("tenantSubstitutionDeniedWithoutWrites");

    const publishedB = await publish(clientB, tenantB, first);
    assert.equal(requiredPublicationRevision(publishedB).commitSequence, 1n);
    assert.equal(await rowCount(admin, "authority_commits", tenantB), 1);
    assert.equal(await rowCount(admin, "definition_revisions", tenantB), 1);

    const beforeDigestMismatch = await processMetrics();
    await expectConnectCode(
      () =>
        clientA.publish({
          canonicalJson: encode(first.canonicalJson),
          digest: "0".repeat(64),
          tenantId: tenantA,
        }),
      Code.InvalidArgument,
    );
    const afterDigestMismatch = await processMetrics();
    assert.equal(afterDigestMismatch.jcs, beforeDigestMismatch.jcs);

    const invalidReference = first.canonicalJson.replace(
      '"sourceType":"inventory.Item"',
      '"sourceType":"inventory.Missing"',
    );
    assert.notEqual(invalidReference, first.canonicalJson);
    await expectConnectCode(
      () =>
        clientA.publish({
          canonicalJson: encode(invalidReference),
          digest: sha256(invalidReference),
          tenantId: tenantA,
        }),
      Code.InvalidArgument,
    );

    for (const value of ["01", "+1", "-0", "001"]) {
      const invalidInteger = first.canonicalJson.replace(
        '{"amount":"0.125","kind":"quantity","unit":"kg"}',
        `{"kind":"integer","value":"${value}"}`,
      );
      assert.notEqual(invalidInteger, first.canonicalJson);
      await expectConnectCode(
        () =>
          clientA.publish({
            canonicalJson: encode(invalidInteger),
            digest: sha256(invalidInteger),
            tenantId: tenantA,
          }),
        Code.InvalidArgument,
      );
    }
    recordAssertion("noncanonicalIntegersRejected");

    const afterInvalidIntegers = await processMetrics();
    assert.equal(afterInvalidIntegers.jcs, afterDigestMismatch.jcs);
    const spacedCanonical = first.canonicalJson.replace("{", "{ ");
    assert.notEqual(spacedCanonical, first.canonicalJson);
    await expectConnectCode(
      () =>
        clientA.publish({
          canonicalJson: encode(spacedCanonical),
          digest: sha256(spacedCanonical),
          tenantId: tenantA,
        }),
      Code.InvalidArgument,
    );
    const afterSpaced = await processMetrics();
    assert.ok(afterSpaced.jcs > afterInvalidIntegers.jcs);
    assert.ok(afterSpaced.admitCount > afterInvalidIntegers.admitCount);
    assert.ok(!afterSpaced.body.includes(tenantA));
    assert.ok(!afterSpaced.body.includes(tenantB));
    assert.ok(!afterSpaced.body.includes(first.definition.definitionId));
    recordAssertion("jcsMismatchCounted");

    await expectConnectCode(
      () =>
        clientA.publish({
          canonicalJson: encode(actionMutation.canonicalJson),
          digest: first.digest,
          tenantId: tenantA,
        }),
      Code.InvalidArgument,
    );

    await installOutboxFailure(admin);
    try {
      await expectNoPublicationWrites(
        admin,
        tenantA,
        () => publish(clientA, tenantA, actionMutation),
        Code.Unavailable,
      );
    } finally {
      await removeOutboxFailure(admin);
    }
    assert.equal(await rowCount(admin, "authority_commits", tenantA), 1);
    assert.equal(await rowCount(admin, "definition_revisions", tenantA), 1);
    assert.equal(await rowCount(admin, "definition_publications", tenantA), 1);
    assert.equal(
      await rowCount(admin, "definition_publication_grants", tenantA),
      1,
    );
    assert.equal(await rowCount(admin, "projection_outbox", tenantA), 1);
    assert.equal(await authorityHead(admin, tenantA), 1);
    recordAssertion("atomicDatabaseFailure");

    await assertDeferredPublicationInvariant(admin, tenantA, actionMutation);
    recordAssertion("unguvernedRevisionRejectedAtCommit");

    await assert.rejects(
      admin.query(
        `UPDATE definition_revisions
         SET canonical_json = replace(
           canonical_json,
           '"operator":"greater_than"',
           '"operator":"multiply"'
         )
         WHERE tenant_id = $1 AND definition_id = $2 AND digest = $3`,
        [tenantA, first.definition.definitionId, first.digest],
      ),
      /published definition revisions are immutable/,
    );
    recordAssertion("immutableMutationKilled");
    await assert.rejects(
      admin.query(
        `UPDATE definition_publications
         SET policy_id = 'policy.mutant'
         WHERE tenant_id = $1 AND definition_id = $2 AND digest = $3`,
        [tenantA, first.definition.definitionId, first.digest],
      ),
      /definition publication history is immutable/,
    );
    recordAssertion("publicationEvidenceImmutable");

    assert.equal(
      await relationName(admin, "active_definition_revisions"),
      "active_definition_revisions",
    );
    assert.equal(
      await rowCount(admin, "active_definition_revisions", tenantA),
      0,
    );
    recordAssertion("publishDidNotActivate");
    await assertRlsIsolation();

    const delegation = await membershipDelegation(
      admin,
      builderA.accountId,
      tenantA,
    );
    await replaceMembershipActions(
      admin,
      builderA.accountId,
      tenantA,
      ["zoen.definition.activate"],
    );
    await expectNoPublicationWrites(
      admin,
      tenantA,
      () => publish(clientA, tenantA, first),
      Code.PermissionDenied,
    );
    recordAssertion("deniedCallerCannotReplayOriginalCommit");
    await restoreMembershipDelegation(
      admin,
      builderA.accountId,
      tenantA,
      delegation,
    );

    await stopServer(server);
    server = await startServer(policyManifestPath);
    const recoveredPublication = await publish(clientA, tenantA, first);
    assert.deepEqual(recoveredPublication.policy, publishedA.policy);
    assert.deepEqual(recoveredPublication.publishedAt, publishedA.publishedAt);
    assert.equal(recoveredPublication.publishedBy, publishedA.publishedBy);
    assert.equal(recoveredPublication.principalId, publishedA.principalId);
    assert.equal(recoveredPublication.workloadId, publishedA.workloadId);
    assert.deepEqual(
      requiredPublicationRevision(recoveredPublication),
      publishedRevisionA,
    );
    assert.equal(await rowCount(admin, "authority_commits", tenantA), 1);
    assert.equal(await rowCount(admin, "definition_publications", tenantA), 1);
    recordAssertion("restartRecoveredExactPublication");
    const recoveredA = await getRevision(
      clientA,
      tenantA,
      first.definition.definitionId,
      first.digest,
    );
    assert.equal(recoveredA.commitSequence, 1n);
    assert.equal(recoveredA.digest, expectedDigest);
    assert.equal(decode(recoveredA.canonicalJson), expectedCanonical);
    recordAssertion("restartRecoveredExactRevision");

    const recoveredB = await getRevision(
      clientB,
      tenantB,
      first.definition.definitionId,
      first.digest,
    );
    assert.equal(recoveredB.digest, expectedDigest);

    await expectConnectCode(
      () =>
        clientA.getRevision({
          definitionId: first.definition.definitionId,
          digest: first.digest,
          tenantId: tenantB,
        }),
      Code.PermissionDenied,
    );
    recordAssertion("tenantSubstitutionRejected");
    await expectConnectCode(
      () =>
        clientB.getRevision({
          definitionId: first.definition.definitionId,
          digest: first.digest,
          tenantId: tenantA,
        }),
      Code.PermissionDenied,
    );

    const postgresVersion = await admin.query<{ server_version: string }>(
      "SHOW server_version",
    );
    const version = postgresVersion.rows[0]?.server_version;
    assert.match(version ?? "", /^18\./);

    const sourceCommit = await command("git", ["rev-parse", "HEAD"]);
    const protocol = await readFile(
      path.join(
        repositoryRoot,
        "proto",
        "zoen",
        "definition",
        "v1",
        "definition.proto",
      ),
    );
    const manifest = {
      assertions,
      authMode: "session-door",
      componentVersions: {
        postgres: version,
      },
      definitionDigest: expectedDigest,
      policyDigest: publicationPolicies[0]?.digest,
      finishedAt: new Date().toISOString(),
      protocolDigest: createHash("sha256").update(protocol).digest("hex"),
      scenario: "definition-publication",
      sourceCommit,
      startedAt,
    };
    await writeScenarioArtifact(repositoryRoot, "definition-publication", manifest);
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  } finally {
    await admin.end().catch(() => undefined);
    if (server !== undefined && server.child.exitCode === null) {
      await stopServer(server);
    }
    await stopAuthDoor(door);
  }
}

function definitionClient(token: string, tenantId: string): DefinitionClient {
  const authorization: Interceptor = (next) => async (request) => {
    request.header.set("authorization", `Bearer ${token}`);
    request.header.set("x-zoen-tenant", tenantId);
    return next(request);
  };
  return createClient(
    DefinitionService,
    createConnectTransport({
      baseUrl,
      httpVersion: "1.1",
      interceptors: [authorization],
    }),
  );
}

async function publish(
  client: DefinitionClient,
  tenantId: string,
  definition: CompiledDefinition,
) {
  return publishCanonical(
    client,
    tenantId,
    definition.canonicalJson,
    definition.digest,
  );
}

async function publishCanonical(
  client: DefinitionClient,
  tenantId: string,
  canonicalJson: string,
  digest: string,
): Promise<DefinitionPublication> {
  const response = await client.publish({
    canonicalJson: encode(canonicalJson),
    digest,
    tenantId,
  });
  assert.ok(response.publication);
  return response.publication;
}

function requiredPublicationRevision(
  publication: DefinitionPublication,
): DefinitionRevision {
  assert.ok(publication.revision);
  return publication.revision;
}

function timestampMicros(
  timestamp: DefinitionPublication["publishedAt"],
): bigint {
  assert.ok(timestamp);
  assert.equal(timestamp.nanos % 1_000, 0);
  return timestamp.seconds * 1_000_000n + BigInt(timestamp.nanos / 1_000);
}

function assertPublicationPolicy(
  publication: DefinitionPublication,
  expected: DefinitionPublishPolicy | undefined,
): void {
  assert.ok(expected);
  assert.equal(publication.policy?.revision?.digest, expected.digest);
  assert.equal(publication.policy?.revision?.policyId, expected.policyId);
  assert.equal(publication.policy?.revision?.revision, BigInt(expected.revision));
  assert.ok((publication.policy?.determiningPolicyIds.length ?? 0) > 0);
}

async function assertStoredPublication(
  client: PostgresClient,
  tenantId: string,
  publication: DefinitionPublication,
): Promise<void> {
  const revision = requiredPublicationRevision(publication);
  const policy = publication.policy;
  assert.ok(policy?.revision);
  const result = await client.query<{
    actor_id: string;
    commit_sequence: string;
    determining_policies: string[];
    digest: string;
    policy_digest: string;
    policy_id: string;
    policy_revision: string;
    principal_id: string;
    published_at_micros: string;
    revision: string;
    workload_id: string;
  }>(
    `SELECT actor_id, commit_sequence::text, determining_policies, digest,
            policy_digest, policy_id, policy_revision::text, principal_id,
            published_at_micros::text, revision::text, workload_id
     FROM definition_publications
     WHERE tenant_id = $1 AND definition_id = $2 AND digest = $3`,
    [tenantId, revision.definitionId, revision.digest],
  );
  assert.equal(result.rowCount, 1);
  assert.deepEqual(result.rows[0], {
    actor_id: publication.publishedBy,
    commit_sequence: revision.commitSequence.toString(),
    determining_policies: policy.determiningPolicyIds,
    digest: revision.digest,
    policy_digest: policy.revision.digest,
    policy_id: policy.revision.policyId,
    policy_revision: policy.revision.revision.toString(),
    principal_id: publication.principalId,
    published_at_micros: timestampMicros(publication.publishedAt).toString(),
    revision: revision.revision.toString(),
    workload_id: publication.workloadId,
  });
}

async function writePolicyManifest(
  outputPath: string,
  policies: readonly DefinitionPublishPolicy[],
): Promise<void> {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify({ policies }, null, 2)}\n`,
  );
}

async function getRevision(
  client: DefinitionClient,
  tenantId: string,
  definitionId: string,
  digest: string,
) {
  const response = await client.getRevision({
    definitionId,
    digest,
    tenantId,
  });
  assert.ok(response.definitionRevision);
  return response.definitionRevision;
}

function command(executable: string, arguments_: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      executable,
      arguments_,
      { cwd: repositoryRoot, encoding: "utf8" },
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

async function startServer(policyManifestPath: string): Promise<ServerProcess> {
  const output: string[] = [];
  const child = spawn(serverPath, ["serve"], {
    cwd: repositoryRoot,
    env: sessionDoorProcessEnv({
      applicationDatabaseUrl,
      authDatabaseUrl,
      extra: {
        ZOEN_CEDAR_POLICY_MANIFEST: policyManifestPath,
        ZOEN_IDENTITY_ADMIN_TOKEN: e2eIdentityAdminToken(),
        ZOEN_LISTEN_ADDR: e2eListenAddr(
          "ZOEN_E2E_ZOEND_PORT",
          zoendPortFallback,
        ),
      },
    }),
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdin.end();
  child.stdout.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  await waitForPort(child, output);
  return { child, output };
}

async function waitForPort(
  child: ChildProcessWithoutNullStreams,
  output: readonly string[],
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`zoend exited during startup:\n${output.join("")}`);
    }
    if (await canConnect()) {
      return;
    }
    await delay(100);
  }
  throw new Error(`zoend did not listen on port ${zoendPort}:\n${output.join("")}`);
}

function canConnect(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port: zoendPort });
    let settled = false;
    const finish = (connected: boolean) => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolve(connected);
      }
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(200, () => finish(false));
  });
}

async function stopServer(server: ServerProcess): Promise<void> {
  if (server.child.exitCode !== null) {
    return;
  }
  server.child.kill("SIGINT");
  await once(server.child, "exit");
  assert.equal(
    server.child.exitCode,
    0,
    `zoend failed during shutdown:\n${server.output.join("")}`,
  );
}

async function expectConnectCode(
  action: () => Promise<unknown>,
  expected: Code,
): Promise<void> {
  try {
    await action();
    assert.fail(`expected Connect error ${Code[expected]}`);
  } catch (error: unknown) {
    if (!(error instanceof ConnectError)) {
      throw error;
    }
    assert.equal(error.code, expected, error.message);
  }
}

async function rowCount(
  client: PostgresClient,
  table: string,
  tenantId: string,
): Promise<number> {
  const allowedTables = new Set([
    "active_definition_revisions",
    "authority_commits",
    "definition_publication_grants",
    "definition_publications",
    "definition_revisions",
    "projection_outbox",
  ]);
  assert.ok(allowedTables.has(table));
  const result = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM ${table} WHERE tenant_id = $1`,
    [tenantId],
  );
  return Number(result.rows[0]?.count);
}

async function publicationState(
  client: PostgresClient,
  tenantId: string,
): Promise<PublicationState> {
  return {
    authorityCommits: await rowCount(client, "authority_commits", tenantId),
    authorityHead: await authorityHead(client, tenantId),
    definitionPublicationGrants: await rowCount(
      client,
      "definition_publication_grants",
      tenantId,
    ),
    definitionPublications: await rowCount(
      client,
      "definition_publications",
      tenantId,
    ),
    definitionRevisions: await rowCount(
      client,
      "definition_revisions",
      tenantId,
    ),
    projectionOutbox: await rowCount(client, "projection_outbox", tenantId),
  };
}

async function expectNoPublicationWrites(
  client: PostgresClient,
  tenantId: string,
  action: () => Promise<unknown>,
  expectedCode: Code,
): Promise<void> {
  const before = await publicationState(client, tenantId);
  await expectConnectCode(action, expectedCode);
  assert.deepEqual(await publicationState(client, tenantId), before);
}

async function projectionEvent(
  client: PostgresClient,
  tenantId: string,
  commitSequence: number,
): Promise<{
  eventType: string;
  eventVersion: number;
  payload: unknown;
}> {
  const result = await client.query<{
    event_type: string;
    event_version: number;
    payload: unknown;
  }>(
    `SELECT event_type, event_version, payload
     FROM projection_outbox
     WHERE tenant_id = $1 AND commit_sequence = $2 AND ordinal = 0`,
    [tenantId, commitSequence],
  );
  const row = result.rows[0];
  assert.ok(row);
  return {
    eventType: row.event_type,
    eventVersion: row.event_version,
    payload: row.payload,
  };
}

async function relationName(
  client: PostgresClient,
  relation: string,
): Promise<string | null> {
  const result = await client.query<{ name: string | null }>(
    "SELECT to_regclass($1)::text AS name",
    [`public.${relation}`],
  );
  return result.rows[0]?.name ?? null;
}

async function authorityHead(
  client: PostgresClient,
  tenantId: string,
): Promise<number | null> {
  const result = await client.query<{ commit_sequence: string }>(
    `SELECT commit_sequence::text
     FROM authority_heads
     WHERE tenant_id = $1`,
    [tenantId],
  );
  const row = result.rows[0];
  return row === undefined ? null : Number(row.commit_sequence);
}

async function membershipDelegation(
  client: PostgresClient,
  accountId: string,
  tenantId: string,
): Promise<unknown> {
  const result = await client.query<{ delegation_json: unknown }>(
    `SELECT delegation_json
     FROM memberships
     WHERE account_id = $1 AND tenant_id = $2 AND status = 'active'`,
    [accountId, tenantId],
  );
  assert.equal(result.rowCount, 1);
  return result.rows[0]?.delegation_json;
}

async function replaceMembershipActions(
  client: PostgresClient,
  accountId: string,
  tenantId: string,
  actionIds: readonly string[],
): Promise<void> {
  const result = await client.query(
    `UPDATE memberships
     SET delegation_json = jsonb_set(
       delegation_json,
       '{grants,0,actionIds}',
       $1::jsonb
     )
     WHERE account_id = $2 AND tenant_id = $3 AND status = 'active'`,
    [JSON.stringify(actionIds), accountId, tenantId],
  );
  assert.equal(result.rowCount, 1);
}

async function restoreMembershipDelegation(
  client: PostgresClient,
  accountId: string,
  tenantId: string,
  delegation: unknown,
): Promise<void> {
  const encoded = JSON.stringify(delegation);
  assert.ok(encoded);
  const result = await client.query(
    `UPDATE memberships
     SET delegation_json = $1::jsonb
     WHERE account_id = $2 AND tenant_id = $3 AND status = 'active'`,
    [encoded, accountId, tenantId],
  );
  assert.equal(result.rowCount, 1);
}

async function installOutboxFailure(client: PostgresClient): Promise<void> {
  await client.query(`
    CREATE FUNCTION e2e_fail_projection_outbox()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RAISE EXCEPTION 'injected outbox failure';
    END;
    $$;

    CREATE TRIGGER e2e_projection_outbox_failure
    BEFORE INSERT ON projection_outbox
    FOR EACH ROW
    EXECUTE FUNCTION e2e_fail_projection_outbox();
  `);
}

async function assertDeferredPublicationInvariant(
  client: PostgresClient,
  tenantId: string,
  definition: CompiledDefinition,
): Promise<void> {
  const before = await publicationState(client, tenantId);
  await client.query("BEGIN");
  try {
    await client.query(
      `INSERT INTO authority_commits (tenant_id, commit_sequence, commit_kind)
       VALUES ($1, 2, 'definition_publication')`,
      [tenantId],
    );
    await client.query(
      `INSERT INTO definition_revisions (
         tenant_id, definition_id, revision, digest, canonical_json, commit_sequence
       ) VALUES ($1, $2, $3, $4, $5, 2)`,
      [
        tenantId,
        definition.definition.definitionId,
        definition.definition.revision,
        definition.digest,
        definition.canonicalJson,
      ],
    );
    await assert.rejects(
      client.query("COMMIT"),
      /definition revision requires governed publication/,
    );
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
  }
  assert.deepEqual(await publicationState(client, tenantId), before);
}

async function removeOutboxFailure(client: PostgresClient): Promise<void> {
  await client.query(`
    DROP TRIGGER e2e_projection_outbox_failure ON projection_outbox;
    DROP FUNCTION e2e_fail_projection_outbox();
  `);
}

async function assertRlsIsolation(): Promise<void> {
  const application = new PostgresClient({
    connectionString: applicationDatabaseUrl,
  });
  await application.connect();
  try {
    await application.query("BEGIN");
    await application.query(
      "SELECT set_config('zoen.tenant_id', $1, true)",
      [tenantA],
    );
    for (const table of [
      "active_definition_revisions",
      "authority_commits",
      "definition_activation_grants",
      "definition_activations",
      "definition_publication_grants",
      "definition_publications",
      "definition_revisions",
      "projection_outbox",
    ]) {
      const result = await application.query<{ count: string }>(
        `SELECT count(*)::text AS count
         FROM ${table}
         WHERE tenant_id = $1`,
        [tenantB],
      );
      assert.equal(result.rows[0]?.count, "0");
    }
    await application.query("ROLLBACK");
  } finally {
    await application.end();
  }
}

async function processMetrics(): Promise<{
  admitCount: number;
  body: string;
  jcs: number;
}> {
  const response = await fetch(`${baseUrl}/metrics`);
  if (!response.ok) {
    throw new Error(`/metrics returned HTTP ${response.status}`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/plain")) {
    throw new Error(`/metrics content-type was ${contentType}`);
  }
  const body = await response.text();
  return {
    admitCount: metricCount(body, "zoen_admit_duration_seconds_count"),
    body,
    jcs: metricCount(body, "zoen_jcs_mismatch_total"),
  };
}

function metricCount(body: string, name: string): number {
  const prefix = `${name} `;
  const line = body.split("\n").find((entry) => entry.startsWith(prefix));
  if (line === undefined) {
    throw new Error(`/metrics omitted ${name}`);
  }
  const value = Number(line.slice(prefix.length));
  if (!Number.isFinite(value)) {
    throw new Error(`/metrics ${name} was not a number: ${line}`);
  }
  return value;
}

function encode(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function decode(value: Uint8Array): string {
  return new TextDecoder().decode(value);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
