import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  journeyContextPointerSchema,
  journeyRunContextSchema,
  type JourneyRunContext,
} from "./journey-run-context.js";
import { writeScenarioArtifact } from "./host-env.js";
import { publishedEvidence } from "./published-evidence.js";

type RunningJourney = {
  readonly child: ChildProcess;
  readonly completion: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  readonly cwd: string;
  readonly output: string[];
  readonly pointer: string;
  readonly runId: string;
  readonly scenario: string;
};

const repositoryRoot = process.cwd();
const buildManifest = path.join(repositoryRoot, ".cache", "e2e", "prepared.json");
const assertions: Record<string, boolean> = {};
const contexts: JourneyRunContext[] = [];
const running = new Set<RunningJourney>();
const work = await mkdtemp(path.join(tmpdir(), "zoen-journey-runtime-proof-"));
const sentinelProject = `zoen-sentinel-${randomBytes(6).toString("hex")}`;
const sentinelCompose = path.join(work, "sentinel.yaml");
let alternateWorktree: string | undefined;

try {
  await readFile(buildManifest);
  await writeFile(
    sentinelCompose,
    [
      "services:",
      "  sentinel:",
      "    image: postgres:18",
      "    entrypoint: [/bin/sh, -c]",
      "    command: [sleep 1800]",
      "    labels:",
      "      zoen.e2e.sentinel: keep",
      "",
    ].join("\n"),
  );
  composeSentinel("up", "--detach");

  const failureSuite = id("failure-isolation");
  const barrier = path.join(work, "barrier");
  await mkdir(barrier, { recursive: true });
  const interrupted = startJourney({
    barrier,
    runId: "definition-interrupted",
    scenario: "definition-publication",
    suiteId: failureSuite,
  });
  const sibling = startJourney({
    barrier,
    runId: "definition-sibling",
    scenario: "definition-publication",
    suiteId: failureSuite,
  });
  const interruptedContext = await waitForReady(interrupted, barrier);
  const siblingContext = await waitForReady(sibling, barrier);
  contexts.push(interruptedContext, siblingContext);
  verifyDistinctRuns(interruptedContext, siblingContext);
  record(
    "definitionRunsOwnDifferentVolumes",
    composeVolumes(interruptedContext).every(
      (volume) => !composeVolumes(siblingContext).includes(volume),
    ) && composeVolumes(interruptedContext).length > 0,
  );

  await killWithoutCleanup(interrupted);
  await releaseBarrier(siblingContext.runId, barrier);
  await requireSuccess(sibling);
  record("terminatedRunDidNotInterruptSibling", true);

  const retry = startJourney({
    runId: interruptedContext.runId,
    scenario: "definition-publication",
    suiteId: failureSuite,
  });
  await requireSuccess(retry);
  const retryContext = await completedContextOf(retry);
  contexts.push(retryContext);
  record(
    "sameRunIdRetryReconciledStaleOwnership",
    retryContext.attempt > interruptedContext.attempt,
  );

  const semanticSuite = id("semantic-pair");
  const semanticA = startJourney({
    runId: "semantic-a",
    scenario: "semantic-query",
    suiteId: semanticSuite,
  });
  const semanticB = startJourney({
    runId: "semantic-b",
    scenario: "semantic-query",
    suiteId: semanticSuite,
  });
  contexts.push(await contextOf(semanticA), await contextOf(semanticB));
  await Promise.all([requireSuccess(semanticA), requireSuccess(semanticB)]);
  record("sameSemanticScenarioRunsConcurrently", true);

  alternateWorktree = path.join(work, "alternate-worktree");
  execFileSync(
    "/usr/bin/git",
    ["worktree", "add", "--detach", alternateWorktree, "HEAD"],
    { cwd: repositoryRoot, stdio: "inherit" },
  );
  await linkPreparedInputs(alternateWorktree);
  const crossSuite = id("cross-worktree");
  const primaryWorktreeRun = startJourney({
    runId: "primary-worktree",
    scenario: "definition-publication",
    suiteId: crossSuite,
  });
  const alternateWorktreeRun = startJourney({
    cwd: alternateWorktree,
    runId: "alternate-worktree",
    scenario: "definition-publication",
    suiteId: crossSuite,
  });
  const primaryContext = await contextOf(primaryWorktreeRun);
  const alternateContext = await contextOf(alternateWorktreeRun);
  contexts.push(primaryContext, alternateContext);
  verifyDistinctRuns(primaryContext, alternateContext);
  await Promise.all([
    requireSuccess(primaryWorktreeRun),
    requireSuccess(alternateWorktreeRun),
  ]);
  record("differentWorktreesShareAllocatorWithoutSharingState", true);

  const fourSuite = id("four-auth-journeys");
  const four = [
    ["activation-identity", "activation"],
    ["definition-publication", "definition"],
    ["governed-action", "governed"],
    ["messaging-boundary", "messaging"],
  ].map(([scenario, runId]) =>
    startJourney({
      runId: requiredString(runId),
      scenario: requiredString(scenario),
      suiteId: fourSuite,
    }),
  );
  contexts.push(...(await Promise.all(four.map(contextOf))));
  await Promise.all(four.map(requireSuccess));
  record("fourDifferentAuthJourneysRunConcurrently", true);

  for (const context of contexts) {
    cleanupContext(context);
    cleanupContext(context);
  }
  record("cleanupIsSafeTwice", true);
  await assertSuitesClean([failureSuite, semanticSuite, crossSuite, fourSuite]);
  record("ownedDockerAndListenerStateIsEmpty", true);

  record("sentinelComposeProjectSurvived", sentinelRunning());

  if (process.env.ZOEN_E2E_PROOF_SKIP_FULL_SUITE !== "1") {
    const fullSuite = id("bounded-full-suite");
    execFileSync(path.join(repositoryRoot, "e2e", "run.sh"), ["parallel"], {
      cwd: repositoryRoot,
      env: cleanEnvironment({ ZOEN_E2E_SUITE_ID: fullSuite }),
      stdio: "inherit",
    });
    const suiteManifest = publishedEvidence(repositoryRoot).suite;
    record(
      "boundedSuitePublishedOneCompleteBuild",
      suiteManifest.status === "complete" && suiteManifest.suiteId === fullSuite,
    );
    const expectedScenarios = execFileSync(
      process.execPath,
      [path.join(repositoryRoot, "e2e", "scenario-registry.mjs"), "names", "live"],
      { cwd: repositoryRoot, encoding: "utf8" },
    )
      .trim()
      .split(/\s+/)
      .sort();
    const publishedScenarios = suiteManifest.runs
      .map((run) => run.scenario)
      .sort();
    record(
      "boundedSuitePublishedExactScenarioSet",
      JSON.stringify(publishedScenarios) === JSON.stringify(expectedScenarios),
    );
  }

  await writeScenarioArtifact(repositoryRoot, "journey-runtime-proof", {
    assertions,
    contexts: contexts.map((context) => ({
      attempt: context.attempt,
      composeProject:
        context.compose.kind === "compose" ? context.compose.project : null,
      runId: context.runId,
      runRoot: context.paths.runRoot,
      scenario: context.scenario,
      slot: context.lease.slot,
      suiteId: context.suiteId,
    })),
    status: "pass",
  });
} finally {
  for (const journey of running) {
    terminateJourney(journey);
  }
  await Promise.allSettled([...running].map((journey) => journey.completion));
  for (const journey of running) {
    try {
      const context = await currentContextOf(journey);
      if (
        !contexts.some(
          (candidate) =>
            candidate.lease.ownerToken === context.lease.ownerToken,
        )
      ) {
        contexts.push(context);
      }
    } catch {
      // A wrapper may have failed before it published a context pointer.
    }
  }
  for (const context of contexts) {
    try {
      cleanupContext(context);
    } catch {
      // Preserve the proof failure while leaving the owned context for retry.
    }
  }
  try {
    composeSentinel("down", "--volumes", "--remove-orphans");
  } catch {
    // Preserve the primary proof error when sentinel teardown also fails.
  }
  if (alternateWorktree !== undefined) {
    try {
      execFileSync(
        "/usr/bin/git",
        ["worktree", "remove", "--force", alternateWorktree],
        { cwd: repositoryRoot, stdio: "inherit" },
      );
    } catch {
      // Preserve the primary proof error and leave an explicit temporary path.
    }
  }
  await rm(work, { force: true, recursive: true });
}

function startJourney(input: {
  barrier?: string;
  cwd?: string;
  runId: string;
  scenario: string;
  suiteId: string;
}): RunningJourney {
  const cwd = input.cwd ?? repositoryRoot;
  const pointer = path.join(
    work,
    `${input.suiteId}-${input.scenario}-${input.runId}.pointer`,
  );
  const child = spawn(path.join(cwd, "e2e", "run.sh"), ["run", input.scenario], {
    cwd,
    detached: true,
    env: cleanEnvironment({
      ...(input.barrier === undefined
        ? {}
        : { ZOEN_E2E_BARRIER_DIR: input.barrier }),
      ZOEN_E2E_BUILD_MANIFEST: buildManifest,
      ZOEN_E2E_CONTEXT_POINTER: pointer,
      ZOEN_E2E_RUN_ID: input.runId,
      ZOEN_E2E_SUITE_ID: input.suiteId,
    }),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output: string[] = [];
  child.stdout?.on("data", (chunk: Buffer) => appendOutput(output, chunk));
  child.stderr?.on("data", (chunk: Buffer) => appendOutput(output, chunk));
  const completion = new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  const journey = {
    child,
    completion,
    cwd,
    output,
    pointer,
    runId: input.runId,
    scenario: input.scenario,
  };
  running.add(journey);
  return journey;
}

async function requireSuccess(journey: RunningJourney): Promise<void> {
  const outcome = await journey.completion;
  running.delete(journey);
  assert.equal(
    outcome.code,
    0,
    `${journey.scenario}/${journey.runId} failed (${outcome.signal ?? outcome.code}):\n${journey.output.join("")}`,
  );
}

async function killWithoutCleanup(journey: RunningJourney): Promise<void> {
  const pid = journey.child.pid;
  assert.ok(pid !== undefined, "interrupted journey has no pid");
  process.kill(-pid, "SIGKILL");
  const outcome = await journey.completion;
  running.delete(journey);
  assert.notEqual(outcome.code, 0, "interrupted journey unexpectedly succeeded");
}

function terminateJourney(journey: RunningJourney): void {
  const pid = journey.child.pid;
  if (pid === undefined || journey.child.exitCode !== null) {
    return;
  }
  try {
    process.kill(-pid, "SIGTERM");
  } catch (error) {
    if (!(error instanceof Error && "code" in error && Reflect.get(error, "code") === "ESRCH")) {
      throw error;
    }
  }
}

async function contextOf(
  journey: RunningJourney,
  minimumAttempt = 1,
): Promise<JourneyRunContext> {
  for (let attempt = 0; attempt < 2_400; attempt += 1) {
    try {
      const pointer = journeyContextPointerSchema.parse(
        JSON.parse(await readFile(journey.pointer, "utf8")),
      );
      if (pointer.attempt >= minimumAttempt) {
        return journeyRunContextSchema.parse(
          JSON.parse(await readFile(pointer.contextFile, "utf8")),
        );
      }
    } catch (error) {
      if (!(error instanceof Error && "code" in error && Reflect.get(error, "code") === "ENOENT")) {
        throw error;
      }
    }
    await delay(250);
  }
  throw new Error(
    `timed out waiting for ${journey.pointer} at attempt ${minimumAttempt}`,
  );
}

async function currentContextOf(journey: RunningJourney): Promise<JourneyRunContext> {
  const pointer = journeyContextPointerSchema.parse(
    JSON.parse(await readFile(journey.pointer, "utf8")),
  );
  return journeyRunContextSchema.parse(
    JSON.parse(await readFile(pointer.contextFile, "utf8")),
  );
}

async function completedContextOf(journey: RunningJourney): Promise<JourneyRunContext> {
  const contextPath = execFileSync(
    process.execPath,
    [
      path.join(repositoryRoot, "dist", "e2e", "journey-runtime.js"),
      "resolve-pointer",
      "--pointer",
      journey.pointer,
    ],
    { cwd: repositoryRoot, encoding: "utf8" },
  ).trim();
  return journeyRunContextSchema.parse(
    JSON.parse(await readFile(contextPath, "utf8")),
  );
}

async function waitForReady(
  journey: RunningJourney,
  barrier: string,
): Promise<JourneyRunContext> {
  const context = await contextOf(journey);
  await waitForFile(path.join(barrier, `${context.runId}.auth-ready.ready.json`));
  return context;
}

async function releaseBarrier(runId: string, barrier: string): Promise<void> {
  await writeFile(path.join(barrier, `${runId}.auth-ready.release`), "release\n", {
    flag: "wx",
  });
}

async function waitForFile(filePath: string): Promise<string> {
  for (let attempt = 0; attempt < 2_400; attempt += 1) {
    try {
      return await readFile(filePath, "utf8");
    } catch (error) {
      if (!(error instanceof Error && "code" in error && Reflect.get(error, "code") === "ENOENT")) {
        throw error;
      }
    }
    await delay(250);
  }
  throw new Error(`timed out waiting for ${filePath}`);
}

function verifyDistinctRuns(a: JourneyRunContext, b: JourneyRunContext): void {
  assert.equal(a.scenario, b.scenario);
  record("composeProjectsDiffer", composeProject(a) !== composeProject(b));
  record("portSlotsDiffer", a.lease.slot !== b.lease.slot);
  record("authOriginsDiffer", a.ports.auth !== b.ports.auth);
  record("runRootsDiffer", a.paths.runRoot !== b.paths.runRoot);
  record("artifactPathsDiffer", a.paths.artifacts !== b.paths.artifacts);
}

function composeProject(context: JourneyRunContext): string {
  if (context.compose.kind !== "compose") {
    throw new Error(`${context.scenario} has no Compose project`);
  }
  return context.compose.project;
}

function composeVolumes(context: JourneyRunContext): string[] {
  const output = execFileSync(
    "docker",
    [
      "volume",
      "ls",
      "--filter",
      `label=com.docker.compose.project=${composeProject(context)}`,
      "--format",
      "{{.Name}}",
    ],
    { encoding: "utf8" },
  );
  return output.split("\n").filter(Boolean);
}

function cleanupContext(context: JourneyRunContext): void {
  execFileSync(
    process.execPath,
    [
      path.join(repositoryRoot, "dist", "e2e", "journey-runtime.js"),
      "cleanup",
      "--context",
      path.join(context.paths.runRoot, "context.json"),
    ],
    { cwd: repositoryRoot, stdio: "inherit" },
  );
}

async function assertSuitesClean(suiteIds: readonly string[]): Promise<void> {
  for (const suiteId of suiteIds) {
    for (const resource of ["ps", "network", "volume"] as const) {
      const arguments_ =
        resource === "ps"
          ? ["ps", "--all", "--filter", `label=zoen.e2e.suite=${suiteId}`, "--quiet"]
          : [resource, "ls", "--filter", `label=zoen.e2e.suite=${suiteId}`, "--quiet"];
      const output = execFileSync("docker", arguments_, { encoding: "utf8" });
      assert.equal(output.trim(), "", `${resource} resources remain for ${suiteId}`);
    }
  }
  const ports = new Set(contexts.flatMap((context) => Object.values(context.ports)));
  for (const port of ports) {
    assert.equal(await portOpen(port), false, `listener remains on leased port ${port}`);
  }
}

function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    let settled = false;
    const finish = (open: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(open);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(200, () => finish(false));
  });
}

async function linkPreparedInputs(worktree: string): Promise<void> {
  for (const name of ["dist", "node_modules", "target"] as const) {
    await symlink(path.join(repositoryRoot, name), path.join(worktree, name), "dir");
  }
  await symlink(
    path.join(repositoryRoot, "apps", "auth", "node_modules"),
    path.join(worktree, "apps", "auth", "node_modules"),
    "dir",
  );

  // The proof runs before this implementation is committed. Project only the
  // runtime sources needed by the detached checkout while leaving its git root,
  // generated state, artifacts, and Compose resources independent.
  for (const relative of [
    "e2e/run.sh",
    "e2e/scenario-registry.mjs",
    "e2e/scenarios.json",
    "apps/auth/src/config.ts",
  ] as const) {
    const destination = path.join(worktree, relative);
    await rm(destination, { force: true });
    await symlink(path.join(repositoryRoot, relative), destination, "file");
  }
}

function cleanEnvironment(extra: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (!name.startsWith("ZOEN_E2E_") && value !== undefined) {
      environment[name] = value;
    }
  }
  return { ...environment, ...extra };
}

function sentinelRunning(): boolean {
  const output = execFileSync(
    "docker",
    [
      "compose",
      "--project-name",
      sentinelProject,
      "--file",
      sentinelCompose,
      "ps",
      "--quiet",
    ],
    { encoding: "utf8" },
  );
  return output.trim() !== "";
}

function composeSentinel(...arguments_: string[]): void {
  execFileSync(
    "docker",
    [
      "compose",
      "--project-name",
      sentinelProject,
      "--file",
      sentinelCompose,
      ...arguments_,
    ],
    { stdio: "inherit" },
  );
}

function record(name: string, observed: boolean): void {
  assert.ok(observed, name);
  assertions[name] = true;
}

function id(prefix: string): string {
  return `${prefix}-${Date.now()}-${randomBytes(6).toString("hex")}`;
}

function requiredString(value: string | undefined): string {
  assert.ok(value !== undefined);
  return value;
}

function appendOutput(output: string[], chunk: Buffer): void {
  output.push(chunk.toString());
  while (output.join("").length > 65_536) {
    output.shift();
  }
}
