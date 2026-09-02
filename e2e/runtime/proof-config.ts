import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  proofCommandTimeoutMilliseconds,
  proofGracefulTerminationMilliseconds,
} from "./runtime-timeouts.js";

export function proofFlag(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  assert.ok(value !== undefined && /^[0-9a-f]{64}$/.test(value), `${name} is invalid`);
  return value;
}

export function requiredProofRunId(): string {
  const value = process.env.ZOEN_E2E_PROOF_RUN_ID;
  assert.ok(
    value !== undefined && value.length <= 80 && proofIdPattern.test(value),
    "ZOEN_E2E_PROOF_RUN_ID is invalid",
  );
  return value;
}

export function requiredCrashProofPath(): string {
  const value = process.env.ZOEN_E2E_PREPARE_CRASH_PROOF;
  assert.ok(value !== undefined && value !== "");
  return path.resolve(value);
}


export const childOutputLimit = 256 * 1024;
export const commandTimeoutMilliseconds = proofCommandTimeoutMilliseconds;
export const journeyTimeoutMilliseconds = 12 * 60_000;
export const fullSuiteTimeoutMilliseconds = 45 * 60_000;
export const gracefulTerminationMilliseconds =
  proofGracefulTerminationMilliseconds;
export const proofIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const repositoryRoot = await realpath(process.cwd());
export const buildManifest = path.join(repositoryRoot, ".cache", "e2e", "prepared.json");
export const proofOwnerNonce = proofFlag("--zoen-proof-owner-nonce");
export const proofReaderToken = proofFlag("--zoen-proof-reader-token");
export const proofRunId = requiredProofRunId();
export const proofRoot = path.join(
  repositoryRoot,
  "artifacts",
  "runtime-proof",
  proofRunId,
);
export const crashProofPath = requiredCrashProofPath();
export const work = await mkdtemp(path.join(tmpdir(), "zoen-journey-runtime-proof-"));
export const sentinelProject = `zoen-sentinel-${randomBytes(6).toString("hex")}`;
export const sentinelCompose = path.join(work, "sentinel.yaml");
