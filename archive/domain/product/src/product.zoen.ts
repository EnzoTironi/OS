import {
  defineAction,
  defineBundle,
  defineComputation,
  defineRelation,
  defineType,
} from "@zoen/ontology";

const Product = defineType({
  attributes: [{ id: "productId", valueType: { kind: "text" } }],
  id: "product.Product",
});

const Item = defineType({
  attributes: [
    { id: "itemId", valueType: { kind: "text" } },
    { id: "name", valueType: { kind: "text" } },
  ],
  id: "product.Item",
});

const ReferenceIdentifier = defineType({
  attributes: [{ id: "referenceId", valueType: { kind: "text" } }],
  id: "product.ReferenceIdentifier",
});

const UnitDefinition = defineType({
  attributes: [{ id: "unitId", valueType: { kind: "text" } }],
  id: "product.UnitDefinition",
});

const externalIdentifier = defineRelation({
  cardinality: "many",
  id: "product.externalIdentifier",
  sourceType: "product.Product",
  target: { kind: "value", valueType: { kind: "text" } },
});

const reference = defineRelation({
  cardinality: "many",
  id: "product.reference",
  sourceType: "product.Product",
  target: { kind: "type", typeId: "product.ReferenceIdentifier" },
});

const baseUnit = defineRelation({
  cardinality: "one",
  id: "product.baseUnit",
  sourceType: "product.Product",
  target: { kind: "value", valueType: { kind: "text" } },
});

const packQuantity = defineRelation({
  cardinality: "one",
  id: "product.packQuantity",
  sourceType: "product.Product",
  target: {
    kind: "value",
    valueType: { kind: "quantity", unit: "each" },
  },
});

const lifecycleState = defineRelation({
  cardinality: "many",
  id: "product.lifecycleState",
  sourceType: "product.Product",
  target: { kind: "value", valueType: { kind: "text" } },
});

const defaultPackQuantity = defineComputation({
  expression: {
    kind: "relation",
    relationId: "product.packQuantity",
  },
  id: "product.defaultPackQuantity",
  inputs: [],
  returns: { kind: "quantity", unit: "each" },
});

const admitItem = defineAction({
  effects: [
    {
      relationId: "product.externalIdentifier",
      value: { inputId: "externalIdentifier", kind: "input" },
    },
    {
      relationId: "product.baseUnit",
      value: {
        kind: "literal",
        value: { kind: "text", value: "each" },
      },
    },
    {
      relationId: "product.packQuantity",
      value: { inputId: "packQuantity", kind: "input" },
    },
    {
      relationId: "product.lifecycleState",
      value: { inputId: "lifecycleState", kind: "input" },
    },
  ],
  id: "product.admitItem",
  inputs: [
    { id: "externalIdentifier", valueType: { kind: "text" } },
    { id: "lifecycleState", valueType: { kind: "text" } },
    {
      id: "packQuantity",
      valueType: { kind: "quantity", unit: "each" },
    },
  ],
  precondition: {
    kind: "binary",
    left: { inputId: "packQuantity", kind: "input" },
    operator: "greater_than",
    right: {
      kind: "literal",
      value: { amount: "0", kind: "quantity", unit: "each" },
    },
  },
});

const correctLifecycle = defineAction({
  effects: [
    {
      relationId: "product.lifecycleState",
      value: { inputId: "state", kind: "input" },
    },
  ],
  id: "product.correctLifecycle",
  inputs: [{ id: "state", valueType: { kind: "text" } }],
  precondition: {
    kind: "literal",
    value: { kind: "bool", value: true },
  },
});

export default defineBundle({
  actions: [admitItem, correctLifecycle],
  computations: [defaultPackQuantity],
  id: "product.catalog",
  relations: [
    baseUnit,
    externalIdentifier,
    lifecycleState,
    packQuantity,
    reference,
  ],
  revision: 1,
  types: [Item, Product, ReferenceIdentifier, UnitDefinition],
});
