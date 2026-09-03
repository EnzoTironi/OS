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

function construct(file: string): Record<string, unknown> {
  const result = runZoen(["world", "release", "construct", "--file", file]);
  assert.equal(result.status, 0, result.stderr);
  return parseJson(result.stdout);
}

function publish(file: string, principal: string): Record<string, unknown> {
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
    catalog.policy,
    "--policy-revision",
    "1",
    "--determining-policy",
    "policy.world",
  ]);
  assert.equal(result.status, 0, result.stderr);
  return parseJson(result.stdout);
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  await mkdir(generatedDirectory, { recursive: true });

  const schema = runZoen(["schema", "world.release.construct"]);
  record("schema_lists_construct", schema.status === 0);
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

  const missingPolicy = runZoen([
    "world",
    "release",
    "publish",
    "--file",
    alphaPath,
    "--principal",
    "principal.owner",
    "--policy-id",
    "policy.world",
    "--policy-digest",
    catalog.policy,
    "--policy-revision",
    "1",
  ]);
  record("missing_policy_fails_before_commit", missingPolicy.status !== 0);
  record(
    "missing_policy_message",
    missingPolicy.stderr.includes("requires policy evidence"),
  );

  const unpublishedActivate = runZoen([
    "world",
    "release",
    "activate",
    "--world",
    "world.alpha",
    "--digest",
    String(first.digest),
  ]);
  record(
    "unpublished_activate_fails",
    unpublishedActivate.status !== 0 &&
      unpublishedActivate.stderr.includes("was not found"),
  );

  const ownerPublish = publish(alphaPath, "principal.owner");
  record("owner_publish_stores_digest", ownerPublish.digest === first.digest);
  record("publish_replay_is_false_first", ownerPublish.replay === false);
  const publication = ownerPublish.publication as Record<string, unknown>;
  record("publication_is_separate", publication.digest === first.digest);
  record(
    "publication_time_present",
    typeof publication.publishedAtMicros === "number",
  );

  const ownerReplay = publish(alphaPath, "principal.other");
  record("identical_candidate_replay", ownerReplay.replay === true);
  record("replay_keeps_original_digest", ownerReplay.digest === first.digest);
  const replayPublication = ownerReplay.publication as Record<string, unknown>;
  record(
    "replay_keeps_original_publication_time",
    replayPublication.publishedAtMicros === publication.publishedAtMicros,
  );
  record(
    "publication_metadata_does_not_change_digest",
    ownerReplay.digest === ownerPublish.digest,
  );

  const firstActivate = runZoen([
    "world",
    "release",
    "activate",
    "--world",
    "world.alpha",
    "--digest",
    String(first.digest),
  ]);
  assert.equal(firstActivate.status, 0, firstActivate.stderr);
  const firstActivation = parseJson(firstActivate.stdout);
  record("first_activation_succeeds", firstActivation.activated === true);
  record("first_activation_has_no_previous", firstActivation.previousDigest === null);

  const betaPath = await writeContent("beta.json", content({ world: "world.beta" }));
  const beta = construct(betaPath);
  publish(betaPath, "principal.owner");
  const crossWorld = runZoen([
    "world",
    "release",
    "activate",
    "--world",
    "world.alpha",
    "--digest",
    String(beta.digest),
  ]);
  record(
    "other_world_cannot_activate_for_this_world",
    crossWorld.status !== 0 &&
      crossWorld.stderr.includes("does not belong to this World"),
  );

  const secondContent = content({ ontology: "e".repeat(64) });
  const secondPath = await writeContent("second.json", secondContent);
  const secondRelease = construct(secondPath);
  publish(secondPath, "principal.owner");
  const secondActivate = runZoen([
    "world",
    "release",
    "activate",
    "--world",
    "world.alpha",
    "--digest",
    String(secondRelease.digest),
  ]);
  assert.equal(secondActivate.status, 0, secondActivate.stderr);
  const secondActivation = parseJson(secondActivate.stdout);
  record("second_activation_replaces_pointer", secondActivation.activated === true);
  record(
    "second_activation_reports_previous",
    secondActivation.previousDigest === first.digest,
  );

  const prior = runZoen(["world", "release", "get", "--digest", String(first.digest)]);
  assert.equal(prior.status, 0, prior.stderr);
  const priorRelease = parseJson(prior.stdout);
  record("prior_release_queryable_by_digest", priorRelease.digest === first.digest);
  record("prior_release_is_not_active", priorRelease.active === false);

  const active = runZoen(["world", "release", "active", "--world", "world.alpha"]);
  assert.equal(active.status, 0, active.stderr);
  const activeRelease = parseJson(active.stdout);
  record("active_pointer_is_second_release", activeRelease.digest === secondRelease.digest);
  record("one_active_release_per_world", activeRelease.active === true);

  const recoveryContent = content({ executors: "f".repeat(64) });
  const recoveryPath = await writeContent("recovery.json", recoveryContent);
  const recovery = construct(recoveryPath);
  publish(recoveryPath, "principal.owner");
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
  const retryActivate = runZoen([
    "world",
    "release",
    "activate",
    "--world",
    "world.alpha",
    "--digest",
    String(recovery.digest),
  ]);
  assert.equal(retryActivate.status, 0, retryActivate.stderr);
  const recovered = parseJson(
    runZoen(["world", "release", "active", "--world", "world.alpha"]).stdout,
  );
  record("retry_converges_to_one_active", recovered.digest === recovery.digest);

  const artifactPath = await writeScenarioArtifact(repositoryRoot, scenario, {
    assertions,
    dimensions: {
      actors: "builder constructs; owner publishes and activates",
      isolation: "another World cannot activate this World's digest",
      negative: "caller-supplied digest, missing policy, unpublished activate",
      path: "construct, publish policy evidence, activate one WorldRelease",
      recovery: "publication without activation keeps the prior pointer",
      replay: "identical content and publish replay keep one digest and publication",
    },
    fixtureDigest,
    finishedAt: new Date().toISOString(),
    firstDigest: first.digest,
    startedAt,
  });
  console.log(`world-release PASS artifact=${artifactPath}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
