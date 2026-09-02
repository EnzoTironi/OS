import type { ChildProcess } from "node:child_process";
import { z } from "zod";
import type { JourneyRunContext } from "../journey-run-context.js";
import { requiredRuntimeProofAssertions } from "../verify-journey-runtime-proof.js";

export type ChildOutcome =
  | { readonly error: Error; readonly kind: "error" }
  | {
      readonly code: number | null;
      readonly kind: "exit";
      readonly signal: NodeJS.Signals | null;
    };

export type CapturedOutput = {
  readonly stderr: string[];
  readonly stdout: string[];
};

export type TrackedProcess = {
  readonly abandon: () => void;
  readonly child: ChildProcess;
  readonly completion: Promise<ChildOutcome>;
  readonly isSettled: () => boolean;
  readonly output: CapturedOutput;
  readonly ownerNonce: string;
};

export type RunningJourney = TrackedProcess & {
  readonly cwd: string;
  readonly pointer: string;
  readonly runId: string;
  readonly scenario: string;
};

export type RunningPool = TrackedProcess & {
  readonly suiteId: string;
};

export type ProofEvidence = {
  readonly aggregateManifest: ManifestReference;
  readonly buildIdentity: string;
  readonly preparedManifest: ManifestReference;
  readonly sourceCommit: string;
};

export type ManifestReference = {
  readonly path: string;
  readonly sha256: string;
};

export type RuntimeProofAssertion =
  (typeof requiredRuntimeProofAssertions)[number];

export const journeyStartupMarkerSchema = z
  .object({
    controllerPid: z.number().int().positive(),
    ownerNonce: z.string().regex(/^[0-9a-f]{64}$/),
    runId: z.string().min(1),
    stage: z.literal("journey-worker-ready"),
    workerPgid: z.number().int().positive(),
    workerPid: z.number().int().positive(),
  })
  .strict();
