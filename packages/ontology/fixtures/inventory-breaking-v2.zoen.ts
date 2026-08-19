import {
  defineAction,
  defineBundle,
  defineComputation,
  defineRelation,
  defineType,
} from "@zoen/ontology";

const InventoryItem = defineType({
  attributes: [
    { id: "stockKeepingUnit", valueType: { kind: "text" } },
    { id: "reorderPoint", valueType: { kind: "integer" } },
  ],
  id: "inventory.Item",
});

const Warehouse = defineType({
  attributes: [{ id: "code", valueType: { kind: "text" } }],
  id: "inventory.Warehouse",
});

const inventoryLevel = defineRelation({
  cardinality: "many",
  id: "inventory.level",
  sourceType: "inventory.Item",
  target: { kind: "type", typeId: "inventory.Warehouse" },
});

const receivedUnits = defineRelation({
  cardinality: "one",
  id: "inventory.receivedUnits",
  sourceType: "inventory.Item",
  target: { kind: "value", valueType: { kind: "integer" } },
});

const warehouseLocation = defineRelation({
  cardinality: "many",
  id: "inventory.warehouseLocation",
  sourceType: "inventory.Item",
  target: { kind: "type", typeId: "inventory.Warehouse" },
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
    { id: "target", valueType: { kind: "integer" } },
    { id: "onHand", valueType: { kind: "integer" } },
  ],
  returns: { kind: "integer" },
});

const replenish = defineAction({
  effects: [
    {
      relationId: "inventory.receivedUnits",
      value: { inputId: "units", kind: "input" },
    },
  ],
  id: "inventory.replenish",
  inputs: [{ id: "units", valueType: { kind: "integer" } }],
  precondition: {
    kind: "binary",
    left: { inputId: "units", kind: "input" },
    operator: "greater_than",
    right: { kind: "literal", value: { kind: "integer", value: "0" } },
  },
});

export default defineBundle({
  actions: [replenish],
  computations: [requiredPurchase],
  id: "inventory.definition",
  relations: [inventoryLevel, receivedUnits, warehouseLocation],
  revision: 2,
  types: [InventoryItem, Warehouse],
});
