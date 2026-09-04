import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import path from "node:path";
import { Client as PostgresClient } from "pg";
import { e2eHttpUrl, e2eIdentityAdminToken, e2eListenAddr } from "./host-env.js";

export const WORLD_DEFINITION_DIGEST = "a".repeat(64);
export const WORLD_ACTION_ID = "zoen.world.discover";
export const RELEASE_AUTHORITY_DEFINITION_DIGEST =
  "e39d2372b5e94449657447a9a2109ed5e5f2e18bc424639ee25627e849f03862";
export const RELEASE_AUTHORITY_ACTIONS = [
  { actionId: "zoen.world.release.publish", operation: "publish_release" },
  { actionId: "zoen.world.release.preview", operation: "preview_release" },
  { actionId: "zoen.world.release.decide", operation: "decide_release" },
  { actionId: "zoen.world.release.activate", operation: "activate_release" },
] as const;
export const SEVEN_VERBS = [
  "Discover",
  "Query",
  "Propose",
  "Decide",
  "Commit",
  "Explain",
  "Execute",
] as const;
export const KERNEL_SURFACES = ["cli", "connect", "mcp", "eve"] as const;

export interface ZoenResult {
  status: number | null;
  stdout: string;
  stderr: string;
  body?: Record<string, unknown>;
}

export interface ReleaseActor {
  membership: string;
  principal: string;
}

export interface ReleaseAuthorizationPolicy {
  actionId: string;
  definitionDigest: string;
  digest: string;
  policyId: string;
  revision: number;
  source: string;
}

export function releaseAuthorityPolicies(): ReleaseAuthorizationPolicy[] {
  return RELEASE_AUTHORITY_ACTIONS.map(({ actionId, operation }) => {
    const source = `permit (
    principal,
    action == Action::"${operation}",
    resource
)
when {
    context.actionId == "${actionId}"
};
`;
    return {
      actionId,
      definitionDigest: RELEASE_AUTHORITY_DEFINITION_DIGEST,
      digest: createHash("sha256").update(source).digest("hex"),
      policyId: `policy.world.release.${operation}.r1`,
      revision: 1,
      source,
    };
  });
}

export function zoenBinaryPath(repositoryRoot: string): string {
  const targetDir = process.env.CARGO_TARGET_DIR ?? path.join(repositoryRoot, "target");
  return path.join(targetDir, "debug", "zoen");
}

export function ontologyCatalogBytes(label: string): string {
  return `${JSON.stringify({
    label,
    publicVerbs: [...SEVEN_VERBS],
    schema: "zoen.ontology-catalog.v1",
  })}\n`;
}

export function buildDiscoverPolicyCatalog(): {
  bytes: string;
  policyDigest: string;
} {
  const source = `permit (
    principal,
    action == Action::"discover",
    resource
)
when {
    context.actionId == "${WORLD_ACTION_ID}"
};
`;
  const policyDigest = createHash("sha256").update(source).digest("hex");
  const bytes = `${JSON.stringify({
    schema: "zoen.policy-catalog.v1",
    authorization: {
      policies: [
        {
          actionId: WORLD_ACTION_ID,
          definitionDigest: WORLD_DEFINITION_DIGEST,
          digest: policyDigest,
          policyId: "policy.world.discover.r1",
          revision: 1,
          source,
        },
        ...releaseAuthorityPolicies(),
      ],
    },
    membership: [],
    sourceAdmission: [],
  })}\n`;
  return { bytes, policyDigest };
}

export function createZoenRunner(zoenPath: string, databaseUrl: string) {
  function runZoen(args: string[]): ZoenResult {
    try {
      const stdout = execFileSync(zoenPath, args, {
        encoding: "utf8",
        env: { ...process.env, DATABASE_URL: databaseUrl },
      });
      return { status: 0, stdout, stderr: "" };
    } catch (error) {
      const failure = error as {
        status?: number | null;
        stdout?: string;
        stderr?: string;
      };
      return {
        status: failure.status ?? 1,
        stdout: failure.stdout ?? "",
        stderr: failure.stderr ?? String(error),
      };
    }
  }

  function parseJson(text: string): Record<string, unknown> {
    return JSON.parse(text) as Record<string, unknown>;
  }

  function withBody(result: ZoenResult): ZoenResult {
    if (result.status === 0 && result.stdout.trim() !== "") {
      return { ...result, body: parseJson(result.stdout) };
    }
    return result;
  }

  function construct(file: string): Record<string, unknown> {
    const result = runZoen(["world", "release", "construct", "--file", file]);
    assert.equal(result.status, 0, result.stderr);
    return parseJson(result.stdout);
  }

  function publish(file: string, actor: ReleaseActor): ZoenResult {
    return runZoen([
      "world",
      "release",
      "publish",
      "--file",
      file,
      "--principal",
      actor.principal,
      "--membership",
      actor.membership,
    ]);
  }

  function preview(world: string, digest: string, actor: ReleaseActor): ZoenResult {
    return withBody(
      runZoen([
        "world",
        "release",
        "preview",
        "--world",
        world,
        "--digest",
        digest,
        "--principal",
        actor.principal,
        "--membership",
        actor.membership,
      ]),
    );
  }

  function decideRelease(
    previewDigest: string,
    actor: ReleaseActor,
    decision: "approve" | "reject",
  ): ZoenResult {
    return runZoen([
      "world",
      "release",
      "decide",
      "--preview-digest",
      previewDigest,
      "--principal",
      actor.principal,
      "--membership",
      actor.membership,
      "--decision",
      decision,
    ]);
  }

  function activate(
    world: string,
    digest: string,
    actor: ReleaseActor,
    previewDigest: string,
  ): ZoenResult {
    return runZoen([
      "world",
      "release",
      "activate",
      "--world",
      world,
      "--digest",
      digest,
      "--preview-digest",
      previewDigest,
      "--principal",
      actor.principal,
      "--membership",
      actor.membership,
    ]);
  }

  function approveAndActivate(
    world: string,
    digest: string,
    actor: ReleaseActor,
  ): { preview: Record<string, unknown>; activate: ZoenResult } {
    const previewed = preview(world, digest, actor);
    assert.equal(previewed.status, 0, previewed.stderr);
    const previewDigest = asString(previewed.body?.previewDigest);
    assert.equal(decideRelease(previewDigest, actor, "approve").status, 0);
    const activated = activate(world, digest, actor, previewDigest);
    assert.equal(activated.status, 0, activated.stderr);
    return { preview: previewed.body ?? {}, activate: activated };
  }

  return {
    activate,
    approveAndActivate,
    construct,
    decideRelease,
    parseJson,
    preview,
    publish,
    runZoen,
    withBody,
  };
}

export interface PersonalReleaseOwner extends ReleaseActor {
  world: string;
}

export interface ReleaseIdentityServer {
  baseUrl: string;
  process: ChildProcessWithoutNullStreams;
}

export async function startReleaseIdentityServer(input: {
  databaseUrl: string;
  generatedDirectory: string;
  portFallback: number;
  zoenPath: string;
}): Promise<ReleaseIdentityServer> {
  await mkdir(input.generatedDirectory, { recursive: true });
  const policyManifest = path.join(input.generatedDirectory, "release-identity-policies.json");
  await writeFile(policyManifest, '{"policies":[]}\n');
  const baseUrl = e2eHttpUrl("ZOEN_E2E_ZOEND_PORT", input.portFallback);
  const child = spawn(input.zoenPath, ["serve"], {
    env: {
      ...process.env,
      DATABASE_URL: input.databaseUrl,
      ZOEN_AUTH_DATABASE_URL: input.databaseUrl,
      ZOEN_CEDAR_POLICY_MANIFEST: policyManifest,
      ZOEN_IDENTITY_ADMIN_TOKEN: e2eIdentityAdminToken(),
      ZOEN_LISTEN_ADDR: e2eListenAddr("ZOEN_E2E_ZOEND_PORT", input.portFallback),
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdin.end();
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  const port = Number(new URL(baseUrl).port);
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`zoend exited during release identity setup:\n${output}`);
    }
    if (await portAcceptsConnections(port)) {
      return { baseUrl, process: child };
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, 100));
  }
  child.kill("SIGKILL");
  throw new Error(`zoend did not listen for release identity setup:\n${output}`);
}

export async function stopReleaseIdentityServer(server: ReleaseIdentityServer): Promise<void> {
  if (server.process.exitCode !== null || server.process.signalCode !== null) {
    return;
  }
  await new Promise<void>((resolve) => {
    const timer = globalThis.setTimeout(() => {
      if (server.process.exitCode === null && server.process.signalCode === null) {
        server.process.kill("SIGKILL");
      }
    }, 10_000);
    server.process.once("close", () => {
      globalThis.clearTimeout(timer);
      resolve();
    });
    server.process.kill("SIGINT");
  });
}

export async function provisionPersonalReleaseOwner(input: {
  baseUrl: string;
  databaseUrl: string;
  subjectKey: string;
  world: string;
}): Promise<PersonalReleaseOwner> {
  const provisional = await releaseIdentityPost(input.baseUrl, "/identity/admin/provisional", {
    provider: "telegram",
    subjectKey: input.subjectKey,
  });
  assert.equal(provisional.status, 200, JSON.stringify(provisional.body));
  const accountId = String(provisional.body.accountId);
  const verified = await releaseIdentityPost(input.baseUrl, "/identity/admin/verify-binding", {
    accountId,
  });
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  const personal = await releaseIdentityPost(input.baseUrl, "/identity/admin/personal", {
    accountId,
  });
  assert.equal(personal.status, 200, JSON.stringify(personal.body));
  const membership = String(personal.body.membershipId);
  const generatedWorld = String(personal.body.tenantId);
  if (generatedWorld !== input.world) {
    const database = new PostgresClient({ connectionString: input.databaseUrl });
    await database.connect();
    try {
      await database.query("BEGIN");
      const tenant = await database.query(
        "UPDATE personal_tenants SET tenant_id = $1 WHERE account_id = $2",
        [input.world, accountId],
      );
      const membershipRow = await database.query(
        "UPDATE memberships SET tenant_id = $1 WHERE membership_id = $2",
        [input.world, membership],
      );
      assert.equal(tenant.rowCount, 1);
      assert.equal(membershipRow.rowCount, 1);
      await database.query("COMMIT");
    } catch (error) {
      await database.query("ROLLBACK");
      throw error;
    } finally {
      await database.end();
    }
  }
  return {
    membership,
    principal: String(personal.body.principalId),
    world: input.world,
  };
}

async function releaseIdentityPost(
  baseUrl: string,
  route: string,
  body: Record<string, unknown>,
): Promise<{ body: Record<string, unknown>; status: number }> {
  const response = await fetch(`${baseUrl}${route}`, {
    body: JSON.stringify(body),
    headers: {
      authorization: `Bearer ${e2eIdentityAdminToken()}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
  const text = await response.text();
  return {
    body: text === "" ? {} : (JSON.parse(text) as Record<string, unknown>),
    status: response.status,
  };
}

function portAcceptsConnections(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    let settled = false;
    const finish = (connected: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(connected);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(200, () => finish(false));
  });
}

export async function writeGeneratedJson(
  directory: string,
  name: string,
  content: Record<string, unknown>,
): Promise<string> {
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, name);
  await writeFile(file, `${JSON.stringify(content, null, 2)}\n`);
  return file;
}

export function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function recordAssertion(
  assertions: Record<string, boolean>,
  name: string,
  observed: boolean,
): void {
  assert.ok(observed, name);
  assertions[name] = observed;
}
