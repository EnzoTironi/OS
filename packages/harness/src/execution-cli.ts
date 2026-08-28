import { defineCommand } from "just-bash";
import {
  codeModeCommitRequestSchema,
  codeModeExplainRequestSchema,
  codeModeProposeRequestSchema,
  codeModeQueryRequestSchema,
  type CodeModeCommitRequest,
  type CodeModeExplainRequest,
  type CodeModeProposeRequest,
  type CodeModeQueryRequest,
  type WorkerCodeModeHost,
  type WorkerHostDenied,
  type WorkerHostResult,
} from "./execution-host.js";

export const ZOEN_CLI_RELATIVE_PATH = "bin/zoen";

export const ZOEN_CLI_SCRIPT = [
  "#!/usr/bin/env bash",
  "# Planted Zoen isolate CLI. query / propose use wit/zoen-code-mode host functions.",
  "# commit is denied on the worker. Cedar stays on zoend via this CLI.",
  "set -euo pipefail",
  'exec zoen "$@"',
  "",
].join("\n");

export const ZOEN_CLI_USAGE = [
  "zoen query <json>",
  "zoen query --capability-id ID --entity-id ID --selection relation:ID|computation:ID",
  "zoen propose <json>",
  "zoen explain --capability-id ID --claim-id ID",
  "zoen commit  # denied: worker cannot commit belief",
].join("\n");

export interface ZoenCliProcessResult {
  readonly denied: boolean;
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}

/**
 * Merge caller files with the planted Zoen CLI script.
 *
 * Context: just-bash destination is the isolate VFS.
 * Inputs: optional relative file map.
 * Outputs: relative paths including `bin/zoen`.
 * Side effects: none.
 */
export function plantExecutionIsolateFiles(
  files: Readonly<Record<string, string>> | undefined,
): Record<string, string> {
  return {
    [ZOEN_CLI_RELATIVE_PATH]: ZOEN_CLI_SCRIPT,
    ...(files === undefined ? {} : { ...files }),
  };
}

export function zoenCliBashInstructions(): string {
  return [
    "A Zoen CLI is planted at bin/zoen and registered as the zoen command.",
    "List, read, and write files with bash against this workspace.",
    "Use zoen query and zoen propose for the capability plane.",
    "zoen commit is forbidden. The worker cannot speak to the user or commit belief.",
  ].join(" ");
}

/**
 * just-bash custom command. Args are already split; JSON is one argv entry.
 */
export function createZoenCliCommand(host: WorkerCodeModeHost) {
  return defineCommand("zoen", async (args) => {
    const result = await runZoenCli(args, host);
    return {
      exitCode: result.exitCode,
      stderr: result.stderr,
      stdout: result.stdout,
    };
  });
}

/**
 * Dispatch `zoen query|propose|explain|commit` onto the worker-bound host.
 *
 * Context: same functions as `wit/zoen-code-mode` host. No second proto.
 * Inputs: argv after `zoen`.
 * Outputs: query-result JSON, proposal-outcome JSON, or denied commit.
 * Side effects: `host.commit` latches `commit_forbidden`.
 */
export async function runZoenCli(
  args: readonly string[],
  host: WorkerCodeModeHost,
): Promise<ZoenCliProcessResult> {
  const parsed = parseZoenArgs(args);
  switch (parsed.kind) {
    case "commit":
      return deniedCommit(
        await host.commit(parsed.request),
      );
    case "explain":
      return hostResultToCli(await host.explain(parsed.request));
    case "help":
      return { denied: false, exitCode: 0, stderr: "", stdout: `${ZOEN_CLI_USAGE}\n` };
    case "invalid":
      return failedCli({
        kind: "invalid_request",
        message: parsed.message,
      });
    case "propose":
      return hostResultToCli(await host.propose(parsed.request));
    case "query":
      return hostResultToCli(await host.query(parsed.request));
    default: {
      const exhaustive: never = parsed;
      return exhaustive;
    }
  }
}

type ParsedZoenArgs =
  | { readonly kind: "commit"; readonly request: CodeModeCommitRequest }
  | { readonly kind: "explain"; readonly request: CodeModeExplainRequest }
  | { readonly kind: "help" }
  | { readonly kind: "invalid"; readonly message: string }
  | { readonly kind: "propose"; readonly request: CodeModeProposeRequest }
  | { readonly kind: "query"; readonly request: CodeModeQueryRequest };

function parseZoenArgs(args: readonly string[]): ParsedZoenArgs {
  const [verb, ...rest] = args;
  if (
    verb === undefined ||
    verb === "help" ||
    verb === "--help" ||
    verb === "-h"
  ) {
    return { kind: "help" };
  }
  switch (verb) {
    case "commit":
      return parseCommitArgs(rest);
    case "explain": {
      const payload = readRequestPayload(rest, parseExplainFlags);
      if (payload.kind === "invalid") {
        return payload;
      }
      const parsed = codeModeExplainRequestSchema.safeParse(payload.value);
      if (!parsed.success) {
        return { kind: "invalid", message: parsed.error.message };
      }
      return { kind: "explain", request: parsed.data };
    }
    case "propose": {
      const payload = readRequestPayload(rest, undefined);
      if (payload.kind === "invalid") {
        return payload;
      }
      const parsed = codeModeProposeRequestSchema.safeParse(payload.value);
      if (!parsed.success) {
        return { kind: "invalid", message: parsed.error.message };
      }
      return { kind: "propose", request: parsed.data };
    }
    case "query": {
      const payload = readRequestPayload(rest, parseQueryFlags);
      if (payload.kind === "invalid") {
        return payload;
      }
      const parsed = codeModeQueryRequestSchema.safeParse(payload.value);
      if (!parsed.success) {
        return { kind: "invalid", message: parsed.error.message };
      }
      return { kind: "query", request: parsed.data };
    }
    default:
      return { kind: "invalid", message: `unknown zoen command: ${verb}` };
  }
}

function parseCommitArgs(rest: readonly string[]): ParsedZoenArgs {
  const payload = parseJsonPayload(rest);
  switch (payload.kind) {
    case "invalid":
    case "missing":
      return { kind: "commit", request: fallbackCommitRequest() };
    case "ok": {
      const parsed = codeModeCommitRequestSchema.safeParse(payload.value);
      if (!parsed.success) {
        return { kind: "commit", request: fallbackCommitRequest() };
      }
      return { kind: "commit", request: parsed.data };
    }
    default: {
      const exhaustive: never = payload;
      return exhaustive;
    }
  }
}

function fallbackCommitRequest(): CodeModeCommitRequest {
  return {
    capabilityId: "worker.commit",
    intentDigest: "0".repeat(64),
    operationId: "worker.commit",
    proposalId: "worker.commit",
  };
}

function readRequestPayload(
  rest: readonly string[],
  flags: ((args: readonly string[]) => unknown) | undefined,
):
  | { readonly kind: "invalid"; readonly message: string }
  | { readonly kind: "ok"; readonly value: unknown } {
  const json = parseJsonPayload(rest);
  if (json.kind === "invalid") {
    return json;
  }
  if (json.kind === "ok") {
    return json;
  }
  if (flags !== undefined) {
    const fromFlags = flags(rest);
    if (fromFlags !== undefined) {
      return { kind: "ok", value: fromFlags };
    }
  }
  return { kind: "invalid", message: "zoen command requires JSON or flags" };
}

function parseJsonPayload(
  args: readonly string[],
):
  | { readonly kind: "invalid"; readonly message: string }
  | { readonly kind: "missing" }
  | { readonly kind: "ok"; readonly value: unknown } {
  const first = args[0];
  if (first === undefined) {
    return { kind: "missing" };
  }
  if (first === "--json") {
    const raw = args[1];
    if (raw === undefined) {
      return { kind: "invalid", message: "zoen --json requires a payload" };
    }
    return parseJsonText(raw);
  }
  if (first.startsWith("{")) {
    return parseJsonText(first);
  }
  return { kind: "missing" };
}

function parseJsonText(
  raw: string,
):
  | { readonly kind: "invalid"; readonly message: string }
  | { readonly kind: "ok"; readonly value: unknown } {
  try {
    return { kind: "ok", value: JSON.parse(raw) };
  } catch (error: unknown) {
    return {
      kind: "invalid",
      message: error instanceof Error ? error.message : "invalid JSON",
    };
  }
}

function parseQueryFlags(args: readonly string[]): unknown {
  const flags = parseFlags(args);
  const selection = flags["selection"];
  if (
    flags["capability-id"] === undefined ||
    flags["entity-id"] === undefined ||
    selection === undefined
  ) {
    return undefined;
  }
  const split = splitSelection(selection);
  if (split === undefined) {
    return undefined;
  }
  return {
    capabilityId: flags["capability-id"],
    entityId: flags["entity-id"],
    selection: split,
  };
}

function parseExplainFlags(args: readonly string[]): unknown {
  const flags = parseFlags(args);
  if (flags["capability-id"] === undefined || flags["claim-id"] === undefined) {
    return undefined;
  }
  return {
    capabilityId: flags["capability-id"],
    claimId: flags["claim-id"],
  };
}

function parseFlags(args: readonly string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === undefined || !token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      continue;
    }
    flags[key] = value;
    index += 1;
  }
  return flags;
}

function splitSelection(
  raw: string,
): { id: string; kind: "computation" | "relation" } | undefined {
  const separator = raw.indexOf(":");
  if (separator <= 0) {
    return undefined;
  }
  const kind = raw.slice(0, separator);
  const id = raw.slice(separator + 1);
  if (id.length === 0) {
    return undefined;
  }
  switch (kind) {
    case "computation":
    case "relation":
      return { id, kind };
    default:
      return undefined;
  }
}

function deniedCommit(result: WorkerHostDenied): ZoenCliProcessResult {
  return {
    denied: true,
    exitCode: 2,
    stderr: "",
    stdout: `${JSON.stringify(result)}\n`,
  };
}

function hostResultToCli<T>(result: WorkerHostResult<T>): ZoenCliProcessResult {
  switch (result.kind) {
    case "denied":
      return deniedCommit(result);
    case "failed":
      return failedCli(result.error);
    case "ok":
      return {
        denied: false,
        exitCode: 0,
        stderr: "",
        stdout: `${JSON.stringify(result.result)}\n`,
      };
    default: {
      const exhaustive: never = result;
      return exhaustive;
    }
  }
}

function failedCli(error: unknown): ZoenCliProcessResult {
  return {
    denied: false,
    exitCode: 1,
    stderr: `${JSON.stringify({ error, kind: "failed" })}\n`,
    stdout: "",
  };
}
