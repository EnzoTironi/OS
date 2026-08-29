import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Client as PostgresClient } from "pg";
import {
  applyCopy,
  assertInspectSourcesAllowed,
  assertPublisherIdentity,
  authorityDigest,
  buildWorkingSetSnapshot,
  extractCandidate,
  proposeCopy,
  runKitchenTests,
  validateCandidate,
} from "../archive/packages/kitchen/src/index.js";
import {
  assertNoSecretFields,
  compilePack,
  definePack,
} from "../archive/packages/pack/src/index.js";
import {
  createMemoryObservationStore,
  observePackFirstSuccess,
  opaqueId,
  type FirstSuccessEvalResult,
} from "../archive/packages/activation-metrics/src/index.js";
import {
  oidcToken,
  startServer,
  stopServer,
  type ServerProcess,
} from "./governed-action/support.js";
import { seedBoundTenantMembership } from "./pack-bound-membership.js";
import {
  api,
  applicationDatabaseUrl,
  baseUrl,
  generatedDirectory,
  preparePolicyManifest,
  publisherDisplayName,
  publisherId,
  publisherKeys,
  repositoryRoot,
  scenario,
  signCandidate,
  tenantCreator,
  tenantFresh,
  writeMutantFixture,
  writeScenarioArtifact,
} from "./pack-kitchen/support.js";

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

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const policyManifestPath = path.join(generatedDirectory, "policies.json");
  const fixtures = await preparePolicyManifest(policyManifestPath);

  let refusedSemanticInspect = false;
  try {
    assertInspectSourcesAllowed(["active_definition_revisions", "semantic_claims"]);
  } catch {
    refusedSemanticInspect = true;
  }
  record("inspect_refuses_semantic_claims", refusedSemanticInspect);
  killMutant("tenant_record_as_template_truth");

  const snapshot = buildWorkingSetSnapshot({
    tenantId: tenantCreator,
    activeDefinitions: fixtures.map((fixture) => ({
      definitionId: fixture.metadata.definitionId,
      digest: fixture.digest,
      revision: String(fixture.metadata.revision),
      canonicalJson: fixture.canonicalJson,
    })),
    inspectSources: ["active_definition_revisions", "definition_revisions"],
  });

  const candidate = extractCandidate({
    snapshot,
    packId: "pack.partner.late-orders",
    version: "1.0.0",
    publisher: { id: publisherId, displayName: publisherDisplayName },
    firstSuccessHint: {
      kind: "action_committed",
      actionId: "commercial.changeCommitment",
    },
    firstSuccessContractId: "sample.first_governed_commitment",
    presentation: {
      title: "Partner Late Orders",
      summary: "Kitchen-extracted Sample Company working set.",
    },
  });

  const report = validateCandidate(candidate, { snapshot });
  record("validate_ok", report.ok);
  record(
    "pack_has_exact_ontology_pins",
    candidate.authority.ontology.length === fixtures.length &&
      candidate.authority.ontology.every((dependency) =>
        fixtures.some(
          (fixture) =>
            fixture.metadata.definitionId === dependency.definitionId &&
            fixture.digest === dependency.digest,
        ),
      ),
  );
  record(
    "permissions_match_derived",
    candidate.authority.capabilities.some(
      (capability) => capability.id === "cap.source.inventory.read",
    ) &&
      candidate.authority.capabilities.some(
        (capability) => capability.id === "cap.effect.procurement.write",
      ),
  );

  const secretProbe = {
    ...JSON.parse(candidate.compiled.canonicalJson),
    apiKey: "sk-secret",
  };
  let secretBlocked = false;
  try {
    assertNoSecretFields(secretProbe);
  } catch {
    secretBlocked = true;
  }
  const secretValidate = validateCandidate({
    ...candidate,
    compiled: {
      ...candidate.compiled,
      canonicalJson: JSON.stringify(secretProbe),
    },
  });
  record(
    "secret_scan_blocks_pack",
    secretBlocked && secretValidate.secretScan.ok === false,
  );
  killMutant("secret_included_in_pack");
  await writeMutantFixture("secret-in-pack", {
    blocked: secretBlocked,
    findings: secretValidate.secretScan.findings,
  });

  const tenantRecordProbe = {
    ...JSON.parse(candidate.compiled.canonicalJson),
    semanticClaim: { employeeId: "emp.1", claimPayload: { salary: 1 } },
  };
  const tenantValidate = validateCandidate({
    ...candidate,
    compiled: {
      ...candidate.compiled,
      canonicalJson: JSON.stringify(tenantRecordProbe),
    },
  });
  record(
    "tenant_record_scan_blocks",
    tenantValidate.tenantRecordScan.ok === false,
  );
  await writeMutantFixture("tenant-record-as-template", {
    findings: tenantValidate.tenantRecordScan.findings,
  });

  let mutableBlocked = false;
  try {
    extractCandidate({
      snapshot,
      packId: "pack.partner.bad",
      version: "latest",
      publisher: { id: publisherId, displayName: publisherDisplayName },
      firstSuccessHint: {
        kind: "action_committed",
        actionId: "commercial.changeCommitment",
      },
    });
  } catch {
    mutableBlocked = true;
  }
  let compileLatestBlocked = false;
  try {
    compilePack(
      definePack({
        ...candidate.authority,
        presentation: { title: "x", summary: "y" },
        version: "latest",
        id: "pack.bad",
        ontology: candidate.authority.ontology,
        capabilities: candidate.authority.capabilities,
        firstSuccess: candidate.authority.firstSuccess,
        publisher: candidate.authority.publisher,
      }),
    );
  } catch {
    compileLatestBlocked = true;
  }
  record(
    "rejects_mutable_hidden_dependency",
    mutableBlocked && compileLatestBlocked,
  );
  killMutant("mutable_hidden_dependency");

  const sealedAuthority = authorityDigest(candidate.authority);
  const proposal = proposeCopy({
    candidateDigest: sealedAuthority,
    title: "Late Order Prevention",
    summary: "Shareable partner pack from a working tenant.",
    onboardingQuestions: [
      {
        id: "q.inventory",
        prompt: "Connect inventory source?",
        relatesToRequirementId: "cap.source.inventory.read",
      },
    ],
  });
  const withCopy = applyCopy(candidate, proposal);
  record(
    "copy_preserves_authority_digest",
    authorityDigest(withCopy.authority) === sealedAuthority,
  );

  let promptWidenBlocked = false;
  try {
    applyCopy(candidate, {
      ...proposal,
      integrationRequirements: [
        {
          kind: "write_effect",
          necessity: "required",
          requirementId: "cap.effect.forged.write",
          scope: "commercial",
          sensitivity: "sensitive",
        },
      ],
    } as never);
  } catch {
    promptWidenBlocked = true;
  }
  record("copy_cannot_add_write_capability", promptWidenBlocked);
  killMutant("prompt_adds_undeclared_write");

  const tests = runKitchenTests(withCopy);
  record("kitchen_tests_pass", tests.ok);

  const keys = publisherKeys();
  const foreignKeys = publisherKeys("key.pub.other.1");
  let wrongPublisherBlocked = false;
  try {
    assertPublisherIdentity({
      authorityPublisherId: withCopy.authority.publisher.id,
      signingPublisherId: "pub.other",
    });
  } catch {
    wrongPublisherBlocked = true;
  }
  record("creator_cannot_publish_as_other", wrongPublisherBlocked);

  const signature = signCandidate(withCopy.compiled.digest, keys);
  const ontologyArtifacts = withCopy.authority.ontology.map((dependency) => ({
    canonicalJson: dependency.canonicalJson,
    definitionId: dependency.definitionId,
    digest: dependency.digest,
  }));

  const adminCreator = await oidcToken("admin-a");
  const adminFresh = await oidcToken("admin-b");
  let server: ServerProcess = await startServer(policyManifestPath);

  let freshInstallId = "";
  let firstSuccessStatus = "not_ready";
  let firstSuccessOutcomeRef = "";

  try {
    await seedBoundTenantMembership({
      actorId: "actor.admin.a",
      baseUrl,
      principalId: "principal.admin.a",
      tenantId: tenantCreator,
      token: adminCreator,
      workloadId: "workload.admin.a",
    });
    await seedBoundTenantMembership({
      actorId: "actor.admin.b",
      baseUrl,
      principalId: "principal.admin.b",
      tenantId: tenantFresh,
      token: adminFresh,
      workloadId: "workload.admin.b",
    });

    const registered = await api("POST", "/pack/registry/keys", adminCreator, {
      algorithm: "ed25519",
      publicKeyId: keys.publicKeyId,
      publicKeyPem: keys.publicKeyRawB64,
      publisherId,
    });
    assert.equal(registered.status, 200, JSON.stringify(registered.body));

    const wrongPut = await api("POST", "/pack/registry/objects", adminCreator, {
      categories: ["operations"],
      manifestJcs: withCopy.compiled.canonicalJson,
      ontologyArtifacts,
      outcomeLabel: "Prevent late orders",
      signature: signCandidate(withCopy.compiled.digest, foreignKeys),
      tenantId: tenantCreator,
      visibility: { kind: "public" },
    });
    record(
      "wrong_key_publish_fails_closed",
      wrongPut.status >= 400 ||
        wrongPut.body.kind === "signatureInvalid" ||
        wrongPut.body.kind === "publisherKeyUnknown",
    );

    const put = await api("POST", "/pack/registry/objects", adminCreator, {
      categories: ["procurement", "operations"],
      manifestJcs: withCopy.compiled.canonicalJson,
      ontologyArtifacts,
      outcomeLabel: "Prevent late orders",
      signature,
      tenantId: tenantCreator,
      visibility: { kind: "public" },
    });
    assert.equal(put.status, 200, JSON.stringify(put.body));
    record(
      "publish_digest_stable",
      put.body.packDigest === withCopy.compiled.digest,
    );

    const opened = await api("POST", "/pack/registry/open", adminFresh, {
      packDigest: withCopy.compiled.digest,
      source: { endpoint: "public", kind: "registry" },
      tenantId: tenantFresh,
    });
    assert.equal(opened.status, 200, JSON.stringify(opened.body));
    record(
      "fresh_open_signature_verified",
      opened.body.kind === "opened" && opened.body.signatureVerified === true,
    );

    const beforeActive = await activeDefinitionCount(tenantFresh);
    const staged = await api("POST", "/pack/admin/verify-and-stage", adminFresh, {
      expectedDigest: withCopy.compiled.digest,
      manifestJcs: withCopy.compiled.canonicalJson,
      ontologyArtifacts,
      tenantId: tenantFresh,
    });
    assert.equal(staged.status, 200, JSON.stringify(staged.body));

    const preview = await api("POST", "/pack/admin/preview-install", adminFresh, {
      packDigest: withCopy.compiled.digest,
      tenantId: tenantFresh,
    });
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    const writes = preview.body.writes as Array<Record<string, unknown>>;
    record(
      "preview_includes_derived_write",
      writes.some(
        (line) => line.requirementId === "cap.effect.procurement.write",
      ),
    );

    const installed = await api("POST", "/pack/admin/install", adminFresh, {
      packDigest: withCopy.compiled.digest,
      previewDigest: preview.body.previewDigest,
      tenantId: tenantFresh,
    });
    assert.equal(installed.status, 200, JSON.stringify(installed.body));
    freshInstallId = String(installed.body.installId);
    const grants = installed.body.grants as Array<Record<string, unknown>>;
    record("fresh_install_phase_installed", installed.body.phase === "installed");
    record(
      "fresh_grants_pending",
      grants.length > 0 && grants.every((grant) => grant.status === "pending"),
    );
    record(
      "fresh_install_does_not_activate",
      (await activeDefinitionCount(tenantFresh)) === beforeActive,
    );

    const optionalGrant = grants.find((grant) => grant.optional === true);
    const requiredGrants = grants.filter((grant) => grant.optional === false);
    assert.ok(requiredGrants.length > 0);
    const decided = await api("POST", "/pack/admin/decide-grants", adminFresh, {
      decisions: [
        ...requiredGrants.map((grant) => ({
          accept: true,
          grantId: grant.grantId,
        })),
        ...(optionalGrant === undefined
          ? []
          : [{ accept: false, grantId: optionalGrant.grantId }]),
      ],
      installId: freshInstallId,
      tenantId: tenantFresh,
    });
    assert.equal(decided.status, 200, JSON.stringify(decided.body));

    const evolutionAck = createHash("sha256")
      .update(`evolution:${withCopy.compiled.digest}`)
      .digest("hex");
    const activated = await api(
      "POST",
      "/pack/admin/activate-installed",
      adminFresh,
      {
        evolutionAckDigest: evolutionAck,
        installId: freshInstallId,
        tenantId: tenantFresh,
      },
    );
    assert.equal(activated.status, 200, JSON.stringify(activated.body));
    record("fresh_activated", activated.body.phase === "active");
    record(
      "fresh_activation_published_definitions",
      (await activeDefinitionCount(tenantFresh)) > beforeActive,
    );

    const setupEval = await api(
      "POST",
      "/pack/admin/evaluate-first-success",
      adminFresh,
      { installId: freshInstallId, tenantId: tenantFresh },
    );
    assert.equal(setupEval.status, 200, JSON.stringify(setupEval.body));
    firstSuccessStatus = String(setupEval.body.status);
    firstSuccessOutcomeRef = String(setupEval.body.outcomeRef ?? "");
    record(
      "first_success_not_on_setup",
      firstSuccessStatus === "not_matched" || firstSuccessStatus === "not_ready",
    );

    const store = createMemoryObservationStore();
    const observation = await observePackFirstSuccess({
      tenantId: opaqueId(tenantFresh),
      sessionId: opaqueId("session.pack-kitchen"),
      installId: freshInstallId,
      eventId: `pack-fs-setup-${freshInstallId}`,
      buildId: "pack-kitchen",
      store,
      evaluate: async (): Promise<FirstSuccessEvalResult> => {
        if (firstSuccessStatus === "matched") {
          return {
            status: "matched",
            outcomeRef: firstSuccessOutcomeRef,
            firedAtMicros: Number(setupEval.body.firedAtMicros),
          };
        }
        if (firstSuccessStatus === "not_ready") {
          return { status: "not_ready" };
        }
        return { status: "not_matched" };
      },
    });
    record(
      "observe_pack_first_success_maps_eval",
      observation.status === firstSuccessStatus ||
        (firstSuccessStatus === "not_matched" &&
          observation.status === "not_matched"),
    );

    const unauthAction = await api(
      "POST",
      "/pack/admin/evaluate-first-success",
      "not-a-token",
      { installId: freshInstallId, tenantId: tenantFresh },
    );
    record(
      "unauthenticated_admin_denied",
      unauthAction.status === 401 || unauthAction.status === 403,
    );
  } finally {
    await stopServer(server);
  }

  await mkdir(path.join(generatedDirectory, "mutants"), { recursive: true });
  await writeFile(
    path.join(generatedDirectory, "mutants", "killed.json"),
    `${JSON.stringify(mutantsKilled, null, 2)}\n`,
  );

  await writeScenarioArtifact(repositoryRoot, scenario, {
    scenario,
    startedAt,
    finishedAt: new Date().toISOString(),
    ports: { postgres: 55_504, keycloak: 58_620, zoend: 58_621 },
    creatorPackDigest: withCopy.compiled.digest,
    freshInstallId,
    firstSuccess: {
      status: firstSuccessStatus,
      outcomeRef: firstSuccessOutcomeRef || undefined,
    },
    assertions,
    mutantsKilled: [
      "secret_included_in_pack",
      "tenant_record_as_template_truth",
      "prompt_adds_undeclared_write",
      "mutable_hidden_dependency",
    ],
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
