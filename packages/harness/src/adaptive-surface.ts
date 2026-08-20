import { createHash } from "node:crypto";
import {
  generateAdaptiveSurface,
  type ActionBinding,
  type ActionInputControl,
  type AdaptiveSurfaceContext,
  type AdaptiveSurfaceSession,
  type GenerateAdaptiveSurfaceResult,
  type QueryBinding,
  type SurfaceDefinitionRef,
  type SurfaceExactValue,
} from "@zoen/surface";
import type { AgentRegistry } from "./registry.js";
import type { AgentAuthority } from "./session.js";
import {
  type ActionCapability,
  type ModelCapabilityAlias,
  type KnowledgeContext,
  type QueryCapability,
  type SemanticValue,
} from "./types.js";

export interface AttributableKnowledgeRetriever {
  retrieve(
    trustedTenantId: string,
    query: string,
    limit?: number,
  ): Promise<KnowledgeContext>;
}

export interface AdaptiveSurfaceSessionPersistence {
  save(
    trustedTenantId: string,
    session: AdaptiveSurfaceSession,
  ): Promise<void>;
}

export interface GenerateAdaptiveDecisionInput {
  readonly authority: AgentAuthority;
  readonly brain: AttributableKnowledgeRetriever;
  readonly generatedAt: string;
  readonly knowledgeQuery: string;
  readonly modelCapability: ModelCapabilityAlias;
  readonly question: string;
  readonly registry: AgentRegistry;
  readonly sessionId: string;
  readonly sessionStore?: AdaptiveSurfaceSessionPersistence;
  readonly explainOperationId: string;
}

export type GenerateAdaptiveDecisionResult =
  | GenerateAdaptiveSurfaceResult
  | {
      readonly kind: "capability_unavailable";
      readonly reason: "action_or_query_unavailable";
    }
  | {
      readonly kind: "provider_unavailable";
    }
  | {
      readonly kind: "context_error";
      readonly reason: "knowledge_query_or_explanation_failed";
    };

export async function generateAdaptiveDecisionSurface(
  input: GenerateAdaptiveDecisionInput,
): Promise<GenerateAdaptiveDecisionResult> {
  const discovery = await input.authority.discover(
    input.registry.capabilityScopes(),
  );
  const actions = discovery.capabilities.filter(
    (capability): capability is ActionCapability => capability.kind === "action",
  );
  const queries = discovery.capabilities.filter(
    (capability): capability is QueryCapability => capability.kind === "query",
  );
  if (actions.length === 0 || queries.length === 0) {
    return {
      kind: "capability_unavailable",
      reason: "action_or_query_unavailable",
    };
  }
  const provider = input.registry.resolveProvider(input.modelCapability);
  if (provider.kind === "unavailable" || provider.surfaceModel === undefined) {
    return { kind: "provider_unavailable" };
  }

  let knowledge;
  let queryResults;
  let explanation;
  try {
    [knowledge, queryResults, explanation] = await Promise.all([
      input.brain.retrieve(
        discovery.trustedContext.tenantId,
        input.knowledgeQuery,
      ),
      Promise.all(queries.map((query) => input.authority.query(query))),
      input.authority.explain(input.explainOperationId),
    ]);
  } catch {
    return {
      kind: "context_error",
      reason: "knowledge_query_or_explanation_failed",
    };
  }

  const definition = surfaceDefinition(actions[0]?.definition);
  if (definition === undefined) {
    return {
      kind: "capability_unavailable",
      reason: "action_or_query_unavailable",
    };
  }
  const queryContexts = queryResults.map((result, index) => {
    const capability = queries[index];
    if (capability === undefined) {
      throw new Error("Semantic query result has no capability");
    }
    if (
      result.definition.definitionId !== definition.definitionId ||
      result.definition.digest !== definition.digest ||
      result.definition.revision.toString() !== definition.revision
    ) {
      throw new Error("Adaptive query crossed definition revisions");
    }
    return {
      actualCommitSequence: result.actualCommitSequence,
      binding: queryBinding(capability),
      knowledgeCut: result.knowledgeCut,
      resultDigest: result.resultDigest,
      validAt: result.validAt,
      values: result.values.map(surfaceValue),
    };
  });
  const context: AdaptiveSurfaceContext = {
    actions: actions.map(actionBinding),
    definition,
    entityId: queries[0]?.entityId ?? actions[0]?.resourceId ?? "",
    evidence: knowledge.results.map((result) => ({
      fragmentDigest: result.fragmentDigest,
      fragmentId: result.fragmentId,
      kind: "company-source",
      retrievalTraceId: knowledge.traceId,
      sourceDigest: result.sourceDigest,
      sourceId: result.sourceId,
      sourceRevision: result.sourceRevision,
    })),
    explanations: [
      {
        explanationDigest: explanation.explanationDigest,
        kind: "operation-explanation",
        operationId: explanation.operationId,
      },
    ],
    generatedAt: input.generatedAt,
    knowledgeTraceId: knowledge.traceId,
    queries: queryContexts,
    queryContextDigest: sha256(JSON.stringify(queryContexts)),
  };
  const generated = await generateAdaptiveSurface({
    configuredModelId: provider.route.modelId,
    context,
    model: provider.surfaceModel,
    providerRouteId: provider.route.id,
    question: input.question,
    sessionId: input.sessionId,
  });
  if (generated.kind === "generated" && input.sessionStore !== undefined) {
    await input.sessionStore.save(
      discovery.trustedContext.tenantId,
      generated.session,
    );
  }
  return generated;
}

function surfaceDefinition(
  definition: ActionCapability["definition"] | undefined,
): SurfaceDefinitionRef | undefined {
  if (definition === undefined) {
    return undefined;
  }
  return {
    definitionId: definition.definitionId,
    digest: definition.digest,
    revision: definition.revision.toString(),
  };
}

function queryBinding(capability: QueryCapability): QueryBinding {
  const definition = {
    definitionId: capability.definition.definitionId,
    digest: capability.definition.digest,
    revision: capability.definition.revision.toString(),
  };
  switch (capability.selection.kind) {
    case "computation":
      return {
        id: `query.computation.${capability.selection.id}`,
        ref: {
          computationId: capability.selection.id,
          definition,
          entityId: capability.entityId,
          kind: "computation",
        },
      };
    case "relation":
      return {
        id: `query.relation.${capability.selection.id}`,
        ref: {
          definition,
          entityId: capability.entityId,
          kind: "relation",
          relationId: capability.selection.id,
        },
      };
    default: {
      const exhaustive: never = capability.selection;
      return exhaustive;
    }
  }
}

function actionBinding(capability: ActionCapability): ActionBinding {
  return {
    id: `action.${capability.actionId}`,
    inputs: capability.inputs.map(actionInput),
    ref: {
      actionId: capability.actionId,
      definition: {
        definitionId: capability.definition.definitionId,
        digest: capability.definition.digest,
        revision: capability.definition.revision.toString(),
      },
      resourceId: capability.resourceId,
    },
  };
}

function actionInput(
  input: ActionCapability["inputs"][number],
): ActionInputControl {
  const label = humanLabel(input.id);
  switch (input.kind) {
    case "bool":
    case "decimal":
    case "integer":
    case "text":
      return { inputId: input.id, label, valueType: { kind: input.kind } };
    case "quantity":
      return {
        inputId: input.id,
        label,
        valueType: { kind: "quantity", unit: input.unit },
      };
    default: {
      const exhaustive: never = input;
      return exhaustive;
    }
  }
}

function surfaceValue(value: SemanticValue): SurfaceExactValue {
  switch (value.kind) {
    case "bool":
    case "decimal":
    case "integer":
    case "text":
      return value;
    case "entity":
      return { kind: "entity-ref", value: value.value };
    case "quantity":
      return value;
    default: {
      const exhaustive: never = value;
      return exhaustive;
    }
  }
}

function humanLabel(identifier: string): string {
  const tail = identifier.split(".").at(-1) ?? identifier;
  const words = tail.replaceAll(/([a-z])([A-Z])/g, "$1 $2").replaceAll("-", " ");
  return `${words.slice(0, 1).toUpperCase()}${words.slice(1)}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
