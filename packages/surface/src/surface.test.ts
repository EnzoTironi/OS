import assert from "node:assert/strict";
import test from "node:test";
import { create } from "@bufbuild/protobuf";
import {
  EffectKnowledgeState,
  EffectRequestSchema,
  EffectSnapshotSchema,
  parseDefinitionMetadata,
} from "@zoen/sdk";
import {
  compileDeterministicSurface,
  effectStatusView,
  parseSurfaceDocument,
  semanticQueryCacheKey,
  toJsonRenderSpec,
} from "./index.js";

const canonicalDefinition = JSON.stringify({
  actions: [
    {
      effects: [
        {
          relationId: "inventory.requested",
          value: { inputId: "quantity", kind: "input" },
        },
      ],
      id: "inventory.requestStock",
      inputs: [{ id: "quantity", valueType: { kind: "integer" } }],
      precondition: { kind: "literal", value: true },
    },
  ],
  computations: [],
  definitionId: "inventory.governed",
  relations: [
    {
      cardinality: "one",
      id: "inventory.available",
      sourceType: "inventory.Item",
      target: { kind: "value", valueType: { kind: "integer" } },
    },
    {
      cardinality: "many",
      id: "inventory.requested",
      sourceType: "inventory.Item",
      target: { kind: "value", valueType: { kind: "integer" } },
    },
  ],
  revision: 1,
  schema: "zoen.definition.v1",
  types: [{ attributes: [], id: "inventory.Item" }],
});
const metadata = parseDefinitionMetadata(
  new TextEncoder().encode(canonicalDefinition),
);
const definition = {
  definitionId: metadata.definitionId,
  digest: "a".repeat(64),
  revision: metadata.revision.toString(),
};
const compileInput = {
  definition,
  entityId: "inventory.item.1",
  metadata,
};

test("deterministic compiler emits the complete Surface IR contract", () => {
  const first = compileDeterministicSurface(compileInput);
  const second = compileDeterministicSurface(compileInput);
  assert.deepEqual(first, second);
  assert.deepEqual(parseSurfaceDocument(first, metadata), first);
  assert.equal(first.attribution.generatedWithoutLlm, true);
  assert.equal(first.actionBindings[0]?.inputs[0]?.valueType.kind, "integer");
  assert.deepEqual(
    new Set(Object.values(first.nodes).map((node) => node.kind)),
    new Set([
      "action-form",
      "data-table",
      "effect-status",
      "evidence-panel",
      "explanation-panel",
      "history-timeline",
      "object-detail",
      "relation-list",
      "relation-value",
      "section",
    ]),
  );
});

test("json-render adapter consumes the same Surface document", () => {
  const document = compileDeterministicSurface(compileInput);
  const spec = toJsonRenderSpec(document);
  assert.equal(spec.root, document.root);
  assert.deepEqual(
    Object.keys(spec.elements).sort(),
    Object.keys(document.nodes).sort(),
  );
  assert.equal(spec.elements["node.action.inventory.requestStock"]?.type, "ActionForm");
});

test("Surface validation rejects unknown catalogs, refs, and callbacks", () => {
  const document = compileDeterministicSurface(compileInput);
  assert.throws(() =>
    parseSurfaceDocument({ ...document, catalog: "unknown.catalog" }, metadata),
  );
  assert.throws(() =>
    parseSurfaceDocument(
      {
        ...document,
        queryBindings: document.queryBindings.map((binding, index) =>
          index === 0 && binding.ref.kind === "relation"
            ? {
                ...binding,
                ref: { ...binding.ref, relationId: "inventory.missing" },
              }
            : binding,
        ),
      },
      metadata,
    ),
  );
  assert.throws(() =>
    parseSurfaceDocument(
      {
        ...document,
        actionBindings: document.actionBindings.map((binding, index) =>
          index === 0
            ? {
                ...binding,
                callback: "window.fetch",
              }
            : binding,
        ),
      },
      metadata,
    ),
  );
  assert.throws(() =>
    parseSurfaceDocument(
      {
        ...document,
        actionBindings: document.actionBindings.map((binding, index) =>
          index === 0
            ? {
                ...binding,
                ref: {
                  ...binding.ref,
                  actionId: "https://example.test/mutate",
                },
              }
            : binding,
        ),
      },
      metadata,
    ),
  );
});

test("semantic query cache keys include tenant and CommitSequence", () => {
  const document = compileDeterministicSurface(compileInput);
  const query = document.queryBindings[0]?.ref;
  assert.ok(query);
  const baseline = semanticQueryCacheKey({
    commitSequence: "4",
    query,
    tenantId: "tenant.a",
  });
  assert.notDeepEqual(
    baseline,
    semanticQueryCacheKey({
      commitSequence: "4",
      query,
      tenantId: "tenant.b",
    }),
  );
  assert.notDeepEqual(
    baseline,
    semanticQueryCacheKey({
      commitSequence: "5",
      query,
      tenantId: "tenant.a",
    }),
  );
});

test("presentation changes cannot change the definition digest", () => {
  const first = compileDeterministicSurface(compileInput);
  const second = compileDeterministicSurface({
    ...compileInput,
    presentation: {
      actionsVisible: false,
      density: "compact",
      title: "Inventory",
    },
  });
  assert.notDeepEqual(first.presentation, second.presentation);
  assert.equal(
    first.attribution.definitionDigest,
    second.attribution.definitionDigest,
  );
});

test("unknown effects never become completed presentation state", () => {
  const snapshot = create(EffectSnapshotSchema, {
    request: create(EffectRequestSchema, {
      effectRequestId: "effect.action.operation.1",
      state: EffectKnowledgeState.UNKNOWN,
    }),
  });
  assert.deepEqual(effectStatusView(snapshot), {
    effectRequestId: "effect.action.operation.1",
    kind: "unknown",
  });
});
