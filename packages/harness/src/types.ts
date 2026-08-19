import { createHash } from "node:crypto";
import type { ExactValue } from "@zoen/ontology";
import { z } from "zod";

const identifier = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/);
const digest = z.string().regex(/^[0-9a-f]{64}$/);
export const canonicalDecimalSchema = z
  .string()
  .regex(
    /^(0|-[1-9][0-9]*|[1-9][0-9]*|-?0\.[0-9]*[1-9]|-?[1-9][0-9]*\.[0-9]*[1-9])$/,
  );
export const canonicalIntegerSchema = z
  .string()
  .regex(/^(0|-[1-9][0-9]*|[1-9][0-9]*)$/);

export const capabilityAliasSchema = identifier.brand<"CapabilityAlias">();
export const modelCapabilityAliasSchema =
  identifier.brand<"ModelCapabilityAlias">();
export const providerRouteIdSchema = identifier.brand<"ProviderRouteId">();
export const sessionIdSchema = identifier.brand<"SessionId">();
export const taskIdSchema = identifier.brand<"TaskId">();

export type CapabilityAlias = z.infer<typeof capabilityAliasSchema>;
export type ModelCapabilityAlias = z.infer<
  typeof modelCapabilityAliasSchema
>;
export type ProviderRouteId = z.infer<typeof providerRouteIdSchema>;
export type SessionId = z.infer<typeof sessionIdSchema>;
export type TaskId = z.infer<typeof taskIdSchema>;

export const providerKindSchema = z.enum([
  "anthropic",
  "openai",
  "openai-compatible",
]);
export type ProviderKind = z.infer<typeof providerKindSchema>;

export const definitionReferenceSchema = z
  .object({
    definitionId: identifier,
    digest,
    revision: z.number().int().positive(),
  })
  .strict();
export type DefinitionReferenceConfig = z.infer<
  typeof definitionReferenceSchema
>;

export const exactInputSchema: z.ZodType<ExactValue> = z.discriminatedUnion(
  "kind",
  [
    z.object({ kind: z.literal("bool"), value: z.boolean() }).strict(),
    z
      .object({
        kind: z.literal("decimal"),
        value: canonicalDecimalSchema,
      })
      .strict(),
    z
      .object({ kind: z.literal("integer"), value: canonicalIntegerSchema })
      .strict(),
    z
      .object({
        amount: canonicalDecimalSchema,
        kind: z.literal("quantity"),
        unit: identifier,
      })
      .strict(),
    z.object({ kind: z.literal("text"), value: z.string() }).strict(),
  ],
);
export type ExactInput = z.infer<typeof exactInputSchema>;

export const actionPlanSchema = z
  .object({
    action: capabilityAliasSchema,
    inputs: z
      .array(
        z
          .object({
            id: identifier,
            value: exactInputSchema,
          })
          .strict(),
      )
      .max(32),
  })
  .strict();
export type ActionPlan = z.infer<typeof actionPlanSchema>;

const actionInputSpecSchema = z.discriminatedUnion("kind", [
  z.object({ id: identifier, kind: z.literal("bool") }).strict(),
  z.object({ id: identifier, kind: z.literal("decimal") }).strict(),
  z.object({ id: identifier, kind: z.literal("integer") }).strict(),
  z
    .object({
      id: identifier,
      kind: z.literal("quantity"),
      unit: identifier,
    })
    .strict(),
  z.object({ id: identifier, kind: z.literal("text") }).strict(),
]);

export const semanticCapabilitySchema = z.discriminatedUnion("kind", [
  z
    .object({
      actionId: identifier,
      alias: capabilityAliasSchema,
      definition: definitionReferenceSchema,
      description: z.string().min(1),
      inputs: z.array(actionInputSpecSchema),
      kind: z.literal("action"),
      resourceId: identifier,
      validAt: z.iso.datetime(),
    })
    .strict(),
  z
    .object({
      alias: capabilityAliasSchema,
      definition: definitionReferenceSchema,
      description: z.string().min(1),
      entityId: identifier,
      kind: z.literal("query"),
      selection: z.discriminatedUnion("kind", [
        z.object({ id: identifier, kind: z.literal("computation") }).strict(),
        z.object({ id: identifier, kind: z.literal("relation") }).strict(),
      ]),
      validAt: z.iso.datetime(),
    })
    .strict(),
]);
export type SemanticCapability = z.infer<typeof semanticCapabilitySchema>;
export type ActionCapability = Extract<
  SemanticCapability,
  { kind: "action" }
>;
export type QueryCapability = Extract<
  SemanticCapability,
  { kind: "query" }
>;

export const semanticCapabilityScopeSchema = z.discriminatedUnion("kind", [
  z
    .object({
      actionId: identifier,
      definition: definitionReferenceSchema,
      kind: z.literal("action"),
      resourceId: identifier,
      validAt: z.iso.datetime(),
    })
    .strict(),
  z
    .object({
      definition: definitionReferenceSchema,
      entityId: identifier,
      kind: z.literal("query"),
      selection: z.discriminatedUnion("kind", [
        z.object({ id: identifier, kind: z.literal("computation") }).strict(),
        z.object({ id: identifier, kind: z.literal("relation") }).strict(),
      ]),
      validAt: z.iso.datetime(),
    })
    .strict(),
]);
export type SemanticCapabilityScope = z.infer<
  typeof semanticCapabilityScopeSchema
>;

export function capabilityAliasForScope(
  scope: SemanticCapabilityScope,
): CapabilityAlias {
  let semanticId: string;
  switch (scope.kind) {
    case "action":
      semanticId = scope.actionId;
      break;
    case "query":
      semanticId = scope.selection.id;
      break;
    default: {
      const exhaustive: never = scope;
      return exhaustive;
    }
  }
  const slug = semanticId.replace(/[^A-Za-z0-9_-]/g, "-").slice(-80);
  const suffix = createHash("sha256")
    .update(JSON.stringify(scope))
    .digest("hex")
    .slice(0, 12);
  return capabilityAliasSchema.parse(`${scope.kind}-${slug}-${suffix}`);
}

export const providerRouteSchema = z
  .object({
    capability: modelCapabilityAliasSchema,
    id: providerRouteIdSchema,
    modelId: z.string().min(1),
    provider: providerKindSchema,
  })
  .strict();
export type ProviderRoute = z.infer<typeof providerRouteSchema>;

export const taskScopeSchema = z
  .object({
    instruction: z.string().min(1).max(16_000),
    modelCapability: modelCapabilityAliasSchema,
    taskId: taskIdSchema,
  })
  .strict();
export type TaskScope = z.infer<typeof taskScopeSchema>;

export const semanticValueSchema = z.union([
  exactInputSchema,
  z.object({ kind: z.literal("entity"), value: identifier }).strict(),
]);
export type SemanticValue = z.infer<typeof semanticValueSchema>;

export const trustedAgentContextSchema = z
  .object({
    actorId: identifier,
    delegationIds: z.array(identifier),
    principalId: identifier,
    tenantId: identifier,
    workloadId: identifier,
  })
  .strict();
export type TrustedAgentContext = z.infer<typeof trustedAgentContextSchema>;

export interface QueryContext {
  readonly alias: CapabilityAlias;
  readonly resultDigest: string;
  readonly values: readonly SemanticValue[];
}

export interface PlanningRequest {
  readonly actions: readonly ActionCapability[];
  readonly instruction: string;
  readonly queries: readonly QueryContext[];
}

export interface PlanningResult {
  readonly plan: ActionPlan;
  readonly promptDigest: string;
  readonly providerCallId: string;
  readonly responseModelId: string;
}

export interface ModelPlanner {
  plan(request: PlanningRequest): Promise<PlanningResult>;
}
