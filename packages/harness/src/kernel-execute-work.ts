import { randomBytes } from "node:crypto";
import type { WorldQueryClient, WorldQuerySnapshot } from "../../speaker/src/world-query.js";
import { runZoenCli } from "./execution-cli.js";
import {
  createKernelCodeModeHost,
  type CodeModeCommitOutcome,
  type CodeModeCommitRequest,
  type CodeModeProposeRequest,
  type CodeModeProposalOutcome,
  type CodeModeQueryRequest,
  type CodeModeQueryResult,
  type ExecutionCodeModeHost,
  type WorkerCodeModeHost,
} from "./execution-host.js";
import type { ExactInput } from "./types.js";

export const PERSONAL_CREATE_REMINDER = "personal.createReminder";
export const PERSONAL_WRITE_MEMORY = "personal.writeMemory";
export const PERSONAL_MEMORY_LAKE = "personal.memory";

const REMIND_INTENT =
  /\b(lembr[ae]|lembrar|agenda|agendar|marca|marcar|remind|schedule)\b/i;
const NOTE_INTENT =
  /\b(anota|anote|anotar|guarda|guardar|escreve|escrever|note down|write down)\b/i;

/**
 * Parsed `spawn_execution` task for the planted CLI.
 * Natural language is a convenience; JSON is the kernel contract.
 */
export type ParsedSpawnTask =
  | { readonly kind: "action"; readonly request: CodeModeProposeRequest }
  | { readonly kind: "invalid"; readonly message: string }
  | { readonly kind: "query"; readonly request: CodeModeQueryRequest };

/**
 * Turn a spawn_execution task into `zoen propose` / `zoen query` JSON.
 *
 * Context: speaker hands a string. The CLI is the kernel. No speaker tools.
 * Inputs: task text or a propose/query JSON object.
 * Outputs: structured propose/query, or invalid.
 * Side effects: mints `personal.reminder.*` / `personal.note.*` ids for NL writes.
 */
export function parseSpawnExecutionTask(task: string): ParsedSpawnTask {
  const trimmed = task.trim();
  if (trimmed.length === 0) {
    return { kind: "invalid", message: "empty_task" };
  }
  if (trimmed.startsWith("{")) {
    return parseJsonTask(trimmed);
  }
  if (REMIND_INTENT.test(trimmed)) {
    const { body, dueAt } = splitRemindTask(trimmed);
    return {
      kind: "action",
      request: personalActionRequest(PERSONAL_CREATE_REMINDER, "reminder", [
        textInput("body", body),
        textInput("dueAt", dueAt),
      ]),
    };
  }
  if (NOTE_INTENT.test(trimmed)) {
    return {
      kind: "action",
      request: personalActionRequest(PERSONAL_WRITE_MEMORY, "note", [
        textInput("body", stripNoteLead(trimmed)),
      ]),
    };
  }
  return { kind: "invalid", message: "unrecognized_task" };
}

/**
 * Run planted `zoen` propose+commit (or query) on a kernel host.
 *
 * Context: live `spawn_execution`. No JS sandbox. Worker does not speak.
 * Inputs: task string plus a host that can finish Action on zoend.
 * Outputs: `status: committed (...)` only after host commit. Otherwise failed/denied.
 * Side effects: host Propose → optional Approve → Commit. Cedar stays on zoend.
 */
export async function executeKernelTask(
  task: string,
  host: WorkerCodeModeHost,
): Promise<string> {
  const parsed = parseSpawnExecutionTask(task);
  switch (parsed.kind) {
    case "invalid":
      return `status: failed (${parsed.message})`;
    case "query":
      return cliStatus(await runZoenCli(["query", JSON.stringify(parsed.request)], host));
    case "action":
      return commitProposedAction(parsed.request, host);
    default: {
      const exhaustive: never = parsed;
      return exhaustive;
    }
  }
}

/**
 * Bind a kernel host as `executeWork` plus an injectable World snapshot.
 *
 * Context: serve / tests. Speaker stays Connect-free.
 * Inputs: `ExecutionCodeModeHost` with `propose` and `commit`.
 * Outputs: status string for Interaction; optional World snapshot via `zoen query`.
 * Side effects: planted CLI calls. No just-bash. No speak_to_user.
 */
export function createKernelExecuteWork(inner: ExecutionCodeModeHost): {
  readonly host: WorkerCodeModeHost;
  readonly world: WorldQueryClient;
  executeWork(task: string): Promise<string>;
} {
  const host = createKernelCodeModeHost(inner);
  return {
    host,
    world: createHostWorldQueryClient(host),
    executeWork: (task) => executeKernelTask(task, host),
  };
}

/**
 * Map kernel `zoen query` values into the speaker-local snapshot.
 * Speaker never opens a Connect client.
 */
export function createHostWorldQueryClient(
  host: WorkerCodeModeHost,
): WorldQueryClient {
  return {
    async semanticQuery(input) {
      const result = await host.query({
        capabilityId: input.typeApiName ?? "world",
        entityId: input.entityId ?? input.membershipId,
        selection: {
          id:
            input.typeApiName === "personal.Note"
              ? "personal.body"
              : "world.notes",
          kind: "relation",
        },
      });
      if (result.kind !== "ok") {
        return undefined;
      }
      return snapshotFromQuery(result.result);
    },
  };
}

export function snapshotFromQuery(
  result: CodeModeQueryResult,
): WorldQuerySnapshot {
  const notes: string[] = [];
  const rivals: { label: string }[] = [];
  const entityIds: string[] = [];
  for (const row of result.values) {
    switch (row.value.kind) {
      case "text":
        notes.push(row.value.value);
        break;
      case "entity":
        entityIds.push(row.value.value);
        rivals.push({ label: row.value.value });
        break;
      default:
        break;
    }
  }
  return { entityIds, notes, rivals };
}

async function commitProposedAction(
  request: CodeModeProposeRequest,
  host: WorkerCodeModeHost,
): Promise<string> {
  const proposed = await runZoenCli(
    ["propose", JSON.stringify(request)],
    host,
  );
  if (proposed.exitCode !== 0) {
    return cliStatus(proposed);
  }
  const outcome = parseProposalOutcome(proposed.stdout);
  if (outcome === undefined) {
    return "status: failed (invalid_proposal)";
  }
  if (outcome.kind !== "ready" && outcome.kind !== "awaiting_approval") {
    return `status: denied (${outcome.kind})`;
  }
  const commitRequest: CodeModeCommitRequest = {
    capabilityId: request.capabilityId,
    intentDigest: outcome.proposal.intentDigest,
    operationId: outcome.proposal.operationId,
    proposalId: outcome.proposal.proposalId,
  };
  const committed = await runZoenCli(
    ["commit", JSON.stringify(commitRequest)],
    host,
  );
  if (committed.exitCode !== 0) {
    return cliStatus(committed);
  }
  const commitOutcome = parseCommitOutcome(committed.stdout);
  if (commitOutcome?.kind === "committed") {
    return `status: committed (${request.actionId})`;
  }
  if (commitOutcome !== undefined) {
    return `status: denied (${commitOutcome.kind})`;
  }
  return "status: failed (invalid_commit)";
}

function parseJsonTask(raw: string): ParsedSpawnTask {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { kind: "invalid", message: "invalid_json" };
  }
  if (value === null || typeof value !== "object") {
    return { kind: "invalid", message: "invalid_json" };
  }
  const record = value as Record<string, unknown>;
  if (typeof record.actionId === "string") {
    const request = personalActionRequest(
      record.actionId,
      record.actionId === PERSONAL_CREATE_REMINDER ? "reminder" : "note",
      Array.isArray(record.inputs) ? (record.inputs as CodeModeProposeRequest["inputs"]) : [],
    );
    return {
      kind: "action",
      request: {
        ...request,
        ...(typeof record.capabilityId === "string"
          ? { capabilityId: record.capabilityId }
          : {}),
        ...(typeof record.resourceId === "string"
          ? { resourceId: record.resourceId }
          : {}),
        ...(typeof record.operationId === "string"
          ? { operationId: record.operationId }
          : {}),
        ...(typeof record.proposalId === "string"
          ? { proposalId: record.proposalId }
          : {}),
        inputs:
          Array.isArray(record.inputs) && record.inputs.length > 0
            ? (record.inputs as CodeModeProposeRequest["inputs"])
            : request.inputs,
      },
    };
  }
  if (
    typeof record.entityId === "string" &&
    record.selection !== undefined
  ) {
    return {
      kind: "query",
      request: {
        capabilityId:
          typeof record.capabilityId === "string" ? record.capabilityId : "world",
        entityId: record.entityId,
        selection: record.selection as CodeModeQueryRequest["selection"],
      },
    };
  }
  return { kind: "invalid", message: "unrecognized_json" };
}

function personalActionRequest(
  actionId: string,
  kind: "note" | "reminder",
  inputs: CodeModeProposeRequest["inputs"],
): CodeModeProposeRequest {
  const hex = randomBytes(8).toString("hex");
  return {
    actionId,
    capabilityId: actionId,
    inputs,
    operationId: `operation.${kind}.${hex}`,
    proposalId: `proposal.${kind}.${hex}`,
    resourceId: `personal.${kind}.${hex}`,
  };
}

function textInput(id: string, value: string): {
  readonly id: string;
  readonly value: ExactInput;
} {
  return { id, value: { kind: "text", value } };
}

function splitRemindTask(task: string): { body: string; dueAt: string } {
  const stripped = task
    .replace(
      /^(me\s+)?(lembra|lembrar|agenda|agendar|marca|marcar|remind( me)?|schedule)\s+(de\s+|que\s+|to\s+)?/i,
      "",
    )
    .trim();
  const due = stripped.match(
    /\b(amanhã|amanha|tomorrow|hoje|today|depois|later|\d{4}-\d{2}-\d{2})(.*)$/iu,
  );
  if (due?.index !== undefined) {
    const body = stripped.slice(0, due.index).trim().replace(/[,\s]+$/u, "");
    return {
      body: body.length > 0 ? body : stripped,
      dueAt: due[0].trim(),
    };
  }
  return { body: stripped.length > 0 ? stripped : task.trim(), dueAt: "unspecified" };
}

function stripNoteLead(task: string): string {
  return task
    .replace(
      /^(anota|anote|anotar|guarda|guardar|escreve|escrever|note down|write down)\s+(que\s+)?/i,
      "",
    )
    .trim();
}

function parseProposalOutcome(stdout: string): CodeModeProposalOutcome | undefined {
  try {
    return JSON.parse(stdout) as CodeModeProposalOutcome;
  } catch {
    return undefined;
  }
}

function parseCommitOutcome(stdout: string): CodeModeCommitOutcome | undefined {
  try {
    return JSON.parse(stdout) as CodeModeCommitOutcome;
  } catch {
    return undefined;
  }
}

function cliStatus(result: {
  readonly denied: boolean;
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}): string {
  const body = (result.stdout || result.stderr).trim();
  if (result.denied) {
    return "status: denied (commit_forbidden)";
  }
  if (result.exitCode === 0 && body.length > 0) {
    return body.slice(0, 240);
  }
  if (body.length > 0) {
    return `status: failed (${sliceReason(body)})`;
  }
  return "status: failed (host_error)";
}

function sliceReason(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { kind?: string }; kind?: string };
    const kind = parsed.error?.kind ?? parsed.kind;
    if (typeof kind === "string" && kind.length > 0) {
      return kind;
    }
  } catch {
    // keep raw
  }
  return body.slice(0, 80);
}
