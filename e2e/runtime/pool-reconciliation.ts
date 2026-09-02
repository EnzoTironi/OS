import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import {
  journeyContextPointerSchema,
  journeyRunContextSchema,
  type JourneyRunContext,
} from "../journey-run-context.js";
import {
  cancellationConvergenceMilliseconds,
  cleanupSchema,
  groupCleanSchema,
  processMetadataSchema,
  reconciliationSchema,
  runtimeCommandTimeoutMilliseconds,
  type RunningJourney,
} from "./pool-contracts.js";
import { errorFromUnknown, isMissingFile } from "./pool-control.js";
import {
  boundedChildOutcome,
  childFailure,
  childSucceeded,
  startTrackedChild,
} from "./pool-process.js";

export async function reconcileAdmittedJourneys(
  journeys: readonly RunningJourney[],
  suiteId: string,
): Promise<void> {
  const deadlineAt = Date.now() + cancellationConvergenceMilliseconds;
  const contexts = new Map<string, JourneyRunContext>();
  let lastFailures: Error[] = [];
  let lastOwned: z.infer<typeof reconciliationSchema>["leases"] = [];
  while (Date.now() < deadlineAt) {
    const iterationFailures: Error[] = [];
    await Promise.all(
      journeys.map(async (journey) => {
        try {
          const pointer = journeyContextPointerSchema.parse(
            JSON.parse(await readFile(journey.pointer, "utf8")),
          );
          const context = journeyRunContextSchema.parse(
            JSON.parse(await readFile(pointer.contextFile, "utf8")),
          );
          if (context.suiteId !== suiteId) {
            throw new Error(
              `cancelled pointer ${journey.pointer} belongs to ${context.suiteId}`,
            );
          }
          contexts.set(context.lease.ownerToken, context);
        } catch (error) {
          if (!isMissingFile(error)) {
            iterationFailures.push(errorFromUnknown(error));
          }
        }
      }),
    );

    const cleanupResults = await Promise.allSettled(
      [...contexts.values()].map((context) => cleanupContext(context)),
    );
    for (const result of cleanupResults) {
      if (result.status === "rejected") {
        iterationFailures.push(errorFromUnknown(result.reason));
      }
    }

    try {
      const reconciliation = await reconcileRuntime();
      if (reconciliation.uncertain) {
        throw new Error(
          "shared journey registry remains uncertain after cancellation",
        );
      }
      lastOwned = reconciliation.leases.filter(
        (lease) => lease.suiteId === suiteId,
      );
      if (lastOwned.length === 0) {
        const receiptResults = await Promise.allSettled(
          [...contexts.values()].map(assertContextClean),
        );
        for (const result of receiptResults) {
          if (result.status === "rejected") {
            iterationFailures.push(errorFromUnknown(result.reason));
          }
        }
        if (iterationFailures.length === 0) {
          return;
        }
      }
    } catch (error) {
      iterationFailures.push(errorFromUnknown(error));
    }
    lastFailures = iterationFailures;
    await delay(250);
  }
  if (lastOwned.length > 0) {
    lastFailures.push(
      new Error(
        `cancelled suite still owns leases: ${lastOwned.map((lease) => `${lease.scenario}/${lease.runId}`).join(",")}`,
      ),
    );
  }
  throw new AggregateError(
    lastFailures.length > 0
      ? lastFailures
      : [new Error("cancelled suite cleanup exceeded its deadline")],
    "cancelled journey suite did not converge to owned cleanup",
  );
}

async function cleanupContext(context: JourneyRunContext): Promise<void> {
  const cleanup = startTrackedChild({
    arguments: [
      "cleanup",
      path.join(context.paths.runRoot, "context.json"),
    ],
    environment: process.env,
    label: `cleanup ${context.scenario}/${context.runId}`,
  });
  const outcome = await boundedChildOutcome(
    cleanup,
    runtimeCommandTimeoutMilliseconds,
  );
  if (!childSucceeded(outcome)) {
    throw childFailure(cleanup.label, outcome);
  }
}

async function reconcileRuntime(): Promise<z.infer<typeof reconciliationSchema>> {
  const reconciliation = startTrackedChild({
    arguments: ["reconcile"],
    captureOutput: true,
    environment: process.env,
    label: "journey registry reconciliation",
  });
  const outcome = await boundedChildOutcome(
    reconciliation,
    runtimeCommandTimeoutMilliseconds,
  );
  if (!childSucceeded(outcome)) {
    throw new Error(
      `journey registry reconciliation failed: ${reconciliation.stderr() || childFailure("reconcile", outcome).message}`,
    );
  }
  return reconciliationSchema.parse(JSON.parse(reconciliation.stdout()));
}

async function assertContextClean(context: JourneyRunContext): Promise<void> {
  try {
    await stat(context.lease.directory);
    throw new Error(`lease directory remains for ${context.scenario}/${context.runId}`);
  } catch (error) {
    if (!isMissingFile(error)) {
      throw error;
    }
  }
  const cleanup = cleanupSchema.parse(
    JSON.parse(
      await readFile(path.join(context.paths.runRoot, "cleanup.json"), "utf8"),
    ),
  );
  if (cleanup.ownerToken !== context.lease.ownerToken) {
    throw new Error(`cleanup receipt owner mismatch for ${context.runId}`);
  }
  const metadataPath = path.join(context.paths.process, "scenario.json");
  let metadata: z.infer<typeof processMetadataSchema>;
  try {
    metadata = processMetadataSchema.parse(
      JSON.parse(await readFile(metadataPath, "utf8")),
    );
  } catch (error) {
    if (isMissingFile(error)) {
      return;
    }
    throw error;
  }
  const groupClean = groupCleanSchema.parse(
    JSON.parse(
      await readFile(
        path.join(context.paths.process, "group-clean.json"),
        "utf8",
      ),
    ),
  );
  if (
    metadata.ownerToken !== context.lease.ownerToken ||
    groupClean.ownerToken !== context.lease.ownerToken ||
    groupClean.groupCleanToken !== metadata.groupCleanToken ||
    groupClean.pgid !== metadata.pgid
  ) {
    throw new Error(`process cleanup receipt mismatch for ${context.runId}`);
  }
}
