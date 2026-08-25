import type { Timestamp } from "@bufbuild/protobuf/wkt";
import type {
  CommitStatus,
  PolicyDecision,
  ProposalStatus,
} from "../../sdk/src/gen/zoen/action/v1/action_pb.js";

export interface OsdkDefinitionRef {
  readonly definitionId: string;
  readonly digest: string;
  readonly revision: bigint | number | string;
}

export interface SemanticQueryView {
  readonly values: readonly {
    readonly dependencies: readonly { readonly entityId: string }[];
    readonly value?: {
      readonly value: {
        readonly case:
          | "boolValue"
          | "decimalValue"
          | "entityRefValue"
          | "integerValue"
          | "quantityValue"
          | "textValue"
          | undefined;
        readonly value?:
          | boolean
          | string
          | { readonly amount: string; readonly unit: string };
      };
    };
  }[];
}

export interface SemanticQueryInit {
  readonly consistency?: object;
  readonly definition: OsdkDefinitionRef;
  readonly entityId: string;
  readonly query?: {
    readonly case?: "byType";
    readonly value?: { readonly limit: number; readonly typeId: string };
  };
  readonly selection?: {
    readonly value?: {
      readonly case?: "computationId" | "relationId";
      readonly value?: string;
    };
  };
  readonly tenantId: string;
  readonly validAt?: Timestamp;
}

/**
 * World read port. Intentionally has no `recordEvidence` — belief writes
 * go through Action preview/commit on zoend (Cedar), not a second store.
 */
export interface OsdkWorld {
  semanticQuery(request: SemanticQueryInit): Promise<SemanticQueryView>;
}

export interface ProposeInit {
  readonly actionId: string;
  readonly definition: OsdkDefinitionRef;
  readonly expiresAt?: Timestamp;
  readonly inputs: readonly object[];
  readonly operationId: string;
  readonly proposalId: string;
  readonly resourceId: string;
  readonly validAt?: Timestamp;
}

export interface ProposeView {
  readonly decision: PolicyDecision;
  readonly evaluationError?: string;
  readonly proposal?: {
    readonly operationId?: string;
    readonly proposalId?: string;
    readonly status: ProposalStatus;
  };
}

export interface ApproveInit {
  readonly approvalId: string;
  readonly expiresAt?: Timestamp;
  readonly proposalId: string;
}

export interface ApproveView {
  readonly decision: PolicyDecision;
  readonly evaluationError?: string;
}

export interface CommitInit {
  readonly operationId: string;
  readonly proposalId: string;
}

export interface CommitView {
  readonly error?: string;
  readonly receipt?: {
    readonly operationId?: string;
    readonly recordIds?: readonly string[];
  };
  readonly status: CommitStatus;
}

/**
 * zoend ActionService subset. Preview calls `propose` only. Commit calls
 * `propose`, `approve` when the proposal is awaiting approval, then `commit`.
 * Cedar evaluation happens on zoend, not in this client.
 */
export interface OsdkActionsPort {
  approve(request: ApproveInit): Promise<ApproveView>;
  commit(request: CommitInit): Promise<CommitView>;
  propose(request: ProposeInit): Promise<ProposeView>;
}

export function definitionRevision(ref: OsdkDefinitionRef): bigint {
  return typeof ref.revision === "bigint" ? ref.revision : BigInt(ref.revision);
}
