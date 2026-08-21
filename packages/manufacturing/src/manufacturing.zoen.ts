import {
  defineAction,
  defineBundle,
  defineComputation,
  defineRelation,
  defineType,
} from "@zoen/ontology";

const BillOfMaterial = defineType({
  attributes: [{ id: "bomId", valueType: { kind: "text" } }],
  id: "manufacturing.BillOfMaterial",
});

const Work = defineType({
  attributes: [{ id: "workId", valueType: { kind: "text" } }],
  id: "manufacturing.Work",
});

const bomVersion = defineRelation({
  cardinality: "one",
  id: "manufacturing.bomVersion",
  sourceType: "manufacturing.BillOfMaterial",
  target: { kind: "value", valueType: { kind: "integer" } },
});

const bomEffectiveFrom = defineRelation({
  cardinality: "one",
  id: "manufacturing.bomEffectiveFrom",
  sourceType: "manufacturing.BillOfMaterial",
  target: { kind: "value", valueType: { kind: "text" } },
});

const bomEffectiveTo = defineRelation({
  cardinality: "one",
  id: "manufacturing.bomEffectiveTo",
  sourceType: "manufacturing.BillOfMaterial",
  target: { kind: "value", valueType: { kind: "text" } },
});

const bomInputProductReference = defineRelation({
  cardinality: "many",
  id: "manufacturing.bomInputProductReference",
  sourceType: "manufacturing.BillOfMaterial",
  target: { kind: "value", valueType: { kind: "text" } },
});

const bomInputQuantity = defineRelation({
  cardinality: "many",
  id: "manufacturing.bomInputQuantity",
  sourceType: "manufacturing.BillOfMaterial",
  target: { kind: "value", valueType: { kind: "quantity", unit: "each" } },
});

const bomOutputProductReference = defineRelation({
  cardinality: "many",
  id: "manufacturing.bomOutputProductReference",
  sourceType: "manufacturing.BillOfMaterial",
  target: { kind: "value", valueType: { kind: "text" } },
});

const bomOutputQuantity = defineRelation({
  cardinality: "many",
  id: "manufacturing.bomOutputQuantity",
  sourceType: "manufacturing.BillOfMaterial",
  target: { kind: "value", valueType: { kind: "quantity", unit: "each" } },
});

const bomOperationReference = defineRelation({
  cardinality: "many",
  id: "manufacturing.bomOperationReference",
  sourceType: "manufacturing.BillOfMaterial",
  target: { kind: "value", valueType: { kind: "text" } },
});

const requirementReference = defineRelation({
  cardinality: "one",
  id: "manufacturing.requirementReference",
  sourceType: "manufacturing.Work",
  target: { kind: "value", valueType: { kind: "text" } },
});

const workPlanReference = defineRelation({
  cardinality: "one",
  id: "manufacturing.workPlanReference",
  sourceType: "manufacturing.Work",
  target: { kind: "value", valueType: { kind: "text" } },
});

const bomReference = defineRelation({
  cardinality: "one",
  id: "manufacturing.bomReference",
  sourceType: "manufacturing.Work",
  target: { kind: "value", valueType: { kind: "text" } },
});

const currentBomRevision = defineRelation({
  cardinality: "one",
  id: "manufacturing.currentBomRevision",
  sourceType: "manufacturing.Work",
  target: { kind: "value", valueType: { kind: "integer" } },
});

const pinnedBomRevision = defineRelation({
  cardinality: "one",
  id: "manufacturing.pinnedBomRevision",
  sourceType: "manufacturing.Work",
  target: { kind: "value", valueType: { kind: "integer" } },
});

const requiredInputProductReference = defineRelation({
  cardinality: "one",
  id: "manufacturing.requiredInputProductReference",
  sourceType: "manufacturing.Work",
  target: { kind: "value", valueType: { kind: "text" } },
});

const requiredOutputProductReference = defineRelation({
  cardinality: "one",
  id: "manufacturing.requiredOutputProductReference",
  sourceType: "manufacturing.Work",
  target: { kind: "value", valueType: { kind: "text" } },
});

const requiredInputQuantity = defineRelation({
  cardinality: "one",
  id: "manufacturing.requiredInputQuantity",
  sourceType: "manufacturing.Work",
  target: { kind: "value", valueType: { kind: "quantity", unit: "each" } },
});

const requiredOutputQuantity = defineRelation({
  cardinality: "one",
  id: "manufacturing.requiredOutputQuantity",
  sourceType: "manufacturing.Work",
  target: { kind: "value", valueType: { kind: "quantity", unit: "each" } },
});

const plannedInputQuantity = defineRelation({
  cardinality: "one",
  id: "manufacturing.plannedInputQuantity",
  sourceType: "manufacturing.Work",
  target: { kind: "value", valueType: { kind: "quantity", unit: "each" } },
});

const plannedOutputQuantity = defineRelation({
  cardinality: "one",
  id: "manufacturing.plannedOutputQuantity",
  sourceType: "manufacturing.Work",
  target: { kind: "value", valueType: { kind: "quantity", unit: "each" } },
});

const materialAvailableQuantity = defineRelation({
  cardinality: "one",
  id: "manufacturing.materialAvailableQuantity",
  sourceType: "manufacturing.Work",
  target: { kind: "value", valueType: { kind: "quantity", unit: "each" } },
});

const resourceCapabilityReference = defineRelation({
  cardinality: "one",
  id: "manufacturing.resourceCapabilityReference",
  sourceType: "manufacturing.Work",
  target: { kind: "value", valueType: { kind: "text" } },
});

const startOccurrenceReference = defineRelation({
  cardinality: "many",
  id: "manufacturing.startOccurrenceReference",
  sourceType: "manufacturing.Work",
  target: { kind: "value", valueType: { kind: "text" } },
});

const startedAt = defineRelation({
  cardinality: "many",
  id: "manufacturing.startedAt",
  sourceType: "manufacturing.Work",
  target: { kind: "value", valueType: { kind: "text" } },
});

const completionOccurrenceReference = defineRelation({
  cardinality: "many",
  id: "manufacturing.completionOccurrenceReference",
  sourceType: "manufacturing.Work",
  target: { kind: "value", valueType: { kind: "text" } },
});

const completionKind = defineRelation({
  cardinality: "many",
  id: "manufacturing.completionKind",
  sourceType: "manufacturing.Work",
  target: { kind: "value", valueType: { kind: "text" } },
});

const completionBomRevision = defineRelation({
  cardinality: "many",
  id: "manufacturing.completionBomRevision",
  sourceType: "manufacturing.Work",
  target: { kind: "value", valueType: { kind: "integer" } },
});

const completionInputQuantity = defineRelation({
  cardinality: "many",
  id: "manufacturing.completionInputQuantity",
  sourceType: "manufacturing.Work",
  target: { kind: "value", valueType: { kind: "quantity", unit: "each" } },
});

const completionOutputQuantity = defineRelation({
  cardinality: "many",
  id: "manufacturing.completionOutputQuantity",
  sourceType: "manufacturing.Work",
  target: { kind: "value", valueType: { kind: "quantity", unit: "each" } },
});

const consumedInputQuantity = defineRelation({
  cardinality: "one",
  id: "manufacturing.consumedInputQuantity",
  sourceType: "manufacturing.Work",
  target: { kind: "value", valueType: { kind: "quantity", unit: "each" } },
});

const producedOutputQuantity = defineRelation({
  cardinality: "one",
  id: "manufacturing.producedOutputQuantity",
  sourceType: "manufacturing.Work",
  target: { kind: "value", valueType: { kind: "quantity", unit: "each" } },
});

const productionTallyOf = defineRelation({
  cardinality: "many",
  id: "manufacturing.productionTallyOf",
  sourceType: "manufacturing.Work",
  target: { kind: "value", valueType: { kind: "text" } },
});

const inputLotReference = defineRelation({
  cardinality: "many",
  id: "manufacturing.inputLotReference",
  sourceType: "manufacturing.Work",
  target: { kind: "value", valueType: { kind: "text" } },
});

const inputSerialReference = defineRelation({
  cardinality: "many",
  id: "manufacturing.inputSerialReference",
  sourceType: "manufacturing.Work",
  target: { kind: "value", valueType: { kind: "text" } },
});

const outputLotReference = defineRelation({
  cardinality: "many",
  id: "manufacturing.outputLotReference",
  sourceType: "manufacturing.Work",
  target: { kind: "value", valueType: { kind: "text" } },
});

const outputSerialReference = defineRelation({
  cardinality: "many",
  id: "manufacturing.outputSerialReference",
  sourceType: "manufacturing.Work",
  target: { kind: "value", valueType: { kind: "text" } },
});

const outputDerivedFromInputLot = defineRelation({
  cardinality: "many",
  id: "manufacturing.outputDerivedFromInputLot",
  sourceType: "manufacturing.Work",
  target: { kind: "value", valueType: { kind: "text" } },
});

const scrapOccurrenceReference = defineRelation({
  cardinality: "many",
  id: "manufacturing.scrapOccurrenceReference",
  sourceType: "manufacturing.Work",
  target: { kind: "value", valueType: { kind: "text" } },
});

const scrapOccurrenceQuantity = defineRelation({
  cardinality: "many",
  id: "manufacturing.scrapOccurrenceQuantity",
  sourceType: "manufacturing.Work",
  target: { kind: "value", valueType: { kind: "quantity", unit: "each" } },
});

const scrapQuantity = defineRelation({
  cardinality: "one",
  id: "manufacturing.scrapQuantity",
  sourceType: "manufacturing.Work",
  target: { kind: "value", valueType: { kind: "quantity", unit: "each" } },
});

const reworkOccurrenceReference = defineRelation({
  cardinality: "many",
  id: "manufacturing.reworkOccurrenceReference",
  sourceType: "manufacturing.Work",
  target: { kind: "value", valueType: { kind: "text" } },
});

const reworkOccurrenceQuantity = defineRelation({
  cardinality: "many",
  id: "manufacturing.reworkOccurrenceQuantity",
  sourceType: "manufacturing.Work",
  target: { kind: "value", valueType: { kind: "quantity", unit: "each" } },
});

const reworkOf = defineRelation({
  cardinality: "many",
  id: "manufacturing.reworkOf",
  sourceType: "manufacturing.Work",
  target: { kind: "value", valueType: { kind: "text" } },
});

const reworkQuantity = defineRelation({
  cardinality: "one",
  id: "manufacturing.reworkQuantity",
  sourceType: "manufacturing.Work",
  target: { kind: "value", valueType: { kind: "quantity", unit: "each" } },
});

const correctionOf = defineRelation({
  cardinality: "many",
  id: "manufacturing.correctionOf",
  sourceType: "manufacturing.Work",
  target: { kind: "value", valueType: { kind: "text" } },
});

const correctionReason = defineRelation({
  cardinality: "many",
  id: "manufacturing.correctionReason",
  sourceType: "manufacturing.Work",
  target: { kind: "value", valueType: { kind: "text" } },
});

const consumedQuantityAdjustment = defineRelation({
  cardinality: "many",
  id: "manufacturing.consumedQuantityAdjustment",
  sourceType: "manufacturing.Work",
  target: { kind: "value", valueType: { kind: "quantity", unit: "each" } },
});

const producedQuantityAdjustment = defineRelation({
  cardinality: "many",
  id: "manufacturing.producedQuantityAdjustment",
  sourceType: "manufacturing.Work",
  target: { kind: "value", valueType: { kind: "quantity", unit: "each" } },
});

const remainingPlannedOutput = defineComputation({
  expression: {
    kind: "binary",
    left: {
      kind: "relation",
      relationId: "manufacturing.plannedOutputQuantity",
    },
    operator: "subtract",
    right: {
      kind: "relation",
      relationId: "manufacturing.producedOutputQuantity",
    },
  },
  id: "manufacturing.remainingPlannedOutput",
  inputs: [],
  returns: { kind: "quantity", unit: "each" },
});

const netProducedOutput = defineComputation({
  expression: {
    kind: "binary",
    left: {
      kind: "binary",
      left: {
        kind: "relation",
        relationId: "manufacturing.producedOutputQuantity",
      },
      operator: "subtract",
      right: {
        kind: "relation",
        relationId: "manufacturing.scrapQuantity",
      },
    },
    operator: "subtract",
    right: {
      kind: "relation",
      relationId: "manufacturing.reworkQuantity",
    },
  },
  id: "manufacturing.netProducedOutput",
  inputs: [],
  returns: { kind: "quantity", unit: "each" },
});

const recordBillOfMaterial = defineAction({
  effects: [
    { relationId: "manufacturing.bomEffectiveFrom", value: { inputId: "effectiveFrom", kind: "input" } },
    { relationId: "manufacturing.bomEffectiveTo", value: { inputId: "effectiveTo", kind: "input" } },
    { relationId: "manufacturing.bomInputProductReference", value: { inputId: "inputProductReference", kind: "input" } },
    { relationId: "manufacturing.bomInputQuantity", value: { inputId: "inputQuantity", kind: "input" } },
    { relationId: "manufacturing.bomOperationReference", value: { inputId: "operationReference", kind: "input" } },
    { relationId: "manufacturing.bomOutputProductReference", value: { inputId: "outputProductReference", kind: "input" } },
    { relationId: "manufacturing.bomOutputQuantity", value: { inputId: "outputQuantity", kind: "input" } },
    { relationId: "manufacturing.bomVersion", value: { inputId: "version", kind: "input" } },
  ],
  id: "manufacturing.recordBillOfMaterial",
  inputs: [
    { id: "effectiveFrom", valueType: { kind: "text" } },
    { id: "effectiveTo", valueType: { kind: "text" } },
    { id: "inputProductReference", valueType: { kind: "text" } },
    { id: "inputQuantity", valueType: { kind: "quantity", unit: "each" } },
    { id: "operationReference", valueType: { kind: "text" } },
    { id: "outputProductReference", valueType: { kind: "text" } },
    { id: "outputQuantity", valueType: { kind: "quantity", unit: "each" } },
    { id: "version", valueType: { kind: "integer" } },
  ],
  precondition: {
    kind: "binary",
    left: { inputId: "version", kind: "input" },
    operator: "greater_than",
    right: {
      kind: "literal",
      value: { kind: "integer", value: "0" },
    },
  },
});

const recordMaterialAvailability = defineAction({
  effects: [
    { relationId: "manufacturing.materialAvailableQuantity", value: { inputId: "quantity", kind: "input" } },
  ],
  id: "manufacturing.recordMaterialAvailability",
  inputs: [
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

const recordRequirement = defineAction({
  effects: [
    { relationId: "manufacturing.bomReference", value: { inputId: "bomReference", kind: "input" } },
    {
      relationId: "manufacturing.consumedInputQuantity",
      value: {
        kind: "literal",
        value: { amount: "0", kind: "quantity", unit: "each" },
      },
    },
    { relationId: "manufacturing.currentBomRevision", value: { inputId: "bomRevision", kind: "input" } },
    {
      relationId: "manufacturing.producedOutputQuantity",
      value: {
        kind: "literal",
        value: { amount: "0", kind: "quantity", unit: "each" },
      },
    },
    { relationId: "manufacturing.requirementReference", value: { inputId: "requirementReference", kind: "input" } },
    { relationId: "manufacturing.requiredInputProductReference", value: { inputId: "inputProductReference", kind: "input" } },
    { relationId: "manufacturing.requiredInputQuantity", value: { inputId: "inputQuantity", kind: "input" } },
    { relationId: "manufacturing.requiredOutputProductReference", value: { inputId: "outputProductReference", kind: "input" } },
    { relationId: "manufacturing.requiredOutputQuantity", value: { inputId: "outputQuantity", kind: "input" } },
    {
      relationId: "manufacturing.reworkQuantity",
      value: {
        kind: "literal",
        value: { amount: "0", kind: "quantity", unit: "each" },
      },
    },
    {
      relationId: "manufacturing.scrapQuantity",
      value: {
        kind: "literal",
        value: { amount: "0", kind: "quantity", unit: "each" },
      },
    },
  ],
  id: "manufacturing.recordRequirement",
  inputs: [
    { id: "bomReference", valueType: { kind: "text" } },
    { id: "bomRevision", valueType: { kind: "integer" } },
    { id: "inputProductReference", valueType: { kind: "text" } },
    { id: "inputQuantity", valueType: { kind: "quantity", unit: "each" } },
    { id: "outputProductReference", valueType: { kind: "text" } },
    { id: "outputQuantity", valueType: { kind: "quantity", unit: "each" } },
    { id: "requirementReference", valueType: { kind: "text" } },
  ],
  precondition: {
    kind: "binary",
    left: { inputId: "bomRevision", kind: "input" },
    operator: "greater_than",
    right: {
      kind: "literal",
      value: { kind: "integer", value: "0" },
    },
  },
});

const planWork = defineAction({
  effects: [
    { relationId: "manufacturing.plannedInputQuantity", value: { inputId: "inputQuantity", kind: "input" } },
    { relationId: "manufacturing.plannedOutputQuantity", value: { inputId: "outputQuantity", kind: "input" } },
    { relationId: "manufacturing.workPlanReference", value: { inputId: "planReference", kind: "input" } },
  ],
  id: "manufacturing.planWork",
  inputs: [
    { id: "inputQuantity", valueType: { kind: "quantity", unit: "each" } },
    { id: "outputQuantity", valueType: { kind: "quantity", unit: "each" } },
    { id: "planReference", valueType: { kind: "text" } },
  ],
  precondition: {
    kind: "binary",
    left: {
      kind: "relation",
      relationId: "manufacturing.requiredOutputQuantity",
    },
    operator: "greater_than",
    right: { inputId: "outputQuantity", kind: "input" },
  },
});

const startWork = defineAction({
  effects: [
    { relationId: "manufacturing.pinnedBomRevision", value: { inputId: "bomRevision", kind: "input" } },
    { relationId: "manufacturing.resourceCapabilityReference", value: { inputId: "capabilityReference", kind: "input" } },
    { relationId: "manufacturing.startOccurrenceReference", value: { inputId: "occurrenceReference", kind: "input" } },
    { relationId: "manufacturing.startedAt", value: { inputId: "startedAt", kind: "input" } },
  ],
  id: "manufacturing.startWork",
  inputs: [
    { id: "bomRevision", valueType: { kind: "integer" } },
    { id: "capabilityReference", valueType: { kind: "text" } },
    { id: "inputQuantity", valueType: { kind: "quantity", unit: "each" } },
    { id: "occurrenceReference", valueType: { kind: "text" } },
    { id: "startedAt", valueType: { kind: "text" } },
  ],
  precondition: {
    kind: "binary",
    left: {
      kind: "binary",
      left: {
        kind: "relation",
        relationId: "manufacturing.materialAvailableQuantity",
      },
      operator: "subtract",
      right: {
        kind: "relation",
        relationId: "manufacturing.consumedInputQuantity",
      },
    },
    operator: "greater_than",
    right: { inputId: "inputQuantity", kind: "input" },
  },
});

const recordPartialCompletion = defineAction({
  effects: [
    { relationId: "manufacturing.completionBomRevision", value: { inputId: "bomRevision", kind: "input" } },
    { relationId: "manufacturing.completionInputQuantity", value: { inputId: "consumedQuantity", kind: "input" } },
    {
      relationId: "manufacturing.completionKind",
      value: {
        kind: "literal",
        value: { kind: "text", value: "partial" },
      },
    },
    { relationId: "manufacturing.completionOccurrenceReference", value: { inputId: "occurrenceReference", kind: "input" } },
    { relationId: "manufacturing.completionOutputQuantity", value: { inputId: "producedQuantity", kind: "input" } },
    {
      relationId: "manufacturing.consumedInputQuantity",
      value: {
        kind: "binary",
        left: {
          kind: "relation",
          relationId: "manufacturing.consumedInputQuantity",
        },
        operator: "add",
        right: { inputId: "consumedQuantity", kind: "input" },
      },
    },
    { relationId: "manufacturing.inputLotReference", value: { inputId: "inputLotReference", kind: "input" } },
    { relationId: "manufacturing.inputSerialReference", value: { inputId: "inputSerialReference", kind: "input" } },
    { relationId: "manufacturing.outputDerivedFromInputLot", value: { inputId: "inputLotReference", kind: "input" } },
    { relationId: "manufacturing.outputLotReference", value: { inputId: "outputLotReference", kind: "input" } },
    { relationId: "manufacturing.outputSerialReference", value: { inputId: "outputSerialReference", kind: "input" } },
  ],
  id: "manufacturing.recordPartialCompletion",
  inputs: [
    { id: "bomRevision", valueType: { kind: "integer" } },
    {
      id: "consumedQuantity",
      valueType: { kind: "quantity", unit: "each" },
    },
    { id: "inputLotReference", valueType: { kind: "text" } },
    { id: "inputSerialReference", valueType: { kind: "text" } },
    { id: "occurrenceReference", valueType: { kind: "text" } },
    { id: "outputLotReference", valueType: { kind: "text" } },
    { id: "outputSerialReference", valueType: { kind: "text" } },
    {
      id: "producedQuantity",
      valueType: { kind: "quantity", unit: "each" },
    },
  ],
  precondition: {
    kind: "binary",
    left: {
      kind: "binary",
      left: {
        kind: "relation",
        relationId: "manufacturing.materialAvailableQuantity",
      },
      operator: "subtract",
      right: {
        kind: "relation",
        relationId: "manufacturing.consumedInputQuantity",
      },
    },
    operator: "greater_than",
    right: { inputId: "consumedQuantity", kind: "input" },
  },
});

const recordCompletion = defineAction({
  effects: [
    { relationId: "manufacturing.completionBomRevision", value: { inputId: "bomRevision", kind: "input" } },
    { relationId: "manufacturing.completionInputQuantity", value: { inputId: "consumedQuantity", kind: "input" } },
    {
      relationId: "manufacturing.completionKind",
      value: {
        kind: "literal",
        value: { kind: "text", value: "completion" },
      },
    },
    { relationId: "manufacturing.completionOccurrenceReference", value: { inputId: "occurrenceReference", kind: "input" } },
    { relationId: "manufacturing.completionOutputQuantity", value: { inputId: "producedQuantity", kind: "input" } },
    {
      relationId: "manufacturing.consumedInputQuantity",
      value: {
        kind: "binary",
        left: {
          kind: "relation",
          relationId: "manufacturing.consumedInputQuantity",
        },
        operator: "add",
        right: { inputId: "consumedQuantity", kind: "input" },
      },
    },
    { relationId: "manufacturing.inputLotReference", value: { inputId: "inputLotReference", kind: "input" } },
    { relationId: "manufacturing.inputSerialReference", value: { inputId: "inputSerialReference", kind: "input" } },
    { relationId: "manufacturing.outputDerivedFromInputLot", value: { inputId: "inputLotReference", kind: "input" } },
    { relationId: "manufacturing.outputLotReference", value: { inputId: "outputLotReference", kind: "input" } },
    { relationId: "manufacturing.outputSerialReference", value: { inputId: "outputSerialReference", kind: "input" } },
  ],
  id: "manufacturing.recordCompletion",
  inputs: [
    { id: "bomRevision", valueType: { kind: "integer" } },
    {
      id: "consumedQuantity",
      valueType: { kind: "quantity", unit: "each" },
    },
    { id: "inputLotReference", valueType: { kind: "text" } },
    { id: "inputSerialReference", valueType: { kind: "text" } },
    { id: "occurrenceReference", valueType: { kind: "text" } },
    { id: "outputLotReference", valueType: { kind: "text" } },
    { id: "outputSerialReference", valueType: { kind: "text" } },
    {
      id: "producedQuantity",
      valueType: { kind: "quantity", unit: "each" },
    },
  ],
  precondition: {
    kind: "binary",
    left: {
      kind: "binary",
      left: {
        kind: "relation",
        relationId: "manufacturing.materialAvailableQuantity",
      },
      operator: "subtract",
      right: {
        kind: "relation",
        relationId: "manufacturing.consumedInputQuantity",
      },
    },
    operator: "greater_than",
    right: { inputId: "consumedQuantity", kind: "input" },
  },
});

const recordProductionTally = defineAction({
  effects: [
    {
      relationId: "manufacturing.producedOutputQuantity",
      value: {
        kind: "binary",
        left: {
          kind: "relation",
          relationId: "manufacturing.producedOutputQuantity",
        },
        operator: "add",
        right: { inputId: "quantity", kind: "input" },
      },
    },
    { relationId: "manufacturing.productionTallyOf", value: { inputId: "completionOperationReference", kind: "input" } },
  ],
  id: "manufacturing.recordProductionTally",
  inputs: [
    { id: "completionOperationReference", valueType: { kind: "text" } },
    { id: "quantity", valueType: { kind: "quantity", unit: "each" } },
  ],
  precondition: {
    kind: "binary",
    left: {
      kind: "binary",
      left: {
        kind: "relation",
        relationId: "manufacturing.producedOutputQuantity",
      },
      operator: "add",
      right: { inputId: "quantity", kind: "input" },
    },
    operator: "greater_than",
    right: {
      kind: "relation",
      relationId: "manufacturing.producedOutputQuantity",
    },
  },
});

const recordScrap = defineAction({
  effects: [
    { relationId: "manufacturing.scrapOccurrenceQuantity", value: { inputId: "quantity", kind: "input" } },
    { relationId: "manufacturing.scrapOccurrenceReference", value: { inputId: "occurrenceReference", kind: "input" } },
    {
      relationId: "manufacturing.scrapQuantity",
      value: {
        kind: "binary",
        left: {
          kind: "relation",
          relationId: "manufacturing.scrapQuantity",
        },
        operator: "add",
        right: { inputId: "quantity", kind: "input" },
      },
    },
  ],
  id: "manufacturing.recordScrap",
  inputs: [
    { id: "occurrenceReference", valueType: { kind: "text" } },
    { id: "quantity", valueType: { kind: "quantity", unit: "each" } },
  ],
  precondition: {
    kind: "binary",
    left: {
      kind: "binary",
      left: {
        kind: "binary",
        left: {
          kind: "relation",
          relationId: "manufacturing.producedOutputQuantity",
        },
        operator: "subtract",
        right: {
          kind: "relation",
          relationId: "manufacturing.scrapQuantity",
        },
      },
      operator: "subtract",
      right: {
        kind: "relation",
        relationId: "manufacturing.reworkQuantity",
      },
    },
    operator: "greater_than",
    right: { inputId: "quantity", kind: "input" },
  },
});

const recordRework = defineAction({
  effects: [
    {
      relationId: "manufacturing.reworkOccurrenceQuantity",
      value: { inputId: "quantity", kind: "input" },
    },
    {
      relationId: "manufacturing.reworkOccurrenceReference",
      value: { inputId: "occurrenceReference", kind: "input" },
    },
    {
      relationId: "manufacturing.reworkOf",
      value: { inputId: "reworkOf", kind: "input" },
    },
    {
      relationId: "manufacturing.reworkQuantity",
      value: {
        kind: "binary",
        left: {
          kind: "relation",
          relationId: "manufacturing.reworkQuantity",
        },
        operator: "add",
        right: { inputId: "quantity", kind: "input" },
      },
    },
  ],
  id: "manufacturing.recordRework",
  inputs: [
    { id: "occurrenceReference", valueType: { kind: "text" } },
    { id: "quantity", valueType: { kind: "quantity", unit: "each" } },
    { id: "reworkOf", valueType: { kind: "text" } },
  ],
  precondition: {
    kind: "binary",
    left: {
      kind: "binary",
      left: {
        kind: "binary",
        left: {
          kind: "relation",
          relationId: "manufacturing.producedOutputQuantity",
        },
        operator: "subtract",
        right: {
          kind: "relation",
          relationId: "manufacturing.scrapQuantity",
        },
      },
      operator: "subtract",
      right: {
        kind: "relation",
        relationId: "manufacturing.reworkQuantity",
      },
    },
    operator: "greater_than",
    right: { inputId: "quantity", kind: "input" },
  },
});

const correctCompletion = defineAction({
  effects: [
    {
      relationId: "manufacturing.consumedInputQuantity",
      value: {
        kind: "binary",
        left: {
          kind: "relation",
          relationId: "manufacturing.consumedInputQuantity",
        },
        operator: "add",
        right: { inputId: "consumedQuantityAdjustment", kind: "input" },
      },
    },
    {
      relationId: "manufacturing.consumedQuantityAdjustment",
      value: { inputId: "consumedQuantityAdjustment", kind: "input" },
    },
    {
      relationId: "manufacturing.correctionOf",
      value: { inputId: "correctionOf", kind: "input" },
    },
    {
      relationId: "manufacturing.correctionReason",
      value: { inputId: "reason", kind: "input" },
    },
    {
      relationId: "manufacturing.producedOutputQuantity",
      value: {
        kind: "binary",
        left: {
          kind: "relation",
          relationId: "manufacturing.producedOutputQuantity",
        },
        operator: "add",
        right: { inputId: "producedQuantityAdjustment", kind: "input" },
      },
    },
    {
      relationId: "manufacturing.producedQuantityAdjustment",
      value: { inputId: "producedQuantityAdjustment", kind: "input" },
    },
  ],
  id: "manufacturing.correctCompletion",
  inputs: [
    { id: "correctionOf", valueType: { kind: "text" } },
    {
      id: "consumedQuantityAdjustment",
      valueType: { kind: "quantity", unit: "each" },
    },
    {
      id: "producedQuantityAdjustment",
      valueType: { kind: "quantity", unit: "each" },
    },
    { id: "reason", valueType: { kind: "text" } },
  ],
  precondition: {
    kind: "binary",
    left: {
      kind: "binary",
      left: {
        kind: "binary",
        left: {
          kind: "relation",
          relationId: "manufacturing.consumedInputQuantity",
        },
        operator: "add",
        right: { inputId: "consumedQuantityAdjustment", kind: "input" },
      },
      operator: "add",
      right: {
        kind: "binary",
        left: {
          kind: "relation",
          relationId: "manufacturing.producedOutputQuantity",
        },
        operator: "add",
        right: { inputId: "producedQuantityAdjustment", kind: "input" },
      },
    },
    operator: "greater_than",
    right: {
      kind: "literal",
      value: { amount: "0", kind: "quantity", unit: "each" },
    },
  },
});

export default defineBundle({
  actions: [
    correctCompletion,
    planWork,
    recordBillOfMaterial,
    recordCompletion,
    recordMaterialAvailability,
    recordPartialCompletion,
    recordProductionTally,
    recordRequirement,
    recordRework,
    recordScrap,
    startWork,
  ],
  computations: [netProducedOutput, remainingPlannedOutput],
  id: "manufacturing.production",
  relations: [
    bomEffectiveFrom,
    bomEffectiveTo,
    bomInputProductReference,
    bomInputQuantity,
    bomOperationReference,
    bomOutputProductReference,
    bomOutputQuantity,
    bomReference,
    bomVersion,
    completionBomRevision,
    completionInputQuantity,
    completionKind,
    completionOccurrenceReference,
    completionOutputQuantity,
    consumedInputQuantity,
    consumedQuantityAdjustment,
    correctionOf,
    correctionReason,
    currentBomRevision,
    inputLotReference,
    inputSerialReference,
    materialAvailableQuantity,
    outputDerivedFromInputLot,
    outputLotReference,
    outputSerialReference,
    pinnedBomRevision,
    plannedInputQuantity,
    plannedOutputQuantity,
    producedOutputQuantity,
    producedQuantityAdjustment,
    productionTallyOf,
    requirementReference,
    requiredInputProductReference,
    requiredInputQuantity,
    requiredOutputProductReference,
    requiredOutputQuantity,
    resourceCapabilityReference,
    reworkOccurrenceQuantity,
    reworkOccurrenceReference,
    reworkOf,
    reworkQuantity,
    scrapOccurrenceQuantity,
    scrapOccurrenceReference,
    scrapQuantity,
    startedAt,
    startOccurrenceReference,
    workPlanReference,
  ],
  revision: 1,
  types: [BillOfMaterial, Work],
});
