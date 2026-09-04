import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

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
