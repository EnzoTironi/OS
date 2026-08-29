import assert from "node:assert/strict";
import type { Client as PostgresClient } from "pg";
import type { CommitReceipt } from "../../gen/connect/zoen/action/v1/action_pb.js";
import type {
  ActionClient,
  DefinitionFixture,
  ServerProcess,
} from "../governed-action/support.js";

export interface DurableFixtures {
  direct: DefinitionFixture;
  multi: DefinitionFixture;
  self: DefinitionFixture;
}

export interface DurableRuntime {
  admin: PostgresClient;
  server: ServerProcess;
}

export interface DurableScenario {
  actionA: ActionClient;
  actionB: ActionClient;
  agentAToken: string;
  agentBToken: string;
  fixtures: DurableFixtures;
  policyManifestPath: string;
  recorder: EvidenceRecorder;
  runtime: DurableRuntime;
}

export interface ReceiptShape {
  commitSequence: string;
  effectRequestIds: string[];
  intentDigest: string;
  operationId: string;
  proposalId: string;
  recordIds: string[];
}

export class EvidenceRecorder {
  readonly assertions: Record<string, boolean> = {};
  readonly failureInjections: string[] = [];

  observe(name: string, observed: boolean): void {
    assert.ok(observed, name);
    this.assertions[name] = observed;
  }

  inject(name: string): void {
    this.failureInjections.push(name);
  }
}

export function receiptShape(
  receipt: CommitReceipt | undefined,
): ReceiptShape {
  assert.ok(receipt);
  return {
    commitSequence: receipt.commitSequence.toString(),
    effectRequestIds: receipt.effectRequestIds,
    intentDigest: receipt.intentDigest,
    operationId: receipt.operationId,
    proposalId: receipt.proposalId,
    recordIds: receipt.recordIds,
  };
}
