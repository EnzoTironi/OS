import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const definitionSchema = z
  .object({
    actions: z.array(z.object({ id: z.string() }).passthrough()),
    definitionId: z.string(),
    revision: z.number().int().positive(),
  })
  .passthrough();

const compiledDefinitionSchema = z
  .object({
    canonicalJson: z.string(),
    definition: definitionSchema,
    digest: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

export type CompiledDefinition = z.infer<typeof compiledDefinitionSchema>;

export async function loadCanonicalDefinition(
  filePath: string,
): Promise<CompiledDefinition> {
  const canonicalJson = (await readFile(filePath, "utf8")).trimEnd();
  const digest = createHash("sha256").update(canonicalJson).digest("hex");
  return compiledDefinitionSchema.parse({
    canonicalJson,
    definition: definitionSchema.parse(JSON.parse(canonicalJson)),
    digest,
  });
}

export function loadCommercialLake(
  repositoryRoot: string,
): Promise<CompiledDefinition> {
  return loadCanonicalDefinition(
    path.join(
      repositoryRoot,
      "testdata",
      "lakes",
      "commercial.canonical.json",
    ),
  );
}
