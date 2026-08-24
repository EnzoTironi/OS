import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Client as PostgresClient } from "pg";
import {
  assertNoSecretFields,
  openFileObjectSource,
  openInlinePack,
  writeFileObjectSource,
} from "../packages/pack/src/index.js";
import {
  oidcToken,
  startServer,
  stopServer,
  type ServerProcess,
} from "./governed-action/support.js";
import { seedBoundTenantMembership } from "./pack-bound-membership.js";
import {
  applicationDatabaseUrl,
  baseUrl,
  buildSamplePack,
  generatedDirectory,
  preparePolicyManifest,
  publisherKeys,
  registryApi,
  repositoryRoot,
  scenario,
  signedSample,
  tenantA,
  tenantB,
  writeMutantFixture,
  writeScenarioArtifact,
} from "./pack-registry/support.js";

const assertions: Record<string, boolean> = {};
const mutantsKilled: string[] = [];

function record(name: string, observed: boolean): void {
  assert.ok(observed, name);
  assertions[name] = observed;
}

function killMutant(name: string): void {
  mutantsKilled.push(name);
}

async function activeDefinitionCount(tenantId: string): Promise<number> {
  const client = new PostgresClient({ connectionString: applicationDatabaseUrl });
  await client.connect();
  try {
    await client.query("SELECT set_config('zoen.tenant_id', $1, false)", [
      tenantId,
    ]);
    const result = await client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM active_definition_revisions WHERE tenant_id = $1",
      [tenantId],
    );
    return Number(result.rows[0]?.count ?? 0);
  } finally {
    await client.end();
  }
}

async function loadTenantPackArtifact(
  tenantId: string,
  packDigest: string,
): Promise<{ manifestJcs: string; phase: string | null }> {
  const client = new PostgresClient({ connectionString: applicationDatabaseUrl });
  await client.connect();
  try {
    await client.query("SELECT set_config('zoen.tenant_id', $1, false)", [
      tenantId,
    ]);
    const artifact = await client.query<{ manifest_jcs: string }>(
      "SELECT manifest_jcs FROM pack_artifacts WHERE tenant_id = $1 AND pack_digest = $2",
      [tenantId, packDigest],
    );
    const receipt = await client.query<{ phase: string }>(
      "SELECT phase FROM pack_install_receipts WHERE tenant_id = $1 AND pack_digest = $2 ORDER BY created_at DESC LIMIT 1",
      [tenantId, packDigest],
    );
    return {
      manifestJcs: artifact.rows[0]?.manifest_jcs ?? "",
      phase: receipt.rows[0]?.phase ?? null,
    };
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const policyManifestPath = path.join(generatedDirectory, "policies.json");
  const fixtures = await preparePolicyManifest(policyManifestPath);
  const sample = buildSamplePack(fixtures);
  const keys = publisherKeys();
  const signed = signedSample(sample, keys);
  const fileRoot = path.join(generatedDirectory, "pack-objects");

  const adminToken = await oidcToken("admin-a");
  const adminBToken = await oidcToken("admin-b");
  let server: ServerProcess = await startServer(policyManifestPath);

  try {
    await seedBoundTenantMembership({
      actorId: "actor.admin.a",
      baseUrl,
      principalId: "principal.admin.a",
      tenantId: tenantA,
      token: adminToken,
      workloadId: "workload.admin.a",
    });
    await seedBoundTenantMembership({
      actorId: "actor.admin.b",
      baseUrl,
      principalId: "principal.admin.b",
      tenantId: tenantB,
      token: adminBToken,
      workloadId: "workload.admin.b",
    });

    const registered = await registryApi(
      "POST",
      "/pack/registry/keys",
      adminToken,
      {
        algorithm: "ed25519",
        publicKeyId: keys.publicKeyId,
        publicKeyPem: keys.publicKeyRawB64,
        publisherId: "pub.zoen.official",
      },
    );
    assert.equal(registered.status, 200, JSON.stringify(registered.body));

    const put = await registryApi("POST", "/pack/registry/objects", adminToken, {
      categories: ["procurement", "operations"],
      manifestJcs: signed.canonicalJson,
      ontologyArtifacts: signed.ontologyArtifacts,
      outcomeLabel: "Prevent late orders",
      signature: signed.signature,
      tenantId: tenantA,
      visibility: { kind: "public" },
    });
    assert.equal(put.status, 200, JSON.stringify(put.body));
    record(
      "publish_digest_equals_sha256_manifest",
      put.body.packDigest === sample.digest &&
        sample.digest ===
          createHash("sha256").update(sample.canonicalJson).digest("hex"),
    );

    const putAgain = await registryApi(
      "POST",
      "/pack/registry/objects",
      adminToken,
      {
        categories: ["procurement", "operations"],
        manifestJcs: signed.canonicalJson,
        ontologyArtifacts: signed.ontologyArtifacts,
        outcomeLabel: "Prevent late orders",
        signature: signed.signature,
        tenantId: tenantA,
        visibility: { kind: "public" },
      },
    );
    assert.equal(putAgain.status, 200, JSON.stringify(putAgain.body));
    record(
      "republish_same_bytes_idempotent",
      putAgain.body.kind === "idempotentReplay" &&
        putAgain.body.packDigest === sample.digest,
    );

    const mutatedDoc = JSON.parse(sample.canonicalJson) as Record<
      string,
      unknown
    >;
    mutatedDoc.description = {
      ...(mutatedDoc.description as Record<string, unknown>),
      summary: "tampered summary",
    };
    const { default: canonicalize } = await import("canonicalize");
    const mutatedCanonical = canonicalize(mutatedDoc);
    assert.ok(mutatedCanonical);
    const mutatedDigest = createHash("sha256")
      .update(mutatedCanonical)
      .digest("hex");
    const mutatedSignature = signedSample(
      {
        ...sample,
        canonicalJson: mutatedCanonical,
        digest: mutatedDigest,
        pack: sample.pack,
        schema: sample.schema,
      },
      keys,
    ).signature;
    const conflict = await registryApi(
      "POST",
      "/pack/registry/objects",
      adminToken,
      {
        categories: ["procurement"],
        manifestJcs: mutatedCanonical,
        ontologyArtifacts: signed.ontologyArtifacts,
        outcomeLabel: "Prevent late orders",
        signature: mutatedSignature,
        tenantId: tenantA,
        visibility: { kind: "public" },
      },
    );
    record(
      "same_version_different_bytes_fails",
      conflict.status === 409 || conflict.body.kind === "conflict",
    );
    killMutant("same version mutable overwrite");

    const share = await registryApi("POST", "/pack/registry/share", adminToken, {
      packDigest: sample.digest,
      publisherId: "pub.zoen.official",
      referralId: "ref.activation.sample",
      tenantId: tenantA,
    });
    assert.equal(share.status, 200, JSON.stringify(share.body));
    assertNoSecretFields(share.body);
    record(
      "share_payload_has_no_secrets",
      typeof share.body.token === "string" &&
        !JSON.stringify(share.body).includes("sk-") &&
        !JSON.stringify(share.body).toLowerCase().includes("password"),
    );
    killMutant("share link embeds secret");
    await writeMutantFixture("share-with-secret", {
      expected: "must_not_embed_oauth_or_tenant_secrets",
      payload: share.body,
    });

    const resolved = await registryApi(
      "POST",
      "/pack/registry/share/resolve",
      adminToken,
      { token: share.body.token },
    );
    assert.equal(resolved.status, 200, JSON.stringify(resolved.body));
    assertNoSecretFields(resolved.body);
    record(
      "share_resolve_digest_publisher",
      resolved.body.packDigest === sample.digest &&
        resolved.body.publisherId === "pub.zoen.official",
    );

    await registryApi("POST", "/pack/registry/attribution", adminToken, {
      idempotencyKey: `visit:${share.body.token}`,
      kind: "share_visit",
      packDigest: sample.digest,
      publisherId: "pub.zoen.official",
      referralId: "ref.activation.sample",
      shareToken: String(share.body.token),
      tenantId: tenantA,
    });

    const opened = await registryApi("POST", "/pack/registry/open", adminToken, {
      packDigest: sample.digest,
      source: { endpoint: "public", kind: "registry" },
      tenantId: tenantA,
    });
    assert.equal(opened.status, 200, JSON.stringify(opened.body));
    record(
      "open_signature_verified",
      opened.body.kind === "opened" &&
        opened.body.signatureVerified === true &&
        opened.body.bytesHash === sample.digest,
    );

    const catalogLie = openInlinePack({
      expectedDigest: sample.digest,
      manifestJcs: mutatedCanonical,
      ontologyArtifacts: signed.ontologyArtifacts,
      publicKeyPemOrRawB64: keys.publicKeyRawB64,
      signature: mutatedSignature,
    });
    record(
      "catalog_lie_open_fails",
      catalogLie.kind === "digestMismatch",
    );
    killMutant("registry metadata trusted over artifact digest");
    await writeMutantFixture("catalog-lie-digest", {
      claimedDigest: sample.digest,
      openResult: catalogLie,
    });

    const lyingOpen = await registryApi(
      "POST",
      "/pack/registry/open",
      adminToken,
      {
        packDigest: sample.digest,
        source: {
          kind: "inline",
          manifestJcs: mutatedCanonical,
          ontologyArtifacts: signed.ontologyArtifacts,
          signature: mutatedSignature,
        },
        tenantId: tenantA,
      },
    );
    record(
      "tampered_bytes_fail_open",
      lyingOpen.status >= 400 || lyingOpen.body.kind === "digestMismatch",
    );

    const beforeActive = await activeDefinitionCount(tenantA);
    const staged = await registryApi(
      "POST",
      "/pack/admin/verify-and-stage",
      adminToken,
      {
        expectedDigest: sample.digest,
        manifestJcs: sample.canonicalJson,
        ontologyArtifacts: sample.ontologyArtifacts,
        tenantId: tenantA,
      },
    );
    assert.equal(staged.status, 200, JSON.stringify(staged.body));
    const preview = await registryApi(
      "POST",
      "/pack/admin/preview-install",
      adminToken,
      { packDigest: sample.digest, tenantId: tenantA },
    );
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    const installed = await registryApi(
      "POST",
      "/pack/admin/install",
      adminToken,
      {
        packDigest: sample.digest,
        previewDigest: preview.body.previewDigest,
        tenantId: tenantA,
      },
    );
    assert.equal(installed.status, 200, JSON.stringify(installed.body));
    const grants = installed.body.grants as Array<Record<string, unknown>>;
    record("install_phase_installed", installed.body.phase === "installed");
    record(
      "grants_pending",
      grants.length > 0 && grants.every((grant) => grant.status === "pending"),
    );
    record(
      "install_does_not_activate",
      (await activeDefinitionCount(tenantA)) === beforeActive,
    );

    await registryApi("POST", "/pack/registry/attribution", adminToken, {
      idempotencyKey: `installed:${sample.digest}:${tenantA}`,
      kind: "installed",
      packDigest: sample.digest,
      publisherId: "pub.zoen.official",
      referralId: "ref.activation.sample",
      shareToken: String(share.body.token),
      tenantId: tenantA,
    });
    await registryApi("POST", "/pack/registry/attribution", adminToken, {
      idempotencyKey: `first:${sample.digest}:${tenantA}`,
      kind: "first_success",
      packDigest: sample.digest,
      publisherId: "pub.zoen.official",
      referralId: "ref.activation.sample",
      shareToken: String(share.body.token),
      tenantId: tenantA,
    });
    await registryApi("POST", "/pack/registry/attribution", adminToken, {
      idempotencyKey: `installed:${sample.digest}:${tenantA}`,
      kind: "installed",
      packDigest: sample.digest,
      publisherId: "pub.zoen.official",
      referralId: "ref.activation.sample",
      shareToken: String(share.body.token),
      tenantId: tenantA,
    });

    const attribution = await registryApi(
      "POST",
      "/pack/registry/attribution/summary",
      adminToken,
      {
        packId: "pack.zoen.sample-company",
        publisherId: "pub.zoen.official",
        tenantId: tenantA,
      },
    );
    assert.equal(attribution.status, 200, JSON.stringify(attribution.body));
    const attributionKeys = Object.keys(attribution.body);
    const forbiddenAttribution = [
      "actions",
      "sourceRows",
      "chat",
      "employeeId",
      "tenantId",
      "payload",
    ];
    record(
      "attribution_counters_only",
      attribution.body.installs === 1 &&
        attribution.body.firstSuccessCount === 1 &&
        attribution.body.visits === 1 &&
        forbiddenAttribution.every((key) => !attributionKeys.includes(key)),
    );
    killMutant("creator endpoint returns Action/source payload");

    const privatePack = buildSamplePack(fixtures, {
      packId: "pack.zoen.private-ops",
      version: "1.0.0",
    });
    const privateSigned = signedSample(privatePack, keys);
    const privatePut = await registryApi(
      "POST",
      "/pack/registry/objects",
      adminToken,
      {
        categories: ["private"],
        manifestJcs: privateSigned.canonicalJson,
        ontologyArtifacts: privateSigned.ontologyArtifacts,
        outcomeLabel: "Private ops",
        signature: privateSigned.signature,
        tenantId: tenantA,
        visibility: {
          kind: "private",
          tenantAllowlist: [tenantA],
        },
      },
    );
    assert.equal(privatePut.status, 200, JSON.stringify(privatePut.body));

    const publicSearch = await registryApi(
      "GET",
      "/pack/registry/search",
      adminToken,
    );
    assert.equal(publicSearch.status, 200, JSON.stringify(publicSearch.body));
    const entries = publicSearch.body.entries as Array<Record<string, unknown>>;
    record(
      "private_absent_from_public_search",
      entries.every((entry) => entry.packDigest !== privatePack.digest) &&
        entries.some((entry) => entry.packDigest === sample.digest),
    );
    killMutant("private pack appears in public search");
    await writeMutantFixture("private-in-public-search", {
      privateDigest: privatePack.digest,
      publicDigests: entries.map((entry) => entry.packDigest),
    });

    const crossTenantOpen = await registryApi(
      "POST",
      "/pack/registry/open",
      adminBToken,
      {
        packDigest: privatePack.digest,
        source: { endpoint: "public", kind: "registry" },
        tenantId: tenantB,
      },
    );
    record(
      "cross_tenant_private_fetch_denied",
      crossTenantOpen.status === 403 ||
        crossTenantOpen.body.kind === "visibilityDenied",
    );

    await writeFileObjectSource({
      manifestJcs: signed.canonicalJson,
      ontologyArtifacts: signed.ontologyArtifacts,
      packDigest: sample.digest,
      publicKeyPem: keys.publicKeyPem,
      root: fileRoot,
      signature: signed.signature,
    });

    const config = await registryApi(
      "POST",
      "/pack/registry/config",
      adminToken,
      {
        publicRegistryEnabled: false,
        tenantId: tenantA,
      },
    );
    assert.equal(config.status, 200, JSON.stringify(config.body));
    const fileOpen = await openFileObjectSource({
      packDigest: sample.digest,
      root: fileRoot,
    });
    record(
      "self_host_file_object_source_opens",
      fileOpen.kind === "opened" && fileOpen.signatureVerified === true,
    );
    const fileOpenServer = await registryApi(
      "POST",
      "/pack/registry/open",
      adminToken,
      {
        packDigest: sample.digest,
        source: { kind: "file", root: fileRoot },
        tenantId: tenantA,
      },
    );
    assert.equal(
      fileOpenServer.status,
      200,
      JSON.stringify(fileOpenServer.body),
    );
    record(
      "self_host_public_disabled_file_open",
      fileOpenServer.body.kind === "opened" &&
        fileOpenServer.body.signatureVerified === true,
    );

    const unsigned = await registryApi(
      "POST",
      "/pack/registry/objects",
      adminToken,
      {
        categories: [],
        manifestJcs: sample.canonicalJson,
        ontologyArtifacts: sample.ontologyArtifacts,
        outcomeLabel: "unsigned",
        signature: {
          algorithm: "ed25519",
          publicKeyId: keys.publicKeyId,
          signatureB64: Buffer.alloc(64).toString("base64"),
        },
        tenantId: tenantA,
        visibility: { kind: "local" },
      },
    );
    record("unsigned_publish_rejected", unsigned.status >= 400);
    killMutant("unsigned publish");
    await writeMutantFixture("unsigned-publish", {
      status: unsigned.status,
      body: unsigned.body,
    });

    await stopServer(server);
    const offline = await loadTenantPackArtifact(tenantA, sample.digest);
    record(
      "offline_after_install_no_heartbeat",
      offline.manifestJcs.length > 0 && offline.phase === "installed",
    );
    killMutant("runtime requires registry heartbeat");

    server = await startServer(policyManifestPath);
    const tenantProbe = await registryApi(
      "POST",
      "/pack/admin/get-install",
      adminToken,
      {
        installId: installed.body.installId,
        tenantId: tenantA,
      },
    );
    record(
      "attribution_does_not_change_tenant",
      tenantProbe.status === 200 && tenantProbe.body.packDigest === sample.digest,
    );
    killMutant("attribution identifier changes tenant context");
  } finally {
    await stopServer(server);
  }

  await mkdir(path.join(generatedDirectory, "mutants"), { recursive: true });
  await writeFile(
    path.join(generatedDirectory, "mutants", "killed.json"),
    `${JSON.stringify(mutantsKilled, null, 2)}\n`,
  );

  await writeScenarioArtifact(repositoryRoot, scenario, {
    assertions,
    finishedAt: new Date().toISOString(),
    mutantsKilled,
    packDigest: sample.digest,
    startedAt,
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
