import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  inspectionEnvironment,
  pathExists,
  runtimeRegistryRoot,
  writeJsonAtomically,
} from "./atomic-state.mjs";
import {
  canonicalJourneyAuthority,
  canonicalJourneyLayout,
  expectedComposeProject,
  expectedJourneyHttpNames,
  expectedJourneyPorts,
} from "./journey-contract.mjs";
import { recordJourneyExit } from "./journey-authority.mjs";
import { startJourneyCleanupAuthority } from "./journey-controller.mjs";

export async function proveContextConfinementCommand() {
  await proveContextConfinement();
  process.stdout.write(
    `${JSON.stringify({ contextTamperingRejectedBeforeEffects: true, version: 1 })}\n`,
  );
}

export async function proveContextConfinement() {
  const work = await mkdtemp(path.join(tmpdir(), "zoen-context-confinement-proof-"));
  try {
    const root = await realpath(work);
    const repository = path.join(root, "repository");
    await mkdir(repository);
    execFileSync("/usr/bin/git", ["init", "--quiet", repository], {
      encoding: "utf8",
      env: inspectionEnvironment(),
      timeout: 30_000,
    });
    const canonicalRepository = await realpath(repository);
    const registryRoot = await runtimeRegistryRoot(canonicalRepository);
    const slotsRoot = path.join(registryRoot, "slots");
    const slot = 17;
    const leaseDirectory = path.join(slotsRoot, String(slot).padStart(4, "0"));
    const ownerToken = randomBytes(32).toString("hex");
    const ownerNonce = randomBytes(32).toString("hex");
    const identity = {
      attempt: 1,
      repository: canonicalRepository,
      runId: "confinement-run",
      scenario: "definition-publication",
      suiteId: "confinement-suite",
    };
    const layout = canonicalJourneyLayout(identity);
    await Promise.all([
      mkdir(layout.artifacts, { recursive: true }),
      mkdir(layout.generated, { recursive: true }),
      mkdir(layout.logs, { recursive: true }),
      mkdir(layout.process, { recursive: true }),
      mkdir(leaseDirectory, { recursive: true }),
    ]);
    const composeProject = expectedComposeProject(identity);
    const lease = {
      ...identity,
      composeProject,
      contextFile: layout.contextFile,
      createdAt: new Date().toISOString(),
      exclusive: false,
      ownerGuardianPid: process.pid,
      ownerNonce,
      ownerPgid: process.pid,
      ownerPid: process.pid,
      ownerToken,
      slot,
      version: 2,
    };
    const context = {
      attempt: identity.attempt,
      buildIdentity: "1".repeat(64),
      compose: {
        baseFile: path.join(
          canonicalRepository,
          "e2e",
          identity.scenario,
          "compose.yaml",
        ),
        kind: "compose",
        overrideFile: path.join(layout.runRoot, "compose.owner.yaml"),
        project: composeProject,
      },
      contextVersion: 1,
      createdAt: new Date().toISOString(),
      httpNames: expectedJourneyHttpNames(identity),
      lease: { directory: leaseDirectory, ownerToken, slot },
      owner: {
        guardianPid: process.pid,
        nonce: ownerNonce,
        pgid: process.pid,
        pid: process.pid,
      },
      paths: { ...layout, repository: canonicalRepository },
      ports: expectedJourneyPorts(slot),
      runId: identity.runId,
      scenario: identity.scenario,
      sourceSha: "2".repeat(40),
      suiteId: identity.suiteId,
    };
    await writeJsonAtomically(path.join(leaseDirectory, "lease.json"), lease);
    await writeJsonAtomically(layout.contextFile, context);
    const authority = await canonicalJourneyAuthority(
      canonicalRepository,
      layout.contextFile,
    );
    const sentinelRoot = path.join(root, "sentinel");
    const sentinel = path.join(sentinelRoot, "sentinel.txt");
    await mkdir(sentinelRoot);
    await writeFile(sentinel, "intact\n", { flag: "wx" });
    await writeJsonAtomically(layout.contextFile, {
      ...context,
      compose: { ...context.compose, project: `${composeProject}-tampered` },
      paths: { ...context.paths, generated: sentinelRoot, process: sentinelRoot },
      ports: { ...context.ports, auth: context.ports.auth + 1 },
    });
    let rejected = false;
    try {
      await startJourneyCleanupAuthority(canonicalRepository, layout.contextFile);
    } catch {
      rejected = true;
    }
    if (!rejected) {
      throw new Error("tampered journey context reached cleanup effects");
    }
    await recordJourneyExit(authority, ownerNonce, 1);
    if (
      (await readFile(sentinel, "utf8")) !== "intact\n" ||
      (await pathExists(path.join(sentinelRoot, "scenario.json")))
    ) {
      throw new Error("tampered journey context reached an external sentinel");
    }
  } finally {
    await rm(work, { force: true, recursive: true });
  }
}
