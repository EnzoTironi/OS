import { randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, realpath, rename, rm } from "node:fs/promises";
import path from "node:path";
import { writeJsonAtomically, type JourneyRunContext } from "../journey-run-context.js";
import {
  cleanupResultSchema,
  idSchema,
  runResultSchema,
} from "./runtime-contracts.js";
import { requiredFlag } from "./runtime-config.js";
import { copyDirectory, jsonObject } from "./runtime-support.js";
import { assertCleanWorktree, git } from "./runtime-process-authority.js";
import {
  acquireOwnedLock,
  assertRuntimeBootstrapReader,
  readPreparedBuild,
  releaseOwnedLock,
} from "./runtime-registry.js";
import { latestCompletedContext } from "./runtime-context.js";

export async function aggregateCommand(): Promise<void> {
  const repository = await realpath(process.cwd());
  await assertRuntimeBootstrapReader(repository);
  assertCleanWorktree(repository);
  const suiteId = idSchema.parse(requiredFlag("--suite-id"));
  const expected = requiredFlag("--expected-scenarios")
    .split(",")
    .filter(Boolean)
    .map((scenario) => idSchema.parse(scenario));
  if (expected.length === 0 || new Set(expected).size !== expected.length) {
    throw new Error("aggregate requires a non-empty unique scenario set");
  }
  const contextListPath = path.resolve(requiredFlag("--context-list"));
  const pointers = (await readFile(contextListPath, "utf8"))
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const contexts = await Promise.all(
    pointers.map((pointer) => latestCompletedContext(pointer, repository)),
  );
  const byScenario = new Map<string, JourneyRunContext>();
  for (const context of contexts) {
    if (context.suiteId !== suiteId) {
      throw new Error(
        `context ${context.runId} belongs to suite ${context.suiteId}, expected ${suiteId}`,
      );
    }
    if (byScenario.has(context.scenario)) {
      throw new Error(`suite ${suiteId} contains duplicate ${context.scenario} runs`);
    }
    byScenario.set(context.scenario, context);
  }
  if (
    byScenario.size !== expected.length ||
    expected.some((scenario) => !byScenario.has(scenario))
  ) {
    throw new Error(`suite ${suiteId} is incomplete`);
  }
  const prepared = await readPreparedBuild(repository);
  const sourceSha = git(repository, ["rev-parse", "HEAD"]);
  const token = randomBytes(16).toString("hex");
  const artifactsRoot = path.join(repository, "artifacts");
  const stagingRoot = path.join(artifactsRoot, `.publish-${suiteId}-${token}`);
  const generationName = `${suiteId}-${token}`;
  const generationRoot = path.join(artifactsRoot, "generations", generationName);
  const lockDirectory = path.join(artifactsRoot, ".suite-publication.lock");
  await mkdir(path.dirname(generationRoot), { recursive: true });
  const publicationLock = await acquireOwnedLock(
    lockDirectory,
    "journey suite publication",
  );
  try {
    await removeOrphanPublicationStages(artifactsRoot);
    await mkdir(stagingRoot, { recursive: true });
    const manifestRuns: Array<Record<string, unknown>> = [];
    for (const scenario of expected) {
      const context = byScenario.get(scenario);
      if (context === undefined) {
        throw new Error(`missing context for ${scenario}`);
      }
      if (
        context.sourceSha !== sourceSha ||
        context.sourceSha !== prepared.sourceSha ||
        context.buildIdentity !== prepared.buildIdentity
      ) {
        throw new Error(`mixed source or build identity in ${scenario}`);
      }
      const result = runResultSchema.parse(
        JSON.parse(await readFile(path.join(context.paths.runRoot, "result.json"), "utf8")),
      );
      if (
        result.status !== "passed" ||
        result.ownerToken !== context.lease.ownerToken ||
        result.sourceSha !== sourceSha ||
        result.buildIdentity !== prepared.buildIdentity
      ) {
        throw new Error(`run ${context.runId} is not complete and publishable`);
      }
      const cleanup = cleanupResultSchema.parse(
        JSON.parse(
          await readFile(path.join(context.paths.runRoot, "cleanup.json"), "utf8"),
        ),
      );
      if (
        cleanup.status !== "clean" ||
        cleanup.ownerToken !== context.lease.ownerToken
      ) {
        throw new Error(`run ${context.runId} has not completed owned cleanup`);
      }
      const primary = path.join(context.paths.artifacts, `${scenario}.json`);
      const body = jsonObject(await readFile(primary, "utf8"), primary);
      validateArtifactProvenance(body, context);
      const stagedScenario = path.join(stagingRoot, scenario);
      await copyDirectory(context.paths.artifacts, stagedScenario);
      manifestRuns.push({
        attempt: context.attempt,
        runId: context.runId,
        scenario,
      });
    }

    const completedAt = new Date().toISOString();
    const suiteManifest = path.join(stagingRoot, "suite.json");
    const manifest = {
      buildIdentity: prepared.buildIdentity,
      completedAt,
      runs: manifestRuns,
      sourceSha,
      status: "complete",
      suiteId,
      version: 1,
    } as const;
    await writeJsonAtomically(suiteManifest, manifest);
    await rename(stagingRoot, generationRoot);
    await writeJsonAtomically(path.join(artifactsRoot, "current.json"), {
      buildIdentity: prepared.buildIdentity,
      completedAt,
      generation: path.posix.join("generations", generationName),
      sourceSha,
      suiteId,
      version: 1,
    });
    process.stdout.write(`${path.join(generationRoot, "suite.json")}\n`);
  } finally {
    await rm(stagingRoot, { force: true, recursive: true });
    await releaseOwnedLock(publicationLock);
  }
}


export async function removeOrphanPublicationStages(artifactsRoot: string): Promise<void> {
  for (const entry of await readdir(artifactsRoot, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith(".publish-")) {
      await rm(path.join(artifactsRoot, entry.name), {
        force: true,
        recursive: true,
      });
    }
  }
}

export function validateArtifactProvenance(
  body: Record<string, unknown>,
  context: JourneyRunContext,
): void {
  if (body.sourceCommit !== context.sourceSha) {
    throw new Error(`${context.scenario} artifact has the wrong sourceCommit`);
  }
  const provenance = body.journeyRun;
  if (provenance === null || typeof provenance !== "object" || Array.isArray(provenance)) {
    throw new Error(`${context.scenario} artifact is missing journeyRun provenance`);
  }
  if (
    Reflect.get(provenance, "buildIdentity") !== context.buildIdentity ||
    Reflect.get(provenance, "runId") !== context.runId ||
    Reflect.get(provenance, "suiteId") !== context.suiteId ||
    Reflect.get(provenance, "attempt") !== context.attempt
  ) {
    throw new Error(`${context.scenario} artifact journeyRun provenance is mixed`);
  }
}
