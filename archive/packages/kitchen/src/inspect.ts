import type { CapabilityFact, WorkingSetSnapshot } from "./types.js";

const FORBIDDEN_INSPECT_SOURCES = [
  "semantic_claims",
  "oauth_tokens",
  "credentials",
  "conversation_transcripts",
  "attention_threads",
  "channel_messages",
] as const;

export type ActiveDefinitionRow = {
  readonly definitionId: string;
  readonly digest: string;
  readonly revision: string;
  readonly canonicalJson: string;
};

/**
 * Build a WorkingSetSnapshot from active definition artifacts only.
 * Callers must not join semantic claim / secret / conversation tables.
 */
export function buildWorkingSetSnapshot(input: {
  readonly tenantId: string;
  readonly capturedAtMicros?: number;
  readonly activeDefinitions: readonly ActiveDefinitionRow[];
  readonly capabilityFacts?: readonly CapabilityFact[];
  readonly surfaceCandidates?: WorkingSetSnapshot["surfaceCandidates"];
  readonly inspectSources?: readonly string[];
}): WorkingSetSnapshot {
  const sources = input.inspectSources ?? ["active_definition_revisions"];
  const forbidden = sources.filter((source) =>
    FORBIDDEN_INSPECT_SOURCES.some(
      (name) => source === name || source.includes(name),
    ),
  );
  if (forbidden.length > 0) {
    throw new Error(
      `kitchen inspect refused forbidden sources: ${forbidden.join(",")}`,
    );
  }

  for (const definition of input.activeDefinitions) {
    if (definition.digest.length !== 64 || !/^[0-9a-f]+$/.test(definition.digest)) {
      throw new Error(`unpinned artifact digest for ${definition.definitionId}`);
    }
    if (definition.digest === "latest" || definition.revision === "latest") {
      throw new Error(`mutable tag refused for ${definition.definitionId}`);
    }
  }

  return {
    tenantId: input.tenantId,
    capturedAtMicros: input.capturedAtMicros ?? Date.now() * 1000,
    activeDefinitions: input.activeDefinitions.map((definition) => ({
      definitionId: definition.definitionId,
      digest: definition.digest,
      revision: definition.revision,
      canonicalJson: definition.canonicalJson,
    })),
    capabilityFacts: input.capabilityFacts ?? [],
    surfaceCandidates: input.surfaceCandidates ?? [],
  };
}

export function assertInspectSourcesAllowed(
  sources: readonly string[],
): void {
  buildWorkingSetSnapshot({
    tenantId: "tenant.probe",
    activeDefinitions: [],
    inspectSources: sources,
  });
}
