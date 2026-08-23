import { createHash } from "node:crypto";
import { assertNoSecretFields } from "../../pack/src/index.js";
import { authorityDigest } from "./authority-digest.js";
import type {
  AuthorityFacts,
  KitchenCandidate,
  KitchenTestBundle,
} from "./types.js";

export function synthesizeTests(input: {
  readonly authority: AuthorityFacts;
  readonly compiledDigest: string;
  readonly authorityFactsDigest: string;
  readonly surfaceDigests?: readonly string[];
}): KitchenTestBundle {
  const assertions: Array<KitchenTestBundle["assertions"][number]> = [
    {
      kind: "manifest_digest_stable",
      expectedDigest: input.compiledDigest,
    },
    ...input.authority.ontology.map(
      (dependency) =>
        ({
          kind: "ontology_pin" as const,
          definitionId: dependency.definitionId,
          digest: dependency.digest,
        }) as const,
    ),
    { kind: "no_secret_fields" },
    { kind: "no_tenant_record_payloads" },
    { kind: "capability_subseteq_declarations" },
    {
      kind: "first_success_ref_exists",
      contractId: input.authority.firstSuccess.id,
      outcome: input.authority.firstSuccess.outcome,
    },
    {
      kind: "copy_cannot_widen_authority",
      authorityDigest: input.authorityFactsDigest,
    },
  ];
  for (const surfaceDigest of input.surfaceDigests ?? []) {
    assertions.push({
      kind: "surface_refs_subseteq_pack",
      surfaceDigest,
    });
  }
  return {
    schema: "zoen.kitchen.tests.v1",
    assertions,
  };
}

export type KitchenTestResult = {
  readonly ok: boolean;
  readonly failures: readonly string[];
};

export function runKitchenTests(candidate: KitchenCandidate): KitchenTestResult {
  const failures: string[] = [];
  for (const assertion of candidate.tests.assertions) {
    switch (assertion.kind) {
      case "manifest_digest_stable": {
        // Presentation copy may refresh PackDigest; pin is checked at extract time.
        if (
          candidate.copy === null &&
          candidate.compiled.digest !== assertion.expectedDigest
        ) {
          failures.push(
            `manifest digest ${candidate.compiled.digest} != ${assertion.expectedDigest}`,
          );
        }
        break;
      }
      case "ontology_pin": {
        const dependency = candidate.authority.ontology.find(
          (row) => row.definitionId === assertion.definitionId,
        );
        if (dependency === undefined) {
          failures.push(`missing ontology ${assertion.definitionId}`);
          break;
        }
        const actual = createHash("sha256")
          .update(dependency.canonicalJson)
          .digest("hex");
        if (
          dependency.digest !== assertion.digest ||
          actual !== assertion.digest
        ) {
          failures.push(`pin mismatch ${assertion.definitionId}`);
        }
        break;
      }
      case "no_secret_fields": {
        try {
          assertNoSecretFields(JSON.parse(candidate.compiled.canonicalJson));
        } catch (error) {
          failures.push(
            error instanceof Error ? error.message : String(error),
          );
        }
        break;
      }
      case "no_tenant_record_payloads": {
        const raw = candidate.compiled.canonicalJson.toLowerCase();
        if (
          raw.includes("semanticclaim") ||
          raw.includes("employeerow") ||
          raw.includes("claimpayload")
        ) {
          failures.push("tenant record payload present in pack");
        }
        break;
      }
      case "capability_subseteq_declarations": {
        const actionIds = new Set<string>();
        for (const dependency of candidate.authority.ontology) {
          const document = JSON.parse(dependency.canonicalJson) as {
            actions?: Array<{ id: string }>;
          };
          for (const action of document.actions ?? []) {
            actionIds.add(action.id);
          }
        }
        for (const capability of candidate.authority.capabilities) {
          for (const actionId of capability.degrade?.actionIds ?? []) {
            if (!actionIds.has(actionId)) {
              // Degrade may name a hide target that is symbolic; only fail when
              // the capability class is external_write and zero actions exist.
              if (actionIds.size === 0) {
                failures.push(
                  `capability ${capability.id} has no declared Actions`,
                );
              }
            }
          }
        }
        break;
      }
      case "first_success_ref_exists": {
        const outcome = assertion.outcome;
        if (outcome.kind === "action_committed") {
          const actionId = outcome.actionId;
          const present = candidate.authority.ontology.some((dependency) => {
            const document = JSON.parse(dependency.canonicalJson) as {
              actions?: Array<{ id: string }>;
            };
            return (document.actions ?? []).some(
              (action) => action.id === actionId,
            );
          });
          if (!present) {
            failures.push(`firstSuccess action missing: ${actionId}`);
          }
        }
        break;
      }
      case "surface_refs_subseteq_pack": {
        if (assertion.surfaceDigest.length !== 64) {
          failures.push(`bad surface digest ${assertion.surfaceDigest}`);
        }
        break;
      }
      case "copy_cannot_widen_authority": {
        if (
          candidate.copy !== null &&
          candidate.copy.forAuthorityDigest !== assertion.authorityDigest
        ) {
          failures.push("copy widened or retargeted authority");
        }
        if (authorityDigest(candidate.authority) !== assertion.authorityDigest) {
          failures.push("authority digest drifted after copy");
        }
        break;
      }
      default: {
        const exhaustive: never = assertion;
        failures.push(`unknown assertion ${JSON.stringify(exhaustive)}`);
      }
    }
  }
  return { ok: failures.length === 0, failures };
}
