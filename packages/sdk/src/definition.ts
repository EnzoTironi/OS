import { z } from "zod";

const valueTypeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("bool") }).strict(),
  z.object({ kind: z.literal("decimal") }).strict(),
  z.object({ kind: z.literal("integer") }).strict(),
  z.object({ kind: z.literal("quantity"), unit: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("text") }).strict(),
]);

const inputDefinitionSchema = z
  .object({
    id: z.string().min(1),
    valueType: valueTypeSchema,
  })
  .strict();

const typeDefinitionSchema = z
  .object({
    attributes: z.array(inputDefinitionSchema),
    id: z.string().min(1),
  })
  .strict();

const relationTargetSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("type"),
      typeId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("value"),
      valueType: valueTypeSchema,
    })
    .strict(),
]);

const relationDefinitionSchema = z
  .object({
    cardinality: z.enum(["many", "one"]),
    id: z.string().min(1),
    sourceType: z.string().min(1),
    target: relationTargetSchema,
  })
  .strict();

const computationDefinitionSchema = z
  .object({
    expression: z.unknown(),
    id: z.string().min(1),
    inputs: z.array(inputDefinitionSchema),
    returns: valueTypeSchema,
  })
  .strict();

const actionEffectSchema = z
  .object({
    relationId: z.string().min(1),
    value: z.unknown(),
  })
  .strict();

const actionDefinitionSchema = z
  .object({
    effects: z.array(actionEffectSchema),
    id: z.string().min(1),
    inputs: z.array(inputDefinitionSchema),
    outputs: z
      .array(
        z
          .object({
            id: z.string().min(1),
            valueType: valueTypeSchema,
          })
          .strict(),
      )
      .optional(),
    precondition: z.unknown(),
  })
  .strict();

const definitionMetadataSchema = z
  .object({
    actions: z.array(actionDefinitionSchema),
    computations: z.array(computationDefinitionSchema),
    definitionId: z.string().min(1),
    relations: z.array(relationDefinitionSchema),
    revision: z.number().int().positive(),
    schema: z.literal("zoen.definition.v1"),
    types: z.array(typeDefinitionSchema),
  })
  .strict();

export type DefinitionMetadata = z.infer<typeof definitionMetadataSchema>;
export type DefinitionValueType = z.infer<typeof valueTypeSchema>;

export function parseDefinitionMetadata(
  canonicalJson: Uint8Array,
): DefinitionMetadata {
  const source = new TextDecoder().decode(canonicalJson);
  const value: unknown = JSON.parse(source);
  return definitionMetadataSchema.parse(value);
}
