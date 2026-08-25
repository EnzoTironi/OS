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
  id: "lab.Product",
});

const Lot = defineType({
  attributes: [
    { id: "lotCode", valueType: { kind: "text" } },
  ],
  id: "lab.Lot",
});

const Inspection = defineType({
  attributes: [
    { id: "inspectionCode", valueType: { kind: "text" } },
  ],
  id: "lab.Inspection",
});

const Nonconformance = defineType({
  attributes: [
    { id: "nonconformanceCode", valueType: { kind: "text" } },
  ],
  id: "lab.Nonconformance",
});

const QualitySpecification = defineType({
  attributes: [
    { id: "effectiveFrom", valueType: { kind: "text" } },
    { id: "version", valueType: { kind: "integer" } },
  ],
  id: "lab.Specification",
});

const lotProduct = defineRelation({
  cardinality: "one",
  id: "lab.lotProduct",
  sourceType: "lab.Inspection",
  target: { kind: "value", valueType: { kind: "text" } },
});

const measurementBasisKpa = defineRelation({
  cardinality: "many",
  id: "lab.measurementBasisKpa",
  sourceType: "lab.Inspection",
  target: { kind: "value", valueType: { kind: "integer" } },
});

const uncertaintyBasisKpa = defineRelation({
  cardinality: "many",
  id: "lab.uncertaintyBasisKpa",
  sourceType: "lab.Inspection",
  target: { kind: "value", valueType: { kind: "integer" } },
});

const acceptedMeasurementBasisKpa = defineRelation({
  cardinality: "one",
  id: "lab.acceptedMeasurementBasisKpa",
  sourceType: "lab.Inspection",
  target: { kind: "value", valueType: { kind: "integer" } },
});

const specificationMinimumBasisKpa = defineRelation({
  cardinality: "one",
  id: "lab.specificationMinimumBasisKpa",
  sourceType: "lab.Inspection",
  target: { kind: "value", valueType: { kind: "integer" } },
});

const specificationVersion = defineRelation({
  cardinality: "one",
  id: "lab.specificationVersion",
  sourceType: "lab.Inspection",
  target: { kind: "value", valueType: { kind: "integer" } },
});

const correctionOf = defineRelation({
  cardinality: "many",
  id: "lab.correctionOf",
  sourceType: "lab.Inspection",
  target: { kind: "value", valueType: { kind: "text" } },
});

const nonconformance = defineRelation({
  cardinality: "many",
  id: "lab.nonconformance",
  sourceType: "lab.Inspection",
  target: { kind: "value", valueType: { kind: "text" } },
});

const disposition = defineRelation({
  cardinality: "many",
  id: "lab.disposition",
  sourceType: "lab.Inspection",
  target: { kind: "value", valueType: { kind: "text" } },
});

const releaseStatus = defineRelation({
  cardinality: "many",
  id: "lab.releaseStatus",
  sourceType: "lab.Inspection",
  target: { kind: "value", valueType: { kind: "text" } },
});

const acceptance = defineComputation({
  expression: {
    kind: "binary",
    left: {
      kind: "binary",
      left: {
        kind: "relation",
        relationId: "lab.measurementBasisKpa",
      },
      operator: "subtract",
      right: {
        kind: "relation",
        relationId: "lab.uncertaintyBasisKpa",
      },
    },
    operator: "greater_than",
    right: {
      kind: "relation",
      relationId: "lab.specificationMinimumBasisKpa",
    },
  },
  id: "lab.acceptance",
  inputs: [],
  returns: { kind: "bool" },
});

const releaseLot = defineAction({
  effects: [
    {
      relationId: "lab.releaseStatus",
      value: { inputId: "status", kind: "input" },
    },
  ],
  id: "lab.releaseLot",
  inputs: [{ id: "status", valueType: { kind: "text" } }],
  precondition: {
    kind: "binary",
    left: {
      kind: "relation",
      relationId: "lab.acceptedMeasurementBasisKpa",
    },
    operator: "greater_than",
    right: {
      kind: "relation",
      relationId: "lab.specificationMinimumBasisKpa",
    },
  },
});

const quarantineLot = defineAction({
  effects: [
    {
      relationId: "lab.disposition",
      value: { inputId: "disposition", kind: "input" },
    },
  ],
  id: "lab.quarantineLot",
  inputs: [
    { id: "disposition", valueType: { kind: "text" } },
  ],
  precondition: {
    kind: "binary",
    left: {
      kind: "relation",
      relationId: "lab.acceptedMeasurementBasisKpa",
    },
    operator: "greater_than",
    right: {
      kind: "literal",
      value: { kind: "integer", value: "0" },
    },
  },
});

export default defineBundle({
  actions: [releaseLot, quarantineLot],
  computations: [acceptance],
  id: "lab.assurance",
  relations: [
    acceptedMeasurementBasisKpa,
    correctionOf,
    disposition,
    lotProduct,
    measurementBasisKpa,
    nonconformance,
    releaseStatus,
    specificationMinimumBasisKpa,
    specificationVersion,
    uncertaintyBasisKpa,
  ],
  revision: 1,
  types: [Inspection, Lot, Nonconformance, Product, QualitySpecification],
});
