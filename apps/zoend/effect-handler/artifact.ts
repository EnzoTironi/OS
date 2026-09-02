import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

export const ZOEN_EFFECT_SERVICE_NAME = "ZoenEffect";
export const ZOEN_EFFECT_HANDLER_NAME = "execute";
export const ZOEN_EFFECT_OWNER_METADATA_KEY = "zoen.owner";
export const ZOEN_EFFECT_ARTIFACT_METADATA_KEY = "zoen.artifact";
export const ZOEN_EFFECT_OWNER = "ontology";
export const EFFECT_HANDLER_ARTIFACT_FILENAME = "effect-handler-artifact.json";

const artifactRevisionSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
const artifactManifestSchema = z
  .object({
    revision: artifactRevisionSchema,
    schemaVersion: z.literal(1),
  })
  .strict();

export type EffectHandlerArtifact = z.infer<typeof artifactManifestSchema>;

export function loadEffectHandlerArtifact(): EffectHandlerArtifact {
  const manifestUrl = new URL(
    EFFECT_HANDLER_ARTIFACT_FILENAME,
    import.meta.url
  );
  const manifestPath = fileURLToPath(manifestUrl);
  let descriptor: number | undefined;
  try {
    descriptor = openSync(manifestPath, constants.O_NOFOLLOW);
    const status = fstatSync(descriptor);
    if (!status.isFile()) {
      throw new Error("effect handler artifact manifest is not a regular file");
    }
    if (status.mode % 0o1000 !== 0o444) {
      throw new Error("effect handler artifact manifest mode must be 0444");
    }
    const document: unknown = JSON.parse(readFileSync(descriptor, "utf8"));
    const parsed = artifactManifestSchema.safeParse(document);
    if (!parsed.success) {
      throw new Error("effect handler artifact manifest is malformed");
    }
    return parsed.data;
  } catch (error: unknown) {
    if (error instanceof Error && error.message.startsWith("effect handler")) {
      throw error;
    }
    throw new Error("effect handler artifact manifest cannot be read", {
      cause: error,
    });
  } finally {
    if (descriptor !== undefined) {
      closeSync(descriptor);
    }
  }
}

export function effectHandlerMetadata(
  artifact: EffectHandlerArtifact
): Record<string, string> {
  return {
    [ZOEN_EFFECT_ARTIFACT_METADATA_KEY]: artifact.revision,
    [ZOEN_EFFECT_OWNER_METADATA_KEY]: ZOEN_EFFECT_OWNER,
  };
}
