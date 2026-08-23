import {
  definePack,
  firstSuccess,
  ontologyDep,
  optionalCapability,
  requireCapability,
} from "@zoen/pack";

// Authoring scaffold. Digests/canonical JSON are filled by the e2e pack builder.
export default definePack({
  id: "pack.zoen.sample-company",
  version: "1.0.0",
  publisher: { displayName: "Zoen Official", id: "pub.zoen.official" },
  presentation: {
    title: "Sample Company",
    summary: "Governed inventory + commercial baseline for local activation.",
  },
  ontology: [
    ontologyDep({
      canonicalJson: "",
      definitionId: "party.core",
      digest: "0".repeat(64),
    }),
  ],
  capabilities: [
    requireCapability({
      class: "source_read",
      id: "cap.source.inventory.read",
      scope: "inventory",
      sensitivity: "non_sensitive",
    }),
    optionalCapability({
      class: "external_write",
      degrade: {
        actionIds: ["procurement.raisePurchase"],
        mode: "hide_actions",
      },
      id: "cap.effect.procurement.write",
      scope: "procurement",
      sensitivity: "sensitive",
    }),
  ],
  firstSuccess: firstSuccess({
    id: "sample.first_governed_commitment",
    outcome: {
      actionId: "commercial.changeCommitment",
      kind: "action_committed",
    },
  }),
});
