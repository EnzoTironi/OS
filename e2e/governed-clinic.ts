import assert from "node:assert/strict";
import { e2ePostgresUrl, writeScenarioArtifact } from "./host-env.js";
import {
  createZoenRunner,
  recordAssertion,
  zoenBinaryPath,
} from "./kernel-world-support.js";
import { gitHead } from "./scenario-evidence.js";

const scenario = "governed-clinic";
const repositoryRoot = process.cwd();
const databaseUrl = e2ePostgresUrl("postgres", "postgres", 55_492);
const zoen = createZoenRunner(zoenBinaryPath(repositoryRoot), databaseUrl);
const assertions: Record<string, boolean> = {};

function record(name: string, observed: boolean): void {
  recordAssertion(assertions, name, observed);
}

const startedAt = new Date().toISOString();
const sourceCommit = gitHead(repositoryRoot);

// W2-06 used to seed arbitrary objects and grants through this public command.
// That path bypassed Membership and policy authority, so its apparent J4/FIN-05
// proof was invalid. Keep this required CI scenario as a regression sentinel
// until W2-06 owns a governed materialization path and a canonical J4 journey.
const plantObject = zoen.runZoen([
  "kernel",
  "plant-object",
  "--world",
  "world.clinic",
  "--principal",
  "principal.owner",
  "--type",
  "clinic.Patient",
  "--object-id",
  "patient.ada",
  "--fields",
  '{"name":"Ada"}',
]);
record("obsolete_public_plant_object_rejected", plantObject.status !== 0);

// The CLI is one real surface. A caller cannot relabel it as Connect, MCP, or
// Eve and turn a single code path into a parity proof.
const relabeledCli = zoen.runZoen([
  "kernel",
  "discover",
  "--world",
  "world.clinic",
  "--principal",
  "principal.clinic.human",
  "--membership",
  "membership.clinic.human",
  "--surface",
  "eve",
]);
record("caller_selected_surface_rejected", relabeledCli.status !== 0);

assert.equal(Object.values(assertions).every(Boolean), true);
const artifactPath = await writeScenarioArtifact(repositoryRoot, scenario, {
  assertions,
  canonicalJourneyVerdict: "NOT_EVALUATED",
  dimensions: {
    actors: "NOT_EVALUATED — no authenticated clinic actor journey runs in this sentinel",
    isolation: "NOT_EVALUATED — requires governed grants, a second World, and real interfaces",
    negative:
      "obsolete public object planting and caller-selected surface labels are rejected",
    path: "CLI parser regression sentinel only",
    recovery: "NOT_EVALUATED — requires a production server and database/key restart",
    replay: "NOT_EVALUATED — requires server-issued authority and opaque cursors",
  },
  finalGates: {
    "FIN-05": {
      proofPending:
        "ObjectView, dense series, field/series/purpose authority, IBM pack, and real CLI/Connect/MCP/Eve paths",
      verdict: "NOT_EVALUATED",
    },
  },
  finishedAt: new Date().toISOString(),
  interfacesProven: ["cli-parser"],
  journey: "J4",
  proofPending: [
    "server-issued Membership authority before discovery",
    "governed materialization and revocable grants",
    "keyed opaque cursor bound to the complete operation basis",
    "real server-budgeted compute and Explain evidence",
    "CLI, Connect, inbound MCP, and Eve production paths",
  ],
  sourceCommit,
  startedAt,
  unit: "W2-06",
});

console.log(
  `governed-clinic PASS substrate-sentinel assertions ${Object.keys(assertions).length}/${Object.keys(assertions).length} canonicalJourneyVerdict=NOT_EVALUATED artifact=${artifactPath} sourceCommit=${sourceCommit}`,
);
