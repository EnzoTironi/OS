import path from "node:path";
import { z } from "zod";
import type { JourneyRunContext } from "../journey-run-context.js";
import { journeyPortSlotCount } from "../journey-runtime-layout.js";

export const nonceSchema = z.string().regex(/^[0-9a-f]{64}$/);
export const runtimeProofBarrierStageSchema = z.enum([
  "claim-ready",
  "logical-run-active",
]);
export const sourceShaSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/);
export const artifactPathSchema = z
  .string()
  .min(1)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.includes("\\") &&
      value
        .split("/")
        .every((segment) => segment !== "" && segment !== "." && segment !== ".."),
    "must be a repository-relative POSIX path",
  );
export const preparedArtifactSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("bundle"),
      path: artifactPathSchema,
      sha256: z.string().regex(/^[0-9a-f]{64}$/),
    })
    .strict(),
  z
    .object({
      executable: z.literal(true),
      kind: z.literal("launchable"),
      path: artifactPathSchema,
      sha256: z.string().regex(/^[0-9a-f]{64}$/),
    })
    .strict(),
]);
export const preparedArtifactsSchema = z
  .array(preparedArtifactSchema)
  .min(1)
  .superRefine((artifacts, context) => {
    const paths = artifacts.map((artifact) => artifact.path);
    const sorted = [...paths].sort((left, right) =>
      left.localeCompare(right, "en"),
    );
    if (
      new Set(paths).size !== paths.length ||
      paths.some((candidate, index) => candidate !== sorted[index])
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "prepared artifact paths must be unique and sorted",
      });
    }
  });
export const idSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const preparedBuildSchema = z
  .object({
    artifacts: preparedArtifactsSchema,
    buildIdentity: z.string().regex(/^[0-9a-f]{64}$/),
    preparedAt: z.string().datetime(),
    sourceSha: sourceShaSchema,
    version: z.literal(2),
  })
  .strict();
export const preparedArtifactSnapshotSchema = preparedBuildSchema.omit({
  preparedAt: true,
});
export const leaseSchema = z
  .object({
    attempt: z.number().int().positive(),
    composeProject: z.string().min(1).nullable(),
    contextFile: z.string().min(1),
    createdAt: z.string().datetime(),
    exclusive: z.boolean(),
    ownerGuardianPid: z.number().int().positive(),
    ownerPid: z.number().int().positive(),
    ownerPgid: z.number().int().positive(),
    ownerNonce: nonceSchema,
    ownerToken: nonceSchema,
    repository: z.string().min(1),
    runId: idSchema,
    scenario: idSchema,
    slot: z.number().int().min(0).max(journeyPortSlotCount - 1),
    suiteId: idSchema,
    version: z.literal(2),
  })
  .strict();
export const lockOwnerSchema = z
  .object({
    ownerNonce: nonceSchema,
    ownerPid: z.number().int().positive(),
    token: nonceSchema,
    version: z.literal(1),
  })
  .strict();
export const runningProcessMetadataSchema = z
  .object({
    authorityNonce: nonceSchema,
    groupCleanToken: nonceSchema,
    ownerToken: nonceSchema,
    pgid: z.number().int().positive(),
    pid: z.number().int().positive(),
    runnerPath: z.string().min(1),
    startedAt: z.string().datetime(),
    state: z.literal("running"),
    version: z.literal(1),
  })
  .strict();
export const exitedProcessMetadataSchema = runningProcessMetadataSchema
  .omit({ state: true })
  .extend({
    exitCode: z.number().int().nullable(),
    exitedAt: z.string().datetime(),
    state: z.literal("exited"),
  })
  .strict();
export const processMetadataSchema = z.discriminatedUnion("state", [
  runningProcessMetadataSchema,
  exitedProcessMetadataSchema,
]);
export const groupCleanSchema = z
  .object({
    cleanedAt: z.string().datetime(),
    groupCleanToken: nonceSchema,
    ownerToken: nonceSchema,
    pgid: z.number().int().positive(),
    status: z.literal("group-empty"),
    version: z.literal(1),
  })
  .strict();
export const preparationOwnerSchema = z
  .object({
    createdAt: z.string().datetime(),
    ownerNonce: nonceSchema,
    ownerPgid: z.number().int().positive(),
    ownerPid: z.number().int().positive(),
    state: z.enum(["pending", "active"]),
    version: z.literal(1),
  })
  .strict();
export const bootstrapReaderSchema = z
  .object({
    createdAt: z.string().datetime(),
    guardianPid: z.number().int().positive().nullable(),
    kind: z.enum(["journey", "suite"]),
    ownerNonce: nonceSchema,
    ownerPgid: z.number().int().positive(),
    ownerPid: z.number().int().positive(),
    parentToken: nonceSchema.nullable(),
    token: nonceSchema,
    version: z.literal(1),
  })
  .strict();
export const runResultSchema = z
  .object({
    buildIdentity: z.string().regex(/^[0-9a-f]{64}$/),
    finishedAt: z.string().datetime(),
    ownerToken: z.string().regex(/^[0-9a-f]{64}$/),
    sourceSha: sourceShaSchema,
    status: z.enum(["passed", "failed"]),
    version: z.literal(1),
  })
  .strict();
export const cleanupResultSchema = z
  .object({
    cleanedAt: z.string().datetime(),
    ownerToken: z.string().regex(/^[0-9a-f]{64}$/),
    status: z.enum(["resources-clean", "clean"]),
    version: z.literal(1),
  })
  .strict();

export type Lease = z.infer<typeof leaseSchema>;
export type PreparedBuild = z.infer<typeof preparedBuildSchema>;
export type RuntimeProofBarrierStage = z.infer<
  typeof runtimeProofBarrierStageSchema
>;
export type OwnedLock = {
  readonly directory: string;
  readonly token: string;
};
export type CleanupClaim = {
  readonly context: JourneyRunContext;
  readonly directory: string;
  readonly lease: Lease;
  readonly phase: "reaping" | "release";
  readonly token: string;
};

export type ProcessOwnership =
  | { readonly kind: "foreign" }
  | { readonly kind: "missing" }
  | { readonly kind: "owned" }
  | { readonly kind: "uncertain"; readonly reason: string };
