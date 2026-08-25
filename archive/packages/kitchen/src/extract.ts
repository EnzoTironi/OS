import { compilePack, definePack, ontologyDep } from "../../pack/src/index.js";
import type { FirstSuccessInput } from "../../pack/src/compiler.js";
import { authorityDigest } from "./authority-digest.js";
import { deriveCapabilities, selectFirstSuccess } from "./derive.js";
import { synthesizeTests } from "./tests.js";
import type {
  AuthorityFacts,
  ExtractionTrace,
  KitchenCandidate,
  WorkingSetSnapshot,
} from "./types.js";

export type ExtractCandidateInput = {
  readonly snapshot: WorkingSetSnapshot;
  readonly packId: string;
  readonly version: string;
  readonly publisher: { readonly id: string; readonly displayName: string };
  readonly definitionAllowlist?: readonly string[];
  readonly firstSuccessHint?: FirstSuccessInput["outcome"];
  readonly firstSuccessContractId?: string;
  readonly presentation?: { readonly title: string; readonly summary: string };
};

export function extractCandidate(input: ExtractCandidateInput): KitchenCandidate {
  if (input.version === "latest" || input.version.length === 0) {
    throw new Error(`invalid pack version: ${input.version}`);
  }

  const allow = input.definitionAllowlist
    ? new Set(input.definitionAllowlist)
    : undefined;
  const omitted: Array<ExtractionTrace["omitted"][number]> = [];
  const selected = input.snapshot.activeDefinitions.filter((definition) => {
    if (allow !== undefined && !allow.has(definition.definitionId)) {
      omitted.push({
        kind: "tenant_only_dependency",
        ref: definition.definitionId,
        reason: "not in definitionAllowlist",
      });
      return false;
    }
    if (definition.digest.length !== 64) {
      omitted.push({
        kind: "unpinned_artifact",
        ref: definition.definitionId,
        reason: "digest not sha256 hex",
      });
      return false;
    }
    return true;
  });

  if (selected.length === 0) {
    throw new Error("extractCandidate requires at least one active definition");
  }

  const filteredSnapshot: WorkingSetSnapshot = {
    ...input.snapshot,
    activeDefinitions: selected,
  };

  const capabilities = deriveCapabilities(filteredSnapshot);
  const { firstSuccess, reason } = selectFirstSuccess({
    snapshot: filteredSnapshot,
    hint: input.firstSuccessHint,
    contractId: input.firstSuccessContractId,
  });

  const authority: AuthorityFacts = {
    packId: input.packId,
    version: input.version,
    publisher: input.publisher,
    ontology: selected.map((definition) => ({
      definitionId: definition.definitionId,
      digest: definition.digest,
      canonicalJson: definition.canonicalJson,
    })),
    capabilities,
    firstSuccess,
  };

  const presentation = input.presentation ?? {
    title: input.packId,
    summary: `Kitchen extract of ${input.packId}`,
  };

  const authored = definePack({
    id: authority.packId,
    version: authority.version,
    publisher: authority.publisher,
    presentation,
    ontology: authority.ontology.map((dependency) =>
      ontologyDep({
        canonicalJson: dependency.canonicalJson,
        definitionId: dependency.definitionId,
        digest: dependency.digest,
      }),
    ),
    capabilities: authority.capabilities,
    firstSuccess: authority.firstSuccess,
  });
  const compiled = compilePack(authored);

  const extractionTrace: ExtractionTrace = {
    sourceTenantId: input.snapshot.tenantId,
    definitionPins: selected.map((definition) => ({
      definitionId: definition.definitionId,
      digest: definition.digest,
    })),
    omitted,
    firstSuccessSelection: {
      contractId: firstSuccess.id,
      outcome: firstSuccess.outcome,
      reason,
    },
  };

  const tests = synthesizeTests({
    authority,
    compiledDigest: compiled.digest,
    authorityFactsDigest: authorityDigest(authority),
  });

  return {
    authority,
    compiled,
    copy: null,
    tests,
    extractionTrace,
  };
}
