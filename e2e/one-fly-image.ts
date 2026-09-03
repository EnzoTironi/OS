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
import { gitHead } from "./scenario-evidence.js";

const scenario = "one-fly-image";
const repositoryRoot = process.cwd();
const composeFile = path.join("e2e", scenario, "compose.yaml");
const project = `zoen-${scenario}`;
const postgresPortFallback = 55_490;
const zoendPortFallback = 58_801;
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

type DefinitionClient = Client<typeof DefinitionService>;

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

function compose(args: readonly string[], input?: string): string {
  return execFileSync(
    "docker",
    ["compose", "--project-name", project, "--file", composeFile, ...args],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      input,
    },
  );
}

function containerExec(args: readonly string[], input?: string): string {
  return compose(["exec", "-T", "zoen", ...args], input);
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
  assert.match(pid, /^[1-9][0-9]*$/);
  return containerExec(["sh", "-c", `tr '\\0' '\\n' < /proc/${pid}/environ`]);
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
      "commercialWorldReleaseActivated",
      commercialActive.definitionRevision?.digest === commercial.digest,
    );
    const personalActive = await agent.getActiveRevision({
      definitionId: personal.definition.definitionId,
      tenantId: tenantA,
    });
    observe(
      "personalWorldReleaseActivated",
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
      "candidatePublicationStoresPolicyEvidence",
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
      "identicalCandidateReplayReturnsOriginal",
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
    inject("unbound membership publishes a WorldRelease");

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
      "missingPolicyFailsBeforeCommit",
      (await publicationCount(admin, tenantA)) === beforeReplay,
    );
    inject("publish without matching Cedar evidence");

    await expectConnectCode(
      () =>
        agent.activateRevision({
          activeRevisionPrecondition: {
            case: "expectedActiveDigest",
            value: "cd".repeat(32),
          },
          definitionId: commercial.definition.definitionId,
          digest: commercial.digest,
          tenantId: tenantA,
        }),
      Code.FailedPrecondition,
    );
    const stillActive = await agent.getActiveRevision({
      definitionId: commercial.definition.definitionId,
      tenantId: tenantA,
    });
    observe(
      "staleActivationFails",
      stillActive.definitionRevision?.digest === commercial.digest,
    );
    inject("stale expectedActiveDigest overwrites the pointer");

    const readyBeforeCredential = await fetchText(`${baseUrl}/ready`);
    observe(
      "readyClosedUntilZoenEffectRegisters",
      readyBeforeCredential.status === 503 &&
        readyBeforeCredential.body.includes(
          "ZoenEffect handler registration is missing",
        ),
    );
    inject("empty volume reports ready before ZoenEffect registration");

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
      !projectionEnv.includes("DATABASE_URL=") &&
        !projectionEnv.includes("ZOEN_APP_PASSWORD=") &&
        !projectionEnv.includes("POSTGRES_PASSWORD=") &&
        projectionEnv.includes("ZOEN_PROJECTION_DATABASE_URL="),
    );

    const publicationsBeforeRestart = await publicationCount(admin, tenantA);
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
    const recoveredAdmin = new PostgresClient({
      connectionString: adminDatabaseUrl,
    });
    await recoveredAdmin.connect();
    try {
      const recovered = await agent.getActiveRevision({
        definitionId: commercial.definition.definitionId,
        tenantId: tenantA,
      });
      observe(
        "restartPreservesActiveRelease",
        recovered.definitionRevision?.digest === commercial.digest,
      );
      observe(
        "restartDoesNotDuplicatePublications",
        (await publicationCount(recoveredAdmin, tenantA)) ===
          publicationsBeforeRestart,
      );
    } finally {
      await recoveredAdmin.end().catch(() => undefined);
    }

    const artifactPath = await writeScenarioArtifact(
      repositoryRoot,
      scenario,
      {
        assertions,
        failureInjections,
        finishedAt: new Date().toISOString(),
        image: process.env.ZOEN_ONE_FLY_IMAGE ?? "zoen:one-fly",
        journeys: ["J1", "J8"],
        scenario,
        startedAt,
      },
    );
    process.stdout.write(
      `${scenario} PASS artifact=${artifactPath} head=${gitHead(repositoryRoot)}\n`,
    );
  } finally {
    await admin.end().catch(() => undefined);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
