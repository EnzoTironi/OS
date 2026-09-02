import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const idSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const sourceShaSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/);

export const publishedSuiteSchema = z
  .object({
    buildIdentity: z.string().regex(/^[0-9a-f]{64}$/),
    completedAt: z.string().datetime(),
    runs: z.array(
      z
        .object({
          attempt: z.number().int().positive(),
          runId: idSchema,
          scenario: idSchema,
        })
        .strict(),
    ),
    sourceSha: sourceShaSchema,
    status: z.literal("complete"),
    suiteId: idSchema,
    version: z.literal(1),
  })
  .strict();

export const publishedEvidencePointerSchema = z
  .object({
    buildIdentity: z.string().regex(/^[0-9a-f]{64}$/),
    completedAt: z.string().datetime(),
    generation: z.string().regex(/^generations\/[a-z0-9-]+-[0-9a-f]{32}$/),
    sourceSha: sourceShaSchema,
    suiteId: idSchema,
    version: z.literal(1),
  })
  .strict();

export type PublishedEvidence = {
  readonly root: string;
  readonly suite: z.infer<typeof publishedSuiteSchema>;
};

/** Resolve one immutable evidence generation from one atomic pointer read. */
export function publishedEvidence(repositoryRoot: string): PublishedEvidence {
  const artifactsRoot = path.join(repositoryRoot, "artifacts");
  const pointerPath = path.join(artifactsRoot, "current.json");
  const pointer = publishedEvidencePointerSchema.parse(
    JSON.parse(readFileSync(pointerPath, "utf8")),
  );
  const generationsRoot = path.join(artifactsRoot, "generations");
  const root = path.resolve(artifactsRoot, pointer.generation);
  const relative = path.relative(generationsRoot, root);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`published evidence pointer escapes ${generationsRoot}`);
  }
  const suite = publishedSuiteSchema.parse(
    JSON.parse(readFileSync(path.join(root, "suite.json"), "utf8")),
  );
  if (
    suite.buildIdentity !== pointer.buildIdentity ||
    suite.completedAt !== pointer.completedAt ||
    suite.sourceSha !== pointer.sourceSha ||
    suite.suiteId !== pointer.suiteId
  ) {
    throw new Error(`published evidence pointer and suite manifest disagree`);
  }
  return { root, suite };
}
