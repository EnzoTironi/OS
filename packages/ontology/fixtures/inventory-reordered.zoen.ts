import {
  defineAction,
  defineBundle,
  defineComputation,
  defineRelation,
  defineType,
} from "@zoen/ontology";

const Warehouse = defineType({
  id: "inventory.Warehouse",
  attributes: [{ valueType: { kind: "text" }, id: "code" }],
});

const InventoryItem = defineType({
  id: "inventory.Item",
  attributes: [
    {
      valueType: { unit: "kg", kind: "quantity" },
      id: "reorderPoint",
    },
    { valueType: { kind: "text" }, id: "sku" },
  ],
});

const storedAt = defineRelation({
  target: { typeId: "inventory.Warehouse", kind: "type" },
  sourceType: "inventory.Item",
  id: "inventory.storedAt",
  cardinality: "many",
});

const inventoryLevel = defineRelation({
  target: {
    valueType: { unit: "kg", kind: "quantity" },
    kind: "value",
  },
  sourceType: "inventory.Item",
  id: "inventory.level",
  cardinality: "one",
});

const requiredPurchase = defineComputation({
  returns: { unit: "kg", kind: "quantity" },
  inputs: [
    { valueType: { unit: "kg", kind: "quantity" }, id: "onHand" },
    { valueType: { unit: "kg", kind: "quantity" }, id: "target" },
  ],
  id: "inventory.requiredPurchase",
  expression: {
    right: { kind: "input", inputId: "onHand" },
    operator: "subtract",
    left: { kind: "input", inputId: "target" },
    kind: "binary",
  },
});

const replenish = defineAction({
  precondition: {
    right: {
      value: { unit: "kg", kind: "quantity", amount: "0.125" },
      kind: "literal",
    },
    operator: "greater_than",
    left: { kind: "input", inputId: "quantity" },
    kind: "binary",
  },
  inputs: [
    {
      valueType: { unit: "kg", kind: "quantity" },
      id: "quantity",
    },
  ],
  id: "inventory.replenish",
  effects: [
    {
      value: { kind: "input", inputId: "quantity" },
      relationId: "inventory.level",
    },
  ],
});

export default defineBundle({
  types: [InventoryItem, Warehouse],
  revision: 1,
  relations: [inventoryLevel, storedAt],
  id: "inventory.definition",
  computations: [requiredPurchase],
  actions: [replenish],
});
