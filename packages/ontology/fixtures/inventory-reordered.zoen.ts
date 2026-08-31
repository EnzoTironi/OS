import {
  defineAction,
  defineBundle,
  defineComputation,
  defineRelation,
  defineType,
} from "@zoen/ontology";

const Warehouse = defineType({
  attributes: [{ id: "code", valueType: { kind: "text" } }],
  id: "inventory.Warehouse",
});

const InventoryItem = defineType({
  attributes: [
    {
      id: "reorderPoint",
      valueType: { kind: "quantity", unit: "kg" },
    },
    { id: "sku", valueType: { kind: "text" } },
  ],
  id: "inventory.Item",
});

const storedAt = defineRelation({
  cardinality: "many",
  id: "inventory.storedAt",
  sourceType: "inventory.Item",
  target: { kind: "type", typeId: "inventory.Warehouse" },
});

const inventoryLevel = defineRelation({
  cardinality: "one",
  id: "inventory.level",
  sourceType: "inventory.Item",
  target: {
    kind: "value",
    valueType: { kind: "quantity", unit: "kg" },
  },
});

const requiredPurchase = defineComputation({
  expression: {
    kind: "binary",
    left: { inputId: "target", kind: "input" },
    operator: "subtract",
    right: { inputId: "onHand", kind: "input" },
  },
  id: "inventory.requiredPurchase",
  inputs: [
    { id: "onHand", valueType: { kind: "quantity", unit: "kg" } },
    { id: "target", valueType: { kind: "quantity", unit: "kg" } },
  ],
  returns: { kind: "quantity", unit: "kg" },
});

const replenish = defineAction({
  effects: [
    {
      relationId: "inventory.level",
      value: { inputId: "quantity", kind: "input" },
    },
  ],
  id: "inventory.replenish",
  inputs: [
    {
      id: "quantity",
      valueType: { kind: "quantity", unit: "kg" },
    },
  ],
  precondition: {
    kind: "binary",
    left: { inputId: "quantity", kind: "input" },
    operator: "greater_than",
    right: {
      kind: "literal",
      value: { amount: "0.125", kind: "quantity", unit: "kg" },
    },
  },
});

export default defineBundle({
  actions: [replenish],
  computations: [requiredPurchase],
  id: "inventory.definition",
  relations: [inventoryLevel, storedAt],
  revision: 1,
  types: [InventoryItem, Warehouse],
});
