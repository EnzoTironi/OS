import { createHash } from "node:crypto";
import type { InteractionContextStore } from "./context-interaction.js";
import type { KnowledgeAdmissionIndex } from "./context-knowledge.js";
import {
  sourceAdmissionStateSchema,
  type EvidenceAdmitCommand,
  type SourceAdmissionState,
} from "./context-source.js";

export type WorldEvidenceRecorder = (input: {
  readonly tenantId: string;
  readonly principalId: string;
  readonly claimId: string;
  readonly definition: EvidenceAdmitCommand["definition"];
  readonly entityId: string;
  readonly relationId: string;
  readonly validAt: string;
  readonly sourceId: string;
  readonly sourceDigest: string;
  readonly sourceRef: string;
  readonly valueText?: string;
}) => Promise<void>;

export interface EvidenceAdmission {
  admit(command: EvidenceAdmitCommand): Promise<SourceAdmissionState>;
}

export function createEvidenceAdmission(deps: {
  readonly interactions: InteractionContextStore;
  readonly knowledgeAdmissions: KnowledgeAdmissionIndex;
  readonly recordEvidence: WorldEvidenceRecorder;
}): EvidenceAdmission {
  return {
    async admit(command) {
      const admittedAt = new Date().toISOString();
      const resolved = await resolveFrom(command, deps.interactions);
      const worldProvenanceRef = `urn:zoen:admit:${command.claimId}:${resolved.contentDigest}`;
      const state = sourceAdmissionStateSchema.parse({
        kind: "admitted",
        sourceId: resolved.sourceId,
        sourceRevision: resolved.sourceRevision,
        contentDigest: resolved.contentDigest,
        claimId: command.claimId,
        admittedAt,
        admittedByPrincipalId: command.principalId,
        worldProvenanceRef,
        sourceRefsPresent: resolved.sourceRefsPresent,
      });
      await deps.recordEvidence({
        tenantId: command.tenantId,
        principalId: command.principalId,
        claimId: command.claimId,
        definition: command.definition,
        entityId: command.entityId,
        relationId: command.relationId,
        validAt: command.validAt,
        sourceId: resolved.sourceId,
        sourceDigest: resolved.contentDigest,
        sourceRef: worldProvenanceRef,
        valueText: command.valueText,
      });
      await deps.knowledgeAdmissions.put({
        tenantId: command.tenantId,
        state,
      });
      if (resolved.interactionId !== undefined) {
        await deps.interactions.setAdmission(resolved.interactionId, state);
      }
      return state;
    },
  };
}

async function resolveFrom(
  command: EvidenceAdmitCommand,
  interactions: InteractionContextStore,
): Promise<{
  readonly sourceId: string;
  readonly sourceRevision: string;
  readonly contentDigest: string;
  readonly interactionId?: string;
  readonly sourceRefsPresent: boolean;
}> {
  switch (command.from.kind) {
    case "source":
      return {
        sourceId: command.from.sourceId,
        sourceRevision: command.from.sourceRevision,
        contentDigest: command.from.contentDigest,
        sourceRefsPresent: true,
      };
    case "interaction": {
      const stored = await interactions.get(command.from.interactionId);
      if (stored === undefined) {
        throw new Error(`unknown interaction ${command.from.interactionId}`);
      }
      if (stored.admission.kind === "admitted") {
        return {
          sourceId: stored.admission.sourceId,
          sourceRevision: stored.admission.sourceRevision,
          contentDigest: stored.admission.contentDigest,
          interactionId: command.from.interactionId,
          sourceRefsPresent: stored.present,
        };
      }
      if (stored.admission.kind === "ingested") {
        return {
          sourceId: stored.admission.sourceId,
          sourceRevision: stored.admission.sourceRevision,
          contentDigest: stored.admission.contentDigest,
          interactionId: command.from.interactionId,
          sourceRefsPresent: stored.present,
        };
      }
      const contentDigest = hashText(stored.summary);
      return {
        sourceId: `interaction.${command.from.interactionId}`,
        sourceRevision: "1",
        contentDigest,
        interactionId: command.from.interactionId,
        sourceRefsPresent: stored.present,
      };
    }
    case "voice_transcript": {
      if (command.from.audioDigest === command.from.transcriptDigest) {
        throw new Error("audioDigest must differ from transcriptDigest");
      }
      const stored = await interactions.get(command.from.interactionId);
      return {
        sourceId: `voice.${command.from.interactionId}`,
        sourceRevision: "1",
        contentDigest: command.from.transcriptDigest,
        interactionId: command.from.interactionId,
        sourceRefsPresent: stored?.present ?? true,
      };
    }
    default: {
      const exhaustive: never = command.from;
      return exhaustive;
    }
  }
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
