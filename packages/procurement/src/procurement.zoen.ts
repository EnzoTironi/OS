import {
  defineAction,
  defineBundle,
  defineComputation,
  defineRelation,
  defineType,
} from "@zoen/ontology";

const PurchaseLine = defineType({
  attributes: [{ id: "purchaseLineId", valueType: { kind: "text" } }],
  id: "procurement.PurchaseLine",
});

const requirementReference = defineRelation({
  cardinality: "one",
  id: "procurement.requirementReference",
  sourceType: "procurement.PurchaseLine",
  target: { kind: "value", valueType: { kind: "text" } },
});

const requirementRevision = defineRelation({
  cardinality: "one",
  id: "procurement.requirementRevision",
  sourceType: "procurement.PurchaseLine",
  target: { kind: "value", valueType: { kind: "integer" } },
});

const requiredQuantity = defineRelation({
  cardinality: "one",
  id: "procurement.requiredQuantity",
  sourceType: "procurement.PurchaseLine",
  target: {
    kind: "value",
    valueType: { kind: "quantity", unit: "each" },
  },
});

const supplierRequestReference = defineRelation({
  cardinality: "many",
  id: "procurement.supplierRequestReference",
  sourceType: "procurement.PurchaseLine",
  target: { kind: "value", valueType: { kind: "text" } },
});

const requestedQuantity = defineRelation({
  cardinality: "many",
  id: "procurement.requestedQuantity",
  sourceType: "procurement.PurchaseLine",
  target: {
    kind: "value",
    valueType: { kind: "quantity", unit: "each" },
  },
});

const supplierPartyReference = defineRelation({
  cardinality: "one",
  id: "procurement.supplierPartyReference",
  sourceType: "procurement.PurchaseLine",
  target: { kind: "value", valueType: { kind: "text" } },
});

const supplierTermsReference = defineRelation({
  cardinality: "one",
  id: "procurement.supplierTermsReference",
  sourceType: "procurement.PurchaseLine",
  target: { kind: "value", valueType: { kind: "text" } },
});

const supplierTermsRevision = defineRelation({
  cardinality: "one",
  id: "procurement.supplierTermsRevision",
  sourceType: "procurement.PurchaseLine",
  target: { kind: "value", valueType: { kind: "integer" } },
});

const productReference = defineRelation({
  cardinality: "one",
  id: "procurement.productReference",
  sourceType: "procurement.PurchaseLine",
  target: { kind: "value", valueType: { kind: "text" } },
});

const purchaseCommitmentReference = defineRelation({
  cardinality: "one",
  id: "procurement.purchaseCommitmentReference",
  sourceType: "procurement.PurchaseLine",
  target: { kind: "value", valueType: { kind: "text" } },
});

const committedQuantity = defineRelation({
  cardinality: "one",
  id: "procurement.committedQuantity",
  sourceType: "procurement.PurchaseLine",
  target: {
    kind: "value",
    valueType: { kind: "quantity", unit: "each" },
  },
});

const purchaseUnitPrice = defineRelation({
  cardinality: "one",
  id: "procurement.purchaseUnitPrice",
  sourceType: "procurement.PurchaseLine",
  target: { kind: "value", valueType: { kind: "decimal" } },
});

const expectedDate = defineRelation({
  cardinality: "many",
  id: "procurement.expectedDate",
  sourceType: "procurement.PurchaseLine",
  target: { kind: "value", valueType: { kind: "text" } },
});

const receiptReference = defineRelation({
  cardinality: "many",
  id: "procurement.receiptReference",
  sourceType: "procurement.PurchaseLine",
  target: { kind: "value", valueType: { kind: "text" } },
});

const receiptSourceReference = defineRelation({
  cardinality: "many",
  id: "procurement.receiptSourceReference",
  sourceType: "procurement.PurchaseLine",
  target: { kind: "value", valueType: { kind: "text" } },
});

const receiptQuantity = defineRelation({
  cardinality: "many",
  id: "procurement.receiptQuantity",
  sourceType: "procurement.PurchaseLine",
  target: {
    kind: "value",
    valueType: { kind: "quantity", unit: "each" },
  },
});

const receivedQuantity = defineRelation({
  cardinality: "one",
  id: "procurement.receivedQuantity",
  sourceType: "procurement.PurchaseLine",
  target: {
    kind: "value",
    valueType: { kind: "quantity", unit: "each" },
  },
});

const cancellationReference = defineRelation({
  cardinality: "many",
  id: "procurement.cancellationReference",
  sourceType: "procurement.PurchaseLine",
  target: { kind: "value", valueType: { kind: "text" } },
});

const cancelledQuantity = defineRelation({
  cardinality: "one",
  id: "procurement.cancelledQuantity",
  sourceType: "procurement.PurchaseLine",
  target: {
    kind: "value",
    valueType: { kind: "quantity", unit: "each" },
  },
});

const returnReference = defineRelation({
  cardinality: "many",
  id: "procurement.returnReference",
  sourceType: "procurement.PurchaseLine",
  target: { kind: "value", valueType: { kind: "text" } },
});

const returnedQuantity = defineRelation({
  cardinality: "one",
  id: "procurement.returnedQuantity",
  sourceType: "procurement.PurchaseLine",
  target: {
    kind: "value",
    valueType: { kind: "quantity", unit: "each" },
  },
});

const correctionOf = defineRelation({
  cardinality: "many",
  id: "procurement.correctionOf",
  sourceType: "procurement.PurchaseLine",
  target: { kind: "value", valueType: { kind: "text" } },
});

const correctedReceivedQuantity = defineRelation({
  cardinality: "many",
  id: "procurement.correctedReceivedQuantity",
  sourceType: "procurement.PurchaseLine",
  target: {
    kind: "value",
    valueType: { kind: "quantity", unit: "each" },
  },
});

const correctionReason = defineRelation({
  cardinality: "many",
  id: "procurement.correctionReason",
  sourceType: "procurement.PurchaseLine",
  target: { kind: "value", valueType: { kind: "text" } },
});

const remainingAfterReceipt = defineComputation({
  expression: {
    kind: "binary",
    left: {
      kind: "relation",
      relationId: "procurement.committedQuantity",
    },
    operator: "subtract",
    right: {
      kind: "relation",
      relationId: "procurement.receivedQuantity",
    },
  },
  id: "procurement.remainingAfterReceipt",
  inputs: [],
  returns: { kind: "quantity", unit: "each" },
});

const remainingCommitment = defineComputation({
  expression: {
    kind: "binary",
    left: {
      kind: "binary",
      left: {
        kind: "binary",
        left: {
          kind: "relation",
          relationId: "procurement.committedQuantity",
        },
        operator: "subtract",
        right: {
          kind: "relation",
          relationId: "procurement.receivedQuantity",
        },
      },
      operator: "subtract",
      right: {
        kind: "relation",
        relationId: "procurement.cancelledQuantity",
      },
    },
    operator: "add",
    right: {
      kind: "relation",
      relationId: "procurement.returnedQuantity",
    },
  },
  id: "procurement.remainingCommitment",
  inputs: [],
  returns: { kind: "quantity", unit: "each" },
});

const netReceivedQuantity = defineComputation({
  expression: {
    kind: "binary",
    left: {
      kind: "relation",
      relationId: "procurement.receivedQuantity",
    },
    operator: "subtract",
    right: {
      kind: "relation",
      relationId: "procurement.returnedQuantity",
    },
  },
  id: "procurement.netReceivedQuantity",
  inputs: [],
  returns: { kind: "quantity", unit: "each" },
});

const recordRequirement = defineAction({
  effects: [
    {
      relationId: "procurement.cancelledQuantity",
      value: {
        kind: "literal",
        value: { amount: "0", kind: "quantity", unit: "each" },
      },
    },
    {
      relationId: "procurement.receivedQuantity",
      value: {
        kind: "literal",
        value: { amount: "0", kind: "quantity", unit: "each" },
      },
    },
    {
      relationId: "procurement.requiredQuantity",
      value: { inputId: "quantity", kind: "input" },
    },
    {
      relationId: "procurement.requirementReference",
      value: { inputId: "requirementReference", kind: "input" },
    },
    {
      relationId: "procurement.returnedQuantity",
      value: {
        kind: "literal",
        value: { amount: "0", kind: "quantity", unit: "each" },
      },
    },
  ],
  id: "procurement.recordRequirement",
  inputs: [
    { id: "quantity", valueType: { kind: "quantity", unit: "each" } },
    { id: "requirementReference", valueType: { kind: "text" } },
  ],
  precondition: {
    kind: "binary",
    left: {
      kind: "relation",
      relationId: "procurement.supplierTermsRevision",
    },
    operator: "greater_than",
    right: {
      kind: "relation",
      relationId: "procurement.requirementRevision",
    },
  },
});

const requestSupplier = defineAction({
  effects: [
    {
      relationId: "procurement.requestedQuantity",
      value: { inputId: "quantity", kind: "input" },
    },
    {
      relationId: "procurement.supplierRequestReference",
      value: { inputId: "supplierRequestReference", kind: "input" },
    },
  ],
  id: "procurement.requestSupplier",
  inputs: [
    { id: "quantity", valueType: { kind: "quantity", unit: "each" } },
    { id: "supplierRequestReference", valueType: { kind: "text" } },
  ],
  precondition: {
    kind: "binary",
    left: {
      kind: "relation",
      relationId: "procurement.requiredQuantity",
    },
    operator: "greater_than",
    right: {
      kind: "literal",
      value: { amount: "0", kind: "quantity", unit: "each" },
    },
  },
});

const governPurchase = defineAction({
  effects: [
    {
      relationId: "procurement.committedQuantity",
      value: { inputId: "quantity", kind: "input" },
    },
    {
      relationId: "procurement.expectedDate",
      value: { inputId: "expectedDate", kind: "input" },
    },
    {
      relationId: "procurement.productReference",
      value: { inputId: "productReference", kind: "input" },
    },
    {
      relationId: "procurement.purchaseCommitmentReference",
      value: { inputId: "purchaseCommitmentReference", kind: "input" },
    },
    {
      relationId: "procurement.purchaseUnitPrice",
      value: { inputId: "unitPrice", kind: "input" },
    },
    {
      relationId: "procurement.requirementReference",
      value: { inputId: "requirementReference", kind: "input" },
    },
    {
      relationId: "procurement.supplierPartyReference",
      value: { inputId: "supplierPartyReference", kind: "input" },
    },
    {
      relationId: "procurement.supplierTermsReference",
      value: { inputId: "supplierTermsReference", kind: "input" },
    },
  ],
  id: "procurement.governPurchase",
  inputs: [
    { id: "expectedDate", valueType: { kind: "text" } },
    { id: "productReference", valueType: { kind: "text" } },
    { id: "purchaseCommitmentReference", valueType: { kind: "text" } },
    { id: "quantity", valueType: { kind: "quantity", unit: "each" } },
    { id: "requirementReference", valueType: { kind: "text" } },
    { id: "supplierPartyReference", valueType: { kind: "text" } },
    { id: "supplierTermsReference", valueType: { kind: "text" } },
    { id: "unitPrice", valueType: { kind: "decimal" } },
  ],
  precondition: {
    kind: "binary",
    left: {
      kind: "relation",
      relationId: "procurement.requiredQuantity",
    },
    operator: "greater_than",
    right: { inputId: "quantity", kind: "input" },
  },
});

const recordPartialReceipt = defineAction({
  effects: [
    {
      relationId: "procurement.receiptReference",
      value: { inputId: "receiptReference", kind: "input" },
    },
    {
      relationId: "procurement.receiptSourceReference",
      value: { inputId: "sourceReference", kind: "input" },
    },
    {
      relationId: "procurement.receiptQuantity",
      value: { inputId: "quantity", kind: "input" },
    },
    {
      relationId: "procurement.receivedQuantity",
      value: {
        kind: "binary",
        left: {
          kind: "relation",
          relationId: "procurement.receivedQuantity",
        },
        operator: "add",
        right: { inputId: "quantity", kind: "input" },
      },
    },
  ],
  id: "procurement.recordPartialReceipt",
  inputs: [
    { id: "quantity", valueType: { kind: "quantity", unit: "each" } },
    { id: "receiptReference", valueType: { kind: "text" } },
    { id: "sourceReference", valueType: { kind: "text" } },
  ],
  precondition: {
    kind: "binary",
    left: {
      kind: "binary",
      left: {
        kind: "binary",
        left: {
          kind: "binary",
          left: {
            kind: "relation",
            relationId: "procurement.committedQuantity",
          },
          operator: "subtract",
          right: {
            kind: "relation",
            relationId: "procurement.receivedQuantity",
          },
        },
        operator: "subtract",
        right: {
          kind: "relation",
          relationId: "procurement.cancelledQuantity",
        },
      },
      operator: "add",
      right: {
        kind: "relation",
        relationId: "procurement.returnedQuantity",
      },
    },
    operator: "greater_than",
    right: { inputId: "quantity", kind: "input" },
  },
});

const cancelRemaining = defineAction({
  effects: [
    {
      relationId: "procurement.cancellationReference",
      value: { inputId: "cancellationReference", kind: "input" },
    },
    {
      relationId: "procurement.cancelledQuantity",
      value: {
        kind: "binary",
        left: {
          kind: "relation",
          relationId: "procurement.cancelledQuantity",
        },
        operator: "add",
        right: { inputId: "quantity", kind: "input" },
      },
    },
  ],
  id: "procurement.cancelRemaining",
  inputs: [
    { id: "cancellationReference", valueType: { kind: "text" } },
    { id: "quantity", valueType: { kind: "quantity", unit: "each" } },
  ],
  precondition: {
    kind: "binary",
    left: {
      kind: "binary",
      left: {
        kind: "binary",
        left: {
          kind: "binary",
          left: {
            kind: "relation",
            relationId: "procurement.committedQuantity",
          },
          operator: "subtract",
          right: {
            kind: "relation",
            relationId: "procurement.receivedQuantity",
          },
        },
        operator: "subtract",
        right: {
          kind: "relation",
          relationId: "procurement.cancelledQuantity",
        },
      },
      operator: "add",
      right: {
        kind: "relation",
        relationId: "procurement.returnedQuantity",
      },
    },
    operator: "greater_than",
    right: { inputId: "quantity", kind: "input" },
  },
});

const recordReturn = defineAction({
  effects: [
    {
      relationId: "procurement.returnReference",
      value: { inputId: "returnReference", kind: "input" },
    },
    {
      relationId: "procurement.returnedQuantity",
      value: {
        kind: "binary",
        left: {
          kind: "relation",
          relationId: "procurement.returnedQuantity",
        },
        operator: "add",
        right: { inputId: "quantity", kind: "input" },
      },
    },
  ],
  id: "procurement.recordReturn",
  inputs: [
    { id: "quantity", valueType: { kind: "quantity", unit: "each" } },
    { id: "returnReference", valueType: { kind: "text" } },
  ],
  precondition: {
    kind: "binary",
    left: {
      kind: "binary",
      left: {
        kind: "relation",
        relationId: "procurement.receivedQuantity",
      },
      operator: "subtract",
      right: {
        kind: "relation",
        relationId: "procurement.returnedQuantity",
      },
    },
    operator: "greater_than",
    right: { inputId: "quantity", kind: "input" },
  },
});

const correctReceipt = defineAction({
  effects: [
    {
      relationId: "procurement.receivedQuantity",
      value: { inputId: "quantity", kind: "input" },
    },
    {
      relationId: "procurement.correctedReceivedQuantity",
      value: { inputId: "quantity", kind: "input" },
    },
    {
      relationId: "procurement.correctionOf",
      value: { inputId: "correctionOf", kind: "input" },
    },
    {
      relationId: "procurement.correctionReason",
      value: { inputId: "reason", kind: "input" },
    },
  ],
  id: "procurement.correctReceipt",
  inputs: [
    { id: "correctionOf", valueType: { kind: "text" } },
    { id: "quantity", valueType: { kind: "quantity", unit: "each" } },
    { id: "reason", valueType: { kind: "text" } },
  ],
  precondition: {
    kind: "binary",
    left: {
      kind: "relation",
      relationId: "procurement.receivedQuantity",
    },
    operator: "greater_than",
    right: { inputId: "quantity", kind: "input" },
  },
});

export default defineBundle({
  actions: [
    cancelRemaining,
    correctReceipt,
    governPurchase,
    recordPartialReceipt,
    recordRequirement,
    recordReturn,
    requestSupplier,
  ],
  computations: [
    netReceivedQuantity,
    remainingAfterReceipt,
    remainingCommitment,
  ],
  id: "procurement.purchasing",
  relations: [
    cancellationReference,
    cancelledQuantity,
    committedQuantity,
    correctedReceivedQuantity,
    correctionOf,
    correctionReason,
    expectedDate,
    productReference,
    purchaseCommitmentReference,
    purchaseUnitPrice,
    receiptQuantity,
    receiptReference,
    receiptSourceReference,
    receivedQuantity,
    requestedQuantity,
    requiredQuantity,
    requirementReference,
    requirementRevision,
    returnReference,
    returnedQuantity,
    supplierPartyReference,
    supplierRequestReference,
    supplierTermsReference,
    supplierTermsRevision,
  ],
  revision: 1,
  types: [PurchaseLine],
});
