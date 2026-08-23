import {
  defineAction,
  defineBundle,
  defineRelation,
  defineType,
} from "@zoen/ontology";

/**
 * Personal bill/subscription watchdog pack meaning.
 * Executable runtime still uses inventory.governed + inventory.requestStock
 * because Personal membership delegation grants those action/resource IDs.
 * This file is the product ontology surface for AD-14 (meaning in .zoen.ts).
 */

const Subscription = defineType({
  attributes: [
    { id: "vendor", valueType: { kind: "text" } },
    { id: "dueDay", valueType: { kind: "integer" } },
  ],
  id: "personal.Subscription",
});

const dueAmount = defineRelation({
  cardinality: "one",
  id: "personal.dueAmount",
  sourceType: "personal.Subscription",
  target: { kind: "value", valueType: { kind: "integer" } },
});

const acknowledged = defineRelation({
  cardinality: "many",
  id: "personal.acknowledged",
  sourceType: "personal.Subscription",
  target: { kind: "value", valueType: { kind: "integer" } },
});

const acknowledgeBill = defineAction({
  effects: [
    {
      relationId: "personal.acknowledged",
      value: { inputId: "quantity", kind: "input" },
    },
  ],
  id: "personal.acknowledgeBill",
  inputs: [{ id: "quantity", valueType: { kind: "integer" } }],
  precondition: {
    kind: "binary",
    left: { kind: "relation", relationId: "personal.dueAmount" },
    operator: "greater_than",
    right: { inputId: "quantity", kind: "input" },
  },
});

export const personalBillWatchdog = defineBundle({
  actions: [acknowledgeBill],
  computations: [],
  id: "personal.billWatchdog",
  relations: [dueAmount, acknowledged],
  revision: 1,
  types: [Subscription],
});

export const familySharedResource = {
  actionId: "inventory.requestStock",
  resourceId: "inventory.item.1",
  viewerPrincipalId: "principal.family.viewer",
  approverPrincipalId: "principal.family.approver",
  tenantId: "tenant.family.1",
} as const;

export const orgMembership = {
  principalId: "principal.org.member",
  tenantId: "tenant.org.a",
} as const;
