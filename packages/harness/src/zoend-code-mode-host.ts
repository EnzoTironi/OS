import { randomBytes } from "node:crypto";
import path from "node:path";
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { createClient, type Interceptor } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import {
  readZoendHostEnv,
  type ZoendHostEnv,
} from "./zoend-host-env.js";
import {
  ActionInputSchema,
  ActionService,
  ApproveRequestSchema,
  CommitRequestSchema,
  CommitStatus,
  PolicyDecision,
  ProposalStatus,
} from "../../sdk/src/gen/zoen/action/v1/action_pb.js";
import {
  DefinitionReferenceSchema,
  ExactValueSchema,
  QueryConsistencySchema,
  QuerySelectionSchema,
  QuantityValueSchema,
  StrongConsistencySchema,
  WorldService,
  type ExactValue as WireExactValue,
} from "../../sdk/src/gen/zoen/world/v1/world_pb.js";
import type {
  CodeModeCommitOutcome,
  CodeModeCommitRequest,
  CodeModeProposeRequest,
  CodeModeProposalOutcome,
  CodeModeQueryRequest,
  CodeModeQueryResultInput,
  ExecutionCodeModeHost,
} from "./execution-host.js";
import type { DefinitionReferenceConfig, ExactInput } from "./types.js";

interface CachedProposal {
  readonly awaitingApproval: boolean;
  readonly previewHash: string;
}

export type ZoendHostOptions = ZoendHostEnv & {
  readonly now?: () => Date;
};

/**
 * Build a zoend-backed `ExecutionCodeModeHost` from process env when Fly would.
 *
 * Context: WhatsApp serve. Connect stays in harness, not speaker.
 * Inputs: `ZOEN_IDENTITY_BASE_URL` (or Action/World URL) plus agent bearer.
 * Outputs: host that can query / propose / commit. Undefined when not configured.
 * Side effects: none until the planted CLI calls the host.
 */
export function createZoendCodeModeHostFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ExecutionCodeModeHost | undefined {
  const parsed = readZoendHostEnv(env);
  if (parsed === undefined) {
    return undefined;
  }
  return createZoendCodeModeHost(parsed);
}

/**
 * zoend Action/World host for the planted CLI. Cedar stays on zoend.
 *
 * Context: kernel path. Worker isolate still cannot commit.
 * Inputs: base URL, bearer, personal lake definition.
 * Outputs: WIT-shaped query / propose / commit outcomes.
 * Side effects: Propose → Approve (if needed) → Commit on zoend.
 */
export function createZoendCodeModeHost(
  options: ZoendHostOptions,
): ExecutionCodeModeHost {
  const now = options.now ?? (() => new Date());
  const proposals = new Map<string, CachedProposal>();
  let compiled: Promise<DefinitionReferenceConfig | undefined> | undefined;

  function token(): string {
    const read = options.readBearerToken() ?? options.bearerToken?.trim();
    if (read === undefined || read.length === 0) {
      throw new Error("agent bearer missing");
    }
    return read;
  }

  function clients() {
    const transport = connectTransport(options.baseUrl, token());
    return {
      action: createClient(ActionService, transport),
      world: createClient(WorldService, transport),
    };
  }

  async function definitionRef(): Promise<DefinitionReferenceConfig> {
    if (options.definition !== undefined) {
      return options.definition;
    }
    compiled ??= loadPersonalDefinition(options.definitionPath);
    const loaded = await compiled;
    if (loaded === undefined) {
      throw new Error("personal lake definition unavailable");
    }
    return loaded;
  }

  return {
    async query(request: CodeModeQueryRequest): Promise<CodeModeQueryResultInput> {
      const definition = await definitionRef();
      const tenantId = options.tenantId;
      if (tenantId === undefined || tenantId.length === 0) {
        throw new Error("ZOEN_TENANT_ID required for zoen query");
      }
      const response = await clients().world.semanticQuery({
        consistency: create(QueryConsistencySchema, {
          value: { case: "strong", value: create(StrongConsistencySchema) },
        }),
        definition: wireDefinition(definition),
        entityId: request.entityId,
        selection: wireSelection(request.selection),
        tenantId,
        validAt: timestampFromDate(now()),
      });
      return {
        actualCommitSequence: response.actualCommitSequence,
        values: response.values.map((row) => ({
          claimIds: row.dependencies.map((dep) => dep.claimId).filter((id) => id.length > 0),
          value: semanticToExact(row.value),
        })),
      };
    },

    async propose(
      request: CodeModeProposeRequest,
    ): Promise<CodeModeProposalOutcome> {
      const definition = await definitionRef();
      const response = await clients().action.propose({
        actionId: request.actionId,
        definition: wireDefinition(definition),
        expiresAt: timestampFromDate(new Date(now().getTime() + 10 * 60_000)),
        inputs: request.inputs.map((input) =>
          create(ActionInputSchema, {
            inputId: input.id,
            value: exactValue(input.value),
          }),
        ),
        operationId: request.operationId,
        proposalId: request.proposalId,
        resourceId: request.resourceId,
        validAt: timestampFromDate(now()),
      });
      if (response.decision === PolicyDecision.DENY) {
        return { kind: "denied" };
      }
      if (response.decision === PolicyDecision.EVALUATION_ERROR) {
        return { kind: "evaluation_error" };
      }
      const proposal = response.proposal;
      if (
        response.decision !== PolicyDecision.PERMIT ||
        proposal === undefined
      ) {
        return { kind: "evaluation_error" };
      }
      proposals.set(proposal.proposalId, {
        awaitingApproval: proposal.status === ProposalStatus.AWAITING_APPROVAL,
        previewHash: proposal.previewHash,
      });
      const body = {
        intentDigest: proposal.intentDigest,
        operationId: proposal.operationId,
        proposalId: proposal.proposalId,
      };
      return proposal.status === ProposalStatus.AWAITING_APPROVAL
        ? { kind: "awaiting_approval", proposal: body }
        : { kind: "ready", proposal: body };
    },

    async commit(request: CodeModeCommitRequest): Promise<CodeModeCommitOutcome> {
      const cached = proposals.get(request.proposalId);
      if (cached === undefined || cached.previewHash.length === 0) {
        return { kind: "denied" };
      }
      const action = clients().action;
      if (cached.awaitingApproval) {
        const approved = await action.approve(
          create(ApproveRequestSchema, {
            approvalId: `approval.${randomBytes(8).toString("hex")}`,
            expiresAt: timestampFromDate(new Date(now().getTime() + 10 * 60_000)),
            previewHash: cached.previewHash,
            proposalId: request.proposalId,
          }),
        );
        if (approved.decision === PolicyDecision.DENY) {
          return { kind: "denied" };
        }
        if (approved.decision !== PolicyDecision.PERMIT) {
          return { kind: "evaluation_error" };
        }
      }
      const committed = await action.commit(
        create(CommitRequestSchema, {
          operationId: request.operationId,
          previewHash: cached.previewHash,
          proposalId: request.proposalId,
        }),
      );
      if (
        committed.status === CommitStatus.COMMITTED &&
        committed.receipt !== undefined
      ) {
        return {
          action: {
            actionId: committed.receipt.actionId,
            commitSequence: Number(committed.receipt.commitSequence),
            intentDigest: committed.receipt.intentDigest,
            operationId: committed.receipt.operationId,
            proposalId: committed.receipt.proposalId,
            recovered: false,
          },
          kind: "committed",
        };
      }
      return commitStatusOutcome(committed.status);
    },
  };
}

async function loadPersonalDefinition(
  definitionPath: string | undefined,
): Promise<DefinitionReferenceConfig | undefined> {
  if (definitionPath === undefined || definitionPath.length === 0) {
    return undefined;
  }
  const { compileDefinition } = await import("@zoen/ontology");
  const compiled = await compileDefinition(path.resolve(definitionPath));
  return {
    definitionId: compiled.definition.definitionId,
    digest: compiled.digest,
    revision: compiled.definition.revision,
  };
}

function connectTransport(baseUrl: string, bearerToken: string) {
  const authorization: Interceptor = (next) => async (request) => {
    request.header.set("authorization", `Bearer ${bearerToken}`);
    return next(request);
  };
  return createConnectTransport({
    baseUrl,
    httpVersion: "1.1",
    interceptors: [authorization],
  });
}

function wireDefinition(definition: DefinitionReferenceConfig) {
  return create(DefinitionReferenceSchema, {
    definitionId: definition.definitionId,
    digest: definition.digest,
    revision: BigInt(definition.revision),
  });
}

function wireSelection(selection: CodeModeQueryRequest["selection"]) {
  switch (selection.kind) {
    case "computation":
      return create(QuerySelectionSchema, {
        value: { case: "computationId", value: selection.id },
      });
    case "relation":
      return create(QuerySelectionSchema, {
        value: { case: "relationId", value: selection.id },
      });
    default: {
      const exhaustive: never = selection;
      return exhaustive;
    }
  }
}

function exactValue(input: ExactInput) {
  switch (input.kind) {
    case "bool":
      return create(ExactValueSchema, {
        value: { case: "boolValue", value: input.value },
      });
    case "decimal":
      return create(ExactValueSchema, {
        value: { case: "decimalValue", value: input.value },
      });
    case "entity":
      return create(ExactValueSchema, {
        value: { case: "entityRefValue", value: input.value },
      });
    case "integer":
      return create(ExactValueSchema, {
        value: { case: "integerValue", value: input.value },
      });
    case "quantity":
      return create(ExactValueSchema, {
        value: {
          case: "quantityValue",
          value: create(QuantityValueSchema, {
            amount: input.amount,
            unit: input.unit,
          }),
        },
      });
    case "text":
      return create(ExactValueSchema, {
        value: { case: "textValue", value: input.value },
      });
    default: {
      const exhaustive: never = input;
      return exhaustive;
    }
  }
}

function semanticToExact(value: WireExactValue | undefined): ExactInput {
  if (value === undefined) {
    throw new Error("semantic query returned no exact value");
  }
  switch (value.value.case) {
    case "boolValue":
      return { kind: "bool", value: value.value.value };
    case "decimalValue":
      return { kind: "decimal", value: value.value.value };
    case "integerValue":
      return { kind: "integer", value: value.value.value };
    case "textValue":
      return { kind: "text", value: value.value.value };
    case "entityRefValue":
      return { kind: "entity", value: value.value.value };
    case "quantityValue":
      return {
        amount: value.value.value.amount,
        kind: "quantity",
        unit: value.value.value.unit,
      };
    case undefined:
      throw new Error("semantic query returned an unspecified exact value");
    default: {
      const exhaustive: never = value.value;
      return exhaustive;
    }
  }
}

function commitStatusOutcome(status: CommitStatus): CodeModeCommitOutcome {
  switch (status) {
    case CommitStatus.DENIED:
      return { kind: "denied" };
    case CommitStatus.EVALUATION_ERROR:
      return { kind: "evaluation_error" };
    case CommitStatus.IDENTITY_COLLISION:
      return { kind: "identity_collision" };
    case CommitStatus.OPERATION_MISMATCH:
      return { kind: "operation_mismatch" };
    case CommitStatus.STALE:
      return { kind: "stale" };
    default:
      return { kind: "denied" };
  }
}
