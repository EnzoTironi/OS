/**
 * Personal memory/reminder lake. Not commercial.sales.
 * compileDefinition requires all four families; alwaysTrue is the dummy computation.
 * Action inputs stay in the compiler's value types. Due time is text, not datetime.
 */
import {
  defineAction,
  defineBundle,
  defineComputation,
  defineRelation,
  defineType,
} from "@zoen/ontology";

const Note = defineType({
  attributes: [{ id: "noteId", valueType: { kind: "text" } }],
  id: "personal.Note",
});

const body = defineRelation({
  cardinality: "one",
  id: "personal.body",
  sourceType: "personal.Note",
  target: { kind: "value", valueType: { kind: "text" } },
});

const dueAt = defineRelation({
  cardinality: "one",
  id: "personal.dueAt",
  sourceType: "personal.Note",
  target: { kind: "value", valueType: { kind: "text" } },
});

const alwaysTrue = defineComputation({
  expression: {
    kind: "literal",
    value: { kind: "bool", value: true },
  },
  id: "personal.alwaysTrue",
  inputs: [],
  returns: { kind: "bool" },
});

const writeMemory = defineAction({
  effects: [
    {
      relationId: "personal.body",
      value: { inputId: "body", kind: "input" },
    },
  ],
  id: "personal.writeMemory",
  inputs: [{ id: "body", valueType: { kind: "text" } }],
  precondition: {
    kind: "literal",
    value: { kind: "bool", value: true },
  },
});

const createReminder = defineAction({
  effects: [
    {
      relationId: "personal.body",
      value: { inputId: "body", kind: "input" },
    },
    {
      relationId: "personal.dueAt",
      value: { inputId: "dueAt", kind: "input" },
    },
  ],
  id: "personal.createReminder",
  inputs: [
    { id: "body", valueType: { kind: "text" } },
    { id: "dueAt", valueType: { kind: "text" } },
  ],
  precondition: {
    kind: "literal",
    value: { kind: "bool", value: true },
  },
});

export default defineBundle({
  actions: [createReminder, writeMemory],
  computations: [alwaysTrue],
  id: "personal.memory",
  relations: [body, dueAt],
  revision: 1,
  types: [Note],
});
