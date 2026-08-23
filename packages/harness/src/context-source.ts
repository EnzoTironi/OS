import { createHash } from "node:crypto";
import { z } from "zod";
import type {
  CausalContext,
  DefinitionReferenceConfig,
  QueryCapability,
  QueryContext,
  TrustedAgentContext,
} from "./types.js";

const identifier = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/);
const digest = z.string().regex(/^[0-9a-f]{64}$/);

export const trustClassSchema = z.enum([
  "interaction",
  "preference",
  "knowledge",
  "world",
  "history",
]);
export type TrustClass = z.infer<typeof trustClassSchema>;

export const contextScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("tenant"), tenantId: identifier }).strict(),
  z
    .object({
      kind: z.literal("principal"),
      tenantId: identifier,
      principalId: identifier,
    })
    .strict(),
  z
    .object({
      kind: z.literal("account"),
      accountId: identifier,
      tenantId: identifier.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("session"),
      tenantId: identifier,
      sessionId: identifier,
      principalId: identifier,
    })
    .strict(),
]);
export type ContextScope = z.infer<typeof contextScopeSchema>;

export const attributionRefSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("interaction"),
      interactionId: identifier,
      semanticCorrelationKey: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("source"),
      sourceId: identifier,
      sourceRevision: identifier,
      contentDigest: digest,
    })
    .strict(),
  z
    .object({
      kind: z.literal("fragment"),
      fragmentId: digest,
      fragmentDigest: digest,
      sourceId: identifier,
      sourceRevision: identifier,
      contentDigest: digest,
    })
    .strict(),
  z
    .object({
      kind: z.literal("query"),
      resultDigest: digest,
      alias: identifier,
      definitionDigest: digest,
    })
    .strict(),
  z
    .object({
      kind: z.literal("explain"),
      explanationDigest: digest,
      operationId: identifier,
    })
    .strict(),
  z
    .object({
      kind: z.literal("preference"),
      preferenceId: identifier,
      key: z.string().min(1).max(200),
    })
    .strict(),
]);
export type AttributionRef = z.infer<typeof attributionRefSchema>;

export const retentionClassSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("interaction"),
      expiresAt: z.iso.datetime().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("preference"),
      expiresAt: z.iso.datetime().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("knowledge-source"),
      expiresAt: z.iso.datetime().optional(),
    })
    .strict(),
  z.object({ kind: z.literal("authority") }).strict(),
]);
export type RetentionClass = z.infer<typeof retentionClassSchema>;

export const rankingMetaSchema = z
  .object({
    score: z.number().optional(),
    rank: z.number().int().optional(),
    lexicalRank: z.number().int().nullable().optional(),
    vectorRank: z.number().int().nullable().optional(),
  })
  .strict();
export type RankingMeta = z.infer<typeof rankingMetaSchema>;

export const preferenceScopeSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("principal"),
      tenantId: identifier,
      principalId: identifier,
    })
    .strict(),
  z
    .object({
      kind: z.literal("account"),
      accountId: identifier,
      tenantId: identifier.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("tenant_presentation"),
      tenantId: identifier,
    })
    .strict(),
]);
export type PreferenceScope = z.infer<typeof preferenceScopeSchema>;

/** Sealed preference payloads. No tenant_policy variant. */
export const preferencePayloadSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("quiet_hours"),
      timezone: z.string().min(1),
      windows: z.array(
        z
          .object({
            start: z.string().min(1),
            end: z.string().min(1),
          })
          .strict(),
      ),
    })
    .strict(),
  z
    .object({
      type: z.literal("presentation"),
      density: z.enum(["compact", "comfortable"]),
      cardsPreferred: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("notification"),
      channel: z.enum(["dm", "same_thread", "mute"]),
    })
    .strict(),
  z
    .object({
      type: z.literal("remember_this"),
      scope: preferenceScopeSchema,
      text: z.string().min(1).max(16_000),
    })
    .strict(),
]);
export type PreferencePayload = z.infer<typeof preferencePayloadSchema>;

export const sourceAdmissionViewSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("candidate") }).strict(),
  z.object({ kind: z.literal("ingested") }).strict(),
  z
    .object({
      kind: z.literal("admitted"),
      claimId: identifier,
      admittedAt: z.iso.datetime(),
    })
    .strict(),
]);
export type SourceAdmissionView = z.infer<typeof sourceAdmissionViewSchema>;

export const transcriptionDerivationSchema = z
  .object({
    originalAudioDigest: digest,
    modelId: z.string().min(1),
    modelRevision: z.string().min(1),
    parserVersionDigest: digest,
    transcribedAt: z.iso.datetime(),
  })
  .strict();
export type TranscriptionDerivation = z.infer<
  typeof transcriptionDerivationSchema
>;

export const sourceAdmissionStateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("interaction-only") }).strict(),
  z
    .object({
      kind: z.literal("ingested"),
      sourceId: identifier,
      sourceRevision: identifier,
      contentDigest: digest,
      ingestedAt: z.iso.datetime(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("admitted"),
      sourceId: identifier,
      sourceRevision: identifier,
      contentDigest: digest,
      claimId: identifier,
      admittedAt: z.iso.datetime(),
      admittedByPrincipalId: identifier,
      worldProvenanceRef: z.string().min(1),
      sourceRefsPresent: z.boolean().optional(),
    })
    .strict(),
]);
export type SourceAdmissionState = z.infer<typeof sourceAdmissionStateSchema>;

const interactionPayloadSchema = z
  .object({
    trustClass: z.literal("interaction"),
    goal: z.string().optional(),
    unresolvedQuestions: z.array(z.string()).optional(),
    preferredWorkspaceHint: z.string().optional(),
    recentRefs: z.array(
      z
        .object({
          interactionId: identifier,
          summary: z.string(),
        })
        .strict(),
    ),
  })
  .strict();

const preferencePayloadRecordSchema = z
  .object({
    trustClass: z.literal("preference"),
    key: z.string().min(1).max(200),
    value: preferencePayloadSchema,
    preferenceScope: preferenceScopeSchema,
  })
  .strict();

const knowledgePayloadSchema = z
  .object({
    trustClass: z.literal("knowledge"),
    text: z.string(),
    mediaType: z.string().optional(),
    derivation: transcriptionDerivationSchema.optional(),
    admission: sourceAdmissionViewSchema,
    indexVersion: z.string().optional(),
    parserName: z.string().optional(),
    parserVersionDigest: digest.optional(),
  })
  .strict();

const worldPayloadSchema = z
  .object({
    trustClass: z.literal("world"),
    query: z.custom<QueryContext>(),
  })
  .strict();

const historyPayloadSchema = z
  .object({
    trustClass: z.literal("history"),
    history: z.custom<CausalContext>(),
  })
  .strict();

export const contextPayloadSchema = z.discriminatedUnion("trustClass", [
  interactionPayloadSchema,
  preferencePayloadRecordSchema,
  knowledgePayloadSchema,
  worldPayloadSchema,
  historyPayloadSchema,
]);
export type ContextPayload = z.infer<typeof contextPayloadSchema>;

export type RetrievedContextRecord = {
  readonly recordId: string;
  readonly trustClass: TrustClass;
  readonly scope: ContextScope;
  readonly attribution: AttributionRef;
  readonly retention: RetentionClass;
  readonly ranking?: RankingMeta;
  readonly payload: ContextPayload;
};

export type ContextPurpose =
  | {
      readonly kind: "planning";
      readonly sessionId: string;
      readonly taskId: string;
      readonly knowledgeQuery?: string;
      readonly explainOperationId?: string;
      readonly queryCapabilities?: readonly QueryCapability[];
    }
  | {
      readonly kind: "continuity";
      readonly sessionId: string;
    };

export type ContextAudience =
  | { readonly kind: "enterprise"; readonly tenantId: string }
  | { readonly kind: "personal"; readonly accountId: string }
  | {
      readonly kind: "cross-workspace";
      readonly capabilityId: string;
      readonly tenantId: string;
      readonly accountId: string;
    };

export type ContextRetrieveRequest = {
  readonly trustedContext: TrustedAgentContext;
  readonly purpose: ContextPurpose;
  readonly audience: ContextAudience;
};

export type ContextSourceFailureCode =
  | "unavailable"
  | "corrupt_attachment"
  | "transcription_failed"
  | "preference_conflict"
  | "deleted_interaction_ref"
  | "wrong_tenant"
  | "cross_workspace_denied";

export type ContextSourceFailure = {
  readonly sourceId: string;
  readonly code: ContextSourceFailureCode;
  readonly observation: string;
};

export type AssembledContext = {
  readonly assembledAt: string;
  readonly tenantId: string;
  readonly purpose: ContextPurpose;
  readonly records: readonly RetrievedContextRecord[];
  readonly failures: readonly ContextSourceFailure[];
  readonly digest: string;
};

export interface ContextSource {
  readonly id: string;
  retrieve(
    request: ContextRetrieveRequest,
  ): Promise<readonly RetrievedContextRecord[]>;
}

export type EvidenceAdmitFrom =
  | { readonly kind: "interaction"; readonly interactionId: string }
  | {
      readonly kind: "source";
      readonly sourceId: string;
      readonly sourceRevision: string;
      readonly contentDigest: string;
    }
  | {
      readonly kind: "voice_transcript";
      readonly interactionId: string;
      readonly audioDigest: string;
      readonly transcriptDigest: string;
      readonly parserName: string;
      readonly parserVersionDigest: string;
    };

export type EvidenceAdmitCommand = {
  readonly tenantId: string;
  readonly principalId: string;
  readonly from: EvidenceAdmitFrom;
  readonly claimId: string;
  readonly definition: DefinitionReferenceConfig;
  readonly entityId: string;
  readonly relationId: string;
  readonly validAt: string;
  readonly valueText?: string;
};

function recordIdFor(input: {
  readonly trustClass: TrustClass;
  readonly attribution: AttributionRef;
  readonly scope: ContextScope;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        attribution: input.attribution,
        scope: input.scope,
        trustClass: input.trustClass,
      }),
    )
    .digest("hex");
}

export function createRetrievedContextRecord(input: {
  readonly trustClass: TrustClass;
  readonly scope: ContextScope;
  readonly attribution: AttributionRef;
  readonly retention: RetentionClass;
  readonly ranking?: RankingMeta;
  readonly payload: ContextPayload;
}): RetrievedContextRecord {
  const trustClass = trustClassSchema.parse(input.trustClass);
  const scope = contextScopeSchema.parse(input.scope);
  const attribution = attributionRefSchema.parse(input.attribution);
  const retention = retentionClassSchema.parse(input.retention);
  const payload = contextPayloadSchema.parse(input.payload);
  if (payload.trustClass !== trustClass) {
    throw new Error(
      `trustClass mismatch: record=${trustClass} payload=${payload.trustClass}`,
    );
  }
  if (
    payload.trustClass === "knowledge" &&
    payload.derivation !== undefined &&
    payload.derivation.originalAudioDigest ===
      createHash("sha256").update(payload.text).digest("hex")
  ) {
    throw new Error(
      "transcription derivation requires originalAudioDigest ≠ transcript digest",
    );
  }
  const ranking =
    input.ranking === undefined
      ? undefined
      : rankingMetaSchema.parse(input.ranking);
  return {
    recordId: recordIdFor({ trustClass, attribution, scope }),
    trustClass,
    scope,
    attribution,
    retention,
    ...(ranking === undefined ? {} : { ranking }),
    payload,
  };
}

export function assembledContextDigest(
  records: readonly RetrievedContextRecord[],
): string {
  return createHash("sha256")
    .update(
      JSON.stringify(
        records.map((record) => ({
          attribution: record.attribution,
          recordId: record.recordId,
          trustClass: record.trustClass,
        })),
      ),
    )
    .digest("hex");
}

export function projectAssembledForModel(assembled: AssembledContext): {
  readonly interaction: unknown[];
  readonly preference: unknown[];
  readonly knowledge: unknown[];
  readonly semanticWorld: unknown[];
  readonly causalHistory: unknown[];
} {
  const interaction: unknown[] = [];
  const preference: unknown[] = [];
  const knowledge: unknown[] = [];
  const semanticWorld: unknown[] = [];
  const causalHistory: unknown[] = [];
  for (const record of assembled.records) {
    const projected = {
      attribution: record.attribution,
      payload: redactIdentifiers(record.payload),
      ranking: record.ranking,
      recordId: record.recordId,
      retention: record.retention,
      scopeKind: record.scope.kind,
      trustClass: record.trustClass,
    };
    switch (record.trustClass) {
      case "interaction":
        interaction.push(projected);
        break;
      case "preference":
        preference.push(projected);
        break;
      case "knowledge":
        knowledge.push(projected);
        break;
      case "world":
        semanticWorld.push(projected);
        break;
      case "history":
        causalHistory.push(projected);
        break;
      default: {
        const exhaustive: never = record.trustClass;
        return exhaustive;
      }
    }
  }
  return { interaction, preference, knowledge, semanticWorld, causalHistory };
}

function redactIdentifiers(payload: ContextPayload): unknown {
  switch (payload.trustClass) {
    case "world":
      return {
        trustClass: "world",
        query: {
          alias: payload.query.alias,
          resultDigest: payload.query.resultDigest,
          selection: payload.query.selection,
          validAt: payload.query.validAt,
          values: payload.query.values,
        },
      };
    case "history":
      return {
        trustClass: "history",
        history: {
          actionId: payload.history.actionId,
          commitSequence: payload.history.commitSequence,
          complete: payload.history.complete,
          explanationDigest: payload.history.explanationDigest,
          operationId: payload.history.operationId,
        },
      };
    default:
      return payload;
  }
}

export function audienceAllowsScope(
  audience: ContextAudience,
  scope: ContextScope,
): { readonly ok: true } | { readonly ok: false; readonly code: ContextSourceFailureCode } {
  switch (audience.kind) {
    case "enterprise":
      if (scope.kind === "account" && scope.tenantId === undefined) {
        return { ok: false, code: "cross_workspace_denied" };
      }
      if ("tenantId" in scope && scope.tenantId !== audience.tenantId) {
        return { ok: false, code: "wrong_tenant" };
      }
      return { ok: true };
    case "personal":
      if (scope.kind === "account" && scope.accountId === audience.accountId) {
        return { ok: true };
      }
      if (scope.kind === "account") {
        return { ok: false, code: "cross_workspace_denied" };
      }
      return { ok: false, code: "cross_workspace_denied" };
    case "cross-workspace":
      if ("tenantId" in scope && scope.tenantId !== undefined && scope.tenantId !== audience.tenantId) {
        return { ok: false, code: "wrong_tenant" };
      }
      return { ok: true };
    default: {
      const exhaustive: never = audience;
      return exhaustive;
    }
  }
}
