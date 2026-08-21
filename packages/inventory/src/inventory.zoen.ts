import {
  defineAction,
  defineBundle,
  defineComputation,
  defineRelation,
  defineType,
} from "@zoen/ontology";

const StockPosition = defineType({
  attributes: [{ id: "positionId", valueType: { kind: "text" } }],
  id: "inventory.StockPosition",
});

const Location = defineType({
  attributes: [{ id: "locationCode", valueType: { kind: "text" } }],
  id: "inventory.Location",
});

const Lot = defineType({
  attributes: [{ id: "lotCode", valueType: { kind: "text" } }],
  id: "inventory.Lot",
});

const SerialUnit = defineType({
  attributes: [{ id: "serialCode", valueType: { kind: "text" } }],
  id: "inventory.SerialUnit",
});

const Reservation = defineType({
  attributes: [{ id: "reservationId", valueType: { kind: "text" } }],
  id: "inventory.Reservation",
});

const Allocation = defineType({
  attributes: [{ id: "allocationId", valueType: { kind: "text" } }],
  id: "inventory.Allocation",
});

const Movement = defineType({
  attributes: [{ id: "movementId", valueType: { kind: "text" } }],
  id: "inventory.Movement",
});

const Receipt = defineType({
  attributes: [{ id: "receiptId", valueType: { kind: "text" } }],
  id: "inventory.Receipt",
});

const Correction = defineType({
  attributes: [{ id: "correctionId", valueType: { kind: "text" } }],
  id: "inventory.Correction",
});

const productReference = defineRelation({
  cardinality: "one",
  id: "inventory.productReference",
  sourceType: "inventory.StockPosition",
  target: { kind: "value", valueType: { kind: "text" } },
});

const location = defineRelation({
  cardinality: "one",
  id: "inventory.location",
  sourceType: "inventory.StockPosition",
  target: { kind: "type", typeId: "inventory.Location" },
});

const ownershipPartyReference = defineRelation({
  cardinality: "one",
  id: "inventory.ownershipPartyReference",
  sourceType: "inventory.StockPosition",
  target: { kind: "value", valueType: { kind: "text" } },
});

const custodyPartyReference = defineRelation({
  cardinality: "one",
  id: "inventory.custodyPartyReference",
  sourceType: "inventory.StockPosition",
  target: { kind: "value", valueType: { kind: "text" } },
});

const lot = defineRelation({
  cardinality: "many",
  id: "inventory.lot",
  sourceType: "inventory.StockPosition",
  target: { kind: "type", typeId: "inventory.Lot" },
});

const serialUnit = defineRelation({
  cardinality: "many",
  id: "inventory.serialUnit",
  sourceType: "inventory.StockPosition",
  target: { kind: "type", typeId: "inventory.SerialUnit" },
});

const physicalQuantityClaim = defineRelation({
  cardinality: "many",
  id: "inventory.physicalQuantityClaim",
  sourceType: "inventory.StockPosition",
  target: {
    kind: "value",
    valueType: { kind: "quantity", unit: "each" },
  },
});

const acceptedPhysicalQuantity = defineRelation({
  cardinality: "one",
  id: "inventory.acceptedPhysicalQuantity",
  sourceType: "inventory.StockPosition",
  target: {
    kind: "value",
    valueType: { kind: "quantity", unit: "each" },
  },
});

const reservationReference = defineRelation({
  cardinality: "many",
  id: "inventory.reservationReference",
  sourceType: "inventory.StockPosition",
  target: { kind: "value", valueType: { kind: "text" } },
});

const allocationReference = defineRelation({
  cardinality: "many",
  id: "inventory.allocationReference",
  sourceType: "inventory.StockPosition",
  target: { kind: "value", valueType: { kind: "text" } },
});

const reservedQuantity = defineRelation({
  cardinality: "one",
  id: "inventory.reservedQuantity",
  sourceType: "inventory.StockPosition",
  target: {
    kind: "value",
    valueType: { kind: "quantity", unit: "each" },
  },
});

const commercialCommitmentReference = defineRelation({
  cardinality: "one",
  id: "inventory.commercialCommitmentReference",
  sourceType: "inventory.StockPosition",
  target: { kind: "value", valueType: { kind: "text" } },
});

const commercialCommittedQuantity = defineRelation({
  cardinality: "one",
  id: "inventory.commercialCommittedQuantity",
  sourceType: "inventory.StockPosition",
  target: {
    kind: "value",
    valueType: { kind: "quantity", unit: "each" },
  },
});

const movementReference = defineRelation({
  cardinality: "many",
  id: "inventory.movementReference",
  sourceType: "inventory.StockPosition",
  target: { kind: "value", valueType: { kind: "text" } },
});

const movementQuantity = defineRelation({
  cardinality: "many",
  id: "inventory.movementQuantity",
  sourceType: "inventory.StockPosition",
  target: {
    kind: "value",
    valueType: { kind: "quantity", unit: "each" },
  },
});

const movementDirection = defineRelation({
  cardinality: "many",
  id: "inventory.movementDirection",
  sourceType: "inventory.StockPosition",
  target: { kind: "value", valueType: { kind: "text" } },
});

const receiptReference = defineRelation({
  cardinality: "many",
  id: "inventory.receiptReference",
  sourceType: "inventory.StockPosition",
  target: { kind: "value", valueType: { kind: "text" } },
});

const receiptQuantity = defineRelation({
  cardinality: "many",
  id: "inventory.receiptQuantity",
  sourceType: "inventory.StockPosition",
  target: {
    kind: "value",
    valueType: { kind: "quantity", unit: "each" },
  },
});

const correctionOf = defineRelation({
  cardinality: "many",
  id: "inventory.correctionOf",
  sourceType: "inventory.StockPosition",
  target: { kind: "value", valueType: { kind: "text" } },
});

const correctedPhysicalQuantity = defineRelation({
  cardinality: "many",
  id: "inventory.correctedPhysicalQuantity",
  sourceType: "inventory.StockPosition",
  target: {
    kind: "value",
    valueType: { kind: "quantity", unit: "each" },
  },
});

const correctionReason = defineRelation({
  cardinality: "many",
  id: "inventory.correctionReason",
  sourceType: "inventory.StockPosition",
  target: { kind: "value", valueType: { kind: "text" } },
});

const safeAvailability = defineComputation({
  expression: {
    kind: "binary",
    left: {
      kind: "relation",
      relationId: "inventory.acceptedPhysicalQuantity",
    },
    operator: "subtract",
    right: {
      kind: "relation",
      relationId: "inventory.reservedQuantity",
    },
  },
  id: "inventory.safeAvailability",
  inputs: [],
  returns: { kind: "quantity", unit: "each" },
});

const procurementShortage = defineComputation({
  expression: {
    kind: "binary",
    left: {
      kind: "relation",
      relationId: "inventory.commercialCommittedQuantity",
    },
    operator: "subtract",
    right: {
      kind: "relation",
      relationId: "inventory.acceptedPhysicalQuantity",
    },
  },
  id: "inventory.procurementShortage",
  inputs: [],
  returns: { kind: "quantity", unit: "each" },
});

const reserveInventory = defineAction({
  effects: [
    {
      relationId: "inventory.allocationReference",
      value: { inputId: "allocationReference", kind: "input" },
    },
    {
      relationId: "inventory.commercialCommitmentReference",
      value: { inputId: "commitmentReference", kind: "input" },
    },
    {
      relationId: "inventory.reservationReference",
      value: { inputId: "reservationReference", kind: "input" },
    },
    {
      relationId: "inventory.reservedQuantity",
      value: { inputId: "quantity", kind: "input" },
    },
  ],
  id: "inventory.reserveInventory",
  inputs: [
    { id: "allocationReference", valueType: { kind: "text" } },
    { id: "commitmentReference", valueType: { kind: "text" } },
    { id: "quantity", valueType: { kind: "quantity", unit: "each" } },
    { id: "reservationReference", valueType: { kind: "text" } },
  ],
  precondition: {
    kind: "binary",
    left: {
      kind: "relation",
      relationId: "inventory.acceptedPhysicalQuantity",
    },
    operator: "greater_than",
    right: { inputId: "quantity", kind: "input" },
  },
});

const recordMovement = defineAction({
  effects: [
    {
      relationId: "inventory.movementDirection",
      value: { inputId: "direction", kind: "input" },
    },
    {
      relationId: "inventory.movementQuantity",
      value: { inputId: "quantity", kind: "input" },
    },
    {
      relationId: "inventory.movementReference",
      value: { inputId: "movementReference", kind: "input" },
    },
  ],
  id: "inventory.recordMovement",
  inputs: [
    { id: "direction", valueType: { kind: "text" } },
    { id: "movementReference", valueType: { kind: "text" } },
    { id: "quantity", valueType: { kind: "quantity", unit: "each" } },
  ],
  precondition: {
    kind: "binary",
    left: { inputId: "quantity", kind: "input" },
    operator: "greater_than",
    right: {
      kind: "literal",
      value: { amount: "0", kind: "quantity", unit: "each" },
    },
  },
});

const recordReceipt = defineAction({
  effects: [
    {
      relationId: "inventory.receiptQuantity",
      value: { inputId: "quantity", kind: "input" },
    },
    {
      relationId: "inventory.receiptReference",
      value: { inputId: "receiptReference", kind: "input" },
    },
  ],
  id: "inventory.recordReceipt",
  inputs: [
    { id: "quantity", valueType: { kind: "quantity", unit: "each" } },
    { id: "receiptReference", valueType: { kind: "text" } },
  ],
  precondition: {
    kind: "binary",
    left: { inputId: "quantity", kind: "input" },
    operator: "greater_than",
    right: {
      kind: "literal",
      value: { amount: "0", kind: "quantity", unit: "each" },
    },
  },
});

const correctInventory = defineAction({
  effects: [
    {
      relationId: "inventory.correctedPhysicalQuantity",
      value: { inputId: "quantity", kind: "input" },
    },
    {
      relationId: "inventory.correctionOf",
      value: { inputId: "correctionOf", kind: "input" },
    },
    {
      relationId: "inventory.correctionReason",
      value: { inputId: "reason", kind: "input" },
    },
  ],
  id: "inventory.correctInventory",
  inputs: [
    { id: "correctionOf", valueType: { kind: "text" } },
    { id: "quantity", valueType: { kind: "quantity", unit: "each" } },
    { id: "reason", valueType: { kind: "text" } },
  ],
  precondition: {
    kind: "binary",
    left: { inputId: "quantity", kind: "input" },
    operator: "greater_than",
    right: {
      kind: "literal",
      value: { amount: "0", kind: "quantity", unit: "each" },
    },
  },
});

export default defineBundle({
  actions: [correctInventory, recordMovement, recordReceipt, reserveInventory],
  computations: [procurementShortage, safeAvailability],
  id: "inventory.operations",
  relations: [
    acceptedPhysicalQuantity,
    allocationReference,
    commercialCommittedQuantity,
    commercialCommitmentReference,
    correctedPhysicalQuantity,
    correctionOf,
    correctionReason,
    custodyPartyReference,
    location,
    lot,
    movementDirection,
    movementQuantity,
    movementReference,
    ownershipPartyReference,
    physicalQuantityClaim,
    productReference,
    receiptQuantity,
    receiptReference,
    reservationReference,
    reservedQuantity,
    serialUnit,
  ],
  revision: 1,
  types: [
    Allocation,
    Correction,
    Location,
    Lot,
    Movement,
    Receipt,
    Reservation,
    SerialUnit,
    StockPosition,
  ],
});
