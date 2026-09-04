#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseAndValidateImplementationLedger,
  validateLedgerEvidence,
} from "./ledger-validation.mjs";

const programDirectory = dirname(fileURLToPath(import.meta.url));
const root = resolve(programDirectory, "../..");
const externalLink = /^(?:https?:|mailto:)/;
const read = (path) => readFile(resolve(root, path), "utf8");
const fail = (message) => {
  throw new Error(message);
};
const assert = (condition, message) => {
  if (!condition) {
    fail(message);
  }
};
const expectFailure = (action, expectedMessage, label) => {
  let message = "";
  try {
    action();
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  assert(
    message.includes(expectedMessage),
    `${label} did not reject the invalid fixture`
  );
};
const semanticDigest = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const isContainedPath = (repositoryRoot, candidate) => {
  const relativePath = relative(repositoryRoot, candidate);
  return (
    relativePath === "" ||
    (!isAbsolute(relativePath) &&
      relativePath !== ".." &&
      !relativePath.startsWith(`..${sep}`))
  );
};
const resolveContainedPath = async (
  repositoryRoot,
  baseDirectory,
  target,
  label
) => {
  assert(
    !isAbsolute(target),
    `${label} must be repository-relative: ${target}`
  );
  const candidate = resolve(repositoryRoot, baseDirectory, target);
  assert(
    isContainedPath(repositoryRoot, candidate),
    `${label} escapes the repository: ${target}`
  );
  const [canonicalRoot, canonicalCandidate] = await Promise.all([
    realpath(repositoryRoot),
    realpath(candidate).catch(() => undefined),
  ]);
  assert(canonicalCandidate, `${label} links to missing path ${target}`);
  assert(
    isContainedPath(canonicalRoot, canonicalCandidate),
    `${label} follows a symlink outside the repository: ${target}`
  );
  return canonicalCandidate;
};
const expectPathRejection = async (candidate, expectedMessage) => {
  let message = "";
  try {
    await candidate;
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  assert(
    message.includes(expectedMessage),
    `path containment self-check did not reject ${expectedMessage}`
  );
};
const verifyPathContainment = async () => {
  const fixture = await mkdtemp(join(tmpdir(), "zoen-path-containment-"));
  const repository = join(fixture, "repo");
  const sibling = join(fixture, "repo-sibling");
  try {
    await Promise.all([
      mkdir(join(repository, "docs/product"), { recursive: true }),
      mkdir(sibling, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(join(repository, "docs/product/inside.md"), "inside\n"),
      writeFile(join(sibling, "outside.md"), "outside\n"),
      writeFile(join(fixture, "outside-visual.html"), "outside\n"),
    ]);
    await symlink(
      join(sibling, "outside.md"),
      join(repository, "symlink-escape.md")
    );
    await resolveContainedPath(
      repository,
      "docs/product",
      "inside.md",
      "inside self-check"
    );
    await expectPathRejection(
      resolveContainedPath(
        repository,
        ".",
        "/etc/hosts",
        "absolute self-check"
      ),
      "must be repository-relative"
    );
    await expectPathRejection(
      resolveContainedPath(
        repository,
        ".",
        "../repo-sibling/outside.md",
        "sibling self-check"
      ),
      "escapes the repository"
    );
    await expectPathRejection(
      resolveContainedPath(
        repository,
        ".",
        "symlink-escape.md",
        "symlink self-check"
      ),
      "follows a symlink outside the repository"
    );
    await expectPathRejection(
      resolveContainedPath(
        repository,
        "docs/product",
        "../../../outside-visual.html",
        "visual self-check"
      ),
      "escapes the repository"
    );
  } finally {
    await rm(fixture, { force: true, recursive: true });
  }
};

await verifyPathContainment();

const program = JSON.parse(await read("orchestrate/zoen-final/program.json"));
const frontier = JSON.parse(await read("orchestrate/zoen-final/frontier.json"));
const spec = await read("docs/product/zoen-governed-data-extension-spec.md");
const architecture = await read("docs/product/zoen-final-architecture.md");
const visual = await read(
  "docs/product/show-me-zoen-governed-data-extension.html"
);
const preferences = await read("orchestrate/zoen-final/preferences.md");
const workflow = await read(".github/workflows/verify.yml");
const ledgerText = await read("orchestrate/zoen-final/ledger.tsv");
const agents = await read("AGENTS.md");

assert(program.units.length === 52, "program.json must contain 52 units");
assert(
  program.journeys.length === 8,
  "program.json must contain eight canonical journeys"
);
assert(
  program.finalGates.length === 9,
  "program.json must contain nine final gates"
);
assert(
  program.journeys.map(({ id }) => id).join("|") === "J1|J2|J3|J4|J5|J6|J7|J8",
  "canonical journey IDs changed"
);
const journeyEvidenceFields = [
  "actors",
  "path",
  "negativeProof",
  "replayProof",
  "isolationProof",
  "recoveryProof",
];
for (const journey of program.journeys) {
  assert(
    !("proof" in journey) &&
      journeyEvidenceFields.every(
        (field) =>
          typeof journey[field] === "string" && journey[field].trim().length > 0
      ),
    `${journey.id} must define actors, path, negative, replay, isolation, and recovery proof`
  );
}
const journeysById = new Map(
  program.journeys.map((journey) => [journey.id, journey])
);
const bootstrapCeremony = journeysById.get("J1")?.bootstrapCeremony;
const validateBootstrapCeremony = (ceremony) => {
  assert(
    ceremony?.decision === "RAT-04" &&
      ceremony.scope === "first release for one World" &&
      ceremony.ownerAuthentication === "Better Auth" &&
      ceremony.transactionalArtifacts?.join("|") ===
        "World|owner Membership|candidate release|publication record|active-release pointer" &&
      ceremony.refusesWhenAnyExists?.join("|") ===
        "release|active-release pointer|Membership|completed bootstrap record" &&
      ceremony.completedBootstrapRecordBindings?.join("|") ===
        "owner|World|release digest|policy evidence used by the ceremony" &&
      ceremony.capabilityAfterCommit === "removed" &&
      ceremony.superuser === "forbidden" &&
      ceremony.laterBypass === "forbidden" &&
      ceremony.laterPublicationAndActivationPath === "seven-verb governed path",
    "J1 must encode every RAT-04 bootstrap constraint"
  );
};
for (const field of [
  "ownerAuthentication",
  "completedBootstrapRecordBindings",
  "laterPublicationAndActivationPath",
]) {
  expectFailure(
    () =>
      validateBootstrapCeremony({ ...bootstrapCeremony, [field]: undefined }),
    "every RAT-04 bootstrap constraint",
    `missing ${field} bootstrap self-check`
  );
}
validateBootstrapCeremony(bootstrapCeremony);
const expectedSharedAuthorityReplay =
  "Repeated Decide returns the original decision and deduplication result; repeated Commit returns the original CommitReceipt. Neither replay creates a second invite or Membership.";
const validateSharedAuthorityReplay = (replayProof) => {
  assert(
    replayProof === expectedSharedAuthorityReplay,
    "J3 must keep Decide replay separate from CommitReceipt replay"
  );
};
expectFailure(
  () =>
    validateSharedAuthorityReplay(
      "Repeated Decide or Commit returns the original receipt and creates no second invite or Membership."
    ),
  "Decide replay separate from CommitReceipt replay",
  "J3 Decide receipt self-check"
);
validateSharedAuthorityReplay(journeysById.get("J3")?.replayProof);
const channelIdentityProof = journeysById.get("J5")?.channelIdentityProof;
const channelParticipants = channelIdentityProof?.participants ?? [];
const channelProofFields = [
  "participant",
  "requiredBinding",
  "realAction",
  "backendEvidence",
  "visibleEvidence",
];
assert(
  channelParticipants.map(({ participant }) => participant).join("|") ===
    "Web A|Telegram A|Telegram B|WhatsApp|Restart" &&
    channelParticipants.every((participant) =>
      channelProofFields.every(
        (field) =>
          typeof participant[field] === "string" &&
          participant[field].trim().length > 0
      )
    ),
  "J5 must retain backend and visible evidence for every participant"
);
const sharedTelegramBrowserProfile =
  channelIdentityProof?.sharedTelegramBrowserProfile;
assert(
  sharedTelegramBrowserProfile?.execution === "serialized" &&
    sharedTelegramBrowserProfile.revalidateVisibleIdentityBeforeEachAction ===
      true &&
    sharedTelegramBrowserProfile.parallelBrowserActions === "forbidden" &&
    channelParticipants[4]?.backendEvidence.includes("stable delivery intent"),
  "J5 must serialize a shared Telegram profile and preserve delivery intent"
);
const channelIdentitySemanticValue = [
  channelParticipants.map(
    ({
      participant,
      requiredBinding,
      realAction,
      backendEvidence,
      visibleEvidence,
    }) => [
      participant,
      requiredBinding,
      realAction,
      backendEvidence,
      visibleEvidence,
    ]
  ),
  [
    sharedTelegramBrowserProfile?.execution,
    sharedTelegramBrowserProfile?.revalidateVisibleIdentityBeforeEachAction,
    sharedTelegramBrowserProfile?.parallelBrowserActions,
  ],
];
assert(
  semanticDigest(channelIdentitySemanticValue) ===
    "a10016a1a25aa7d84786c38180bfe8628090ac1c7611972970351a5eee6ddaf4",
  "J5 channel identity matrix differs from the W0 synthesis"
);
assert(
  program.finalGates.map(({ id }) => id).join("|") ===
    "FIN-01|FIN-02|FIN-03|FIN-04|FIN-05|FIN-06|FIN-07|FIN-08|FIN-09",
  "final gate IDs changed"
);
assert(
  program.products.join("|") === "Ontology|Eve|Better Auth",
  "product set changed"
);
assert(
  program.verbs.join("|") ===
    "Discover|Query|Propose|Decide|Commit|Explain|Execute",
  "public verb set changed"
);
assert(
  program.worldReleaseCatalogs.join("|") ===
    "ontology|policy|executors|components",
  "WorldRelease catalog set changed"
);
assert(
  frontier.main.sha === program.base.sha,
  "frontier and program main SHAs differ"
);
const effectRuntimeUnit = program.units.find(({ id }) => id === "W1-03");
const eveRuntimeBoundaryUnit = program.units.find(({ id }) => id === "W1-04");
const worldReleaseContractUnit = program.units.find(({ id }) => id === "W2-01");
const worldReleaseCatalogsUnit = program.units.find(({ id }) => id === "W2-02");
const cedarPolicyCatalogUnit = program.units.find(({ id }) => id === "W2-03");
const worldReleaseActivateUnit = program.units.find(({ id }) => id === "W2-04");
const worldIdentityUnit = program.units.find(({ id }) => id === "W1-05");
const ratificationUnit = program.units.find(({ id }) => id === "W0-05");
const effectRuntimeMerge = frontier.mergedPullRequests.find(
  ({ number }) => number === 625
);
const eveRuntimeBoundaryMerge = frontier.mergedPullRequests.find(
  ({ number }) => number === 618
);
const worldReleaseContractMerge = frontier.mergedPullRequests.find(
  ({ number }) => number === 673
);
const worldReleaseCatalogsMerge = frontier.mergedPullRequests.find(
  ({ number }) => number === 675
);
const cedarPolicyCatalogMerge = frontier.mergedPullRequests.find(
  ({ number }) => number === 676
);
const worldReleaseActivateMerge = frontier.mergedPullRequests.find(
  ({ number }) => number === 678
);
const worldIdentityMerge = frontier.mergedPullRequests.find(
  ({ number }) => number === 621
);
const journeyIsolationMerge = frontier.mergedPullRequests.find(
  ({ number }) => number === 619
);
const ratificationMerge = frontier.mergedPullRequests.find(
  ({ number }) => number === 620
);
const deviceFlowRepairMerge = frontier.mergedPullRequests.find(
  ({ number }) => number === 622
);
assert(
  program.base.sha === "13395c50f2c4aa458497f01bb2350f49883a37e4",
  "program base must track the W2-04 journey-proof main tip"
);
assert(
  worldIdentityUnit?.status === "done" &&
    worldIdentityMerge?.unit === "W1-05" &&
    worldIdentityMerge.head === "c3e819c15e6aa4109a86a18d1b8e0915c208ceb9" &&
    worldIdentityMerge.merge === "edc5d1d172f12299a0920aabbcaca8c78c5d525b" &&
    worldIdentityMerge.verification === "live-ui-verified" &&
    worldIdentityMerge.fact.includes("idempotence ceremony") &&
    worldIdentityMerge.fact.includes("zero Memberships"),
  "PR #621 must close W1-05 with its live two-account ceremony"
);
assert(
  journeyIsolationMerge?.unit === null &&
    journeyIsolationMerge.scope === "journey infrastructure" &&
    journeyIsolationMerge.head === "3c0d26f1c0778c58ef32b5450258941bbb4d6191" &&
    journeyIsolationMerge.merge ===
      "daba8615f5ed39c1d84f4cd64ac8d830999e16b6" &&
    journeyIsolationMerge.mergedAt === "2026-09-03T05:04:58Z" &&
    journeyIsolationMerge.fact.includes("outside the canonical 52-unit"),
  "PR #619 must remain recorded outside the 52-unit graph"
);
assert(
  ratificationUnit?.status === "done" &&
    ratificationUnit.pr === 620 &&
    ratificationUnit.headSha === "1cb0609561fcf00f9c5412a2dfb4cb28235c5c11" &&
    ratificationUnit.mergeSha === "d8843d7effe2822dc69568319a3e01c177648b89" &&
    ratificationMerge?.unit === "W0-05" &&
    ratificationMerge.head === ratificationUnit.headSha &&
    ratificationMerge.merge === ratificationUnit.mergeSha &&
    ratificationMerge.mergedAt === "2026-09-03T06:17:12Z" &&
    !("activeRatification" in frontier),
  "PR #620 must close W0-05 with exact merge and ledger identity"
);
assert(
  deviceFlowRepairMerge?.unit === null &&
    deviceFlowRepairMerge.scope === "Better Auth device-flow repair" &&
    deviceFlowRepairMerge.head === "4c45b95482e5b49a06b5cd05755495b6ff6aed9b" &&
    deviceFlowRepairMerge.merge ===
      "be24e0956e0bfb681634c796b5410afc5eef2e38" &&
    deviceFlowRepairMerge.mergedAt === "2026-09-03T06:42:21Z" &&
    deviceFlowRepairMerge.fact.includes("without completing queued W3-04") &&
    deviceFlowRepairMerge.fact.includes("W1-02 ledger verdict"),
  "PR #622 must remain recorded as the device-flow repair without changing a unit verdict"
);
assert(
  effectRuntimeUnit?.status === "done" &&
    effectRuntimeUnit.pr === 625 &&
    effectRuntimeUnit.headSha === "6683cdcf47af02464a01aa021b34977f450da5d2" &&
    effectRuntimeUnit.mergeSha === "4e33c57151ec8e3e28ee4c43a894da63173febc0" &&
    effectRuntimeMerge?.unit === "W1-03" &&
    effectRuntimeMerge.head === effectRuntimeUnit.headSha &&
    effectRuntimeMerge.merge === effectRuntimeUnit.mergeSha &&
    effectRuntimeMerge.mergedAt === "2026-09-03T17:02:36Z" &&
    effectRuntimeMerge.verification === "journey-verified" &&
    effectRuntimeMerge.fact.includes("44/44 effect-runtime proof") &&
    !frontier.activeCandidates.some(({ unit }) => unit === "W1-03"),
  "PR #625 must close W1-03 with its journey-verified merge"
);
assert(
  eveRuntimeBoundaryUnit?.status === "done" &&
    eveRuntimeBoundaryUnit.pr === 618 &&
    eveRuntimeBoundaryUnit.headSha ===
      "4dc06a4ac3161ce747f3d46c88d47e101dcdb4b3" &&
    eveRuntimeBoundaryUnit.mergeSha ===
      "4dc06a4ac3161ce747f3d46c88d47e101dcdb4b3" &&
    eveRuntimeBoundaryMerge?.unit === "W1-04" &&
    eveRuntimeBoundaryMerge.head === eveRuntimeBoundaryUnit.headSha &&
    eveRuntimeBoundaryMerge.merge === eveRuntimeBoundaryUnit.mergeSha &&
    eveRuntimeBoundaryMerge.mergedAt === "2026-09-03T11:30:11Z" &&
    eveRuntimeBoundaryMerge.verification === "journey-verified" &&
    eveRuntimeBoundaryMerge.fact.includes("messaging-boundary 27/27") &&
    eveRuntimeBoundaryMerge.fact.includes("effect-runtime 44/44") &&
    !frontier.activeCandidates.some(({ unit }) => unit === "W1-04"),
  "PR #618 must close W1-04 with its journey-verified exact-tip proof"
);
assert(
  worldReleaseContractUnit?.status === "done" &&
    worldReleaseContractUnit.pr === 673 &&
    worldReleaseContractUnit.headSha ===
      "630dddd948d8f1a7b2da553d54fb3b4e7526fee1" &&
    worldReleaseContractUnit.mergeSha ===
      "fce9bc524b8c54b388968a12e0b918ff2f5d6fe5" &&
    worldReleaseContractMerge?.unit === "W2-01" &&
    worldReleaseContractMerge.head === worldReleaseContractUnit.headSha &&
    worldReleaseContractMerge.merge === worldReleaseContractUnit.mergeSha &&
    worldReleaseContractMerge.mergedAt === "2026-09-03T22:30:02Z" &&
    worldReleaseContractMerge.verification === "journey-verified" &&
    !frontier.activeCandidates.some(({ unit }) => unit === "W2-01"),
  "PR #673 must close W2-01 with its journey-verified merge"
);
assert(
  worldReleaseCatalogsUnit?.status === "done" &&
    worldReleaseCatalogsUnit.pr === 675 &&
    worldReleaseCatalogsUnit.headSha ===
      "61b92229f4951d68e4871bf9a68ac5983deaffbb" &&
    worldReleaseCatalogsUnit.mergeSha ===
      "26de4966c0afbf9bf57a433776cf3f6dfdbf0a1d" &&
    worldReleaseCatalogsMerge?.unit === "W2-02" &&
    worldReleaseCatalogsMerge.head === worldReleaseCatalogsUnit.headSha &&
    worldReleaseCatalogsMerge.merge === worldReleaseCatalogsUnit.mergeSha &&
    worldReleaseCatalogsMerge.mergedAt === "2026-09-04T01:37:18Z" &&
    worldReleaseCatalogsMerge.verification === "journey-verified" &&
    !frontier.activeCandidates.some(({ unit }) => unit === "W2-02"),
  "PR #675 must close W2-02 with its journey-verified merge"
);
assert(
  cedarPolicyCatalogUnit?.status === "done" &&
    cedarPolicyCatalogUnit.pr === 676 &&
    cedarPolicyCatalogUnit.headSha ===
      "e7cfb16ba00e594bfb4543ad59474c6233881571" &&
    cedarPolicyCatalogUnit.mergeSha ===
      "5d6134d4b0d4d97c8f493ed0c22fcf8416887da5" &&
    cedarPolicyCatalogMerge?.unit === "W2-03" &&
    cedarPolicyCatalogMerge.head === cedarPolicyCatalogUnit.headSha &&
    cedarPolicyCatalogMerge.merge === cedarPolicyCatalogUnit.mergeSha &&
    cedarPolicyCatalogMerge.mergedAt === "2026-09-04T03:58:36Z" &&
    cedarPolicyCatalogMerge.verification === "journey-verified" &&
    !frontier.activeCandidates.some(({ unit }) => unit === "W2-03"),
  "PR #676 must close W2-03 with its journey-verified merge"
);
assert(
  worldReleaseActivateUnit?.status === "done" &&
    worldReleaseActivateUnit.pr === 678 &&
    worldReleaseActivateUnit.headSha ===
      "eb33b4162f061cdcee3858e164a9f834d54fd50d" &&
    worldReleaseActivateUnit.mergeSha === program.base.sha &&
    worldReleaseActivateMerge?.unit === "W2-04" &&
    worldReleaseActivateMerge.head === worldReleaseActivateUnit.headSha &&
    worldReleaseActivateMerge.merge === worldReleaseActivateUnit.mergeSha &&
    worldReleaseActivateMerge.mergedAt === "2026-09-04T05:04:46Z" &&
    worldReleaseActivateMerge.verification === "journey-verified" &&
    worldReleaseActivateMerge.fact.includes("94/94 world-release journey") &&
    !frontier.activeCandidates.some(({ unit }) => unit === "W2-04"),
  "PR #678 must close W2-04 with its journey-verified exact-tip proof"
);
const ledgerRows = parseAndValidateImplementationLedger(
  program.units,
  ledgerText
);
const effectRuntimeLedger = ledgerRows.find(({ unitId }) => unitId === "W1-03");
assert(
  effectRuntimeLedger?.pr === "625" &&
    effectRuntimeLedger.headSha === effectRuntimeUnit.headSha &&
    effectRuntimeLedger.mergeSha === effectRuntimeUnit.mergeSha &&
    effectRuntimeLedger.verdict === "journey-verified" &&
    effectRuntimeLedger.evidence ===
      "orchestrate/zoen-final/reports/w1-03-validation.md" &&
    effectRuntimeLedger.verifiedAt === "2026-09-03T16:00:00Z" &&
    effectRuntimeLedger.mergedAt === "2026-09-03T17:02:36Z",
  "W1-03 must retain its exact journey-verified ledger verdict"
);
const eveRuntimeBoundaryLedger = ledgerRows.find(
  ({ unitId }) => unitId === "W1-04"
);
assert(
  eveRuntimeBoundaryLedger?.pr === "618" &&
    eveRuntimeBoundaryLedger.headSha === eveRuntimeBoundaryUnit.headSha &&
    eveRuntimeBoundaryLedger.mergeSha === eveRuntimeBoundaryUnit.mergeSha &&
    eveRuntimeBoundaryLedger.verdict === "journey-verified" &&
    eveRuntimeBoundaryLedger.evidence ===
      "orchestrate/zoen-final/reports/w1-04-validation.md" &&
    eveRuntimeBoundaryLedger.verifiedAt === "2026-09-03T19:30:00Z" &&
    eveRuntimeBoundaryLedger.mergedAt === "2026-09-03T11:30:11Z",
  "W1-04 must retain its exact journey-verified ledger verdict"
);
const worldReleaseContractLedger = ledgerRows.find(
  ({ unitId }) => unitId === "W2-01"
);
assert(
  worldReleaseContractLedger?.pr === "673" &&
    worldReleaseContractLedger.headSha === worldReleaseContractUnit.headSha &&
    worldReleaseContractLedger.mergeSha === worldReleaseContractUnit.mergeSha &&
    worldReleaseContractLedger.verdict === "journey-verified" &&
    worldReleaseContractLedger.evidence ===
      "orchestrate/zoen-final/reports/w2-01-validation.md" &&
    worldReleaseContractLedger.verifiedAt === "2026-09-03T22:28:00Z" &&
    worldReleaseContractLedger.mergedAt === "2026-09-03T22:30:02Z",
  "W2-01 must retain its exact journey-verified ledger verdict"
);
const worldReleaseCatalogsLedger = ledgerRows.find(
  ({ unitId }) => unitId === "W2-02"
);
assert(
  worldReleaseCatalogsLedger?.pr === "675" &&
    worldReleaseCatalogsLedger.headSha === worldReleaseCatalogsUnit.headSha &&
    worldReleaseCatalogsLedger.mergeSha === worldReleaseCatalogsUnit.mergeSha &&
    worldReleaseCatalogsLedger.verdict === "journey-verified" &&
    worldReleaseCatalogsLedger.evidence ===
      "orchestrate/zoen-final/reports/w2-02-validation.md" &&
    worldReleaseCatalogsLedger.verifiedAt === "2026-09-04T01:35:00Z" &&
    worldReleaseCatalogsLedger.mergedAt === "2026-09-04T01:37:18Z",
  "W2-02 must retain its exact journey-verified ledger verdict"
);
const cedarPolicyCatalogLedger = ledgerRows.find(
  ({ unitId }) => unitId === "W2-03"
);
assert(
  cedarPolicyCatalogLedger?.pr === "676" &&
    cedarPolicyCatalogLedger.headSha === cedarPolicyCatalogUnit.headSha &&
    cedarPolicyCatalogLedger.mergeSha === cedarPolicyCatalogUnit.mergeSha &&
    cedarPolicyCatalogLedger.verdict === "journey-verified" &&
    cedarPolicyCatalogLedger.evidence ===
      "orchestrate/zoen-final/reports/w2-03-validation.md" &&
    cedarPolicyCatalogLedger.verifiedAt === "2026-09-04T03:50:00Z" &&
    cedarPolicyCatalogLedger.mergedAt === "2026-09-04T03:58:36Z",
  "W2-03 must retain its exact journey-verified ledger verdict"
);
const worldReleaseActivateLedger = ledgerRows.find(
  ({ unitId }) => unitId === "W2-04"
);
assert(
  worldReleaseActivateLedger?.pr === "678" &&
    worldReleaseActivateLedger.headSha === worldReleaseActivateUnit.headSha &&
    worldReleaseActivateLedger.mergeSha === worldReleaseActivateUnit.mergeSha &&
    worldReleaseActivateLedger.verdict === "journey-verified" &&
    worldReleaseActivateLedger.evidence ===
      "orchestrate/zoen-final/reports/w2-04-validation.md" &&
    worldReleaseActivateLedger.verifiedAt === "2026-09-04T05:00:00Z" &&
    worldReleaseActivateLedger.mergedAt === "2026-09-04T05:04:46Z",
  "W2-04 must retain its exact journey-verified ledger verdict"
);
const worldIdentityLedger = ledgerRows.find(({ unitId }) => unitId === "W1-05");
assert(
  worldIdentityLedger?.pr === "621" &&
    worldIdentityLedger.headSha === worldIdentityUnit.headSha &&
    worldIdentityLedger.mergeSha === worldIdentityUnit.mergeSha &&
    worldIdentityLedger.verdict === "live-ui-verified" &&
    worldIdentityLedger.evidence ===
      "orchestrate/zoen-final/reports/w1-05-validation.md" &&
    worldIdentityLedger.verifiedAt === "2026-09-03T10:30:53Z" &&
    worldIdentityLedger.mergedAt === "2026-09-03T04:33:27Z",
  "W1-05 must retain its exact live ceremony ledger verdict"
);
await Promise.all(
  ledgerRows.map(async (row) => {
    const evidencePath = await resolveContainedPath(
      root,
      ".",
      row.evidence,
      `${row.unitId} ledger evidence`
    );
    const evidence = await readFile(evidencePath, "utf8");
    validateLedgerEvidence(row, evidence);
  })
);
assert(
  frontier.landingOrder.join("|") === "W2-05|W2-06|W2-07|W2-08|W3-01",
  "landing order changed"
);
const allowedInitialPullRequestClassifications = new Set([
  "Replace",
  "Drop",
  "Keep and restack",
  "Regenerate",
  "Coordinate",
  "Safe cohort",
  "Blocked pair",
  "Defer",
]);
const initialPullRequestDispositionsDigest =
  "sha256:6ffc3492284f65b32c62cd69f53d539cd538bd623a17a6bd3a20cd965eb48b38";
const validateInitialPullRequestDispositions = (items) => {
  assert(items.length === 20, "frontier must contain 20 initial PR records");
  assert(
    new Set(items.map(({ number }) => number)).size === 20,
    "initial PR numbers must be unique"
  );
  assert(
    items.every(({ classification }) =>
      allowedInitialPullRequestClassifications.has(classification)
    ),
    "initial PR classification is outside the ratified enum"
  );
  const records = items.map(
    ({ number, classification, disposition, reason }) => [
      number,
      classification,
      disposition,
      reason,
    ]
  );
  assert(
    `sha256:${semanticDigest(records)}` ===
      initialPullRequestDispositionsDigest,
    "initial PR records differ from the ratified semantic digest"
  );
};
const initialPullRequestDispositions =
  frontier.initialPullRequestDispositions ?? [];
const mutatedInitialPullRequestDispositions =
  initialPullRequestDispositions.map((item) => ({ ...item }));
mutatedInitialPullRequestDispositions[0] = {
  ...mutatedInitialPullRequestDispositions[0],
  classification: "Drop",
  disposition: "Merge as-is",
  reason: "Approved",
};
expectFailure(
  () =>
    validateInitialPullRequestDispositions(
      mutatedInitialPullRequestDispositions
    ),
  "ratified semantic digest",
  "Drop|Merge as-is|Approved disposition self-check"
);
validateInitialPullRequestDispositions(initialPullRequestDispositions);
assert(
  frontier.initialPullRequestDispositionsDigest ===
    initialPullRequestDispositionsDigest,
  "frontier initial PR digest does not match the validator"
);
const journeyInfrastructure = frontier.journeyInfrastructure ?? [];
const [infrastructureSnapshot] = journeyInfrastructure;
assert(
  journeyInfrastructure.length === 1 &&
    infrastructureSnapshot.number === 619 &&
    infrastructureSnapshot.snapshotKind === "immutable-audit-evidence" &&
    infrastructureSnapshot.stateAtAudit === "open" &&
    infrastructureSnapshot.branchAtAudit === "codex/e2e-concurrent-isolation" &&
    infrastructureSnapshot.headShaAtAudit ===
      "93c800c9de09f43a8b0b145037ac989da7e6782f" &&
    /^2026-09-03T\d{2}:\d{2}:\d{2}Z$/.test(infrastructureSnapshot.observedAt) &&
    infrastructureSnapshot.provenance.includes(
      "this record does not follow the live branch"
    ) &&
    !("state" in infrastructureSnapshot) &&
    !("head" in infrastructureSnapshot) &&
    !("branch" in infrastructureSnapshot),
  "PR #619 must be an immutable, provenance-bearing audit snapshot"
);
assert(
  frontier.dispositions.some(
    (item) =>
      item.number === 616 &&
      item.state === "closed" &&
      item.disposition === "retired"
  ),
  "PR 616 must remain retired"
);
assert(
  !program.units.some((unit) => unit.id === "W1-H1"),
  "PR 616 runtime must not appear as a unit"
);

const worldReleaseContent =
  spec.match(/struct WorldReleaseContent \{([\s\S]*?)\n\}/)?.[1] ?? "";
const datasetVersionContent =
  spec.match(/struct DatasetVersionContent \{([\s\S]*?)\n\}/)?.[1] ?? "";
const rustFieldName = (line) => {
  const separator = line.indexOf(":");
  assert(separator > 0, `invalid Rust field line: ${line}`);
  return line.slice(0, separator).trim();
};
const worldReleaseFields = worldReleaseContent
  .trim()
  .split("\n")
  .map(rustFieldName);
const architectureWorldReleaseStart = architecture.indexOf(
  "struct WorldRelease {"
);
const architectureWorldReleaseEnd = architecture.indexOf(
  "\n}",
  architectureWorldReleaseStart
);
assert(
  architectureWorldReleaseStart >= 0 && architectureWorldReleaseEnd > 0,
  "architecture lacks WorldRelease"
);
const architectureWorldRelease = architecture.slice(
  architectureWorldReleaseStart,
  architectureWorldReleaseEnd
);
assert(
  architecture.includes("struct WorldReleaseContent {") &&
    architecture.includes("struct WorldReleasePublication {") &&
    architectureWorldRelease.includes("content: WorldReleaseContent") &&
    !architectureWorldRelease.includes("published_at"),
  "architecture does not separate release content from publication metadata"
);
assert(
  architecture.includes(
    "Their canonical constructor derives `ReleaseDigest`; callers cannot supply it. This is type encapsulation, not secrecy."
  ),
  "architecture does not state the private-field boundary"
);
assert(
  architecture.includes("## Launch proof examples") &&
    architecture.includes(
      "[`program.json`](../../orchestrate/zoen-final/program.json) defines the eight canonical journeys, J1 through J8."
    ) &&
    architecture.includes("J1 proves governed release and bootstrap.") &&
    architecture.includes("J8 proves production recovery.") &&
    !architecture.includes(
      "These are the acceptance tests for the architecture itself."
    ),
  "architecture must defer the J1-J8 acceptance catalog to program.json"
);
assert(spec.includes("Status: Ratified by W0-05"), "spec is not ratified");
assert(
  spec.includes("zoen.world-release.v1"),
  "WorldRelease domain tag is missing"
);
assert(
  spec.includes("RFC 8785 JSON Canonicalization Scheme"),
  "RFC 8785 JCS rule is missing"
);
assert(
  worldReleaseFields.join("|") ===
    "world|parent|ontology|policy|executors|components",
  "WorldReleaseContent field set changed"
);
assert(
  !worldReleaseContent.includes("id:"),
  "WorldReleaseContent must not accept an ID"
);
assert(
  !worldReleaseContent.includes("published_"),
  "WorldReleaseContent contains publication metadata"
);
assert(
  worldReleaseContent.match(/CatalogDigest/g)?.length === 4,
  "WorldReleaseContent must contain four catalog digests"
);
assert(
  spec.includes(
    "Every field in `WorldReleaseContent` and `WorldRelease` MUST remain private"
  ),
  "private WorldRelease fields rule is missing"
);
assert(
  !(
    datasetVersionContent.includes("accepted_") ||
    datasetVersionContent.includes("commit:")
  ),
  "DatasetVersionContent contains acceptance metadata"
);
assert(
  spec.includes(
    "The acceptance record MUST remain outside the dataset-version digest"
  ),
  "DatasetVersion acceptance separation rule is missing"
);
assert(
  spec.includes(
    "A caller with matching lineage rights MUST be able to retrieve the record by `ResolutionDecisionDigest`"
  ),
  "ResolutionDecision retrieval rule is missing"
);
assert(
  spec.includes("A `ResolutionDecision` is a durable derived-read artifact") &&
    spec.includes("A `ResolutionDecision` is not a `CommitReceipt`"),
  "ResolutionDecision authority boundary is missing"
);
const bootstrapRequirements = [
  "The first release for a World MUST use a one-time owner ceremony",
  "Authenticate the owner through Better Auth.",
  "Create the initial World, owner Membership, candidate release, publication record, and active-release pointer in one transaction.",
  "Refuse to run if the World has any release, active-release pointer, Membership, or completed bootstrap record.",
  "Bind the completed bootstrap record to the owner, the World, the release digest, and the policy evidence used by the ceremony.",
  "Remove the bootstrap capability when the transaction commits.",
  "The ceremony MUST NOT create a superuser, a reusable bypass, or a policy-free path for a later release.",
  "Every later publication and activation MUST use the seven-verb governed path.",
];
assert(
  bootstrapRequirements.every((requirement) => spec.includes(requirement)),
  "World owner bootstrap transaction, refusal, or capability removal is missing"
);
assert(
  spec.includes(
    "At most one `WorldRelease` MAY be active for a World at one time"
  ),
  "one-active-release rule is missing"
);
assert(
  spec.includes(
    "Both assignments MUST cover the complete `LinkAssertion.valid_time` interval"
  ),
  "typed-link interval rule is missing"
);
assert(
  spec.includes(
    "`TypeAssignment` is the only term for evidence that a domain object has a type"
  ),
  "TypeAssignment wording rule is missing"
);
assert(
  spec.includes("struct ObjectKey") &&
    spec.includes("struct TypedObjectRef<T>"),
  "typed object references are missing"
);
assert(
  spec.includes("That evaluation MUST produce a `ResolutionDecision`"),
  "KnowledgeBasisDefinition output rule is missing"
);
assert(
  spec.includes(
    "before any semantic table, observation manifest, segment, index, cache, or provider endpoint is inspected"
  ),
  "pre-scan authorization rule is missing"
);
assert(
  spec.includes("Denied and absent resources MUST use the same public status"),
  "non-disclosing denial rule is missing"
);
assert(
  spec.includes(
    "OpenBB and the institutional standards in the research record are informative sources"
  ) &&
    spec.includes("No OpenBB AGPL code reuse is authorized by W0-05") &&
    spec.includes("`LIC-01` records this no-reuse disposition") &&
    spec.includes(
      "a separate written license disposition MUST name the code, license, approval, and implementation boundary"
    ),
  "informative-source or clean-room license rule is missing"
);
assert(
  spec.includes("The architecture MUST NOT add Redis"),
  "Redis prohibition is missing"
);
assert(
  spec.includes("Restate provides durability only for `ZoenEffect`") &&
    spec.includes("The initial deployment remains one Fly application"),
  "runtime ownership rule is missing"
);
assert(
  preferences.includes(
    "Do not add compatibility aliases, dual reads, dual writes, or preservation work"
  ),
  "pre-launch compatibility rule is missing"
);
const requiredWorkingAgreements = [
  "private Cargo `target`",
  "Workers on all 52 units never rebase, merge, deploy, force-push, delete data, close pull requests, or retarget pull requests.",
  "human gate for irreversible actions, production deploys, data deletion, force-pushes, and closing someone else's pull request",
  "Enzo's standing authorization for any merge and production deploy.",
  "Merge only a current ledger-verified SHA.",
  "Deploy only the exact production-shaped artifact that passed the release journeys.",
  "That standing authorization supersedes only the merge and deploy gates in the earlier orders.",
  "Workers still cannot merge or deploy.",
  "The coordinator or designated stacker may merge the verified SHA and deploy the exact verified artifact.",
  "The standing authorization does not authorize force-push, data deletion, or third-party messages.",
  "Force-push and data deletion still require a separate human gate.",
  "Workers on all 52 units do not use Herdr, Cursor SDK, Portless, PR Cockpit, or Graphite.",
  "Resolve every actionable human and automated review comment before merge.",
  "Every unit reports its branch, head SHA, exact commands, verdict, deviations, and follow-up risks.",
];
assert(
  requiredWorkingAgreements.every((agreement) =>
    preferences.includes(agreement)
  ),
  "program working agreements omit a worker or coordinator constraint"
);
const checkJobStart = workflow.indexOf("\n  check:\n");
const clippyJobStart = workflow.indexOf("\n  clippy:\n", checkJobStart);
const checkJob = workflow.slice(checkJobStart, clippyJobStart);
const requiredProgramCommands = [
  "node orchestrate/zoen-final/render-status.mjs",
  "node orchestrate/zoen-final/verify-ratification.mjs",
];
assert(
  checkJobStart >= 0 &&
    clippyJobStart > checkJobStart &&
    requiredProgramCommands.every(
      (command) => checkJob.split(command).length === 2
    ) &&
    !checkJob.includes("--write") &&
    workflow.includes(
      "needs: [check, clippy, build, e2e, e2e-concurrent, one-fly-image]"
    ),
  "required CI must run both canonical program checks without writing"
);
assert(
  !/\bproposed\b|decisão proposta|extensão proposta/i.test(spec),
  "spec still contains proposed status text"
);

for (const gate of program.finalGates) {
  assert(
    gate.proof.includes("IBM"),
    `${gate.id} does not name its IBM coverage`
  );
}
for (const id of Array.from(
  { length: 9 },
  (_, index) => `FIN-${String(index + 1).padStart(2, "0")}`
)) {
  assert(visual.includes(id), `visual is missing ${id}`);
}
assert(!/file:\/\//.test(visual), "visual contains a file URL");
assert(
  !/decisão proposta|extensão proposta|>proposto</i.test(visual),
  "visual still marks ratified contracts as proposed"
);
assert(
  visual.includes("SourceCapability é um contrato composto:") &&
    !visual.includes("ProviderCapability"),
  "visual does not use the ratified SourceCapability name"
);
assert(
  visual.includes(
    "O único bootstrap do primeiro owner é uma transação, recusa qualquer estado prévio, remove a capacidade no commit e não cria superuser nem bypass."
  ) &&
    visual.includes(
      "OpenBB clean-room; W0-05 não autoriza reuso AGPL; LIC-01 precede qualquer mudança"
    ),
  "visual does not show the executable bootstrap or AGPL disposition"
);
const visualNodeElements = visual
  .split("\n")
  .filter(
    (line) => line.includes('class="node ') || line.includes('class="node"')
  );
assert(
  visualNodeElements.length > 0 &&
    visualNodeElements.every((line) => line.trimStart().startsWith("<button ")),
  "every interactive architecture node must be a button"
);
for (const behavior of [
  ".node.dimmed { opacity: 0; visibility: hidden; pointer-events: none; }",
  "node.disabled = !active;",
  "node.tabIndex = active ? 0 : -1;",
  "node.setAttribute('aria-hidden', String(!active));",
]) {
  assert(
    visual.includes(behavior),
    `visual filter lacks accessible behavior: ${behavior}`
  );
}
assert(
  visual.toLowerCase().startsWith("<!doctype html>"),
  "visual lacks an HTML doctype"
);
for (const tag of ["<html", "<head", "<body", "</body>", "</html>"]) {
  assert(visual.includes(tag), `visual lacks ${tag}`);
}

const ids = [...visual.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
assert(
  new Set(ids).size === ids.length,
  "visual contains duplicate element IDs"
);
for (const match of visual.matchAll(/href="#([^"]+)"/g)) {
  assert(ids.includes(match[1]), `visual link points to missing #${match[1]}`);
}
const lowercaseVisual = visual.toLowerCase();
const scriptOpen = "<script>";
const scriptClose = "</script>";
const scriptStart = lowercaseVisual.indexOf(scriptOpen);
const scriptEnd = lowercaseVisual.indexOf(
  scriptClose,
  scriptStart + scriptOpen.length
);
assert(
  scriptStart >= 0 && scriptEnd > scriptStart,
  "visual lacks its inline script"
);
assert(
  !(
    lowercaseVisual.includes(scriptOpen, scriptStart + scriptOpen.length) ||
    lowercaseVisual.includes(scriptClose, scriptEnd + scriptClose.length)
  ),
  "visual must contain exactly one inline script"
);
const visualScript = visual.slice(scriptStart + scriptOpen.length, scriptEnd);
const syntaxCheck = spawnSync(process.execPath, ["--check", "-"], {
  encoding: "utf8",
  input: visualScript,
});
assert(
  syntaxCheck.status === 0,
  `visual script has invalid JavaScript: ${syntaxCheck.stderr.trim()}`
);

const tsvFiles = [
  "units.tsv",
  "dependencies.tsv",
  "journeys.tsv",
  "final-gates.tsv",
  "ledger.tsv",
  "decisions.tsv",
];
const tsvContents = await Promise.all(
  tsvFiles.map(async (name) => [
    name,
    await read(`orchestrate/zoen-final/${name}`),
  ])
);
for (const [name, content] of tsvContents) {
  const lines = content.replace(/\n$/, "").split("\n");
  const width = lines[0].split("\t").length;
  for (const [index, line] of lines.entries()) {
    assert(
      line.split("\t").length === width,
      `${name}:${index + 1} has the wrong field count`
    );
  }
}
const decisions = (await read("orchestrate/zoen-final/decisions.tsv"))
  .trimEnd()
  .split("\n")
  .slice(1)
  .map((line) => line.split("\t"));
const expectedRatificationDecisionSequence =
  "RAT-01|RAT-02|RAT-03|RAT-04|RAT-05|RAT-06|RAT-07";
const expectedRatificationDecisionIds =
  expectedRatificationDecisionSequence.split("|");
const validateDecisionIds = (rows) => {
  const decisionIds = rows.map(([id]) => id);
  assert(
    decisionIds.filter((id) => id === "LIC-01").length === 1,
    "decisions.tsv must contain exactly one LIC-01"
  );
  assert(
    new Set(decisionIds).size === decisionIds.length,
    "decision IDs must be unique"
  );
  assert(
    decisionIds.filter((id) => id.startsWith("RAT-")).join("|") ===
      expectedRatificationDecisionSequence,
    "ratification decision IDs must be exactly RAT-01 through RAT-07"
  );
};
const validDecisionIdFixture = [
  ...expectedRatificationDecisionIds.map((id) => [id]),
  ["LIC-01"],
  ["OPS-01"],
];
expectFailure(
  () => validateDecisionIds([...validDecisionIdFixture, ["RAT-07"]]),
  "decision IDs must be unique",
  "duplicate ratification decision self-check"
);
expectFailure(
  () =>
    validateDecisionIds(
      validDecisionIdFixture.map(([id]) => [id === "RAT-07" ? "RAT-08" : id])
    ),
  "exactly RAT-01 through RAT-07",
  "wrong ratification decision self-check"
);
expectFailure(
  () => validateDecisionIds([...validDecisionIdFixture, ["LIC-01"]]),
  "exactly one LIC-01",
  "duplicate LIC-01 self-check"
);
validateDecisionIds(decisions);
assert(
  decisions
    .filter(([id]) => id.startsWith("RAT-"))
    .every(([, , status]) => status === "ratified"),
  "RAT-01 through RAT-07 must all remain ratified"
);
const decisionsById = new Map(decisions.map((row) => [row[0], row]));
const ratificationFour = decisionsById.get("RAT-04")?.[3] ?? "";
assert(
  [
    "in one transaction",
    "refuses a repeat",
    "removes the capability",
    "no superuser or later bypass exists",
  ].every((requirement) => ratificationFour.includes(requirement)),
  "RAT-04 does not encode the one-time bootstrap proof"
);
const ratificationSeven = decisionsById.get("RAT-07")?.[3] ?? "";
assert(
  ratificationSeven.includes("clean-room") &&
    ratificationSeven.includes("authorizes no OpenBB AGPL code reuse") &&
    ratificationSeven.includes("separate written license disposition"),
  "RAT-07 does not encode the clean-room and AGPL boundary"
);
const licenseDisposition = decisionsById.get("LIC-01") ?? [];
assert(
  licenseDisposition[2] === "no-reuse" &&
    licenseDisposition[3]?.includes(
      "code, license, approval, and implementation boundary"
    ),
  "LIC-01 must separately record that AGPL reuse is not authorized"
);

const markdownAnchor = (heading) => {
  assert(
    !(heading.includes("<") || heading.includes(">")),
    "raw HTML is unsupported in checked Markdown headings"
  );
  return heading
    .toLowerCase()
    .replace(/[`*_~]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
};
const markdownHeading = (line) => {
  let markerCount = 0;
  while (markerCount < 6 && line[markerCount] === "#") {
    markerCount += 1;
  }
  const separator = line[markerCount];
  if (!(markerCount > 0 && (separator === " " || separator === "\t"))) {
    return;
  }
  return line.slice(markerCount).trimStart();
};
const markdownAnchors = (text) =>
  new Set(
    text.split("\n").map(markdownHeading).filter(Boolean).map(markdownAnchor)
  );
const validateDecisionEvidence = async ([id, , , , , evidence]) => {
  const [target, fragment] = evidence.split("#", 2);
  const path = await resolveContainedPath(root, ".", target, `${id} evidence`);
  const targetText = await readFile(path, "utf8");
  if (fragment && target.endsWith(".md")) {
    assert(
      markdownAnchors(targetText).has(fragment),
      `${id} links to missing anchor #${fragment}`
    );
  }
};
await Promise.all(decisions.map(validateDecisionEvidence));

const markdownFiles = [
  "docs/product/zoen-final-architecture.md",
  "docs/product/zoen-governed-data-extension-spec.md",
  "orchestrate/zoen-final/README.md",
  "orchestrate/zoen-final/overview.md",
  "orchestrate/zoen-final/ledger-schema.md",
  "orchestrate/zoen-final/status.md",
  "orchestrate/zoen-final/briefs/w0-05-governed-data-ratification.md",
  "orchestrate/zoen-final/briefs/w2-01-world-release-contract.md",
  "orchestrate/zoen-final/reports/w1-01-validation.md",
  "orchestrate/zoen-final/reports/w1-02-validation.md",
  "orchestrate/zoen-final/reports/w1-03-validation.md",
  "orchestrate/zoen-final/reports/w1-04-validation.md",
  "orchestrate/zoen-final/reports/w1-05-validation.md",
  "orchestrate/zoen-final/reports/w2-01-validation.md",
  "orchestrate/zoen-final/reports/w2-02-validation.md",
  "orchestrate/zoen-final/reports/w2-03-validation.md",
  "orchestrate/zoen-final/reports/w2-04-validation.md",
];
const markdownLinkTargets = (markdown) => {
  const targets = [];
  let cursor = 0;
  while (cursor < markdown.length) {
    const labelStart = markdown.indexOf("[", cursor);
    if (labelStart === -1) {
      break;
    }
    const targetStart = markdown.indexOf("](", labelStart + 1);
    if (targetStart === -1) {
      break;
    }
    const targetEnd = markdown.indexOf(")", targetStart + 2);
    if (targetEnd === -1) {
      break;
    }
    targets.push(markdown.slice(targetStart + 2, targetEnd));
    cursor = targetEnd + 1;
  }
  return targets;
};
const validateMarkdownFile = async (file) => {
  const markdown = await read(file);
  const links = markdownLinkTargets(markdown);
  await Promise.all(
    links.map(async (link) => {
      const [target, fragment] = link.split("#", 2);
      if (externalLink.test(target)) {
        return;
      }
      const path = await resolveContainedPath(
        root,
        target ? dirname(file) : ".",
        target || file,
        `${file} link`
      );
      if (fragment && path.endsWith(".md")) {
        const targetText = target ? await readFile(path, "utf8") : markdown;
        assert(
          markdownAnchors(targetText).has(fragment),
          `${file} links to missing anchor #${fragment}`
        );
      }
    })
  );
};
await Promise.all(markdownFiles.map(validateMarkdownFile));

const visualLinks = [...visual.matchAll(/href="([^"#][^"]*)"/g)].map(
  ([, link]) => link
);
await Promise.all(
  visualLinks.map(async (target) => {
    if (externalLink.test(target)) {
      return;
    }
    await resolveContainedPath(root, "docs/product", target, "visual link");
  })
);

const researchRoot = resolve(root, "docs/research/2026-09-02-openbb-ontology");
const researchHashes = new Map([
  [
    "openbb-ontology-deep-research.html",
    "cde60767cafe1bbdef3d1d5dd145dbcf1a7ae101c18b04041c37ed2db8efc0db",
  ],
  [
    "report-source.md",
    "11b20699c40669cdce88524834f09738e04dd6104bb3055dca5cc6899852fe36",
  ],
  [
    "show-me-zoen-final-research-architecture.html",
    "893eaf8b77209ae965c9ae5bd1a01c8cfd4eaba3ce56bfeff99eb059ff95e2cb",
  ],
  [
    "subagent-reports/01-openbb-repository-forensics.md",
    "33f8e40cde9d79c5d5a5d66f09c8ac796d623990dbe8c30cca9c8cd34f1b39cc",
  ],
  [
    "subagent-reports/02-financial-semantics-ibm.md",
    "974f190ec144668d36fb9523bf251595399694484776b5d7422af04345ddcb49",
  ],
  [
    "subagent-reports/03-palantir-zoen-gap-audit.md",
    "e915eba9f0a3ba76c1ec88d40c2f59a14afa5ceb5118042a649e573b0293be8b",
  ],
  [
    "subagent-reports/04-institutional-standards-crosscheck.md",
    "f2332dcc6517090b1d63ab669cac863d3926004e66fae871fca31de2388c7d26",
  ],
  [
    "subagent-reports/README.md",
    "f8570baccebc408ae13a5542db6f676d528e09b11aaafb740cf22561ab4f9eb1",
  ],
  [
    "subagent-reports/SHA256SUMS.md",
    "c0a26343ddae1877376855d3f11124ed35c3eead4b5a603b93b20cffc294dfff",
  ],
]);
await Promise.all(
  [...researchHashes].map(async ([path, expected]) => {
    const content = await readFile(join(researchRoot, path));
    const actual = createHash("sha256").update(content).digest("hex");
    assert(actual === expected, `research hash differs for ${path}`);
  })
);

const cockpitName = /cockpit/i;
const ignoredDirectoryNames = new Set([".git", "node_modules", "target"]);
const walk = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const matches = await Promise.all(
    entries.map(async (entry) => {
      if (ignoredDirectoryNames.has(entry.name)) {
        return [];
      }
      const path = join(directory, entry.name);
      const nested = entry.isDirectory() ? await walk(path) : [];
      return cockpitName.test(entry.name) ? [path, ...nested] : nested;
    })
  );
  return matches.flat();
};
const cockpitPaths = await walk(root);
assert(
  !agents.includes("PR Cockpit") && cockpitPaths.length === 0,
  "repository still contains PR Cockpit instructions or wiring"
);

console.log(
  "ratification valid: path, decision-ID, and disposition-mutation self-checks; links, HTML, JSON, TSV, research hashes, and product invariants passed"
);
