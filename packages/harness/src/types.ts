import { z } from "zod";

const identifier = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/);
const digest = z.string().regex(/^[0-9a-f]{64}$/);

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

export const exactInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("bool"), value: z.boolean() }).strict(),
  z.object({ kind: z.literal("decimal"), value: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("entity"), value: identifier }).strict(),
  z
    .object({
      kind: z.literal("integer"),
      value: z.string().regex(/^-?[0-9]+$/),
    })
    .strict(),
  z
    .object({
      amount: z.string().min(1),
      kind: z.literal("quantity"),
      unit: z.string().min(1),
    })
    .strict(),
  z.object({ kind: z.literal("text"), value: z.string() }).strict(),
]);
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

const actionInputSpecSchema = z
  .object({
    id: identifier,
    kind: z.enum(["bool", "decimal", "entity", "integer", "quantity", "text"]),
  })
  .strict();

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
    capabilities: z.array(capabilityAliasSchema),
    instruction: z.string().min(1).max(16_000),
    modelCapability: modelCapabilityAliasSchema,
    providerRoute: providerRouteIdSchema,
    taskId: taskIdSchema,
  })
  .strict();
export type TaskScope = z.infer<typeof taskScopeSchema>;

export interface QueryContext {
  readonly alias: CapabilityAlias;
  readonly resultDigest: string;
  readonly values: readonly unknown[];
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
