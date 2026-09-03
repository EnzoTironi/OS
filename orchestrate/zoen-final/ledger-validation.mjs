const LEDGER_HEADER =
  "unit_id\tpr\thead_sha\tmerge_sha\tverdict\tevidence\tverifier\tverified_at\tmerged_at";
const ALLOWED_VERDICTS = new Set(["journey-verified", "live-ui-verified"]);
const EVIDENCE_PATH = /^orchestrate\/zoen-final\/reports\/[a-z0-9-]+\.md$/;
const SHA = /^[0-9a-f]{40}$/;
const POSITIVE_PULL_REQUEST = /^[1-9][0-9]*$/;
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const TRAILING_NEWLINE = /\n$/;

const fail = (message) => {
  throw new Error(message);
};

const parseRow = (line, index) => {
  const fields = line.split("\t");
  if (fields.length !== 9) {
    fail(`ledger row ${index + 2} has ${fields.length} fields`);
  }
  return {
    evidence: fields[5],
    headSha: fields[2],
    mergedAt: fields[8],
    mergeSha: fields[3],
    pr: fields[1],
    unitId: fields[0],
    verdict: fields[4],
    verifiedAt: fields[7],
    verifier: fields[6],
  };
};

export const parseLedger = (ledgerText) => {
  const lines = ledgerText.replace(TRAILING_NEWLINE, "").split("\n");
  if (lines[0] !== LEDGER_HEADER) {
    fail("ledger.tsv header does not match ledger-schema.md");
  }
  return lines.slice(1).map(parseRow);
};

const requiresLedgerVerdict = (unit) =>
  unit.status === "done" && (unit.wave > 0 || unit.pr !== undefined);

const mergeFactsState = (unit, row, requiresCompleteMergeFacts) => {
  if (
    SHA.test(unit.mergeSha) &&
    SHA.test(row.mergeSha) &&
    UTC_TIMESTAMP.test(row.mergedAt)
  ) {
    return "complete";
  }
  if (
    !requiresCompleteMergeFacts &&
    unit.mergeSha === undefined &&
    row.mergeSha === "" &&
    row.mergedAt === ""
  ) {
    return "pending";
  }
  return "invalid";
};

const validateRow = (unit, row) => {
  const mergeState = mergeFactsState(unit, row, requiresLedgerVerdict(unit));
  if (
    !Number.isSafeInteger(unit.pr) ||
    unit.pr <= 0 ||
    !POSITIVE_PULL_REQUEST.test(row.pr) ||
    !SHA.test(unit.headSha) ||
    !SHA.test(row.headSha) ||
    mergeState === "invalid"
  ) {
    fail(
      `${row.unitId} ledger identity requires a valid positive pull request and exact lowercase SHAs`
    );
  }
  if (
    String(unit.pr) !== row.pr ||
    unit.headSha !== row.headSha ||
    (mergeState === "complete" && unit.mergeSha !== row.mergeSha) ||
    !ALLOWED_VERDICTS.has(row.verdict) ||
    !EVIDENCE_PATH.test(row.evidence) ||
    row.verifier.length === 0 ||
    !UTC_TIMESTAMP.test(row.verifiedAt)
  ) {
    fail(
      `${row.unitId} ledger verdict does not match its exact implementation`
    );
  }
};

const validateDoneUnit = (unit, rows) => {
  if (
    !Number.isSafeInteger(unit.pr) ||
    unit.pr <= 0 ||
    !SHA.test(unit.headSha) ||
    !SHA.test(unit.mergeSha)
  ) {
    fail(
      `${unit.id} ledger identity requires a valid positive pull request and exact lowercase SHAs`
    );
  }
  if (rows.filter(({ unitId }) => unitId === unit.id).length !== 1) {
    fail(
      `${unit.id} done implementation must have exactly one immutable ledger verdict`
    );
  }
};

export const validateLedgerEvidence = (row, evidence) => {
  if (!evidence.includes(row.headSha)) {
    fail(`${row.unitId} ledger evidence does not name its exact head SHA`);
  }
};

export const validateImplementationLedger = (units, rows) => {
  const unitsById = new Map(units.map((unit) => [unit.id, unit]));
  for (const row of rows) {
    const unit = unitsById.get(row.unitId);
    if (!unit) {
      fail(`ledger names unknown unit ${row.unitId}`);
    }
    validateRow(unit, row);
  }
  for (const unit of units.filter(requiresLedgerVerdict)) {
    validateDoneUnit(unit, rows);
  }
};

const expectFailure = (action, expectedMessage, label) => {
  let message = "";
  try {
    action();
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  if (!message.includes(expectedMessage)) {
    fail(`${label} did not reject the invalid fixture`);
  }
};

const fixtureUnit = {
  headSha: "a".repeat(40),
  id: "W9-99",
  mergeSha: "b".repeat(40),
  pr: 999,
  status: "done",
  wave: 9,
};
const fixtureRow = {
  evidence: "orchestrate/zoen-final/reports/w9-99-validation.md",
  headSha: fixtureUnit.headSha,
  mergedAt: "2026-09-03T00:01:00Z",
  mergeSha: fixtureUnit.mergeSha,
  pr: String(fixtureUnit.pr),
  unitId: fixtureUnit.id,
  verdict: "journey-verified",
  verifiedAt: "2026-09-03T00:00:00Z",
  verifier: "independent-verifier",
};
const w0FixtureUnit = { ...fixtureUnit, id: "W0-05", pr: 620, wave: 0 };
const w0FixtureRow = {
  ...fixtureRow,
  pr: String(w0FixtureUnit.pr),
  unitId: w0FixtureUnit.id,
};
const invalidFixtures = [
  [
    "blank W2-02 implementation ledger self-check",
    {
      headSha: undefined,
      id: "W2-02",
      mergeSha: undefined,
      pr: undefined,
      wave: 2,
    },
    {
      evidence: "orchestrate/zoen-final/reports/w1-01-validation.md",
      headSha: "",
      mergeSha: "",
      pr: "",
      unitId: "W2-02",
    },
  ],
  ["zero pull request ledger self-check", { pr: 0 }, { pr: "0" }],
  ["negative pull request ledger self-check", { pr: -1 }, { pr: "-1" }],
  [
    "uppercase head SHA ledger self-check",
    { headSha: "A".repeat(40) },
    { headSha: "A".repeat(40) },
  ],
  [
    "short head SHA ledger self-check",
    { headSha: "a".repeat(39) },
    { headSha: "a".repeat(39) },
  ],
  [
    "uppercase merge SHA ledger self-check",
    { mergeSha: "B".repeat(40) },
    { mergeSha: "B".repeat(40) },
  ],
  [
    "short merge SHA ledger self-check",
    { mergeSha: "b".repeat(39) },
    { mergeSha: "b".repeat(39) },
  ],
];

export const runLedgerSelfChecks = () => {
  for (const [label, unitOverride, rowOverride] of invalidFixtures) {
    expectFailure(
      () =>
        validateImplementationLedger(
          [{ ...fixtureUnit, ...unitOverride }],
          [{ ...fixtureRow, ...rowOverride }]
        ),
      "valid positive pull request and exact lowercase SHAs",
      label
    );
  }
  expectFailure(
    () => validateImplementationLedger([fixtureUnit], []),
    "exactly one immutable ledger verdict",
    "missing implementation ledger self-check"
  );
  expectFailure(
    () => validateImplementationLedger([w0FixtureUnit], []),
    "exactly one immutable ledger verdict",
    "missing W0-05 ledger self-check"
  );
  expectFailure(
    () =>
      validateImplementationLedger(
        [w0FixtureUnit],
        [w0FixtureRow, w0FixtureRow]
      ),
    "exactly one immutable ledger verdict",
    "duplicate W0-05 ledger self-check"
  );
  expectFailure(
    () =>
      validateImplementationLedger(
        [fixtureUnit],
        [{ ...fixtureRow, headSha: "c".repeat(40) }]
      ),
    "does not match its exact implementation",
    "mismatched implementation ledger self-check"
  );
  expectFailure(
    () => validateLedgerEvidence(w0FixtureRow, "tampered evidence\n"),
    "does not name its exact head SHA",
    "tampered W0-05 evidence self-check"
  );
};

export const parseAndValidateImplementationLedger = (units, ledgerText) => {
  runLedgerSelfChecks();
  const rows = parseLedger(ledgerText);
  validateImplementationLedger(units, rows);
  return rows;
};
