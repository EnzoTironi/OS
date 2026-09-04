import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import path from "node:path";
import { Client as PostgresClient } from "pg";
import { e2eHttpUrl, e2eIdentityAdminToken, e2eListenAddr } from "./host-env.js";

export const KERNEL_AUTHORITY_DEFINITION_DIGEST =
  "3dfddf9c946656d9ce19ccaacecba5db3d284417c1c3f1f9d0ee710163e42dfc";
export const KERNEL_AUTHORITY_RESOURCE = "zoen.world.kernel";
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
export const KERNEL_ACTIONS = [
  { actionId: "zoen.world.discover", approved: false, operation: "discover", verb: "Discover" },
  { actionId: "zoen.world.query", approved: false, operation: "query", verb: "Query" },
  { actionId: "zoen.world.propose", approved: false, operation: "propose", verb: "Propose" },
  { actionId: "zoen.world.decide", approved: false, operation: "decide", verb: "Decide" },
  { actionId: "zoen.world.commit", approved: true, operation: "commit", verb: "Commit" },
  { actionId: "zoen.world.explain", approved: true, operation: "explain", verb: "Explain" },
  { actionId: "zoen.world.execute", approved: true, operation: "execute", verb: "Execute" },
] as const;

export type KernelVerb = (typeof KERNEL_ACTIONS)[number]["verb"];

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

export function buildKernelPolicyCatalog(input: {
  actorByVerb: Record<KernelVerb, string>;
}): {
  bytes: string;
  policyDigests: Record<KernelVerb, string>;
} {
  const policyDigests = {} as Record<KernelVerb, string>;
  const policies = KERNEL_ACTIONS.map(({ actionId, approved, operation, verb }) => {
    const source = `permit (
    principal,
    action == Action::"${operation}",
    resource
)
when {
    context.actionId == "${actionId}" &&
    context.actorId == "${input.actorByVerb[verb]}" &&
    context.approved == ${approved}
};
`;
    const digest = createHash("sha256").update(source).digest("hex");
    policyDigests[verb] = digest;
    return {
      actionId,
      definitionDigest: KERNEL_AUTHORITY_DEFINITION_DIGEST,
      digest,
      policyId: `policy.world.kernel.${operation}.r1`,
      revision: 1,
      source,
    };
  });
  const bytes = `${JSON.stringify({
    schema: "zoen.policy-catalog.v1",
    authorization: {
      policies: [...policies, ...releaseAuthorityPolicies()],
    },
    computeBudgets: [
      {
        deadlineMillis: 2_000,
        fuel: 5_000_000,
        id: "budget.query.default",
        instances: 4,
        memories: 2,
        memoryBytes: 8 * 1024 * 1024,
        tableElements: 1_024,
        tables: 2,
      },
    ],
    membership: [],
    sourceAdmission: [],
  })}\n`;
  return { bytes, policyDigests };
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

  function runZoenAsync(args: string[]): Promise<ZoenResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(zoenPath, args, {
        env: { ...process.env, DATABASE_URL: databaseUrl },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.once("error", reject);
      child.once("close", (status) => {
        resolve({ status, stderr, stdout });
      });
    });
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
    runZoenAsync,
    withBody,
  };
}

export interface WorldReleaseMembership extends ReleaseActor {
  world: string;
}

export interface WorldReleaseActors {
  builder: WorldReleaseMembership;
  owner: WorldReleaseMembership;
}

export interface WorldMembership extends ReleaseActor {
  accountId: string;
  actionIds: readonly string[];
  actor: string;
  workload: string;
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
  await waitForPostgres(input.databaseUrl);
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

async function waitForPostgres(databaseUrl: string): Promise<void> {
  let lastError = "database did not accept a query";
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const database = new PostgresClient({ connectionString: databaseUrl });
    try {
      await database.connect();
      await database.query("SELECT 1");
      await database.end();
      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await database.end().catch(() => undefined);
      await new Promise((resolve) => globalThis.setTimeout(resolve, 100));
    }
  }
  throw new Error(`PostgreSQL did not become query-ready: ${lastError}`);
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

export async function provisionWorldReleaseActors(input: {
  baseUrl: string;
  subjectKey: string;
  world: string;
}): Promise<WorldReleaseActors> {
  const [builder, owner] = await Promise.all([
    provisionInvitedReleaseMembership({
      ...input,
      actionIds: ["zoen.world.release.publish"],
      principal: `principal.release.${input.subjectKey}.publisher`,
      role: "builder",
    }),
    provisionInvitedReleaseMembership({
      ...input,
      actionIds: [
        "zoen.world.release.preview",
        "zoen.world.release.decide",
        "zoen.world.release.activate",
      ],
      principal: `principal.release.${input.subjectKey}.governor`,
      role: "owner",
    }),
  ]);
  assert.notEqual(builder.membership, owner.membership);
  assert.notEqual(builder.principal, owner.principal);
  return { builder, owner };
}

async function provisionInvitedReleaseMembership(input: {
  actionIds: readonly string[];
  baseUrl: string;
  principal: string;
  role: "builder" | "owner";
  subjectKey: string;
  world: string;
}): Promise<WorldReleaseMembership> {
  const membership = await provisionWorldMembership({
    actionIds: input.actionIds,
    actor: `actor.release.${input.subjectKey}.${input.role}`,
    baseUrl: input.baseUrl,
    principal: input.principal,
    resourceIds: ["zoen.world.release"],
    subjectKey: `${input.subjectKey}-${input.role}`,
    workload: `workload.world-release.${input.role}`,
    world: input.world,
  });
  return {
    membership: membership.membership,
    principal: membership.principal,
    world: membership.world,
  };
}

export async function provisionWorldMembership(input: {
  actionIds: readonly string[];
  actor: string;
  baseUrl: string;
  principal: string;
  resourceIds?: readonly string[];
  subjectKey: string;
  workload: string;
  world: string;
}): Promise<WorldMembership> {
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
  assert.equal(verified.body.status, "verified", JSON.stringify(verified.body));
  const token = `invite.${input.subjectKey}`;
  const resourceIds = input.resourceIds ?? [KERNEL_AUTHORITY_RESOURCE];
  const invited = await releaseIdentityPost(input.baseUrl, "/identity/admin/invites", {
    actionIds: [...input.actionIds],
    actorId: input.actor,
    expiresAtMicros: Date.now() * 1000 + 3_600_000_000,
    principalId: input.principal,
    resourceIds: [...resourceIds],
    worldId: input.world,
    token,
    workloadId: input.workload,
  });
  assert.equal(invited.status, 200, JSON.stringify(invited.body));
  assert.equal(invited.body.worldId, input.world, JSON.stringify(invited.body));
  assert.equal(invited.body.principalId, input.principal, JSON.stringify(invited.body));
  const accepted = await releaseIdentityPost(input.baseUrl, "/identity/admin/accept-invite", {
    accountId,
    token,
  });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  assert.equal(accepted.body.kind, "invite", JSON.stringify(accepted.body));
  assert.equal(accepted.body.status, "active", JSON.stringify(accepted.body));
  assert.equal(accepted.body.worldId, input.world, JSON.stringify(accepted.body));
  assert.equal(accepted.body.principalId, input.principal, JSON.stringify(accepted.body));
  assert.deepEqual(
    new Set(accepted.body.delegatedActionIds as string[]),
    new Set(input.actionIds),
    JSON.stringify(accepted.body),
  );
  assert.deepEqual(accepted.body.delegatedResourceIds, [...resourceIds], JSON.stringify(accepted.body));
  return {
    accountId,
    actionIds: [...input.actionIds],
    actor: input.actor,
    membership: String(accepted.body.membershipId),
    principal: input.principal,
    workload: input.workload,
    world: input.world,
  };
}

export async function revokeWorldMembership(input: {
  baseUrl: string;
  membership: string;
}): Promise<void> {
  const revoked = await releaseIdentityPost(input.baseUrl, "/identity/admin/revoke", {
    membershipId: input.membership,
    reason: "admin",
  });
  assert.equal(revoked.status, 204, JSON.stringify(revoked.body));
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
