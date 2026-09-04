import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";
import {
  Code,
  ConnectError,
  createClient,
  type Client,
  type Interceptor,
} from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import { Client as PostgresClient } from "pg";
import { DefinitionService } from "../gen/connect/zoen/definition/v1/definition_pb.js";
import { signUpSession } from "./ba-door.js";
import {
  loadCanonicalDefinition,
  loadCommercialLake,
} from "./canonical-definition.js";
import {
  e2eHttpUrl,
  e2ePort,
  writeScenarioArtifact,
} from "./host-env.js";
import {
  provisionWorldReleaseActors,
  releaseAuthorityPolicies,
  SEVEN_VERBS,
  type ReleaseAuthorizationPolicy,
  type WorldReleaseActors,
} from "./kernel-world-support.js";
import { gitHead } from "./scenario-evidence.js";

const scenario = "one-fly-image";
const repositoryRoot = process.cwd();
const composeFile = path.join("e2e", scenario, "compose.yaml");
const project = `zoen-${scenario}`;
const postgresPortFallback = 55_542;
const zoendPortFallback = 58_821;
const postgresPort = e2ePort("ZOEN_E2E_POSTGRES_PORT", postgresPortFallback);
const baseUrl = e2eHttpUrl("ZOEN_E2E_ZOEND_PORT", zoendPortFallback);
const tenantA = "tenant.a";
const tenantB = "tenant.b";
const workerIdentity = {
  actorId: "actor.effect-worker.a",
  principalId: "principal.effect-worker.a",
  tenantId: tenantA,
  workloadId: "workload.effect-worker",
} as const;
const assertions: Record<string, boolean> = {};
const failureInjections: string[] = [];
const worldReleaseFile = "/data/zoen/e2e/one-fly-world-release.json";

type DefinitionClient = Client<typeof DefinitionService>;

interface CommandResult {
  status: number;
  stderr: string;
  stdout: string;
}

interface WorldReleaseFixture {
  actors: WorldReleaseActors;
  digest: string;
  policyCatalogDigest: string;
  previewDigest: string;
}

interface WorldReleaseState {
  activeDigest: string | null;
  authorizationCount: number;
  decisionCount: number;
  previewCount: number;
  publicationCount: number;
  releaseCount: number;
}

function observe(name: string, condition: boolean): void {
  assert.ok(condition, name);
  assertions[name] = condition;
}

function inject(name: string): void {
  failureInjections.push(name);
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

const DOCKER_BIN = "/usr/bin/docker";
const FIXED_CHILD_PATH =
  "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";

function compose(args: readonly string[], input?: string): string {
  return execFileSync(
    DOCKER_BIN,
    ["compose", "--project-name", project, "--file", composeFile, ...args],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: { ...process.env, PATH: FIXED_CHILD_PATH },
      input,
    },
  );
}

function containerExec(args: readonly string[], input?: string): string {
  return compose(["exec", "-T", "zoen", ...args], input);
}

function containerExecResult(
  args: readonly string[],
  input?: string,
): CommandResult {
  try {
    return { status: 0, stderr: "", stdout: containerExec(args, input) };
  } catch (error) {
    const failure = error as {
      status?: number | null;
      stderr?: string | Buffer;
      stdout?: string | Buffer;
    };
    return {
      status: failure.status ?? 1,
      stderr: String(failure.stderr ?? ""),
      stdout: String(failure.stdout ?? ""),
    };
  }
}

function parseJsonObject(text: string, label: string): Record<string, unknown> {
  const parsed = JSON.parse(text) as unknown;
  assert.ok(
    typeof parsed === "object" && parsed !== null && !Array.isArray(parsed),
    `${label} must be a JSON object`,
  );
  return parsed as Record<string, unknown>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function runWorldReleaseCli(args: readonly string[]): Record<string, unknown> {
  const result = containerExecResult([
    "/usr/local/bin/zoen",
    "world",
    "release",
    ...args,
  ]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return parseJsonObject(result.stdout, `zoen world release ${args[0] ?? ""}`);
}

function bootPolicyEntries(): ReleaseAuthorizationPolicy[] {
  const manifest = parseJsonObject(
    containerExec(["cat", "/etc/zoen/policies.json"]),
    "one-Fly boot policy manifest",
  );
  assert.ok(Array.isArray(manifest.policies));
  return manifest.policies.map((value, index) => {
    assert.ok(
      typeof value === "object" && value !== null && !Array.isArray(value),
      `boot policy ${index} must be an object`,
    );
    const entry = value as Record<string, unknown>;
    const source = requiredString(entry.source, `boot policy ${index} source`);
    const digest = requiredString(entry.digest, `boot policy ${index} digest`);
    assert.equal(digest, sha256(source), `boot policy ${index} digest`);
    assert.equal(
      Number.isSafeInteger(entry.revision) && Number(entry.revision) > 0,
      true,
      `boot policy ${index} revision`,
    );
    return {
      actionId: requiredString(
        entry.actionId,
        `boot policy ${index} actionId`,
      ),
      definitionDigest: requiredString(
        entry.definitionDigest,
        `boot policy ${index} definitionDigest`,
      ),
      digest,
      policyId: requiredString(
        entry.policyId,
        `boot policy ${index} policyId`,
      ),
      revision: Number(entry.revision),
      source,
    };
  });
}

function worldReleaseDocument(bootPolicies: ReleaseAuthorizationPolicy[]): {
  content: string;
  policyCatalogDigest: string;
} {
  const policies = [...bootPolicies, ...releaseAuthorityPolicies()];
  const keys = policies.map(
    ({ actionId, definitionDigest }) => `${definitionDigest}:${actionId}`,
  );
  assert.equal(new Set(keys).size, keys.length, "policy bindings must be unique");
  const policy = `${JSON.stringify({
    schema: "zoen.policy-catalog.v1",
    authorization: { policies },
    membershipDelegation: [],
    sourceAdmission: [],
    computeBudgets: [],
  })}\n`;
  const content = `${JSON.stringify({
    world: tenantA,
    parent: null,
    ontology: {
      bytes: `${JSON.stringify({
        label: "tenant.a.one-fly",
        publicVerbs: [...SEVEN_VERBS],
        schema: "zoen.ontology-catalog.v1",
      })}\n`,
    },
    policy: { bytes: policy },
    executors: { bytes: "one-Fly ExecutorCatalog v1\n" },
    components: { bytes: "one-Fly ComponentCatalog v1\n" },
  })}\n`;
  return { content, policyCatalogDigest: sha256(policy) };
}

function writeWorldReleaseDocument(content: string): void {
  containerExec(
    [
      "sh",
      "-c",
      `umask 077; mkdir -p /data/zoen/e2e; cat > ${worldReleaseFile}; chmod 600 ${worldReleaseFile}`,
    ],
    content,
  );
}

async function worldReleaseState(
  admin: PostgresClient,
  world: string,
): Promise<WorldReleaseState> {
  const result = await admin.query<{
    active_digest: string | null;
    authorization_count: string;
    decision_count: string;
    preview_count: string;
    publication_count: string;
    release_count: string;
  }>(
    `SELECT
       (SELECT digest FROM world_active_releases WHERE world_id = $1) AS active_digest,
       (SELECT COUNT(*)::text FROM world_releases WHERE world_id = $1) AS release_count,
       (SELECT COUNT(*)::text
          FROM world_release_publications publication
          JOIN world_releases release ON release.digest = publication.digest
         WHERE release.world_id = $1) AS publication_count,
       (SELECT COUNT(*)::text FROM world_release_previews WHERE world_id = $1) AS preview_count,
       (SELECT COUNT(*)::text FROM world_release_decisions WHERE world_id = $1) AS decision_count,
       (SELECT COUNT(*)::text FROM world_release_authorizations WHERE world_id = $1) AS authorization_count`,
    [world],
  );
  const row = result.rows[0];
  assert.ok(row);
  return {
    activeDigest: row.active_digest,
    authorizationCount: Number(row.authorization_count),
    decisionCount: Number(row.decision_count),
    previewCount: Number(row.preview_count),
    publicationCount: Number(row.publication_count),
    releaseCount: Number(row.release_count),
  };
}

async function plantActiveWorldRelease(
  admin: PostgresClient,
): Promise<WorldReleaseFixture> {
  const bootPolicies = bootPolicyEntries();
  const releasePolicies = releaseAuthorityPolicies();
  const document = worldReleaseDocument(bootPolicies);
  writeWorldReleaseDocument(document.content);
  observe(
    "worldReleasePolicyCatalogRetainsExactBootPolicies",
    bootPolicies.length > 0 &&
      bootPolicies.every((entry) => entry.digest === sha256(entry.source)),
  );
  observe(
    "worldReleasePolicyCatalogAddsReleaseAuthority",
    releasePolicies.length === 4 &&
      releasePolicies.every((entry) => entry.digest === sha256(entry.source)),
  );

  const actors = await provisionWorldReleaseActors({
    baseUrl,
    subjectKey: "one-fly",
    world: tenantA,
  });
  observe(
    "worldReleaseUsesDistinctDurableBuilderAndOwnerMemberships",
    actors.builder.membership !== actors.owner.membership &&
      actors.builder.principal !== actors.owner.principal,
  );

  const constructed = runWorldReleaseCli(["construct", "--file", worldReleaseFile]);
  const digest = requiredString(constructed.digest, "WorldRelease digest");
  observe(
    "worldReleaseDigestBindsFourCatalogs",
    digest.length === 64 &&
      [
        constructed.ontology,
        constructed.policy,
        constructed.executors,
        constructed.components,
      ].every((catalogDigest) =>
        /^[0-9a-f]{64}$/.test(requiredString(catalogDigest, "catalog digest")),
      ) &&
      constructed.policy === document.policyCatalogDigest,
  );

  const published = runWorldReleaseCli([
    "publish",
    "--file",
    worldReleaseFile,
    "--principal",
    actors.builder.principal,
    "--membership",
    actors.builder.membership,
  ]);
  const publication = published.publication as Record<string, unknown> | undefined;
  observe(
    "worldReleasePublicationStoresBuilderPolicyEvidence",
    published.digest === digest &&
      published.replay === false &&
      publication?.publishedBy === actors.builder.principal &&
      typeof publication.policy === "object",
  );

  const previewed = runWorldReleaseCli([
    "preview",
    "--world",
    tenantA,
    "--digest",
    digest,
    "--principal",
    actors.owner.principal,
    "--membership",
    actors.owner.membership,
  ]);
  const previewDigest = requiredString(
    previewed.previewDigest,
    "WorldRelease preview digest",
  );
  observe(
    "worldReleaseOwnerPreviewsFirstActiveCandidate",
    previewed.digest === digest &&
      previewed.world === tenantA &&
      previewed.currentActive === null &&
      previewed.replay === false,
  );

  const decided = runWorldReleaseCli([
    "decide",
    "--preview-digest",
    previewDigest,
    "--principal",
    actors.owner.principal,
    "--membership",
    actors.owner.membership,
    "--decision",
    "approve",
  ]);
  observe(
    "worldReleaseOwnerApprovesPreview",
    decided.decision === "approve" &&
      decided.decidedBy === actors.owner.principal &&
      decided.previewDigest === previewDigest &&
      decided.replay === false,
  );

  const activated = runWorldReleaseCli([
    "activate",
    "--world",
    tenantA,
    "--digest",
    digest,
    "--preview-digest",
    previewDigest,
    "--principal",
    actors.owner.principal,
    "--membership",
    actors.owner.membership,
  ]);
  observe(
    "worldReleaseOwnerActivatesGovernedCandidate",
    activated.activated === true &&
      activated.digest === digest &&
      activated.previousDigest === null &&
      activated.replay === false &&
      activated.world === tenantA,
  );

  const beforeReplay = await worldReleaseState(admin, tenantA);
  const replayed = runWorldReleaseCli([
    "activate",
    "--world",
    tenantA,
    "--digest",
    digest,
    "--preview-digest",
    previewDigest,
    "--principal",
    actors.owner.principal,
    "--membership",
    actors.owner.membership,
  ]);
  const afterReplay = await worldReleaseState(admin, tenantA);
  observe(
    "worldReleaseActivationReplayReturnsOriginalWithoutDuplicateState",
    replayed.replay === true &&
      replayed.digest === digest &&
      JSON.stringify(afterReplay) === JSON.stringify(beforeReplay),
  );
  return {
    actors,
    digest,
    policyCatalogDigest: document.policyCatalogDigest,
    previewDigest,
  };
}

async function waitFor(
  probe: () => Promise<boolean>,
  label: string,
  timeoutSeconds = 180,
): Promise<void> {
  const deadline = Date.now() + timeoutSeconds * 1_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      if (await probe()) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await delay(500);
  }
  const detail =
    lastError instanceof Error ? lastError.message : JSON.stringify(lastError);
  throw new Error(`${label} timed out: ${detail}`);
}

async function fetchText(
  url: string,
): Promise<{ body: string; status: number }> {
  const response = await fetch(url);
  return { body: await response.text(), status: response.status };
}

function definitionClient(
  token: string,
  tenantId: string,
): DefinitionClient {
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

async function expectConnectCode(
  operation: () => Promise<unknown>,
  code: Code,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    if (error instanceof ConnectError && error.code === code) {
      return;
    }
    throw error;
  }
  throw new Error(`expected ConnectError ${Code[code]}`);
}

async function publicationCount(
  admin: PostgresClient,
  tenantId: string,
): Promise<number> {
  const result = await admin.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM definition_publications WHERE tenant_id = $1",
    [tenantId],
  );
  return Number(result.rows[0]?.count);
}

async function issueWorkerCredential(operatorToken: string): Promise<string> {
  const response = await fetch(`${baseUrl}/workload/admin/credentials`, {
    body: JSON.stringify({
      actorId: workerIdentity.actorId,
      allowedIngress: [],
      delegation: [
        {
          actions: ["zoen.effect.execute"],
          id: "delegation.workload.effect-worker",
          resources: ["zoen.effect.requests"],
        },
      ],
      expiresAtMicros: 4_102_444_800_000_000,
      principalId: workerIdentity.principalId,
      rateBudget: {
        maxAcceptsPerMinute: 120,
        maxCommitsPerHour: 120,
      },
      tenantId: workerIdentity.tenantId,
      workloadId: workerIdentity.workloadId,
    }),
    headers: {
      authorization: `Bearer ${operatorToken}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
  const text = await response.text();
  assert.equal(
    response.ok,
    true,
    `workload credential issue failed: HTTP ${response.status} ${text}`,
  );
  const body = JSON.parse(text) as { apiKeyOnce?: string };
  assert.equal(typeof body.apiKeyOnce, "string");
  assert.ok(body.apiKeyOnce);
  return body.apiKeyOnce;
}

function writeWorkerApiKey(apiKey: string): void {
  containerExec(
    [
      "sh",
      "-c",
      "umask 077; mkdir -p /data/zoen; cat > /data/zoen/effect-worker.api-key; chmod 600 /data/zoen/effect-worker.api-key",
    ],
    apiKey.endsWith("\n") ? apiKey : `${apiKey}\n`,
  );
}

function supervisorctl(command: string, program: string): string {
  return containerExec(["supervisorctl", command, program]);
}

function projectionEnvironment(): string {
  const pid = containerExec(["supervisorctl", "pid", "projection"]).trim();
  assert.match(pid, /^[1-9]\d*$/);
  return containerExec([
    "sh",
    "-c",
    String.raw`tr '\0' '\n' < /proc/${pid}/environ`,
  ]);
}

/** Exact KEY= match — substring includes("DATABASE_URL=") false-positives on ZOEN_PROJECTION_DATABASE_URL. */
function environHasKey(environ: string, key: string): boolean {
  return environ.split("\n").some((line) => line.startsWith(`${key}=`));
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const postgresPassword = requiredEnv("POSTGRES_PASSWORD");
  const adminDatabaseUrl = `postgres://postgres:${postgresPassword}@127.0.0.1:${postgresPort}/zoen`;
  const commercial = await loadCommercialLake(repositoryRoot);
  const personal = await loadCanonicalDefinition(
    path.join(
      repositoryRoot,
      "testdata",
      "lakes",
      "personal.canonical.json",
    ),
  );
  const admin = new PostgresClient({ connectionString: adminDatabaseUrl });
  await waitFor(async () => {
    const live = await fetchText(`${baseUrl}/live`);
    return live.status === 200 && live.body === "live\n";
  }, "one-Fly image /live", 240);
  observe("imageBootsFromEmptyVolume", true);

  await waitFor(() => {
    const token = containerExec(["cat", "/data/zoen/agent.token"]).trim();
    return Promise.resolve(token.length > 0);
  }, "agent remint token", 180);
  const agentToken = containerExec(["cat", "/data/zoen/agent.token"]).trim();
  observe("agentTokenMaterialized", agentToken.length > 0);

  await waitFor(() => {
    const personalReady = containerExec([
      "sh",
      "-c",
      "test -s /data/zoen/personal.lake.ready && test -s /data/zoen/commercial.lake.ready",
    ]);
    return Promise.resolve(personalReady === "");
  }, "lake publish and activate", 180);

  await admin.connect();
  try {
    const agent = definitionClient(agentToken, tenantA);
    const commercialActive = await agent.getActiveRevision({
      definitionId: commercial.definition.definitionId,
      tenantId: tenantA,
    });
    observe(
      "commercialDefinitionRevisionActivated",
      commercialActive.definitionRevision?.digest === commercial.digest,
    );
    const personalActive = await agent.getActiveRevision({
      definitionId: personal.definition.definitionId,
      tenantId: tenantA,
    });
    observe(
      "personalDefinitionRevisionActivated",
      personalActive.definitionRevision?.digest === personal.digest,
    );

    const stored = await admin.query<{
      definition_id: string;
      digest: string;
      policy_digest: string;
      policy_id: string;
    }>(
      `SELECT definition_id, digest, policy_digest, policy_id
       FROM definition_publications
       WHERE tenant_id = $1
       ORDER BY definition_id`,
      [tenantA],
    );
    observe(
      "definitionPublicationStoresPolicyEvidence",
      stored.rows.length === 2 &&
        stored.rows.every(
          (row) =>
            row.policy_digest.length === 64 && row.policy_id.length > 0,
        ),
    );
    const beforeReplay = await publicationCount(admin, tenantA);
    const replayed = await agent.publish({
      canonicalJson: new TextEncoder().encode(commercial.canonicalJson),
      digest: commercial.digest,
      tenantId: tenantA,
    });
    observe(
      "identicalDefinitionCandidateReplayReturnsOriginal",
      replayed.publication?.revision?.digest === commercial.digest &&
        (await publicationCount(admin, tenantA)) === beforeReplay,
    );

    const unbound = await signUpSession({
      id: "unbound-one-fly",
      zoendBaseUrl: baseUrl,
    });
    await expectConnectCode(
      () =>
        definitionClient(unbound.token, tenantA).publish({
          canonicalJson: new TextEncoder().encode(commercial.canonicalJson),
          digest: commercial.digest,
          tenantId: tenantA,
        }),
      Code.PermissionDenied,
    );
    observe(
      "unboundCallerDeniedBeforeCommit",
      (await publicationCount(admin, tenantA)) === beforeReplay,
    );
    inject("unbound membership publishes a DefinitionRevision");

    await expectConnectCode(
      () =>
        agent.publish({
          canonicalJson: new TextEncoder().encode(commercial.canonicalJson),
          digest: commercial.digest,
          tenantId: tenantB,
        }),
      Code.PermissionDenied,
    );
    observe(
      "crossWorldPublishDenied",
      (await publicationCount(admin, tenantB)) === 0,
    );
    inject("tenant.a agent publishes for tenant.b");

    const mutatedJson = commercial.canonicalJson.replace(
      '"operator":"subtract"',
      '"operator":"add"',
    );
    assert.notEqual(mutatedJson, commercial.canonicalJson);
    await expectConnectCode(
      () =>
        agent.publish({
          canonicalJson: new TextEncoder().encode(mutatedJson),
          digest: sha256(mutatedJson),
          tenantId: tenantA,
        }),
      Code.FailedPrecondition,
    );
    observe(
      "missingDefinitionPolicyFailsBeforeCommit",
      (await publicationCount(admin, tenantA)) === beforeReplay,
    );
    inject("publish DefinitionRevision without matching Cedar evidence");

    // Already-active digest is idempotent (#546); a stale expectedActiveDigest
    // must not move the pointer.
    const idempotent = await agent.activateRevision({
      activeRevisionPrecondition: {
        case: "expectedActiveDigest",
        value: "cd".repeat(32),
      },
      definitionId: commercial.definition.definitionId,
      digest: commercial.digest,
      tenantId: tenantA,
    });
    const stillActive = await agent.getActiveRevision({
      definitionId: commercial.definition.definitionId,
      tenantId: tenantA,
    });
    observe(
      "alreadyActiveActivateKeepsPointer",
      idempotent.activation?.active?.digest === commercial.digest &&
        stillActive.definitionRevision?.digest === commercial.digest,
    );
    inject("stale expectedActiveDigest overwrites the DefinitionRevision pointer");

    const readyBeforeRelease = await fetchText(`${baseUrl}/ready`);
    observe(
      "readyFailsClosedWithoutActiveWorldRelease",
      readyBeforeRelease.status === 503 &&
        readyBeforeRelease.body.includes("active WorldRelease is missing"),
    );
    inject("image reports ready without an active WorldRelease");

    const worldRelease = await plantActiveWorldRelease(admin);

    const readyBeforeCredential = await fetchText(`${baseUrl}/ready`);
    observe(
      "readyClosedUntilZoenEffectRegisters",
      readyBeforeCredential.status === 503 &&
        readyBeforeCredential.body.includes(
          "ZoenEffect handler registration is missing",
        ) &&
        !readyBeforeCredential.body.includes("active WorldRelease is missing"),
    );
    inject("image reports ready before ZoenEffect registration");

    const apiKey = await issueWorkerCredential(agentToken);
    writeWorkerApiKey(apiKey);
    await waitFor(async () => {
      const ready = await fetchText(`${baseUrl}/ready`);
      return ready.status === 200 && ready.body === "ready\n";
    }, "product /ready after ZoenEffect registration", 180);
    observe("readyPassesWhenProductDependenciesAreLive", true);

    supervisorctl("stop", "projection");
    await waitFor(async () => {
      const ready = await fetchText(`${baseUrl}/ready`);
      return (
        ready.status === 503 &&
        ready.body.includes("projection watermark is stale")
      );
    }, "stopped projection makes /ready fail", 30);
    observe("stoppedProjectionFailsReady", true);
    inject("stopped projection keeps /ready 200");
    supervisorctl("start", "projection");
    await waitFor(async () => {
      const ready = await fetchText(`${baseUrl}/ready`);
      return ready.status === 200 && ready.body === "ready\n";
    }, "projection watermark recovered", 60);

    supervisorctl("stop", "eve");
    await waitFor(async () => {
      const ready = await fetchText(`${baseUrl}/ready`);
      return ready.status === 503 && ready.body.includes("Eve is missing");
    }, "stopped Eve makes /ready fail", 20);
    observe("stoppedEveFailsReady", true);
    inject("stopped Eve keeps /ready 200");
    supervisorctl("start", "eve");
    await waitFor(async () => {
      const ready = await fetchText(`${baseUrl}/ready`);
      return ready.status === 200 && ready.body === "ready\n";
    }, "Eve recovered", 60);

    supervisorctl("stop", "effect-registrar");
    await waitFor(async () => {
      const ready = await fetchText(`${baseUrl}/ready`);
      return (
        ready.status === 503 &&
        ready.body.includes("ZoenEffect handler registration is missing")
      );
    }, "missing handler makes /ready fail", 20);
    observe("missingHandlerFailsReady", true);
    inject("missing registrar keeps /ready 200");
    supervisorctl("start", "effect-registrar");
    await waitFor(async () => {
      const ready = await fetchText(`${baseUrl}/ready`);
      return ready.status === 200 && ready.body === "ready\n";
    }, "ZoenEffect registration recovered", 60);

    const role = await admin.query<{
      rolbypassrls: boolean;
      rolname: string;
      rolsuper: boolean;
    }>(
      `SELECT rolname, rolsuper, rolbypassrls
       FROM pg_roles
       WHERE rolname = 'zoen_projection'`,
    );
    observe(
      "projectionRoleIsLeastPrivilege",
      role.rows.length === 1 &&
        role.rows[0]?.rolsuper === false &&
        role.rows[0]?.rolbypassrls === false,
    );
    const projectionEnv = projectionEnvironment();
    observe(
      "projectionProcessDropsAmbientDatabaseCredentials",
      !environHasKey(projectionEnv, "DATABASE_URL") &&
        !environHasKey(projectionEnv, "ZOEN_APP_PASSWORD") &&
        !environHasKey(projectionEnv, "POSTGRES_PASSWORD") &&
        environHasKey(projectionEnv, "ZOEN_PROJECTION_DATABASE_URL"),
    );

    const publicationsBeforeRestart = await publicationCount(admin, tenantA);
    const worldReleaseBeforeRestart = await worldReleaseState(admin, tenantA);
    await admin.end();
    compose(["restart", "zoen"]);
    await waitFor(async () => {
      const live = await fetchText(`${baseUrl}/live`);
      return live.status === 200 && live.body === "live\n";
    }, "restarted image /live", 180);
    await waitFor(async () => {
      const ready = await fetchText(`${baseUrl}/ready`);
      return ready.status === 200 && ready.body === "ready\n";
    }, "restart returns /ready after recovery", 180);
    observe("restartRecoversReady", true);
    const recoveredToken = containerExec(["cat", "/data/zoen/agent.token"]).trim();
    const recoveredAgent = definitionClient(recoveredToken, tenantA);
    const recoveredAdmin = new PostgresClient({
      connectionString: adminDatabaseUrl,
    });
    await recoveredAdmin.connect();
    try {
      const recovered = await recoveredAgent.getActiveRevision({
        definitionId: commercial.definition.definitionId,
        tenantId: tenantA,
      });
      observe(
        "restartPreservesActiveDefinitionRevision",
        recovered.definitionRevision?.digest === commercial.digest,
      );
      observe(
        "restartDoesNotDuplicatePublications",
        (await publicationCount(recoveredAdmin, tenantA)) ===
          publicationsBeforeRestart,
      );
      const recoveredWorldRelease = runWorldReleaseCli([
        "active",
        "--world",
        tenantA,
      ]);
      observe(
        "restartPreservesActiveWorldReleaseAndFourCatalogBinding",
        recoveredWorldRelease.digest === worldRelease.digest &&
          recoveredWorldRelease.active === true &&
          recoveredWorldRelease.policy === worldRelease.policyCatalogDigest,
      );
      const worldReleaseAfterRestart = await worldReleaseState(
        recoveredAdmin,
        tenantA,
      );
      observe(
        "restartPreservesWorldReleaseAuthorityWithoutDuplicates",
        JSON.stringify(worldReleaseAfterRestart) ===
          JSON.stringify(worldReleaseBeforeRestart),
      );
      const replayAfterRestart = runWorldReleaseCli([
        "activate",
        "--world",
        tenantA,
        "--digest",
        worldRelease.digest,
        "--preview-digest",
        worldRelease.previewDigest,
        "--principal",
        worldRelease.actors.owner.principal,
        "--membership",
        worldRelease.actors.owner.membership,
      ]);
      observe(
        "restartReauthorizesWorldReleaseReplayWithoutMutation",
        replayAfterRestart.replay === true &&
          replayAfterRestart.digest === worldRelease.digest &&
          JSON.stringify(await worldReleaseState(recoveredAdmin, tenantA)) ===
            JSON.stringify(worldReleaseAfterRestart),
      );
    } finally {
      await recoveredAdmin.end().catch(() => undefined);
    }

    const canonicalJourneyVerdict = "NOT_EVALUATED" as const;
    const journeyCoverage = {
      J1: {
        proofPending: [
          "the RAT-04 atomic first-World bootstrap ceremony and one-shot capability removal",
          "same-World non-builder, missing-candidate-policy, stale activation, and cross-World WorldRelease refusal in this production image",
          "a crash between WorldRelease publication and activation followed by governed retry",
        ],
        proven: [
          "distinct invited Builder and Owner Memberships govern production CLI publication, preview, decision, and activation",
          "the active ReleaseDigest binds ontology, policy, executor, and component catalogs",
          "identical activation reauthorizes the durable Owner Membership and creates no duplicate governed state",
        ],
        status: "SUBSTRATE_ONLY",
      },
      J8: {
        proofPending: [
          "broken Better Auth and a corrupt or stale active WorldRelease fail closed in this same image run",
          "the complete J8 ceremony after W1-03, W1-04, and W1-06 canonical proof dependencies close",
        ],
        proven: [
          "the image refuses readiness without an active WorldRelease and reaches readiness only after release, projection, Eve, and ZoenEffect authority are live",
          "stopped projection, Eve, and ZoenEffect registration fail readiness closed and recover",
          "application restart preserves the exact active four-catalog release, reauthorizes replay, and creates no duplicate release state",
        ],
        status: "SUBSTRATE_ONLY",
      },
    } as const;
    observe(
      "artifactDeclaresCanonicalJourneyBoundary",
      canonicalJourneyVerdict === "NOT_EVALUATED" &&
        journeyCoverage.J1.status === "SUBSTRATE_ONLY" &&
        journeyCoverage.J8.status === "SUBSTRATE_ONLY" &&
        journeyCoverage.J1.proofPending.length > 0 &&
        journeyCoverage.J8.proofPending.length > 0,
    );
    const sourceCommit = gitHead(repositoryRoot);
    const artifactPath = await writeScenarioArtifact(
      repositoryRoot,
      scenario,
      {
        assertions,
        canonicalJourneyVerdict,
        dimensions: {
          actors:
            "a Better Auth-backed invited Builder Membership publishes; a distinct invited Owner Membership previews, decides, and activates through the production CLI",
          isolation:
            "the active release is bound to tenant.a while the projection process runs under a distinct least-privilege role without ambient authority credentials",
          negative:
            "missing active WorldRelease, stopped projection, missing Eve, and missing ZoenEffect registration fail readiness closed; DefinitionRevision policy and Membership denials remain covered separately",
          path: "boot the production image from an empty volume → publish legacy lake DefinitionRevisions → publish, preview, approve, and activate one four-catalog WorldRelease → register ZoenEffect → /ready",
          recovery:
            "dependency processes recover, then an application restart returns /ready with the same active WorldRelease, DefinitionRevisions, and authority row counts",
          replay:
            "identical WorldRelease activation before and after restart reauthorizes the durable Owner Membership, reports replay, and leaves governed release state unchanged",
        },
        failureInjections,
        finishedAt: new Date().toISOString(),
        image: process.env.ZOEN_ONE_FLY_IMAGE ?? "zoen:one-fly",
        journeyCoverage,
        journeys: ["J1", "J8"],
        scenario,
        sourceCommit,
        startedAt,
        worldRelease: {
          digest: worldRelease.digest,
          policyCatalogDigest: worldRelease.policyCatalogDigest,
          previewDigest: worldRelease.previewDigest,
        },
      },
    );
    process.stdout.write(
      `${scenario} PASS artifact=${artifactPath} head=${sourceCommit}\n`,
    );
  } finally {
    await admin.end().catch(() => undefined);
  }
}

try {
  await main();
} catch (error: unknown) {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
}
