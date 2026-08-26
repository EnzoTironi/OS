import { z } from "zod";
import {
  canonicalizeJsonBytes,
  sha256Hex,
  type JcsError,
} from "./jcs.js";

/**
 * Trust classes on a speaker conversation document.
 * Distinct classes; never a `memory_text` singleton.
 */
export const CONVERSATION_TRUST_CLASSES = [
  "instruction",
  "interaction",
  "preference",
  "knowledge",
  "world",
  "history",
  "personal_memory",
] as const;

export type ConversationTrustClass = (typeof CONVERSATION_TRUST_CLASSES)[number];

export const conversationTrustClassSchema = z.enum(CONVERSATION_TRUST_CLASSES);

export const conversationContextScopeSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("conversation"),
      conversationKey: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("principal"),
      principalId: z.string().min(1),
      tenantId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("tenant"),
      tenantId: z.string().min(1),
    })
    .strict(),
  z.object({ kind: z.literal("unbound") }).strict(),
  z
    .object({
      kind: z.literal("account"),
      accountId: z.string().min(1),
      tenantId: z.string().min(1).optional(),
    })
    .strict(),
]);
export type ConversationContextScope = z.infer<
  typeof conversationContextScopeSchema
>;

export const conversationContextProvenanceSchema = z.discriminatedUnion(
  "kind",
  [
    z
      .object({
        kind: z.literal("interaction"),
        interactionId: z.string().min(1),
      })
      .strict(),
    z
      .object({
        kind: z.literal("query"),
        actualCommitSequence: z.string().min(1),
        definitionDigest: z.string().min(1),
        resultDigest: z.string().min(1),
      })
      .strict(),
    z
      .object({
        kind: z.literal("explain"),
        explanationDigest: z.string().min(1),
        operationId: z.string().min(1),
      })
      .strict(),
    z
      .object({
        kind: z.literal("action"),
        actionId: z.string().min(1),
        operationId: z.string().min(1),
      })
      .strict(),
    z
      .object({
        kind: z.literal("onboard"),
        tokenHash: z.string().min(1),
      })
      .strict(),
  ],
);
export type ConversationContextProvenance = z.infer<
  typeof conversationContextProvenanceSchema
>;

export const conversationRetentionSchema = z.enum([
  "interaction",
  "preference",
  "authority",
]);
export type ConversationRetention = z.infer<typeof conversationRetentionSchema>;

/**
 * Zod-discriminated payloads. `memory_text` is not a field.
 * Instruction payload is locale + kind metadata only — never instruction copy.
 */
export const conversationContextPayloadSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("instruction"),
      kind: z.enum(["interaction", "first_contact"]),
      locale: z.enum(["pt", "en"]),
    })
    .strict(),
  z
    .object({
      type: z.literal("interaction"),
      kind: z.enum(["text", "media"]),
      mediaRef: z.string().min(1).optional(),
      text: z.string().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("preference"),
      key: z.string().min(1).max(200),
      text: z.string().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("knowledge"),
      admitted: z.boolean(),
      text: z.string(),
    })
    .strict(),
  z
    .object({
      type: z.literal("world"),
      notes: z.array(z.string()),
      rivals: z.array(z.object({ label: z.string() }).strict()),
    })
    .strict(),
  z
    .object({
      type: z.literal("history"),
      complete: z.boolean(),
      labels: z.array(z.string()),
    })
    .strict(),
  z
    .object({
      type: z.literal("personal_memory"),
      body: z.string(),
    })
    .strict(),
]);
export type ConversationContextPayload = z.infer<
  typeof conversationContextPayloadSchema
>;

export const conversationContextRecordSchema = z
  .object({
    attribution: conversationContextProvenanceSchema,
    payload: conversationContextPayloadSchema,
    recordId: z.string().regex(/^[0-9a-f]{64}$/),
    retention: conversationRetentionSchema,
    scope: conversationContextScopeSchema,
    trustClass: conversationTrustClassSchema,
  })
  .strict();
export type ConversationContextRecord = z.infer<
  typeof conversationContextRecordSchema
>;

export const conversationDroppedReasonSchema = z.enum([
  "budget",
  "audience",
  "unbound",
  "wrong_tenant",
]);
export type ConversationDroppedReason = z.infer<
  typeof conversationDroppedReasonSchema
>;

export const conversationContextDroppedSchema = z
  .object({
    reason: conversationDroppedReasonSchema,
    recordId: z.string().min(1),
  })
  .strict();

export const conversationContextFailureSchema = z
  .object({
    code: z.string().min(1),
    sourceId: z.string().min(1),
  })
  .strict();

export const conversationAudienceKindSchema = z.enum([
  "dm",
  "group",
  "channel",
  "unknown",
]);
export type ConversationAudienceKind = z.infer<
  typeof conversationAudienceKindSchema
>;

export type ConversationInbound =
  | { readonly kind: "text"; readonly text: string }
  | {
      readonly kind: "media";
      readonly mediaRef: string;
      readonly mime?: string;
    };

export type ConversationLocale = "pt" | "en";

/**
 * Sealed conversation context. `schema` is `zoen.conversation.context.v1`.
 * Hashed with RFC 8785 JCS then SHA-256. Not a prompt blob.
 */
export const conversationContextDocumentSchema = z
  .object({
    audienceKind: conversationAudienceKindSchema,
    attemptId: z.string().min(1),
    carryForwardInteractionIds: z.array(z.string()),
    claimedInteractionIds: z.array(z.string()),
    conversationKey: z.string().min(1),
    dropped: z.array(conversationContextDroppedSchema),
    failures: z.array(conversationContextFailureSchema),
    records: z.array(conversationContextRecordSchema),
    schema: z.literal("zoen.conversation.context.v1"),
    validAt: z.string().min(1),
  })
  .strict();
export type ConversationContextDocument = z.infer<
  typeof conversationContextDocumentSchema
>;

export interface ConversationContextProjection {
  readonly data: string;
  readonly instructions: string;
}

export interface ContextEnvelope {
  readonly contextRef: string;
  readonly contextDigest: string;
  readonly document: ConversationContextDocument;
  readonly projection: ConversationContextProjection;
}

export interface ConversationJcs {
  canonicalizeJsonBytes(input: Uint8Array): string;
  sha256Hex(bytes: string | Uint8Array): string;
}

export const defaultConversationJcs: ConversationJcs = {
  canonicalizeJsonBytes,
  sha256Hex,
};

/**
 * SHA-256 of `{trustClass, scope, attribution}` after RFC 8785 JCS.
 */
export function conversationRecordId(
  input: {
    readonly attribution: ConversationContextProvenance;
    readonly scope: ConversationContextScope;
    readonly trustClass: ConversationTrustClass;
  },
  jcs: ConversationJcs = defaultConversationJcs,
): string {
  return hashCanonicalJson(
    {
      attribution: input.attribution,
      scope: input.scope,
      trustClass: input.trustClass,
    },
    jcs,
  );
}

/**
 * Context: persist only this hex; rebuild the document from refs.
 * Inputs: a sealed `zoen.conversation.context.v1` document.
 * Outputs: 64-char lowercase SHA-256 of RFC 8785 JCS bytes.
 * Side effects: none. Rejects extra keys and `memory_text`.
 */
export function conversationContextHash(
  document: ConversationContextDocument,
  jcs: ConversationJcs = defaultConversationJcs,
): string {
  const sealed = conversationContextDocumentSchema.parse(document);
  assertNoMemoryText(sealed);
  return hashCanonicalJson(sealed, jcs);
}

export function sealConversationContextDocument(
  input: ConversationContextDocument,
): ConversationContextDocument {
  const sealed = conversationContextDocumentSchema.parse({
    ...input,
    records: sortConversationRecords(input.records),
  });
  assertNoMemoryText(sealed);
  return sealed;
}

export function sortConversationRecords(
  records: readonly ConversationContextRecord[],
): ConversationContextRecord[] {
  return [...records].sort((left, right) => {
    const classDelta =
      CONVERSATION_TRUST_CLASSES.indexOf(left.trustClass) -
      CONVERSATION_TRUST_CLASSES.indexOf(right.trustClass);
    if (classDelta !== 0) {
      return classDelta;
    }
    return left.recordId.localeCompare(right.recordId);
  });
}

export function createConversationContextRecord(input: {
  readonly attribution: ConversationContextProvenance;
  readonly payload: ConversationContextPayload;
  readonly retention: ConversationRetention;
  readonly scope: ConversationContextScope;
  readonly trustClass: ConversationTrustClass;
  readonly jcs?: ConversationJcs;
}): ConversationContextRecord {
  const trustClass = conversationTrustClassSchema.parse(input.trustClass);
  const payload = conversationContextPayloadSchema.parse(input.payload);
  if (payload.type !== trustClass) {
    throw new Error(
      `trustClass mismatch: record=${trustClass} payload=${payload.type}`,
    );
  }
  if (Object.hasOwn(payload, "memory_text")) {
    throw new Error("memory_text is not a conversation context payload");
  }
  return conversationContextRecordSchema.parse({
    attribution: conversationContextProvenanceSchema.parse(input.attribution),
    payload,
    recordId: conversationRecordId(
      {
        attribution: input.attribution,
        scope: input.scope,
        trustClass,
      },
      input.jcs,
    ),
    retention: conversationRetentionSchema.parse(input.retention),
    scope: conversationContextScopeSchema.parse(input.scope),
    trustClass,
  });
}

export function hashCanonicalJson(
  value: unknown,
  jcs: ConversationJcs = defaultConversationJcs,
): string {
  const text = JSON.stringify(value);
  if (text === undefined) {
    throw new Error("conversation context is not JSON");
  }
  const canonical = jcs.canonicalizeJsonBytes(Buffer.from(text, "utf8"));
  return jcs.sha256Hex(canonical);
}

export function assertNoMemoryText(value: unknown): void {
  if (containsMemoryText(value)) {
    throw new Error("memory_text is forbidden on conversation context");
  }
}

function containsMemoryText(value: unknown): boolean {
  if (value === null || typeof value !== "object") {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some(containsMemoryText);
  }
  const record = value as Record<string, unknown>;
  if (Object.hasOwn(record, "memory_text")) {
    return true;
  }
  return Object.values(record).some(containsMemoryText);
}

export type { JcsError };
