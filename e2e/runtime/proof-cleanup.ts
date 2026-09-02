import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createConnection, createServer, type Server } from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import type { JourneyRunContext } from "../journey-run-context.js";
import {
  journeyPortAt,
  journeyPortSlotCount,
  preferredJourneyPortSlot,
} from "../journey-runtime-layout.js";
import {
  commandTimeoutMilliseconds,
  repositoryRoot,
} from "./proof-config.js";
import { contexts } from "./proof-state.js";
import { processGroupMembers } from "./proof-contexts.js";
import { cleanEnvironment, executeSync, gitOutput } from "./proof-environment.js";
import {
  isMissingFile,
  requiredStringValue,
} from "./proof-support.js";

export async function cleanupContext(context: JourneyRunContext): Promise<void> {
  executeSync(
    path.join(repositoryRoot, "e2e", "run.sh"),
    ["cleanup", path.join(context.paths.runRoot, "context.json")],
    {
      cwd: repositoryRoot,
      environment: cleanEnvironment({}),
      timeout: commandTimeoutMilliseconds,
    },
  );
}

export async function assertSuitesClean(suiteIds: readonly string[]): Promise<void> {
  const selectedContexts = contexts.filter((context) =>
    suiteIds.includes(context.suiteId),
  );
  for (const context of selectedContexts) {
    await assertContextClean(context);
  }
  for (const suiteId of suiteIds) {
    for (const resource of ["ps", "network", "volume"] as const) {
      const arguments_ =
        resource === "ps"
          ? [
              "ps",
              "--all",
              "--filter",
              `label=zoen.e2e.suite=${suiteId}`,
              "--quiet",
            ]
          : [
              resource,
              "ls",
              "--filter",
              `label=zoen.e2e.suite=${suiteId}`,
              "--quiet",
            ];
      const output = executeSync("docker", arguments_, {
        timeout: 30_000,
      }).stdout;
      assert.equal(output.trim(), "", `${resource} resources remain for ${suiteId}`);
    }
  }

  const reconciliationText = executeSync(
    path.join(repositoryRoot, "e2e", "run.sh"),
    ["reconcile"],
    {
      cwd: repositoryRoot,
      environment: cleanEnvironment({}),
      timeout: commandTimeoutMilliseconds,
    },
  ).stdout;
  const reconciliation = z
    .object({
      leases: z.array(
        z
          .object({
            runId: z.string(),
            scenario: z.string(),
            suiteId: z.string(),
          })
          .passthrough(),
      ),
      uncertain: z.boolean(),
    })
    .strict()
    .parse(JSON.parse(reconciliationText));
  assert.equal(
    reconciliation.leases.some((lease) => suiteIds.includes(lease.suiteId)),
    false,
    "reconciliation still reports a target suite lease",
  );
  const targetEntries = await targetRegistryEntries(suiteIds, selectedContexts);
  assert.deepEqual(
    targetEntries,
    [],
    `target suite registry state remains: ${targetEntries.join(", ")}`,
  );
  const ports = new Set(
    selectedContexts.flatMap((context) => Object.values(context.ports)),
  );
  for (const port of ports) {
    assert.equal(await portOpen(port), false, `listener remains on leased port ${port}`);
  }
}

export async function waitForTargetRegistryClean(
  suiteIds: readonly string[],
  milliseconds: number,
): Promise<void> {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) {
    if ((await targetRegistryEntries(suiteIds, [])).length === 0) {
      return;
    }
    await delay(100);
  }
  throw new Error(
    `target registry did not self-clean: ${(await targetRegistryEntries(suiteIds, [])).join(", ")}`,
  );
}

export async function targetRegistryEntries(
  suiteIds: readonly string[],
  selectedContexts: readonly JourneyRunContext[],
): Promise<string[]> {
  const slotsRoot = path.join(runtimeRegistryRoot(), "slots");
  let entries;
  try {
    entries = await readdir(slotsRoot, { withFileTypes: true });
  } catch (error) {
    if (isMissingFile(error)) {
      return [];
    }
    throw error;
  }
  const ownerTokens = new Set(
    selectedContexts.map((context) => context.lease.ownerToken),
  );
  const matches: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const directory = path.join(slotsRoot, entry.name);
    let value: unknown;
    try {
      value = JSON.parse(await readFile(path.join(directory, "lease.json"), "utf8"));
    } catch (error) {
      if (isMissingFile(error)) {
        if (
          [...ownerTokens].some((token) =>
            entry.name.includes(token.slice(0, 16)),
          )
        ) {
          matches.push(entry.name);
        }
        continue;
      }
      throw error;
    }
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`invalid lease in ${directory}`);
    }
    const suiteId = Reflect.get(value, "suiteId");
    const ownerToken = Reflect.get(value, "ownerToken");
    if (
      (typeof suiteId === "string" && suiteIds.includes(suiteId)) ||
      (typeof ownerToken === "string" && ownerTokens.has(ownerToken))
    ) {
      matches.push(entry.name);
    }
  }
  return matches.sort();
}

export async function assertContextClean(context: JourneyRunContext): Promise<void> {
  const targetEntries = await targetRegistryEntries([context.suiteId], [context]);
  assert.deepEqual(
    targetEntries,
    [],
    `lease state remains for ${context.scenario}/${context.runId}`,
  );
  const cleanup: unknown = JSON.parse(
    await readFile(path.join(context.paths.runRoot, "cleanup.json"), "utf8"),
  );
  assert.ok(cleanup !== null && typeof cleanup === "object" && !Array.isArray(cleanup));
  assert.equal(Reflect.get(cleanup, "ownerToken"), context.lease.ownerToken);
  assert.equal(Reflect.get(cleanup, "status"), "clean");
  const metadataPath = path.join(context.paths.process, "scenario.json");
  let metadata: unknown;
  try {
    metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  } catch (error) {
    if (isMissingFile(error)) {
      return;
    }
    throw error;
  }
  assert.ok(
    metadata !== null && typeof metadata === "object" && !Array.isArray(metadata),
  );
  const pgid = Reflect.get(metadata, "pgid");
  const groupCleanToken = Reflect.get(metadata, "groupCleanToken");
  assert.ok(typeof pgid === "number" && Number.isInteger(pgid) && pgid > 0);
  assert.match(requiredStringValue(groupCleanToken), /^[0-9a-f]{64}$/);
  const receipt: unknown = JSON.parse(
    await readFile(path.join(context.paths.process, "group-clean.json"), "utf8"),
  );
  assert.ok(receipt !== null && typeof receipt === "object" && !Array.isArray(receipt));
  assert.equal(Reflect.get(receipt, "ownerToken"), context.lease.ownerToken);
  assert.equal(Reflect.get(receipt, "groupCleanToken"), groupCleanToken);
  assert.equal(Reflect.get(receipt, "pgid"), pgid);
  assert.equal(Reflect.get(receipt, "status"), "group-empty");
  assert.deepEqual(processGroupMembers(pgid), []);
}

export function runtimeRegistryRoot(): string {
  const common = gitOutput(repositoryRoot, ["rev-parse", "--git-common-dir"]);
  return path.resolve(repositoryRoot, common, "zoen-e2e", "runtime-v1");
}

export function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    let settled = false;
    const finish = (open_: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(open_);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(500, () => finish(false));
  });
}

export async function occupyPreferredSlotPort(
  suiteId: string,
  scenario: string,
): Promise<{
  readonly runId: string;
  readonly server: Server;
  readonly slot: number;
}> {
  const attemptedSlots = new Set<number>();
  for (let candidate = 0; candidate < journeyPortSlotCount * 16; candidate += 1) {
    const runId = `occupied-port-${candidate}`;
    const slot = preferredJourneyPortSlot(suiteId, scenario, runId);
    if (attemptedSlots.has(slot)) {
      continue;
    }
    attemptedSlots.add(slot);
    if (await slotIsReserved(slot)) {
      continue;
    }
    const server = createServer();
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.once("listening", resolve);
        server.listen({
          exclusive: true,
          host: "127.0.0.1",
          port: journeyPortAt(slot, 0),
        });
      });
      server.unref();
      if (await slotIsReserved(slot)) {
        await closeServer(server);
        continue;
      }
      return { runId, server, slot };
    } catch (error) {
      if (!isAddressInUse(error)) {
        throw error;
      }
    }
  }
  throw new Error("could not find an available preferred slot proof port");
}

export async function slotIsReserved(slot: number): Promise<boolean> {
  const basename = String(slot).padStart(4, "0");
  const slotsRoot = path.join(runtimeRegistryRoot(), "slots");
  try {
    return (await readdir(slotsRoot, { withFileTypes: true })).some(
      (entry) =>
        entry.isDirectory() &&
        (entry.name === basename ||
          entry.name.startsWith(`.claim-${basename}-`) ||
          entry.name.startsWith(`.reaping-${basename}-`) ||
          entry.name.startsWith(`.release-${basename}-`)),
    );
  } catch (error) {
    if (isMissingFile(error)) {
      return false;
    }
    throw error;
  }
}

export function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    });
  });
}

export function isAddressInUse(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    Reflect.get(error, "code") === "EADDRINUSE"
  );
}
