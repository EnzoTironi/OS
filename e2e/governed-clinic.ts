import assert from "node:assert/strict";
import {
  e2eGeneratedDirectory,
  e2ePostgresUrl,
  writeScenarioArtifact,
} from "./host-env.js";
import {
  KERNEL_SURFACES,
  asString,
  buildDiscoverPolicyCatalog,
  createZoenRunner,
  ontologyCatalogBytes,
  recordAssertion,
  writeGeneratedJson,
  zoenBinaryPath,
} from "./kernel-world-support.js";
import { gitHead } from "./scenario-evidence.js";

const scenario = "governed-clinic";
const repositoryRoot = process.cwd();
const postgresPortFallback = 55_492;
const databaseUrl = e2ePostgresUrl("postgres", "postgres", postgresPortFallback);
const generatedDirectory = e2eGeneratedDirectory(repositoryRoot, scenario);
const zoen = createZoenRunner(zoenBinaryPath(repositoryRoot), databaseUrl);

const objectType = "clinic.Patient";
const human = {
  principal: "principal.clinic.human",
  membership: "membership.clinic.human",
} as const;
const agent = {
  principal: "principal.clinic.agent",
  membership: "membership.clinic.agent",
} as const;
const stranger = {
  principal: "principal.stranger",
  membership: "membership.stranger",
} as const;

const assertions: Record<string, boolean> = {};
const record = (name: string, observed: boolean): void =>
  recordAssertion(assertions, name, observed);

function plant(
  world: string,
  objectId: string,
  fields: Record<string, unknown>,
  grants: string[],
) {
  return zoen.withBody(
    zoen.runZoen([
      "kernel",
      "plant-object",
      "--world",
      world,
      "--principal",
      "principal.owner",
      "--type",
      objectType,
      "--object-id",
      objectId,
      "--fields",
      JSON.stringify(fields),
      ...grants.flatMap((grant) => ["--grant", grant]),
      "--surface",
      "cli",
    ]),
  );
}

function queryObjects(
  world: string,
  actor: { principal: string; membership: string },
  opts: {
    cursor?: string;
    limit?: number;
    budgetClass?: string;
    surface?: string;
  } = {},
) {
  const args = [
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
    String(opts.limit ?? 2),
    "--surface",
    opts.surface ?? "cli",
  ];
  if (opts.cursor !== undefined && opts.cursor !== "") {
    args.push("--cursor", opts.cursor);
  }
  if (opts.budgetClass !== undefined) {
    args.push("--budget-class", opts.budgetClass);
  }
  return zoen.withBody(zoen.runZoen(args));
}

function objectIds(body: Record<string, unknown> | undefined): string[] {
  const objects = body?.objects;
  if (!Array.isArray(objects)) {
    return [];
  }
  return objects.map((entry) => String((entry as { objectId: string }).objectId));
}

const startedAt = new Date().toISOString();
const sourceCommit = gitHead(repositoryRoot);
const policy = buildDiscoverPolicyCatalog();
const content = {
  world: "world.clinic",
  parent: null,
  ontology: { bytes: ontologyCatalogBytes("governed-clinic") },
  policy: { bytes: policy.bytes },
  executors: { bytes: "executor catalog clinic v1\n" },
  components: { bytes: "component catalog clinic v1\n" },
};
const contentPath = await writeGeneratedJson(generatedDirectory, "clinic.json", content);
const release = zoen.construct(contentPath);
assert.equal(zoen.publish(contentPath, "principal.builder", policy.evidenceDigest).status, 0);
zoen.approveAndActivate("world.clinic", asString(release.digest), "principal.owner");

const humanGrant = `${human.principal}:${human.membership}`;
const agentGrant = `${agent.principal}:${agent.membership}`;
const ownerGrant = "principal.owner:membership.clinic.owner";

const planted = [
  plant("world.clinic", "patient.ada", { name: "Ada", ward: "A" }, [
    humanGrant,
    agentGrant,
    ownerGrant,
  ]),
  plant("world.clinic", "patient.beau", { name: "Beau", ward: "A" }, [
    humanGrant,
    agentGrant,
    ownerGrant,
  ]),
  plant("world.clinic", "patient.cara", { name: "Cara", ward: "B" }, [
    humanGrant,
    agentGrant,
    ownerGrant,
  ]),
  plant("world.clinic", "patient.drew", { name: "Drew", ward: "B" }, [
    humanGrant,
    agentGrant,
    ownerGrant,
  ]),
  plant(
    "world.clinic",
    "patient.ibm-secret",
    { name: "Secret", "ibm.restrictedField": "HIDDEN", "ibm.restrictedSeries": [1, 2, 3] },
    [ownerGrant],
  ),
  plant(
    "world.clinic",
    "patient.ibm-denied",
    { name: "Denied", "ibm.lineage": "private", citation: "sec://ibm" },
    [ownerGrant],
  ),
];
for (const result of planted) {
  assert.equal(result.status, 0, result.stderr);
}

const humanPage1 = queryObjects("world.clinic", human, { limit: 2, surface: "cli" });
assert.equal(humanPage1.status, 0, humanPage1.stderr);
const humanIds1 = objectIds(humanPage1.body);
record("j4_human_page1_two", humanIds1.length === 2);
record(
  "j4_human_page1_permitted_only",
  humanIds1.every((id) => !id.includes("ibm")),
);
record("j4_human_authorized_count_four", humanPage1.body?.authorizedCount === 4);
record("j4_human_budget_default", humanPage1.body?.budgetId === "budget.query.default");
record("j4_human_server_page_ceiling", humanPage1.body?.pageLimit === 2);
record(
  "j4_human_compute_digest",
  typeof humanPage1.body?.computeDigest === "string" &&
    asString(humanPage1.body.computeDigest).length === 64,
);
record(
  "j4_human_explain_policy",
  typeof humanPage1.body?.explanationJcs === "string" &&
    asString(humanPage1.body.explanationJcs).includes('"scannedUnauthorized":false'),
);
const humanCursor = asString(humanPage1.body?.nextCursor);
record("j4_human_sealed_cursor_issued", humanCursor.startsWith("v2/"));

const humanPage2 = queryObjects("world.clinic", human, {
  limit: 2,
  cursor: humanCursor,
  surface: "eve",
});
assert.equal(humanPage2.status, 0, humanPage2.stderr);
const humanIds2 = objectIds(humanPage2.body);
record("j4_human_page2_remaining", humanIds2.length === 2);
record(
  "j4_human_pages_disjoint",
  humanIds1.every((id) => !humanIds2.includes(id)),
);
record(
  "j4_human_full_set",
  [...humanIds1, ...humanIds2].toSorted((left, right) => left.localeCompare(right)).join(",") ===
    "patient.ada,patient.beau,patient.cara,patient.drew",
);

const agentPage1 = queryObjects("world.clinic", agent, { limit: 2, surface: "mcp" });
assert.equal(agentPage1.status, 0, agentPage1.stderr);
record("j4_agent_same_authorized_count", agentPage1.body?.authorizedCount === 4);
record(
  "j4_agent_same_first_page",
  objectIds(agentPage1.body).join(",") === humanIds1.join(","),
);

const surfaceCounts = KERNEL_SURFACES.map((surface) => {
  const page = queryObjects("world.clinic", human, { limit: 5, surface });
  assert.equal(page.status, 0, `${surface}: ${page.stderr}`);
  return {
    surface,
    count: page.body?.authorizedCount,
    ids: objectIds(page.body).join(","),
    hasIbm: JSON.stringify(page.body).includes("ibm.restricted"),
  };
});
record(
  "j4_surface_parity_counts",
  surfaceCounts.every((entry) => entry.count === 4),
);
record(
  "j4_surface_parity_ids",
  surfaceCounts.every((entry) => entry.ids === surfaceCounts[0]?.ids),
);
record(
  "fin05_surfaces_hide_ibm_fields",
  surfaceCounts.every((entry) => entry.hasIbm === false),
);

const strangerQuery = queryObjects("world.clinic", stranger, { limit: 2 });
record(
  "j4_negative_stranger_denied",
  strangerQuery.status !== 0 && strangerQuery.stderr.toLowerCase().includes("denied"),
);
const raisedBudget = queryObjects("world.clinic", human, {
  limit: 2,
  budgetClass: "budget.query.raised",
});
record(
  "j4_negative_budget_raise_denied",
  raisedBudget.status !== 0 && raisedBudget.stderr.includes("cannot raise budget"),
);
const overLimit = queryObjects("world.clinic", human, { limit: 99 });
assert.equal(overLimit.status, 0, overLimit.stderr);
record(
  "j4_negative_limit_clamped",
  overLimit.body?.pageLimit === 5 && objectIds(overLimit.body).length === 4,
);
const crossMembership = queryObjects("world.clinic", agent, {
  limit: 2,
  cursor: humanCursor,
});
record(
  "j4_negative_cursor_other_membership",
  crossMembership.status !== 0 &&
    crossMembership.stderr.includes("does not match authority, query, release, or budget"),
);

const replay = queryObjects("world.clinic", human, {
  limit: 2,
  cursor: humanCursor,
  surface: "connect",
});
assert.equal(replay.status, 0, replay.stderr);
record(
  "j4_replay_same_page",
  objectIds(replay.body).join(",") === humanIds2.join(",") &&
    replay.body?.computeDigest === humanPage2.body?.computeDigest &&
    replay.body?.explanationJcs === humanPage2.body?.explanationJcs,
);
const tampered = queryObjects("world.clinic", human, {
  limit: 2,
  cursor: `${humanCursor.slice(0, -2)}ff`,
});
record("j4_replay_tampered_cursor_denied", tampered.status !== 0);

const ownerPage = queryObjects(
  "world.clinic",
  { principal: "principal.owner", membership: "membership.clinic.owner" },
  { limit: 5 },
);
assert.equal(ownerPage.status, 0, ownerPage.stderr);
record("j4_isolation_owner_sees_six", ownerPage.body?.authorizedCount === 6);
record(
  "j4_isolation_denied_absent_from_clinic_count",
  humanPage1.body?.authorizedCount === 4 &&
    !objectIds(humanPage1.body).includes("patient.ibm-secret") &&
    !objectIds(humanPage1.body).includes("patient.ibm-denied"),
);
record(
  "fin05_denied_objects_absent_from_cursor_chain",
  !humanCursor.includes("ibm") && !asString(humanPage2.body?.nextCursor).includes("ibm"),
);

const recovered = queryObjects("world.clinic", human, {
  limit: 2,
  cursor: humanCursor,
  surface: "cli",
});
assert.equal(recovered.status, 0, recovered.stderr);
record(
  "j4_recovery_cursor_accepted",
  objectIds(recovered.body).join(",") === humanIds2.join(",") &&
    recovered.body?.authorizedCount === 4,
);
record(
  "j4_recovery_no_widen",
  objectIds(recovered.body).every((id) => !id.includes("ibm")),
);

const artifactPath = await writeScenarioArtifact(repositoryRoot, scenario, {
  assertions,
  dimensions: {
    actors:
      "clinic human and clinic agent page permitted clinic.Patient objects; owner plants grants",
    isolation:
      "owner-only ibm-secret/ibm-denied patients never enter clinic authorizedCount, pages, cursors, or computeDigest",
    negative:
      "stranger denied; caller budget raise rejected; cursor sealed to membership fails under the other actor; tampered cursor denied",
    path: "activate WorldRelease → plant granted patients → authorize-before-discovery Query → sealed cursor pages → server-budgeted compute → explain policy",
    recovery:
      "fresh process accepts a still-valid sealed cursor and returns the same authorized page without widening to denied IBM objects",
    replay:
      "same sealed cursor and authority/query/release/budget basis returns the same authorized page, computeDigest, and explanation",
  },
  finalGates: {
    "FIN-05": {
      proof:
        "Unauthorized IBM fields/series/lineage/citations never appear on CLI/Connect/MCP/Eve clinic queries; authorizedCount and cursors exclude denied patients; scannedUnauthorized=false",
      surfaces: surfaceCounts,
    },
  },
  finishedAt: new Date().toISOString(),
  journey: "J4",
  sourceCommit,
  startedAt,
  unit: "W2-06",
});
const passed = Object.values(assertions).filter(Boolean).length;
const total = Object.keys(assertions).length;
console.log(
  `governed-clinic PASS assertions ${passed}/${total} artifact=${artifactPath} sourceCommit=${sourceCommit}`,
);
