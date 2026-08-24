import {
  defineAction,
  defineBundle,
  defineComputation,
  defineRelation,
  defineType,
} from "@zoen/ontology";

const Location = defineType({
  attributes: [{ id: "locationCode", valueType: { kind: "text" } }],
  id: "inventory.Location",
});

const StockPosition = defineType({
  attributes: [{ id: "positionId", valueType: { kind: "text" } }],
  id: "inventory.StockPosition",
});

const location = defineRelation({
  cardinality: "one",
  id: "inventory.location",
  sourceType: "inventory.StockPosition",
  target: { kind: "type", typeId: "inventory.Location" },
});

const alwaysTrue = defineComputation({
  expression: {
    kind: "literal",
    value: { kind: "bool", value: true },
  },
  id: "inventory.alwaysTrue",
  inputs: [],
  returns: { kind: "bool" },
});

const assignLocation = defineAction({
  effects: [
    {
      relationId: "inventory.location",
      value: { inputId: "location", kind: "input" },
    },
  ],
  id: "inventory.assignLocation",
  inputs: [
    {
      id: "location",
      valueType: { kind: "entity", typeId: "inventory.Location" },
    },
  ],
  precondition: {
    kind: "literal",
    value: { kind: "bool", value: true },
  },
});

export default defineBundle({
  actions: [assignLocation],
  computations: [alwaysTrue],
  id: "inventory.entity-authoring",
  relations: [location],
  revision: 1,
  types: [Location, StockPosition],
});
