import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { Code, ConnectError } from "@connectrpc/connect";
import type { Client as PostgresClient } from "pg";
import {
  CommitStatus,
  type CommitReceipt,
} from "../../packages/sdk/src/gen/zoen/action/v1/action_pb.js";
import {
  EffectAttemptOutcome,
  EffectAttemptReason,
  EffectEvidenceOutcome,
  EffectKnowledgeState,
  type EffectSnapshot,
} from "../../packages/sdk/src/gen/zoen/effect/v1/effect_pb.js";
import {
  loadFixture,
  propose,
} from "../governed-action/support.js";
import {
  tenantA,
  waitFor,
  type ActionClient,
  type EffectClient,
  type ManagedProcess,
} from "./support.js";

export type HumanFixture = Awaited<ReturnType<typeof loadFixture>>;

export class EvidenceRecorder {
  readonly assertions: Record<string, boolean> = {};
  readonly failureInjections: string[] = [];
  readonly mutantsKilled: Record<string, boolean> = {};
  readonly observedStates = new Set<string>();
  readonly packetDigests: string[] = [];

  observe(name: string, observed: boolean): void {
    assert.ok(observed, name);
    this.assertions[name] = observed;
  }

  kill(mutant: string, killed: boolean): void {
    assert.ok(killed, `mutant survived: ${mutant}`);
    this.mutantsKilled[mutant] = killed;
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

export interface HumanScenario {
  actionA: ActionClient;
  actionB: ActionClient;
  admin: PostgresClient;
  effectA: EffectClient;
  effectB: EffectClient;
  effectHumanA: EffectClient;
  effectHumanB: EffectClient;
  effectHumanRevokedA: EffectClient;
  effectReconcilerA: EffectClient;
  effectWorkerA: EffectClient;
  fixture: HumanFixture;
  policyManifestPath: string;
  processes: ManagedProcess[];
  recorder: EvidenceRecorder;
  runtime: {
    worker: ManagedProcess;
    zoend: ManagedProcess;
  };
}

export interface HumanTaskContractJson {
  bounds: {
    allowedActions: string[];
    disclosureClass: "minimal" | "standard";
    maxExpenseMinor: number | null;
  };
  contact: { nameRef: string | null; phoneRef: string | null } | null;
  executorClass: "human_executor";
  expiryMicros: number;
  instruction: string;
  reconciliation: "required_independent" | "operator_attempt_sufficient";
  requiredEvidence: Array<{ fieldId: string; required: boolean }>;
  schemaVersion: 1;
  structuredInputs: Record<
    string,
    | { kind: "text"; value: string }
    | { kind: "integer"; value: number }
    | { kind: "boolean"; value: boolean }
  >;
}

export function humanTaskContract(
  overrides: Partial<HumanTaskContractJson> = {},
): HumanTaskContractJson {
  return {
    bounds: {
      allowedActions: ["collect_signature"],
      disclosureClass: "minimal",
      maxExpenseMinor: 0,
    },
    contact: { nameRef: "contact.name.1", phoneRef: null },
    executorClass: "human_executor",
    expiryMicros: Date.now() * 1000 + 3_600_000_000,
    instruction: "Collect wet signature for order",
    reconciliation: "required_independent",
    requiredEvidence: [{ fieldId: "signed_form", required: true }],
    schemaVersion: 1,
    structuredInputs: {
      order_id: { kind: "text", value: "order.1" },
    },
    ...overrides,
  };
}

export function encodeContract(contract: HumanTaskContractJson): Buffer {
  return Buffer.from(JSON.stringify(contract), "utf8");
}

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function commitEffect(
  action: ActionClient,
  fixture: HumanFixture,
  label: string,
): Promise<CommittedEffect> {
  const operationId = `operation.human.${label}`;
  const proposalId = `proposal.human.${label}`;
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
    idempotencyKey: `idempotency.${tenantA}.${effectRequestId}`,
    operationId,
    receipt: committed.receipt,
  };
}

export async function freezeHumanPayload(
  admin: PostgresClient,
  effectRequestId: string,
  contract: HumanTaskContractJson,
  tenantId = tenantA,
): Promise<{ payload: Buffer; requestDigest: string }> {
  const payload = encodeContract(contract);
  const requestDigest = sha256(payload);
  await admin.query(
    `UPDATE effect_requests
     SET payload = $1, request_digest = $2
     WHERE tenant_id = $3 AND effect_request_id = $4`,
    [payload, requestDigest, tenantId, effectRequestId],
  );
  return { payload, requestDigest };
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

export function projectPacket(input: {
  attemptId: string;
  contract: HumanTaskContractJson;
  effectRequestId: string;
  requestDigest: string;
}): {
  attemptId: string;
  effectRequestId: string;
  instruction: string;
  requestDigest: string;
  structuredInputs: HumanTaskContractJson["structuredInputs"];
} {
  return {
    attemptId: input.attemptId,
    effectRequestId: input.effectRequestId,
    instruction: input.contract.instruction,
    requestDigest: input.requestDigest,
    structuredInputs: input.contract.structuredInputs,
  };
}

export function mapOperatorReport(input: {
  kind:
    | "declined"
    | "unable"
    | "expired"
    | "reported-failure"
    | "reported-success";
  notes?: string;
}): {
  outcome: EffectAttemptOutcome;
  providerOperationId: string;
  reason: EffectAttemptReason;
  responseDigest: string;
} {
  const responseDigest = sha256(`human-report:${input.kind}:${input.notes ?? ""}`);
  const providerOperationId = `provider.human.${sha256(input.kind).slice(0, 16)}`;
  switch (input.kind) {
    case "declined":
    case "unable":
      return {
        outcome: EffectAttemptOutcome.DEFINITELY_NOT_SENT,
        providerOperationId: "",
        reason: EffectAttemptReason.CREDENTIAL_REVOKED,
        responseDigest: "",
      };
    case "expired":
      return {
        outcome: EffectAttemptOutcome.DEFINITELY_NOT_SENT,
        providerOperationId: "",
        reason: EffectAttemptReason.TIMEOUT_BEFORE_SEND,
        responseDigest: "",
      };
    case "reported-failure":
      return {
        outcome: EffectAttemptOutcome.UNKNOWN,
        providerOperationId,
        reason: EffectAttemptReason.PROVIDER_UNAVAILABLE,
        responseDigest,
      };
    case "reported-success":
      return {
        outcome: EffectAttemptOutcome.ACCEPTED_PENDING,
        providerOperationId,
        reason: EffectAttemptReason.UNSPECIFIED,
        responseDigest,
      };
    default: {
      const exhaustive: never = input.kind;
      return exhaustive;
    }
  }
}

export async function submitOperatorReport(
  client: EffectClient,
  effectRequestId: string,
  attemptId: string,
  kind:
    | "declined"
    | "unable"
    | "expired"
    | "reported-failure"
    | "reported-success",
  notes = "",
  observedAt = new Date("2026-01-01T00:00:00.000Z"),
): Promise<EffectSnapshot> {
  const mapped = mapOperatorReport({ kind, notes });
  const response = await client.recordAttempt({
    attempt: {
      attemptId,
      observedAt: timestampFromDate(observedAt),
      outcome: mapped.outcome,
      providerOperationId: mapped.providerOperationId,
      reason: mapped.reason,
      responseDigest: mapped.responseDigest,
    },
    effectRequestId,
  });
  assert.ok(response.snapshot);
  return response.snapshot;
}

export async function expectConnectCode(
  probe: () => Promise<unknown>,
  code: Code,
): Promise<void> {
  try {
    await probe();
    assert.fail(`expected ConnectError ${Code[code]}`);
  } catch (error: unknown) {
    assert.ok(error instanceof ConnectError, String(error));
    assert.equal(error.code, code, error.message);
  }
}

export function evidenceInput(input: {
  evidenceId: string;
  idempotencyKey: string;
  outcome: "confirmed" | "no_effect";
  providerOperationId: string;
  sourceRef: string;
}) {
  return {
    evidenceDigest: sha256(`${input.evidenceId}:${input.outcome}`),
    evidenceId: input.evidenceId,
    idempotencyKey: input.idempotencyKey,
    observedAt: timestampFromDate(new Date()),
    outcome:
      input.outcome === "confirmed"
        ? EffectEvidenceOutcome.CONFIRMED
        : EffectEvidenceOutcome.NO_EFFECT,
    providerOperationId: input.providerOperationId,
    sourceId: "source.reconciler.field-audit",
    sourceRef: input.sourceRef,
  };
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
    default:
      return "unspecified";
  }
}
