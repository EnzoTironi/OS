import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { Code, ConnectError } from "@connectrpc/connect";
import type { Client as PostgresClient } from "pg";
import {
  CommitStatus,
  type CommitReceipt,
} from "../gen/connect/zoen/action/v1/action_pb.js";
import {
  EffectEvidenceOutcome,
  EffectKnowledgeState,
  type EffectSnapshot,
} from "../gen/connect/zoen/effect/v1/effect_pb.js";
import {
  loadFixture,
  propose,
} from "./governed-action/support.js";
import {
  connectorStatus,
  providerOperation,
  tenantA,
  waitFor,
  type ActionClient,
  type ConnectorStatus,
  type EffectClient,
  type ManagedProcess,
  type ProviderOperation,
} from "./effect-support.js";

export type EffectsFixture = Awaited<ReturnType<typeof loadFixture>>;

export class EvidenceRecorder {
  readonly assertions: Record<string, boolean> = {};
  readonly failureInjections: string[] = [];
  readonly observedStates = new Set<string>();

  observe(name: string, observed: boolean): void {
    assert.ok(observed, name);
    this.assertions[name] = observed;
  }

  inject(name: string): void {
    this.failureInjections.push(name);
  }

  state(snapshot: EffectSnapshot): void {
    const request = snapshot.request;
    assert.ok(request);
    this.observedStates.add(stateName(request.state));
  }
}

export interface CommittedEffect {
  effectRequestId: string;
  idempotencyKey: string;
  operationId: string;
  receipt: CommitReceipt;
}

export interface EffectsScenario {
  actionA: ActionClient;
  actionB: ActionClient;
  admin: PostgresClient;
  effectA: EffectClient;
  effectB: EffectClient;
  effectReconcilerA: EffectClient;
  effectReconcilerB: EffectClient;
  effectWorkerA: EffectClient;
  effectWorkerB: EffectClient;
  fixture: EffectsFixture;
  policyManifestPath: string;
  processes: ManagedProcess[];
  recorder: EvidenceRecorder;
  runtime: {
    connector: ManagedProcess;
    provider: ManagedProcess;
    zoend: ManagedProcess;
  };
}

export async function commitEffect(
  action: ActionClient,
  fixture: EffectsFixture,
  label: string,
  tenantId = tenantA,
): Promise<CommittedEffect> {
  const operationId = `operation.effects.${label}`;
  const proposalId = `proposal.effects.${label}`;
  const proposed = await propose(action, {
    expiresAt: new Date(Date.now() + 300_000),
    fixture,
    operationId,
    proposalId,
    quantity: "1",
  });
  assert.ok(proposed.proposal);
  const committed = await action.commit({ operationId, proposalId });
  assert.equal(committed.status, CommitStatus.COMMITTED);
  assert.ok(committed.receipt);
  const effectRequestId = committed.receipt.effectRequestIds[0];
  assert.ok(effectRequestId);
  return {
    effectRequestId,
    idempotencyKey: `idempotency.${tenantId}.${effectRequestId}`,
    operationId,
    receipt: committed.receipt,
  };
}

export async function waitForState(
  client: EffectClient,
  effectRequestId: string,
  expected: EffectKnowledgeState,
): Promise<EffectSnapshot> {
  return waitFor(async () => {
    const response = await client.getEffect({ effectRequestId });
    const snapshot = response.snapshot;
    return snapshot?.request?.state === expected ? snapshot : undefined;
  }, `${effectRequestId} to reach ${stateName(expected)}`);
}

export async function waitForProviderOperation(
  idempotencyKey: string,
): Promise<ProviderOperation> {
  return waitFor(
    () => providerOperation(idempotencyKey),
    `provider operation ${idempotencyKey}`,
  );
}

export async function waitForConnectorStatus(
  idempotencyKey: string,
  tenantId?: string,
): Promise<ConnectorStatus> {
  return waitFor(
    () => connectorStatus(idempotencyKey, tenantId),
    `connector status ${idempotencyKey}`,
  );
}

export function evidenceInput(
  operation: ConnectorStatus,
  suffix: string,
) {
  return {
    evidenceDigest: operation.evidenceDigest,
    evidenceId: `evidence.${suffix}`,
    idempotencyKey: operation.idempotencyKey,
    observedAt: timestampFromDate(
      new Date(Number(BigInt(operation.observedAtMicros) / 1_000n)),
    ),
    outcome:
      operation.outcome === "confirmed"
        ? EffectEvidenceOutcome.CONFIRMED
        : EffectEvidenceOutcome.NO_EFFECT,
    sourceId: "source.provider-query",
    sourceRef: operation.sourceRef,
    providerOperationId: operation.providerOperationId,
  };
}

export async function evidenceCounts(
  admin: PostgresClient,
  effectRequestId: string,
): Promise<{ evidence: number; reconciliations: number }> {
  const result = await admin.query<{
    evidence: string;
    reconciliations: string;
  }>(
    `SELECT
        (SELECT count(*)::text FROM effect_evidence WHERE tenant_id = $1 AND effect_request_id = $2) AS evidence,
        (SELECT count(*)::text FROM effect_reconciliations WHERE tenant_id = $1 AND effect_request_id = $2) AS reconciliations`,
    [tenantA, effectRequestId],
  );
  return {
    evidence: Number(result.rows[0]?.evidence),
    reconciliations: Number(result.rows[0]?.reconciliations),
  };
}

export async function actionCommitCount(
  admin: PostgresClient,
): Promise<number> {
  const result = await admin.query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM authority_commits
     WHERE tenant_id = $1 AND commit_kind = 'action'`,
    [tenantA],
  );
  return Number(result.rows[0]?.count);
}

export async function dispatchAttemptCount(
  admin: PostgresClient,
  effectRequestId: string,
): Promise<number> {
  const result = await admin.query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM effect_dispatch_attempts
     WHERE tenant_id = $1 AND effect_request_id = $2`,
    [tenantA, effectRequestId],
  );
  return Number(result.rows[0]?.count);
}

export async function expectConnectCode(
  action: () => Promise<unknown>,
  expected: Code,
): Promise<Code> {
  try {
    await action();
    assert.fail(`expected Connect error ${Code[expected]}`);
  } catch (error: unknown) {
    if (!(error instanceof ConnectError)) {
      throw error;
    }
    assert.equal(error.code, expected, error.message);
    return error.code;
  }
}

export function stateName(state: EffectKnowledgeState): string {
  switch (state) {
    case EffectKnowledgeState.NOT_ATTEMPTED:
      return "not_attempted";
    case EffectKnowledgeState.DEFINITELY_NOT_SENT:
      return "definitely_not_sent";
    case EffectKnowledgeState.UNKNOWN:
      return "unknown";
    case EffectKnowledgeState.ACCEPTED_PENDING:
      return "accepted_pending";
    case EffectKnowledgeState.CONFIRMED:
      return "confirmed";
    case EffectKnowledgeState.CONFIRMED_NO_EFFECT:
      return "confirmed_no_effect";
    case EffectKnowledgeState.CONTRADICTED:
      return "contradicted";
    case EffectKnowledgeState.UNSPECIFIED:
      return "unspecified";
    default: {
      const exhaustive: never = state;
      return exhaustive;
    }
  }
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
