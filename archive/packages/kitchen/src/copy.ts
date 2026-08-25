import { compilePack, definePack, ontologyDep } from "../../pack/src/index.js";
import { authorityDigest } from "./authority-digest.js";
import type { CopyProposal, KitchenCandidate } from "./types.js";

/**
 * Offline / optional LLM copy proposal. Never carries authority fields.
 * Type CopyProposal has no dependency or permission slots.
 */
export function proposeCopy(input: {
  readonly candidateDigest: string;
  readonly title?: string;
  readonly summary?: string;
  readonly onboardingQuestions?: CopyProposal["onboardingQuestions"];
}): CopyProposal {
  return {
    forAuthorityDigest: input.candidateDigest,
    title: input.title ?? "Kitchen Pack",
    summary: input.summary ?? "Extracted working configuration.",
    onboardingQuestions: input.onboardingQuestions ?? [],
  };
}

/**
 * Apply presentation copy. PackDigest may change; AuthorityFacts stay sealed.
 * Rejects proposals that try to smuggle authority-shaped keys.
 */
export function applyCopy(
  candidate: KitchenCandidate,
  proposal: CopyProposal,
): KitchenCandidate {
  assertCopyProposalShape(proposal);
  const sealed = authorityDigest(candidate.authority);
  if (proposal.forAuthorityDigest !== sealed) {
    throw new Error(
      `copy pinned to ${proposal.forAuthorityDigest}, authority is ${sealed}`,
    );
  }

  const requirementIds = new Set(
    candidate.authority.capabilities.map((capability) => capability.id),
  );
  for (const question of proposal.onboardingQuestions) {
    if (
      question.relatesToRequirementId !== undefined &&
      !requirementIds.has(question.relatesToRequirementId)
    ) {
      throw new Error(
        `onboarding question ${question.id} references unknown capability ${question.relatesToRequirementId}`,
      );
    }
  }

  const authored = definePack({
    id: candidate.authority.packId,
    version: candidate.authority.version,
    publisher: candidate.authority.publisher,
    presentation: {
      title: proposal.title,
      summary: proposal.summary,
    },
    ontology: candidate.authority.ontology.map((dependency) =>
      ontologyDep({
        canonicalJson: dependency.canonicalJson,
        definitionId: dependency.definitionId,
        digest: dependency.digest,
      }),
    ),
    capabilities: candidate.authority.capabilities,
    firstSuccess: candidate.authority.firstSuccess,
  });
  const compiled = compilePack(authored);

  if (authorityDigest(candidate.authority) !== sealed) {
    throw new Error("presentation copy altered authority facts; refusing apply");
  }

  return {
    ...candidate,
    compiled,
    copy: proposal,
  };
}

const AUTHORITY_SMUGGLE_KEYS = [
  "ontologyDependencies",
  "integrationRequirements",
  "firstSuccessContract",
  "capabilities",
  "ontology",
  "packId",
  "version",
  "publisher",
] as const;

export function assertCopyProposalShape(value: unknown): asserts value is CopyProposal {
  if (value === null || typeof value !== "object") {
    throw new Error("CopyProposal must be an object");
  }
  const record = value as Record<string, unknown>;
  for (const key of AUTHORITY_SMUGGLE_KEYS) {
    if (key in record) {
      throw new Error(`CopyProposal must not include authority field ${key}`);
    }
  }
  if (typeof record.forAuthorityDigest !== "string") {
    throw new Error("CopyProposal.forAuthorityDigest required");
  }
  if (typeof record.title !== "string" || typeof record.summary !== "string") {
    throw new Error("CopyProposal title/summary required");
  }
  if (!Array.isArray(record.onboardingQuestions)) {
    throw new Error("CopyProposal.onboardingQuestions required");
  }
}
