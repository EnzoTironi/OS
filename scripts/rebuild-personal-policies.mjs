// Rebuilds deploy/fly/policies.json personal.* entries against the current
// testdata/lakes/personal.canonical.json digest.
//
// Why this exists: the Cedar evaluator indexes policies by
// (definition_digest, action_id). Any change to the personal canonical
// definition changes its sha256, which silently orphans every personal.*
// policy unless their definitionDigest is re-pinned. This script re-pins the
// three personal entries (writeMemory, createReminder, activation) and upserts
// the workshop.deployApp policy pair. It is idempotent: a second run prints
// "unchanged" and leaves the file byte-identical.
//
// Usage: node scripts/rebuild-personal-policies.mjs

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const CANONICAL_PATH = "testdata/lakes/personal.canonical.json";
const MANIFEST_PATH = "deploy/fly/policies.json";

const WORKSHOP_ACTION_ID = "workshop.deployApp";
const WORKSHOP_POLICY_ID = "policy.workshop.deployApp.r2";
const WORKSHOP_POLICY_REVISION = 2;

const PERSONAL_ACTION_IDS = new Set([
  "personal.writeMemory",
  "personal.createReminder",
]);
const PERSONAL_ACTIVATION_POLICY_ID = "policy.personal.activation.r1";

const sha256 = (text) => createHash("sha256").update(text).digest("hex");

const canonical = readFileSync(CANONICAL_PATH, "utf8");
const definitionDigest = sha256(canonical);

const workshopSource = `@id("workshop-deployApp-discover")
permit (
    principal,
    action == Action::"discover",
    resource
)
when {
    context.actionId == "workshop.deployApp"
};

@id("workshop-deployApp-commit")
permit (
    principal,
    action == Action::"commit",
    resource
)
when {
    context.actionId == "workshop.deployApp"
};
`;

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));

let repinned = 0;
for (const entry of manifest.policies) {
  const isPersonal =
    PERSONAL_ACTION_IDS.has(entry.actionId) ||
    entry.policyId === PERSONAL_ACTIVATION_POLICY_ID;
  if (!isPersonal) {
    continue;
  }
  entry.definitionDigest = definitionDigest;
  repinned += 1;
}
if (repinned !== 3) {
  console.error(`expected 3 personal entries, found ${repinned}`);
  process.exit(1);
}

const workshopEntry = {
  actionId: WORKSHOP_ACTION_ID,
  definitionDigest,
  digest: sha256(workshopSource),
  policyId: WORKSHOP_POLICY_ID,
  revision: WORKSHOP_POLICY_REVISION,
  source: workshopSource,
};

const existing = manifest.policies.findIndex(
  (entry) => entry.policyId === WORKSHOP_POLICY_ID,
);
if (existing === -1) {
  manifest.policies.push(workshopEntry);
} else {
  manifest.policies[existing] = workshopEntry;
}

// Stable key order matches the checked-in manifest style.
const order = (entry) => ({
  actionId: entry.actionId,
  definitionDigest: entry.definitionDigest,
  digest: entry.digest,
  policyId: entry.policyId,
  revision: entry.revision,
  source: entry.source,
});
const next = `${JSON.stringify({ policies: manifest.policies.map(order) }, null, 2)}\n`;
const previous = readFileSync(MANIFEST_PATH, "utf8");

if (next === previous) {
  console.log(`unchanged: ${MANIFEST_PATH} already pinned to ${definitionDigest}`);
} else {
  writeFileSync(MANIFEST_PATH, next);
  console.log(`updated: ${MANIFEST_PATH} pinned to ${definitionDigest}`);
  console.log(`workshop policy digest: ${workshopEntry.digest}`);
}
