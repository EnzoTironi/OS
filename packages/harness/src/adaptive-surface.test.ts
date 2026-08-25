import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import {
  adaptiveSurfaceDocumentSchema,
} from "./surface/schema.js";
import {
  type AdaptiveSurfaceModel, type AdaptiveSurfaceSession,
} from "./surface/model.js";
import {
  generateAdaptiveDecisionSurface,
  type AdaptiveSurfaceSessionPersistence,
} from "./adaptive-surface.js";
import { AgentRegistry } from "./registry.js";
import type { AgentAuthority } from "./session.js";
import {
  providerRouteSchema,
  modelCapabilityAliasSchema,
  semanticCapabilitySchema,
  semanticCapabilityScopeSchema,
  type ModelPlanner,
} from "./types.js";

const digest = "a".repeat(64);
const definition = {
  definitionId: "inventory.adaptive",
  digest,
  revision: 1,
};
const validAt = "2026-08-20T00:00:00.000Z";
const parsedActionScope = semanticCapabilityScopeSchema.parse({
  actionId: "inventory.requestStock",
  definition,
  kind: "action",
  resourceId: "inventory.item.1",
  validAt,
});
if (parsedActionScope.kind !== "action") {
  throw new Error("Action scope parsed as a Query scope");
}
const actionScope = parsedActionScope;
const parsedQueryScope = semanticCapabilityScopeSchema.parse({
  definition,
  entityId: "inventory.item.1",
  kind: "query",
  selection: { id: "inventory.available", kind: "relation" },
  validAt,
});
if (parsedQueryScope.kind !== "query") {
  throw new Error("Query scope parsed as an Action scope");
}
const queryScope = parsedQueryScope;
const parsedAction = semanticCapabilitySchema.parse({
  actionId: actionScope.actionId,
  alias: "action-request-stock",
  definition,
  description: "Request governed inventory replenishment.",
  inputs: [{ id: "quantity", kind: "integer" }],
  kind: "action",
  resourceId: actionScope.resourceId,
  validAt,
});
if (parsedAction.kind !== "action") {
  throw new Error("Action capability parsed as a Query capability");
}
const action = parsedAction;
const parsedQuery = semanticCapabilitySchema.parse({
  alias: "query-available",
  definition,
  description: "Read governed available inventory.",
  entityId: queryScope.entityId,
  kind: "query",
  selection: queryScope.selection,
  validAt,
});
if (parsedQuery.kind !== "query") {
  throw new Error("Query capability parsed as an Action capability");
}
const query = parsedQuery;

test("adaptive decision uses trusted retrieval context and persists validation", async () => {
  const registry = new AgentRegistry();
  registry.registerCapabilityScope(actionScope);
  registry.registerCapabilityScope(queryScope);
  const model = surfaceModel();
  registry.registerProvider(
    providerRouteSchema.parse({
      capability: "reasoning-fast",
      id: "provider-live",
      modelId: "model-live",
      provider: "openai-compatible",
    }),
    rejectedPlanner,
    model,
  );
  let retrievedTenant: string | undefined;
  let persistedTenant: string | undefined;
  let persistedSession: AdaptiveSurfaceSession | undefined;
  const sessionStore: AdaptiveSurfaceSessionPersistence = {
    save: (tenantId, session) => {
      persistedTenant = tenantId;
      persistedSession = session;
      return Promise.resolve();
    },
  };
  const result = await generateAdaptiveDecisionSurface({
    authority,
    brain: {
      retrieve: (tenantId: string) => {
        retrievedTenant = tenantId;
        return Promise.resolve({
          embeddingModel: {
            modelId: "embedding",
            modelRevision: "b".repeat(40),
            versionDigest: "b".repeat(64),
          },
          queryDigest: "c".repeat(64),
          results: [
            {
              fragmentDigest: "d".repeat(64),
              fragmentId: "e".repeat(64),
              indexVersion: "hybrid-rrf-v1",
              lexicalRank: 1,
              lexicalScore: 0.8,
              parserName: "message",
              parserVersionDigest: "f".repeat(64),
              sourceDigest: "1".repeat(64),
              sourceId: "source.operating-policy",
              sourceRevision: "2".repeat(64),
              text: "Request two units when governed stock is available.",
              vectorRank: 1,
              vectorScore: 0.9,
            },
          ],
          traceId: "3".repeat(64),
        });
      },
    },
    explainOperationId: "operation.baseline",
    generatedAt: "2026-08-20T21:00:00.000Z",
    knowledgeQuery: "inventory replenishment policy",
    modelCapability: modelCapabilityAliasSchema.parse("reasoning-fast"),
    question: "Should operations request replenishment?",
    registry,
    sessionId: "session.adaptive",
    sessionStore,
  });
  assert.equal(result.kind, "generated");
  assert.equal(retrievedTenant, "tenant.trusted");
  assert.equal(persistedTenant, "tenant.trusted");
  assert.equal(persistedSession?.sessionId, "session.adaptive");
  if (result.kind !== "generated") {
    assert.fail("adaptive decision did not generate");
  }
  assert.equal(
    result.session.document.actionBindings[0]?.ref.actionId,
    action.actionId,
  );
  assert.equal(
    result.session.context.evidence[0]?.sourceId,
    "source.operating-policy",
  );
});

const authority: AgentAuthority = {
  commitOrRecover: () => Promise.reject(new Error("not used")),
  discover: () =>
    Promise.resolve({
      capabilities: [action, query],
      missing: [],
      trustedContext: {
        actorId: "actor.trusted",
        delegationIds: [],
        principalId: "principal.trusted",
        tenantId: "tenant.trusted",
        workloadId: "workload.trusted",
      },
    }),
  explain: () =>
    Promise.resolve({
      actionId: action.actionId,
      commitSequence: "2",
      complete: true,
      explanationDigest: "4".repeat(64),
      operationId: "operation.baseline",
    }),
  propose: () => Promise.reject(new Error("not used")),
  query: () =>
    Promise.resolve({
      actualCommitSequence: "2",
      alias: query.alias,
      definition,
      entityId: query.entityId,
      knowledgeCut: "2",
      resultDigest: "5".repeat(64),
      selection: query.selection,
      validAt,
      values: [{ kind: "integer", value: "10" }],
    }),
};

const rejectedPlanner: ModelPlanner = {
  plan: () =>
    Promise.resolve({
      kind: "rejected",
      promptDigest: "6".repeat(64),
      reason: "invalid_tool_selection",
    }),
};

function surfaceModel(): AdaptiveSurfaceModel {
  return {
    composeSurface: (request) => {
      const parsed = z
        .object({ template: adaptiveSurfaceDocumentSchema })
        .passthrough()
        .parse(JSON.parse(request.prompt));
      const decision = parsed.template.nodes["node.decision"];
      if (decision?.kind !== "decision-summary") {
        throw new Error("adaptive prompt lacks a decision summary");
      }
      return Promise.resolve({
        document: {
          ...parsed.template,
          nodes: {
            ...parsed.template.nodes,
            [decision.id]: {
              ...decision,
              summary:
                "Request two units under the governed inventory policy.",
              uncertainty:
                "The source remains evidence and the server must recheck authority.",
            },
          },
        },
        providerCallId: "provider-call-live",
        responseModelId: "model-live",
      });
    },
  };
}
