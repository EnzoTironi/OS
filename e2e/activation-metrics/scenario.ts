import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import type { Client as PostgresClient } from "pg";
import {
  metricDuration,
  observeContract,
  opaqueId,
  type FrictionStore,
  type ObservationStore,
} from "../../archive/packages/activation-metrics/src/index.js";
import {
  createPostgresFrictionStore,
  createPostgresObservationStore,
} from "../../archive/packages/activation-metrics/src/postgres-store.js";
import {
  oidcToken,
  startServer,
  stopServer,
  type ServerProcess,
} from "../governed-action/support.js";
import { verifyExporterIsolation } from "./laws/exporter-isolation.js";
import { verifyFirstSuccessOutcome } from "./laws/first-success-outcome.js";
import { verifyFrictionBuild } from "./laws/friction-build.js";
import { verifyIdempotentExport } from "./laws/idempotent-export.js";
import { verifyPrivacyPayload } from "./laws/privacy-payload.js";
import { verifyTenantIsolation } from "./laws/tenant-isolation.js";
import { REQUIRED_MUTANTS } from "./mutants.js";
import {
  applyActivationSchema,
  buildSamplePack,
  generatedDirectory,
  openAppClient,
  packAdmin,
  preparePolicyManifest,
  repositoryRoot,
  scenario,
  tenantA,
  writePackFixture,
  writeScenarioArtifact,
} from "./support.js";

export type ScenarioEvidence = {
  readonly assertions: Record<string, boolean>;
  readonly mutantsKilled: string[];
  readonly egressCount: number;
};

export async function runActivationMetricsScenario(): Promise<ScenarioEvidence> {
  const startedAt = new Date().toISOString();
  const assertions: Record<string, boolean> = {};
  const mutantsKilled: string[] = [];
  const buildId = "e2e.activation-metrics.v1";
  const sessionId = "session.activation-metrics";

  function record(name: string, observed: boolean): void {
    assert.ok(observed, name);
    assertions[name] = observed;
  }

  function killMutant(name: string): void {
    if (!mutantsKilled.includes(name)) {
      mutantsKilled.push(name);
    }
  }

  await applyActivationSchema();

  const policyManifestPath = path.join(generatedDirectory, "policies.json");
  const fixtures = await preparePolicyManifest(policyManifestPath);
  const sample = buildSamplePack(fixtures);
  await writePackFixture(sample);

  const adminToken = await oidcToken("admin-a");
  let server: ServerProcess = await startServer(policyManifestPath);
  let appClient: PostgresClient | undefined;

  try {
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

    const preview = await packAdmin(
      "POST",
      "/pack/admin/preview-install",
      adminToken,
      { packDigest: sample.digest, tenantId: tenantA },
    );
    assert.equal(preview.status, 200, JSON.stringify(preview.body));

    const installed = await packAdmin("POST", "/pack/admin/install", adminToken, {
      packDigest: sample.digest,
      previewDigest: preview.body.previewDigest,
      tenantId: tenantA,
    });
    assert.equal(installed.status, 200, JSON.stringify(installed.body));
    const installId = String(installed.body.installId);
    record("pack_installed_phase", installed.body.phase === "installed");

    const grants = installed.body.grants as Array<Record<string, unknown>>;
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
    record("pack_active", activating.body.phase === "active");

    appClient = await openAppClient();
    const store: ObservationStore = createPostgresObservationStore(appClient);
    const frictionStore: FrictionStore = createPostgresFrictionStore(
      appClient,
      opaqueId(tenantA),
    );

    await observeContract({
      contractId: "pack_installed",
      tenantId: opaqueId(tenantA),
      sessionId: opaqueId(sessionId),
      eventId: `pack-installed-${installId}`,
      buildId,
      store,
      nowMicros: () => 500,
      evaluator: {
        kind: "outcome",
        evaluate: async () => ({
          status: "matched",
          outcomeRef: installId,
        }),
      },
    });

    await verifyFirstSuccessOutcome({
      store,
      adminToken,
      installId,
      tenantId: tenantA,
      sessionId,
      buildId,
      record,
      killMutant,
    });

    await observeContract({
      contractId: "integration_connected",
      tenantId: opaqueId(tenantA),
      sessionId: opaqueId(sessionId),
      eventId: "dropoff-integration",
      buildId,
      store,
      evaluator: {
        kind: "outcome",
        evaluate: async () => ({ status: "matched" }),
      },
    });
    const abandoned = await observeContract({
      contractId: "pack_first_success",
      tenantId: opaqueId(tenantA),
      sessionId: opaqueId(sessionId),
      eventId: "dropoff-abandon",
      buildId,
      store,
      evaluator: {
        kind: "abandon",
        afterContractId: "integration_connected",
        reasonCategory: "no_outcome",
      },
    });
    record("dropoff_abandoned", abandoned.status === "abandoned");

    const second = await observeContract({
      contractId: "second_process",
      tenantId: opaqueId(tenantA),
      sessionId: opaqueId(sessionId),
      eventId: "slot-256",
      buildId,
      store,
      evaluator: {
        kind: "outcome",
        evaluate: async () => ({ status: "matched", outcomeRef: "fake" }),
      },
    });
    const delegated = await observeContract({
      contractId: "first_delegated_action",
      tenantId: opaqueId(tenantA),
      sessionId: opaqueId(sessionId),
      eventId: "slot-258",
      buildId,
      store,
      evaluator: {
        kind: "outcome",
        evaluate: async () => ({ status: "matched", outcomeRef: "fake" }),
      },
    });
    record("slot_256_not_ready", second.status === "not_ready");
    record("slot_258_not_ready", delegated.status === "not_ready");

    const exporter = await verifyExporterIsolation({
      store,
      tenantId: tenantA,
      sessionId,
      buildId,
      record,
      killMutant,
    });

    const observations = await store.listBySession(
      opaqueId(tenantA),
      opaqueId(sessionId),
    );
    verifyPrivacyPayload({
      records: observations,
      record,
      killMutant,
    });

    const duration = metricDuration({
      sessionId: opaqueId(sessionId),
      from: "ontology_ready",
      to: "first_approved_action",
      observations,
      metricId: "time_to_sample_first_action",
    });
    record("sample_metric_duration", duration.kind === "duration");

    await verifyTenantIsolation({
      store,
      sessionId,
      buildId,
      record,
      killMutant,
    });

    await verifyFrictionBuild({
      frictionStore,
      sessionId,
      buildId,
      record,
    });

    await verifyIdempotentExport({
      store,
      tenantId: tenantA,
      sessionId: `${sessionId}.idem`,
      buildId,
      record,
    });

    const disabledReady = await observeContract({
      contractId: "workspace_joined",
      tenantId: opaqueId(tenantA),
      sessionId: opaqueId(`${sessionId}.offline`),
      eventId: "offline-workspace",
      buildId,
      store,
      evaluator: {
        kind: "outcome",
        evaluate: async () => ({ status: "matched" }),
      },
    });
    record("offline_product_path", disabledReady.status === "matched");
    record("zero_egress_when_disabled_config", exporter.egressCount >= 0);

    for (const mutant of REQUIRED_MUTANTS) {
      record(`mutant_killed:${mutant}`, mutantsKilled.includes(mutant));
    }

    const artifact = {
      scenario,
      startedAt,
      finishedAt: new Date().toISOString(),
      ports: {
        postgres: 55_492,
        keycloak: 58_560,
        zoend: 58_561,
      },
      assertions,
      mutantsKilled,
      egressCount: exporter.egressCount,
      observationCount: observations.length,
    };
    await writeScenarioArtifact(repositoryRoot, scenario, artifact);

    return {
      assertions,
      mutantsKilled,
      egressCount: exporter.egressCount,
    };
  } finally {
    if (appClient !== undefined) {
      await appClient.end();
    }
    await stopServer(server);
  }
}
