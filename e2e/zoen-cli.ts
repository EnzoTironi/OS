import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export interface ZoenCliResult {
  status: number;
  stdout: string;
  stderr: string;
}

/** Run the planted `zoen` binary against one DATABASE_URL. */
export function runZoenCli(
  zoenPath: string,
  databaseUrl: string,
  args: readonly string[],
): ZoenCliResult {
  try {
    const stdout = execFileSync(zoenPath, args, {
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    if (error !== null && typeof error === "object" && "status" in error) {
      const failed = error as {
        status: number | null;
        stdout: string | Buffer;
        stderr: string | Buffer;
      };
      return {
        status: failed.status ?? 1,
        stdout: String(failed.stdout),
        stderr: String(failed.stderr),
      };
    }
    throw error;
  }
}

/** Parse CLI JSON stdout into a plain object. */
export function parseZoenJson(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text);
  assert.equal(typeof value, "object");
  assert.notEqual(value, null);
  return value as Record<string, unknown>;
}

/** Write a JSON content file under the scenario generated directory. */
export async function writeZoenJsonFile(
  directory: string,
  name: string,
  content: Record<string, unknown>,
): Promise<string> {
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, name);
  await writeFile(file, `${JSON.stringify(content, null, 2)}\n`);
  return file;
}

/** Construct a WorldRelease from a content file. */
export function constructWorldRelease(
  zoenPath: string,
  databaseUrl: string,
  file: string,
): Record<string, unknown> {
  const result = runZoenCli(zoenPath, databaseUrl, [
    "world",
    "release",
    "construct",
    "--file",
    file,
  ]);
  assert.equal(result.status, 0, result.stderr);
  return parseZoenJson(result.stdout);
}

/** Publish a WorldRelease candidate. */
export function publishWorldRelease(
  zoenPath: string,
  databaseUrl: string,
  file: string,
  principal: string,
  evidenceDigest: string,
): ZoenCliResult {
  return runZoenCli(zoenPath, databaseUrl, [
    "world",
    "release",
    "publish",
    "--file",
    file,
    "--principal",
    principal,
    "--policy-id",
    "policy.world",
    "--policy-digest",
    evidenceDigest,
    "--policy-revision",
    "1",
    "--determining-policy",
    "policy.world",
  ]);
}
