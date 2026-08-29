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

const SCHEMA_ID = "zoen.activation.v1" as const;
const FIXTURE_COMMIT_PLACEHOLDER = "__CANDIDATE_SHA__";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot =
  path.basename(path.dirname(moduleDirectory)) === "dist"
    ? path.resolve(moduleDirectory, "../..")
    : path.resolve(moduleDirectory, "..");

type ScenarioKind = "activation" | "messaging" | "public";

type ScenarioSpec = {
  readonly id: string;
  readonly kind: ScenarioKind;
  readonly primary: string;
  readonly slot: number;
  readonly ticket: string;
};

/**
 * Remaining live activation slots after archive. Slot 2 is messaging-boundary.
 * Sample Company, Pack, Kitchen, onboarding, and metrics are archive-class.
 * Live Linq is optional `channel-linq-live`, not a verify-activation required slot.
 */
const REQUIRED_SCENARIOS: readonly ScenarioSpec[] = [
  {
    id: "activation-identity",
    kind: "activation",
    primary: "activation-identity.json",
    slot: 1,
    ticket: "#252",
  },
  {
    id: "messaging-boundary",
    kind: "messaging",
    primary: "messaging-boundary.json",
    slot: 2,
    ticket: "#271",
  },
  {
    id: "public-surface",
    kind: "public",
    primary: "public-surface.json",
    slot: 16,
    ticket: "#267",
  },
];

type GateOptions = {
  ignoreFailedScenario: boolean;
  acceptWrongCommit: boolean;
  ignoreSurvivingMutant: boolean;
  acceptFixtureAsProduction: boolean;
  skipAdvertisedLiveLinq: boolean;
  skipAdvertisedLiveFiscal: boolean;
};

const STRICT_OPTIONS: GateOptions = {
  ignoreFailedScenario: false,
  acceptWrongCommit: false,
  ignoreSurvivingMutant: false,
  acceptFixtureAsProduction: false,
  skipAdvertisedLiveLinq: false,
  skipAdvertisedLiveFiscal: false,
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
  readonly fixtureMarked: boolean;
  readonly mutantsBody: unknown | null;
};

type AdvertisedClaim = {
  readonly id: "live-linq" | "live-fiscal";
  readonly advertised: boolean;
  readonly detail: string;
};

type GateResult = {
  readonly failures: Failure[];
  readonly scenarios: ScenarioEvidence[];
  readonly missing: string[];
  readonly semanticSurvivors: Array<{ scenario: string; id: string }>;
  readonly advertisedClaims: AdvertisedClaim[];
};

type VerificationMutantResult = {
  readonly id: string;
  readonly killed: boolean;
  readonly observation: string;
};

function sha256Text(value: string): string {
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
  if (b.length >= 7 && b.length < a.length && a.startsWith(b)) {
    return true;
  }
  return false;
}

function extractSourceCommit(body: Record<string, unknown>): string | null {
  for (const key of ["sourceCommit", "sourceSha", "source_sha", "headSha"] as const) {
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
    return status === "pass" || status === "passed" || status === "ok";
  }
  const assertions = body.assertions;
  if (assertions !== null && typeof assertions === "object" && !Array.isArray(assertions)) {
    const values = Object.values(assertions as Record<string, unknown>);
    if (values.length === 0) {
      return false;
    }
    return values.every((value) => value === true);
  }
  return false;
}

function isFixtureMarked(body: Record<string, unknown>): boolean {
  return body.fixture === true;
}

function listSurvivingMutants(body: unknown): string[] {
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
  if (Array.isArray(record.mutantsKilled)) {
    return [];
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

function readmeAdvertisesLiveLinq(text: string): boolean {
  const lower = text.toLowerCase();
  if (lower.includes("live linq")) {
    return true;
  }
  return /\blinq\b[\s\S]{0,80}\bsupported\b/i.test(text);
}

function readmeAdvertisesLiveFiscal(text: string): boolean {
  const lower = text.toLowerCase();
  const banned = [
    "live fiscal",
    "live systax",
    "live plugnotas",
    "live protheus",
    "fiscal is supported",
    "fiscal supported",
  ];
  return banned.some((phrase) => lower.includes(phrase));
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
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
  const parsed: unknown = JSON.parse(text);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${primaryPath} is not a JSON object`);
  }
  const body = parsed as Record<string, unknown>;
  const mutantsPath = path.join(directory, "mutants.json");
  let mutantsBody: unknown | null = null;
  if (await pathExists(mutantsPath)) {
    mutantsBody = JSON.parse(await readFile(mutantsPath, "utf8"));
  } else if (body.mutants !== undefined) {
    mutantsBody = body.mutants;
  }
  return {
    spec,
    path: primaryPath,
    body,
    artifactDigest: sha256Text(text),
    sourceCommit: extractSourceCommit(body),
    fixtureMarked: isFixtureMarked(body),
    mutantsBody,
  };
}

function evaluateGate(
  candidate: string,
  loaded: Array<ScenarioEvidence | null>,
  advertisedClaims: AdvertisedClaim[],
  fixtureMode: boolean,
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
        detail: `required evidence artifacts/${spec.id}/${spec.primary} is missing (slot ${spec.slot}, ${spec.ticket})`,
      });
      continue;
    }
    scenarios.push(evidence);

    if (!scenarioPassed(evidence.body) && !options.ignoreFailedScenario) {
      failures.push({
        code: "failed-scenario",
        scenario: spec.id,
        detail: "scenario verdict/status/assertions is not PASS",
      });
    }

    if (evidence.fixtureMarked && !fixtureMode && !options.acceptFixtureAsProduction) {
      failures.push({
        code: "fixture-as-production",
        scenario: spec.id,
        detail:
          "fixture-marked evidence cannot satisfy just verify-activation",
      });
    }

    const commit = evidence.sourceCommit;
    if (commit === null) {
      failures.push({
        code: "missing-source-commit",
        scenario: spec.id,
        detail: "evidence does not record sourceCommit/sourceSha/headSha",
      });
    } else if (!commitsMatch(candidate, commit) && !options.acceptWrongCommit) {
      failures.push({
        code: "wrong-commit",
        scenario: spec.id,
        detail: `evidence commit ${commit} does not match candidate ${candidate}`,
      });
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
  }

  for (const claim of advertisedClaims) {
    if (!claim.advertised) {
      continue;
    }
    if (claim.id === "live-linq" && !options.skipAdvertisedLiveLinq) {
      failures.push({
        code: "advertised-live-linq",
        detail: claim.detail,
      });
    }
    if (claim.id === "live-fiscal" && !options.skipAdvertisedLiveFiscal) {
      failures.push({
        code: "advertised-live-fiscal",
        detail: claim.detail,
      });
    }
  }

  return { failures, scenarios, missing, semanticSurvivors, advertisedClaims };
}

async function resolveAdvertisedClaims(): Promise<AdvertisedClaim[]> {
  const readmePath = path.join(repositoryRoot, "README.md");
  const readme = await readFile(readmePath, "utf8");
  const claims: AdvertisedClaim[] = [
    {
      id: "live-linq",
      advertised: readmeAdvertisesLiveLinq(readme),
      detail: readmeAdvertisesLiveLinq(readme)
        ? "README advertises live Linq/supported Linq without parked #273 evidence"
        : "README does not advertise live Linq",
    },
    {
      id: "live-fiscal",
      advertised: readmeAdvertisesLiveFiscal(readme),
      detail: readmeAdvertisesLiveFiscal(readme)
        ? "README advertises live fiscal vendors without #214 evidence"
        : "README does not advertise live fiscal",
    },
  ];
  return claims;
}

function syntheticPassing(
  spec: ScenarioSpec,
  commit: string,
  extras: Partial<ScenarioEvidence> = {},
): ScenarioEvidence {
  return {
    spec,
    path: `synthetic/${spec.id}/${spec.primary}`,
    body: {
      scenario: spec.id,
      verdict: "PASS",
      sourceCommit: commit,
      assertions: { ok: true },
      mutantsKilled: ["synthetic"],
    },
    artifactDigest: "aa",
    sourceCommit: commit,
    fixtureMarked: false,
    mutantsBody: null,
    ...extras,
  };
}

function runVerificationMutants(
  candidate: string,
  advertisedClaims: AdvertisedClaim[],
): VerificationMutantResult[] {
  const results: VerificationMutantResult[] = [];

  const fillGraph = (
    overrides: Partial<Record<string, ScenarioEvidence | null>>,
  ): Array<ScenarioEvidence | null> =>
    REQUIRED_SCENARIOS.map((spec) => {
      if (Object.prototype.hasOwnProperty.call(overrides, spec.id)) {
        return overrides[spec.id] ?? null;
      }
      return syntheticPassing(spec, candidate);
    });

  const healthy = evaluateGate(
    candidate,
    fillGraph({}),
    advertisedClaims.map((claim) => ({ ...claim, advertised: false })),
    false,
    STRICT_OPTIONS,
  );
  assert.equal(healthy.failures.length, 0, JSON.stringify(healthy.failures));

  {
    const id = "missing-slot";
    const target = REQUIRED_SCENARIOS[0];
    assert.ok(target);
    const loaded = fillGraph({ [target.id]: null });
    const cleanClaims = advertisedClaims.map((claim) => ({ ...claim, advertised: false }));
    const strict = evaluateGate(candidate, loaded, cleanClaims, false, STRICT_OPTIONS);
    const killed = strict.failures.some(
      (row) => row.code === "missing-scenario" && row.scenario === target.id,
    );
    results.push({
      id,
      killed,
      observation: killed
        ? `strict gate fail-closed on missing slot ${target.id}`
        : "missing-slot mutant survived: gate did not name the missing scenario",
    });
  }

  {
    const id = "wrong-sha";
    const other = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const target = REQUIRED_SCENARIOS.find((row) => row.id === "activation-identity");
    assert.ok(target);
    const loaded = fillGraph({
      "activation-identity": syntheticPassing(target, other),
    });
    const cleanClaims = advertisedClaims.map((claim) => ({ ...claim, advertised: false }));
    const strict = evaluateGate(candidate, loaded, cleanClaims, false, STRICT_OPTIONS);
    const mutant = evaluateGate(candidate, loaded, cleanClaims, false, {
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
        : "wrong-sha mutant was not distinguished",
    });
  }

  {
    const id = "fixture-command-mistaken-for-production";
    const target = REQUIRED_SCENARIOS.find((row) => row.id === "public-surface");
    assert.ok(target);
    const fixtureEvidence = syntheticPassing(target, candidate, {
      fixtureMarked: true,
      body: {
        scenario: target.id,
        verdict: "PASS",
        sourceCommit: candidate,
        fixture: true,
        note: "Gate contract fixture. Not production evidence.",
      },
    });
    const loaded = fillGraph({ "public-surface": fixtureEvidence });
    const cleanClaims = advertisedClaims.map((claim) => ({ ...claim, advertised: false }));
    const strict = evaluateGate(candidate, loaded, cleanClaims, false, STRICT_OPTIONS);
    const mutant = evaluateGate(candidate, loaded, cleanClaims, false, {
      ...STRICT_OPTIONS,
      acceptFixtureAsProduction: true,
    });
    const killed =
      strict.failures.some((row) => row.code === "fixture-as-production") &&
      mutant.failures.every((row) => row.code !== "fixture-as-production");
    results.push({
      id,
      killed,
      observation: killed
        ? "strict production path rejected fixture-marked evidence; accept-fixture-as-production mutant would accept it"
        : "fixture-command-mistaken-for-production mutant was not distinguished",
    });
  }

  {
    const id = "advertised-live-linq-without-evidence";
    const loaded = fillGraph({});
    const liveLinqClaims: AdvertisedClaim[] = [
      {
        id: "live-linq",
        advertised: true,
        detail: "injected README live Linq advertisement",
      },
      {
        id: "live-fiscal",
        advertised: false,
        detail: "README does not advertise live fiscal",
      },
    ];
    const strict = evaluateGate(candidate, loaded, liveLinqClaims, false, STRICT_OPTIONS);
    const mutant = evaluateGate(candidate, loaded, liveLinqClaims, false, {
      ...STRICT_OPTIONS,
      skipAdvertisedLiveLinq: true,
    });
    const killed =
      strict.failures.some((row) => row.code === "advertised-live-linq") &&
      mutant.failures.every((row) => row.code !== "advertised-live-linq");
    results.push({
      id,
      killed,
      observation: killed
        ? "strict gate rejected advertised live Linq without evidence; skip-advertised-live-linq mutant would skip it"
        : "advertised-live-linq-without-evidence mutant was not distinguished",
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

function isFixtureEvidenceRoot(evidenceRoot: string): boolean {
  const normalized = path.resolve(evidenceRoot);
  const fixturesRoot = path.resolve(repositoryRoot, "e2e/verify-activation/testdata");
  return (
    normalized === fixturesRoot ||
    normalized.startsWith(`${fixturesRoot}${path.sep}`)
  );
}

function bindFixtureCommitValue(value: unknown, candidate: string): unknown {
  if (typeof value === "string") {
    return value === FIXTURE_COMMIT_PLACEHOLDER ? candidate : value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => bindFixtureCommitValue(entry, candidate));
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = bindFixtureCommitValue(entry, candidate);
    }
    return out;
  }
  return value;
}

function bindFixtureEvidence(
  evidence: ScenarioEvidence,
  candidate: string,
): ScenarioEvidence {
  const body = bindFixtureCommitValue(evidence.body, candidate) as Record<
    string,
    unknown
  >;
  return {
    ...evidence,
    body,
    sourceCommit: extractSourceCommit(body),
    fixtureMarked: isFixtureMarked(body),
  };
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
  await writeFile(path.join(outputDirectory, "verify-activation.pub"), publicKeyPem);
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
      throw new Error(`verify-activation bundle would embed secret material (${needle})`);
    }
  }
}

async function main(): Promise<void> {
  const candidate = resolveCandidateSha();
  const evidenceRoot = resolveEvidenceRoot();
  const fixtureMode = isFixtureEvidenceRoot(evidenceRoot);
  const outputDirectory = fixtureMode
    ? path.join(repositoryRoot, "artifacts/verify-activation")
    : path.join(evidenceRoot, "verify-activation");
  await mkdir(outputDirectory, { recursive: true });

  const advertisedClaims = await resolveAdvertisedClaims();
  const verificationMutants = runVerificationMutants(candidate, advertisedClaims);

  const loaded: Array<ScenarioEvidence | null> = [];
  for (const spec of REQUIRED_SCENARIOS) {
    const evidence = await loadScenarioEvidence(evidenceRoot, spec);
    if (evidence === null) {
      loaded.push(null);
      continue;
    }
    loaded.push(fixtureMode ? bindFixtureEvidence(evidence, candidate) : evidence);
  }

  const gate = evaluateGate(
    candidate,
    loaded,
    advertisedClaims,
    fixtureMode,
    STRICT_OPTIONS,
  );

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
    fixtureContract: fixtureMode,
    generatedAt: new Date().toISOString(),
    advertisedClaims,
    channelPolicy: {
      liveLinq: "optional-channel-linq-live",
      liveFiscal: "parked-#214",
      requiredMessagingScenarios: ["messaging-boundary"],
    },
    mutants: {
      semanticSurvivors: gate.semanticSurvivors,
      verificationLayer: verificationMutants,
    },
    missingScenarios: gate.missing,
    scenarios: REQUIRED_SCENARIOS.map((spec, index) => {
      const evidence = loaded[index];
      if (evidence === null || evidence === undefined) {
        return {
          id: spec.id,
          kind: spec.kind,
          slot: spec.slot,
          ticket: spec.ticket,
          status: "missing" as const,
        };
      }
      return {
        artifactDigest: evidence.artifactDigest,
        fixtureMarked: evidence.fixtureMarked,
        id: spec.id,
        kind: spec.kind,
        path: path.relative(repositoryRoot, evidence.path),
        slot: spec.slot,
        sourceCommit: evidence.sourceCommit,
        status: scenarioPassed(evidence.body) ? "pass" : "fail",
        ticket: spec.ticket,
      };
    }),
    warnings: [
      ...(gate.missing.length > 0
        ? [
            `fail-closed on ${gate.missing.length} missing required scenario(s); aggregate-only gate does not rerun e2e scenarios`,
          ]
        : []),
      ...advertisedClaims
        .filter((claim) => claim.advertised)
        .map((claim) => `${claim.id}: ${claim.detail}`),
      ...(fixtureMode
        ? [
            "fixtureContract=true: gate-contract only; not production evidence. Official command remains `just verify-activation`.",
          ]
        : []),
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
  const bundlePath = path.join(outputDirectory, "zoen.activation.v1.json");
  await writeFile(bundlePath, bundleText);

  const summaryLines = [
    `# zoen.activation.v1`,
    ``,
    `- candidate: \`${candidate}\``,
    `- verdict: **${verdict}**`,
    `- digest: \`${digest}\``,
    `- fixtureContract: ${fixtureMode}`,
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
    fixtureMode
      ? `Fixture evidence is not a ship attestation`
      : `Official command: \`just verify-activation\``,
    ``,
  ];
  await writeFile(path.join(outputDirectory, "SUMMARY.md"), `${summaryLines.join("\n")}\n`);

  process.stdout.write(
    `${JSON.stringify(
      {
        bundlePath: path.relative(repositoryRoot, bundlePath),
        digest,
        failures: failures.length,
        fixtureContract: fixtureMode,
        missingScenarios: gate.missing,
        requiredScenarios: REQUIRED_SCENARIOS.map((spec) => spec.id),
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
