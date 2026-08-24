import {
  defineAction,
  defineBundle,
  defineComputation,
  defineRelation,
  defineType,
} from "@zoen/ontology";

const CommercialRequest = defineType({
  attributes: [{ id: "requestId", valueType: { kind: "text" } }],
  id: "commercial.Request",
});

const Quote = defineType({
  attributes: [{ id: "quoteId", valueType: { kind: "text" } }],
  id: "commercial.Quote",
});

const Commitment = defineType({
  attributes: [{ id: "commitmentId", valueType: { kind: "text" } }],
  id: "commercial.Commitment",
});

const OrderLine = defineType({
  attributes: [{ id: "orderLineId", valueType: { kind: "text" } }],
  id: "commercial.OrderLine",
});

const SourceMessage = defineType({
  attributes: [{ id: "messageId", valueType: { kind: "text" } }],
  id: "commercial.SourceMessage",
});

const Correction = defineType({
  attributes: [{ id: "correctionId", valueType: { kind: "text" } }],
  id: "commercial.Correction",
});

const Party = defineType({
  attributes: [{ id: "partyId", valueType: { kind: "text" } }],
  id: "party.Party",
});

const Product = defineType({
  attributes: [{ id: "productId", valueType: { kind: "text" } }],
  id: "product.Product",
});

const requestReference = defineRelation({
  cardinality: "one",
  id: "commercial.requestReference",
  sourceType: "commercial.OrderLine",
  target: { kind: "type", typeId: "commercial.Request" },
});

const quoteReference = defineRelation({
  cardinality: "one",
  id: "commercial.quoteReference",
  sourceType: "commercial.OrderLine",
  target: { kind: "type", typeId: "commercial.Quote" },
});

const commitmentReference = defineRelation({
  cardinality: "many",
  id: "commercial.commitmentReference",
  sourceType: "commercial.OrderLine",
  target: { kind: "type", typeId: "commercial.Commitment" },
});

const buyerPartyReference = defineRelation({
  cardinality: "one",
  id: "commercial.buyerPartyReference",
  sourceType: "commercial.OrderLine",
  target: { kind: "type", typeId: "party.Party" },
});

const productReference = defineRelation({
  cardinality: "one",
  id: "commercial.productReference",
  sourceType: "commercial.OrderLine",
  target: { kind: "type", typeId: "product.Product" },
});

const requestedQuantity = defineRelation({
  cardinality: "one",
  id: "commercial.requestedQuantity",
  sourceType: "commercial.OrderLine",
  target: {
    kind: "value",
    valueType: { kind: "quantity", unit: "each" },
  },
});

const quotedQuantity = defineRelation({
  cardinality: "one",
  id: "commercial.quotedQuantity",
  sourceType: "commercial.OrderLine",
  target: {
    kind: "value",
    valueType: { kind: "quantity", unit: "each" },
  },
});

const quotedUnitPrice = defineRelation({
  cardinality: "one",
  id: "commercial.quotedUnitPrice",
  sourceType: "commercial.OrderLine",
  target: { kind: "value", valueType: { kind: "decimal" } },
});

const proposedQuantity = defineRelation({
  cardinality: "one",
  id: "commercial.proposedQuantity",
  sourceType: "commercial.OrderLine",
  target: {
    kind: "value",
    valueType: { kind: "quantity", unit: "each" },
  },
});

const proposedByMessage = defineRelation({
  cardinality: "many",
  id: "commercial.proposedByMessage",
  sourceType: "commercial.OrderLine",
  target: { kind: "type", typeId: "commercial.SourceMessage" },
});

const committedQuantity = defineRelation({
  cardinality: "one",
  id: "commercial.committedQuantity",
  sourceType: "commercial.OrderLine",
  target: {
    kind: "value",
    valueType: { kind: "quantity", unit: "each" },
  },
});

const committedUnitPrice = defineRelation({
  cardinality: "one",
  id: "commercial.committedUnitPrice",
  sourceType: "commercial.OrderLine",
  target: { kind: "value", valueType: { kind: "decimal" } },
});

const commercialTerms = defineRelation({
  cardinality: "many",
  id: "commercial.terms",
  sourceType: "commercial.OrderLine",
  target: { kind: "value", valueType: { kind: "text" } },
});

const commitmentRevision = defineRelation({
  cardinality: "one",
  id: "commercial.commitmentRevision",
  sourceType: "commercial.OrderLine",
  target: { kind: "value", valueType: { kind: "integer" } },
});

const fulfilledQuantity = defineRelation({
  cardinality: "one",
  id: "commercial.fulfilledQuantity",
  sourceType: "commercial.OrderLine",
  target: {
    kind: "value",
    valueType: { kind: "quantity", unit: "each" },
  },
});

const downstreamDependencyCount = defineRelation({
  cardinality: "one",
  id: "commercial.downstreamDependencyCount",
  sourceType: "commercial.OrderLine",
  target: { kind: "value", valueType: { kind: "integer" } },
});

const cancellationOf = defineRelation({
  cardinality: "many",
  id: "commercial.cancellationOf",
  sourceType: "commercial.OrderLine",
  target: { kind: "type", typeId: "commercial.Commitment" },
});

const cancelledQuantity = defineRelation({
  cardinality: "many",
  id: "commercial.cancelledQuantity",
  sourceType: "commercial.OrderLine",
  target: {
    kind: "value",
    valueType: { kind: "quantity", unit: "each" },
  },
});

const correctionOf = defineRelation({
  cardinality: "many",
  id: "commercial.correctionOf",
  sourceType: "commercial.OrderLine",
  target: { kind: "type", typeId: "commercial.Correction" },
});

const correctedQuantity = defineRelation({
  cardinality: "many",
  id: "commercial.correctedQuantity",
  sourceType: "commercial.OrderLine",
  target: {
    kind: "value",
    valueType: { kind: "quantity", unit: "each" },
  },
});

const correctionReason = defineRelation({
  cardinality: "many",
  id: "commercial.correctionReason",
  sourceType: "commercial.OrderLine",
  target: { kind: "value", valueType: { kind: "text" } },
});

const openQuantity = defineComputation({
  expression: {
    kind: "binary",
    left: {
      kind: "relation",
      relationId: "commercial.committedQuantity",
    },
    operator: "subtract",
    right: {
      kind: "relation",
      relationId: "commercial.fulfilledQuantity",
    },
  },
  id: "commercial.openQuantity",
  inputs: [],
  returns: { kind: "quantity", unit: "each" },
});

const recordQuote = defineAction({
  effects: [
    {
      relationId: "commercial.quoteReference",
      value: { inputId: "quoteReference", kind: "input" },
    },
  ],
  id: "commercial.recordQuote",
  inputs: [
    {
      id: "quoteReference",
      valueType: { kind: "entity", typeId: "commercial.Quote" },
    },
  ],
  precondition: {
    kind: "literal",
    value: { kind: "bool", value: true },
  },
});

const createCommitment = defineAction({
  effects: [
    {
      relationId: "commercial.commitmentReference",
      value: { inputId: "commitmentReference", kind: "input" },
    },
    {
      relationId: "commercial.committedQuantity",
      value: { inputId: "quantity", kind: "input" },
    },
    {
      relationId: "commercial.committedUnitPrice",
      value: { inputId: "unitPrice", kind: "input" },
    },
    {
      relationId: "commercial.commitmentRevision",
      value: { inputId: "revision", kind: "input" },
    },
    {
      relationId: "commercial.terms",
      value: { inputId: "terms", kind: "input" },
    },
  ],
  id: "commercial.createCommitment",
  inputs: [
    {
      id: "commitmentReference",
      valueType: { kind: "entity", typeId: "commercial.Commitment" },
    },
    { id: "quantity", valueType: { kind: "quantity", unit: "each" } },
    { id: "revision", valueType: { kind: "integer" } },
    { id: "terms", valueType: { kind: "text" } },
    { id: "unitPrice", valueType: { kind: "decimal" } },
  ],
  precondition: {
    kind: "binary",
    left: { inputId: "unitPrice", kind: "input" },
    operator: "greater_than",
    right: {
      kind: "literal",
      value: { kind: "decimal", value: "0" },
    },
  },
});

const changeCommitment = defineAction({
  effects: [
    {
      relationId: "commercial.committedQuantity",
      value: { inputId: "quantity", kind: "input" },
    },
    {
      relationId: "commercial.committedUnitPrice",
      value: { inputId: "unitPrice", kind: "input" },
    },
    {
      relationId: "commercial.commitmentRevision",
      value: { inputId: "revision", kind: "input" },
    },
    {
      relationId: "commercial.correctionOf",
      value: { inputId: "correctionOf", kind: "input" },
    },
  ],
  id: "commercial.changeCommitment",
  inputs: [
    {
      id: "correctionOf",
      valueType: { kind: "entity", typeId: "commercial.Correction" },
    },
    { id: "quantity", valueType: { kind: "quantity", unit: "each" } },
    { id: "revision", valueType: { kind: "integer" } },
    { id: "unitPrice", valueType: { kind: "decimal" } },
  ],
  precondition: {
    kind: "binary",
    left: {
      kind: "relation",
      relationId: "commercial.committedQuantity",
    },
    operator: "greater_than",
    right: {
      kind: "relation",
      relationId: "commercial.proposedQuantity",
    },
  },
});

const recordFulfillment = defineAction({
  effects: [
    {
      relationId: "commercial.fulfilledQuantity",
      value: { inputId: "quantity", kind: "input" },
    },
    {
      relationId: "commercial.downstreamDependencyCount",
      value: {
        kind: "literal",
        value: { kind: "integer", value: "1" },
      },
    },
  ],
  id: "commercial.recordFulfillment",
  inputs: [
    { id: "quantity", valueType: { kind: "quantity", unit: "each" } },
  ],
  precondition: {
    kind: "binary",
    left: {
      kind: "relation",
      relationId: "commercial.committedQuantity",
    },
    operator: "greater_than",
    right: { inputId: "quantity", kind: "input" },
  },
});

const cancelCommitment = defineAction({
  effects: [
    {
      relationId: "commercial.cancellationOf",
      value: { inputId: "cancellationOf", kind: "input" },
    },
    {
      relationId: "commercial.cancelledQuantity",
      value: { inputId: "quantity", kind: "input" },
    },
  ],
  id: "commercial.cancelCommitment",
  inputs: [
    {
      id: "cancellationOf",
      valueType: { kind: "entity", typeId: "commercial.Commitment" },
    },
    { id: "quantity", valueType: { kind: "quantity", unit: "each" } },
  ],
  precondition: {
    kind: "binary",
    left: {
      kind: "literal",
      value: { kind: "integer", value: "1" },
    },
    operator: "greater_than",
    right: {
      kind: "relation",
      relationId: "commercial.downstreamDependencyCount",
    },
  },
});

const correctCommitment = defineAction({
  effects: [
    {
      relationId: "commercial.correctionOf",
      value: { inputId: "correctionOf", kind: "input" },
    },
    {
      relationId: "commercial.correctedQuantity",
      value: { inputId: "quantity", kind: "input" },
    },
    {
      relationId: "commercial.correctionReason",
      value: { inputId: "reason", kind: "input" },
    },
  ],
  id: "commercial.correctCommitment",
  inputs: [
    {
      id: "correctionOf",
      valueType: { kind: "entity", typeId: "commercial.Correction" },
    },
    { id: "quantity", valueType: { kind: "quantity", unit: "each" } },
    { id: "reason", valueType: { kind: "text" } },
  ],
  precondition: {
    kind: "binary",
    left: {
      kind: "relation",
      relationId: "commercial.downstreamDependencyCount",
    },
    operator: "greater_than",
    right: {
      kind: "literal",
      value: { kind: "integer", value: "0" },
    },
  },
});

export default defineBundle({
  actions: [
    cancelCommitment,
    changeCommitment,
    correctCommitment,
    createCommitment,
    recordFulfillment,
    recordQuote,
  ],
  computations: [openQuantity],
  id: "commercial.sales",
  relations: [
    buyerPartyReference,
    cancellationOf,
    cancelledQuantity,
    commitmentReference,
    commitmentRevision,
    committedQuantity,
    committedUnitPrice,
    commercialTerms,
    correctedQuantity,
    correctionOf,
    correctionReason,
    downstreamDependencyCount,
    fulfilledQuantity,
    productReference,
    proposedByMessage,
    proposedQuantity,
    quoteReference,
    quotedQuantity,
    quotedUnitPrice,
    requestedQuantity,
    requestReference,
  ],
  revision: 2,
  types: [
    CommercialRequest,
    Commitment,
    Correction,
    OrderLine,
    Party,
    Product,
    Quote,
    SourceMessage,
  ],
});
