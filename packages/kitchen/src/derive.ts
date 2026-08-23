import {
  firstSuccess,
  optionalCapability,
  requireCapability,
} from "../../pack/src/index.js";
import type {
  CapabilityInput,
  FirstSuccessInput,
} from "../../pack/src/compiler.js";
import type { CapabilityFact, WorkingSetSnapshot } from "./types.js";

type OntologyAction = {
  readonly id: string;
  readonly effects?: readonly unknown[];
};

type OntologyDocument = {
  readonly definitionId?: string;
  readonly actions?: readonly OntologyAction[];
  readonly relations?: readonly unknown[];
};

function parseOntology(canonicalJson: string): OntologyDocument {
  return JSON.parse(canonicalJson) as OntologyDocument;
}

function scopeFromDefinitionId(definitionId: string): string {
  const dot = definitionId.indexOf(".");
  return dot === -1 ? definitionId : definitionId.slice(0, dot);
}

function writeActionIds(document: OntologyDocument): string[] {
  return (document.actions ?? [])
    .filter((action) => (action.effects?.length ?? 0) > 0)
    .map((action) => action.id)
    .sort();
}

/**
 * Derive Pack capability requirements from active definition artifacts.
 * Inventory-shaped packages yield source_read; packages with write Actions
 * yield optional external_write with degrade.actionIds from those Actions.
 */
export function deriveCapabilities(
  snapshot: WorkingSetSnapshot,
): CapabilityInput[] {
  if (snapshot.capabilityFacts.length > 0) {
    return snapshot.capabilityFacts.map(capabilityFromFact);
  }

  const byScope = new Map<
    string,
    {
      definitionId: string;
      digest: string;
      hasRelations: boolean;
      writeActions: string[];
    }
  >();

  for (const definition of snapshot.activeDefinitions) {
    const document = parseOntology(definition.canonicalJson);
    const scope = scopeFromDefinitionId(definition.definitionId);
    const existing = byScope.get(scope);
    const writeActions = writeActionIds(document);
    const hasRelations = (document.relations?.length ?? 0) > 0;
    if (existing === undefined) {
      byScope.set(scope, {
        definitionId: definition.definitionId,
        digest: definition.digest,
        hasRelations,
        writeActions,
      });
      continue;
    }
    existing.writeActions = [
      ...new Set([...existing.writeActions, ...writeActions]),
    ].sort();
    existing.hasRelations = existing.hasRelations || hasRelations;
  }

  const capabilities: CapabilityInput[] = [];
  const scopes = [...byScope.keys()].sort();
  for (const scope of scopes) {
    const entry = byScope.get(scope)!;
    if (scope === "inventory" || (entry.hasRelations && scope !== "procurement")) {
      if (scope === "inventory" || scope === "party" || scope === "product") {
        if (scope === "inventory") {
          capabilities.push(
            requireCapability({
              class: "source_read",
              id: `cap.source.${scope}.read`,
              scope,
              sensitivity: "non_sensitive",
            }),
          );
        }
      }
    }
    if (scope === "procurement" && entry.writeActions.length > 0) {
      capabilities.push(
        optionalCapability({
          class: "external_write",
          degrade: {
            actionIds: entry.writeActions.slice(0, 3),
            mode: "hide_actions",
          },
          id: `cap.effect.${scope}.write`,
          scope,
          sensitivity: "sensitive",
        }),
      );
    }
  }

  if (capabilities.length === 0) {
    for (const scope of scopes) {
      const entry = byScope.get(scope)!;
      if (entry.hasRelations) {
        capabilities.push(
          requireCapability({
            class: "source_read",
            id: `cap.source.${scope}.read`,
            scope,
            sensitivity: "non_sensitive",
          }),
        );
      }
      if (entry.writeActions.length > 0) {
        capabilities.push(
          optionalCapability({
            class: "external_write",
            degrade: {
              actionIds: entry.writeActions.slice(0, 3),
              mode: "hide_actions",
            },
            id: `cap.effect.${scope}.write`,
            scope,
            sensitivity: "sensitive",
          }),
        );
      }
    }
  }

  return capabilities;
}

function capabilityFromFact(fact: CapabilityFact): CapabilityInput {
  if (fact.necessity === "optional") {
    if (fact.degrade === undefined) {
      throw new Error(`optional capability ${fact.requirementId} missing degrade`);
    }
    return optionalCapability({
      class: fact.class,
      degrade: fact.degrade,
      id: fact.requirementId,
      scope: fact.scope,
      sensitivity: fact.sensitivity,
    });
  }
  return requireCapability({
    class: fact.class,
    id: fact.requirementId,
    scope: fact.scope,
    sensitivity: fact.sensitivity,
  });
}

export function deriveCapabilityFacts(
  snapshot: WorkingSetSnapshot,
): CapabilityFact[] {
  const capabilities = deriveCapabilities({
    ...snapshot,
    capabilityFacts: [],
  });
  return capabilities.map((capability) => {
    const definition =
      snapshot.activeDefinitions.find((row) =>
        row.definitionId.startsWith(`${capability.scope}.`),
      ) ?? snapshot.activeDefinitions[0];
    const document = definition
      ? parseOntology(definition.canonicalJson)
      : { actions: [] };
    return {
      requirementId: capability.id,
      class: capability.class,
      scope: capability.scope,
      sensitivity:
        capability.sensitivity ??
        (capability.class === "external_write" ? "sensitive" : "non_sensitive"),
      necessity: capability.degrade === undefined ? "required" : "optional",
      degrade: capability.degrade,
      evidence: {
        definitionId: definition?.definitionId ?? "unknown",
        digest: definition?.digest ?? "0".repeat(64),
        declaredActionIds: writeActionIds(document),
      },
    };
  });
}

export function selectFirstSuccess(input: {
  readonly snapshot: WorkingSetSnapshot;
  readonly hint?: FirstSuccessInput["outcome"];
  readonly contractId?: string;
}): {
  readonly firstSuccess: FirstSuccessInput;
  readonly reason: "creator_hint" | "single_write_action" | "explicit_required";
} {
  const actionIds = new Set<string>();
  for (const definition of input.snapshot.activeDefinitions) {
    const document = parseOntology(definition.canonicalJson);
    for (const action of document.actions ?? []) {
      actionIds.add(action.id);
    }
  }

  if (input.hint !== undefined) {
    if (input.hint.kind === "action_committed") {
      if (!actionIds.has(input.hint.actionId)) {
        throw new Error(
          `firstSuccess hint action missing from ontology: ${input.hint.actionId}`,
        );
      }
    }
    return {
      firstSuccess: firstSuccess({
        id: input.contractId ?? "kitchen.first_success",
        outcome: input.hint,
      }),
      reason: "creator_hint",
    };
  }

  const writeActions: string[] = [];
  for (const definition of input.snapshot.activeDefinitions) {
    writeActions.push(...writeActionIds(parseOntology(definition.canonicalJson)));
  }
  const unique = [...new Set(writeActions)].sort();
  if (unique.length === 1) {
    return {
      firstSuccess: firstSuccess({
        id: input.contractId ?? "kitchen.first_success",
        outcome: { kind: "action_committed", actionId: unique[0]! },
      }),
      reason: "single_write_action",
    };
  }

  throw new Error(
    "firstSuccess requires explicit hint when multiple write Actions exist",
  );
}

export function collectDeclaredActionIds(
  snapshot: WorkingSetSnapshot,
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const definition of snapshot.activeDefinitions) {
    const document = parseOntology(definition.canonicalJson);
    for (const action of document.actions ?? []) {
      ids.add(action.id);
    }
  }
  return ids;
}
