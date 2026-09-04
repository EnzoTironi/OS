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
  ontology: "ontology catalog for world.alpha v1\n",
  policy: alphaPolicy.bytes,
  executors: "executor catalog for world.alpha v1\n",
  components: "component catalog for world.alpha v1\n",
};

const secondBytes: CatalogBytes = {
  ...alphaBytes,
  ontology: "ontology catalog for world.alpha v2\n",
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

interface ZoenResult {
  status: number;
  stdout: string;
  stderr: string;
}

function runZoen(args: readonly string[]): ZoenResult {
  try {
    const stdout = execFileSync(zoenPath, args, {
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    if (error !== null && typeof error === "object" && "status" in error) {
      const failed = error as {
        status: number | null;
        stdout: string | Buffer;
        stderr: string | Buffer;
      };
      return {
        status: failed.status ?? 1,
        stdout: String(failed.stdout),
        stderr: String(failed.stderr),
      };
    }
    throw error;
  }
}

function parseJson(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text);
  assert.equal(typeof value, "object");
  assert.notEqual(value, null);
  return value as Record<string, unknown>;
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

function activate(
  world: string,
  digest: string,
  principal: string,
): ZoenResult {
  return runZoen([
    "world",
    "release",
    "activate",
    "--world",
    world,
    "--digest",
    digest,
    "--principal",
    principal,
  ]);
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

  const unpublishedActivate = activate(
    "world.alpha",
    String(liveConstruct.digest),
    "principal.owner",
  );
  record(
    "unpublished_activate_fails",
    unpublishedActivate.status !== 0 &&
      unpublishedActivate.stderr.includes("was not found"),
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

  const builderActivate = activate(
    "world.alpha",
    String(liveConstruct.digest),
    "principal.builder",
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
  );
  assert.equal(firstActivate.status, 0, firstActivate.stderr);
  const firstActivation = parseJson(firstActivate.stdout);
  record("first_activation_succeeds", firstActivation.activated === true);
  record("first_activation_has_no_previous", firstActivation.previousDigest === null);

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
  const crossWorld = activate("world.alpha", String(beta.digest), "principal.owner");
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
  const secondActivate = activate(
    "world.alpha",
    String(secondRelease.digest),
    "principal.owner",
  );
  assert.equal(secondActivate.status, 0, secondActivate.stderr);
  const secondActivation = parseJson(secondActivate.stdout);
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
  const afterCrash = runZoen(["world", "release", "active", "--world", "world.alpha"]);
  const stillActive = parseJson(afterCrash.stdout);
  record(
    "crash_before_activation_preserves_pointer",
    stillActive.digest === secondRelease.digest,
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
  );
  assert.equal(retryActivate.status, 0, retryActivate.stderr);
  const recovered = parseJson(
    runZoen(["world", "release", "active", "--world", "world.alpha"]).stdout,
  );
  record("retry_converges_to_one_active", recovered.digest === recovery.digest);

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
  );
  record(
    "unpublished_mixed_tuple_cannot_activate",
    mixActivate.status !== 0 && mixActivate.stderr.includes("was not found"),
  );

  const artifactPath = await writeScenarioArtifact(repositoryRoot, scenario, {
    assertions,
    dimensions: {
      actors: "builder publishes Cedar PolicyCatalog bytes; owner activates; authorize uses active-release Cedar",
      isolation: "another World cannot activate, read catalogs, or authorize for this World",
      negative: "non-builder, missing policy evidence, hex-only, missing/invalid Cedar, boot-manifest-only after activation, mixed catalogs, unpublished activate",
      path: "publish Cedar-bearing policy catalog, activate, digest binds four catalogs, authorize governed verb from active-release Cedar",
      recovery: "publication without activation keeps the prior pointer and candidate catalogs",
      replay: "identical catalog bytes and publish replay keep one digest and publication",
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
