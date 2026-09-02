import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { link, mkdir, open, rm, stat } from "node:fs/promises";
import path from "node:path";
import {
  journeyPortSlotCount,
  preferredJourneyPortSlot,
} from "../journey-runtime-layout.js";
import { childOutputLimit, repositoryRoot } from "./proof-config.js";
import type {
  CapturedOutput,
  ChildOutcome,
  RuntimeProofAssertion,
} from "./proof-contracts.js";
import { assertions } from "./proof-state.js";

export async function withTimeout<Value>(
  promise: Promise<Value>,
  milliseconds: number,
  message: string,
): Promise<Value> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), milliseconds);
        timer.unref();
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

export function record(name: RuntimeProofAssertion, observed: boolean): void {
  assert.ok(observed, name);
  assertions[name] = true;
}

export function id(prefix: string): string {
  return `${prefix}-${Date.now()}-${randomBytes(6).toString("hex")}`;
}

export function collidingJourneyRunId(
  suiteId: string,
  scenario: string,
  slot: number,
): string {
  assert.ok(slot >= 0 && slot < journeyPortSlotCount);
  for (let candidate = 0; candidate < journeyPortSlotCount * 32; candidate += 1) {
    const runId = `transition-collision-${candidate}`;
    if (preferredJourneyPortSlot(suiteId, scenario, runId) === slot) {
      return runId;
    }
  }
  throw new Error(`could not enumerate a run id for preferred slot ${slot}`);
}

export function requiredString(value: string | undefined): string {
  assert.ok(value !== undefined);
  return value;
}

export function requiredStringValue(value: unknown): string {
  if (typeof value !== "string" || value === "") {
    throw new Error("expected a non-empty string");
  }
  return value;
}

export function appendOutput(output: string[], chunk: Buffer): void {
  output.push(chunk.toString());
  while (joined(output).length > childOutputLimit) {
    output.shift();
  }
}

export function joined(output: readonly string[]): string {
  return output.join("");
}

export function formatOutput(output: CapturedOutput): string {
  return [joined(output.stdout), joined(output.stderr)].filter(Boolean).join("\n");
}

export function parseSingleAbsolutePath(output: string, label: string): string {
  const withoutNewline = output.endsWith("\n") ? output.slice(0, -1) : output;
  assert.ok(
    withoutNewline !== "" &&
      !withoutNewline.includes("\n") &&
      !withoutNewline.includes("\r") &&
      path.isAbsolute(withoutNewline),
    `${label} did not emit exactly one absolute path: ${JSON.stringify(output)}`,
  );
  return withoutNewline;
}

export function repositoryRelativePosix(candidate: string): string {
  const relative = path.relative(repositoryRoot, candidate);
  assert.ok(
    relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative),
    `${candidate} is outside ${repositoryRoot}`,
  );
  return relative.split(path.sep).join(path.posix.sep);
}

export function assertDirectChild(parent: string, candidate: string): void {
  const relative = path.relative(parent, candidate);
  assert.ok(
    relative !== "" &&
      !relative.startsWith("..") &&
      !path.isAbsolute(relative) &&
      path.dirname(relative) === ".",
    `${candidate} is not one immutable generation below ${parent}`,
  );
}

export function sameStringSet(a: readonly string[], b: readonly string[]): boolean {
  return (
    new Set(a).size === a.length &&
    new Set(b).size === b.length &&
    JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())
  );
}

export async function writeFileExclusive(outputPath: string, value: string): Promise<void> {
  const handle = await open(outputPath, "wx");
  try {
    await handle.writeFile(value, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function writeJsonExclusively(
  outputPath: string,
  value: unknown,
): Promise<void> {
  const serialized = JSON.stringify(value, null, 2);
  if (serialized === undefined) {
    throw new Error(`${outputPath} could not be serialized`);
  }
  const temporary = `${outputPath}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  await writeFileExclusive(temporary, `${serialized}\n`);
  try {
    await link(temporary, outputPath);
  } finally {
    await rm(temporary, { force: true });
  }
}

export function sha256(value: NodeJS.ArrayBufferView): string {
  return createHash("sha256").update(value).digest("hex");
}

export function childOutcomeText(outcome: ChildOutcome): string {
  return outcome.kind === "error"
    ? outcome.error.message
    : String(outcome.signal ?? outcome.code);
}

export function errorFromUnknown(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function isMissingFile(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    Reflect.get(error, "code") === "ENOENT"
  );
}

export function isNoSuchProcess(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    Reflect.get(error, "code") === "ESRCH"
  );
}

export async function pathExists(candidate: string): Promise<boolean> {
  try {
    await stat(candidate);
    return true;
  } catch (error) {
    if (isMissingFile(error)) {
      return false;
    }
    throw error;
  }
}

export function progress(message: string): void {
  process.stderr.write(`[runtime-proof] ${message}\n`);
}
