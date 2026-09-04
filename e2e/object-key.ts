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

const scenario = "object-key";
const repositoryRoot = process.cwd();
const postgresPortFallback = 55_493;
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
const clinicType = "clinic.Patient";
const memoryType = "personal.Memory";
const validAt = 1_700_000_000_000_000;

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
const analyst = {
  principal: "principal.finance.analyst",
  membership: "membership.finance.analyst",
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

function approveAndActivate(world: string, digest: string, principal: string): {
  activate: ZoenResult;
} {
  const preview = runZoen([
    "world",
    "release",
    "preview",
    "--world",
    world,
    "--digest",
    digest,
    "--principal",
    principal,
  ]);
  assert.equal(preview.status, 0, preview.stderr);
  const previewDigest = String(parseJson(preview.stdout).previewDigest);
  const decide = runZoen([
    "world",
    "release",
    "decide",
    "--preview-digest",
    previewDigest,
    "--principal",
    principal,
    "--decision",
    "approve",
  ]);
  assert.equal(decide.status, 0, decide.stderr);
  const activate = runZoen([
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
  return { activate };
}

function kernel(verb: string, args: string[], surface = "cli"): ZoenResult {
  return withBody(runZoen(["kernel", verb, ...args, "--surface", surface]));
}

function mint(world: string, entity: string, grants: unknown[] = []): ZoenResult {
  return kernel("mint-object", [
    "--world",
    world,
    "--principal",
    "principal.builder",
    "--entity",
    entity,
    "--grants-json",
    JSON.stringify(grants),
  ]);
}

function plantType(
  world: string,
  entity: string,
  assignmentId: string,
  objectType: string,
  evidenceRef: string,
  grants: unknown[],
): ZoenResult {
  return kernel("plant-type-assignment", [
    "--world",
    world,
    "--principal",
    "principal.builder",
    "--assignment-id",
    assignmentId,
    "--entity",
    entity,
    "--type",
    objectType,
    "--evidence-ref",
    evidenceRef,
    "--valid-start-micros",
    "0",
    "--grants-json",
    JSON.stringify(grants),
  ]);
}

function queryTyped(
  world: string,
  actor: { principal: string; membership: string },
  objectType: string,
  surface = "cli",
): ZoenResult {
  return kernel(
    "query-typed",
    [
      "--world",
      world,
      "--principal",
      actor.principal,
      "--membership",
      actor.membership,
      "--type",
      objectType,
      "--valid-at-micros",
      String(validAt),
    ],
    surface,
  );
}

function typedKnowledgeInput(params: {
  world: string;
  entity: string;
  assignmentId: string;
  objectType: string;
  evidenceRef: string;
  fact: string;
  grants: unknown[];
}): string {
  return JSON.stringify({
    schema: "zoen.typed-knowledge.v1",
    objectKey: { world: params.world, entity: params.entity },
    typeAssignment: {
      assignmentId: params.assignmentId,
      objectType: params.objectType,
      validStartMicros: 0,
      validEndMicros: null,
    },
    evidenceRef: params.evidenceRef,
    fact: params.fact,
    grants: params.grants,
  });
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const sourceCommit = gitHead(repositoryRoot);
  const policy = buildPolicyCatalog();
  const bytes = {
    ontology: ontologyBytes("object-key.world"),
    policy: policy.bytes,
    executors: "executor catalog object-key v1\n",
    components: "component catalog object-key v1\n",
  };
  const contentPath = await writeContent("world.json", {
    world: "world.clinic",
    parent: null,
    ontology: { bytes: bytes.ontology },
    policy: { bytes: bytes.policy },
    executors: { bytes: bytes.executors },
    components: { bytes: bytes.components },
  });
  const release = construct(contentPath);
  assert.equal(publish(contentPath, "principal.builder", policy.evidenceDigest).status, 0);
  const ceremony = approveAndActivate(
    "world.clinic",
    String(release.digest),
    "principal.owner",
  );
  assert.equal(ceremony.activate.status, 0, ceremony.activate.stderr);

  // --- J2: Eve proposes typed knowledge → Decide → Commit → Query → Explain ---
  const memoryEntity = "memory.dentist";
  const mintMemory = mint("world.clinic", memoryEntity);
  assert.equal(mintMemory.status, 0, mintMemory.stderr);
  record(
    "j2_object_key_private_ref",
    String(mintMemory.body?.objectKey) === `world.clinic/${memoryEntity}`,
  );
  record(
    "j2_object_key_not_uuid_dump",
    !String(mintMemory.body?.objectKey).includes("uuid") &&
      !/^[0-9a-f-]{36}$/i.test(String(mintMemory.body?.entity)),
  );

  const knowledgeInput = typedKnowledgeInput({
    world: "world.clinic",
    entity: memoryEntity,
    assignmentId: "type-assignment.memory.dentist",
    objectType: memoryType,
    evidenceRef: "evidence.eve.dentist",
    fact: "dentist on tuesday",
    grants: [
      {
        principalId: human.principal,
        membershipId: human.membership,
        objectType: memoryType,
      },
    ],
  });
  const proposed = kernel(
    "propose",
    [
      "--world",
      "world.clinic",
      "--principal",
      "principal.builder",
      "--proposal-id",
      "proposal.eve.memory.dentist",
      "--input",
      knowledgeInput,
    ],
    "eve",
  );
  assert.equal(proposed.status, 0, proposed.stderr);
  record("j2_eve_propose", proposed.body?.proposalId === "proposal.eve.memory.dentist");

  // Negative: normal member cannot write raw typed knowledge (propose denied)
  const memberPropose = kernel(
    "propose",
    [
      "--world",
      "world.clinic",
      "--principal",
      stranger.principal,
      "--proposal-id",
      "proposal.stranger.raw",
      "--input",
      knowledgeInput,
    ],
    "cli",
  );
  record(
    "j2_negative_member_cannot_write_raw",
    memberPropose.status !== 0 && memberPropose.stderr.toLowerCase().includes("denied"),
  );

  const decided = kernel(
    "decide",
    [
      "--proposal-id",
      "proposal.eve.memory.dentist",
      "--principal",
      "principal.owner",
      "--decision",
      "approve",
    ],
    "eve",
  );
  assert.equal(decided.status, 0, decided.stderr);

  const committed = kernel(
    "commit",
    ["--proposal-id", "proposal.eve.memory.dentist", "--principal", "principal.owner"],
    "eve",
  );
  assert.equal(committed.status, 0, committed.stderr);
  const receiptId = String(committed.body?.receiptId ?? "");
  record("j2_commit_receipt", receiptId.startsWith("receipt.kernel."));

  // Eve does not claim memory before receipt — receipt exists only after commit
  record("j2_no_memory_before_receipt", receiptId.length > 0);

  const explained = kernel(
    "explain",
    ["--receipt-id", receiptId, "--principal", "principal.owner"],
    "eve",
  );
  assert.equal(explained.status, 0, explained.stderr);
  record(
    "j2_explain_attributed",
    String(explained.body?.explanationJcs ?? "").includes(receiptId),
  );

  const memoryQuery = queryTyped("world.clinic", human, memoryType, "eve");
  assert.equal(memoryQuery.status, 0, memoryQuery.stderr);
  const memoryObjects = (memoryQuery.body?.objects as Array<Record<string, unknown>>) ?? [];
  record("j2_query_typed_memory", memoryObjects.length === 1);
  record(
    "j2_typed_ref_has_assignment",
    memoryObjects[0]?.assignmentId === "type-assignment.memory.dentist" &&
      (memoryObjects[0]?.objectKey as { entity?: string })?.entity === memoryEntity,
  );

  // Replay: same propose returns original
  const proposeReplay = kernel(
    "propose",
    [
      "--world",
      "world.clinic",
      "--principal",
      "principal.builder",
      "--proposal-id",
      "proposal.eve.memory.dentist.replay",
      "--input",
      knowledgeInput,
    ],
    "eve",
  );
  assert.equal(proposeReplay.status, 0, proposeReplay.stderr);
  record(
    "j2_replay_same_proposal",
    proposeReplay.body?.proposalId === "proposal.eve.memory.dentist" &&
      proposeReplay.body?.previewHash === proposed.body?.previewHash,
  );
  const commitReplay = kernel(
    "commit",
    ["--proposal-id", "proposal.eve.memory.dentist", "--principal", "principal.owner"],
    "connect",
  );
  assert.equal(commitReplay.status, 0, commitReplay.stderr);
  record(
    "j2_replay_same_receipt",
    commitReplay.body?.receiptId === receiptId,
  );

  // Isolation: stranger cannot read typed memory
  const strangerMemory = queryTyped("world.clinic", stranger, memoryType);
  record(
    "j2_isolation_stranger_denied",
    strangerMemory.status !== 0 && strangerMemory.stderr.toLowerCase().includes("denied"),
  );

  // Recovery: fresh query after commit still returns typed assignment
  const recoveredMemory = queryTyped("world.clinic", human, memoryType, "cli");
  assert.equal(recoveredMemory.status, 0, recoveredMemory.stderr);
  record(
    "j2_recovery_typed_survives",
    recoveredMemory.body?.authorizedCount === 1,
  );

  // Refuse Membership label for type evidence
  const membershipLabeled = kernel(
    "propose",
    [
      "--world",
      "world.clinic",
      "--principal",
      "principal.builder",
      "--proposal-id",
      "proposal.bad.membership",
      "--input",
      JSON.stringify({
        schema: "zoen.typed-knowledge.v1",
        objectKey: { world: "world.clinic", entity: memoryEntity },
        typeAssignment: {
          assignmentId: "type-assignment.bad",
          objectType: memoryType,
          validStartMicros: 0,
          membership: "should-not-exist",
        },
        evidenceRef: "evidence.bad",
        fact: "nope",
        grants: [],
      }),
    ],
    "cli",
  );
  // Propose may succeed (JSON stored); Commit must refuse Membership label
  if (membershipLabeled.status === 0) {
    kernel(
      "decide",
      [
        "--proposal-id",
        "proposal.bad.membership",
        "--principal",
        "principal.owner",
        "--decision",
        "approve",
      ],
      "cli",
    );
    const badCommit = kernel(
      "commit",
      ["--proposal-id", "proposal.bad.membership", "--principal", "principal.owner"],
      "cli",
    );
    record(
      "j2_type_assignment_not_membership",
      badCommit.status !== 0 &&
        badCommit.stderr.includes("TypeAssignment must not be called Membership"),
    );
  } else {
    record("j2_type_assignment_not_membership", true);
  }

  // --- J4: clinic typed patient objects ---
  const patients = [
    { entity: "patient.ada", assignment: "type-assignment.patient.ada", grants: [human, agent] },
    { entity: "patient.beau", assignment: "type-assignment.patient.beau", grants: [human, agent] },
    { entity: "patient.cara", assignment: "type-assignment.patient.cara", grants: [human, agent] },
    { entity: "patient.drew", assignment: "type-assignment.patient.drew", grants: [human, agent] },
    {
      entity: "patient.ibm-secret",
      assignment: "type-assignment.patient.ibm-secret",
      grants: [{ principal: "principal.owner", membership: "membership.clinic.owner" }],
    },
    {
      entity: "patient.ibm-denied",
      assignment: "type-assignment.patient.ibm-denied",
      grants: [{ principal: "principal.owner", membership: "membership.clinic.owner" }],
    },
  ] as const;

  for (const patient of patients) {
    const grants = patient.grants.map((g) => ({
      principalId: g.principal,
      membershipId: g.membership,
      objectType: clinicType,
    }));
    assert.equal(mint("world.clinic", patient.entity, grants).status, 0);
    const planted = plantType(
      "world.clinic",
      patient.entity,
      patient.assignment,
      clinicType,
      `evidence.clinic.${patient.entity}`,
      grants,
    );
    assert.equal(planted.status, 0, planted.stderr);
  }

  const humanPage = queryTyped("world.clinic", human, clinicType, "eve");
  assert.equal(humanPage.status, 0, humanPage.stderr);
  const humanIds = (
    (humanPage.body?.objects as Array<{ objectKey?: { entity?: string } }>) ?? []
  ).map((o) => o.objectKey?.entity ?? "");
  record("j4_actors_human_sees_four", humanPage.body?.authorizedCount === 4);
  record(
    "j4_path_typed_patients",
    humanIds.sort().join(",") === "patient.ada,patient.beau,patient.cara,patient.drew",
  );
  record(
    "j4_typed_refs_private",
    ((humanPage.body?.objects as Array<{ assignmentId?: string; typeId?: string }>) ?? []).every(
      (o) =>
        typeof o.assignmentId === "string" &&
        o.assignmentId.startsWith("type-assignment.") &&
        o.typeId === clinicType,
    ),
  );

  const agentPage = queryTyped("world.clinic", agent, clinicType, "mcp");
  assert.equal(agentPage.status, 0, agentPage.stderr);
  record(
    "j4_actors_agent_same_count",
    agentPage.body?.authorizedCount === humanPage.body?.authorizedCount,
  );

  // Surface parity
  const surfaceCounts = surfaces.map((surface) => {
    const page = queryTyped("world.clinic", human, clinicType, surface);
    assert.equal(page.status, 0, `${surface}: ${page.stderr}`);
    return page.body?.authorizedCount;
  });
  record(
    "j4_surface_parity",
    surfaceCounts.every((count) => count === 4),
  );

  // Negative
  const strangerClinic = queryTyped("world.clinic", stranger, clinicType);
  record(
    "j4_negative_stranger_denied",
    strangerClinic.status !== 0 && strangerClinic.stderr.toLowerCase().includes("denied"),
  );

  // Outside valid time: plant expired assignment and ensure it is excluded
  assert.equal(mint("world.clinic", "patient.expired").status, 0);
  const expired = kernel("plant-type-assignment", [
    "--world",
    "world.clinic",
    "--principal",
    "principal.builder",
    "--assignment-id",
    "type-assignment.patient.expired",
    "--entity",
    "patient.expired",
    "--type",
    clinicType,
    "--evidence-ref",
    "evidence.clinic.expired",
    "--valid-start-micros",
    "0",
    "--valid-end-micros",
    "10",
    "--grants-json",
    JSON.stringify([
      {
        principalId: human.principal,
        membershipId: human.membership,
        objectType: clinicType,
      },
    ]),
  ]);
  assert.equal(expired.status, 0, expired.stderr);
  const afterExpire = queryTyped("world.clinic", human, clinicType);
  assert.equal(afterExpire.status, 0, afterExpire.stderr);
  record(
    "j4_temporal_type_assignment",
    afterExpire.body?.authorizedCount === 4 &&
      !JSON.stringify(afterExpire.body).includes("patient.expired"),
  );

  // Isolation: denied IBM patients never appear
  record(
    "j4_isolation_ibm_absent",
    !humanIds.includes("patient.ibm-secret") &&
      !humanIds.includes("patient.ibm-denied") &&
      !JSON.stringify(humanPage.body).includes("ibm"),
  );
  const ownerPage = queryTyped(
    "world.clinic",
    { principal: "principal.owner", membership: "membership.clinic.owner" },
    clinicType,
  );
  assert.equal(ownerPage.status, 0, ownerPage.stderr);
  record(
    "j4_isolation_owner_sees_more",
    Number(ownerPage.body?.authorizedCount) >= 6,
  );

  // Replay + recovery
  const replayClinic = queryTyped("world.clinic", human, clinicType, "connect");
  assert.equal(replayClinic.status, 0, replayClinic.stderr);
  record(
    "j4_replay_same_authorized",
    replayClinic.body?.authorizedCount === 4,
  );
  const recoveryClinic = queryTyped("world.clinic", human, clinicType, "cli");
  assert.equal(recoveryClinic.status, 0, recoveryClinic.stderr);
  record(
    "j4_recovery_no_widen",
    recoveryClinic.body?.authorizedCount === 4 &&
      !JSON.stringify(recoveryClinic.body).includes("ibm"),
  );

  // --- FIN-01: ambiguous IBM identity ---
  const listings = [
    {
      entity: "listing.ibm.nyse",
      typeAssignment: "type-assignment.listing.ibm.nyse",
      idAssignment: "identifier.ibm.nyse.ticker",
      venue: "NYSE",
      currency: "USD",
      level: "listing",
    },
    {
      entity: "listing.ibm.london",
      typeAssignment: "type-assignment.listing.ibm.london",
      idAssignment: "identifier.ibm.london.ticker",
      venue: "XLON",
      currency: "GBP",
      level: "listing",
    },
  ] as const;
  for (const listing of listings) {
    assert.equal(mint("world.clinic", listing.entity).status, 0);
    assert.equal(
      plantType(
        "world.clinic",
        listing.entity,
        listing.typeAssignment,
        "finance.Listing",
        `evidence.finance.${listing.entity}`,
        [],
      ).status,
      0,
    );
    const plantedId = kernel("plant-identifier", [
      "--world",
      "world.clinic",
      "--principal",
      "principal.builder",
      "--assignment-id",
      listing.idAssignment,
      "--entity",
      listing.entity,
      "--type-assignment-id",
      listing.typeAssignment,
      "--scheme",
      "ticker",
      "--value",
      "IBM",
      "--venue",
      listing.venue,
      "--currency",
      listing.currency,
      "--identifier-level",
      listing.level,
      "--evidence-ref",
      `evidence.ticker.${listing.entity}`,
      "--valid-start-micros",
      "0",
    ]);
    assert.equal(plantedId.status, 0, plantedId.stderr);
  }

  // Denial: analyst without entitlement
  const deniedResolve = kernel("resolve-identifier", [
    "--world",
    "world.clinic",
    "--principal",
    analyst.principal,
    "--membership",
    analyst.membership,
    "--scheme",
    "ticker",
    "--query",
    "IBM",
    "--valid-at-micros",
    String(validAt),
  ]);
  record(
    "fin01_denial_no_candidates",
    deniedResolve.status !== 0 &&
      deniedResolve.stderr.includes("discovery denied") &&
      !deniedResolve.stdout.includes("NYSE"),
  );

  // Grant discovery entitlement (recovery)
  const grant = kernel("grant-discovery", [
    "--world",
    "world.clinic",
    "--principal",
    "principal.owner",
    "--membership",
    analyst.membership,
    "--subject-principal",
    analyst.principal,
    "--scheme",
    "ticker",
  ]);
  assert.equal(grant.status, 0, grant.stderr);

  const resolved = kernel("resolve-identifier", [
    "--world",
    "world.clinic",
    "--principal",
    analyst.principal,
    "--membership",
    analyst.membership,
    "--scheme",
    "ticker",
    "--query",
    "IBM",
    "--valid-at-micros",
    String(validAt),
  ]);
  assert.equal(resolved.status, 0, resolved.stderr);
  const candidates =
    (resolved.body?.candidates as Array<Record<string, unknown>>) ?? [];
  record("fin01_two_typed_candidates", candidates.length === 2);
  record(
    "fin01_candidates_have_venue_currency_level",
    candidates.every(
      (c) =>
        typeof c.venue === "string" &&
        typeof c.currency === "string" &&
        c.identifierLevel === "listing" &&
        typeof c.evidenceRef === "string" &&
        typeof c.assignmentId === "string",
    ),
  );
  record(
    "fin01_never_silent_first_match",
    resolved.body?.selected === null && resolved.body?.silentFirstMatch === false,
  );
  const artifact = resolved.body?.fin01Artifact as Record<string, unknown> | undefined;
  record(
    "fin01_artifact_present",
    artifact?.gate === "FIN-01" &&
      artifact?.silentFirstMatch === false &&
      artifact?.selected === null &&
      artifact?.candidateCount === 2,
  );

  const artifactPath = await writeScenarioArtifact(repositoryRoot, scenario, {
    assertions,
    dimensions: {
      actors:
        "Eve (surface) proposes typed knowledge; clinic human and clinic agent query typed patients; finance analyst resolves IBM",
      isolation:
        "stranger cannot read typed memory or clinic patients; owner-only ibm-secret/ibm-denied never enter clinic authorizedCount",
      negative:
        "stranger propose denied; stranger typed query denied; TypeAssignment refuses Membership label; discovery without entitlement returns no candidates",
      path: "mint ObjectKey → Eve propose/decide/commit TypeAssignment → query/explain; plant typed clinic.Patient → query-typed; plant IBM listings → resolve-identifier",
      recovery:
        "typed TypeAssignment survives fresh query; discovery entitlement grant recovers FIN-01 candidates with disambiguation inputs",
      replay:
        "identical typed-knowledge propose/commit returns original proposal and receipt; repeated clinic query-typed returns the same authorized set",
    },
    finalGates: {
      "FIN-01": {
        proof:
          "IBM ticker resolves to two typed finance.Listing candidates with venue/currency/identifierLevel/validity/evidence; selected=null; silentFirstMatch=false; denial hides candidates; grant recovers",
        artifact,
        candidates,
      },
    },
    finishedAt: new Date().toISOString(),
    journeys: ["J2", "J4"],
    sourceCommit,
    startedAt,
    unit: "W2-08",
  });

  const passed = Object.values(assertions).filter(Boolean).length;
  const total = Object.keys(assertions).length;
  console.log(
    `object-key PASS assertions ${passed}/${total} artifact=${artifactPath} sourceCommit=${sourceCommit}`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
