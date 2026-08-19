import canonicalize from "canonicalize";
import { z } from "zod";
import { sha256, type CompiledDefinition } from "./support.js";

const canonicalDefinitionSchema = z
  .object({
    actions: z.array(
      z
        .object({
          effects: z.array(
            z.object({ relationId: z.string() }).passthrough(),
          ),
          id: z.string(),
          inputs: z.array(z.object({ id: z.string() }).passthrough()),
          outputs: z
            .array(
              z
                .object({
                  id: z.string(),
                  valueType: z.object({ kind: z.string() }).passthrough(),
                })
                .strict(),
            )
            .optional(),
        })
        .passthrough(),
    ),
    definitionId: z.string(),
    revision: z.number().int().positive(),
  })
  .passthrough();

export function parseActionContracts(source: string) {
  const document: unknown = JSON.parse(source);
  return canonicalDefinitionSchema.parse(document).actions;
}

export function actionContractOnlyRevision(
  source: CompiledDefinition,
): CompiledDefinition {
  const document: unknown = JSON.parse(source.canonicalJson);
  const definition = canonicalDefinitionSchema.parse(document);
  const actions = definition.actions.map((action) =>
    action.id === "inventory.replenish"
      ? {
          ...action,
          outputs: [
            {
              id: "acceptedUnits",
              valueType: { kind: "integer" },
            },
          ],
        }
      : action,
  );
  const canonicalJson = canonicalize({
    ...definition,
    actions,
    revision: 4,
  });
  if (canonicalJson === undefined) {
    throw new Error("action-only revision is not canonicalizable");
  }
  return {
    canonicalJson,
    definition: {
      ...source.definition,
      revision: 4,
    },
    digest: sha256(canonicalJson),
  };
}
