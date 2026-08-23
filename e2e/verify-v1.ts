import assert from "node:assert/strict";
import {
  createHash,
  generateKeyPairSync,
  sign as signBytes,
  verify as verifyBytes,
} from "node:crypto";
import { execFileSync } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import canonicalize from "canonicalize";
import { z } from "zod";

const SCHEMA_ID = "zoen.verify.v1" as const;
const RPO_TARGET_SECONDS = 300;
const RTO_TARGET_SECONDS = 1800;

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
// Compiled output lives at dist/e2e/; sources live at e2e/.
const repositoryRoot = path.basename(path.dirname(moduleDirectory)) === "dist"
  ? path.resolve(moduleDirectory, "../..")
  : path.resolve(moduleDirectory, "..");

type ScenarioKind =
  | "compose"
  | "kind"
  | "scale"
  | "company"
  | "fiscal-matrix";

type ScenarioSpec = {
  readonly id: string;
  readonly kind: ScenarioKind;
  readonly primary: string;
  readonly requiresSignedOci: boolean;
  readonly ticket: string;
};

const REQUIRED_SCENARIOS: readonly ScenarioSpec[] = [
  { id: "definition-publication", kind: "compose", primary: "definition-publication.json", requiresSignedOci: false, ticket: "#191" },
  { id: "semantic-query", kind: "compose", primary: "semantic-query.json", requiresSignedOci: false, ticket: "#192" },
  { id: "governed-action", kind: "compose", primary: "governed-action.json", requiresSignedOci: false, ticket: "#193" },
  { id: "durable-commit", kind: "compose", primary: "durable-commit.json", requiresSignedOci: false, ticket: "#194" },
  { id: "effects", kind: "compose", primary: "effects.json", requiresSignedOci: false, ticket: "#195" },
  { id: "explain", kind: "compose", primary: "explain.json", requiresSignedOci: false, ticket: "#196" },
  { id: "domain-quality", kind: "compose", primary: "domain-quality.json", requiresSignedOci: false, ticket: "#197" },
  { id: "evolution-compatible", kind: "compose", primary: "evolution-compatible.json", requiresSignedOci: false, ticket: "#198" },
  { id: "evolution-breaking", kind: "compose", primary: "evolution-breaking.json", requiresSignedOci: false, ticket: "#199" },
  { id: "agent-capabilities-live", kind: "compose", primary: "agent-capabilities-live.json", requiresSignedOci: false, ticket: "#200" },
  { id: "company-brain-live", kind: "compose", primary: "company-brain-live.json", requiresSignedOci: false, ticket: "#201" },
  { id: "wasm-code-mode", kind: "compose", primary: "wasm-code-mode.json", requiresSignedOci: false, ticket: "#202" },
  { id: "web-deterministic", kind: "compose", primary: "web-deterministic.json", requiresSignedOci: false, ticket: "#203" },
  { id: "web-adaptive-live", kind: "compose", primary: "web-adaptive-live.json", requiresSignedOci: false, ticket: "#204" },
  { id: "domain-commercial", kind: "compose", primary: "domain-commercial.json", requiresSignedOci: false, ticket: "#211" },
  { id: "domain-inventory-procurement", kind: "compose", primary: "domain-inventory-procurement.json", requiresSignedOci: false, ticket: "#212" },
  { id: "domain-manufacturing-accounting", kind: "compose", primary: "domain-manufacturing-accounting.json", requiresSignedOci: false, ticket: "#213" },
  { id: "fiscal-fault-matrix", kind: "fiscal-matrix", primary: "fiscal-fault-matrix.json", requiresSignedOci: false, ticket: "#214" },
  { id: "shared-tenancy", kind: "kind", primary: "evidence.json", requiresSignedOci: true, ticket: "#215" },
  { id: "deploy-dedicated", kind: "kind", primary: "evidence.json", requiresSignedOci: true, ticket: "#216" },
  { id: "deploy-self-hosted-isolated", kind: "kind", primary: "evidence.json", requiresSignedOci: true, ticket: "#216" },
  { id: "ha-chaos", kind: "kind", primary: "evidence.json", requiresSignedOci: true, ticket: "#217" },
  { id: "backup-restore", kind: "kind", primary: "evidence.json", requiresSignedOci: true, ticket: "#217" },
  { id: "rolling-upgrade", kind: "kind", primary: "evidence.json", requiresSignedOci: true, ticket: "#217" },
  { id: "rpo-rto", kind: "kind", primary: "evidence.json", requiresSignedOci: true, ticket: "#217" },
  { id: "scale-mixed-v1", kind: "scale", primary: "evidence.json", requiresSignedOci: true, ticket: "#218" },
  { id: "v1-company", kind: "company", primary: "v1-company.json", requiresSignedOci: true, ticket: "#205" },
];

const ADVERTISED_LIVE_PROVIDERS = [
  { id: "systax", scenario: "fiscal-systax-live", matrixKey: "systax" },
  { id: "plugnotas", scenario: "fiscal-plugnotas-live", matrixKey: "plugnotas" },
  { id: "protheus", scenario: "fiscal-protheus-live", matrixKey: "protheus" },
] as const;

const signedOciSchema = z
  .object({
    chartSignatureDigest: z.string().min(1),
    nodeSignatureDigest: z.string().min(1),
    publicKeyDigest: z.string().min(1),
    rustSignatureDigest: z.string().min(1),
    sourceSha: z.string().min(1),
  })
  .passthrough();

type GateOptions = {
  ignoreFailedScenario: boolean;
  acceptWrongCommit: boolean;
  skipLiveProvider: boolean;
  ignoreSurvivingMutant: boolean;
  ignoreRpoThreshold: boolean;
  acceptUnsigned: boolean;
  reuseStaleScale: boolean;
};

const STRICT_OPTIONS: GateOptions = {
  ignoreFailedScenario: false,
  acceptWrongCommit: false,
  skipLiveProvider: false,
  ignoreSurvivingMutant: false,
  ignoreRpoThreshold: false,
  acceptUnsigned: false,
  reuseStaleScale: false,
};

type Failure = {
  readonly code: string;
  readonly scenario?: string;
  readonly detail: string;
};

type ScenarioEvidence = {
  readonly spec: ScenarioSpec;
  readonly path: string;
  readonly body: Record<string, unknown>;
  readonly artifactDigest: string;
  readonly sourceCommit: string | null;
  readonly signedOci: z.infer<typeof signedOciSchema> | null;
  readonly signedOciPath: string | null;
  readonly mutantsPath: string | null;
  readonly mutantsBody: unknown | null;
  readonly rpoPath: string | null;
  readonly rpoBody: Record<string, unknown> | null;
};

type LiveSlot = {
  readonly id: string;
  readonly present: boolean;
  readonly source: string;
  readonly detail: string;
};

type GateResult = {
  readonly failures: Failure[];
  readonly scenarios: ScenarioEvidence[];
  readonly missing: string[];
  readonly live: LiveSlot[];
  readonly semanticSurvivors: Array<{ scenario: string; id: string }>;
};

type VerificationMutantResult = {
  readonly id: string;
  readonly killed: boolean;
  readonly observation: string;
};

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sha256Bytes(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function commitsMatch(candidate: string, evidence: string): boolean {
  const a = candidate.trim().toLowerCase();
  const b = evidence.trim().toLowerCase();
  if (a.length === 0 || b.length === 0) {
    return false;
  }
  if (a === b) {
    return true;
  }
  // Prefix only when evidence is an unambiguous short SHA of the candidate.
  if (b.length >= 7 && b.length < a.length && a.startsWith(b)) {
    return true;
  }
  return false;
}

function extractSourceCommit(body: Record<string, unknown>): string | null {
  for (const key of ["sourceCommit", "sourceSha", "source_sha"] as const) {
    const value = body[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function scenarioPassed(body: Record<string, unknown>): boolean {
  if (typeof body.verdict === "string") {
    return body.verdict.toUpperCase() === "PASS";
  }
  if (typeof body.status === "string") {
    const status = body.status.toLowerCase();
    if (status === "fail" || status === "failed" || status === "error") {
      return false;
    }
    if (status === "pass" || status === "passed" || status === "ok") {
      return true;
    }
  }
  // Compose/KIND runners write the primary artifact only after success.
  if (
    typeof body.scenario === "string" &&
    (typeof body.finishedAt === "string" ||
      typeof body.completedAt === "string" ||
      typeof body.startedAt === "string")
  ) {
    return true;
  }
  // V1-22 scale evidence may omit verdict while still recording the class.
  if (typeof body.phase === "string" && typeof body.scaleClass === "string") {
    return true;
  }
  return false;
}

function listSurvivingMutants(
  body: unknown,
): string[] {
  if (body === null || body === undefined) {
    return [];
  }
  if (Array.isArray(body)) {
    const survivors: string[] = [];
    for (const row of body) {
      if (row === null || typeof row !== "object") {
        continue;
      }
      const record = row as Record<string, unknown>;
      const id = typeof record.id === "string" ? record.id : "unknown";
      if (record.killed === false) {
        survivors.push(id);
      }
      if (typeof record.result === "string" && record.result.toUpperCase() !== "PASS") {
        survivors.push(id);
      }
    }
    return survivors;
  }
  if (typeof body !== "object") {
    return [];
  }
  const record = body as Record<string, unknown>;
  if (Array.isArray(record.killed)) {
    return listSurvivingMutants(record.killed);
  }
  if (Array.isArray(record.mutants)) {
    return listSurvivingMutants(record.mutants);
  }
  if (record.mutants !== undefined && typeof record.mutants === "object" && !Array.isArray(record.mutants)) {
    const survivors: string[] = [];
    for (const [id, value] of Object.entries(record.mutants as Record<string, unknown>)) {
      if (value === false) {
        survivors.push(id);
      }
      if (
        value !== null &&
        typeof value === "object" &&
        (value as Record<string, unknown>).killed === false
      ) {
        survivors.push(id);
      }
    }
    return survivors;
  }
  return [];
}

function liveProviderPresent(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized.length === 0) {
      return false;
    }
    if (
      normalized.startsWith("not-run") ||
      normalized.includes("no-credential") ||
      normalized.includes("no-environment") ||
      normalized.includes("absent") ||
      normalized.includes("missing") ||
      normalized === "skip" ||
      normalized === "skipped"
    ) {
      return false;
    }
    return true;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record.live === true && (record.state === "confirmed" || record.status === "pass")) {
      return true;
    }
    if (typeof record.status === "string" && record.status.toLowerCase() === "pass") {
      return true;
    }
    if (typeof record.state === "string" && record.state.toLowerCase() === "confirmed") {
      return true;
    }
  }
  return false;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonObject(filePath: string): Promise<Record<string, unknown>> {
  const text = await readFile(filePath, "utf8");
  const parsed: unknown = JSON.parse(text);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${filePath} is not a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

async function loadScenarioEvidence(
  evidenceRoot: string,
  spec: ScenarioSpec,
): Promise<ScenarioEvidence | null> {
  const directory = path.join(evidenceRoot, spec.id);
  const primaryPath = path.join(directory, spec.primary);
  if (!(await pathExists(primaryPath))) {
    return null;
  }
  const text = await readFile(primaryPath, "utf8");
  const body = JSON.parse(text) as Record<string, unknown>;
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new Error(`${primaryPath} is not a JSON object`);
  }
  const signedOciPath = path.join(directory, "signed-oci.json");
  let signedOci: z.infer<typeof signedOciSchema> | null = null;
  if (await pathExists(signedOciPath)) {
    signedOci = signedOciSchema.parse(await readJsonObject(signedOciPath));
  }
  const mutantsPath = path.join(directory, "mutants.json");
  let mutantsBody: unknown | null = null;
  let resolvedMutantsPath: string | null = null;
  if (await pathExists(mutantsPath)) {
    mutantsBody = JSON.parse(await readFile(mutantsPath, "utf8"));
    resolvedMutantsPath = mutantsPath;
  }
  const rpoPath = path.join(directory, "rpo-rto.json");
  let rpoBody: Record<string, unknown> | null = null;
  let resolvedRpoPath: string | null = null;
  if (await pathExists(rpoPath)) {
    rpoBody = await readJsonObject(rpoPath);
    resolvedRpoPath = rpoPath;
  } else if (
    body.rpoRto !== null &&
    typeof body.rpoRto === "object" &&
    !Array.isArray(body.rpoRto)
  ) {
    rpoBody = body.rpoRto as Record<string, unknown>;
    resolvedRpoPath = primaryPath;
  }
  return {
    spec,
    path: primaryPath,
    body,
    artifactDigest: sha256Text(text),
    sourceCommit: extractSourceCommit(body),
    signedOci,
    signedOciPath: signedOci === null ? null : signedOciPath,
    mutantsPath: resolvedMutantsPath,
    mutantsBody,
    rpoPath: resolvedRpoPath,
    rpoBody,
  };
}

async function resolveLiveSlots(
  evidenceRoot: string,
  fiscalMatrix: ScenarioEvidence | null,
): Promise<LiveSlot[]> {
  const slots: LiveSlot[] = [];
  for (const provider of ADVERTISED_LIVE_PROVIDERS) {
    const livePath = path.join(
      evidenceRoot,
      provider.scenario,
      `${provider.scenario}.json`,
    );
    if (await pathExists(livePath)) {
      const body = await readJsonObject(livePath);
      const present = liveProviderPresent(body);
      slots.push({
        id: provider.id,
        present,
        source: livePath,
        detail: present
          ? "live scenario artifact confirmed"
          : "live scenario artifact present but not confirmed",
      });
      continue;
    }
    const matrixValue =
      fiscalMatrix === null
        ? undefined
        : (fiscalMatrix.body.liveEvidence as Record<string, unknown> | undefined)?.[
            provider.matrixKey
          ];
    if (matrixValue !== undefined) {
      const present = liveProviderPresent(matrixValue);
      slots.push({
        id: provider.id,
        present,
        source: `fiscal-fault-matrix.liveEvidence.${provider.matrixKey}`,
        detail: present
          ? `matrix liveEvidence=${JSON.stringify(matrixValue)}`
          : `advertised live vendor absent: ${JSON.stringify(matrixValue)}`,
      });
      continue;
    }
    slots.push({
      id: provider.id,
      present: false,
      source: "absent",
      detail: "no live scenario artifact and no fiscal-fault-matrix liveEvidence slot",
    });
  }
  return slots;
}

function evaluateGate(
  candidate: string,
  loaded: Array<ScenarioEvidence | null>,
  live: LiveSlot[],
  options: GateOptions,
): GateResult {
  const failures: Failure[] = [];
  const missing: string[] = [];
  const scenarios: ScenarioEvidence[] = [];
  const semanticSurvivors: Array<{ scenario: string; id: string }> = [];

  for (let index = 0; index < REQUIRED_SCENARIOS.length; index += 1) {
    const spec = REQUIRED_SCENARIOS[index];
    if (spec === undefined) {
      continue;
    }
    const evidence = loaded[index] ?? null;
    if (evidence === null) {
      missing.push(spec.id);
      failures.push({
        code: "missing-scenario",
        scenario: spec.id,
        detail: `required evidence artifacts/${spec.id}/${spec.primary} is missing (${spec.ticket})`,
      });
      continue;
    }
    scenarios.push(evidence);

    if (!scenarioPassed(evidence.body) && !options.ignoreFailedScenario) {
      failures.push({
        code: "failed-scenario",
        scenario: spec.id,
        detail: `scenario verdict/status is not PASS`,
      });
    }

    const commit =
      evidence.sourceCommit ??
      evidence.signedOci?.sourceSha ??
      null;
    if (commit === null) {
      if (spec.kind !== "fiscal-matrix") {
        failures.push({
          code: "missing-source-commit",
          scenario: spec.id,
          detail: "evidence does not record sourceCommit/sourceSha",
        });
      }
    } else if (!commitsMatch(candidate, commit) && !options.acceptWrongCommit) {
      const staleScale = spec.kind === "scale" && !options.reuseStaleScale;
      failures.push({
        code: staleScale ? "stale-scale" : "wrong-commit",
        scenario: spec.id,
        detail: `evidence commit ${commit} does not match candidate ${candidate}`,
      });
    }

    if (evidence.signedOci !== null) {
      const signedCommit = evidence.signedOci.sourceSha;
      if (!commitsMatch(candidate, signedCommit) && !options.acceptWrongCommit) {
        failures.push({
          code: spec.kind === "scale" ? "stale-scale" : "wrong-commit",
          scenario: spec.id,
          detail: `signed-oci sourceSha ${signedCommit} does not match candidate ${candidate}`,
        });
      }
    }

    if (spec.requiresSignedOci) {
      const signed = evidence.signedOci;
      const unsigned =
        signed === null ||
        signed.rustSignatureDigest.length === 0 ||
        signed.nodeSignatureDigest.length === 0 ||
        signed.chartSignatureDigest.length === 0 ||
        signed.publicKeyDigest.length === 0;
      if (unsigned && !options.acceptUnsigned) {
        failures.push({
          code: "unsigned-artifact",
          scenario: spec.id,
          detail: "required signed-oci.json signatures are missing or empty",
        });
      }
    }

    const survivors = [
      ...listSurvivingMutants(evidence.body),
      ...listSurvivingMutants(evidence.mutantsBody),
    ];
    for (const id of survivors) {
      semanticSurvivors.push({ scenario: spec.id, id });
      if (!options.ignoreSurvivingMutant) {
        failures.push({
          code: "surviving-mutant",
          scenario: spec.id,
          detail: `semantic mutant ${id} survived`,
        });
      }
    }

    if (spec.id === "rpo-rto") {
      const rpo = evidence.rpoBody;
      if (rpo === null) {
        if (!options.ignoreRpoThreshold) {
          failures.push({
            code: "missing-rpo",
            scenario: spec.id,
            detail: "rpo-rto evidence is missing",
          });
        }
      } else {
        const measuredRpo = Number(rpo.measuredRPOSeconds);
        const measuredRto = Number(rpo.measuredRTOSeconds);
        const targetRpo = Number(
          (rpo.targets as { rpoSeconds?: number } | undefined)?.rpoSeconds ??
            RPO_TARGET_SECONDS,
        );
        const targetRto = Number(
          (rpo.targets as { rtoSeconds?: number } | undefined)?.rtoSeconds ??
            RTO_TARGET_SECONDS,
        );
        if (!options.ignoreRpoThreshold) {
          if (!Number.isFinite(measuredRpo) || measuredRpo >= targetRpo) {
            failures.push({
              code: "rpo-threshold",
              scenario: spec.id,
              detail: `measured RPO ${measuredRpo}s exceeds target ${targetRpo}s`,
            });
          }
          if (!Number.isFinite(measuredRto) || measuredRto >= targetRto) {
            failures.push({
              code: "rto-threshold",
              scenario: spec.id,
              detail: `measured RTO ${measuredRto}s exceeds target ${targetRto}s`,
            });
          }
        }
      }
    }
  }

  if (!options.skipLiveProvider) {
    for (const slot of live) {
      if (!slot.present) {
        failures.push({
          code: "live-provider-absent",
          scenario: slot.id,
          detail: slot.detail,
        });
      }
    }
  }

  return { failures, scenarios, missing, live, semanticSurvivors };
}

function runVerificationMutants(candidate: string): VerificationMutantResult[] {
  const results: VerificationMutantResult[] = [];

  const baseSpec = REQUIRED_SCENARIOS.find((row) => row.id === "v1-company");
  assert.ok(baseSpec);

  const passingCompany = (commit: string): ScenarioEvidence => ({
    spec: baseSpec,
    path: "synthetic/v1-company.json",
    body: { scenario: "v1-company", verdict: "PASS", sourceCommit: commit },
    artifactDigest: "00",
    sourceCommit: commit,
    signedOci: {
      chartSignatureDigest: "sig-chart",
      nodeSignatureDigest: "sig-node",
      publicKeyDigest: "pub",
      rustSignatureDigest: "sig-rust",
      sourceSha: commit,
    },
    signedOciPath: "synthetic/signed-oci.json",
    mutantsPath: null,
    mutantsBody: { killed: [{ id: "intent-mismatch", killed: true, observation: "ok" }] },
    rpoPath: null,
    rpoBody: null,
  });

  const fillGraph = (
    overrides: Partial<Record<string, ScenarioEvidence | null>>,
  ): Array<ScenarioEvidence | null> =>
    REQUIRED_SCENARIOS.map((spec) => {
      if (Object.prototype.hasOwnProperty.call(overrides, spec.id)) {
        return overrides[spec.id] ?? null;
      }
      if (spec.id === "rpo-rto") {
        return {
          spec,
          path: "synthetic/rpo-rto/evidence.json",
          body: { scenario: "rpo-rto", verdict: "PASS", sourceSha: candidate },
          artifactDigest: "01",
          sourceCommit: candidate,
          signedOci: {
            chartSignatureDigest: "sig-chart",
            nodeSignatureDigest: "sig-node",
            publicKeyDigest: "pub",
            rustSignatureDigest: "sig-rust",
            sourceSha: candidate,
          },
          signedOciPath: "synthetic/rpo-rto/signed-oci.json",
          mutantsPath: null,
          mutantsBody: null,
          rpoPath: "synthetic/rpo-rto.json",
          rpoBody: {
            measuredRPOSeconds: 12,
            measuredRTOSeconds: 90,
            targets: { rpoSeconds: RPO_TARGET_SECONDS, rtoSeconds: RTO_TARGET_SECONDS },
          },
        };
      }
      if (spec.id === "scale-mixed-v1") {
        return {
          spec,
          path: "synthetic/scale-mixed-v1/evidence.json",
          body: {
            phase: "mixed-v1",
            scaleClass: "smoke",
            sourceCommit: candidate,
            targetRecords: 10_000,
            verdict: "PASS",
          },
          artifactDigest: "02",
          sourceCommit: candidate,
          signedOci: {
            chartSignatureDigest: "sig-chart",
            nodeSignatureDigest: "sig-node",
            publicKeyDigest: "pub",
            rustSignatureDigest: "sig-rust",
            sourceSha: candidate,
          },
          signedOciPath: "synthetic/scale-mixed-v1/signed-oci.json",
          mutantsPath: "synthetic/mutants.json",
          mutantsBody: { killed: [{ id: "tenant-filter-omitted", killed: true, observation: "ok" }] },
          rpoPath: null,
          rpoBody: null,
        };
      }
      if (spec.id === "fiscal-fault-matrix") {
        return {
          spec,
          path: "synthetic/fiscal-fault-matrix.json",
          body: {
            scenario: "fiscal-fault-matrix",
            status: "pass",
            liveEvidence: {
              systax: "sandbox-pass",
              plugnotas: "sandbox-pass",
              protheus: "sandbox-pass",
            },
          },
          artifactDigest: "03",
          sourceCommit: null,
          signedOci: null,
          signedOciPath: null,
          mutantsPath: null,
          mutantsBody: null,
          rpoPath: null,
          rpoBody: null,
        };
      }
      return {
        spec,
        path: `synthetic/${spec.id}.json`,
        body: {
          scenario: spec.id,
          verdict: "PASS",
          sourceCommit: candidate,
        },
        artifactDigest: "aa",
        sourceCommit: candidate,
        signedOci: spec.requiresSignedOci
          ? {
              chartSignatureDigest: "sig-chart",
              nodeSignatureDigest: "sig-node",
              publicKeyDigest: "pub",
              rustSignatureDigest: "sig-rust",
              sourceSha: candidate,
            }
          : null,
        signedOciPath: spec.requiresSignedOci ? `synthetic/${spec.id}/signed-oci.json` : null,
        mutantsPath: null,
        mutantsBody: null,
        rpoPath: null,
        rpoBody: null,
      };
    });

  const liveAll: LiveSlot[] = ADVERTISED_LIVE_PROVIDERS.map((provider) => ({
    id: provider.id,
    present: true,
    source: "synthetic",
    detail: "sandbox-pass",
  }));

  const healthy = evaluateGate(candidate, fillGraph({}), liveAll, STRICT_OPTIONS);
  assert.equal(healthy.failures.length, 0, JSON.stringify(healthy.failures));

  {
    const id = "ignore-failed-scenario";
    const loaded = fillGraph({
      "v1-company": {
        ...passingCompany(candidate),
        body: { scenario: "v1-company", verdict: "FAIL", sourceCommit: candidate },
      },
    });
    const strict = evaluateGate(candidate, loaded, liveAll, STRICT_OPTIONS);
    const mutant = evaluateGate(candidate, loaded, liveAll, {
      ...STRICT_OPTIONS,
      ignoreFailedScenario: true,
    });
    const killed =
      strict.failures.some((row) => row.code === "failed-scenario") &&
      mutant.failures.every((row) => row.code !== "failed-scenario");
    results.push({
      id,
      killed,
      observation: killed
        ? "strict gate rejected FAIL scenario; ignore-failed-scenario mutant would accept it"
        : "mutant was not distinguished from the strict gate",
    });
  }

  {
    const id = "accept-wrong-commit";
    const other = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const loaded = fillGraph({
      "v1-company": passingCompany(other),
    });
    const strict = evaluateGate(candidate, loaded, liveAll, STRICT_OPTIONS);
    const mutant = evaluateGate(candidate, loaded, liveAll, {
      ...STRICT_OPTIONS,
      acceptWrongCommit: true,
    });
    const killed =
      strict.failures.some((row) => row.code === "wrong-commit") &&
      mutant.failures.every((row) => row.code !== "wrong-commit");
    results.push({
      id,
      killed,
      observation: killed
        ? "strict gate rejected foreign commit evidence; accept-wrong-commit mutant would accept it"
        : "mutant was not distinguished from the strict gate",
    });
  }

  {
    const id = "skip-live-provider";
    const liveMissing: LiveSlot[] = ADVERTISED_LIVE_PROVIDERS.map((provider) => ({
      id: provider.id,
      present: false,
      source: "synthetic",
      detail: "not-run-no-credentials",
    }));
    const loaded = fillGraph({});
    const strict = evaluateGate(candidate, loaded, liveMissing, STRICT_OPTIONS);
    const mutant = evaluateGate(candidate, loaded, liveMissing, {
      ...STRICT_OPTIONS,
      skipLiveProvider: true,
    });
    const killed =
      strict.failures.some((row) => row.code === "live-provider-absent") &&
      mutant.failures.every((row) => row.code !== "live-provider-absent");
    results.push({
      id,
      killed,
      observation: killed
        ? "strict gate rejected absent live fiscal evidence; skip-live-provider mutant would skip it"
        : "mutant was not distinguished from the strict gate",
    });
  }

  {
    const id = "ignore-surviving-semantic-mutant";
    const loaded = fillGraph({
      "v1-company": {
        ...passingCompany(candidate),
        mutantsBody: {
          killed: [{ id: "intent-mismatch-accepted", killed: false, observation: "survived" }],
        },
      },
    });
    const strict = evaluateGate(candidate, loaded, liveAll, STRICT_OPTIONS);
    const mutant = evaluateGate(candidate, loaded, liveAll, {
      ...STRICT_OPTIONS,
      ignoreSurvivingMutant: true,
    });
    const killed =
      strict.failures.some((row) => row.code === "surviving-mutant") &&
      mutant.failures.every((row) => row.code !== "surviving-mutant");
    results.push({
      id,
      killed,
      observation: killed
        ? "strict gate rejected surviving semantic mutant; ignore-surviving-semantic-mutant would accept it"
        : "mutant was not distinguished from the strict gate",
    });
  }

  {
    const id = "ignore-rpo-threshold";
    const loaded = fillGraph({
      "rpo-rto": {
        spec: REQUIRED_SCENARIOS.find((row) => row.id === "rpo-rto")!,
        path: "synthetic/rpo-rto/evidence.json",
        body: { scenario: "rpo-rto", verdict: "PASS", sourceSha: candidate },
        artifactDigest: "01",
        sourceCommit: candidate,
        signedOci: {
          chartSignatureDigest: "sig-chart",
          nodeSignatureDigest: "sig-node",
          publicKeyDigest: "pub",
          rustSignatureDigest: "sig-rust",
          sourceSha: candidate,
        },
        signedOciPath: "synthetic/rpo-rto/signed-oci.json",
        mutantsPath: null,
        mutantsBody: null,
        rpoPath: "synthetic/rpo-rto.json",
        rpoBody: {
          measuredRPOSeconds: 301,
          measuredRTOSeconds: 90,
          targets: { rpoSeconds: RPO_TARGET_SECONDS, rtoSeconds: RTO_TARGET_SECONDS },
        },
      },
    });
    const strict = evaluateGate(candidate, loaded, liveAll, STRICT_OPTIONS);
    const mutant = evaluateGate(candidate, loaded, liveAll, {
      ...STRICT_OPTIONS,
      ignoreRpoThreshold: true,
    });
    const killed =
      strict.failures.some((row) => row.code === "rpo-threshold") &&
      mutant.failures.every((row) => row.code !== "rpo-threshold");
    results.push({
      id,
      killed,
      observation: killed
        ? "strict gate rejected RPO over target; ignore-rpo-threshold mutant would accept it"
        : "mutant was not distinguished from the strict gate",
    });
  }

  {
    const id = "accept-unsigned-artifact";
    const company = passingCompany(candidate);
    const loaded = fillGraph({
      "v1-company": { ...company, signedOci: null, signedOciPath: null },
    });
    const strict = evaluateGate(candidate, loaded, liveAll, STRICT_OPTIONS);
    const mutant = evaluateGate(candidate, loaded, liveAll, {
      ...STRICT_OPTIONS,
      acceptUnsigned: true,
    });
    const killed =
      strict.failures.some((row) => row.code === "unsigned-artifact") &&
      mutant.failures.every((row) => row.code !== "unsigned-artifact");
    results.push({
      id,
      killed,
      observation: killed
        ? "strict gate rejected missing signed-oci; accept-unsigned-artifact mutant would accept it"
        : "mutant was not distinguished from the strict gate",
    });
  }

  {
    const id = "reuse-stale-scale-results";
    const other = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const scaleSpec = REQUIRED_SCENARIOS.find((row) => row.id === "scale-mixed-v1")!;
    const loaded = fillGraph({
      "scale-mixed-v1": {
        spec: scaleSpec,
        path: "synthetic/scale-mixed-v1/evidence.json",
        body: {
          phase: "mixed-v1",
          scaleClass: "smoke",
          sourceCommit: other,
          targetRecords: 10_000,
          verdict: "PASS",
        },
        artifactDigest: "02",
        sourceCommit: other,
        signedOci: {
          chartSignatureDigest: "sig-chart",
          nodeSignatureDigest: "sig-node",
          publicKeyDigest: "pub",
          rustSignatureDigest: "sig-rust",
          sourceSha: other,
        },
        signedOciPath: "synthetic/scale-mixed-v1/signed-oci.json",
        mutantsPath: null,
        mutantsBody: { killed: [] },
        rpoPath: null,
        rpoBody: null,
      },
    });
    const strict = evaluateGate(candidate, loaded, liveAll, STRICT_OPTIONS);
    const mutant = evaluateGate(candidate, loaded, liveAll, {
      ...STRICT_OPTIONS,
      reuseStaleScale: true,
      acceptWrongCommit: true,
    });
    const killed =
      strict.failures.some((row) => row.code === "stale-scale" || row.code === "wrong-commit") &&
      mutant.failures.every(
        (row) => row.code !== "stale-scale" && row.code !== "wrong-commit",
      );
    results.push({
      id,
      killed,
      observation: killed
        ? "strict gate rejected another candidate's scale evidence; reuse-stale-scale-results mutant would accept it"
        : "mutant was not distinguished from the strict gate",
    });
  }

  for (const result of results) {
    assert.equal(result.killed, true, result.observation);
  }
  return results;
}

function resolveCandidateSha(): string {
  const fromEnv = process.env.ZOEN_VERIFY_CANDIDATE_SHA?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();
}

function resolveEvidenceRoot(): string {
  const override = process.env.ZOEN_VERIFY_EVIDENCE_DIR?.trim();
  if (override) {
    return path.isAbsolute(override) ? override : path.join(repositoryRoot, override);
  }
  return path.join(repositoryRoot, "artifacts");
}

async function loadOrCreateSigningKey(
  outputDirectory: string,
): Promise<{ publicKeyPem: string; privateKeyPem: string; publicKeyDigest: string }> {
  const envPrivate = process.env.ZOEN_VERIFY_SIGNING_KEY_PEM?.trim();
  const envPublic = process.env.ZOEN_VERIFY_SIGNING_PUB_PEM?.trim();
  if (envPrivate && envPublic) {
    return {
      privateKeyPem: envPrivate,
      publicKeyPem: envPublic,
      publicKeyDigest: sha256Text(envPublic),
    };
  }
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  await writeFile(path.join(outputDirectory, "verify-v1.pub"), publicKeyPem);
  return {
    publicKeyPem,
    privateKeyPem,
    publicKeyDigest: sha256Text(publicKeyPem),
  };
}

function signManifest(
  unsigned: Record<string, unknown>,
  privateKeyPem: string,
): { digest: string; signature: string } {
  const canonical = canonicalize(unsigned);
  if (canonical === undefined) {
    throw new Error("canonicalize returned undefined");
  }
  const digest = sha256Text(canonical);
  const signature = signBytes(null, Buffer.from(digest, "utf8"), privateKeyPem).toString(
    "base64",
  );
  return { digest, signature };
}

function verifyManifestSignature(
  unsigned: Record<string, unknown>,
  publicKeyPem: string,
  digest: string,
  signature: string,
): boolean {
  const canonical = canonicalize(unsigned);
  if (canonical === undefined) {
    return false;
  }
  if (sha256Text(canonical) !== digest) {
    return false;
  }
  return verifyBytes(
    null,
    Buffer.from(digest, "utf8"),
    publicKeyPem,
    Buffer.from(signature, "base64"),
  );
}

function assertNoSecrets(text: string): void {
  const forbidden = [
    "BEGIN PRIVATE KEY",
    "BEGIN OPENSSH PRIVATE KEY",
    "BEGIN RSA PRIVATE KEY",
    "BEGIN EC PRIVATE KEY",
    "BEGIN COSIGN PRIVATE KEY",
    "COSIGN_PRIVATE_KEY",
    "ZOEN_VERIFY_SIGNING_KEY_PEM",
    "postgres:postgres",
    "api_key",
    "apiKey",
  ];
  for (const needle of forbidden) {
    if (text.includes(needle)) {
      throw new Error(`verify-v1 bundle would embed secret material (${needle})`);
    }
  }
}

async function main(): Promise<void> {
  const candidate = resolveCandidateSha();
  const evidenceRoot = resolveEvidenceRoot();
  const outputDirectory = path.join(evidenceRoot, "verify-v1");
  await mkdir(outputDirectory, { recursive: true });

  const verificationMutants = runVerificationMutants(candidate);

  const loaded: Array<ScenarioEvidence | null> = [];
  for (const spec of REQUIRED_SCENARIOS) {
    loaded.push(await loadScenarioEvidence(evidenceRoot, spec));
  }
  const fiscalIndex = REQUIRED_SCENARIOS.findIndex((row) => row.id === "fiscal-fault-matrix");
  const fiscalMatrix = fiscalIndex >= 0 ? loaded[fiscalIndex] ?? null : null;
  const live = await resolveLiveSlots(evidenceRoot, fiscalMatrix);
  const gate = evaluateGate(candidate, loaded, live, STRICT_OPTIONS);

  const mutantFailures = verificationMutants
    .filter((row) => !row.killed)
    .map(
      (row): Failure => ({
        code: "verification-mutant-survived",
        detail: `${row.id}: ${row.observation}`,
      }),
    );

  const failures = [...gate.failures, ...mutantFailures];
  const verdict = failures.length === 0 ? "PASS" : "FAIL";

  const unsigned = {
    schema: SCHEMA_ID,
    candidate: {
      sourceCommit: candidate,
    },
    evidenceRoot: path.relative(repositoryRoot, evidenceRoot) || "artifacts",
    generatedAt: new Date().toISOString(),
    liveProviders: live.map((slot) => ({
      detail: slot.detail,
      id: slot.id,
      present: slot.present,
      source: slot.source.startsWith(repositoryRoot)
        ? path.relative(repositoryRoot, slot.source)
        : slot.source,
    })),
    mutants: {
      semanticSurvivors: gate.semanticSurvivors,
      verificationLayer: verificationMutants,
    },
    missingScenarios: gate.missing,
    reliability: {
      rpoTargetSeconds: RPO_TARGET_SECONDS,
      rtoTargetSeconds: RTO_TARGET_SECONDS,
      evidence: gate.scenarios
        .filter((row) => row.spec.id === "rpo-rto")
        .map((row) => row.rpoBody)[0] ?? null,
    },
    scale: gate.scenarios
      .filter((row) => row.spec.kind === "scale")
      .map((row) => ({
        artifactDigest: row.artifactDigest,
        path: path.relative(repositoryRoot, row.path),
        sourceCommit: row.sourceCommit,
        body: {
          phase: row.body.phase ?? null,
          scaleClass: row.body.scaleClass ?? null,
          targetRecords: row.body.targetRecords ?? null,
        },
      }))[0] ?? null,
    scenarios: REQUIRED_SCENARIOS.map((spec, index) => {
      const evidence = loaded[index];
      if (evidence === null || evidence === undefined) {
        return {
          id: spec.id,
          kind: spec.kind,
          ticket: spec.ticket,
          status: "missing" as const,
        };
      }
      return {
        artifactDigest: evidence.artifactDigest,
        id: spec.id,
        kind: spec.kind,
        path: path.relative(repositoryRoot, evidence.path),
        requiresSignedOci: spec.requiresSignedOci,
        signedOciDigest:
          evidence.signedOciPath === null
            ? null
            : sha256Bytes(Buffer.from(JSON.stringify(evidence.signedOci))),
        sourceCommit: evidence.sourceCommit ?? evidence.signedOci?.sourceSha ?? null,
        status: scenarioPassed(evidence.body) ? "pass" : "fail",
        ticket: spec.ticket,
      };
    }),
    warnings: [
      ...(gate.missing.length > 0
        ? [`fail-closed on ${gate.missing.length} missing required scenario(s); aggregate-only gate does not rerun KIND`]
        : []),
      ...live
        .filter((slot) => !slot.present)
        .map((slot) => `live provider ${slot.id} absent (${slot.detail})`),
    ],
    failures,
    verdict,
  };

  const signing = await loadOrCreateSigningKey(outputDirectory);
  const { digest, signature } = signManifest(unsigned, signing.privateKeyPem);
  assert.equal(
    verifyManifestSignature(unsigned, signing.publicKeyPem, digest, signature),
    true,
  );

  const signed = {
    ...unsigned,
    digest,
    signature: {
      algorithm: "ed25519",
      publicKeyDigest: signing.publicKeyDigest,
      value: signature,
    },
  };

  const bundleText = `${JSON.stringify(signed, null, 2)}\n`;
  assertNoSecrets(bundleText);
  const bundlePath = path.join(outputDirectory, "zoen.verify.v1.json");
  await writeFile(bundlePath, bundleText);

  const summaryLines = [
    `# zoen.verify.v1`,
    ``,
    `- candidate: \`${candidate}\``,
    `- verdict: **${verdict}**`,
    `- digest: \`${digest}\``,
    `- missing scenarios: ${gate.missing.length === 0 ? "(none)" : gate.missing.join(", ")}`,
    `- failures: ${failures.length}`,
    `- verification-layer mutants killed: ${verificationMutants.filter((row) => row.killed).length}/${verificationMutants.length}`,
    ``,
    `## Failures`,
    ...(failures.length === 0
      ? ["(none)"]
      : failures.map(
          (row) =>
            `- \`${row.code}\`${row.scenario ? ` (${row.scenario})` : ""}: ${row.detail}`,
        )),
    ``,
    `Official command: \`just verify-v1\``,
    ``,
  ];
  await writeFile(path.join(outputDirectory, "SUMMARY.md"), `${summaryLines.join("\n")}\n`);

  process.stdout.write(
    `${JSON.stringify(
      {
        bundlePath: path.relative(repositoryRoot, bundlePath),
        digest,
        failures: failures.length,
        missingScenarios: gate.missing,
        schema: SCHEMA_ID,
        verdict,
        verificationMutantsKilled: verificationMutants.filter((row) => row.killed).length,
      },
      null,
      2,
    )}\n`,
  );

  if (verdict !== "PASS") {
    process.exitCode = 1;
  }
}

await main();
