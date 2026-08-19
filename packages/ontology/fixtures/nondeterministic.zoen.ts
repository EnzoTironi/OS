import {
  defineAction,
  defineBundle,
  defineComputation,
  defineRelation,
  defineType,
} from "@zoen/ontology";

const Item = defineType({
  attributes: [{ id: "name", valueType: { kind: "text" } }],
  id: "example.Item",
});

const label = defineRelation({
  cardinality: "one",
  id: "example.label",
  sourceType: "example.Item",
  target: { kind: "value", valueType: { kind: "text" } },
});

const copyLabel = defineComputation({
  expression: { inputId: "value", kind: "input" },
  id: "example.copyLabel",
  inputs: [{ id: "value", valueType: { kind: "text" } }],
  returns: { kind: "text" },
});

const setLabel = defineAction({
  effects: [
    {
      relationId: "example.label",
      value: { inputId: "value", kind: "input" },
    },
  ],
  id: "example.setLabel",
  inputs: [{ id: "value", valueType: { kind: "text" } }],
  precondition: {
    kind: "literal",
    value: { kind: "bool", value: true },
  },
});

export default defineBundle({
  actions: [setLabel],
  computations: [copyLabel],
  id: "example.definition",
  relations: [label],
  revision: Date.now(),
  types: [Item],
});
