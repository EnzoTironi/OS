import { execFile } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import type { HostCredential } from "./credentials";

const execFileAsync = promisify(execFile);
const ARGV_WHITESPACE = /\s+/u;
const TRAILING_SLASHES = /\/+$/u;

export interface ZoenCommandResult {
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}

export function isZoenArgv(argv: readonly string[]): boolean {
  const [first] = argv;
  if (first === undefined) {
    return false;
  }
  if (first === "zoen") {
    return true;
  }
  return first === "/workspace/bin/zoen" || first.endsWith("/bin/zoen");
}

export function splitCommand(command: string): string[] {
  return command
    .trim()
    .split(ARGV_WHITESPACE)
    .filter((part) => part.length > 0);
}

export function zoenBinPath(): string {
  const fromEnv = process.env.ZOEN_BIN?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  return join(
    fileURLToPath(new URL("../../../../target/debug/zoen", import.meta.url))
  );
}

export function isolatePlantScript(zoenBin: string): string {
  const quoted = shellSingleQuote(zoenBin);
  return `#!/usr/bin/env bash
set -euo pipefail
export ZOEN_ISOLATE=1
exec ${quoted} "$@"
`;
}

export function runIsolateZoen(input: {
  readonly argv: readonly string[];
  readonly zoendBaseUrl: string;
  readonly credential: HostCredential | undefined;
  readonly workspace: string;
}): Promise<ZoenCommandResult> {
  if (input.credential === undefined) {
    return Promise.resolve({
      exitCode: 1,
      stderr: "precisa de membership\n",
      stdout: "",
    });
  }
  return execZoen({
    argv: stripZoenBin(input.argv),
    cwd: input.workspace,
    env: {
      ZOEN_BEARER: input.credential.doorToken,
      ZOEN_DEFINITION_DIGEST: input.credential.definitionDigest,
      ZOEN_DEFINITION_ID: input.credential.definitionId,
      ZOEN_ISOLATE: "1",
      ZOEN_SOURCE_HOME: join(input.workspace, ".zoen"),
      ZOEN_TENANT: input.credential.worldId,
      ZOEN_VALID_AT: input.credential.validAt,
      ZOEN_ZOEND: input.zoendBaseUrl.replace(TRAILING_SLASHES, ""),
    },
  });
}

export function runZoenArgv(input: {
  readonly argv: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
  readonly cwd?: string;
}): Promise<ZoenCommandResult> {
  return execZoen({
    argv: stripZoenBin(input.argv),
    cwd: input.cwd,
    env: input.env,
  });
}

async function execZoen(input: {
  readonly argv: readonly string[];
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
}): Promise<ZoenCommandResult> {
  try {
    const result = await execFileAsync(zoenBinPath(), [...input.argv], {
      cwd: input.cwd,
      encoding: "utf8",
      env: { ...process.env, ...input.env },
      maxBuffer: 16 * 1024 * 1024,
    });
    return { exitCode: 0, stderr: result.stderr, stdout: result.stdout };
  } catch (error) {
    if (isExecFailure(error)) {
      return {
        exitCode: typeof error.code === "number" ? error.code : 1,
        stderr: error.stderr ?? "",
        stdout: error.stdout ?? "",
      };
    }
    throw error;
  }
}

function stripZoenBin(argv: readonly string[]): string[] {
  if (isZoenArgv(argv)) {
    return argv.slice(1).map(String);
  }
  return argv.map(String);
}

function isExecFailure(
  error: unknown
): error is { code?: number | string; stdout?: string; stderr?: string } {
  return typeof error === "object" && error !== null && "stdout" in error;
}

function shellSingleQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}
