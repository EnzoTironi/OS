import {
  defineAction,
  defineBundle,
  defineComputation,
  defineRelation,
  defineType,
} from "@zoen/ontology";

const Product = defineType({
  attributes: [
    { id: "productCode", valueType: { kind: "text" } },
  ],
  id: "quality.Product",
});

const Lot = defineType({
  attributes: [
    { id: "lotCode", valueType: { kind: "text" } },
  ],
  id: "quality.Lot",
});

const Inspection = defineType({
  attributes: [
    { id: "inspectionCode", valueType: { kind: "text" } },
  ],
  id: "quality.Inspection",
});

const Nonconformance = defineType({
  attributes: [
    { id: "nonconformanceCode", valueType: { kind: "text" } },
  ],
  id: "quality.Nonconformance",
});

const QualitySpecification = defineType({
  attributes: [
    { id: "effectiveFrom", valueType: { kind: "text" } },
    { id: "version", valueType: { kind: "integer" } },
  ],
  id: "quality.Specification",
});

const lotProduct = defineRelation({
  cardinality: "one",
  id: "quality.lotProduct",
  sourceType: "quality.Inspection",
  target: { kind: "value", valueType: { kind: "text" } },
});

const measurement = defineRelation({
  cardinality: "many",
  id: "quality.measurement",
  sourceType: "quality.Inspection",
  target: {
    kind: "value",
    valueType: { kind: "quantity", unit: "MPa" },
  },
});

const uncertainty = defineRelation({
  cardinality: "many",
  id: "quality.uncertainty",
  sourceType: "quality.Inspection",
  target: {
    kind: "value",
    valueType: { kind: "quantity", unit: "MPa" },
  },
});

const acceptedMeasurement = defineRelation({
  cardinality: "one",
  id: "quality.acceptedMeasurement",
  sourceType: "quality.Inspection",
  target: {
    kind: "value",
    valueType: { kind: "quantity", unit: "MPa" },
  },
});

const specificationMinimum = defineRelation({
  cardinality: "one",
  id: "quality.specificationMinimum",
  sourceType: "quality.Inspection",
  target: {
    kind: "value",
    valueType: { kind: "quantity", unit: "MPa" },
  },
});

const specificationVersion = defineRelation({
  cardinality: "one",
  id: "quality.specificationVersion",
  sourceType: "quality.Inspection",
  target: { kind: "value", valueType: { kind: "integer" } },
});

const correctionOf = defineRelation({
  cardinality: "many",
  id: "quality.correctionOf",
  sourceType: "quality.Inspection",
  target: { kind: "value", valueType: { kind: "text" } },
});

const nonconformance = defineRelation({
  cardinality: "many",
  id: "quality.nonconformance",
  sourceType: "quality.Inspection",
  target: { kind: "value", valueType: { kind: "text" } },
});

const disposition = defineRelation({
  cardinality: "many",
  id: "quality.disposition",
  sourceType: "quality.Inspection",
  target: { kind: "value", valueType: { kind: "text" } },
});

const releaseStatus = defineRelation({
  cardinality: "many",
  id: "quality.releaseStatus",
  sourceType: "quality.Inspection",
  target: { kind: "value", valueType: { kind: "text" } },
});

const acceptance = defineComputation({
  expression: {
    kind: "binary",
    left: {
      kind: "binary",
      left: { kind: "relation", relationId: "quality.measurement" },
      operator: "subtract",
      right: { kind: "relation", relationId: "quality.uncertainty" },
    },
    operator: "greater_than",
    right: {
      kind: "relation",
      relationId: "quality.specificationMinimum",
    },
  },
  id: "quality.acceptance",
  inputs: [],
  returns: { kind: "bool" },
});

const releaseLot = defineAction({
  effects: [
    {
      relationId: "quality.releaseStatus",
      value: { inputId: "status", kind: "input" },
    },
  ],
  id: "quality.releaseLot",
  inputs: [
    { id: "accepted", valueType: { kind: "bool" } },
    { id: "status", valueType: { kind: "text" } },
  ],
  precondition: {
    kind: "binary",
    left: {
      kind: "binary",
      left: {
        kind: "relation",
        relationId: "quality.acceptedMeasurement",
      },
      operator: "add",
      right: {
        kind: "relation",
        relationId: "quality.specificationMinimum",
      },
    },
    operator: "greater_than",
    right: {
      kind: "literal",
      value: { amount: "0", kind: "quantity", unit: "MPa" },
    },
  },
});

const quarantineLot = defineAction({
  effects: [
    {
      relationId: "quality.disposition",
      value: { inputId: "disposition", kind: "input" },
    },
  ],
  id: "quality.quarantineLot",
  inputs: [
    { id: "disposition", valueType: { kind: "text" } },
  ],
  precondition: {
    kind: "binary",
    left: {
      kind: "relation",
      relationId: "quality.acceptedMeasurement",
    },
    operator: "greater_than",
    right: {
      kind: "literal",
      value: { amount: "0", kind: "quantity", unit: "MPa" },
    },
  },
});

export default defineBundle({
  actions: [releaseLot, quarantineLot],
  computations: [acceptance],
  id: "quality.assurance",
  relations: [
    acceptedMeasurement,
    correctionOf,
    disposition,
    lotProduct,
    measurement,
    nonconformance,
    releaseStatus,
    specificationMinimum,
    specificationVersion,
    uncertainty,
  ],
  revision: 1,
  types: [Inspection, Lot, Nonconformance, Product, QualitySpecification],
});
