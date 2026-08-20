import assert from "node:assert/strict";
import {
  execFile,
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { z } from "zod";
import type { Client as PostgresClient } from "pg";
import { delay, repositoryRoot } from "../governed-action/support.js";
import { e2eHttpUrl } from "../host-env.js";

const clientPath = path.join(
  repositoryRoot,
  "dist",
  "e2e",
  "durable-commit",
  "client.js",
);
const composeFile = path.join("e2e", "durable-commit", "compose.yaml");
const composeProject = "zoen-durable-commit";
const baseUrl = e2eHttpUrl("ZOEN_E2E_ZOEND_PORT", 58_101);

const commitResultSchema = z.object({
  collisionKind: z.number().int(),
  currentStateBasisDigest: z.string().optional(),
  receipt: z
    .object({
      commitSequence: z.string(),
      effectRequestIds: z.array(z.string()),
      intentDigest: z.string(),
      operationId: z.string(),
      proposalId: z.string(),
      recordIds: z.array(z.string()),
    })
    .optional(),
  status: z.number().int(),
});

export type CommitProcessResult = z.infer<typeof commitResultSchema>;

export interface CommitProcessInput {
  operationId: string;
  proposalId: string;
  token: string;
}

export interface CommitProcess {
  child: ChildProcessWithoutNullStreams;
  stderr: string[];
  stdout: string[];
}

export interface DurableSnapshot {
  actionOperationRecords: number;
  actionOperations: number;
  actionProposals: number;
  authorityCommits: number;
  authorityHead: number;
  effectRequests: number;
  projectionOutbox: number;
  semanticClaims: number;
}

export function startCommitProcess(input: CommitProcessInput): CommitProcess {
  const stderr: string[] = [];
  const stdout: string[] = [];
  const child = spawn(process.execPath, [clientPath], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      ZOEN_E2E_BASE_URL: baseUrl,
      ZOEN_E2E_OPERATION_ID: input.operationId,
      ZOEN_E2E_PROPOSAL_ID: input.proposalId,
      ZOEN_E2E_TOKEN: input.token,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdin.end();
  child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk.toString()));
  return { child, stderr, stdout };
}

export async function runCommitProcess(
  input: CommitProcessInput,
): Promise<CommitProcessResult> {
  return waitForCommitProcess(startCommitProcess(input));
}

export async function waitForCommitProcess(
  process: CommitProcess,
): Promise<CommitProcessResult> {
  await once(process.child, "exit");
  assert.equal(
    process.child.exitCode,
    0,
    `commit client failed:\n${process.stderr.join("")}`,
  );
  return commitResultSchema.parse(JSON.parse(process.stdout.join("")));
}

export async function killCommitProcess(process: CommitProcess): Promise<void> {
  if (process.child.exitCode !== null) {
    return;
  }
  process.child.kill("SIGKILL");
  await once(process.child, "exit");
}

export async function waitForOperation(
  client: PostgresClient,
  tenantId: string,
  operationId: string,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await client.query<{ found: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM action_operations
         WHERE tenant_id = $1 AND operation_id = $2
       ) AS found`,
      [tenantId, operationId],
    );
    if (result.rows[0]?.found === true) {
      return;
    }
    await delay(50);
  }
  throw new Error(`operation ${operationId} was not committed`);
}

export async function durableSnapshot(
  client: PostgresClient,
  tenantId: string,
): Promise<DurableSnapshot> {
  const counts = await client.query<{
    action_operation_records: string;
    action_operations: string;
    action_proposals: string;
    authority_commits: string;
    authority_head: string;
    effect_requests: string;
    projection_outbox: string;
    semantic_claims: string;
  }>(
    `SELECT
       (SELECT count(*)::text FROM action_operation_records WHERE tenant_id = $1)
         AS action_operation_records,
       (SELECT count(*)::text FROM action_operations WHERE tenant_id = $1)
         AS action_operations,
       (SELECT count(*)::text FROM action_proposals WHERE tenant_id = $1)
         AS action_proposals,
       (SELECT count(*)::text FROM authority_commits WHERE tenant_id = $1)
         AS authority_commits,
       COALESCE(
         (SELECT commit_sequence::text FROM authority_heads WHERE tenant_id = $1),
         '0'
       ) AS authority_head,
       (
         SELECT count(*)::text
         FROM projection_outbox
         WHERE tenant_id = $1 AND effect_request_id IS NOT NULL
       ) AS effect_requests,
       (SELECT count(*)::text FROM projection_outbox WHERE tenant_id = $1)
         AS projection_outbox,
       (SELECT count(*)::text FROM semantic_claims WHERE tenant_id = $1)
         AS semantic_claims`,
    [tenantId],
  );
  const row = counts.rows[0];
  assert.ok(row);
  return {
    actionOperationRecords: Number(row.action_operation_records),
    actionOperations: Number(row.action_operations),
    actionProposals: Number(row.action_proposals),
    authorityCommits: Number(row.authority_commits),
    authorityHead: Number(row.authority_head),
    effectRequests: Number(row.effect_requests),
    projectionOutbox: Number(row.projection_outbox),
    semanticClaims: Number(row.semantic_claims),
  };
}

export async function seedEffectRequestCollision(
  client: PostgresClient,
  tenantId: string,
  commitSequence: bigint,
  effectRequestId: string,
): Promise<void> {
  await client.query(
    `INSERT INTO projection_outbox (
       tenant_id, commit_sequence, ordinal, event_type, event_version, payload,
       effect_request_id
     )
     SELECT
       $1,
       $2,
       COALESCE(max(ordinal), -1) + 1,
       'ActionEffectCollisionFixture',
       1,
       '{}'::jsonb,
       $3
     FROM projection_outbox
     WHERE tenant_id = $1 AND commit_sequence = $2`,
    [tenantId, commitSequence.toString(), effectRequestId],
  );
}

export async function seedSemanticRecordCollision(
  client: PostgresClient,
  tenantId: string,
  sourceClaimId: string,
  collisionClaimId: string,
): Promise<void> {
  await client.query(
    `INSERT INTO semantic_claims (
       tenant_id, claim_id, definition_id, definition_digest, definition_revision,
       entity_id, relation_id, value_kind, value_text, value_unit,
       valid_time_kind, valid_from_micros, valid_to_micros,
       source_id, source_digest, source_ref, commit_sequence
     )
     SELECT
       tenant_id, $3, definition_id, definition_digest, definition_revision,
       entity_id, relation_id, value_kind, value_text, value_unit,
       valid_time_kind, valid_from_micros, valid_to_micros,
       source_id, source_digest, source_ref, commit_sequence
     FROM semantic_claims
     WHERE tenant_id = $1 AND claim_id = $2`,
    [tenantId, sourceClaimId, collisionClaimId],
  );
}

export function composeOutput(...arguments_: string[]): Promise<string> {
  return command("docker", [
    "compose",
    "--project-name",
    composeProject,
    "--file",
    composeFile,
    ...arguments_,
  ]);
}

function command(
  executable: string,
  arguments_: readonly string[],
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      executable,
      [...arguments_],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error !== null) {
          reject(new Error(`${stdout}${stderr}`, { cause: error }));
          return;
        }
        resolve(stdout.trim());
      },
    );
  });
}
