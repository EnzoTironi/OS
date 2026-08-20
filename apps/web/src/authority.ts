import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { Code, ConnectError } from "@connectrpc/connect";
import { type QueryClient } from "@tanstack/react-query";
import {
  ActionInputSchema,
  CommitStatus,
  DefinitionReferenceSchema,
  ExactValueSchema,
  PolicyDecision,
  ProposalStatus,
  QuantityValueSchema,
  QueryConsistencySchema,
  QuerySelectionSchema,
  StrongConsistencySchema,
  type ActionInput,
  type CommitReceipt,
  type CommitResponse,
  type ProposeResponse,
  type ZoenBrowserClient,
  parseDefinitionMetadata,
} from "@zoen/sdk";
import {
  compileDeterministicSurface,
  effectStatusView,
  parseSurfaceDocument,
  queryBindingView,
  semanticQueryCacheKey,
  type ActionBinding,
  type ActionInputControl,
  type ActionOperationView,
  type HistoryEntryView,
  type QueryBinding,
  type QueryBindingView,
  type SurfaceDocument,
  type SurfaceRuntimeData,
} from "@zoen/surface";
import type { RuntimeConfig } from "./config.js";

export interface LoadedAuthoritySurface {
  readonly data: SurfaceRuntimeData;
  readonly document: SurfaceDocument;
}

export interface ActionIdentity {
  readonly bindingId: string;
  readonly operationId: string;
  readonly proposalId: string;
}

export class ActionUnavailableError extends Error {}

export async function loadAuthoritySurface(
  client: ZoenBrowserClient,
  config: RuntimeConfig,
  queryClient: QueryClient,
): Promise<LoadedAuthoritySurface> {
  const active = await client.definitions.getActiveRevision({
    definitionId: config.definitionId,
    tenantId: client.tenantId,
  });
  const revision = active.definitionRevision;
  if (revision === undefined) {
    throw new Error(`Unknown definition ${config.definitionId}`);
  }
  const metadata = parseDefinitionMetadata(revision.canonicalJson);
  const compiled = compileDeterministicSurface({
    definition: {
      definitionId: revision.definitionId,
      digest: revision.digest,
      revision: revision.revision.toString(),
    },
    entityId: config.resourceId,
    metadata,
  });
  const document = parseSurfaceDocument(compiled, metadata);
  const discovery = await client.actions.discover({
    definition: protocolDefinition(document),
    resourceId: config.resourceId,
  });
  const actions = Object.fromEntries(
    document.actionBindings.map((binding): [string, ActionOperationView] => {
      const capability = discovery.actions.find(
        (candidate) => candidate.actionId === binding.ref.actionId,
      );
      return [
        binding.id,
        capability?.decision === PolicyDecision.PERMIT
          ? { kind: "idle" }
          : {
              error: "Server discovery did not return an available capability.",
              kind: "unavailable",
            },
      ];
    }),
  );
  const queries = await refreshQueries(
    client,
    config,
    document,
    queryClient,
    revision.commitSequence.toString(),
  );
  return {
    data: {
      actions,
      history: {},
      queries,
    },
    document,
  };
}

export async function refreshQueries(
  client: ZoenBrowserClient,
  config: RuntimeConfig,
  document: SurfaceDocument,
  queryClient: QueryClient,
  commitSequence: string,
): Promise<Readonly<Record<string, QueryBindingView>>> {
  const entries = await Promise.all(
    document.queryBindings.map(async (binding): Promise<[string, QueryBindingView]> => {
      const response = await queryClient.fetchQuery({
        queryFn: () =>
          client.world.semanticQuery({
            consistency: create(QueryConsistencySchema, {
              value: {
                case: "strong",
                value: create(StrongConsistencySchema),
              },
            }),
            definition: protocolDefinition(document),
            entityId: binding.ref.entityId,
            selection: selection(binding),
            tenantId: client.tenantId,
            validAt: timestampFromDate(new Date(config.validAt)),
          }),
        queryKey: semanticQueryCacheKey({
          commitSequence,
          query: binding.ref,
          tenantId: client.tenantId,
        }),
      });
      return [binding.id, queryBindingView(response)];
    }),
  );
  return Object.fromEntries(entries);
}

export async function proposeAuthorityAction(
  client: ZoenBrowserClient,
  config: RuntimeConfig,
  document: SurfaceDocument,
  identity: ActionIdentity,
  values: Readonly<Record<string, string | boolean>>,
): Promise<ProposeResponse> {
  const binding = requireActionBinding(document, identity.bindingId);
  const discovery = await client.actions.discover({
    definition: protocolDefinition(document),
    resourceId: binding.ref.resourceId,
  });
  const capability = discovery.actions.find(
    (candidate) => candidate.actionId === binding.ref.actionId,
  );
  if (capability?.decision !== PolicyDecision.PERMIT) {
    throw new ActionUnavailableError(
      "Server discovery no longer permits this ActionRef.",
    );
  }
  return client.actions.propose({
    actionId: binding.ref.actionId,
    definition: protocolDefinition(document),
    expiresAt: timestampFromDate(new Date(Date.now() + 300_000)),
    inputs: binding.inputs.map((input) =>
      actionInput(input, values[input.inputId]),
    ),
    operationId: identity.operationId,
    proposalId: identity.proposalId,
    resourceId: binding.ref.resourceId,
    validAt: timestampFromDate(new Date(config.validAt)),
  });
}

export async function commitAuthorityAction(
  client: ZoenBrowserClient,
  identity: ActionIdentity,
): Promise<CommitResponse> {
  return client.actions.commit({
    operationId: identity.operationId,
    proposalId: identity.proposalId,
  });
}

export async function committedOperationView(
  client: ZoenBrowserClient,
  receipt: CommitReceipt,
): Promise<ActionOperationView> {
  const effects = await Promise.all(
    receipt.effectRequestIds.map(async (effectRequestId) => {
      try {
        const response = await client.effects.getEffect({ effectRequestId });
        return response.snapshot === undefined
          ? { effectRequestId, kind: "unknown" as const }
          : effectStatusView(response.snapshot);
      } catch {
        return { effectRequestId, kind: "unknown" as const };
      }
    }),
  );
  return {
    commitSequence: receipt.commitSequence.toString(),
    effects,
    kind: "committed",
    operationId: receipt.operationId,
    proposalId: receipt.proposalId,
  };
}

export function proposedOperationView(
  response: ProposeResponse,
  identity: ActionIdentity,
): ActionOperationView {
  switch (response.decision) {
    case PolicyDecision.PERMIT: {
      const proposal = response.proposal;
      if (
        proposal === undefined ||
        proposal.operationId !== identity.operationId ||
        proposal.proposalId !== identity.proposalId
      ) {
        return {
          error: "The server returned a mismatched proposal identity.",
          kind: "failed",
        };
      }
      if (proposal.status !== ProposalStatus.READY) {
        return {
          error: "This Action requires an approval flow that this surface does not provide.",
          kind: "unavailable",
        };
      }
      return {
        kind: "proposed",
        operationId: identity.operationId,
        proposalId: identity.proposalId,
      };
    }
    case PolicyDecision.DENY:
      return {
        error: "The server policy denied the proposal.",
        kind: "denied",
      };
    case PolicyDecision.EVALUATION_ERROR:
      return {
        error: response.evaluationError || "The server could not evaluate the proposal.",
        kind: "failed",
      };
    case PolicyDecision.UNSPECIFIED:
      return {
        error: "The server returned an unspecified proposal decision.",
        kind: "failed",
      };
    default: {
      const exhaustive: never = response.decision;
      return exhaustive;
    }
  }
}

export async function commitResponseOperationView(
  client: ZoenBrowserClient,
  response: CommitResponse,
): Promise<ActionOperationView> {
  switch (response.status) {
    case CommitStatus.COMMITTED:
      return response.receipt === undefined
        ? {
            error: "The server committed the Action without returning a receipt.",
            kind: "failed",
          }
        : committedOperationView(client, response.receipt);
    case CommitStatus.STALE:
      return {
        error: response.error || "The semantic state changed after proposal.",
        kind: "stale",
      };
    case CommitStatus.DENIED:
      return {
        error: response.error || "The server policy denied the commit.",
        kind: "denied",
      };
    case CommitStatus.EVALUATION_ERROR:
      return {
        error: response.error || "The server could not evaluate the commit.",
        kind: "failed",
      };
    case CommitStatus.CONFLICT:
      return {
        error: response.error || "The Action conflicts with a committed operation.",
        kind: "failed",
      };
    case CommitStatus.OPERATION_MISMATCH:
      return {
        error: response.error || "The operation identity does not match the proposal.",
        kind: "failed",
      };
    case CommitStatus.IDENTITY_COLLISION:
      return {
        error: response.error || "The operation identity is already in use.",
        kind: "failed",
      };
    case CommitStatus.UNSPECIFIED:
      return {
        error: response.error || "The server returned an unspecified commit status.",
        kind: "failed",
      };
    default: {
      const exhaustive: never = response.status;
      return exhaustive;
    }
  }
}

export function actionErrorView(cause: unknown): ActionOperationView {
  const error = cause instanceof Error ? cause.message : String(cause);
  if (cause instanceof ActionUnavailableError) {
    return { error, kind: "unavailable" };
  }
  if (
    cause instanceof ConnectError &&
    (cause.code === Code.PermissionDenied || cause.code === Code.Unauthenticated)
  ) {
    return { error, kind: "denied" };
  }
  return { error, kind: "failed" };
}

export async function recoverAuthorityAction(
  client: ZoenBrowserClient,
  identity: ActionIdentity,
): Promise<ActionOperationView | undefined> {
  const status = await client.actions.getOperationStatus({
    operationId: identity.operationId,
  });
  if (status.status !== CommitStatus.COMMITTED || status.receipt === undefined) {
    return undefined;
  }
  return committedOperationView(client, status.receipt);
}

export async function operationHistory(
  client: ZoenBrowserClient,
  operationId: string,
): Promise<readonly HistoryEntryView[]> {
  const response = await client.history.explain({
    target: {
      target: {
        case: "operationId",
        value: operationId,
      },
    },
  });
  const explanation = response.explanation;
  if (explanation?.subject.case !== "action") {
    return [];
  }
  const action = explanation.subject.value;
  const entries: HistoryEntryView[] = [];
  const proposalSequence =
    action.proposalStateBasis?.basis?.observedCommitSequence;
  if (proposalSequence !== undefined) {
    entries.push({
      label: "Proposal evaluated",
      sequence: proposalSequence.toString(),
    });
  }
  const receipt = action.commit?.receipt;
  if (receipt !== undefined) {
    entries.push({
      label: "Action committed locally",
      sequence: receipt.commitSequence.toString(),
    });
  }
  for (const effect of action.effects) {
    const request = effect.request?.structure;
    if (request !== undefined) {
      entries.push({
        label: `External effect ${request.state}`,
        sequence: request.commitSequence.toString(),
      });
    }
  }
  return entries;
}

function protocolDefinition(document: SurfaceDocument) {
  const reference = document.semanticContext.definition;
  return create(DefinitionReferenceSchema, {
    definitionId: reference.definitionId,
    digest: reference.digest,
    revision: BigInt(reference.revision),
  });
}

function selection(binding: QueryBinding) {
  switch (binding.ref.kind) {
    case "relation":
      return create(QuerySelectionSchema, {
        value: {
          case: "relationId",
          value: binding.ref.relationId,
        },
      });
    case "computation":
      return create(QuerySelectionSchema, {
        value: {
          case: "computationId",
          value: binding.ref.computationId,
        },
      });
    default: {
      const exhaustive: never = binding.ref;
      return exhaustive;
    }
  }
}

function requireActionBinding(
  document: SurfaceDocument,
  bindingId: string,
): ActionBinding {
  const binding = document.actionBindings.find(
    (candidate) => candidate.id === bindingId,
  );
  if (binding === undefined) {
    throw new Error(`Unknown Action binding ${bindingId}`);
  }
  return binding;
}

function actionInput(
  input: ActionInputControl,
  raw: string | boolean | undefined,
): ActionInput {
  if (raw === undefined || raw === "") {
    throw new Error(`${input.label} is required`);
  }
  switch (input.valueType.kind) {
    case "bool":
      if (typeof raw !== "boolean") {
        throw new Error(`${input.label} must be a boolean`);
      }
      return create(ActionInputSchema, {
        inputId: input.inputId,
        value: create(ExactValueSchema, {
          value: { case: "boolValue", value: raw },
        }),
      });
    case "decimal":
      return scalarInput(input, requireDecimal(input, raw), "decimalValue");
    case "integer":
      return scalarInput(input, requireInteger(input, raw), "integerValue");
    case "quantity":
      return create(ActionInputSchema, {
        inputId: input.inputId,
        value: create(ExactValueSchema, {
          value: {
            case: "quantityValue",
            value: create(QuantityValueSchema, {
              amount: requireDecimal(input, raw),
              unit: input.valueType.unit,
            }),
          },
        }),
      });
    case "text":
      if (typeof raw !== "string") {
        throw new Error(`${input.label} must be text`);
      }
      return scalarInput(input, raw, "textValue");
    default: {
      const exhaustive: never = input.valueType;
      return exhaustive;
    }
  }
}

function scalarInput(
  input: ActionInputControl,
  value: string,
  valueCase: "decimalValue" | "integerValue" | "textValue",
): ActionInput {
  return create(ActionInputSchema, {
    inputId: input.inputId,
    value: create(ExactValueSchema, {
      value: { case: valueCase, value },
    }),
  });
}

function requireInteger(
  input: ActionInputControl,
  raw: string | boolean,
): string {
  if (typeof raw !== "string" || !/^-?(?:0|[1-9][0-9]*)$/u.test(raw)) {
    throw new Error(`${input.label} must be an exact integer`);
  }
  return raw;
}

function requireDecimal(
  input: ActionInputControl,
  raw: string | boolean,
): string {
  if (
    typeof raw !== "string" ||
    !/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u.test(raw)
  ) {
    throw new Error(`${input.label} must be an exact decimal`);
  }
  return raw;
}
