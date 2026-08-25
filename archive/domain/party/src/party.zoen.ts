import {
  defineAction,
  defineBundle,
  defineComputation,
  defineRelation,
  defineType,
} from "@zoen/ontology";

const Party = defineType({
  attributes: [{ id: "partyId", valueType: { kind: "text" } }],
  id: "party.Party",
});

const Person = defineType({
  attributes: [
    { id: "displayName", valueType: { kind: "text" } },
    { id: "partyId", valueType: { kind: "text" } },
  ],
  id: "party.Person",
});

const Organization = defineType({
  attributes: [
    { id: "legalName", valueType: { kind: "text" } },
    { id: "partyId", valueType: { kind: "text" } },
  ],
  id: "party.Organization",
});

const LegalEntity = defineType({
  attributes: [{ id: "registrationId", valueType: { kind: "text" } }],
  id: "party.LegalEntity",
});

const Location = defineType({
  attributes: [{ id: "locationCode", valueType: { kind: "text" } }],
  id: "party.Location",
});

const ContactPoint = defineType({
  attributes: [{ id: "contactCode", valueType: { kind: "text" } }],
  id: "party.ContactPoint",
});

const RoleAssignment = defineType({
  attributes: [{ id: "roleId", valueType: { kind: "text" } }],
  id: "party.RoleAssignment",
});

const identityKind = defineRelation({
  cardinality: "one",
  id: "party.identityKind",
  sourceType: "party.Party",
  target: { kind: "value", valueType: { kind: "text" } },
});

const externalIdentifier = defineRelation({
  cardinality: "many",
  id: "party.externalIdentifier",
  sourceType: "party.Party",
  target: { kind: "value", valueType: { kind: "text" } },
});

const legalEntity = defineRelation({
  cardinality: "many",
  id: "party.legalEntity",
  sourceType: "party.Party",
  target: { kind: "type", typeId: "party.LegalEntity" },
});

const location = defineRelation({
  cardinality: "many",
  id: "party.location",
  sourceType: "party.Party",
  target: { kind: "type", typeId: "party.Location" },
});

const contactPoint = defineRelation({
  cardinality: "many",
  id: "party.contactPoint",
  sourceType: "party.Party",
  target: { kind: "type", typeId: "party.ContactPoint" },
});

const role = defineRelation({
  cardinality: "many",
  id: "party.role",
  sourceType: "party.Party",
  target: { kind: "value", valueType: { kind: "text" } },
});

const roleSequence = defineRelation({
  cardinality: "many",
  id: "party.roleSequence",
  sourceType: "party.Party",
  target: { kind: "value", valueType: { kind: "integer" } },
});

const effectiveRoleSequence = defineComputation({
  expression: {
    kind: "relation",
    relationId: "party.roleSequence",
  },
  id: "party.effectiveRoleSequence",
  inputs: [],
  returns: { kind: "integer" },
});

const admitIdentity = defineAction({
  effects: [
    {
      relationId: "party.externalIdentifier",
      value: { inputId: "externalIdentifier", kind: "input" },
    },
    {
      relationId: "party.identityKind",
      value: { inputId: "identityKind", kind: "input" },
    },
  ],
  id: "party.admitIdentity",
  inputs: [
    { id: "externalIdentifier", valueType: { kind: "text" } },
    { id: "identityKind", valueType: { kind: "text" } },
  ],
  precondition: {
    kind: "literal",
    value: { kind: "bool", value: true },
  },
});

const assignRole = defineAction({
  effects: [
    {
      relationId: "party.role",
      value: { inputId: "role", kind: "input" },
    },
    {
      relationId: "party.roleSequence",
      value: { inputId: "sequence", kind: "input" },
    },
  ],
  id: "party.assignRole",
  inputs: [
    { id: "role", valueType: { kind: "text" } },
    { id: "sequence", valueType: { kind: "integer" } },
  ],
  precondition: {
    kind: "binary",
    left: { inputId: "sequence", kind: "input" },
    operator: "greater_than",
    right: {
      kind: "literal",
      value: { kind: "integer", value: "0" },
    },
  },
});

export default defineBundle({
  actions: [admitIdentity, assignRole],
  computations: [effectiveRoleSequence],
  id: "party.core",
  relations: [
    contactPoint,
    externalIdentifier,
    identityKind,
    legalEntity,
    location,
    role,
    roleSequence,
  ],
  revision: 1,
  types: [
    ContactPoint,
    LegalEntity,
    Location,
    Organization,
    Party,
    Person,
    RoleAssignment,
  ],
});
