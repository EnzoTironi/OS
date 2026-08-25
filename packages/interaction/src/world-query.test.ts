import assert from "node:assert/strict";
import test from "node:test";
import { create } from "@bufbuild/protobuf";
import type { CompiledDefinition } from "../../ontology/src/index.js";
import type { ClaimRead, OsdkWorld } from "../../osdk/src/index.js";
import {
  ExactValueSchema,
  LineageDependencySchema,
  LineageRole,
  QuantityValueSchema,
  SemanticQueryResponseSchema,
  SemanticValueResultSchema,
  type ExactValue,
  type SemanticQueryRequest,
} from "../../sdk/src/gen/zoen/world/v1/world_pb.js";
import {
  createOsdkWorldQueryClient,
  createWorldQueryClientFromEnv,
} from "./osdk-world-query.js";
import { snapshotFromClaims } from "./world-query.js";

const dirtyQuoteId = "commercial.order-line.dirty-quote";

test("createWorldQueryClientFromEnv returns an OSDK client from World credentials alone", () => {
  const client = createWorldQueryClientFromEnv({
    ZOEN_AGENT_BEARER_TOKEN: "token",
    ZOEN_WORLD_BASE_URL: "https://world.zoen.local",
  });
  assert.ok(client);
});

test("createWorldQueryClientFromEnv skips without zoend World credentials", () => {
  assert.equal(createWorldQueryClientFromEnv({}), undefined);
  assert.equal(
    createWorldQueryClientFromEnv({
      ZOEN_WORLD_DEFINITION_DIGEST: "digest",
      ZOEN_WORLD_DEFINITION_ID: "commercial.sales",
      ZOEN_WORLD_DEFINITION_REVISION: "2",
      ZOEN_WORLD_ENTITY_ID: dirtyQuoteId,
    }),
    undefined,
  );
});

test("fake OsdkWorld semanticQuery becomes snapshot rivals/notes/href without entity-id dumps", async () => {
  const requests: SemanticQueryRequest[] = [];
  const client = createOsdkWorldQueryClient({
    compiled: commercialOrderLineCompiled(),
    entityId: dirtyQuoteId,
    world: fakeOsdkWorld(requests),
  });
  const snapshot = await client.semanticQuery({
    membershipId: "membership.wa.enzo",
    tenantId: "tenant.a",
  });
  assert.ok(snapshot);
  assert.deepEqual(
    snapshot.rivals.map((rival) => rival.label),
    ["source.sheet", "source.erp"],
  );
  assert.ok(snapshot.notes.includes("12 each"));
  assert.ok(
    snapshot.notes.some((note) =>
      note.includes("https://workshop.example/quote"),
    ),
  );
  assert.equal(snapshot.href, "https://workshop.example/quote");
  const visible = [
    ...snapshot.notes,
    ...snapshot.rivals.map((rival) => rival.label),
    snapshot.href ?? "",
  ].join("\n");
  assert.doesNotMatch(visible, /commercial\.order-line\.dirty-quote/);
  assert.doesNotMatch(visible, /entity\.hidden/);
  assert.doesNotMatch(visible, /Recebi/i);
  assert.ok(snapshot.entityIds.includes(dirtyQuoteId));
  assert.equal(
    requests.some((request) => request.query.case === "byType"),
    false,
  );
  assert.ok(requests.every((request) => request.entityId === dirtyQuoteId));
});

test("without env entity, OSDK lists objects that exist on the definition", async () => {
  const requests: SemanticQueryRequest[] = [];
  const client = createOsdkWorldQueryClient({
    compiled: commercialOrderLineCompiled(),
    world: fakeOsdkWorld(requests),
  });
  const snapshot = await client.semanticQuery({
    membershipId: "membership.wa.enzo",
    tenantId: "tenant.a",
  });
  assert.ok(snapshot);
  assert.deepEqual(
    snapshot.rivals.map((rival) => rival.label),
    ["source.sheet", "source.erp"],
  );
  assert.equal(snapshot.href, "https://workshop.example/quote");
  assert.equal(
    requests.some((request) => request.query.case === "byType"),
    true,
  );
});

test("two ClaimRead rows without RIVAL still become snapshot rivals", () => {
  const snapshot = snapshotFromClaims(supportingQuantityClaims());
  assert.ok(snapshot.rivals.length >= 2);
  assert.deepEqual(
    snapshot.rivals.map((rival) => rival.label),
    ["source.sheet", "source.erp"],
  );
  assert.ok(snapshot.notes.includes("10 each"));
  assert.ok(snapshot.notes.includes("12 each"));
  const visible = [
    ...snapshot.notes,
    ...snapshot.rivals.map((rival) => rival.label),
  ].join("\n");
  assert.doesNotMatch(visible, /commercial\.order-line\.dirty-quote/);
  assert.doesNotMatch(visible, /Recebi/i);
});

test("two SUPPORTING SemanticQuery rows stay rivals after OSDK assemble", async () => {
  const requests: SemanticQueryRequest[] = [];
  const client = createOsdkWorldQueryClient({
    compiled: commercialOrderLineCompiled(),
    entityId: dirtyQuoteId,
    world: fakeSupportingQuantityWorld(requests),
  });
  const snapshot = await client.semanticQuery({
    membershipId: "membership.wa.enzo",
    tenantId: "tenant.a",
  });
  assert.ok(snapshot);
  assert.ok(snapshot.rivals.length >= 2);
  assert.deepEqual(
    snapshot.rivals.map((rival) => rival.label),
    ["source.sheet", "source.erp"],
  );
  assert.equal(
    requests.some((request) => request.query.case === "byType"),
    false,
  );
});

test("OSDK world query fails closed when World is down", async () => {
  const client = createOsdkWorldQueryClient({
    compiled: commercialOrderLineCompiled(),
    entityId: dirtyQuoteId,
    world: {
      async semanticQuery() {
        throw new Error("world down");
      },
    },
  });
  const snapshot = await client.semanticQuery({
    membershipId: "membership.wa.enzo",
    tenantId: "tenant.a",
  });
  assert.equal(snapshot, undefined);
});

function supportingQuantityClaims(): readonly ClaimRead[] {
  return [
    {
      entityId: dirtyQuoteId,
      lineage: [
        {
          claimId: "claim.quotedQuantity.sheet",
          commitSequence: 1n,
          entityId: dirtyQuoteId,
          relationId: "commercial.quotedQuantity",
          role: LineageRole.SUPPORTING,
          sourceId: "source.sheet",
        },
      ],
      value: { amount: "10", kind: "quantity", unit: "each" },
    },
    {
      entityId: dirtyQuoteId,
      lineage: [
        {
          claimId: "claim.quotedQuantity.erp",
          commitSequence: 2n,
          entityId: dirtyQuoteId,
          relationId: "commercial.quotedQuantity",
          role: LineageRole.UNSPECIFIED,
          sourceId: "source.erp",
        },
      ],
      value: { amount: "12", kind: "quantity", unit: "each" },
    },
  ];
}

function commercialOrderLineCompiled(): CompiledDefinition {
  return {
    canonicalJson: "{\"definitionId\":\"commercial.sales\"}",
    definition: {
      actions: [],
      computations: [],
      definitionId: "commercial.sales",
      relations: [
        {
          cardinality: "one",
          id: "commercial.quotedQuantity",
          sourceType: "commercial.OrderLine",
          target: {
            kind: "value",
            valueType: { kind: "quantity", unit: "each" },
          },
        },
        {
          cardinality: "many",
          id: "commercial.terms",
          sourceType: "commercial.OrderLine",
          target: { kind: "value", valueType: { kind: "text" } },
        },
      ],
      revision: 2,
      schema: "zoen.definition.v1",
      types: [
        {
          attributes: [{ id: "orderLineId", valueType: { kind: "text" } }],
          id: "commercial.OrderLine",
        },
      ],
    },
    digest: "test-digest",
  };
}

function fakeOsdkWorld(requests: SemanticQueryRequest[]): OsdkWorld {
  return {
    async semanticQuery(request) {
      requests.push(request);
      if (request.query.case === "byType") {
        return queryResponse({
          entityId: dirtyQuoteId,
          value: create(ExactValueSchema, {
            value: { case: "entityRefValue", value: dirtyQuoteId },
          }),
        });
      }
      if (request.selection?.value.case !== "relationId") {
        return create(SemanticQueryResponseSchema, {
          actualCommitSequence: 0n,
          knowledgeCut: 0n,
          values: [],
        });
      }
      switch (request.selection.value.value) {
        case "commercial.quotedQuantity":
          return queryResponse({
            entityId: request.entityId,
            lineage: [
              {
                claimId: "claim.quotedQuantity.sheet",
                relationId: "commercial.quotedQuantity",
                role: LineageRole.RIVAL,
                sourceId: "source.sheet",
              },
              {
                claimId: "claim.quotedQuantity.erp",
                relationId: "commercial.quotedQuantity",
                role: LineageRole.RIVAL,
                sourceId: "source.erp",
              },
            ],
            value: create(ExactValueSchema, {
              value: {
                case: "quantityValue",
                value: create(QuantityValueSchema, {
                  amount: "12",
                  unit: "each",
                }),
              },
            }),
          });
        case "commercial.terms":
          return queryResponse({
            entityId: request.entityId,
            value: create(ExactValueSchema, {
              value: {
                case: "textValue",
                value: "abrir https://workshop.example/quote",
              },
            }),
          });
        default:
          return create(SemanticQueryResponseSchema, {
            actualCommitSequence: 0n,
            knowledgeCut: 0n,
            values: [],
          });
      }
    },
  };
}

function fakeSupportingQuantityWorld(
  requests: SemanticQueryRequest[],
): OsdkWorld {
  return {
    async semanticQuery(request) {
      requests.push(request);
      if (request.selection?.value.case !== "relationId") {
        return create(SemanticQueryResponseSchema, {
          actualCommitSequence: 0n,
          knowledgeCut: 0n,
          values: [],
        });
      }
      if (request.selection.value.value !== "commercial.quotedQuantity") {
        return create(SemanticQueryResponseSchema, {
          actualCommitSequence: 0n,
          knowledgeCut: 0n,
          values: [],
        });
      }
      return create(SemanticQueryResponseSchema, {
        actualCommitSequence: 0n,
        knowledgeCut: 0n,
        values: [
          quantityRow({
            amount: "10",
            entityId: request.entityId,
            role: LineageRole.SUPPORTING,
            sourceId: "source.sheet",
          }),
          quantityRow({
            amount: "12",
            entityId: request.entityId,
            role: LineageRole.UNSPECIFIED,
            sourceId: "source.erp",
          }),
        ],
      });
    },
  };
}

function quantityRow(input: {
  readonly amount: string;
  readonly entityId: string;
  readonly role: LineageRole;
  readonly sourceId: string;
}) {
  return create(SemanticValueResultSchema, {
    dependencies: [
      create(LineageDependencySchema, {
        claimId: `claim.quotedQuantity.${input.sourceId}`,
        commitSequence: 1n,
        entityId: input.entityId,
        relationId: "commercial.quotedQuantity",
        role: input.role,
        sourceId: input.sourceId,
      }),
    ],
    value: create(ExactValueSchema, {
      value: {
        case: "quantityValue",
        value: create(QuantityValueSchema, {
          amount: input.amount,
          unit: "each",
        }),
      },
    }),
  });
}

function queryResponse(input: {
  readonly entityId: string;
  readonly lineage?: readonly {
    readonly claimId: string;
    readonly relationId: string;
    readonly role: LineageRole;
    readonly sourceId?: string;
  }[];
  readonly value: ExactValue;
}) {
  const lineage =
    input.lineage ??
    [
      {
        claimId: "",
        relationId: "",
        role: LineageRole.UNSPECIFIED,
        sourceId: "",
      },
    ];
  return create(SemanticQueryResponseSchema, {
    actualCommitSequence: 0n,
    knowledgeCut: 0n,
    values: [
      create(SemanticValueResultSchema, {
        dependencies: lineage.map((entry) =>
          create(LineageDependencySchema, {
            claimId: entry.claimId,
            commitSequence: 1n,
            entityId: input.entityId,
            relationId: entry.relationId,
            role: entry.role,
            sourceId: entry.sourceId ?? "",
          }),
        ),
        value: input.value,
      }),
    ],
  });
}
