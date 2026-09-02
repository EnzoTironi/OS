import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  journeyContextPointerSchema,
  journeyRunContextSchema,
  type JourneyRunContext,
} from "../journey-run-context.js";
import {
  commandTimeoutMilliseconds,
  journeyTimeoutMilliseconds,
  repositoryRoot,
} from "./proof-config.js";
import type { RunningJourney, TrackedProcess } from "./proof-contracts.js";
import { contexts } from "./proof-state.js";
import { cleanEnvironment, executeSync, inspectionEnvironment } from "./proof-environment.js";
import {
  childOutcomeText,
  formatOutput,
  isMissingFile,
  record,
  writeFileExclusive,
} from "./proof-support.js";

export async function contextOf(
  journey: RunningJourney,
  minimumAttempt = 1,
): Promise<JourneyRunContext> {
  const deadline = Date.now() + commandTimeoutMilliseconds;
  while (Date.now() < deadline) {
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
      if (!isMissingFile(error)) {
        throw error;
      }
    }
    if (journey.isSettled()) {
      const outcome = await journey.completion;
      throw new Error(
        `${journey.scenario}/${journey.runId} exited before publishing context (${childOutcomeText(outcome)}):\n${formatOutput(journey.output)}`,
      );
    }
    await delay(100);
  }
  throw new Error(
    `timed out waiting for ${journey.pointer} at attempt ${minimumAttempt}`,
  );
}

export async function currentContextOf(
  journey: RunningJourney,
): Promise<JourneyRunContext> {
  const pointer = journeyContextPointerSchema.parse(
    JSON.parse(await readFile(journey.pointer, "utf8")),
  );
  return journeyRunContextSchema.parse(
    JSON.parse(await readFile(pointer.contextFile, "utf8")),
  );
}

export async function maybeCurrentContextOf(
  journey: RunningJourney,
): Promise<JourneyRunContext | undefined> {
  try {
    return await currentContextOf(journey);
  } catch (error) {
    if (isMissingFile(error)) {
      return undefined;
    }
    throw error;
  }
}

export async function completedContextOf(
  journey: RunningJourney,
): Promise<JourneyRunContext> {
  const contextPath = executeSync(
    path.join(repositoryRoot, "e2e", "run.sh"),
    ["resolve-pointer", journey.pointer],
    {
      cwd: repositoryRoot,
      environment: cleanEnvironment({}),
      timeout: 30_000,
    },
  ).stdout.trim();
  return journeyRunContextSchema.parse(
    JSON.parse(await readFile(contextPath, "utf8")),
  );
}

export async function waitForReady(
  journey: RunningJourney,
  barrier: string,
): Promise<JourneyRunContext> {
  const context = await contextOf(journey);
  await waitForFile(
    path.join(barrier, `${context.runId}.auth-ready.ready.json`),
    journeyTimeoutMilliseconds,
  );
  return context;
}

export async function releaseBarrier(runId: string, barrier: string): Promise<void> {
  await writeFileExclusive(
    path.join(barrier, `${runId}.auth-ready.release`),
    "release\n",
  );
}

export async function releaseRuntimeBarrier(
  runId: string,
  barrier: string,
  stage: string,
): Promise<void> {
  await writeFileExclusive(
    path.join(barrier, `${runId}.${stage}.release`),
    "release\n",
  );
}

export async function waitForFile(
  filePath: string,
  milliseconds: number,
): Promise<string> {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) {
    try {
      return await readFile(filePath, "utf8");
    } catch (error) {
      if (!isMissingFile(error)) {
        throw error;
      }
    }
    await delay(100);
  }
  throw new Error(`timed out waiting for ${filePath}`);
}

export async function waitForBarrierCount(
  directory: string,
  count: number,
): Promise<void> {
  const deadline = Date.now() + journeyTimeoutMilliseconds;
  while (Date.now() < deadline) {
    try {
      const ready = (await readdir(directory)).filter((entry) =>
        entry.endsWith(".auth-ready.ready.json"),
      );
      if (ready.length >= count) {
        return;
      }
    } catch (error) {
      if (!isMissingFile(error)) {
        throw error;
      }
    }
    await delay(100);
  }
  throw new Error(`timed out waiting for ${count} barriers in ${directory}`);
}

export async function contextsUnderSuite(
  suiteId: string,
): Promise<JourneyRunContext[]> {
  const suiteRoot = path.join(repositoryRoot, ".cache", "e2e", "suites", suiteId);
  let entries;
  try {
    entries = await readdir(suiteRoot, { withFileTypes: true });
  } catch (error) {
    if (isMissingFile(error)) {
      return [];
    }
    throw error;
  }
  const found: JourneyRunContext[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".pointer")) {
      continue;
    }
    const pointer = journeyContextPointerSchema.parse(
      JSON.parse(await readFile(path.join(suiteRoot, entry.name), "utf8")),
    );
    const context = journeyRunContextSchema.parse(
      JSON.parse(await readFile(pointer.contextFile, "utf8")),
    );
    assert.equal(
      context.suiteId,
      suiteId,
      `suite pointer ${entry.name} resolves to foreign suite ${context.suiteId}`,
    );
    if (
      !found.some(
        (candidate) => candidate.lease.ownerToken === context.lease.ownerToken,
      )
    ) {
      found.push(context);
    }
  }
  return found;
}

export function rememberContext(context: JourneyRunContext): void {
  if (
    !contexts.some(
      (candidate) => candidate.lease.ownerToken === context.lease.ownerToken,
    )
  ) {
    contexts.push(context);
  }
}

export function assertOwnedProcess(
  pid: number,
  ownerNonce: string,
  expectedPgid: number,
): void {
  const inspected = spawnSync(
    "/bin/ps",
    ["-ww", "-o", "pgid=,command=", "-p", String(pid)],
    {
      encoding: "utf8",
      env: inspectionEnvironment(),
      killSignal: "SIGKILL",
      timeout: 5_000,
    },
  );
  assert.equal(
    inspected.error,
    undefined,
    `cannot inspect owned process ${pid}: ${inspected.error?.message}`,
  );
  assert.equal(inspected.status, 0, `cannot inspect owned process ${pid}`);
  const match = /^\s*([0-9]+)\s+(.*)$/.exec(inspected.stdout.trim());
  assert.ok(match?.[1] !== undefined && match[2] !== undefined);
  assert.equal(Number(match[1]), expectedPgid);
  assert.ok(match[2].includes(ownerNonce));
}

export async function waitForOwnedProcess(process_: TrackedProcess): Promise<void> {
  const deadline = Date.now() + 5_000;
  const pid = requiredPid(process_);
  while (Date.now() < deadline) {
    try {
      assertOwnedProcess(pid, process_.ownerNonce, pid);
      return;
    } catch (error) {
      if (process_.isSettled()) {
        throw error;
      }
    }
    await delay(10);
  }
  throw new Error(`process ${pid} did not publish its exact command authority`);
}

export function requiredPid(process_: TrackedProcess): number {
  const pid = process_.child.pid;
  assert.ok(pid !== undefined, "owned child has no pid");
  return pid;
}

export async function waitForProcessGroupEmpty(
  pgid: number,
  milliseconds: number,
): Promise<void> {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) {
    if (processGroupMembers(pgid).length === 0) {
      return;
    }
    await delay(100);
  }
  throw new Error(`process group ${pgid} did not become empty`);
}

export function processGroupMembers(pgid: number): number[] {
  const inspected = spawnSync("/bin/ps", ["-axo", "pid=,pgid="], {
    encoding: "utf8",
    env: inspectionEnvironment(),
    killSignal: "SIGKILL",
    timeout: 5_000,
  });
  assert.equal(
    inspected.error,
    undefined,
    `cannot inspect process group ${pgid}: ${inspected.error?.message}`,
  );
  assert.equal(inspected.status, 0, `cannot inspect process group ${pgid}`);
  return inspected.stdout.split("\n").flatMap((line) => {
    const match = /^\s*([0-9]+)\s+([0-9]+)\s*$/.exec(line);
    return match?.[1] !== undefined && Number(match[2]) === pgid
      ? [Number(match[1])]
      : [];
  });
}

export function verifyDistinctRuns(a: JourneyRunContext, b: JourneyRunContext): void {
  assert.equal(a.scenario, b.scenario);
  record("composeProjectsDiffer", composeProject(a) !== composeProject(b));
  record("portSlotsDiffer", a.lease.slot !== b.lease.slot);
  record("authOriginsDiffer", a.ports.auth !== b.ports.auth);
  record("runRootsDiffer", a.paths.runRoot !== b.paths.runRoot);
  record("artifactPathsDiffer", a.paths.artifacts !== b.paths.artifacts);
}

export function composeProject(context: JourneyRunContext): string {
  if (context.compose.kind !== "compose") {
    throw new Error(`${context.scenario} has no Compose project`);
  }
  return context.compose.project;
}

export function composeVolumes(context: JourneyRunContext): string[] {
  const output = executeSync(
    "docker",
    [
      "volume",
      "ls",
      "--filter",
      `label=com.docker.compose.project=${composeProject(context)}`,
      "--format",
      "{{.Name}}",
    ],
    { timeout: 30_000 },
  ).stdout;
  return output.split("\n").filter(Boolean);
}
