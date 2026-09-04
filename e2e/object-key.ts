import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Client as PostgresClient } from "pg";
import { writeScenarioArtifact } from "./host-env.js";
import { kernelJourneyPaths, sevenVerbs } from "./kernel-journey.js";
import { gitHead } from "./scenario-evidence.js";
import {
  constructWorldRelease,
  parseZoenJson,
  runZoenCli,
  writeZoenJsonFile,
} from "./zoen-cli.js";

const scenario = "object-key";
const { repositoryRoot, databaseUrl, generatedDirectory, zoenPath } = kernelJourneyPaths(
  scenario,
  55_493,
);
const world = "world.clinic";
const kernelResource = "zoen.world.kernel";
const releaseResource = "zoen.world.release";
const releaseAuthorityDefinitionDigest =
  "e39d2372b5e94449657447a9a2109ed5e5f2e18bc424639ee25627e849f03862";
const kernelAuthorityDefinitionDigest =
  "3dfddf9c946656d9ce19ccaacecba5db3d284417c1c3f1f9d0ee710163e42dfc";
const memoryType = "personal.Memory";
const patientType = "clinic.Patient";
const listingType = "finance.Listing";
const venueType = "finance.Venue";
const tradesOnLink = "finance.tradesOn";

interface Actor {
  principal: string;
  membership: string;
}

interface ZoenResult {
  status: number;
  stdout: string;
  stderr: string;
  body?: Record<string, unknown>;
}

const owner: Actor = {
  principal: "principal.owner",
  membership: "membership.clinic.owner",
};
const replacementOwner: Actor = {
  principal: owner.principal,
  membership: "membership.clinic.owner.replacement",
};
const builder: Actor = {
  principal: "principal.builder",
  membership: "membership.clinic.builder",
};
const human: Actor = {
  principal: "principal.clinic.human",
  membership: "membership.clinic.human",
};

const kernelActions = sevenVerbs.map((verb) => ({
  actionId: `zoen.world.${verb.toLowerCase()}`,
  definitionDigest: kernelAuthorityDefinitionDigest,
  operation: verb.toLowerCase(),
}));
const releaseActions = [
  {
    actionId: "zoen.world.release.publish",
    definitionDigest: releaseAuthorityDefinitionDigest,
    operation: "publish_release",
  },
  {
    actionId: "zoen.world.release.preview",
    definitionDigest: releaseAuthorityDefinitionDigest,
    operation: "preview_release",
  },
  {
    actionId: "zoen.world.release.decide",
    definitionDigest: releaseAuthorityDefinitionDigest,
    operation: "decide_release",
  },
  {
    actionId: "zoen.world.release.activate",
    definitionDigest: releaseAuthorityDefinitionDigest,
    operation: "activate_release",
  },
] as const;

const assertions: Record<string, boolean> = {};

function record(name: string, observed: boolean): void {
  assert.ok(observed, name);
  assertions[name] = observed;
}

function runZoen(args: string[]): ZoenResult {
  const result = runZoenCli(zoenPath, databaseUrl, args);
  if (result.status === 0 && result.stdout.trim() !== "") {
    return { ...result, body: parseZoenJson(result.stdout) };
  }
  return result;
}

function ontologyBytes(): string {
  return `${JSON.stringify({
    label: "object-key.world",
    publicVerbs: [...sevenVerbs],
    schema: "zoen.ontology-catalog.v1",
    typedLinks: [
      {
        cardinality: "many-to-one",
        id: tradesOnLink,
        requiredEvidenceSchema: "zoen.link-assertion-draft.v1",
        sourceSide: "listing",
        sourceType: listingType,
        targetSide: "venue",
        targetType: venueType,
        temporalBehavior: "interval",
      },
    ],
  })}\n`;
}

function policySource(actionId: string, operation: string): string {
  return `permit (
    principal,
    action == Action::"${operation}",
    resource
)
when {
    context.actionId == "${actionId}"
};
`;
}

function policyCatalogBytes(): string {
  const bindings = [...kernelActions, ...releaseActions];
  const policies = bindings.map(({ actionId, definitionDigest, operation }, index) => {
    const source = policySource(actionId, operation);
    return {
      actionId,
      definitionDigest,
      digest: createHash("sha256").update(source).digest("hex"),
      policyId: `policy.object-key.${index + 1}`,
      revision: 1,
      source,
    };
  });
  return `${JSON.stringify({
    schema: "zoen.policy-catalog.v1",
    authorization: { policies },
    membershipDelegation: [],
    sourceAdmission: [],
  })}\n`;
}

async function bootstrapSchema(): Promise<void> {
  runZoen(["world", "release", "active", "--world", world]);
  const client = new PostgresClient({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query<{ table_name: string | null }>(
      "SELECT to_regclass('memberships')::text AS table_name",
    );
    assert.equal(result.rows[0]?.table_name, "memberships");
  } finally {
    await client.end();
  }
}

async function seedMemberships(): Promise<void> {
  const allKernelActions = kernelActions.map(({ actionId }) => actionId);
  const allReleaseActions = releaseActions.map(({ actionId }) => actionId);
  const personas = [
    {
      ...owner,
      account: "account.owner",
      actions: [...allKernelActions, ...allReleaseActions],
      kind: "personal" as const,
      resources: [kernelResource, releaseResource],
    },
    {
      ...builder,
      account: "account.builder",
      actions: ["zoen.world.discover", "zoen.world.propose"],
      kind: "invite" as const,
      resources: [kernelResource],
    },
    {
      ...replacementOwner,
      account: "account.owner.replacement",
      actions: allKernelActions,
      kind: "invite" as const,
      resources: [kernelResource],
    },
    {
      ...human,
      account: "account.clinic.human",
      actions: ["zoen.world.query"],
      kind: "invite" as const,
      resources: [kernelResource],
    },
  ];
  const client = new PostgresClient({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "INSERT INTO worlds (world_id, kind) VALUES ($1, 'personal') ON CONFLICT (world_id) DO NOTHING",
      [world],
    );
    for (const persona of personas) {
      const suffix = persona.membership.replace("membership.", "");
      const delegation = {
        grants: [
          {
            actionIds: persona.actions,
            delegationId: `delegation.${suffix}`,
            expiresAt: 4_102_444_800,
            notBefore: 0,
            resourceIds: persona.resources,
            workloadIds: ["workload.world-kernel"],
          },
        ],
      };
      await client.query(
        "INSERT INTO zoen_accounts (account_id, status) VALUES ($1, 'verified')",
        [persona.account],
      );
      if (persona.kind === "personal") {
        await client.query(
          "INSERT INTO personal_worlds (account_id, world_id) VALUES ($1, $2)",
          [persona.account, world],
        );
      }
      await client.query(
        `INSERT INTO memberships (
           membership_id, account_id, world_id, principal_id, status, kind,
           invite_id, workload_id, actor_id, delegation_json, clearance_json
         ) VALUES ($1,$2,$3,$4,'active',$5,$6,$7,$8,$9::jsonb,$10::jsonb)`,
        [
          persona.membership,
          persona.account,
          world,
          persona.principal,
          persona.kind,
          persona.kind === "invite" ? `invite.${suffix}` : null,
          "workload.world-kernel",
          `actor.${suffix}`,
          JSON.stringify(delegation),
          JSON.stringify(["zoen.world.floor", "zoen.world.top"]),
        ],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

async function scalarCount(sql: string, values: unknown[]): Promise<number> {
  const client = new PostgresClient({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query<{ count: string }>(sql, values);
    return Number(result.rows[0]?.count ?? "0");
  } finally {
    await client.end();
  }
}

async function revokeOwnerMembership(): Promise<void> {
  const client = new PostgresClient({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(
      `UPDATE memberships
       SET status = 'revoked', ended_at = clock_timestamp(), ended_reason = 'security'
       WHERE membership_id = $1`,
      [owner.membership],
    );
  } finally {
    await client.end();
  }
}

function publish(file: string): ZoenResult {
  return runZoen([
    "world",
    "release",
    "publish",
    "--file",
    file,
    "--principal",
    owner.principal,
    "--membership",
    owner.membership,
  ]);
}

function activateRelease(digest: string): void {
  const preview = runZoen([
    "world",
    "release",
    "preview",
    "--world",
    world,
    "--digest",
    digest,
    "--principal",
    owner.principal,
    "--membership",
    owner.membership,
  ]);
  assert.equal(preview.status, 0, preview.stderr);
  const previewDigest = String(preview.body?.previewDigest);
  const decide = runZoen([
    "world",
    "release",
    "decide",
    "--preview-digest",
    previewDigest,
    "--principal",
    owner.principal,
    "--membership",
    owner.membership,
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
    owner.principal,
    "--membership",
    owner.membership,
  ]);
  assert.equal(activate.status, 0, activate.stderr);
}

function kernel(verb: string, actor: Actor, args: string[]): ZoenResult {
  return runZoen([
    "kernel",
    verb,
    ...args,
    "--principal",
    actor.principal,
    "--membership",
    actor.membership,
  ]);
}

function propose(actor: Actor, proposalId: string, input: unknown): ZoenResult {
  return kernel("propose", actor, [
    "--world",
    world,
    "--proposal-id",
    proposalId,
    "--input",
    JSON.stringify(input),
  ]);
}

function decide(actor: Actor, proposalId: string): ZoenResult {
  return kernel("decide", actor, [
    "--proposal-id",
    proposalId,
    "--decision",
    "approve",
  ]);
}

function commit(actor: Actor, proposalId: string): ZoenResult {
  return kernel("commit", actor, ["--proposal-id", proposalId]);
}

function typeAssignmentDraft(input: {
  assignmentId: string;
  entity: string;
  objectType: string;
  validEndMicros?: number | null;
  grants?: Actor[];
}): Record<string, unknown> {
  return {
    schema: "zoen.type-assignment-draft.v1",
    objectKey: { world, entity: input.entity },
    typeAssignment: {
      assignmentId: input.assignmentId,
      objectType: input.objectType,
      validStartMicros: 0,
      validEndMicros: input.validEndMicros ?? null,
    },
    grants: (input.grants ?? [human]).map((actor) => ({
      principalId: actor.principal,
      membershipId: actor.membership,
      objectType: input.objectType,
    })),
  };
}

function typedLinkDraft(input: {
  assertionId: string;
  sourceEntity: string;
  sourceAssignment: string;
  targetEntity: string;
  targetAssignment: string;
  validEndMicros?: number | null;
}): Record<string, unknown> {
  return {
    schema: "zoen.link-assertion-draft.v1",
    linkAssertion: {
      linkAssertionId: input.assertionId,
      linkType: tradesOnLink,
      source: { world, entity: input.sourceEntity },
      sourceTypeAssignmentId: input.sourceAssignment,
      target: { world, entity: input.targetEntity },
      targetTypeAssignmentId: input.targetAssignment,
      validEndMicros: input.validEndMicros ?? null,
      validStartMicros: 0,
    },
  };
}

function identifierAssignmentDraft(input: {
  assignmentId: string;
  entity: string;
  typeAssignment: string;
  scheme?: string;
  value?: string;
  venueEntity?: string;
  mic?: string;
  currency?: string;
  identifierLevel?: string;
  validEndMicros?: number | null;
}): Record<string, unknown> {
  return {
    schema: "zoen.identifier-assignment-draft.v1",
    identifierAssignment: {
      context: {
        currency: input.currency,
        identifierLevel: input.identifierLevel,
        mic: input.mic,
        venue: input.venueEntity ? { world, entity: input.venueEntity } : undefined,
      },
      identifierAssignmentId: input.assignmentId,
      objectKey: { world, entity: input.entity },
      scheme: input.scheme ?? "ticker",
      typeAssignmentId: input.typeAssignment,
      validEndMicros: input.validEndMicros ?? null,
      validStartMicros: 0,
      value: input.value ?? "IBM",
    },
  };
}

function commitDraft(proposalId: string, draft: Record<string, unknown>): ZoenResult {
  const proposed = propose(builder, proposalId, draft);
  assert.equal(proposed.status, 0, proposed.stderr);
  const decided = decide(owner, proposalId);
  assert.equal(decided.status, 0, decided.stderr);
  const committed = commit(owner, proposalId);
  assert.equal(committed.status, 0, committed.stderr);
  return committed;
}

async function assertNoMaterialization(
  proposalId: string,
  entity: string,
  assignmentId: string,
): Promise<void> {
  assert.equal(
    await scalarCount(
      "SELECT COUNT(*)::text AS count FROM world_kernel_receipts WHERE proposal_id = $1",
      [proposalId],
    ),
    0,
  );
  assert.equal(
    await scalarCount(
      "SELECT COUNT(*)::text AS count FROM world_object_keys WHERE world_id = $1 AND entity_id = $2",
      [world, entity],
    ),
    0,
  );
  assert.equal(
    await scalarCount(
      "SELECT COUNT(*)::text AS count FROM world_type_assignments WHERE assignment_id = $1",
      [assignmentId],
    ),
    0,
  );
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const sourceCommit = gitHead(repositoryRoot);
  const policy = policyCatalogBytes();
  const contentPath = await writeZoenJsonFile(generatedDirectory, "world.json", {
    world,
    parent: null,
    ontology: { bytes: ontologyBytes() },
    policy: { bytes: policy },
    executors: { bytes: "executor catalog object-key v1\n" },
    components: { bytes: "component catalog object-key v1\n" },
  });
  const release = constructWorldRelease(zoenPath, databaseUrl, contentPath);

  await bootstrapSchema();
  await seedMemberships();
  const published = publish(contentPath);
  assert.equal(published.status, 0, published.stderr);
  activateRelease(String(release.digest));

  const discovered = kernel("discover", builder, ["--world", world]);
  assert.equal(discovered.status, 0, discovered.stderr);
  record(
    "catalog_exposes_only_the_seven_ontology_verbs",
    JSON.stringify(discovered.body?.publicVerbs) === JSON.stringify(sevenVerbs),
  );
  const mismatched = kernel("propose", { ...builder, membership: owner.membership }, [
    "--world",
    world,
    "--proposal-id",
    "proposal.mismatched.membership",
    "--input",
    JSON.stringify({ operation: "mismatch" }),
  ]);
  record(
    "kernel_actor_requires_matching_durable_membership",
    mismatched.status !== 0 && mismatched.stderr.toLowerCase().includes("denied"),
  );

  const entity = "memory.dentist";
  const assignmentId = "type-assignment.memory.dentist";
  const proposalId = "proposal.memory.dentist";
  const draft = typeAssignmentDraft({ assignmentId, entity, objectType: memoryType });
  const proposed = propose(builder, proposalId, draft);
  assert.equal(proposed.status, 0, proposed.stderr);
  await assertNoMaterialization(proposalId, entity, assignmentId);
  const decided = decide(owner, proposalId);
  assert.equal(decided.status, 0, decided.stderr);
  await assertNoMaterialization(proposalId, entity, assignmentId);

  const committed = commit(owner, proposalId);
  assert.equal(committed.status, 0, committed.stderr);
  const receiptId = String(committed.body?.receiptId ?? "");
  record("commit_returns_receipt", receiptId === `receipt.kernel.${proposalId}`);
  record(
    "receipt_object_assignment_and_grant_materialize_together",
    (await scalarCount(
      `SELECT COUNT(*)::text AS count
       FROM world_kernel_receipts r
       JOIN world_type_assignments a ON a.receipt_id = r.receipt_id
       JOIN world_object_keys o
         ON o.world_id = a.world_id AND o.entity_id = a.entity_id
       JOIN world_typed_object_grants g
         ON g.type_assignment_id = a.assignment_id
        AND g.world_id = a.world_id
        AND g.entity_id = a.entity_id
        AND g.object_type = a.object_type
       WHERE r.proposal_id = $1
         AND a.assignment_id = $2
         AND o.minted_by = $3
         AND g.principal_id = $4
         AND g.membership_id = $5`,
      [proposalId, assignmentId, builder.principal, human.principal, human.membership],
    )) === 1,
  );

  const explained = kernel("explain", owner, ["--receipt-id", receiptId]);
  assert.equal(explained.status, 0, explained.stderr);
  const explanation = JSON.parse(String(explained.body?.explanationJcs)) as {
    typedArtifact?: {
      assignmentId?: string;
      evidenceRef?: string;
      objectKey?: { world?: string; entity?: string };
    };
  };
  record(
    "commit_derives_attributed_evidence_reference",
    explanation.typedArtifact?.assignmentId === assignmentId &&
      /^evidence\.[0-9a-f]{64}$/.test(explanation.typedArtifact.evidenceRef ?? "") &&
      explanation.typedArtifact.objectKey?.world === world &&
      explanation.typedArtifact.objectKey.entity === entity,
  );

  const replay = commit(owner, proposalId);
  assert.equal(replay.status, 0, replay.stderr);
  record("commit_replay_returns_same_receipt", replay.body?.receiptId === receiptId);
  record(
    "commit_replay_keeps_exact_single_materialization",
    (await scalarCount(
      "SELECT COUNT(*)::text AS count FROM world_type_assignments WHERE receipt_id = $1",
      [receiptId],
    )) === 1 &&
      (await scalarCount(
        "SELECT COUNT(*)::text AS count FROM world_typed_object_grants WHERE type_assignment_id = $1",
        [assignmentId],
      )) === 1,
  );

  const venueNyse = "venue.xnys";
  const venueHidden = "venue.hidden";
  const listingNyse = "listing.ibm.xnys";
  const listingHidden = "listing.ibm.hidden";
  const venueNyseType = "type-assignment.venue.xnys";
  const venueHiddenType = "type-assignment.venue.hidden";
  const listingNyseType = "type-assignment.listing.ibm.xnys";
  const listingHiddenType = "type-assignment.listing.ibm.hidden";
  const listingExpiringType = "type-assignment.listing.ibm.expiring";
  commitDraft(
    "proposal.type.venue.xnys",
    typeAssignmentDraft({
      assignmentId: venueNyseType,
      entity: venueNyse,
      objectType: venueType,
    }),
  );
  commitDraft(
    "proposal.type.venue.hidden",
    typeAssignmentDraft({
      assignmentId: venueHiddenType,
      entity: venueHidden,
      objectType: venueType,
      grants: [replacementOwner],
    }),
  );
  commitDraft(
    "proposal.type.listing.ibm.xnys",
    typeAssignmentDraft({
      assignmentId: listingNyseType,
      entity: listingNyse,
      objectType: listingType,
    }),
  );
  commitDraft(
    "proposal.type.listing.ibm.hidden",
    typeAssignmentDraft({
      assignmentId: listingHiddenType,
      entity: listingHidden,
      objectType: listingType,
    }),
  );
  commitDraft(
    "proposal.type.listing.ibm.expiring",
    typeAssignmentDraft({
      assignmentId: listingExpiringType,
      entity: listingNyse,
      objectType: listingType,
      validEndMicros: 200,
    }),
  );
  const identifierNyse = "identifier-assignment.ibm.xnys";
  const identifierHidden = "identifier-assignment.ibm.hidden";
  const committedIdentifierNyse = commitDraft(
    "proposal.identifier.ibm.xnys",
    identifierAssignmentDraft({
      assignmentId: identifierNyse,
      entity: listingNyse,
      typeAssignment: listingNyseType,
      venueEntity: venueNyse,
      mic: "xnys",
      currency: "usd",
      identifierLevel: "listing",
    }),
  );
  commitDraft(
    "proposal.identifier.ibm.hidden",
    identifierAssignmentDraft({
      assignmentId: identifierHidden,
      entity: listingHidden,
      typeAssignment: listingHiddenType,
      venueEntity: venueHidden,
      mic: "xhid",
      currency: "usd",
      identifierLevel: "listing",
      validEndMicros: 200,
    }),
  );
  const linkNyse = "link-assertion.ibm.xnys";
  const linkHidden = "link-assertion.ibm.hidden";
  commitDraft(
    "proposal.link.ibm.xnys",
    typedLinkDraft({
      assertionId: linkNyse,
      sourceEntity: listingNyse,
      sourceAssignment: listingNyseType,
      targetEntity: venueNyse,
      targetAssignment: venueNyseType,
    }),
  );
  commitDraft(
    "proposal.link.ibm.hidden",
    typedLinkDraft({
      assertionId: linkHidden,
      sourceEntity: listingHidden,
      sourceAssignment: listingHiddenType,
      targetEntity: venueHidden,
      targetAssignment: venueHiddenType,
    }),
  );

  const ambiguous = kernel("query", human, [
    "--world",
    world,
    "--identifier",
    "IBM",
    "--valid-at-micros",
    "100",
    "--limit",
    "5",
  ]);
  assert.equal(ambiguous.status, 0, ambiguous.stderr);
  const candidates = (ambiguous.body?.candidates ?? []) as Array<{
    identifierAssignmentId?: string;
    objectKey?: { entity?: string };
    objectType?: string;
    context?: { currency?: string; identifierLevel?: string; mic?: string };
    links?: Array<{ linkType?: string; targetObject?: string }>;
  }>;
  record(
    "ambiguous_identifier_returns_all_typed_contextual_candidates",
    ambiguous.body?.authorizedCount === 2 &&
      candidates.length === 2 &&
      candidates.every(
        (candidate) =>
          candidate.objectType === listingType &&
          candidate.context?.currency === "USD" &&
          candidate.context.identifierLevel === "listing",
      ),
  );
  record(
    "identifier_query_binds_server_budget_compute_and_policy_explanation",
    ambiguous.body?.budgetId === "budget.query.default" &&
      /^[0-9a-f]{64}$/.test(String(ambiguous.body?.computeDigest ?? "")) &&
      String(ambiguous.body?.explanationJcs ?? "").includes('"scannedUnauthorized":false'),
  );
  const nyseCandidate = candidates.find(
    (candidate) => candidate.identifierAssignmentId === identifierNyse,
  );
  const hiddenCandidate = candidates.find(
    (candidate) => candidate.identifierAssignmentId === identifierHidden,
  );
  record(
    "typed_links_project_only_authorized_targets",
    nyseCandidate?.links?.length === 1 &&
      nyseCandidate.links[0]?.linkType === tradesOnLink &&
      nyseCandidate.links[0]?.targetObject === venueNyse &&
      hiddenCandidate?.links?.length === 0,
  );
  const identifierExplanation = kernel("explain", owner, [
    "--receipt-id",
    String(committedIdentifierNyse.body?.receiptId ?? ""),
  ]);
  assert.equal(identifierExplanation.status, 0, identifierExplanation.stderr);
  const identifierExplanationBody = JSON.parse(
    String(identifierExplanation.body?.explanationJcs ?? "{}"),
  ) as {
    typedArtifact?: {
      evidenceRef?: string;
      identifierAssignmentId?: string;
      kind?: string;
    };
  };
  record(
    "identifier_commit_derives_evidence_release_and_policy_explanation",
    identifierExplanationBody.typedArtifact?.kind === "identifierAssignment" &&
      identifierExplanationBody.typedArtifact.identifierAssignmentId === identifierNyse &&
      /^evidence\.[0-9a-f]{64}$/.test(
        identifierExplanationBody.typedArtifact.evidenceRef ?? "",
      ),
  );
  const afterHiddenExpiry = kernel("query", human, [
    "--world",
    world,
    "--identifier",
    "IBM",
    "--valid-at-micros",
    "250",
  ]);
  record(
    "identifier_query_applies_half_open_valid_intervals",
    afterHiddenExpiry.status === 0 &&
      afterHiddenExpiry.body?.authorizedCount === 1 &&
      ((afterHiddenExpiry.body?.candidates ?? []) as Array<{ identifierAssignmentId?: string }>)[0]
        ?.identifierAssignmentId === identifierNyse,
  );
  const firstPage = kernel("query", human, [
    "--world",
    world,
    "--identifier",
    "IBM",
    "--valid-at-micros",
    "100",
    "--limit",
    "1",
  ]);
  assert.equal(firstPage.status, 0, firstPage.stderr);
  const cursor = String(firstPage.body?.nextCursor ?? "");
  const secondPage = kernel("query", human, [
    "--world",
    world,
    "--identifier",
    "IBM",
    "--valid-at-micros",
    "100",
    "--limit",
    "1",
    "--cursor",
    cursor,
  ]);
  record(
    "identifier_candidates_page_with_a_sealed_cursor",
    cursor !== "" &&
      secondPage.status === 0 &&
      ((secondPage.body?.candidates ?? []) as unknown[]).length === 1,
  );
  const mismatchedCursor = kernel("query", human, [
    "--world",
    world,
    "--identifier",
    "IBM",
    "--currency",
    "EUR",
    "--valid-at-micros",
    "100",
    "--limit",
    "1",
    "--cursor",
    cursor,
  ]);
  record(
    "sealed_cursor_rejects_changed_identifier_context",
    mismatchedCursor.status !== 0 && mismatchedCursor.stderr.toLowerCase().includes("cursor"),
  );
  const unauthorizedQuery = kernel("query", builder, [
    "--world",
    world,
    "--identifier",
    "IBM",
    "--valid-at-micros",
    "100",
  ]);
  record(
    "identifier_query_denies_before_candidate_scan",
    unauthorizedQuery.status !== 0 &&
      unauthorizedQuery.stderr.toLowerCase().includes("denied") &&
      !unauthorizedQuery.stderr.includes("IBM"),
  );

  const venueHiddenRecoveryType = "type-assignment.venue.hidden.recovery";
  commitDraft(
    "proposal.type.venue.hidden.recovery",
    typeAssignmentDraft({
      assignmentId: venueHiddenRecoveryType,
      entity: venueHidden,
      objectType: venueType,
    }),
  );
  commitDraft(
    "proposal.link.ibm.hidden.recovery",
    typedLinkDraft({
      assertionId: "link-assertion.ibm.hidden.recovery",
      sourceEntity: listingHidden,
      sourceAssignment: listingHiddenType,
      targetEntity: venueHidden,
      targetAssignment: venueHiddenRecoveryType,
    }),
  );
  const recoveredTarget = kernel("query", human, [
    "--world",
    world,
    "--identifier",
    "IBM",
    "--valid-at-micros",
    "100",
  ]);
  const recoveredHidden = (
    (recoveredTarget.body?.candidates ?? []) as Array<{
      identifierAssignmentId?: string;
      links?: Array<{ targetObject?: string }>;
    }>
  ).find((candidate) => candidate.identifierAssignmentId === identifierHidden);
  record(
    "new_governed_target_assignment_recovers_link_visibility",
    recoveredTarget.status === 0 &&
      recoveredHidden?.links?.length === 1 &&
      recoveredHidden.links[0]?.targetObject === venueHidden,
  );

  const crossWorldLinkProposal = "proposal.link.invalid.world";
  const crossWorldLinkDraft = typedLinkDraft({
    assertionId: "link-assertion.invalid.world",
    sourceEntity: listingNyse,
    sourceAssignment: listingNyseType,
    targetEntity: venueNyse,
    targetAssignment: venueNyseType,
  });
  const crossWorldLinkAssertion = crossWorldLinkDraft.linkAssertion as Record<string, unknown>;
  crossWorldLinkAssertion.target = { world: "world.other", entity: venueNyse };
  assert.equal(propose(builder, crossWorldLinkProposal, crossWorldLinkDraft).status, 0);
  assert.equal(decide(owner, crossWorldLinkProposal).status, 0);
  record(
    "typed_link_rejects_cross_world_endpoints",
    commit(owner, crossWorldLinkProposal).status !== 0 &&
      (await scalarCount(
        "SELECT COUNT(*)::text AS count FROM world_kernel_receipts WHERE proposal_id = $1",
        [crossWorldLinkProposal],
      )) === 0,
  );

  const crossWorldIdentifierProposal = "proposal.identifier.invalid.world";
  const crossWorldIdentifierDraft = identifierAssignmentDraft({
    assignmentId: "identifier-assignment.invalid.world",
    entity: listingNyse,
    typeAssignment: listingNyseType,
    venueEntity: venueNyse,
  });
  const crossWorldIdentifier = crossWorldIdentifierDraft.identifierAssignment as Record<
    string,
    unknown
  >;
  (crossWorldIdentifier.context as Record<string, unknown>).venue = {
    world: "world.other",
    entity: venueNyse,
  };
  assert.equal(
    propose(builder, crossWorldIdentifierProposal, crossWorldIdentifierDraft).status,
    0,
  );
  assert.equal(decide(owner, crossWorldIdentifierProposal).status, 0);
  record(
    "identifier_context_rejects_cross_world_venue",
    commit(owner, crossWorldIdentifierProposal).status !== 0 &&
      (await scalarCount(
        "SELECT COUNT(*)::text AS count FROM world_kernel_receipts WHERE proposal_id = $1",
        [crossWorldIdentifierProposal],
      )) === 0,
  );

  const invalidLinkProposal = "proposal.link.invalid.interval";
  assert.equal(
    propose(
      builder,
      invalidLinkProposal,
      typedLinkDraft({
        assertionId: "link-assertion.invalid.interval",
        sourceEntity: listingNyse,
        sourceAssignment: listingExpiringType,
        targetEntity: venueNyse,
        targetAssignment: venueNyseType,
        validEndMicros: 300,
      }),
    ).status,
    0,
  );
  assert.equal(decide(owner, invalidLinkProposal).status, 0);
  const invalidLink = commit(owner, invalidLinkProposal);
  record(
    "typed_link_requires_endpoint_assignments_covering_complete_interval",
    invalidLink.status !== 0 && invalidLink.stderr.toLowerCase().includes("interval"),
  );
  record(
    "rejected_typed_link_leaves_no_receipt_or_link",
    (await scalarCount(
      "SELECT COUNT(*)::text AS count FROM world_kernel_receipts WHERE proposal_id = $1",
      [invalidLinkProposal],
    )) === 0 &&
      (await scalarCount(
        "SELECT COUNT(*)::text AS count FROM world_link_assertions WHERE link_assertion_id = $1",
        ["link-assertion.invalid.interval"],
      )) === 0,
  );
  const emptyContextProposal = "proposal.identifier.invalid.context";
  assert.equal(
    propose(
      builder,
      emptyContextProposal,
      identifierAssignmentDraft({
        assignmentId: "identifier-assignment.invalid.context",
        entity: listingNyse,
        typeAssignment: listingNyseType,
      }),
    ).status,
    0,
  );
  assert.equal(decide(owner, emptyContextProposal).status, 0);
  record(
    "identifier_assignment_requires_explicit_context",
    commit(owner, emptyContextProposal).status !== 0,
  );

  const identifierReplay = commit(owner, "proposal.identifier.ibm.xnys");
  const linkReplay = commit(owner, "proposal.link.ibm.xnys");
  record(
    "identifier_and_link_commit_replay_remains_exactly_once",
    identifierReplay.status === 0 &&
      linkReplay.status === 0 &&
      (await scalarCount(
        "SELECT COUNT(*)::text AS count FROM world_identifier_assignments WHERE identifier_assignment_id = $1",
        [identifierNyse],
      )) === 1 &&
      (await scalarCount(
        "SELECT COUNT(*)::text AS count FROM world_link_assertions WHERE link_assertion_id = $1",
        [linkNyse],
      )) === 1,
  );

  const recoveryProposal = "proposal.membership.recovery";
  const recoveryEntity = "memory.recovery";
  const recoveryAssignment = "type-assignment.memory.recovery";
  assert.equal(
    propose(
      builder,
      recoveryProposal,
      typeAssignmentDraft({
        assignmentId: recoveryAssignment,
        entity: recoveryEntity,
        objectType: memoryType,
      }),
    ).status,
    0,
  );
  assert.equal(decide(owner, recoveryProposal).status, 0);
  await revokeOwnerMembership();
  const deniedCommit = commit(owner, recoveryProposal);
  record(
    "revoked_commit_membership_denies_before_materialization",
    deniedCommit.status !== 0 && deniedCommit.stderr.toLowerCase().includes("denied"),
  );
  await assertNoMaterialization(recoveryProposal, recoveryEntity, recoveryAssignment);
  const recoveredCommit = commit(replacementOwner, recoveryProposal);
  assert.equal(recoveredCommit.status, 0, recoveredCommit.stderr);
  record(
    "replacement_membership_recovers_same_proposal_once",
    (await scalarCount(
      "SELECT COUNT(*)::text AS count FROM world_type_assignments WHERE assignment_id = $1",
      [recoveryAssignment],
    )) === 1,
  );

  const collisionProposal = "proposal.assignment.collision";
  const collisionEntity = "memory.collision";
  assert.equal(
    propose(
      builder,
      collisionProposal,
      typeAssignmentDraft({
        assignmentId,
        entity: collisionEntity,
        objectType: memoryType,
      }),
    ).status,
    0,
  );
  assert.equal(decide(replacementOwner, collisionProposal).status, 0);
  const collision = commit(replacementOwner, collisionProposal);
  record(
    "immutable_assignment_collision_is_rejected",
    collision.status !== 0 && collision.stderr.toLowerCase().includes("assignment"),
  );
  record(
    "failed_materialization_does_not_orphan_receipt_or_object_key",
    (await scalarCount(
      "SELECT COUNT(*)::text AS count FROM world_kernel_receipts WHERE proposal_id = $1",
      [collisionProposal],
    )) === 0 &&
      (await scalarCount(
        "SELECT COUNT(*)::text AS count FROM world_object_keys WHERE world_id = $1 AND entity_id = $2",
        [world, collisionEntity],
      )) === 0 &&
      (await scalarCount(
        "SELECT COUNT(*)::text AS count FROM world_type_assignments WHERE assignment_id = $1 AND receipt_id = $2",
        [assignmentId, receiptId],
      )) === 1,
  );

  const secondAssignment = "type-assignment.memory.dentist.patient";
  const secondProposal = "proposal.memory.dentist.patient";
  assert.equal(
    propose(
      builder,
      secondProposal,
      typeAssignmentDraft({
        assignmentId: secondAssignment,
        entity,
        objectType: patientType,
        validEndMicros: 1_800_000_000_000_000,
      }),
    ).status,
    0,
  );
  assert.equal(decide(replacementOwner, secondProposal).status, 0);
  assert.equal(commit(replacementOwner, secondProposal).status, 0);
  record(
    "one_object_key_supports_multiple_temporal_type_assignments",
    (await scalarCount(
      "SELECT COUNT(*)::text AS count FROM world_object_keys WHERE world_id = $1 AND entity_id = $2",
      [world, entity],
    )) === 1 &&
      (await scalarCount(
        "SELECT COUNT(*)::text AS count FROM world_type_assignments WHERE world_id = $1 AND entity_id = $2",
        [world, entity],
      )) === 2,
  );

  const invalidCases: Array<{
    name: string;
    proposal: string;
    entity: string;
    assignment: string;
    draft: Record<string, unknown>;
  }> = [];
  const crossWorldDraft = typeAssignmentDraft({
    assignmentId: "type-assignment.invalid.world",
    entity: "memory.invalid.world",
    objectType: memoryType,
  });
  crossWorldDraft.objectKey = { world: "world.other", entity: "memory.invalid.world" };
  invalidCases.push({
    name: "cross_world_object_key",
    proposal: "proposal.invalid.world",
    entity: "memory.invalid.world",
    assignment: "type-assignment.invalid.world",
    draft: crossWorldDraft,
  });
  const wrongGrantDraft = typeAssignmentDraft({
    assignmentId: "type-assignment.invalid.grant",
    entity: "memory.invalid.grant",
    objectType: memoryType,
  });
  wrongGrantDraft.grants = [
    {
      principalId: human.principal,
      membershipId: human.membership,
      objectType: patientType,
    },
  ];
  invalidCases.push({
    name: "grant_type_mismatch",
    proposal: "proposal.invalid.grant",
    entity: "memory.invalid.grant",
    assignment: "type-assignment.invalid.grant",
    draft: wrongGrantDraft,
  });
  const finalEvidenceDraft = typeAssignmentDraft({
    assignmentId: "type-assignment.invalid.evidence",
    entity: "memory.invalid.evidence",
    objectType: memoryType,
  });
  finalEvidenceDraft.evidenceRef = "evidence.mapper.must-not-mint";
  invalidCases.push({
    name: "mapper_supplied_final_evidence_ref",
    proposal: "proposal.invalid.evidence",
    entity: "memory.invalid.evidence",
    assignment: "type-assignment.invalid.evidence",
    draft: finalEvidenceDraft,
  });
  const membershipLabelDraft = typeAssignmentDraft({
    assignmentId: "type-assignment.invalid.membership-label",
    entity: "memory.invalid.membership-label",
    objectType: memoryType,
  });
  (membershipLabelDraft.typeAssignment as Record<string, unknown>).membership =
    "not-a-type-assignment";
  invalidCases.push({
    name: "membership_label_for_type_evidence",
    proposal: "proposal.invalid.membership-label",
    entity: "memory.invalid.membership-label",
    assignment: "type-assignment.invalid.membership-label",
    draft: membershipLabelDraft,
  });
  const malformedTimeDraft = typeAssignmentDraft({
    assignmentId: "type-assignment.invalid.time",
    entity: "memory.invalid.time",
    objectType: memoryType,
  });
  (malformedTimeDraft.typeAssignment as Record<string, unknown>).validEndMicros = "tomorrow";
  invalidCases.push({
    name: "non_integer_valid_time",
    proposal: "proposal.invalid.time",
    entity: "memory.invalid.time",
    assignment: "type-assignment.invalid.time",
    draft: malformedTimeDraft,
  });
  const malformedGrantsDraft = typeAssignmentDraft({
    assignmentId: "type-assignment.invalid.grants",
    entity: "memory.invalid.grants",
    objectType: memoryType,
  });
  malformedGrantsDraft.grants = { membershipId: human.membership };
  invalidCases.push({
    name: "non_array_grants",
    proposal: "proposal.invalid.grants",
    entity: "memory.invalid.grants",
    assignment: "type-assignment.invalid.grants",
    draft: malformedGrantsDraft,
  });

  for (const invalid of invalidCases) {
    assert.equal(propose(builder, invalid.proposal, invalid.draft).status, 0);
    assert.equal(decide(replacementOwner, invalid.proposal).status, 0);
    const rejected = commit(replacementOwner, invalid.proposal);
    record(`${invalid.name}_is_rejected`, rejected.status !== 0);
    await assertNoMaterialization(invalid.proposal, invalid.entity, invalid.assignment);
  }

  const artifactPath = await writeScenarioArtifact(repositoryRoot, scenario, {
    assertions,
    dimensions: {
      actors:
        "builder proposes typed drafts; owner decides and commits through durable Membership/Cedar authority; clinic human queries only objects and link targets granted to its exact Membership",
      path: "published seven-verb CLI Propose → Decide → Commit admits ObjectKey, TypeAssignment, typed Link, and contextual IdentifierAssignment; Query resolves all permitted candidates with sealed cursor and server budget",
      negative:
        "principal/Membership mismatch, revoked Commit Membership, unauthorized query, hidden link target, changed cursor context, cross-World ObjectKey, insufficient endpoint interval, empty identifier context, mapper-minted evidence, malformed fields, and immutable collisions fail closed",
      replay:
        "Commit replay returns the same receipt and verifies exact immutable TypeAssignment, IdentifierAssignment, Link, and grant materialization",
      isolation:
        "World is part of every ObjectKey and composite TypeAssignment, Link, IdentifierAssignment, venue, and grant foreign key; invalid drafts create no receipt or semantic state",
      recovery:
        "a Commit denied while the owner Membership is revoked leaves no materialization; an authorized replacement Membership commits that same proposal exactly once",
    },
    finishedAt: new Date().toISOString(),
    interfacesProven: ["cli"],
    journeySlices: [
      "ObjectKey/TypeAssignment governed Commit persistence",
      "typed Link and contextual IdentifierAssignment governed Commit persistence",
      "authorize-before-scan identifier candidates with sealed cursor and target-authorized links",
    ],
    journeys: [],
    remainingJourneyProof: [
      "J2:Eve memory path",
      "J4:published Query with sealed cursor, budget, compute, and explain",
      "Connect transport",
      "MCP transport",
      "FIN-01:production-shaped IBM pack and W8-04 positive/denial/recovery gate",
      "FIN-04:KnowledgeBasis/ObjectView and two SEC knowledge cuts",
    ],
    scope:
      "W2-08 plus W2-09 CLI/Postgres substrate: governed Commit admits typed links and contextual identifiers; Query returns authorized typed candidates and target-authorized links. Full J4, FIN-01, and FIN-04 remain NOT_EVALUATED pending ObjectView, KnowledgeBasis, surface parity, and production-shaped IBM/SEC artifacts.",
    sourceCommit,
    startedAt,
    unit: "W2-08/W2-09-substrate",
  });
  const passed = Object.values(assertions).filter(Boolean).length;
  const total = Object.keys(assertions).length;
  console.log(
    `object-key PASS assertions ${passed}/${total} artifact=${artifactPath} sourceCommit=${sourceCommit}`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exitCode = 1;
});
