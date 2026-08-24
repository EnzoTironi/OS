import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { Code, ConnectError } from "@connectrpc/connect";
import canonicalize from "canonicalize";
import type { Client as PostgresClient } from "pg";
import {
  ActionInputSchema,
  CommitStatus,
  type ActionInput,
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
  DefinitionReferenceSchema,
  ExactValueSchema,
} from "../../packages/sdk/src/gen/zoen/world/v1/world_pb.js";
import {
  activationActionId,
  loadFixture,
  resourceId,
  textInput,
  type DefinitionFixture,
} from "../governed-action/support.js";
import {
  tenantA,
  waitFor,
  type ActionClient,
  type EffectClient,
  type ManagedProcess,
} from "./support.js";

export type HumanFixture = DefinitionFixture;

export const humanExecutorActionId =
  "inventory.collectSignature.humanExecutor";

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
  contract: HumanTaskContractJson;
  effectRequestId: string;
  idempotencyKey: string;
  operationId: string;
  payload: Buffer;
  receipt: CommitReceipt;
  requestDigest: string;
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

export interface CommitHumanOptions {
  expiresAt?: Date;
  instruction?: string;
  orderId?: string;
  quantity?: string;
  tenantId?: string;
}

export async function loadHumanExecutorFixture(): Promise<HumanFixture> {
  const base = await loadFixture("direct", 1);
  const document = JSON.parse(base.canonicalJson) as {
    actions: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
  document.actions.push({
    effects: [
      {
        relationId: "inventory.requested",
        value: { inputId: "quantity", kind: "input" },
      },
    ],
    id: humanExecutorActionId,
    inputs: [
      { id: "instruction", valueType: { kind: "text" } },
      { id: "order_id", valueType: { kind: "text" } },
      { id: "quantity", valueType: { kind: "integer" } },
    ],
    precondition: {
      kind: "binary",
      left: { kind: "relation", relationId: "inventory.available" },
      operator: "greater_than",
      right: { inputId: "quantity", kind: "input" },
    },
  });
  document.actions.sort((left, right) =>
    String(left.id).localeCompare(String(right.id)),
  );
  for (const action of document.actions) {
    const inputs = action.inputs as Array<{ id: string }> | undefined;
    if (inputs) {
      inputs.sort((left, right) => left.id.localeCompare(right.id));
    }
  }
  const canonicalJson = canonicalize(document);
  assert.ok(canonicalJson);
  const digest = sha256(canonicalJson);
  return {
    canonicalJson,
    definition: create(DefinitionReferenceSchema, {
      definitionId: base.definition.definitionId,
      digest,
      revision: base.definition.revision,
    }),
    digest,
    policyDigest: base.policyDigest,
    policyId: base.policyId,
    policyRevision: base.policyRevision,
    policySource: base.policySource,
  };
}

export async function writeHumanExecutorPolicyManifest(
  outputPath: string,
  fixture: HumanFixture,
): Promise<void> {
  const activationSource = await readFile(
    path.join(process.cwd(), "e2e", "governed-action", "activation.cedar"),
    "utf8",
  );
  const activationDigest = sha256(activationSource);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify(
      {
        policies: [
          {
            actionId: "inventory.requestStock",
            definitionDigest: fixture.digest,
            digest: fixture.policyDigest,
            policyId: fixture.policyId,
            revision: fixture.policyRevision,
            source: fixture.policySource,
          },
          {
            actionId: humanExecutorActionId,
            definitionDigest: fixture.digest,
            digest: fixture.policyDigest,
            policyId: `${fixture.policyId}.humanExecutor`,
            revision: fixture.policyRevision,
            source: fixture.policySource,
          },
          {
            actionId: activationActionId,
            definitionDigest: fixture.digest,
            digest: activationDigest,
            policyId: `policy.activation.${fixture.definition.definitionId}`,
            revision: fixture.policyRevision,
            source: activationSource,
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
}

export function encodeContract(contract: HumanTaskContractJson): Buffer {
  return Buffer.from(JSON.stringify(contract), "utf8");
}

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function parseHumanTaskContract(payload: Uint8Array): HumanTaskContractJson {
  const parsed = JSON.parse(Buffer.from(payload).toString("utf8")) as HumanTaskContractJson;
  assert.equal(parsed.executorClass, "human_executor");
  assert.equal(parsed.schemaVersion, 1);
  return parsed;
}

export async function commitEffect(
  action: ActionClient,
  fixture: HumanFixture,
  label: string,
  options: CommitHumanOptions = {},
): Promise<CommittedEffect> {
  const operationId = `operation.human.${label}`;
  const proposalId = `proposal.human.${label}`;
  const expiresAt = options.expiresAt ?? new Date(Date.now() + 300_000);
  const instruction =
    options.instruction ?? "Collect wet signature for order";
  const orderId = options.orderId ?? "order.1";
  const quantity = options.quantity ?? "1";
  const proposed = await action.propose({
    actionId: humanExecutorActionId,
    definition: fixture.definition,
    expiresAt: timestampFromDate(expiresAt),
    inputs: [
      integerInput("quantity", quantity),
      textInput("instruction", instruction),
      textInput("order_id", orderId),
    ],
    operationId,
    proposalId,
    resourceId,
    validAt: timestampFromDate(new Date("2026-08-19T00:00:00.000Z")),
  });
  assert.ok(proposed.proposal);
  const committed = await action.commit({ operationId, proposalId });
  assert.equal(committed.status, CommitStatus.COMMITTED, committed.error);
  assert.ok(committed.receipt);
  const effectRequestId = committed.receipt.effectRequestIds[0];
  assert.ok(effectRequestId);
  const tenantId = options.tenantId ?? tenantA;
  return {
    contract: {
      bounds: {
        allowedActions: ["collect_signature"],
        disclosureClass: "minimal",
        maxExpenseMinor: 0,
      },
      contact: { nameRef: "contact.name.1", phoneRef: null },
      executorClass: "human_executor",
      expiryMicros: expiresAt.getTime() * 1000,
      instruction,
      reconciliation: "required_independent",
      requiredEvidence: [{ fieldId: "signed_form", required: true }],
      schemaVersion: 1,
      structuredInputs: {
        order_id: { kind: "text", value: orderId },
      },
    },
    effectRequestId,
    idempotencyKey: `idempotency.${tenantId}.${effectRequestId}`,
    operationId,
    payload: Buffer.alloc(0),
    receipt: committed.receipt,
    requestDigest: "",
  };
}

export async function readCommittedHumanContract(
  effect: EffectClient,
  effectRequestId: string,
): Promise<{
  contract: HumanTaskContractJson;
  payload: Buffer;
  requestDigest: string;
}> {
  const response = await effect.getEffect({ effectRequestId });
  const request = response.snapshot?.request;
  assert.ok(request, `missing effect request ${effectRequestId}`);
  const payload = Buffer.from(request.payload);
  const contract = parseHumanTaskContract(payload);
  assert.equal(request.requestDigest, sha256(payload));
  return {
    contract,
    payload,
    requestDigest: request.requestDigest,
  };
}

export async function commitHumanEffect(
  action: ActionClient,
  effect: EffectClient,
  fixture: HumanFixture,
  label: string,
  options: CommitHumanOptions = {},
): Promise<CommittedEffect> {
  const committed = await commitEffect(action, fixture, label, options);
  const frozen = await readCommittedHumanContract(
    effect,
    committed.effectRequestId,
  );
  assert.equal(frozen.contract.executorClass, "human_executor");
  assert.equal(frozen.contract.instruction, options.instruction ?? "Collect wet signature for order");
  return {
    ...committed,
    contract: frozen.contract,
    payload: frozen.payload,
    requestDigest: frozen.requestDigest,
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

export function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function integerInput(inputId: string, value: string): ActionInput {
  return create(ActionInputSchema, {
    inputId,
    value: create(ExactValueSchema, {
      value: {
        case: "integerValue",
        value,
      },
    }),
  });
}
