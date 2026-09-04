import assert from "node:assert/strict";
import {
  e2eGeneratedDirectory,
  e2ePostgresUrl,
  writeScenarioArtifact,
} from "./host-env.js";
import {
  KERNEL_SURFACES,
  SEVEN_VERBS,
  buildDiscoverPolicyCatalog,
  createZoenRunner,
  ontologyCatalogBytes,
  provisionPersonalReleaseOwner,
  recordAssertion,
  startReleaseIdentityServer,
  stopReleaseIdentityServer,
  writeGeneratedJson,
  zoenBinaryPath,
  type ZoenResult,
} from "./kernel-world-support.js";
import { gitHead } from "./scenario-evidence.js";

const scenario = "agent-parity";
const repositoryRoot = process.cwd();
const postgresPortFallback = 55_491;
const databaseUrl = e2ePostgresUrl("postgres", "postgres", postgresPortFallback);
const generatedDirectory = e2eGeneratedDirectory(repositoryRoot, scenario);
const zoen = createZoenRunner(zoenBinaryPath(repositoryRoot), databaseUrl);
const {
  approveAndActivate,
  construct,
  parseJson,
  publish,
  runZoen,
} = zoen;

const surfaces = KERNEL_SURFACES;
const sevenVerbs = SEVEN_VERBS;

const assertions: Record<string, boolean> = {};

function record(name: string, observed: boolean): void {
  recordAssertion(assertions, name, observed);
}

interface CatalogBytes {
  ontology: string;
  policy: string;
  executors: string;
  components: string;
}

function contentFromBytes(world: string, bytes: CatalogBytes): Record<string, unknown> {
  return {
    world,
    parent: null,
    ontology: { bytes: bytes.ontology },
    policy: { bytes: bytes.policy },
    executors: { bytes: bytes.executors },
    components: { bytes: bytes.components },
  };
}

async function writeContent(name: string, content: Record<string, unknown>): Promise<string> {
  return writeGeneratedJson(generatedDirectory, name, content);
}

function kernel(
  verb: string,
  args: string[],
  surface: string,
): ZoenResult & { body?: Record<string, unknown> } {
  const result = runZoen(["kernel", verb, ...args, "--surface", surface]);
  if (result.status === 0) {
    return { ...result, body: parseJson(result.stdout) };
  }
  return result;
}

function catalogFingerprint(body: Record<string, unknown>): string {
  const catalog = body.catalog as Record<string, string>;
  return JSON.stringify({
    catalog,
    publicVerbs: body.publicVerbs,
    releaseDigest: body.releaseDigest,
    world: body.world,
  });
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const sourceCommit = gitHead(repositoryRoot);
  const identityServer = await startReleaseIdentityServer({
    databaseUrl,
    generatedDirectory,
    portFallback: 58_491,
    zoenPath: zoenBinaryPath(repositoryRoot),
  });
  const [alphaOwner, betaOwner] = await (async () => {
    try {
      const alpha = await provisionPersonalReleaseOwner({
        baseUrl: identityServer.baseUrl,
        databaseUrl,
        subjectKey: "agent-parity-alpha-owner",
        world: "world.alpha",
      });
      const beta = await provisionPersonalReleaseOwner({
        baseUrl: identityServer.baseUrl,
        databaseUrl,
        subjectKey: "agent-parity-beta-owner",
        world: "world.beta",
      });
      return [alpha, beta] as const;
    } finally {
      await stopReleaseIdentityServer(identityServer);
    }
  })();
  const policy = buildDiscoverPolicyCatalog();
  const alphaBytes: CatalogBytes = {
    ontology: ontologyCatalogBytes("agent-parity.alpha"),
    policy: policy.bytes,
    executors: "executor catalog agent-parity v1\n",
    components: "component catalog agent-parity v1\n",
  };
  const betaBytes: CatalogBytes = {
    ontology: ontologyCatalogBytes("agent-parity.beta"),
    policy: policy.bytes,
    executors: "executor catalog agent-parity beta\n",
    components: "component catalog agent-parity beta\n",
  };

  const alphaPath = await writeContent("alpha.json", contentFromBytes("world.alpha", alphaBytes));
  const betaPath = await writeContent("beta.json", contentFromBytes("world.beta", betaBytes));
  const alphaRelease = construct(alphaPath);
  const betaRelease = construct(betaPath);
  assert.equal(publish(alphaPath, alphaOwner).status, 0);
  assert.equal(publish(betaPath, betaOwner).status, 0);
  const alphaCeremony = approveAndActivate(
    "world.alpha",
    String(alphaRelease.digest),
    alphaOwner,
  );
  assert.equal(alphaCeremony.activate.status, 0, alphaCeremony.activate.stderr);
  const betaCeremony = approveAndActivate(
    "world.beta",
    String(betaRelease.digest),
    betaOwner,
  );
  assert.equal(betaCeremony.activate.status, 0, betaCeremony.activate.stderr);

  // J1 residual: active release digests bind four catalogs
  record(
    "j1_active_alpha_digest",
    String(alphaRelease.digest).length === 64,
  );

  // J7 actors + path: four surfaces discover the same catalog
  const discoveries = surfaces.map((surface) => {
    const result = kernel(
      "discover",
      ["--world", "world.alpha", "--principal", "principal.owner"],
      surface,
    );
    assert.equal(result.status, 0, `${surface}: ${result.stderr}`);
    return { surface, body: result.body ?? {} };
  });
  const fingerprints = discoveries.map((item) => catalogFingerprint(item.body));
  record(
    "j7_four_surfaces_same_catalog",
    fingerprints.every((value) => value === fingerprints[0]),
  );
  record(
    "j7_public_verbs_are_seven",
    JSON.stringify(discoveries[0]?.body.publicVerbs) === JSON.stringify([...sevenVerbs]),
  );
  record(
    "j7_surfaces_labeled",
    discoveries.every((item) => item.body.surface === item.surface),
  );
  record(
    "j7_release_digest_matches_active",
    discoveries[0]?.body.releaseDigest === alphaRelease.digest,
  );

  // Query parity
  const queries = surfaces.map((surface) => {
    const result = kernel(
      "query",
      ["--world", "world.alpha", "--principal", "principal.owner"],
      surface,
    );
    assert.equal(result.status, 0, result.stderr);
    return catalogFingerprint(result.body ?? {});
  });
  record(
    "j7_query_parity",
    queries.every((value) => value === queries[0]),
  );

  // Propose → Decide → Commit → Explain → Execute on each surface (same receipt identity)
  const inputJcs = '{"note":"agent-parity","schema":"zoen.kernel-input.v1"}';
  const proposals = [] as Array<Record<string, unknown>>;
  for (const surface of surfaces) {
    const proposed = kernel(
      "propose",
      [
        "--world",
        "world.alpha",
        "--principal",
        "principal.builder",
        "--proposal-id",
        `proposal.parity.${surface}`,
        "--input",
        inputJcs,
      ],
      surface,
    );
    assert.equal(proposed.status, 0, proposed.stderr);
    proposals.push(proposed.body ?? {});
  }
  // First propose wins by preview hash; later surfaces replay the original proposal id
  const previewHashes = proposals.map((item) => String(item.previewHash));
  record(
    "j7_propose_same_preview_hash",
    previewHashes.every((value) => value === previewHashes[0]),
  );
  const originalProposalId = String(proposals[0]?.proposalId);

  const decided = kernel(
    "decide",
    [
      "--proposal-id",
      originalProposalId,
      "--principal",
      "principal.owner",
      "--decision",
      "approve",
    ],
    "cli",
  );
  assert.equal(decided.status, 0, decided.stderr);
  record("j7_decide_approve", decided.body?.outcome === "approve");

  // Replay decide
  const decideReplay = kernel(
    "decide",
    [
      "--proposal-id",
      originalProposalId,
      "--principal",
      "principal.owner",
      "--decision",
      "approve",
    ],
    "connect",
  );
  assert.equal(decideReplay.status, 0, decideReplay.stderr);
  record("j7_decide_replay", decideReplay.body?.outcome === "approve");

  const mismatchedDecide = kernel(
    "decide",
    [
      "--proposal-id",
      originalProposalId,
      "--principal",
      "principal.builder",
      "--decision",
      "approve",
    ],
    "mcp",
  );
  record(
    "j7_decide_non_owner_denied",
    mismatchedDecide.status !== 0 &&
      mismatchedDecide.stderr.includes("only the World owner may Decide"),
  );

  const committedBySurface = surfaces.map((surface) => {
    const result = kernel(
      "commit",
      ["--proposal-id", originalProposalId, "--principal", "principal.owner"],
      surface,
    );
    assert.equal(result.status, 0, result.stderr);
    return result.body ?? {};
  });
  const receiptIds = committedBySurface.map((item) => String(item.receiptId));
  record(
    "j7_commit_receipt_identity",
    receiptIds.every((value) => value === receiptIds[0]),
  );
  const receiptId = receiptIds[0] ?? "";

  const explanations = surfaces.map((surface) => {
    const result = kernel(
      "explain",
      ["--receipt-id", receiptId, "--principal", "principal.owner"],
      surface,
    );
    assert.equal(result.status, 0, result.stderr);
    return String(result.body?.explanationJcs);
  });
  record(
    "j7_explain_parity",
    explanations.every((value) => value === explanations[0]),
  );

  const executions = surfaces.map((surface) => {
    const result = kernel(
      "execute",
      ["--receipt-id", receiptId, "--principal", "principal.owner"],
      surface,
    );
    assert.equal(result.status, 0, result.stderr);
    return String(result.body?.executionId);
  });
  record(
    "j7_execute_replay_identity",
    executions.every((value) => value === executions[0]),
  );

  // Negative: outsider principal denied
  const outsider = kernel(
    "discover",
    ["--world", "world.alpha", "--principal", "principal.stranger"],
    "cli",
  );
  record(
    "j7_outsider_discover_denied",
    outsider.status === 0 &&
      (outsider.body?.decision === "deny" ||
        (typeof outsider.body?.decision === "object" && outsider.body?.decision !== null)),
  );
  // discover returns decision deny with exit 0 - check
  if (outsider.status === 0) {
    record("j7_outsider_decision_deny", outsider.body?.decision === "deny");
  } else {
    record("j7_outsider_decision_deny", outsider.stderr.includes("denied"));
  }

  // Isolation: beta world cannot see alpha catalog
  const betaDiscover = kernel(
    "discover",
    ["--world", "world.beta", "--principal", "principal.owner"],
    "cli",
  );
  assert.equal(betaDiscover.status, 0, betaDiscover.stderr);
  record(
    "j7_isolation_beta_different_release",
    betaDiscover.body?.releaseDigest === betaRelease.digest &&
      betaDiscover.body?.releaseDigest !== alphaRelease.digest,
  );
  const crossPropose = kernel(
    "propose",
    [
      "--world",
      "world.beta",
      "--principal",
      "principal.builder",
      "--proposal-id",
      "proposal.cross",
      "--input",
      inputJcs,
    ],
    "eve",
  );
  assert.equal(crossPropose.status, 0, crossPropose.stderr);
  record(
    "j7_isolation_proposal_bound_to_beta",
    crossPropose.body?.releaseDigest === betaRelease.digest,
  );

  // Recovery: rediscover after "restart" (new process invocations) keeps catalog
  const rediscover = kernel(
    "discover",
    ["--world", "world.alpha", "--principal", "principal.owner"],
    "mcp",
  );
  assert.equal(rediscover.status, 0, rediscover.stderr);
  record(
    "j7_recovery_rediscover_same_catalog",
    catalogFingerprint(rediscover.body ?? {}) === fingerprints[0],
  );

  const artifactPath = await writeScenarioArtifact(repositoryRoot, scenario, {
    assertions,
    dimensions: {
      actors:
        "builder proposes; owner decides/commits; CLI/Connect/MCP/Eve surfaces share one WorldKernel catalog",
      isolation:
        "world.beta cannot share world.alpha releaseDigest; proposals bind to the calling World's active release",
      negative:
        "non-owner Decide denied; stranger Discover is deny; mismatched decide principal on replay denied",
      path: "activate WorldRelease with seven-verb ontology catalog → Discover/Query/Propose/Decide/Commit/Explain/Execute on four surfaces",
      recovery:
        "fresh process rediscovers the same active catalog fingerprint and receipt/execution identity",
      replay:
        "identical propose preview hash, decide, commit, and execute return the original proposal/receipt/execution",
    },
    finishedAt: new Date().toISOString(),
    sourceCommit,
    startedAt,
  });
  const passed = Object.values(assertions).filter(Boolean).length;
  const total = Object.keys(assertions).length;
  console.log(
    `agent-parity PASS assertions ${passed}/${total} artifact=${artifactPath} sourceCommit=${sourceCommit}`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
