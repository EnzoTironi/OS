import { execFile } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import type { HostCredential } from "./credentials";

const execFileAsync = promisify(execFile);

export type ZoenCommandResult = {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
};

export function isZoenArgv(argv: readonly string[]): boolean {
  const first = argv[0];
  if (first === undefined) {
    return false;
  }
  if (first === "zoen") {
    return true;
  }
  return first === "/workspace/bin/zoen" || first.endsWith("/bin/zoen");
}

export function splitCommand(command: string): string[] {
  return command.trim().split(/\s+/u).filter((part) => part.length > 0);
}

export function zoenBinPath(): string {
  return join(fileURLToPath(new URL("../../../zoen/zoen", import.meta.url)));
}

export function isolatePlantScript(zoenBin: string): string {
  const quoted = shellSingleQuote(zoenBin);
  return `#!/usr/bin/env bash
set -euo pipefail
export ZOEN_ISOLATE=1
exec ${quoted} "$@"
`;
}

export async function runIsolateZoen(input: {
  readonly argv: readonly string[];
  readonly zoendBaseUrl: string;
  readonly credential: HostCredential | undefined;
  readonly workspace: string;
}): Promise<ZoenCommandResult> {
  if (input.credential === undefined) {
    return { exitCode: 1, stdout: "", stderr: "precisa de membership\n" };
  }
  return execZoen({
    argv: stripZoenBin(input.argv),
    cwd: input.workspace,
    env: {
      ZOEN_ISOLATE: "1",
      ZOEN_ZOEND: input.zoendBaseUrl.replace(/\/+$/u, ""),
      ZOEN_BEARER: input.credential.doorToken,
      ZOEN_TENANT: input.credential.tenantId,
      ZOEN_SOURCE_HOME: join(input.workspace, ".zoen"),
      ZOEN_DEFINITION_ID: input.credential.definitionId,
      ZOEN_DEFINITION_DIGEST: input.credential.definitionDigest,
      ZOEN_VALID_AT: input.credential.validAt,
    },
  });
}

export async function runZoenArgv(input: {
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
      env: { ...process.env, ...input.env },
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    if (isExecFailure(error)) {
      return {
        exitCode: typeof error.code === "number" ? error.code : 1,
        stdout: error.stdout ?? "",
        stderr: error.stderr ?? "",
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
  error: unknown,
): error is { code?: number | string; stdout?: string; stderr?: string } {
  return typeof error === "object" && error !== null && "stdout" in error;
}

function shellSingleQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}
