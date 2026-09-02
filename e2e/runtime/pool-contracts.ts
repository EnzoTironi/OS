import { z } from "zod";
export {
  cancellationConvergenceMilliseconds,
  runtimeCommandTimeoutMilliseconds,
} from "./runtime-timeouts.js";
export const idSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const nonceSchema = z.string().regex(/^[0-9a-f]{64}$/);
const scenarioFields = {
  ci: z.boolean(),
  compose: z.boolean(),
  minio: z.boolean(),
  name: idSchema,
  realm: idSchema.optional(),
};
const scenarioSchema = z.discriminatedUnion("class", [
  z
    .object({
      ...scenarioFields,
      class: z.literal("static"),
      weight: z.literal(0),
    })
    .strict(),
  z
    .object({
      ...scenarioFields,
      class: z.literal("live"),
      weight: z.number().int().min(1).max(4),
    })
    .strict(),
  z
    .object({
      ...scenarioFields,
      class: z.literal("credential"),
      weight: z.literal(4),
    })
    .strict(),
]);
export const registrySchema = z.array(scenarioSchema);
export const reconciliationSchema = z
  .object({
    leases: z.array(
      z
        .object({ runId: idSchema, scenario: idSchema, suiteId: idSchema })
        .strict(),
    ),
    uncertain: z.boolean(),
  })
  .strict();
export const cleanupSchema = z
  .object({
    ownerToken: z.string().regex(/^[0-9a-f]{64}$/),
    status: z.literal("clean"),
  })
  .passthrough();
export const processMetadataSchema = z
  .object({
    groupCleanToken: z.string().regex(/^[0-9a-f]{64}$/),
    ownerToken: z.string().regex(/^[0-9a-f]{64}$/),
    pgid: z.number().int().positive(),
  })
  .passthrough();
export const groupCleanSchema = z
  .object({
    groupCleanToken: z.string().regex(/^[0-9a-f]{64}$/),
    ownerToken: z.string().regex(/^[0-9a-f]{64}$/),
    pgid: z.number().int().positive(),
    status: z.literal("group-empty"),
  })
  .passthrough();

export type RegisteredScenario = z.infer<typeof scenarioSchema>;
export type LiveScenario = Extract<RegisteredScenario, { readonly class: "live" }>;
export type ChildOutcome =
  | { readonly error: Error; readonly kind: "error" }
  | {
      readonly code: number | null;
      readonly kind: "exit";
      readonly signal: NodeJS.Signals | null;
    };
export type TrackedChild = {
  readonly abandon: () => void;
  readonly completion: Promise<ChildOutcome>;
  readonly isSettled: () => boolean;
  readonly label: string;
  readonly ownerNonce: string;
  readonly pid: number | undefined;
  readonly stderr: () => string;
  readonly stdout: () => string;
};
export type RunningJourney = {
  readonly pointer: string;
  readonly process: TrackedChild;
  readonly scenario: LiveScenario;
};
export type PoolEvent =
  | {
      readonly kind: "child";
      readonly outcome: ChildOutcome;
      readonly scenarioName: string;
    }
  | { readonly kind: "signal"; readonly signal: NodeJS.Signals };
export type AggregateEvent =
  | { readonly kind: "child"; readonly outcome: ChildOutcome }
  | { readonly kind: "signal"; readonly signal: NodeJS.Signals };

export const terminationGraceMilliseconds = 5_000;
export const processOwnershipInspectionTimeoutMilliseconds = 5_000;
const boundedChildTerminationSignalCount = 2;
export const boundedChildTerminationMaximumMilliseconds =
  (processOwnershipInspectionTimeoutMilliseconds +
    terminationGraceMilliseconds) *
  boundedChildTerminationSignalCount;
