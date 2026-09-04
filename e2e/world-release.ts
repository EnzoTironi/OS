import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import canonicalize from "canonicalize";
import {
  e2eGeneratedDirectory,
  e2ePostgresUrl,
  writeScenarioArtifact,
} from "./host-env.js";
import { parseZoenJson, runZoenCli, type ZoenCliResult } from "./zoen-cli.js";

const scenario = "world-release";
const repositoryRoot = process.cwd();
const postgresPortFallback = 55_490;
const databaseUrl = e2ePostgresUrl("postgres", "postgres", postgresPortFallback);
const generatedDirectory = e2eGeneratedDirectory(repositoryRoot, scenario);
const targetDir = process.env.CARGO_TARGET_DIR ?? path.join(repositoryRoot, "target");
const zoenPath = path.join(targetDir, "debug", "zoen");
const fixtureDigest = (
  await readFile(
    path.join(repositoryRoot, "testdata/jcs/zoen/world-release-v1.sha256"),
    "utf8",
  )
).trim();
const fixtureJcs = (
  await readFile(
    path.join(repositoryRoot, "testdata/jcs/zoen/world-release-v1.jcs"),
    "utf8",
  )
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

function buildPolicyCatalog(input: {
  actionId?: string;
  definitionDigest?: string;
  policyId?: string;
  revision?: number;
  source?: string;
}): { bytes: string; evidenceDigest: string; policyDigest: string } {
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
      },
    ],
  })}
`;
  return {
    bytes,
    evidenceDigest: createHash("sha256").update(bytes).digest("hex"),
    policyDigest,
  };
}

const alphaPolicy = buildPolicyCatalog({});
const alphaBytes: CatalogBytes = {
  ontology: "{\"label\":\"world.alpha.v1\",\"publicVerbs\":[\"Discover\",\"Query\",\"Propose\",\"Decide\",\"Commit\",\"Explain\",\"Execute\"],\"schema\":\"zoen.ontology-catalog.v1\"}\n",
  policy: alphaPolicy.bytes,
  executors: "executor catalog for world.alpha v1\n",
  components: "component catalog for world.alpha v1\n",
};

const secondBytes: CatalogBytes = {
  ...alphaBytes,
  ontology: "{\"label\":\"world.alpha.v2\",\"publicVerbs\":[\"Discover\",\"Query\",\"Propose\",\"Decide\",\"Commit\",\"Explain\",\"Execute\"],\"schema\":\"zoen.ontology-catalog.v1\"}\n",
};

const recoveryBytes: CatalogBytes = {
  ...alphaBytes,
  executors: "executor catalog for world.alpha recovery\n",
};

const betaBytes = alphaBytes;


const policyEvidenceDigest = alphaPolicy.evidenceDigest;

const assertions: Record<string, boolean> = {};

function record(name: string, observed: boolean): void {
  assert.ok(observed, name);
  assertions[name] = observed;
}

type ZoenResult = ZoenCliResult;

function runZoen(args: readonly string[]): ZoenResult {
  return runZoenCli(zoenPath, databaseUrl, args);
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

function contentFromBytes(
  world: string,
  bytes: CatalogBytes,
  parent: string | null = null,
): Record<string, unknown> {
  return {
    world,
    parent,
    ontology: { bytes: bytes.ontology },
    policy: { bytes: bytes.policy },
    executors: { bytes: bytes.executors },
    components: { bytes: bytes.components },
  };
}

async function writeContent(
  name: string,
  body: Record<string, unknown>,
): Promise<string> {
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

function publish(
  file: string,
  principal: string,
): ZoenResult & { body?: Record<string, unknown> } {
  const result = runZoen([
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
    policyEvidenceDigest,
    "--policy-revision",
    "1",
    "--determining-policy",
    "policy.world",
  ]);
  if (result.status === 0) {
    return { ...result, body: parseJson(result.stdout) };
  }
  return result;
}

function preview(
  world: string,
  digest: string,
  principal: string,
): ZoenResult & { body?: Record<string, unknown> } {
  const result = runZoen([
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
  if (result.status === 0) {
    return { ...result, body: parseJson(result.stdout) };
  }
  return result;
}

function decide(
  previewDigest: string,
  principal: string,
  decision: "approve" | "reject",
): ZoenResult & { body?: Record<string, unknown> } {
  const result = runZoen([
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
  if (result.status === 0) {
    return { ...result, body: parseJson(result.stdout) };
  }
  return result;
}

function activate(
  world: string,
  digest: string,
  principal: string,
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
    principal,
  ]);
}

function approveAndActivate(
  world: string,
  digest: string,
  principal: string,
): {
  preview: Record<string, unknown>;
  decide: Record<string, unknown>;
  activate: ZoenResult;
} {
  const previewed = preview(world, digest, principal);
  assert.equal(previewed.status, 0, previewed.stderr);
  const previewBody = previewed.body ?? {};
  const decided = decide(String(previewBody.previewDigest), principal, "approve");
  assert.equal(decided.status, 0, decided.stderr);
  return {
    preview: previewBody,
    decide: decided.body ?? {},
    activate: activate(
      world,
      digest,
      principal,
      String(previewBody.previewDigest),
    ),
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
  await mkdir(generatedDirectory, { recursive: true });

  const schema = runZoen(["schema", "world.release.construct"]);
  record("schema_lists_construct", schema.status === 0);
  const previewSchema = runZoen(["schema", "world.release.preview"]);
  record("schema_lists_preview", previewSchema.status === 0);
  const decideSchema = runZoen(["schema", "world.release.decide"]);
  record("schema_lists_decide", decideSchema.status === 0);
  const authorizeSchema = runZoen(["schema", "world.release.authorize"]);
  record("schema_lists_authorize", authorizeSchema.status === 0);
  record(
    "schema_omits_digest_flag",
    !schema.stdout.includes("--digest") && schema.stdout.includes("--file"),
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
      changed.digest !== first.digest &&
        changed.digest === expectedDigest(mutated).digest,
    );
  }

  const withParent = content({ parent: fixtureDigest });
  const parentPath = await writeContent("parent.json", withParent);
  const parented = construct(parentPath);
  record(
    "parent_field_changes_digest",
    parented.digest !== first.digest &&
      parented.digest === expectedDigest(withParent).digest,
  );

  const callerIdPath = await writeContent("caller-id.json", {
    ...content(),
    digest: "f".repeat(64),
  });
  const callerId = runZoen([
    "world",
    "release",
    "construct",
    "--file",
    callerIdPath,
  ]);
  record("caller_supplied_digest_rejected", callerId.status !== 0);
  record(
    "caller_supplied_digest_message",
    callerId.stderr.includes("caller cannot supply a ReleaseDigest"),
  );

  const hexOnlyPublish = publish(alphaPath, "principal.builder");
  record("hex_only_publish_rejected", hexOnlyPublish.status !== 0);
  record(
    "hex_only_publish_message",
    hexOnlyPublish.stderr.includes("requires catalog bytes"),
  );

  const missingPolicy = runZoen([
    "world",
    "release",
    "publish",
    "--file",
    alphaPath,
    "--principal",
    "principal.builder",
    "--policy-id",
    "policy.world",
    "--policy-digest",
    policyEvidenceDigest,
    "--policy-revision",
    "1",
  ]);
  record("missing_policy_fails_before_commit", missingPolicy.status !== 0);
  record(
    "missing_policy_message",
    missingPolicy.stderr.includes("requires policy evidence"),
  );

  const plaintextPolicyPath = await writeContent(
    "plaintext-policy.json",
    contentFromBytes("world.alpha", {
      ...alphaBytes,
      policy: "policy catalog without cedar\n",
    }),
  );
  const plaintextPublish = publish(plaintextPolicyPath, "principal.builder");
  record("missing_cedar_in_policy_catalog_fails", plaintextPublish.status !== 0);
  record(
    "missing_cedar_in_policy_catalog_message",
    plaintextPublish.stderr.includes("loadable Cedar bundle"),
  );

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
  const invalidCedarPublish = publish(invalidCedarPath, "principal.builder");
  record("invalid_cedar_in_policy_catalog_fails", invalidCedarPublish.status !== 0);
  record(
    "invalid_cedar_in_policy_catalog_message",
    invalidCedarPublish.stderr.includes("loadable Cedar bundle"),
  );

  const liveAlphaPath = await writeContent(
    "live-alpha.json",
    contentFromBytes("world.alpha", alphaBytes),
  );
  const liveExpected = expectedFromBytes("world.alpha", alphaBytes);
  const liveConstruct = construct(liveAlphaPath);
  record(
    "byte_catalogs_derive_digest",
    liveConstruct.digest === liveExpected.digest &&
      liveConstruct.ontology === liveExpected.catalogs.ontology,
  );
  record(
    "byte_catalogs_present_on_construct",
    boundCatalogBytes(liveConstruct).ontology === alphaBytes.ontology,
  );

  const nonBuilder = publish(liveAlphaPath, "principal.member");
  record("non_builder_publish_fails", nonBuilder.status !== 0);
  record(
    "non_builder_publish_message",
    nonBuilder.stderr.includes("not a builder"),
  );

  const unpublishedPreview = preview(
    "world.alpha",
    String(liveConstruct.digest),
    "principal.owner",
  );
  record(
    "unpublished_preview_fails",
    unpublishedPreview.status !== 0 &&
      (unpublishedPreview.stderr.includes("requires policy evidence") ||
        unpublishedPreview.stderr.includes("was not found")),
  );
  const unpublishedActivate = activate(
    "world.alpha",
    String(liveConstruct.digest),
    "principal.owner",
    "0".repeat(64),
  );
  record(
    "unpublished_activate_fails",
    unpublishedActivate.status !== 0 &&
      (unpublishedActivate.stderr.includes("was not found") ||
        unpublishedActivate.stderr.includes("activation requires an approving decision")),
  );

  const ownerPublish = publish(liveAlphaPath, "principal.builder");
  assert.equal(ownerPublish.status, 0, ownerPublish.stderr);
  const published = ownerPublish.body ?? {};
  record("owner_publish_stores_digest", published.digest === liveConstruct.digest);
  record("publish_replay_is_false_first", published.replay === false);
  const publication = published.publication as Record<string, unknown>;
  record("publication_is_separate", publication.digest === liveConstruct.digest);
  record(
    "publication_time_present",
    typeof publication.publishedAtMicros === "number",
  );
  record(
    "stored_catalog_bytes_match",
    boundCatalogBytes(published).ontology === alphaBytes.ontology &&
      boundCatalogBytes(published).policy === alphaBytes.policy &&
      boundCatalogBytes(published).executors === alphaBytes.executors &&
      boundCatalogBytes(published).components === alphaBytes.components,
  );

  const ownerReplay = publish(liveAlphaPath, "principal.owner");
  assert.equal(ownerReplay.status, 0, ownerReplay.stderr);
  const replayed = ownerReplay.body ?? {};
  record("identical_candidate_replay", replayed.replay === true);
  record("replay_keeps_original_digest", replayed.digest === liveConstruct.digest);
  const replayPublication = replayed.publication as Record<string, unknown>;
  record(
    "replay_keeps_original_publication_time",
    replayPublication.publishedAtMicros === publication.publishedAtMicros,
  );
  record(
    "publication_metadata_does_not_change_digest",
    replayed.digest === published.digest,
  );

  const builderPreview = preview(
    "world.alpha",
    String(liveConstruct.digest),
    "principal.builder",
  );
  record(
    "builder_cannot_preview",
    builderPreview.status !== 0 && builderPreview.stderr.includes("not the owner"),
  );
  const ownerPreview = preview(
    "world.alpha",
    String(liveConstruct.digest),
    "principal.owner",
  );
  assert.equal(ownerPreview.status, 0, ownerPreview.stderr);
  const firstPreview = ownerPreview.body ?? {};
  record(
    "owner_preview_binds_candidate",
    firstPreview.digest === liveConstruct.digest &&
      firstPreview.currentActive === null &&
      firstPreview.schema === "zoen.world-release-preview.v1",
  );
  record("owner_preview_replay_is_false_first", firstPreview.replay === false);
  const previewReplay = preview(
    "world.alpha",
    String(liveConstruct.digest),
    "principal.owner",
  );
  assert.equal(previewReplay.status, 0, previewReplay.stderr);
  const replayedPreview = previewReplay.body ?? {};
  record(
    "identical_preview_replay",
    replayedPreview.replay === true &&
      replayedPreview.previewDigest === firstPreview.previewDigest,
  );

  const builderDecide = decide(
    String(firstPreview.previewDigest),
    "principal.builder",
    "approve",
  );
  record(
    "builder_cannot_decide",
    builderDecide.status !== 0 && builderDecide.stderr.includes("not the owner"),
  );

  const activateWithoutDecide = activate(
    "world.alpha",
    String(liveConstruct.digest),
    "principal.owner",
    String(firstPreview.previewDigest),
  );
  record(
    "activate_without_approve_fails",
    activateWithoutDecide.status !== 0 &&
      activateWithoutDecide.stderr.includes("activation requires an approving decision"),
  );

  const ownerDecide = decide(
    String(firstPreview.previewDigest),
    "principal.owner",
    "approve",
  );
  assert.equal(ownerDecide.status, 0, ownerDecide.stderr);
  const firstDecision = ownerDecide.body ?? {};
  record("owner_decide_approves", firstDecision.decision === "approve");
  record("owner_decide_replay_is_false_first", firstDecision.replay === false);
  const decideReplay = decide(
    String(firstPreview.previewDigest),
    "principal.owner",
    "approve",
  );
  assert.equal(decideReplay.status, 0, decideReplay.stderr);
  const replayedDecision = decideReplay.body ?? {};
  record(
    "identical_decide_replay",
    replayedDecision.replay === true &&
      replayedDecision.previewDigest === firstPreview.previewDigest &&
      replayedDecision.decidedAtMicros === firstDecision.decidedAtMicros,
  );
  const mismatchedDecideReplay = decide(
    String(firstPreview.previewDigest),
    "principal.other.owner",
    "approve",
  );
  record(
    "mismatched_decide_principal_denied",
    mismatchedDecideReplay.status !== 0 &&
      mismatchedDecideReplay.stderr.includes("not the owner"),
  );

  const builderActivate = activate(
    "world.alpha",
    String(liveConstruct.digest),
    "principal.builder",
    String(firstPreview.previewDigest),
  );
  record(
    "builder_cannot_activate",
    builderActivate.status !== 0 &&
      builderActivate.stderr.includes("not the owner"),
  );

  const firstActivate = activate(
    "world.alpha",
    String(liveConstruct.digest),
    "principal.owner",
    String(firstPreview.previewDigest),
  );
  assert.equal(firstActivate.status, 0, firstActivate.stderr);
  const firstActivation = parseJson(firstActivate.stdout);
  record("first_activation_succeeds", firstActivation.activated === true);
  record("first_activation_has_no_previous", firstActivation.previousDigest === null);
  record("first_activation_replay_is_false", firstActivation.replay === false);
  const activateReplay = activate(
    "world.alpha",
    String(liveConstruct.digest),
    "principal.owner",
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

  const fetchedCatalogs = runZoen([
    "world",
    "release",
    "catalogs",
    "--digest",
    String(liveConstruct.digest),
    "--world",
    "world.alpha",
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
    policyCatalogText.includes("zoen.policy-catalog.v1") &&
      policyCatalogText.includes("authorization"),
  );

  const permitted = authorize("world.alpha", "principal.owner");
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

  const budgets = runZoen([
    "world",
    "release",
    "budgets",
    "--world",
    "world.alpha",
  ]);
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
    budgetsBody.digest === liveExpected.digest &&
      budgetsBody.policyCatalogDigest === liveExpected.catalogs.policy,
  );
  const standard = budgetClasses.find(
    (entry) => entry.id === "clinic.query.standard",
  );
  const tight = budgetClasses.find((entry) => entry.id === "clinic.query.tight");
  record(
    "caller_cannot_raise_budget_above_catalog",
    standard !== undefined &&
      tight !== undefined &&
      Number(tight.fuel) < Number(standard.fuel),
  );
  const schemaBudgets = runZoen(["schema", "world.release.budgets"]);
  record(
    "schema_lists_world_release_budgets",
    schemaBudgets.status === 0 &&
      schemaBudgets.stdout.includes("world.release.budgets"),
  );

  const bootOnly = runZoen([
    "world",
    "release",
    "authorize",
    "--world",
    "world.alpha",
    "--principal",
    "principal.owner",
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
      bootBody.decision === "error" &&
        String(bootBody.message).includes("no Cedar policy is installed"),
    );
  } else {
    record("boot_manifest_only_action_errors_from_catalog", false);
  }

  const mixedPath = await writeContent("mixed.json", {
    world: "world.alpha",
    parent: null,
    ontology: { bytes: alphaBytes.ontology },
    policy: catalog.policy,
    executors: { bytes: alphaBytes.executors },
    components: { bytes: alphaBytes.components },
  });
  const mixedConstruct = runZoen([
    "world",
    "release",
    "construct",
    "--file",
    mixedPath,
  ]);
  record("mixed_candidate_catalogs_fail", mixedConstruct.status !== 0);
  record(
    "mixed_candidate_catalogs_message",
    mixedConstruct.stderr.includes("cannot mix catalog bytes"),
  );

  const betaPath = await writeContent(
    "beta.json",
    contentFromBytes("world.beta", betaBytes),
  );
  const beta = construct(betaPath);
  const betaPublish = publish(betaPath, "principal.builder");
  assert.equal(betaPublish.status, 0, betaPublish.stderr);
  record(
    "identical_catalog_bytes_converge",
    beta.ontology === liveConstruct.ontology &&
      beta.policy === liveConstruct.policy &&
      beta.executors === liveConstruct.executors &&
      beta.components === liveConstruct.components &&
      beta.digest !== liveConstruct.digest,
  );
  const crossPreview = preview("world.alpha", String(beta.digest), "principal.owner");
  record(
    "other_world_cannot_preview_for_this_world",
    crossPreview.status !== 0 &&
      crossPreview.stderr.includes("does not belong to this World"),
  );
  const betaPreviewForCross = preview("world.beta", String(beta.digest), "principal.owner");
  assert.equal(betaPreviewForCross.status, 0, betaPreviewForCross.stderr);
  const crossWorld = activate(
    "world.alpha",
    String(beta.digest),
    "principal.owner",
    String((betaPreviewForCross.body ?? {}).previewDigest),
  );
  record(
    "other_world_cannot_activate_for_this_world",
    crossWorld.status !== 0 &&
      crossWorld.stderr.includes("does not belong to this World"),
  );
  const crossCatalogs = runZoen([
    "world",
    "release",
    "catalogs",
    "--digest",
    String(beta.digest),
    "--world",
    "world.alpha",
  ]);
  record(
    "cross_world_catalog_access_fails",
    crossCatalogs.status !== 0 &&
      crossCatalogs.stderr.includes("does not belong to this World"),
  );
  const crossAuthorize = authorize("world.alpha", "principal.owner");
  // world.alpha still active on first release until second activation below
  record(
    "cross_world_authorize_stays_on_caller_world",
    crossAuthorize.status === 0 &&
      (crossAuthorize.body ?? {}).world === "world.alpha",
  );
  const betaAuthorizeBeforeActivate = authorize("world.beta", "principal.owner");
  record(
    "other_world_without_activation_cannot_authorize",
    betaAuthorizeBeforeActivate.status !== 0 &&
      betaAuthorizeBeforeActivate.stderr.includes("no active release"),
  );

  const secondPath = await writeContent(
    "second.json",
    contentFromBytes("world.alpha", secondBytes),
  );
  const secondRelease = construct(secondPath);
  const secondPublish = publish(secondPath, "principal.builder");
  assert.equal(secondPublish.status, 0, secondPublish.stderr);
  const secondCeremony = approveAndActivate(
    "world.alpha",
    String(secondRelease.digest),
    "principal.owner",
  );
  assert.equal(secondCeremony.activate.status, 0, secondCeremony.activate.stderr);
  const secondActivation = parseJson(secondCeremony.activate.stdout);
  record(
    "second_preview_sees_prior_active",
    secondCeremony.preview.currentActive === liveConstruct.digest,
  );
  record("second_activation_replaces_pointer", secondActivation.activated === true);
  record(
    "second_activation_reports_previous",
    secondActivation.previousDigest === liveConstruct.digest,
  );

  const prior = runZoen([
    "world",
    "release",
    "get",
    "--digest",
    String(liveConstruct.digest),
  ]);
  assert.equal(prior.status, 0, prior.stderr);
  const priorRelease = parseJson(prior.stdout);
  record("prior_release_queryable_by_digest", priorRelease.digest === liveConstruct.digest);
  record("prior_release_is_not_active", priorRelease.active === false);
  record(
    "historical_catalogs_remain_addressable",
    boundCatalogBytes(priorRelease).ontology === alphaBytes.ontology,
  );

  const active = runZoen(["world", "release", "active", "--world", "world.alpha"]);
  assert.equal(active.status, 0, active.stderr);
  const activeRelease = parseJson(active.stdout);
  record("active_pointer_is_second_release", activeRelease.digest === secondRelease.digest);
  record("one_active_release_per_world", activeRelease.active === true);
  record(
    "active_release_binds_its_own_catalogs",
    boundCatalogBytes(activeRelease).ontology === secondBytes.ontology &&
      boundCatalogBytes(activeRelease).ontology !== alphaBytes.ontology,
  );

  const recoveryPath = await writeContent(
    "recovery.json",
    contentFromBytes("world.alpha", recoveryBytes),
  );
  const recovery = construct(recoveryPath);
  const recoveryPublish = publish(recoveryPath, "principal.builder");
  assert.equal(recoveryPublish.status, 0, recoveryPublish.stderr);
  const recoveryPreview = preview(
    "world.alpha",
    String(recovery.digest),
    "principal.owner",
  );
  assert.equal(recoveryPreview.status, 0, recoveryPreview.stderr);
  const recoveryPreviewBody = recoveryPreview.body ?? {};
  const recoveryDecide = decide(
    String(recoveryPreviewBody.previewDigest),
    "principal.owner",
    "approve",
  );
  assert.equal(recoveryDecide.status, 0, recoveryDecide.stderr);
  const afterCrash = runZoen(["world", "release", "active", "--world", "world.alpha"]);
  const stillActive = parseJson(afterCrash.stdout);
  record(
    "crash_before_activation_preserves_pointer",
    stillActive.digest === secondRelease.digest,
  );
  record(
    "crash_preserves_durable_decision",
    (recoveryDecide.body ?? {}).decision === "approve" &&
      (recoveryDecide.body ?? {}).previewDigest === recoveryPreviewBody.previewDigest,
  );
  const storedCandidate = runZoen([
    "world",
    "release",
    "get",
    "--digest",
    String(recovery.digest),
  ]);
  record("candidate_survives_without_activation", storedCandidate.status === 0);
  const retryActivate = activate(
    "world.alpha",
    String(recovery.digest),
    "principal.owner",
    String(recoveryPreviewBody.previewDigest),
  );
  assert.equal(retryActivate.status, 0, retryActivate.stderr);
  const recovered = parseJson(
    runZoen(["world", "release", "active", "--world", "world.alpha"]).stdout,
  );
  record("retry_converges_to_one_active", recovered.digest === recovery.digest);

  // Reject then activate denied
  const rejectBytes: CatalogBytes = {
    ...alphaBytes,
    components: "component catalog for reject path\n",
  };
  const rejectPath = await writeContent(
    "reject.json",
    contentFromBytes("world.alpha", rejectBytes),
  );
  const rejectRelease = construct(rejectPath);
  const rejectPublish = publish(rejectPath, "principal.builder");
  assert.equal(rejectPublish.status, 0, rejectPublish.stderr);
  const rejectPreview = preview(
    "world.alpha",
    String(rejectRelease.digest),
    "principal.owner",
  );
  assert.equal(rejectPreview.status, 0, rejectPreview.stderr);
  const rejected = decide(
    String((rejectPreview.body ?? {}).previewDigest),
    "principal.owner",
    "reject",
  );
  assert.equal(rejected.status, 0, rejected.stderr);
  record("owner_can_reject_preview", (rejected.body ?? {}).decision === "reject");
  const rejectedActivate = activate(
    "world.alpha",
    String(rejectRelease.digest),
    "principal.owner",
    String((rejectPreview.body ?? {}).previewDigest),
  );
  record(
    "reject_then_activate_denied",
    rejectedActivate.status !== 0 &&
      rejectedActivate.stderr.includes("release activation was rejected"),
  );

  // Stale preview: capture preview while recovery is active, replace active, then decide/activate fail
  const staleBytes: CatalogBytes = {
    ...alphaBytes,
    ontology: "{\"label\":\"stale.preview\",\"publicVerbs\":[\"Discover\",\"Query\",\"Propose\",\"Decide\",\"Commit\",\"Explain\",\"Execute\"],\"schema\":\"zoen.ontology-catalog.v1\"}\n",
  };
  const stalePath = await writeContent(
    "stale.json",
    contentFromBytes("world.alpha", staleBytes),
  );
  const staleRelease = construct(stalePath);
  const stalePublish = publish(stalePath, "principal.builder");
  assert.equal(stalePublish.status, 0, stalePublish.stderr);
  const stalePreview = preview(
    "world.alpha",
    String(staleRelease.digest),
    "principal.owner",
  );
  assert.equal(stalePreview.status, 0, stalePreview.stderr);
  const stalePreviewBody = stalePreview.body ?? {};
  record(
    "stale_preview_captures_current_active",
    stalePreviewBody.currentActive === recovery.digest,
  );
  const moverBytes: CatalogBytes = {
    ...alphaBytes,
    ontology: "{\"label\":\"mover\",\"publicVerbs\":[\"Discover\",\"Query\",\"Propose\",\"Decide\",\"Commit\",\"Explain\",\"Execute\"],\"schema\":\"zoen.ontology-catalog.v1\"}\n",
  };
  const moverPath = await writeContent(
    "mover.json",
    contentFromBytes("world.alpha", moverBytes),
  );
  const moverRelease = construct(moverPath);
  const moverPublish = publish(moverPath, "principal.builder");
  assert.equal(moverPublish.status, 0, moverPublish.stderr);
  const moverCeremony = approveAndActivate(
    "world.alpha",
    String(moverRelease.digest),
    "principal.owner",
  );
  assert.equal(moverCeremony.activate.status, 0, moverCeremony.activate.stderr);
  const staleDecide = decide(
    String(stalePreviewBody.previewDigest),
    "principal.owner",
    "approve",
  );
  record(
    "decide_on_stale_preview_fails",
    staleDecide.status !== 0 && staleDecide.stderr.includes("release preview is stale"),
  );
  // Fresh preview+decide for stale release, then move active again before activate
  const freshStalePreview = preview(
    "world.alpha",
    String(staleRelease.digest),
    "principal.owner",
  );
  assert.equal(freshStalePreview.status, 0, freshStalePreview.stderr);
  const freshStaleBody = freshStalePreview.body ?? {};
  const freshStaleDecide = decide(
    String(freshStaleBody.previewDigest),
    "principal.owner",
    "approve",
  );
  assert.equal(freshStaleDecide.status, 0, freshStaleDecide.stderr);
  const mover2Bytes: CatalogBytes = {
    ...alphaBytes,
    ontology: "{\"label\":\"mover2\",\"publicVerbs\":[\"Discover\",\"Query\",\"Propose\",\"Decide\",\"Commit\",\"Explain\",\"Execute\"],\"schema\":\"zoen.ontology-catalog.v1\"}\n",
  };
  const mover2Path = await writeContent(
    "mover2.json",
    contentFromBytes("world.alpha", mover2Bytes),
  );
  const mover2Release = construct(mover2Path);
  assert.equal(publish(mover2Path, "principal.builder").status, 0);
  const mover2Ceremony = approveAndActivate(
    "world.alpha",
    String(mover2Release.digest),
    "principal.owner",
  );
  assert.equal(mover2Ceremony.activate.status, 0, mover2Ceremony.activate.stderr);
  const staleActivate = activate(
    "world.alpha",
    String(staleRelease.digest),
    "principal.owner",
    String(freshStaleBody.previewDigest),
  );
  record(
    "activate_on_stale_preview_fails",
    staleActivate.status !== 0 && staleActivate.stderr.includes("release preview is stale"),
  );
  const wrongPreviewActivate = activate(
    "world.alpha",
    String(staleRelease.digest),
    "principal.owner",
    String(mover2Ceremony.preview.previewDigest),
  );
  record(
    "wrong_preview_digest_fails",
    wrongPreviewActivate.status !== 0 &&
      (wrongPreviewActivate.stderr.includes("does not belong to this World") ||
        wrongPreviewActivate.stderr.includes("release preview is stale") ||
        wrongPreviewActivate.stderr.includes("was not found")),
  );

  const unpublishedMix = expectedFromBytes("world.alpha", {
    ontology: alphaBytes.ontology,
    policy: alphaBytes.policy,
    executors: recoveryBytes.executors,
    components: "component catalog never published as this mix\n",
  });
  const mixActivate = activate(
    "world.alpha",
    unpublishedMix.digest,
    "principal.owner",
    "f".repeat(64),
  );
  record(
    "unpublished_mixed_tuple_cannot_activate",
    mixActivate.status !== 0 && mixActivate.stderr.includes("was not found"),
  );

  const artifactPath = await writeScenarioArtifact(repositoryRoot, scenario, {
    assertions,
    dimensions: {
      actors: "builder publishes Cedar PolicyCatalog with BudgetClass entries; owner activates; CLI lists release-owned budgets; authorize uses active-release Cedar",
      isolation: "another World cannot preview, decide, activate, read catalogs, budgets, or authorize for this World",
      negative: "non-builder, missing policy evidence, hex-only, missing/invalid Cedar, boot-manifest-only after activation, mixed catalogs, unpublished activate, activate without approve, reject then activate, stale/wrong preview; catalog tight class is lower than standard so callers cannot invent a higher ceiling",
      path: "publish PolicyCatalog computeBudgets, activate, CLI budgets lists server-owned classes bound to active release, authorize from catalog Cedar",
      recovery: "decide without activate keeps prior pointer, candidate, and durable decision; retry converges to one active; budgets remain release-bound",
      replay: "identical catalog bytes, publish, preview, decide, activate, and budgets listing replay keep one digest and no second rows",
    },
    fixtureDigest,
    finishedAt: new Date().toISOString(),
    firstDigest: liveConstruct.digest,
    startedAt,
  });
  console.log(`world-release PASS artifact=${artifactPath}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
