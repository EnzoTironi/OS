import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";
import canonicalize from "canonicalize";
import { Client as PostgresClient } from "pg";
import {
  type AuthorizationPolicy,
  type BudgetClassSpec,
  plantBudgetRelease,
} from "./budget-class/plant-release.js";
import {
  e2eGeneratedDirectory,
  e2ePostgresUrl,
  writeScenarioArtifact,
} from "./host-env.js";
import {
  KERNEL_AUTHORITY_DEFINITION_DIGEST,
  asString,
  provisionWorldMembership,
  recordAssertion,
  startReleaseIdentityServer,
  stopReleaseIdentityServer,
  zoenBinaryPath,
} from "./kernel-world-support.js";
import { gitHead } from "./scenario-evidence.js";
import { parseZoenJson, type ZoenCliResult } from "./zoen-cli.js";

const scenario = "cursor-security";
const repositoryRoot = process.cwd();
const databaseUrl = e2ePostgresUrl("postgres", "postgres", 55_548);
const generatedDirectory = e2eGeneratedDirectory(repositoryRoot, scenario);
const zoenPath = zoenBinaryPath(repositoryRoot);

const world = "world.cursor-security";
const objectType = "clinic.Patient";
const alternateObjectType = "clinic.Note";

const defaultBudget = "budget.query.default";
const alternateBudget = "budget.query.alternate";
const budgetTemplate = {
  deadlineMillis: 2_000,
  fuel: 5_000_000,
  instances: 4,
  memories: 2,
  memoryBytes: 8 * 1024 * 1024,
  tableElements: 1_024,
  tables: 2,
} as const;
const budgets: BudgetClassSpec[] = [
  { ...budgetTemplate, id: defaultBudget },
  { ...budgetTemplate, fuel: 2_500_000, id: alternateBudget },
];

interface CursorServerConfig {
  activeKeyId: string;
  encodedKeys: string;
  ttlSeconds: number;
}

interface ZoenResult extends ZoenCliResult {
  body?: Record<string, unknown>;
}

const stableConfig: CursorServerConfig = {
  activeKeyId: requiredEnvironment("ZOEN_CURSOR_ACTIVE_KEY_ID"),
  encodedKeys: requiredEnvironment("ZOEN_CURSOR_KEYS"),
  ttlSeconds: Number(requiredEnvironment("ZOEN_CURSOR_TTL_SECONDS")),
};
assert.ok(Number.isInteger(stableConfig.ttlSeconds) && stableConfig.ttlSeconds > 0);

const oldKeyEntry = stableConfig.encodedKeys;
const newKeyEntry = `cursor-new:${"22".repeat(32)}`;
const rotatedConfig: CursorServerConfig = {
  activeKeyId: "cursor-new",
  encodedKeys: `${newKeyEntry},${oldKeyEntry}`,
  ttlSeconds: stableConfig.ttlSeconds,
};
const newOnlyConfig: CursorServerConfig = {
  activeKeyId: "cursor-new",
  encodedKeys: newKeyEntry,
  ttlSeconds: stableConfig.ttlSeconds,
};
const expiringConfig: CursorServerConfig = {
  ...stableConfig,
  ttlSeconds: 1,
};

const assertions: Record<string, boolean> = {};
const record = (name: string, observed: boolean): void =>
  recordAssertion(assertions, name, observed);

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} is required`);
  }
  return value;
}

function queryPolicy(actorIds: readonly string[]): AuthorizationPolicy {
  const actionId = "zoen.world.query";
  const permittedActors = actorIds
    .map((actorId) => `context.actorId == "${actorId}"`)
    .join(" ||\n        ");
  const source = `permit (
    principal,
    action == Action::"query",
    resource
)
when {
    context.actionId == "${actionId}" &&
    (${permittedActors})
};
`;
  return {
    actionId,
    definitionDigest: KERNEL_AUTHORITY_DEFINITION_DIGEST,
    digest: createHash("sha256").update(source).digest("hex"),
    policyId: "policy.cursor.query.r1",
    revision: 1,
    source,
  };
}

async function seedObjectFixtures(
  subjects: readonly { membership: string; principal: string }[],
): Promise<void> {
  const database = new PostgresClient({ connectionString: databaseUrl });
  await database.connect();
  try {
    await database.query("BEGIN");
    const objects = [
      ...[1, 2, 3, 4, 5, 6, 7].map((index) => ({
        id: `patient.${index}`,
        type: objectType,
      })),
      { id: "note.1", type: alternateObjectType },
    ];
    for (const object of objects) {
      await database.query(
        `INSERT INTO world_kernel_objects (
           world_id, object_type, object_id, fields_jcs, planted_at_micros
         ) VALUES ($1, $2, $3, $4, $5)`,
        [world, object.type, object.id, JSON.stringify({ label: object.id }), Date.now() * 1000],
      );
      for (const subject of subjects) {
        await database.query(
          `INSERT INTO world_kernel_object_grants (
             world_id, object_type, object_id, principal_id, membership_id
           ) VALUES ($1, $2, $3, $4, $5)`,
          [world, object.type, object.id, subject.principal, subject.membership],
        );
      }
    }
    await database.query("COMMIT");
  } catch (error) {
    await database.query("ROLLBACK");
    throw error;
  } finally {
    await database.end();
  }
}

function runZoen(
  args: readonly string[],
  config: CursorServerConfig | null = stableConfig,
): ZoenResult {
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: databaseUrl,
  };
  delete environment.ZOEN_CURSOR_ACTIVE_KEY_ID;
  delete environment.ZOEN_CURSOR_KEYS;
  delete environment.ZOEN_CURSOR_TTL_SECONDS;
  if (config !== null) {
    environment.ZOEN_CURSOR_ACTIVE_KEY_ID = config.activeKeyId;
    environment.ZOEN_CURSOR_KEYS = config.encodedKeys;
    environment.ZOEN_CURSOR_TTL_SECONDS = String(config.ttlSeconds);
  }
  try {
    const stdout = execFileSync(zoenPath, [...args], {
      encoding: "utf8",
      env: environment,
    });
    return {
      body: stdout.trim() === "" ? undefined : parseZoenJson(stdout),
      status: 0,
      stderr: "",
      stdout,
    };
  } catch (error) {
    if (error !== null && typeof error === "object" && "status" in error) {
      const failed = error as {
        status: number | null;
        stderr: string | Buffer;
        stdout: string | Buffer;
      };
      return {
        status: failed.status ?? 1,
        stderr: String(failed.stderr),
        stdout: String(failed.stdout),
      };
    }
    throw error;
  }
}

function queryObjects(
  subject: { membership: string; principal: string },
  options: {
    config?: CursorServerConfig | null;
    cursor?: string;
    limit?: number;
    type?: string;
  } = {},
): ZoenResult {
  const args = [
    "kernel",
    "query",
    "--world",
    world,
    "--principal",
    subject.principal,
    "--membership",
    subject.membership,
    "--type",
    options.type ?? objectType,
    "--limit",
    String(options.limit ?? 2),
  ];
  if (options.cursor !== undefined) {
    args.push("--cursor", options.cursor);
  }
  return runZoen(args, options.config === undefined ? stableConfig : options.config);
}

function objectIds(result: ZoenResult): string[] {
  const objects = result.body?.objects;
  if (!Array.isArray(objects)) {
    return [];
  }
  return objects.map((entry) => String((entry as { objectId?: unknown }).objectId));
}

function deniedForCursorBinding(result: ZoenResult): boolean {
  return (
    result.status !== 0 &&
    result.stderr.includes(
      "sealed cursor does not match authority, query, release, or budget",
    )
  );
}

function parseCursor(token: string): {
  afterObjectId: string;
  expiresAtUnixSeconds: number;
  keyId: string;
  tag: string;
} {
  const parts = token.split("/");
  assert.equal(parts.length, 5);
  assert.equal(parts[0], "v3");
  const keyId = parts[1];
  const expiresAt = parts[2];
  const afterHex = parts[3];
  const tag = parts[4];
  assert.ok(keyId !== undefined && expiresAt !== undefined);
  assert.ok(afterHex !== undefined && tag !== undefined);
  const expiresAtUnixSeconds = Number(expiresAt);
  assert.ok(Number.isSafeInteger(expiresAtUnixSeconds));
  return {
    afterObjectId: Buffer.from(afterHex, "hex").toString("utf8"),
    expiresAtUnixSeconds,
    keyId,
    tag,
  };
}

function flipLastHexCharacter(token: string): string {
  const last = token.at(-1);
  assert.ok(last !== undefined);
  return `${token.slice(0, -1)}${last === "0" ? "1" : "0"}`;
}

function activeSecretHex(config: CursorServerConfig): string {
  const entry = config.encodedKeys
    .split(",")
    .find((candidate) => candidate.startsWith(`${config.activeKeyId}:`));
  assert.ok(entry !== undefined);
  const secret = entry.slice(config.activeKeyId.length + 1);
  assert.match(secret, /^[0-9a-f]+$/);
  return secret;
}

function forgeWithUnkeyedSha256(
  token: string,
  body: Record<string, unknown>,
): { canonicalPayloadMatchesServer: boolean; token: string } {
  const parsed = parseCursor(token);
  const catalog = body.catalog;
  const claims = body.cursorClaims;
  assert.ok(catalog !== null && typeof catalog === "object");
  assert.ok(claims !== null && typeof claims === "object");
  const planDigest = Reflect.get(claims, "authorizedObjectSetPlanDigest");
  const policyDigest = Reflect.get(catalog, "policy");
  const trustedAuthorityDigest = Reflect.get(claims, "trustedAuthorityDigest");
  assert.equal(typeof planDigest, "string");
  assert.equal(typeof policyDigest, "string");
  assert.equal(typeof trustedAuthorityDigest, "string");
  const payload = canonicalize({
    afterObjectId: parsed.afterObjectId,
    authorityCut: null,
    authorityPrincipal: actor.principal,
    authorizedPlanDigest: planDigest,
    budgetId: body.budgetId,
    expiresAtUnixSeconds: parsed.expiresAtUnixSeconds,
    keyId: parsed.keyId,
    membership: actor.membership,
    objectType,
    pageLimit: body.pageLimit,
    policyDigest,
    releaseDigest: body.releaseDigest,
    schema: "zoen.sealed-cursor.v3",
    sortOrder: "object_id.asc",
    trustedAuthorityDigest,
    world,
  });
  if (payload === undefined) {
    throw new Error("cursor forgery payload did not canonicalize");
  }
  const serverTagControl = createHmac(
    "sha256",
    Buffer.from(activeSecretHex(stableConfig), "hex"),
  )
    .update(payload)
    .digest("hex");
  const forgedTag = createHash("sha256").update(payload).digest("hex");
  assert.notEqual(forgedTag, parsed.tag);
  const parts = token.split("/");
  return {
    canonicalPayloadMatchesServer: serverTagControl === parsed.tag,
    token: [...parts.slice(0, -1), forgedTag].join("/"),
  };
}

const startedAt = new Date().toISOString();
const sourceCommit = gitHead(repositoryRoot);
const identityServer = await startReleaseIdentityServer({
  databaseUrl,
  generatedDirectory,
  portFallback: 58_548,
  zoenPath,
});
const actorSpec = {
  actor: "actor.cursor.primary",
  principal: "principal.cursor.reader",
  subjectKey: "cursor-primary",
  workload: "workload.cursor.primary",
} as const;
const alternateMembershipSpec = {
  actor: "actor.cursor.alternate-membership",
  principal: actorSpec.principal,
  subjectKey: "cursor-alternate-membership",
  workload: "workload.cursor.alternate-membership",
} as const;
const alternatePrincipalSpec = {
  actor: "actor.cursor.alternate-principal",
  principal: "principal.cursor.other",
  subjectKey: "cursor-alternate-principal",
  workload: "workload.cursor.alternate-principal",
} as const;
const actorSpecs = [actorSpec, alternateMembershipSpec, alternatePrincipalSpec] as const;
const [actor, alternateMembership, alternatePrincipal] = await Promise.all(
  actorSpecs.map(async (spec) =>
    provisionWorldMembership({
      actionIds: ["zoen.world.query"],
      baseUrl: identityServer.baseUrl,
      world,
      ...spec,
    }),
  ),
) as [
  Awaited<ReturnType<typeof provisionWorldMembership>>,
  Awaited<ReturnType<typeof provisionWorldMembership>>,
  Awaited<ReturnType<typeof provisionWorldMembership>>,
];
const release = await (async () => {
  try {
    return await plantBudgetRelease({
      authorizationPolicies: [queryPolicy(actorSpecs.map((spec) => spec.actor))],
      budgets,
      databaseUrl,
      generatedDirectory,
      identityBaseUrl: identityServer.baseUrl,
      world,
      zoenPath,
    });
  } finally {
    await stopReleaseIdentityServer(identityServer);
  }
})();
record(
  "release_owns_both_budget_classes",
  release.budgetClassIds.join(",") === `${defaultBudget},${alternateBudget}`,
);
await seedObjectFixtures([actor, alternateMembership, alternatePrincipal]);

const noKeyring = queryObjects(actor, { config: null });
record(
  "object_query_fails_closed_without_server_keyring",
  noKeyring.status !== 0 &&
    noKeyring.stderr.includes("server cursor keyring is not configured"),
);

const firstPage = queryObjects(actor);
assert.equal(firstPage.status, 0, firstPage.stderr || firstPage.stdout);
const firstCursor = asString(firstPage.body?.nextCursor);
const firstClaims = firstPage.body?.cursorClaims as
  | Record<string, unknown>
  | undefined;
record("v3_key_id_is_carried", firstCursor.startsWith("v3/cursor-old/"));
record(
  "server_selects_the_release_query_budget",
  firstPage.body?.budgetId === defaultBudget,
);
record(
  "membership_authority_digest_is_server_issued",
  firstPage.body?.authorityEvaluation === "MEMBERSHIP_EVALUATED" &&
    typeof firstClaims?.trustedAuthorityDigest === "string" &&
    asString(firstClaims.trustedAuthorityDigest).length === 64 &&
    firstClaims.authorityCut === null,
);
record(
  "authorized_plan_digest_is_server_issued",
  typeof firstClaims?.authorizedObjectSetPlanDigest === "string" &&
    asString(firstClaims.authorizedObjectSetPlanDigest).length === 64,
);
record(
  "compute_claim_is_narrowed",
  firstPage.body?.computeEvaluation === "NOT_EVALUATED" &&
    !Object.hasOwn(firstPage.body ?? {}, "computeDigest") &&
    typeof firstPage.body?.pageDigest === "string",
);
record(
  "first_page_obeys_bounded_pagination",
  firstPage.body?.authorizedCount === 7 &&
    firstPage.body.pageLimit === 2 &&
    objectIds(firstPage).join(",") === "patient.1,patient.2",
);

const restartedProcessPage = queryObjects(actor, { cursor: firstCursor });
assert.equal(
  restartedProcessPage.status,
  0,
  restartedProcessPage.stderr || restartedProcessPage.stdout,
);
record(
  "stable_key_survives_fresh_process",
  objectIds(restartedProcessPage).join(",") === "patient.3,patient.4",
);

const tampered = queryObjects(actor, {
  cursor: flipLastHexCharacter(firstCursor),
});
record("single_byte_tamper_is_denied", deniedForCursorBinding(tampered));

const unkeyedForgery = forgeWithUnkeyedSha256(
  firstCursor,
  firstPage.body ?? {},
);
record(
  "canonical_payload_reconstruction_matches_server",
  unkeyedForgery.canonicalPayloadMatchesServer,
);
const forged = queryObjects(actor, { cursor: unkeyedForgery.token });
record("recomputed_unkeyed_forgery_is_denied", deniedForCursorBinding(forged));

const basisMismatches = [
  queryObjects(alternateMembership, { cursor: firstCursor }),
  queryObjects(alternatePrincipal, { cursor: firstCursor }),
  queryObjects(actor, { cursor: firstCursor, limit: 3 }),
  queryObjects(actor, { cursor: firstCursor, type: alternateObjectType }),
];
record(
  "authority_and_query_basis_mismatches_are_denied",
  basisMismatches.every(deniedForCursorBinding),
);

const callerSelectedBudget = runZoen([
  "kernel",
  "query",
  "--world",
  world,
  "--principal",
  actor.principal,
  "--membership",
  actor.membership,
  "--type",
  objectType,
  "--limit",
  "2",
  "--budget-class",
  alternateBudget,
]);
record(
  "caller_cannot_select_a_published_budget_class",
  callerSelectedBudget.status !== 0 &&
    callerSelectedBudget.stderr.includes("unexpected argument '--budget-class'"),
);

const rotatedPage = queryObjects(actor, {
  config: rotatedConfig,
  cursor: firstCursor,
});
assert.equal(rotatedPage.status, 0, rotatedPage.stderr || rotatedPage.stdout);
const rotatedCursor = asString(rotatedPage.body?.nextCursor);
record(
  "rotation_retains_old_verification_key",
  objectIds(rotatedPage).join(",") === "patient.3,patient.4",
);
record("rotation_signs_with_new_active_key", rotatedCursor.startsWith("v3/cursor-new/"));

const newKeyPage = queryObjects(actor, {
  config: newOnlyConfig,
  cursor: rotatedCursor,
});
assert.equal(newKeyPage.status, 0, newKeyPage.stderr || newKeyPage.stdout);
record(
  "new_key_persists_after_old_key_retirement",
  objectIds(newKeyPage).join(",") === "patient.5,patient.6",
);
const retiredOldKey = queryObjects(actor, {
  config: newOnlyConfig,
  cursor: firstCursor,
});
record("retired_key_cursor_is_denied", deniedForCursorBinding(retiredOldKey));

const expiringPage = queryObjects(actor, { config: expiringConfig });
assert.equal(expiringPage.status, 0, expiringPage.stderr || expiringPage.stdout);
const expiringCursor = asString(expiringPage.body?.nextCursor);
await delay(1_100);
const expired = queryObjects(actor, {
  config: expiringConfig,
  cursor: expiringCursor,
});
record(
  "authentic_cursor_expires",
  expired.status !== 0 && expired.stderr.includes("sealed cursor has expired"),
);

const artifactPath = await writeScenarioArtifact(repositoryRoot, scenario, {
  assertions,
  claims: {
    authorizedObjectSetPlanDigest: "EVALUATED",
    computation: "NOT_EVALUATED",
    cursorExpiry: "EVALUATED",
    cursorIntegrity: "EVALUATED",
    cursorKeyPersistenceAndRotation: "EVALUATED",
    serverSelectedBudget: "EVALUATED",
    trustedAuthorityCut: "NOT_EVALUATED",
    trustedAuthorityDigest: "EVALUATED",
  },
  dimensions: {
    basis:
      "HMAC binds principal, membership, World, object type, active release, policy, server-selected release BudgetClass, page limit, sort order, authorized plan digest, position, key id, and expiry",
    forgery:
      "one-byte tag mutation and a full canonical-payload SHA-256 recomputation without the server key are denied",
    persistence:
      "a cursor issued by one zoen process is accepted by a fresh process loading the same stable key configuration",
    rotation:
      "retained old key verifies, active new key signs, new key survives old-key retirement, and retired old cursors fail closed",
    scope:
      "cursor-security substrate only; real Membership authority is re-resolved for every page, while governed materialization and computation remain outside this proof",
    setup:
      "immutable object/grant rows are fixture materialization; no obsolete public plant-object command is restored",
  },
  finalGates: {
    "FIN-05": {
      reason:
        "No monotonic Membership authority cut, governed materialization, or denied-field/series/count/lineage/citation path is evaluated by this substrate journey.",
      verdict: "NOT_EVALUATED",
    },
  },
  finishedAt: new Date().toISOString(),
  journeys: {
    J4: {
      reason:
        "Membership authority and cursor integrity are evaluated, but governed materialization, server-budgeted compute, Explain evidence, and a monotonic authority cut remain pending.",
      verdict: "NOT_EVALUATED",
    },
  },
  release: {
    budgetClassIds: release.budgetClassIds,
    digest: release.digest,
    policyCatalogDigest: release.policyCatalogDigest,
  },
  schema: "zoen.cursor-security-substrate.v1",
  sourceCommit,
  startedAt,
  unit: "W2-06-stage-A",
  verdict: "PASS",
});

const passed = Object.values(assertions).filter(Boolean).length;
const total = Object.keys(assertions).length;
console.log(
  `cursor-security substrate PASS assertions ${passed}/${total} J4=NOT_EVALUATED FIN-05=NOT_EVALUATED artifact=${artifactPath} sourceCommit=${sourceCommit}`,
);
