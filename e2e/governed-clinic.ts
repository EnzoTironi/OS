import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  e2eGeneratedDirectory,
  e2ePostgresUrl,
  writeScenarioArtifact,
} from "./host-env.js";
import { gitHead } from "./scenario-evidence.js";

const scenario = "governed-clinic";
const repositoryRoot = process.cwd();
const postgresPortFallback = 55_492;
const databaseUrl = e2ePostgresUrl("postgres", "postgres", postgresPortFallback);
const generatedDirectory = e2eGeneratedDirectory(repositoryRoot, scenario);
const targetDir = process.env.CARGO_TARGET_DIR ?? path.join(repositoryRoot, "target");
const zoenPath = path.join(targetDir, "debug", "zoen");

const worldDefinitionDigest = "a".repeat(64);
const worldActionId = "zoen.world.discover";
const sevenVerbs = [
  "Discover",
  "Query",
  "Propose",
  "Decide",
  "Commit",
  "Explain",
  "Execute",
] as const;
const surfaces = ["cli", "connect", "mcp", "eve"] as const;
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

function record(name: string, observed: boolean): void {
  assert.ok(observed, name);
  assertions[name] = observed;
}

function ontologyBytes(label: string): string {
  return `${JSON.stringify({
    label,
    publicVerbs: [...sevenVerbs],
    schema: "zoen.ontology-catalog.v1",
  })}\n`;
}

function buildPolicyCatalog(): { bytes: string; evidenceDigest: string } {
  const source = `permit (
    principal,
    action == Action::"discover",
    resource
)
when {
    context.actionId == "${worldActionId}"
};
`;
  const policyDigest = createHash("sha256").update(source).digest("hex");
  const bytes = `${JSON.stringify({
    schema: "zoen.policy-catalog.v1",
    authorization: {
      policies: [
        {
          actionId: worldActionId,
          definitionDigest: worldDefinitionDigest,
          digest: policyDigest,
          policyId: "policy.world.discover.r1",
          revision: 1,
          source,
        },
      ],
    },
    membership: [],
    sourceAdmission: [],
  })}\n`;
  return { bytes, evidenceDigest: policyDigest };
}

interface ZoenResult {
  status: number | null;
  stdout: string;
  stderr: string;
  body?: Record<string, unknown>;
}

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

async function writeContent(name: string, content: Record<string, unknown>): Promise<string> {
  await mkdir(generatedDirectory, { recursive: true });
  const file = path.join(generatedDirectory, name);
  await writeFile(file, `${JSON.stringify(content, null, 2)}\n`);
  return file;
}

function construct(file: string): Record<string, unknown> {
  const result = runZoen(["world", "release", "construct", "--file", file]);
  assert.equal(result.status, 0, result.stderr);
  return parseJson(result.stdout);
}

function publish(file: string, principal: string, evidenceDigest: string): ZoenResult {
  return runZoen([
    "world",
    "release",
    "publish",
    "--file",
    file,
    "--principal",
    principal,
    "--policy-id",
    "policy.world",
    "--policy-digest",
    evidenceDigest,
    "--policy-revision",
    "1",
    "--determining-policy",
    "policy.world",
  ]);
}

function preview(world: string, digest: string, principal: string): ZoenResult {
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
      principal,
    ]),
  );
}

function decideRelease(previewDigest: string, principal: string, decision: "approve" | "reject"): ZoenResult {
  return runZoen([
    "world",
    "release",
    "decide",
    "--preview-digest",
    previewDigest,
    "--principal",
    principal,
    "--decision",
    decision,
  ]);
}

function activate(world: string, digest: string, principal: string, previewDigest: string): ZoenResult {
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
    principal,
  ]);
}

function approveAndActivate(world: string, digest: string, principal: string): void {
  const previewed = preview(world, digest, principal);
  assert.equal(previewed.status, 0, previewed.stderr);
  const previewDigest = String(previewed.body?.previewDigest);
  assert.equal(decideRelease(previewDigest, principal, "approve").status, 0);
  assert.equal(activate(world, digest, principal, previewDigest).status, 0);
}

function plant(
  world: string,
  objectId: string,
  fields: Record<string, unknown>,
  grants: string[],
): ZoenResult {
  return withBody(
    runZoen([
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
): ZoenResult {
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
  return withBody(runZoen(args));
}

function objectIds(body: Record<string, unknown> | undefined): string[] {
  const objects = body?.objects;
  if (!Array.isArray(objects)) {
    return [];
  }
  return objects.map((entry) => String((entry as { objectId: string }).objectId));
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const sourceCommit = gitHead(repositoryRoot);
  const policy = buildPolicyCatalog();
  const content = {
    world: "world.clinic",
    parent: null,
    ontology: { bytes: ontologyBytes("governed-clinic") },
    policy: { bytes: policy.bytes },
    executors: { bytes: "executor catalog clinic v1\n" },
    components: { bytes: "component catalog clinic v1\n" },
  };
  const contentPath = await writeContent("clinic.json", content);
  const release = construct(contentPath);
  assert.equal(publish(contentPath, "principal.builder", policy.evidenceDigest).status, 0);
  approveAndActivate("world.clinic", String(release.digest), "principal.owner");

  const humanGrant = `${human.principal}:${human.membership}`;
  const agentGrant = `${agent.principal}:${agent.membership}`;
  const ownerGrant = "principal.owner:membership.clinic.owner";

  // Plant six patients. Two are owner-only (denied to clinic). Four are clinic-visible.
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

  // J4 actors + path: clinic human and clinic agent read only permitted patients
  const humanPage1 = queryObjects("world.clinic", human, { limit: 2, surface: "cli" });
  assert.equal(humanPage1.status, 0, humanPage1.stderr);
  const humanIds1 = objectIds(humanPage1.body);
  record("j4_human_page1_two", humanIds1.length === 2);
  record(
    "j4_human_page1_permitted_only",
    humanIds1.every((id) => !id.includes("ibm")),
  );
  record("j4_human_authorized_count_four", humanPage1.body?.authorizedCount === 4);
  record(
    "j4_human_budget_default",
    humanPage1.body?.budgetId === "budget.query.default",
  );
  record(
    "j4_human_server_page_ceiling",
    humanPage1.body?.pageLimit === 2,
  );
  record(
    "j4_human_compute_digest",
    typeof humanPage1.body?.computeDigest === "string" &&
      String(humanPage1.body.computeDigest).length === 64,
  );
  record(
    "j4_human_explain_policy",
    typeof humanPage1.body?.explanationJcs === "string" &&
      String(humanPage1.body.explanationJcs).includes('"scannedUnauthorized":false'),
  );
  const humanCursor = String(humanPage1.body?.nextCursor ?? "");
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
    [...humanIds1, ...humanIds2].sort().join(",") ===
      "patient.ada,patient.beau,patient.cara,patient.drew",
  );

  const agentPage1 = queryObjects("world.clinic", agent, { limit: 2, surface: "mcp" });
  assert.equal(agentPage1.status, 0, agentPage1.stderr);
  record(
    "j4_agent_same_authorized_count",
    agentPage1.body?.authorizedCount === 4,
  );
  record(
    "j4_agent_same_first_page",
    objectIds(agentPage1.body).join(",") === humanIds1.join(","),
  );

  // Surface parity (FIN-05 / J4): four surfaces hide denied IBM objects identically
  const surfaceCounts = surfaces.map((surface) => {
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

  // Negative: stranger denied; budget raise rejected; cursor under other membership fails
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

  // Replay: same sealed cursor + basis returns same page
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
  record(
    "j4_replay_tampered_cursor_denied",
    tampered.status !== 0,
  );

  // Isolation: denied patients affect no public counts/cursors/values
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
    !humanCursor.includes("ibm") &&
      !String(humanPage2.body?.nextCursor ?? "").includes("ibm"),
  );

  // Recovery: fresh process accepts still-valid sealed cursor without widening
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
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
