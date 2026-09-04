import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import path from "node:path";
import canonicalize from "canonicalize";
import { Client as PostgresClient } from "pg";
import {
  e2eGeneratedDirectory,
  e2eHttpUrl,
  e2eIdentityAdminToken,
  e2eListenAddr,
  e2ePostgresUrl,
  writeScenarioArtifact,
} from "./host-env.js";
import {
  provisionWorldReleaseActors,
  type ReleaseActor,
} from "./kernel-world-support.js";
import { parseZoenJson, runZoenCli, type ZoenCliResult } from "./zoen-cli.js";

const scenario = "world-release";
const repositoryRoot = process.cwd();
const postgresPortFallback = 55_490;
const databaseUrl = e2ePostgresUrl("postgres", "postgres", postgresPortFallback);
const generatedDirectory = e2eGeneratedDirectory(repositoryRoot, scenario);
const targetDir = process.env.CARGO_TARGET_DIR ?? path.join(repositoryRoot, "target");
const zoenPath = path.join(targetDir, "debug", "zoen");
const zoendPortFallback = 58_490;
const zoendUrl = e2eHttpUrl("ZOEN_E2E_ZOEND_PORT", zoendPortFallback);
const fixtureDigest = (
  await readFile(path.join(repositoryRoot, "testdata/jcs/zoen/world-release-v1.sha256"), "utf8")
).trim();
const fixtureJcs = (
  await readFile(path.join(repositoryRoot, "testdata/jcs/zoen/world-release-v1.jcs"), "utf8")
).replace(/\n$/, "");

const catalog = {
  ontology: "a".repeat(64),
  policy: "b".repeat(64),
  executors: "c".repeat(64),
  components: "d".repeat(64),
} as const;

interface CatalogBytes {
  ontology: string;
  policy: string;
  executors: string;
  components: string;
}

const worldDefinitionDigest = "a".repeat(64);
const worldActionId = "zoen.world.discover";
const releaseAuthorityDefinitionDigest = "e39d2372b5e94449657447a9a2109ed5e5f2e18bc424639ee25627e849f03862";
const releaseAuthorityActions = [
  {
    actionId: "zoen.world.release.publish",
    operation: "publish_release",
  },
  {
    actionId: "zoen.world.release.preview",
    operation: "preview_release",
  },
  {
    actionId: "zoen.world.release.decide",
    operation: "decide_release",
  },
  {
    actionId: "zoen.world.release.activate",
    operation: "activate_release",
  },
] as const;

type ReleaseAuthorityDecision = "permit" | "deny";

function buildPolicyCatalog(input: {
  actionId?: string;
  definitionDigest?: string;
  policyId?: string;
  releaseAuthority?: Partial<Record<(typeof releaseAuthorityActions)[number]["operation"], ReleaseAuthorityDecision>>;
  revision?: number;
  source?: string;
}): { bytes: string } {
  const actionId = input.actionId ?? worldActionId;
  const source =
    input.source ??
    `permit (
    principal,
    action == Action::"discover",
    resource
)
when {
    context.actionId == "${actionId}"
};
`;
  const policyDigest = createHash("sha256").update(source).digest("hex");
  const releasePolicies = releaseAuthorityActions.map((binding) => {
    const effect = input.releaseAuthority?.[binding.operation] ?? "permit";
    const cedarEffect = effect === "permit" ? "permit" : "forbid";
    const releaseSource = `${cedarEffect} (
    principal,
    action == Action::"${binding.operation}",
    resource
)
when {
    context.actionId == "${binding.actionId}"
};
`;
    return {
      actionId: binding.actionId,
      definitionDigest: releaseAuthorityDefinitionDigest,
      digest: createHash("sha256").update(releaseSource).digest("hex"),
      policyId: `policy.world.release.${binding.operation}.r1`,
      revision: 1,
      source: releaseSource,
    };
  });
  const bytes = `${JSON.stringify({
    schema: "zoen.policy-catalog.v1",
    authorization: {
      policies: [
        {
          actionId,
          definitionDigest: input.definitionDigest ?? worldDefinitionDigest,
          digest: policyDigest,
          policyId: input.policyId ?? "policy.world.discover.r1",
          revision: input.revision ?? 1,
          source,
        },
        ...releasePolicies,
      ],
    },
    membershipDelegation: [],
    sourceAdmission: [],
    computeBudgets: [
      {
        id: "clinic.query.standard",
        fuel: 5_000_000,
        memoryBytes: 8 * 1024 * 1024,
        tableElements: 1024,
        instances: 4,
        tables: 2,
        memories: 2,
        deadlineMillis: 2000,
        priority: 100,
        resourceId: "zoen.compute.budget.standard",
      },
      {
        id: "clinic.query.tight",
        fuel: 20_000,
        memoryBytes: 8 * 1024 * 1024,
        tableElements: 1024,
        instances: 4,
        tables: 2,
        memories: 2,
        deadlineMillis: 2000,
        priority: 10,
        resourceId: "zoen.compute.budget.tight",
      },
    ],
  })}
`;
  return {
    bytes,
  };
}

function authorityPolicyBinding(
  policyCatalog: string,
  actionId: string,
): { digest: string; policyId: string; revision: number } {
  const parsed = JSON.parse(policyCatalog) as {
    authorization?: { policies?: Array<Record<string, unknown>> };
  };
  const binding = parsed.authorization?.policies?.find((policy) => policy.actionId === actionId);
  assert.ok(binding, `candidate PolicyCatalog must bind ${actionId}`);
  return {
    digest: String(binding.digest),
    policyId: String(binding.policyId),
    revision: Number(binding.revision),
  };
}

const alphaPolicy = buildPolicyCatalog({});
const alphaBytes: CatalogBytes = {
  ontology:
    '{"label":"world.alpha.v1","publicVerbs":["Discover","Query","Propose","Decide","Commit","Explain","Execute"],"schema":"zoen.ontology-catalog.v1"}\n',
  policy: alphaPolicy.bytes,
  executors: "executor catalog for world.alpha v1\n",
  components: "component catalog for world.alpha v1\n",
};

const secondBytes: CatalogBytes = {
  ...alphaBytes,
  ontology:
    '{"label":"world.alpha.v2","publicVerbs":["Discover","Query","Propose","Decide","Commit","Explain","Execute"],"schema":"zoen.ontology-catalog.v1"}\n',
};

const recoveryBytes: CatalogBytes = {
  ...alphaBytes,
  executors: "executor catalog for world.alpha recovery\n",
};

const betaBytes = alphaBytes;

const assertions: Record<string, boolean> = {};

function record(name: string, observed: boolean): void {
  assert.ok(observed, name);
  assertions[name] = observed;
}

function membershipAuthorityDenied(result: ZoenResult): boolean {
  return (
    result.status === 1 &&
    (result.stderr.includes("Membership") ||
      result.stderr.includes("authorization") ||
      result.stderr.includes("release builder") ||
      result.stderr.includes("release owner") ||
      result.stderr.includes("not a builder") ||
      result.stderr.includes("not the owner"))
  );
}

type ZoenResult = ZoenCliResult;

function runZoen(args: readonly string[]): ZoenResult {
  return runZoenCli(zoenPath, databaseUrl, args);
}

function runZoenAsync(args: readonly string[]): Promise<ZoenResult> {
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
    child.once("close", (code) => {
      resolve({ status: code ?? 1, stdout, stderr });
    });
  });
}

async function startIdentityServer(policyManifestPath: string): Promise<ChildProcessWithoutNullStreams> {
  const child = spawn(zoenPath, ["serve"], {
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      ZOEN_AUTH_DATABASE_URL: databaseUrl,
      ZOEN_CEDAR_POLICY_MANIFEST: policyManifestPath,
      ZOEN_IDENTITY_ADMIN_TOKEN: e2eIdentityAdminToken(),
      ZOEN_LISTEN_ADDR: e2eListenAddr("ZOEN_E2E_ZOEND_PORT", zoendPortFallback),
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
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`zoend exited during identity setup:\n${output}`);
    }
    if (await canConnectToZoend()) {
      return child;
    }
    await delay(100);
  }
  child.kill("SIGKILL");
  throw new Error(`zoend did not listen for identity setup:\n${output}`);
}

async function stopIdentityServer(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  await new Promise<void>((resolve) => {
    const timer = globalThis.setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
      }
    }, 10_000);
    child.once("close", () => {
      globalThis.clearTimeout(timer);
      resolve();
    });
    child.kill("SIGINT");
  });
}

function canConnectToZoend(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({
      host: "127.0.0.1",
      port: Number(new URL(zoendUrl).port),
    });
    const finish = (connected: boolean) => {
      socket.destroy();
      resolve(connected);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(200, () => finish(false));
  });
}

async function identityAdmin(
  method: "POST",
  route: string,
  body: Record<string, unknown>,
): Promise<{ body: Record<string, unknown>; status: number }> {
  const response = await fetch(`${zoendUrl}${route}`, {
    body: JSON.stringify(body),
    headers: {
      authorization: `Bearer ${e2eIdentityAdminToken()}`,
      "content-type": "application/json",
    },
    method,
  });
  const text = await response.text();
  const parsed = text === "" ? {} : (JSON.parse(text) as Record<string, unknown>);
  return { body: parsed, status: response.status };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

async function publicationCount(): Promise<number> {
  const observer = new PostgresClient({ connectionString: databaseUrl });
  await observer.connect();
  try {
    const result = await observer.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM world_release_publications",
    );
    return Number(result.rows[0]?.count);
  } finally {
    await observer.end();
  }
}

interface ReleaseAuthorizationRow {
  action_id: string;
  actor_id: string;
  authorized_at_micros: string;
  delegation_json: {
    grants?: Array<{
      actions?: string[];
      resources?: string[];
      workloads?: string[];
    }>;
  };
  determining_policies: string[];
  membership_id: string;
  operation: string;
  policy_digest: string;
  policy_id: string;
  policy_revision: string;
  preview_digest: string | null;
  principal_id: string;
  release_digest: string;
  target_digest: string;
  workload_id: string;
  world_id: string;
}

async function releaseAuthorizations(releaseDigest: string): Promise<ReleaseAuthorizationRow[]> {
  const observer = new PostgresClient({ connectionString: databaseUrl });
  await observer.connect();
  try {
    const result = await observer.query<ReleaseAuthorizationRow>(
      `SELECT operation, target_digest, world_id, release_digest, preview_digest,
              authorized_at_micros::text,
              membership_id, principal_id, actor_id, workload_id, action_id,
              delegation_json, policy_id, policy_revision::text, policy_digest,
              determining_policies
       FROM world_release_authorizations
       WHERE release_digest = $1
       ORDER BY operation`,
      [releaseDigest],
    );
    return result.rows;
  } finally {
    await observer.end();
  }
}

function parseJson(text: string): Record<string, unknown> {
  return parseZoenJson(text);
}

function sha256Hex(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function content(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    world: "world.alpha",
    parent: null,
    ontology: catalog.ontology,
    policy: catalog.policy,
    executors: catalog.executors,
    components: catalog.components,
    ...overrides,
  };
}

function contentFromBytes(world: string, bytes: CatalogBytes, parent: string | null = null): Record<string, unknown> {
  return {
    world,
    parent,
    ontology: { bytes: bytes.ontology },
    policy: { bytes: bytes.policy },
    executors: { bytes: bytes.executors },
    components: { bytes: bytes.components },
  };
}

async function writeContent(name: string, body: Record<string, unknown>): Promise<string> {
  const filePath = path.join(generatedDirectory, name);
  await writeFile(filePath, `${JSON.stringify(body)}\n`);
  return filePath;
}

function expectedDigest(body: Record<string, unknown>): {
  digest: string;
  jcs: string;
} {
  const document = {
    components: body.components,
    executors: body.executors,
    ontology: body.ontology,
    parent: body.parent ?? null,
    policy: body.policy,
    schema: "zoen.world-release.v1",
    world: body.world,
  };
  const jcs = canonicalize(document);
  assert.ok(typeof jcs === "string");
  return {
    digest: createHash("sha256").update(jcs).digest("hex"),
    jcs,
  };
}

function catalogDigests(bytes: CatalogBytes): Record<string, string> {
  return {
    ontology: sha256Hex(bytes.ontology),
    policy: sha256Hex(bytes.policy),
    executors: sha256Hex(bytes.executors),
    components: sha256Hex(bytes.components),
  };
}

function expectedFromBytes(
  world: string,
  bytes: CatalogBytes,
  parent: string | null = null,
): { digest: string; jcs: string; catalogs: Record<string, string> } {
  const catalogs = catalogDigests(bytes);
  return {
    catalogs,
    ...expectedDigest({
      world,
      parent,
      ontology: catalogs.ontology,
      policy: catalogs.policy,
      executors: catalogs.executors,
      components: catalogs.components,
    }),
  };
}

function construct(file: string): Record<string, unknown> {
  const result = runZoen(["world", "release", "construct", "--file", file]);
  assert.equal(result.status, 0, result.stderr);
  return parseJson(result.stdout);
}

function publish(file: string, actor: ReleaseActor): ZoenResult & { body?: Record<string, unknown> } {
  const result = runZoen([
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
  if (result.status === 0) {
    return { ...result, body: parseJson(result.stdout) };
  }
  return result;
}

function preview(world: string, digest: string, actor: ReleaseActor): ZoenResult & { body?: Record<string, unknown> } {
  const result = runZoen([
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
  ]);
  if (result.status === 0) {
    return { ...result, body: parseJson(result.stdout) };
  }
  return result;
}

function decide(
  previewDigest: string,
  actor: ReleaseActor,
  decision: "approve" | "reject",
): ZoenResult & { body?: Record<string, unknown> } {
  const result = runZoen([
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
  if (result.status === 0) {
    return { ...result, body: parseJson(result.stdout) };
  }
  return result;
}

function activate(world: string, digest: string, actor: ReleaseActor, previewDigest: string): ZoenResult {
  return runZoen(activationArguments(world, digest, actor, previewDigest));
}

function activationArguments(
  world: string,
  digest: string,
  actor: ReleaseActor,
  previewDigest: string,
): readonly string[] {
  return [
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
  ];
}

function approveAndActivate(
  world: string,
  digest: string,
  actor: ReleaseActor,
): {
  preview: Record<string, unknown>;
  decide: Record<string, unknown>;
  activate: ZoenResult;
} {
  const previewed = preview(world, digest, actor);
  assert.equal(previewed.status, 0, previewed.stderr);
  const previewBody = previewed.body ?? {};
  const decided = decide(String(previewBody.previewDigest), actor, "approve");
  assert.equal(decided.status, 0, decided.stderr);
  return {
    preview: previewBody,
    decide: decided.body ?? {},
    activate: activate(world, digest, actor, String(previewBody.previewDigest)),
  };
}

function authorize(
  world: string,
  principal: string,
  actionId = worldActionId,
  definitionDigest = worldDefinitionDigest,
): ZoenResult & { body?: Record<string, unknown> } {
  const result = runZoen([
    "world",
    "release",
    "authorize",
    "--world",
    world,
    "--principal",
    principal,
    "--action-id",
    actionId,
    "--definition-digest",
    definitionDigest,
    "--definition-id",
    "definition.world",
    "--resource-id",
    "resource.world",
    "--operation",
    "discover",
  ]);
  if (result.status === 0) {
    return { ...result, body: parseJson(result.stdout) };
  }
  return result;
}

function catalogEntry(
  catalogs: Record<string, Record<string, unknown> | undefined>,
  key: string,
): Record<string, unknown> {
  const entry = catalogs[key];
  assert.ok(entry, `${key} catalog is required`);
  return entry;
}

function boundCatalogBytes(body: Record<string, unknown>): Record<string, string> {
  const catalogs = body.catalogs as Record<string, Record<string, unknown> | undefined>;
  return {
    ontology: String(catalogEntry(catalogs, "ontology").bytes),
    policy: String(catalogEntry(catalogs, "policy").bytes),
    executors: String(catalogEntry(catalogs, "executors").bytes),
    components: String(catalogEntry(catalogs, "components").bytes),
  };
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  let concurrentFirstActivation:
    | {
        candidateA: string;
        candidateB: string;
        finalPointer: string;
        loser: string;
        winner: string;
      }
    | undefined;
  await mkdir(generatedDirectory, { recursive: true });
  const bootPolicyPath = path.join(generatedDirectory, "boot-policies.json");
  await writeFile(bootPolicyPath, '{"policies":[]}\n');
  const identityServer = await startIdentityServer(bootPolicyPath);
  try {
    const [alphaActors, betaActors, concurrentActors] = await Promise.all([
      provisionWorldReleaseActors({
        baseUrl: zoendUrl,
        subjectKey: "release-alpha",
        world: "world.alpha",
      }),
      provisionWorldReleaseActors({
        baseUrl: zoendUrl,
        subjectKey: "release-beta",
        world: "world.beta",
      }),
      provisionWorldReleaseActors({
        baseUrl: zoendUrl,
        subjectKey: "release-concurrent",
        world: "world.concurrent",
      }),
    ]);
    const { builder: alphaBuilder, owner: alphaOwner } = alphaActors;
    const { builder: betaBuilder, owner: betaOwner } = betaActors;
    const { builder: concurrentBuilder, owner: concurrentOwner } = concurrentActors;
    const suffixAttacker: ReleaseActor = {
      membership: "membership.attacker.owner",
      principal: "principal.attacker.owner",
    };
    const mismatchedPrincipal: ReleaseActor = {
      membership: alphaBuilder.membership,
      principal: "principal.attacker.owner",
    };
    record(
      "builder_and_owner_use_distinct_invited_memberships",
      alphaBuilder.membership !== alphaOwner.membership && alphaBuilder.principal !== alphaOwner.principal,
    );
    record(
      "release_authority_is_not_principal_suffix",
      !alphaBuilder.principal.endsWith(".builder") && !alphaOwner.principal.endsWith(".owner"),
    );

    const schema = runZoen(["schema", "world.release.construct"]);
    record("schema_lists_construct", schema.status === 0);
    const publishSchema = runZoen(["schema", "world.release.publish"]);
    record("schema_lists_publish", publishSchema.status === 0);
    const previewSchema = runZoen(["schema", "world.release.preview"]);
    record("schema_lists_preview", previewSchema.status === 0);
    const decideSchema = runZoen(["schema", "world.release.decide"]);
    record("schema_lists_decide", decideSchema.status === 0);
    const activateSchema = runZoen(["schema", "world.release.activate"]);
    record("schema_lists_activate", activateSchema.status === 0);
    const authorizeSchema = runZoen(["schema", "world.release.authorize"]);
    record("schema_lists_authorize", authorizeSchema.status === 0);
    record("schema_omits_digest_flag", !schema.stdout.includes("--digest") && schema.stdout.includes("--file"));
    record(
      "release_commands_require_membership",
      publishSchema.stdout.includes("--membership") &&
        previewSchema.stdout.includes("--membership") &&
        decideSchema.stdout.includes("--membership") &&
        activateSchema.stdout.includes("--membership"),
    );
    record(
      "publish_schema_omits_caller_policy_evidence",
      !publishSchema.stdout.includes("--policy-id") && !publishSchema.stdout.includes("--policy-digest"),
    );

    const alphaPath = await writeContent("alpha.json", content());
    const first = construct(alphaPath);
    const second = construct(alphaPath);
    const expected = expectedDigest(content());
    record("identical_content_same_digest", first.digest === second.digest);
    record("digest_matches_node_sha256_of_jcs", first.digest === expected.digest);
    record("canonical_jcs_matches_rfc8785", first.canonicalJcs === expected.jcs);
    record("fixture_digest_matches", first.digest === fixtureDigest);
    record("fixture_jcs_matches", first.canonicalJcs === fixtureJcs);
    record("schema_is_domain_tag", first.schema === "zoen.world-release.v1");
    record("parent_null_is_present", first.parent === null);
    record(
      "four_catalogs_bound",
      first.ontology === catalog.ontology &&
        first.policy === catalog.policy &&
        first.executors === catalog.executors &&
        first.components === catalog.components,
    );

    for (const field of ["world", "ontology", "policy", "executors", "components"] as const) {
      const mutated = content({
        [field]: field === "world" ? "world.beta" : "e".repeat(64),
      });
      const mutatedPath = await writeContent(`${field}.json`, mutated);
      const changed = construct(mutatedPath);
      record(
        `field_${field}_changes_digest`,
        changed.digest !== first.digest && changed.digest === expectedDigest(mutated).digest,
      );
    }

    const withParent = content({ parent: fixtureDigest });
    const parentPath = await writeContent("parent.json", withParent);
    const parented = construct(parentPath);
    record(
      "parent_field_changes_digest",
      parented.digest !== first.digest && parented.digest === expectedDigest(withParent).digest,
    );

    const callerIdPath = await writeContent("caller-id.json", {
      ...content(),
      digest: "f".repeat(64),
    });
    const callerId = runZoen(["world", "release", "construct", "--file", callerIdPath]);
    record("caller_supplied_digest_rejected", callerId.status !== 0);
    record("caller_supplied_digest_message", callerId.stderr.includes("caller cannot supply a ReleaseDigest"));

    const hexOnlyPublish = publish(alphaPath, alphaBuilder);
    record("hex_only_publish_rejected", hexOnlyPublish.status !== 0);
    record("hex_only_publish_message", hexOnlyPublish.stderr.includes("requires catalog bytes"));

    const publicationsBeforeCallerEvidence = await publicationCount();
    const callerEvidence = runZoen([
      "world",
      "release",
      "publish",
      "--file",
      alphaPath,
      "--principal",
      alphaBuilder.principal,
      "--membership",
      alphaBuilder.membership,
      "--policy-id",
      "policy.attacker",
      "--policy-digest",
      "f".repeat(64),
      "--policy-revision",
      "999",
      "--determining-policy",
      "policy.attacker",
    ]);
    record(
      "caller_cannot_supply_divergent_publication_evidence",
      callerEvidence.status !== 0 && callerEvidence.stderr.includes("--policy-id"),
    );
    record(
      "divergent_publication_evidence_writes_nothing",
      (await publicationCount()) === publicationsBeforeCallerEvidence,
    );

    const plaintextPolicyPath = await writeContent(
      "plaintext-policy.json",
      contentFromBytes("world.alpha", {
        ...alphaBytes,
        policy: "policy catalog without cedar\n",
      }),
    );
    const plaintextPublish = publish(plaintextPolicyPath, alphaBuilder);
    record("missing_cedar_in_policy_catalog_fails", plaintextPublish.status !== 0);
    record("missing_cedar_in_policy_catalog_message", plaintextPublish.stderr.includes("loadable Cedar bundle"));

    const invalidCedarPath = await writeContent(
      "invalid-cedar.json",
      contentFromBytes("world.alpha", {
        ...alphaBytes,
        policy: `${JSON.stringify({
          schema: "zoen.policy-catalog.v1",
          authorization: {
            policies: [
              {
                actionId: worldActionId,
                definitionDigest: worldDefinitionDigest,
                digest: "0".repeat(64),
                policyId: "policy.world.broken",
                revision: 1,
                source: "this is not cedar",
              },
            ],
          },
          membershipDelegation: [],
          sourceAdmission: [],
        })}
`,
      }),
    );
    const invalidCedarPublish = publish(invalidCedarPath, alphaBuilder);
    record("invalid_cedar_in_policy_catalog_fails", invalidCedarPublish.status !== 0);
    record("invalid_cedar_in_policy_catalog_message", invalidCedarPublish.stderr.includes("loadable Cedar bundle"));

    const liveAlphaPath = await writeContent("live-alpha.json", contentFromBytes(alphaOwner.world, alphaBytes));
    const liveExpected = expectedFromBytes(alphaOwner.world, alphaBytes);
    const liveConstruct = construct(liveAlphaPath);
    record(
      "byte_catalogs_derive_digest",
      liveConstruct.digest === liveExpected.digest && liveConstruct.ontology === liveExpected.catalogs.ontology,
    );
    record("byte_catalogs_present_on_construct", boundCatalogBytes(liveConstruct).ontology === alphaBytes.ontology);

    const deniedPublishPolicy = buildPolicyCatalog({
      releaseAuthority: { publish_release: "deny" },
    });
    const deniedPublishPath = await writeContent(
      "denied-publish.json",
      contentFromBytes(alphaOwner.world, {
        ...alphaBytes,
        policy: deniedPublishPolicy.bytes,
      }),
    );
    const publicationsBeforeDeniedPublish = await publicationCount();
    const deniedPublish = publish(deniedPublishPath, alphaBuilder);
    record(
      "candidate_cedar_can_deny_publish",
      membershipAuthorityDenied(deniedPublish),
    );
    record(
      "candidate_cedar_denied_publish_writes_nothing",
      (await publicationCount()) === publicationsBeforeDeniedPublish,
    );

    const publicationsBeforeForgedPublish = await publicationCount();
    const forgedPublisher = publish(liveAlphaPath, suffixAttacker);
    record("forged_owner_suffix_cannot_publish", forgedPublisher.status !== 0);
    record("forged_owner_suffix_publish_message", membershipAuthorityDenied(forgedPublisher));
    const mismatchedPublisher = publish(liveAlphaPath, mismatchedPrincipal);
    record(
      "mismatched_membership_principal_cannot_publish",
      membershipAuthorityDenied(mismatchedPublisher),
    );
    const crossWorldPublisher = publish(liveAlphaPath, betaBuilder);
    record(
      "other_world_membership_cannot_publish_here",
      membershipAuthorityDenied(crossWorldPublisher),
    );
    record(
      "unauthorized_publish_attempts_write_nothing",
      (await publicationCount()) === publicationsBeforeForgedPublish,
    );

    const unpublishedPreview = preview(alphaOwner.world, String(liveConstruct.digest), alphaOwner);
    record(
      "unpublished_preview_fails",
      unpublishedPreview.status !== 0 &&
        (unpublishedPreview.stderr.includes("requires policy evidence") ||
          unpublishedPreview.stderr.includes("was not found")),
    );
    const unpublishedActivate = activate(alphaOwner.world, String(liveConstruct.digest), alphaOwner, "0".repeat(64));
    record(
      "unpublished_activate_fails",
      unpublishedActivate.status !== 0 &&
        (unpublishedActivate.stderr.includes("was not found") ||
          unpublishedActivate.stderr.includes("activation requires an approving decision")),
    );

    const publicationsBeforeOwnerPublish = await publicationCount();
    const ownerPublish = publish(liveAlphaPath, alphaOwner);
    record("owner_cannot_publish", membershipAuthorityDenied(ownerPublish));
    record(
      "owner_publish_denial_writes_nothing",
      (await publicationCount()) === publicationsBeforeOwnerPublish,
    );
    const builderPublish = publish(liveAlphaPath, alphaBuilder);
    assert.equal(builderPublish.status, 0, builderPublish.stderr);
    const published = builderPublish.body ?? {};
    record("builder_publish_stores_digest", published.digest === liveConstruct.digest);
    record("publish_replay_is_false_first", published.replay === false);
    const publication = published.publication as Record<string, unknown>;
    record("publication_is_separate", publication.digest === liveConstruct.digest);
    record("publication_time_present", typeof publication.publishedAtMicros === "number");
    record("publication_actor_is_membership_principal", publication.publishedBy === alphaBuilder.principal);
    const storedPublicationPolicy = publication.policy as Record<string, unknown>;
    const candidatePublishPolicy = authorityPolicyBinding(alphaBytes.policy, "zoen.world.release.publish");
    record(
      "publication_evidence_comes_from_candidate_cedar",
      storedPublicationPolicy.id === candidatePublishPolicy.policyId &&
        storedPublicationPolicy.digest === candidatePublishPolicy.digest &&
        storedPublicationPolicy.revision === candidatePublishPolicy.revision,
    );
    record(
      "stored_catalog_bytes_match",
      boundCatalogBytes(published).ontology === alphaBytes.ontology &&
        boundCatalogBytes(published).policy === alphaBytes.policy &&
        boundCatalogBytes(published).executors === alphaBytes.executors &&
        boundCatalogBytes(published).components === alphaBytes.components,
    );

    const builderReplay = publish(liveAlphaPath, alphaBuilder);
    assert.equal(builderReplay.status, 0, builderReplay.stderr);
    const replayed = builderReplay.body ?? {};
    record("identical_candidate_replay", replayed.replay === true);
    record("replay_keeps_original_digest", replayed.digest === liveConstruct.digest);
    const replayPublication = replayed.publication as Record<string, unknown>;
    record(
      "replay_keeps_original_publication_time",
      replayPublication.publishedAtMicros === publication.publishedAtMicros,
    );
    record("publication_metadata_does_not_change_digest", replayed.digest === published.digest);

    const builderPreview = preview(alphaOwner.world, String(liveConstruct.digest), alphaBuilder);
    record(
      "builder_cannot_preview",
      membershipAuthorityDenied(builderPreview),
    );
    const ownerPreview = preview(alphaOwner.world, String(liveConstruct.digest), alphaOwner);
    assert.equal(ownerPreview.status, 0, ownerPreview.stderr);
    const firstPreview = ownerPreview.body ?? {};
    record(
      "owner_preview_binds_candidate",
      firstPreview.digest === liveConstruct.digest &&
        firstPreview.currentActive === null &&
        firstPreview.schema === "zoen.world-release-preview.v1",
    );
    record("owner_preview_replay_is_false_first", firstPreview.replay === false);
    const previewReplay = preview(alphaOwner.world, String(liveConstruct.digest), alphaOwner);
    assert.equal(previewReplay.status, 0, previewReplay.stderr);
    const replayedPreview = previewReplay.body ?? {};
    record(
      "identical_preview_replay",
      replayedPreview.replay === true && replayedPreview.previewDigest === firstPreview.previewDigest,
    );

    const builderDecide = decide(String(firstPreview.previewDigest), alphaBuilder, "approve");
    record(
      "builder_cannot_decide",
      membershipAuthorityDenied(builderDecide),
    );

    const activateWithoutDecide = activate(
      alphaOwner.world,
      String(liveConstruct.digest),
      alphaOwner,
      String(firstPreview.previewDigest),
    );
    record(
      "activate_without_approve_fails",
      activateWithoutDecide.status !== 0 &&
        activateWithoutDecide.stderr.includes("activation requires an approving decision"),
    );

    const ownerDecide = decide(String(firstPreview.previewDigest), alphaOwner, "approve");
    assert.equal(ownerDecide.status, 0, ownerDecide.stderr);
    const firstDecision = ownerDecide.body ?? {};
    record("owner_decide_approves", firstDecision.decision === "approve");
    record("owner_decide_replay_is_false_first", firstDecision.replay === false);
    const decideReplay = decide(String(firstPreview.previewDigest), alphaOwner, "approve");
    assert.equal(decideReplay.status, 0, decideReplay.stderr);
    const replayedDecision = decideReplay.body ?? {};
    record(
      "identical_decide_replay",
      replayedDecision.replay === true &&
        replayedDecision.previewDigest === firstPreview.previewDigest &&
        replayedDecision.decidedAtMicros === firstDecision.decidedAtMicros,
    );
    const mismatchedDecideReplay = decide(String(firstPreview.previewDigest), mismatchedPrincipal, "approve");
    record(
      "mismatched_decide_principal_denied",
      membershipAuthorityDenied(mismatchedDecideReplay),
    );

    const builderActivate = activate(
      alphaOwner.world,
      String(liveConstruct.digest),
      alphaBuilder,
      String(firstPreview.previewDigest),
    );
    record(
      "builder_cannot_activate",
      membershipAuthorityDenied(builderActivate),
    );

    const firstActivate = activate(
      alphaOwner.world,
      String(liveConstruct.digest),
      alphaOwner,
      String(firstPreview.previewDigest),
    );
    assert.equal(firstActivate.status, 0, firstActivate.stderr);
    const firstActivation = parseJson(firstActivate.stdout);
    record("first_activation_succeeds", firstActivation.activated === true);
    record("first_activation_has_no_previous", firstActivation.previousDigest === null);
    record("first_activation_replay_is_false", firstActivation.replay === false);
    const activateReplay = activate(
      alphaOwner.world,
      String(liveConstruct.digest),
      alphaOwner,
      String(firstPreview.previewDigest),
    );
    assert.equal(activateReplay.status, 0, activateReplay.stderr);
    const replayedActivation = parseJson(activateReplay.stdout);
    record(
      "identical_activate_replay",
      replayedActivation.replay === true &&
        replayedActivation.activated === true &&
        replayedActivation.digest === liveConstruct.digest,
    );

    const authorityRows = await releaseAuthorizations(String(liveConstruct.digest));
    const authorityByOperation = new Map(authorityRows.map((row) => [row.operation, row]));
    record(
      "release_lifecycle_persists_one_authority_cut_per_operation",
      authorityRows.length === 4 &&
        ["publish", "preview", "decide", "activate"].every((operation) =>
          authorityByOperation.has(operation),
        ),
    );
    record(
      "release_authority_cuts_bind_builder_and_owner_memberships",
      authorityByOperation.get("publish")?.membership_id === alphaBuilder.membership &&
        authorityByOperation.get("publish")?.principal_id === alphaBuilder.principal &&
        ["preview", "decide", "activate"].every((operation) => {
          const row = authorityByOperation.get(operation);
          return row?.membership_id === alphaOwner.membership && row.principal_id === alphaOwner.principal;
        }),
    );
    record(
      "release_authority_cuts_snapshot_exact_delegations",
      authorityRows.every((row) => {
        const terminal = row.delegation_json.grants?.at(-1);
        return (
          Number(row.authorized_at_micros) > 0 &&
          row.actor_id !== "" &&
          row.workload_id !== "" &&
          terminal?.actions?.includes(row.action_id) === true &&
          terminal.resources?.includes("zoen.world.release") === true &&
          terminal.workloads?.includes(row.workload_id) === true
        );
      }),
    );
    record(
      "release_authority_cuts_bind_candidate_policy_evidence",
      authorityRows.every((row) => {
        const expected = authorityPolicyBinding(alphaBytes.policy, row.action_id);
        return (
          row.policy_id === expected.policyId &&
          row.policy_digest === expected.digest &&
          Number(row.policy_revision) === expected.revision &&
          row.determining_policies.length > 0
        );
      }),
    );
    record(
      "release_authority_targets_bind_exact_release_and_preview",
      authorityRows.every((row) => {
        const isPublish = row.operation === "publish";
        return (
          row.world_id === alphaOwner.world &&
          row.release_digest === liveConstruct.digest &&
          row.preview_digest === (isPublish ? null : firstPreview.previewDigest) &&
          row.target_digest === (isPublish ? liveConstruct.digest : firstPreview.previewDigest)
        );
      }),
    );

    const fetchedCatalogs = runZoen([
      "world",
      "release",
      "catalogs",
      "--digest",
      String(liveConstruct.digest),
      "--world",
      alphaOwner.world,
    ]);
    assert.equal(fetchedCatalogs.status, 0, fetchedCatalogs.stderr);
    const catalogBody = parseJson(fetchedCatalogs.stdout);
    record(
      "catalogs_command_returns_bound_bytes",
      boundCatalogBytes(catalogBody).ontology === alphaBytes.ontology &&
        boundCatalogBytes(catalogBody).components === alphaBytes.components,
    );
    const policyCatalogText = boundCatalogBytes(catalogBody).policy ?? "";
    record(
      "policy_catalog_is_cedar_bundle",
      policyCatalogText.includes("zoen.policy-catalog.v1") && policyCatalogText.includes("authorization"),
    );

    const permitted = authorize(alphaOwner.world, alphaOwner.principal);
    assert.equal(permitted.status, 0, permitted.stderr);
    const permittedBody = permitted.body ?? {};
    record("authorize_governed_verb_from_active_release", permittedBody.decision === "permit");
    record(
      "authorize_uses_active_release_authority",
      permittedBody.authority === "active-release-policy-catalog" &&
        permittedBody.bootManifestIgnored === true &&
        permittedBody.digest === liveConstruct.digest,
    );
    record(
      "authorize_binds_policy_catalog_digest",
      permittedBody.policyCatalogDigest === liveExpected.catalogs.policy!,
    );

    const budgets = runZoen(["world", "release", "budgets", "--world", alphaOwner.world]);
    record("budgets_cli_succeeds", budgets.status === 0);
    const budgetsBody = budgets.status === 0 ? parseJson(budgets.stdout) : {};
    const budgetClasses = Array.isArray(budgetsBody.budgetClasses)
      ? (budgetsBody.budgetClasses as Array<Record<string, unknown>>)
      : [];
    record(
      "budgets_list_release_owned_classes",
      budgetClasses.some((entry) => entry.id === "clinic.query.standard") &&
        budgetClasses.some((entry) => entry.id === "clinic.query.tight"),
    );
    record(
      "budgets_bind_active_release_digest",
      budgetsBody.digest === liveExpected.digest && budgetsBody.policyCatalogDigest === liveExpected.catalogs.policy,
    );
    const standard = budgetClasses.find((entry) => entry.id === "clinic.query.standard");
    const tight = budgetClasses.find((entry) => entry.id === "clinic.query.tight");
    record(
      "server_selection_order_is_release_owned",
      standard !== undefined &&
        tight !== undefined &&
        Number(tight.fuel) < Number(standard.fuel) &&
        Number(tight.priority) < Number(standard.priority) &&
        tight.resourceId === "zoen.compute.budget.tight",
    );
    const schemaBudgets = runZoen(["schema", "world.release.budgets"]);
    record(
      "schema_lists_world_release_budgets",
      schemaBudgets.status === 0 && schemaBudgets.stdout.includes("world.release.budgets"),
    );

    const bootOnly = runZoen([
      "world",
      "release",
      "authorize",
      "--world",
      alphaOwner.world,
      "--principal",
      alphaOwner.principal,
      "--action-id",
      "action.not.in.catalog",
      "--definition-digest",
      worldDefinitionDigest,
      "--resource-id",
      "resource.world",
      "--operation",
      "discover",
    ]);
    record("boot_manifest_cannot_authorize_after_activation", bootOnly.status === 0);
    if (bootOnly.status === 0) {
      const bootBody = parseJson(bootOnly.stdout);
      record(
        "boot_manifest_only_action_errors_from_catalog",
        bootBody.decision === "error" && String(bootBody.message).includes("no Cedar policy is installed"),
      );
    } else {
      record("boot_manifest_only_action_errors_from_catalog", false);
    }

    const mixedPath = await writeContent("mixed.json", {
      world: alphaOwner.world,
      parent: null,
      ontology: { bytes: alphaBytes.ontology },
      policy: catalog.policy,
      executors: { bytes: alphaBytes.executors },
      components: { bytes: alphaBytes.components },
    });
    const mixedConstruct = runZoen(["world", "release", "construct", "--file", mixedPath]);
    record("mixed_candidate_catalogs_fail", mixedConstruct.status !== 0);
    record("mixed_candidate_catalogs_message", mixedConstruct.stderr.includes("cannot mix catalog bytes"));

    const betaPath = await writeContent("beta.json", contentFromBytes(betaOwner.world, betaBytes));
    const beta = construct(betaPath);
    const betaPublish = publish(betaPath, betaBuilder);
    assert.equal(betaPublish.status, 0, betaPublish.stderr);
    record(
      "identical_catalog_bytes_converge",
      beta.ontology === liveConstruct.ontology &&
        beta.policy === liveConstruct.policy &&
        beta.executors === liveConstruct.executors &&
        beta.components === liveConstruct.components &&
        beta.digest !== liveConstruct.digest,
    );
    const crossPreview = preview(alphaOwner.world, String(beta.digest), alphaOwner);
    record(
      "other_world_cannot_preview_for_this_world",
      crossPreview.status !== 0 && crossPreview.stderr.includes("does not belong to this World"),
    );
    const crossMembershipPreview = preview(betaOwner.world, String(beta.digest), alphaOwner);
    record(
      "other_world_membership_cannot_preview",
      membershipAuthorityDenied(crossMembershipPreview),
    );
    const betaPreviewForCross = preview(betaOwner.world, String(beta.digest), betaOwner);
    assert.equal(betaPreviewForCross.status, 0, betaPreviewForCross.stderr);
    const crossWorld = activate(
      alphaOwner.world,
      String(beta.digest),
      alphaOwner,
      String((betaPreviewForCross.body ?? {}).previewDigest),
    );
    record(
      "other_world_cannot_activate_for_this_world",
      crossWorld.status !== 0 && crossWorld.stderr.includes("does not belong to this World"),
    );
    const crossCatalogs = runZoen([
      "world",
      "release",
      "catalogs",
      "--digest",
      String(beta.digest),
      "--world",
      alphaOwner.world,
    ]);
    record(
      "cross_world_catalog_access_fails",
      crossCatalogs.status !== 0 && crossCatalogs.stderr.includes("does not belong to this World"),
    );
    const crossAuthorize = authorize(alphaOwner.world, alphaOwner.principal);
    // The owner's World remains on its first release until the second activation below.
    record(
      "cross_world_authorize_stays_on_caller_world",
      crossAuthorize.status === 0 && (crossAuthorize.body ?? {}).world === alphaOwner.world,
    );
    const betaAuthorizeBeforeActivate = authorize(betaOwner.world, betaOwner.principal);
    record(
      "other_world_without_activation_cannot_authorize",
      betaAuthorizeBeforeActivate.status !== 0 && betaAuthorizeBeforeActivate.stderr.includes("no active release"),
    );

    const secondPath = await writeContent("second.json", contentFromBytes(alphaOwner.world, secondBytes));
    const secondRelease = construct(secondPath);
    const secondPublish = publish(secondPath, alphaBuilder);
    assert.equal(secondPublish.status, 0, secondPublish.stderr);
    const secondCeremony = approveAndActivate(alphaOwner.world, String(secondRelease.digest), alphaOwner);
    assert.equal(secondCeremony.activate.status, 0, secondCeremony.activate.stderr);
    const secondActivation = parseJson(secondCeremony.activate.stdout);
    record("second_preview_sees_prior_active", secondCeremony.preview.currentActive === liveConstruct.digest);
    record("second_activation_replaces_pointer", secondActivation.activated === true);
    record("second_activation_reports_previous", secondActivation.previousDigest === liveConstruct.digest);

    const prior = runZoen(["world", "release", "get", "--digest", String(liveConstruct.digest)]);
    assert.equal(prior.status, 0, prior.stderr);
    const priorRelease = parseJson(prior.stdout);
    record("prior_release_queryable_by_digest", priorRelease.digest === liveConstruct.digest);
    record("prior_release_is_not_active", priorRelease.active === false);
    record("historical_catalogs_remain_addressable", boundCatalogBytes(priorRelease).ontology === alphaBytes.ontology);

    const active = runZoen(["world", "release", "active", "--world", alphaOwner.world]);
    assert.equal(active.status, 0, active.stderr);
    const activeRelease = parseJson(active.stdout);
    record("active_pointer_is_second_release", activeRelease.digest === secondRelease.digest);
    record("one_active_release_per_world", activeRelease.active === true);
    record(
      "active_release_binds_its_own_catalogs",
      boundCatalogBytes(activeRelease).ontology === secondBytes.ontology &&
        boundCatalogBytes(activeRelease).ontology !== alphaBytes.ontology,
    );

    const recoveryPath = await writeContent("recovery.json", contentFromBytes(alphaOwner.world, recoveryBytes));
    const recovery = construct(recoveryPath);
    const recoveryPublish = publish(recoveryPath, alphaBuilder);
    assert.equal(recoveryPublish.status, 0, recoveryPublish.stderr);
    const recoveryPreview = preview(alphaOwner.world, String(recovery.digest), alphaOwner);
    assert.equal(recoveryPreview.status, 0, recoveryPreview.stderr);
    const recoveryPreviewBody = recoveryPreview.body ?? {};
    const recoveryDecide = decide(String(recoveryPreviewBody.previewDigest), alphaOwner, "approve");
    assert.equal(recoveryDecide.status, 0, recoveryDecide.stderr);
    const afterCrash = runZoen(["world", "release", "active", "--world", alphaOwner.world]);
    const stillActive = parseJson(afterCrash.stdout);
    record("crash_before_activation_preserves_pointer", stillActive.digest === secondRelease.digest);
    record(
      "crash_preserves_durable_decision",
      (recoveryDecide.body ?? {}).decision === "approve" &&
        (recoveryDecide.body ?? {}).previewDigest === recoveryPreviewBody.previewDigest,
    );
    const storedCandidate = runZoen(["world", "release", "get", "--digest", String(recovery.digest)]);
    record("candidate_survives_without_activation", storedCandidate.status === 0);
    const retryActivate = activate(
      alphaOwner.world,
      String(recovery.digest),
      alphaOwner,
      String(recoveryPreviewBody.previewDigest),
    );
    assert.equal(retryActivate.status, 0, retryActivate.stderr);
    const recovered = parseJson(runZoen(["world", "release", "active", "--world", alphaOwner.world]).stdout);
    record("retry_converges_to_one_active", recovered.digest === recovery.digest);

    // Reject then activate denied
    const rejectBytes: CatalogBytes = {
      ...alphaBytes,
      components: "component catalog for reject path\n",
    };
    const rejectPath = await writeContent("reject.json", contentFromBytes(alphaOwner.world, rejectBytes));
    const rejectRelease = construct(rejectPath);
    const rejectPublish = publish(rejectPath, alphaBuilder);
    assert.equal(rejectPublish.status, 0, rejectPublish.stderr);
    const rejectPreview = preview(alphaOwner.world, String(rejectRelease.digest), alphaOwner);
    assert.equal(rejectPreview.status, 0, rejectPreview.stderr);
    const rejected = decide(String((rejectPreview.body ?? {}).previewDigest), alphaOwner, "reject");
    assert.equal(rejected.status, 0, rejected.stderr);
    record("owner_can_reject_preview", (rejected.body ?? {}).decision === "reject");
    const rejectedActivate = activate(
      alphaOwner.world,
      String(rejectRelease.digest),
      alphaOwner,
      String((rejectPreview.body ?? {}).previewDigest),
    );
    record(
      "reject_then_activate_denied",
      rejectedActivate.status !== 0 && rejectedActivate.stderr.includes("release activation was rejected"),
    );

    // Stale preview: capture preview while recovery is active, replace active, then decide/activate fail
    const staleBytes: CatalogBytes = {
      ...alphaBytes,
      ontology:
        '{"label":"stale.preview","publicVerbs":["Discover","Query","Propose","Decide","Commit","Explain","Execute"],"schema":"zoen.ontology-catalog.v1"}\n',
    };
    const stalePath = await writeContent("stale.json", contentFromBytes(alphaOwner.world, staleBytes));
    const staleRelease = construct(stalePath);
    const stalePublish = publish(stalePath, alphaBuilder);
    assert.equal(stalePublish.status, 0, stalePublish.stderr);
    const stalePreview = preview(alphaOwner.world, String(staleRelease.digest), alphaOwner);
    assert.equal(stalePreview.status, 0, stalePreview.stderr);
    const stalePreviewBody = stalePreview.body ?? {};
    record("stale_preview_captures_current_active", stalePreviewBody.currentActive === recovery.digest);
    const moverBytes: CatalogBytes = {
      ...alphaBytes,
      ontology:
        '{"label":"mover","publicVerbs":["Discover","Query","Propose","Decide","Commit","Explain","Execute"],"schema":"zoen.ontology-catalog.v1"}\n',
    };
    const moverPath = await writeContent("mover.json", contentFromBytes(alphaOwner.world, moverBytes));
    const moverRelease = construct(moverPath);
    const moverPublish = publish(moverPath, alphaBuilder);
    assert.equal(moverPublish.status, 0, moverPublish.stderr);
    const moverCeremony = approveAndActivate(alphaOwner.world, String(moverRelease.digest), alphaOwner);
    assert.equal(moverCeremony.activate.status, 0, moverCeremony.activate.stderr);
    const staleDecide = decide(String(stalePreviewBody.previewDigest), alphaOwner, "approve");
    record(
      "decide_on_stale_preview_fails",
      staleDecide.status !== 0 && staleDecide.stderr.includes("release preview is stale"),
    );
    // Fresh preview+decide for stale release, then move active again before activate
    const freshStalePreview = preview(alphaOwner.world, String(staleRelease.digest), alphaOwner);
    assert.equal(freshStalePreview.status, 0, freshStalePreview.stderr);
    const freshStaleBody = freshStalePreview.body ?? {};
    const freshStaleDecide = decide(String(freshStaleBody.previewDigest), alphaOwner, "approve");
    assert.equal(freshStaleDecide.status, 0, freshStaleDecide.stderr);
    const mover2Bytes: CatalogBytes = {
      ...alphaBytes,
      ontology:
        '{"label":"mover2","publicVerbs":["Discover","Query","Propose","Decide","Commit","Explain","Execute"],"schema":"zoen.ontology-catalog.v1"}\n',
    };
    const mover2Path = await writeContent("mover2.json", contentFromBytes(alphaOwner.world, mover2Bytes));
    const mover2Release = construct(mover2Path);
    assert.equal(publish(mover2Path, alphaBuilder).status, 0);
    const mover2Ceremony = approveAndActivate(alphaOwner.world, String(mover2Release.digest), alphaOwner);
    assert.equal(mover2Ceremony.activate.status, 0, mover2Ceremony.activate.stderr);
    const staleActivate = activate(
      alphaOwner.world,
      String(staleRelease.digest),
      alphaOwner,
      String(freshStaleBody.previewDigest),
    );
    record(
      "activate_on_stale_preview_fails",
      staleActivate.status !== 0 && staleActivate.stderr.includes("release preview is stale"),
    );
    const wrongPreviewActivate = activate(
      alphaOwner.world,
      String(staleRelease.digest),
      alphaOwner,
      String(mover2Ceremony.preview.previewDigest),
    );
    record(
      "wrong_preview_digest_fails",
      wrongPreviewActivate.status !== 0 &&
        (wrongPreviewActivate.stderr.includes("does not belong to this World") ||
          wrongPreviewActivate.stderr.includes("release preview is stale") ||
          wrongPreviewActivate.stderr.includes("was not found")),
    );

    const unpublishedMix = expectedFromBytes(alphaOwner.world, {
      ontology: alphaBytes.ontology,
      policy: alphaBytes.policy,
      executors: recoveryBytes.executors,
      components: "component catalog never published as this mix\n",
    });
    const mixActivate = activate(alphaOwner.world, unpublishedMix.digest, alphaOwner, "f".repeat(64));
    record(
      "unpublished_mixed_tuple_cannot_activate",
      mixActivate.status !== 0 && mixActivate.stderr.includes("was not found"),
    );

    const deniedAuthorityPolicy = buildPolicyCatalog({
      releaseAuthority: { activate_release: "deny" },
    });
    const deniedAuthorityBytes: CatalogBytes = {
      ...alphaBytes,
      policy: deniedAuthorityPolicy.bytes,
      components: "component catalog whose candidate Cedar denies activation\n",
    };
    const deniedAuthorityPath = await writeContent(
      "denied-authority.json",
      contentFromBytes(alphaOwner.world, deniedAuthorityBytes),
    );
    const deniedAuthorityRelease = construct(deniedAuthorityPath);
    assert.equal(publish(deniedAuthorityPath, alphaBuilder).status, 0);
    const deniedAuthorityPreview = preview(alphaOwner.world, String(deniedAuthorityRelease.digest), alphaOwner);
    assert.equal(deniedAuthorityPreview.status, 0, deniedAuthorityPreview.stderr);
    const deniedAuthorityDecision = decide(
      String((deniedAuthorityPreview.body ?? {}).previewDigest),
      alphaOwner,
      "approve",
    );
    assert.equal(deniedAuthorityDecision.status, 0, deniedAuthorityDecision.stderr);
    const activeBeforePolicyDeny = parseJson(
      runZoen(["world", "release", "active", "--world", alphaOwner.world]).stdout,
    );
    const deniedByCandidatePolicy = activate(
      alphaOwner.world,
      String(deniedAuthorityRelease.digest),
      alphaOwner,
      String((deniedAuthorityPreview.body ?? {}).previewDigest),
    );
    record(
      "candidate_policy_catalog_can_deny_owner_activation",
      membershipAuthorityDenied(deniedByCandidatePolicy),
    );
    const activeAfterPolicyDeny = parseJson(
      runZoen(["world", "release", "active", "--world", alphaOwner.world]).stdout,
    );
    record(
      "candidate_policy_denial_preserves_active_pointer",
      activeAfterPolicyDeny.digest === activeBeforePolicyDeny.digest,
    );

    const concurrentABytes: CatalogBytes = {
      ...alphaBytes,
      ontology: `${JSON.stringify({
        label: "concurrent.first.a",
        publicVerbs: ["Discover", "Query", "Propose", "Decide", "Commit", "Explain", "Execute"],
        schema: "zoen.ontology-catalog.v1",
      })}\n`,
    };
    const concurrentBBytes: CatalogBytes = {
      ...alphaBytes,
      ontology: `${JSON.stringify({
        label: "concurrent.first.b",
        publicVerbs: ["Discover", "Query", "Propose", "Decide", "Commit", "Explain", "Execute"],
        schema: "zoen.ontology-catalog.v1",
      })}\n`,
    };
    const concurrentAPath = await writeContent(
      "concurrent-first-a.json",
      contentFromBytes(concurrentOwner.world, concurrentABytes),
    );
    const concurrentBPath = await writeContent(
      "concurrent-first-b.json",
      contentFromBytes(concurrentOwner.world, concurrentBBytes),
    );
    const concurrentA = construct(concurrentAPath);
    const concurrentB = construct(concurrentBPath);
    assert.equal(publish(concurrentAPath, concurrentBuilder).status, 0);
    assert.equal(publish(concurrentBPath, concurrentBuilder).status, 0);
    const concurrentAPreview = preview(concurrentOwner.world, String(concurrentA.digest), concurrentOwner);
    const concurrentBPreview = preview(concurrentOwner.world, String(concurrentB.digest), concurrentOwner);
    assert.equal(concurrentAPreview.status, 0, concurrentAPreview.stderr);
    assert.equal(concurrentBPreview.status, 0, concurrentBPreview.stderr);
    record(
      "concurrent_previews_both_observe_no_first_activation",
      (concurrentAPreview.body ?? {}).currentActive === null && (concurrentBPreview.body ?? {}).currentActive === null,
    );
    assert.equal(decide(String((concurrentAPreview.body ?? {}).previewDigest), concurrentOwner, "approve").status, 0);
    assert.equal(decide(String((concurrentBPreview.body ?? {}).previewDigest), concurrentOwner, "approve").status, 0);

    const concurrencyObserver = new PostgresClient({ connectionString: databaseUrl });
    await concurrencyObserver.connect();
    try {
      const lockRowsBefore = await concurrencyObserver.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM world_release_activation_locks WHERE world_id = $1",
        [concurrentOwner.world],
      );
      record("concurrent_first_activation_starts_without_world_lock_row", Number(lockRowsBefore.rows[0]?.count) === 0);
      const results = await Promise.all([
        runZoenAsync(
          activationArguments(
            concurrentOwner.world,
            String(concurrentA.digest),
            concurrentOwner,
            String((concurrentAPreview.body ?? {}).previewDigest),
          ),
        ),
        runZoenAsync(
          activationArguments(
            concurrentOwner.world,
            String(concurrentB.digest),
            concurrentOwner,
            String((concurrentBPreview.body ?? {}).previewDigest),
          ),
        ),
      ]);
      const candidates = [
        { digest: String(concurrentA.digest), result: results[0] },
        { digest: String(concurrentB.digest), result: results[1] },
      ];
      const winners = candidates.filter((candidate) => candidate.result.status === 0);
      const stale = candidates.filter(
        (candidate) => candidate.result.status !== 0 && candidate.result.stderr.includes("release preview is stale"),
      );
      record("concurrent_first_activation_has_one_winner_one_stale_loser", winners.length === 1 && stale.length === 1);
      const winner = winners[0];
      const loser = stale[0];
      assert.ok(winner);
      assert.ok(loser);
      const activeConcurrent = runZoen(["world", "release", "active", "--world", concurrentOwner.world]);
      assert.equal(activeConcurrent.status, 0, activeConcurrent.stderr);
      const finalPointer = String(parseJson(activeConcurrent.stdout).digest);
      record("concurrent_first_activation_pointer_is_winner", finalPointer === winner.digest);
      record("concurrent_stale_loser_never_regresses_final_pointer", finalPointer !== loser.digest);
      concurrentFirstActivation = {
        candidateA: String(concurrentA.digest),
        candidateB: String(concurrentB.digest),
        finalPointer,
        loser: loser.digest,
        winner: winner.digest,
      };
      const lockRowsAfter = await concurrencyObserver.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM world_release_activation_locks WHERE world_id = $1",
        [concurrentOwner.world],
      );
      record("concurrent_first_activation_materializes_one_world_lock_row", Number(lockRowsAfter.rows[0]?.count) === 1);
      const pointerRows = await concurrencyObserver.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM world_active_releases WHERE world_id = $1",
        [concurrentOwner.world],
      );
      record("concurrent_first_activation_keeps_one_pointer_row", Number(pointerRows.rows[0]?.count) === 1);
    } finally {
      await concurrencyObserver.end();
    }

    const revokedBuilder = await identityAdmin("POST", "/identity/admin/revoke", {
      membershipId: alphaBuilder.membership,
      reason: "security",
    });
    assert.equal(revokedBuilder.status, 204, JSON.stringify(revokedBuilder.body));
    const publicationsBeforeRevokedReplay = await publicationCount();
    const revokedPublishReplay = publish(liveAlphaPath, alphaBuilder);
    record(
      "revoked_builder_cannot_replay_publish",
      membershipAuthorityDenied(revokedPublishReplay),
    );
    record("revoked_publish_replay_writes_nothing", (await publicationCount()) === publicationsBeforeRevokedReplay);
    const revokedOwner = await identityAdmin("POST", "/identity/admin/revoke", {
      membershipId: alphaOwner.membership,
      reason: "security",
    });
    assert.equal(revokedOwner.status, 204, JSON.stringify(revokedOwner.body));
    const revokedReplay = preview(alphaOwner.world, String(liveConstruct.digest), alphaOwner);
    record(
      "revoked_owner_is_denied_on_replay",
      membershipAuthorityDenied(revokedReplay),
    );

    const artifactPath = await writeScenarioArtifact(repositoryRoot, scenario, {
      assertions,
      concurrentFirstActivation,
      dimensions: {
        actors:
          "a durable invited Builder Membership publishes, while a distinct invited Owner Membership previews, decides, and activates; authority comes from their disjoint stored delegations rather than principal suffixes",
        isolation:
          "another World's durable Membership cannot publish, preview, or activate here; release and catalog reads remain World-bound",
        negative:
          "forged owner suffix, mismatched and revoked Memberships, candidate-Cedar deny, caller-supplied policy evidence, mixed catalogs, absent approval, rejection, and stale/wrong preview all fail closed",
        path: "identity admin verifies two accounts and creates/accepts real World invites; CLI resolves each invited Membership from Postgres, checks role-scoped delegation, derives policy evidence from candidate Cedar, then atomically activates the four-catalog release",
        recovery:
          "decide without activate keeps prior pointer and durable decision; retry converges; two approved first candidates contend on one World lock and yield one winner plus one stale loser",
        replay:
          "identical publish, preview, decide, and activate reauthorize the current durable Membership; revocation denies the next replay",
      },
      fixtureDigest,
      finishedAt: new Date().toISOString(),
      firstDigest: liveConstruct.digest,
      startedAt,
    });
    console.log(`world-release PASS artifact=${artifactPath}`);
  } finally {
    await stopIdentityServer(identityServer);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exitCode = 1;
});
