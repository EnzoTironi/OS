import type { ProofEvidence } from "./runtime/proof-contracts.js";
import { exerciseRuntime } from "./runtime/proof-exercise.js";
import {
  publishRuntimeProof,
  teardownRuntimeProof,
} from "./runtime/proof-lifecycle.js";

let proofEvidence: ProofEvidence | undefined;
let primaryFailure: unknown;
try {
  proofEvidence = await exerciseRuntime();
} catch (error) {
  primaryFailure = error;
}

const teardownFailures = await teardownRuntimeProof();
if (primaryFailure !== undefined || teardownFailures.length > 0) {
  throw new AggregateError(
    [primaryFailure, ...teardownFailures].filter(
      (error) => error !== undefined,
    ),
    "journey runtime proof or teardown failed",
  );
}
if (proofEvidence === undefined) {
  throw new Error("journey runtime proof completed without evidence");
}

const descriptorPath = await publishRuntimeProof(proofEvidence);
process.stdout.write(`${descriptorPath}\n`);
