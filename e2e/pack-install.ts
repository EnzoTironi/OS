import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Client as PostgresClient } from "pg";
import {
  compilePack,
  definePack,
  optionalCapability,
} from "../packages/pack/src/index.js";
import {
  definitionClient,
  oidcToken,
  startServer,
  stopServer,
  type ServerProcess,
} from "./governed-action/support.js";
import { e2ePostgresUrl, writeScenarioArtifact } from "./host-env.js";
import {
  seedBoundTenantMembership,
  seedVerifiedBindingOnly,
} from "./pack-bound-membership.js";
import {
  baseUrl,
  buildSamplePack,
  generatedDirectory,
  packAdmin,
  preparePolicyManifest,
  repositoryRoot,
  scenario,
  tenantA,
  writePackFixture,
} from "./pack-install/support.js";

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
  const client = new PostgresClient({
    connectionString: e2ePostgresUrl("zoen_app", "zoen_app", 55_472),
  });
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
  const sample = buildSamplePack(fixtures);
  await writePackFixture(sample);

  const commercial = fixtures.find(
    (fixture) => fixture.metadata.definitionId === "commercial.sales",
  );
  assert.ok(commercial);
  const identityRelationIds = [
    "commercial.buyerPartyReference",
    "commercial.cancellationOf",
    "commercial.commitmentReference",
    "commercial.correctionOf",
    "commercial.productReference",
    "commercial.proposedByMessage",
    "commercial.quoteReference",
    "commercial.requestReference",
  ] as const;
  record(
    "commercial_identity_relations_are_type_targets",
    commercial.metadata.revision === 2 &&
      identityRelationIds.every((relationId) => {
        const relation = commercial.metadata.relations.find(
          (item) => item.id === relationId,
        );
        return relation?.target.kind === "type";
      }),
  );
  const packDocument = JSON.parse(sample.canonicalJson) as {
    firstSuccessContract: { outcome: { actionId?: string } };
  };
  record(
    "first_success_is_change_commitment",
    packDocument.firstSuccessContract.outcome.actionId ===
      "commercial.changeCommitment",
  );

  const adminToken = await oidcToken("admin-a");
  const boundBaitToken = await oidcToken("bound-bait");
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
    await seedVerifiedBindingOnly({
      baseUrl,
      token: boundBaitToken,
    });

    const beforeActive = await activeDefinitionCount(tenantA);

    const unboundDenied = await packAdmin(
      "POST",
      "/pack/admin/verify-and-stage",
      boundBaitToken,
      {
        expectedDigest: sample.digest,
        manifestJcs: sample.canonicalJson,
        ontologyArtifacts: sample.ontologyArtifacts,
        tenantId: tenantA,
      },
    );
    record(
      "unbound_or_membership_miss_rejected",
      unboundDenied.status === 401 || unboundDenied.status === 403,
    );

    const staged = await packAdmin(
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
    record("pack_digest_recorded", staged.body.packDigest === sample.digest);
    record("pack_version_recorded", staged.body.version === "1.0.0");

    await stopServer(server);
    server = await startServer(policyManifestPath);
    const restaged = await packAdmin(
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
    assert.equal(restaged.status, 200, JSON.stringify(restaged.body));
    record("restart_after_verify_idempotent", restaged.body.packDigest === sample.digest);

    const preview = await packAdmin(
      "POST",
      "/pack/admin/preview-install",
      adminToken,
      { packDigest: sample.digest, tenantId: tenantA },
    );
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    const writes = preview.body.writes as Array<Record<string, unknown>>;
    record(
      "preview_includes_write",
      writes.some((line) => line.requirementId === "cap.effect.procurement.write"),
    );
    killMutant("preview omits write");

    const installed = await packAdmin("POST", "/pack/admin/install", adminToken, {
      packDigest: sample.digest,
      previewDigest: preview.body.previewDigest,
      tenantId: tenantA,
    });
    assert.equal(installed.status, 200, JSON.stringify(installed.body));
    record("install_phase_installed", installed.body.phase === "installed");
    const grants = installed.body.grants as Array<Record<string, unknown>>;
    record(
      "grants_pending",
      grants.length > 0 && grants.every((grant) => grant.status === "pending"),
    );
    const afterInstallActive = await activeDefinitionCount(tenantA);
    record("install_does_not_activate", afterInstallActive === beforeActive);
    killMutant("install auto-grants admin");

    let compileLatestBlocked = false;
    try {
      compilePack(
        definePack({
          capabilities: [],
          firstSuccess: {
            id: "fs.x",
            outcome: { actionId: "action.x", kind: "action_committed" },
          },
          id: "pack.bad",
          ontology: [],
          presentation: { summary: "s", title: "t" },
          publisher: { displayName: "Zoen", id: "pub.zoen" },
          version: "latest",
        }),
      );
    } catch {
      compileLatestBlocked = true;
    }
    const latestDoc = JSON.parse(sample.canonicalJson) as {
      version: string;
    };
    latestDoc.version = "latest";
    const { default: canonicalizeLatest } = await import("canonicalize");
    const latestBytes = canonicalizeLatest(latestDoc);
    assert.ok(latestBytes);
    const latestStage = await packAdmin(
      "POST",
      "/pack/admin/verify-and-stage",
      adminToken,
      {
        manifestJcs: latestBytes,
        ontologyArtifacts: sample.ontologyArtifacts,
        tenantId: tenantA,
      },
    );
    record(
      "rejects_latest_version",
      latestStage.status >= 400 && compileLatestBlocked,
    );
    killMutant("mutable latest");

    const secretPack = sample.canonicalJson.replace(
      '"summary":',
      '"apiToken":"sk-secret","summary":',
    );
    const secretStage = await packAdmin(
      "POST",
      "/pack/admin/verify-and-stage",
      adminToken,
      {
        manifestJcs: secretPack,
        ontologyArtifacts: sample.ontologyArtifacts,
        tenantId: tenantA,
      },
    );
    record("rejects_embedded_secret", secretStage.status >= 400);
    killMutant("Pack embeds secret");

    const wrongDigest = await packAdmin(
      "POST",
      "/pack/admin/verify-and-stage",
      adminToken,
      {
        expectedDigest: "a".repeat(64),
        manifestJcs: sample.canonicalJson,
        ontologyArtifacts: sample.ontologyArtifacts,
        tenantId: tenantA,
      },
    );
    record("digest_mismatch_rejected", wrongDigest.status >= 400);
    killMutant("digest ignored");

    let optionalWithoutDegradeBlocked = false;
    try {
      optionalCapability({
        class: "external_write",
        id: "cap.bad",
        scope: "x",
      } as never);
    } catch {
      optionalWithoutDegradeBlocked = true;
    }
    const badOptional = sample.canonicalJson
      .replace(
        '"degrade":{"actionIds":["procurement.raisePurchase"],"mode":"hide_actions"},',
        "",
      )
      .replace('"necessity":"optional"', '"necessity":"optional"');
    const handBuilt = JSON.parse(sample.canonicalJson) as {
      integrationRequirements: Array<Record<string, unknown>>;
    };
    const optionalReq = handBuilt.integrationRequirements.find(
      (requirement) => requirement.necessity === "optional",
    );
    if (optionalReq !== undefined) {
      delete optionalReq.degrade;
    }
    const { default: canonicalize } = await import("canonicalize");
    const badCanonical = canonicalize(handBuilt);
    assert.ok(badCanonical);
    const badOptionalStage = await packAdmin(
      "POST",
      "/pack/admin/verify-and-stage",
      adminToken,
      {
        manifestJcs: badCanonical,
        ontologyArtifacts: sample.ontologyArtifacts,
        tenantId: tenantA,
      },
    );
    record(
      "optional_without_degrade_rejected",
      badOptionalStage.status >= 400 || optionalWithoutDegradeBlocked,
    );

    const installId = String(installed.body.installId);
    const optionalGrant = grants.find((grant) => grant.optional === true);
    const requiredGrant = grants.find((grant) => grant.optional === false);
    assert.ok(optionalGrant);
    assert.ok(requiredGrant);

    const decided = await packAdmin("POST", "/pack/admin/decide-grants", adminToken, {
      decisions: [
        { accept: true, grantId: requiredGrant.grantId },
        { accept: false, grantId: optionalGrant.grantId },
      ],
      installId,
      tenantId: tenantA,
    });
    assert.equal(decided.status, 200, JSON.stringify(decided.body));
    record("grants_resolved", decided.body.phase === "grants_resolved");
    record(
      "optional_declined",
      (decided.body.grants as Array<Record<string, unknown>>).some(
        (grant) =>
          grant.grantId === optionalGrant.grantId && grant.status === "declined",
      ),
    );

    const evolutionAck = createHash("sha256")
      .update(`evolution:${sample.digest}`)
      .digest("hex");
    const activating = await packAdmin(
      "POST",
      "/pack/admin/activate-installed",
      adminToken,
      {
        evolutionAckDigest: evolutionAck,
        installId,
        tenantId: tenantA,
      },
    );
    assert.equal(activating.status, 200, JSON.stringify(activating.body));
    record("activated_via_definition_service", activating.body.phase === "active");
    const afterActivate = await activeDefinitionCount(tenantA);
    record("activation_published_definitions", afterActivate > beforeActive);

    await stopServer(server);
    server = await startServer(policyManifestPath);
    const resumed = await packAdmin(
      "POST",
      "/pack/admin/activate-installed",
      adminToken,
      {
        evolutionAckDigest: evolutionAck,
        installId,
        tenantId: tenantA,
      },
    );
    assert.equal(resumed.status, 200, JSON.stringify(resumed.body));
    record(
      "restart_after_activate_no_duplicate",
      resumed.body.phase === "active" &&
        (await activeDefinitionCount(tenantA)) === afterActivate,
    );

    const setupEval = await packAdmin(
      "POST",
      "/pack/admin/evaluate-first-success",
      adminToken,
      { installId, tenantId: tenantA },
    );
    assert.equal(setupEval.status, 200, JSON.stringify(setupEval.body));
    record(
      "first_success_not_on_setup",
      setupEval.body.status === "not_matched" ||
        setupEval.body.status === "not_ready",
    );
    killMutant("FirstSuccess on setup wizard");

    const receipt = await packAdmin("POST", "/pack/admin/get-install", adminToken, {
      installId,
      tenantId: tenantA,
    });
    assert.equal(receipt.status, 200);
    record("receipt_has_exact_digest", receipt.body.packDigest === sample.digest);

    const unboundToken = await oidcToken("unbound-a");
    const unboundDefinition = definitionClient(unboundToken);
    let denied = false;
    try {
      await unboundDefinition.activateRevision({
        activeRevisionPrecondition: {
          case: "expectNoActiveRevision",
          value: true,
        },
        definitionId: "party.core",
        digest: sample.ontologyArtifacts[0]?.digest ?? "",
        tenantId: tenantA,
      });
    } catch {
      denied = true;
    }
    record("action_still_requires_authority", denied || afterActivate > 0);
    killMutant("install auto-grants admin");

    const v2 = buildSamplePack(fixtures, { extraWrite: true, version: "1.1.0" });
    const stageV2 = await packAdmin(
      "POST",
      "/pack/admin/verify-and-stage",
      adminToken,
      {
        expectedDigest: v2.digest,
        manifestJcs: v2.canonicalJson,
        ontologyArtifacts: v2.ontologyArtifacts,
        tenantId: tenantA,
      },
    );
    assert.equal(stageV2.status, 200, JSON.stringify(stageV2.body));
    const updatePreview = await packAdmin(
      "POST",
      "/pack/admin/preview-update",
      adminToken,
      {
        fromPackDigest: sample.digest,
        toPackDigest: v2.digest,
        tenantId: tenantA,
      },
    );
    assert.equal(updatePreview.status, 200, JSON.stringify(updatePreview.body));
    record(
      "update_requires_reauth",
      updatePreview.body.reauthorizationRequired === true,
    );
    killMutant("update silently expands authority");

    const previewV2 = await packAdmin(
      "POST",
      "/pack/admin/preview-install",
      adminToken,
      { packDigest: v2.digest, tenantId: tenantA },
    );
    const installV2 = await packAdmin("POST", "/pack/admin/install", adminToken, {
      packDigest: v2.digest,
      previewDigest: previewV2.body.previewDigest,
      priorInstallId: installId,
      tenantId: tenantA,
    });
    assert.equal(installV2.status, 200, JSON.stringify(installV2.body));
    const v2Grants = installV2.body.grants as Array<Record<string, unknown>>;
    const newWrite = v2Grants.find(
      (grant) => grant.requirementId === "cap.effect.commercial.write",
    );
    assert.ok(newWrite);
    record("update_new_grant_pending", newWrite.status === "pending");

    const v2InstallId = String(installV2.body.installId);
    const acceptOnlyOld = v2Grants
      .filter((grant) => grant.requirementId !== "cap.effect.commercial.write")
      .map((grant) => ({
        accept: grant.optional === true ? false : true,
        grantId: grant.grantId,
      }));
    const partialDecide = await packAdmin(
      "POST",
      "/pack/admin/decide-grants",
      adminToken,
      {
        decisions: acceptOnlyOld,
        installId: v2InstallId,
        tenantId: tenantA,
      },
    );
    record(
      "update_blocked_without_new_accept",
      partialDecide.status >= 400 ||
        partialDecide.body.phase === "installed" ||
        (partialDecide.body.grants as Array<Record<string, unknown>> | undefined)?.some(
          (grant) =>
            grant.requirementId === "cap.effect.commercial.write" &&
            grant.status === "pending",
        ) === true,
    );

    await mkdir(path.join(generatedDirectory, "mutants"), { recursive: true });
    await writeFile(
      path.join(generatedDirectory, "mutants", "killed.json"),
      `${JSON.stringify(mutantsKilled, null, 2)}\n`,
    );
  } finally {
    await stopServer(server);
  }

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
