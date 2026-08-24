import { createHash } from "node:crypto";

declare const brand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [brand]: B };

function brandString<B extends string>(
  value: string,
  label: B,
): Brand<string, B> {
  if (value.length === 0 || value.length > 200) {
    throw new Error(`${label} must be 1..200 chars`);
  }
  return value as Brand<string, B>;
}

export type InteractionId = Brand<string, "InteractionId">;
export type DeliveryIntentId = Brand<string, "DeliveryIntentId">;
export type DeliveryObservationId = Brand<string, "DeliveryObservationId">;
export type InteractionControlRef = Brand<string, "InteractionControlRef">;
export type ProviderKey = Brand<string, "ProviderKey">;
export type ProviderUserRef = Brand<string, "ProviderUserRef">;
export type ProviderThreadRef = Brand<string, "ProviderThreadRef">;
export type ProviderMessageRef = Brand<string, "ProviderMessageRef">;
export type PresentationIntentRef = Brand<string, "PresentationIntentRef">;

export function interactionId(value: string): InteractionId {
  return brandString(value, "InteractionId");
}

export function deliveryIntentId(value: string): DeliveryIntentId {
  return brandString(value, "DeliveryIntentId");
}

export function deliveryObservationId(value: string): DeliveryObservationId {
  return brandString(value, "DeliveryObservationId");
}

export function interactionControlRef(value: string): InteractionControlRef {
  return brandString(value, "InteractionControlRef");
}

/** ChannelProvider.as_str() wire values. */
const CHANNEL_PROVIDER_KEYS = new Set([
  "web_oidc",
  "whatsapp",
  "telegram",
  "linq",
]);

export function providerKey(value: string): ProviderKey {
  if (!CHANNEL_PROVIDER_KEYS.has(value)) {
    throw new Error(`unsupported ProviderKey: ${value}`);
  }
  return brandString(value, "ProviderKey");
}

export function providerUserRef(value: string): ProviderUserRef {
  return brandString(value, "ProviderUserRef");
}

export function providerThreadRef(value: string): ProviderThreadRef {
  return brandString(value, "ProviderThreadRef");
}

export function providerMessageRef(value: string): ProviderMessageRef {
  return brandString(value, "ProviderMessageRef");
}

export function presentationIntentRef(value: string): PresentationIntentRef {
  return brandString(value, "PresentationIntentRef");
}

/** Compile-time: branded provider refs are not TenantId/PrincipalId strings. */
export type TenantIdString = Brand<string, "TenantId">;
export type PrincipalIdString = Brand<string, "PrincipalId">;

export function tenantIdString(value: string): TenantIdString {
  return brandString(value, "TenantId");
}

export function principalIdString(value: string): PrincipalIdString {
  return brandString(value, "PrincipalId");
}

/** Exact semantic proposal. Never equal to InteractionControlRef or provider callback. */
export type ProposalRef = Brand<string, "ProposalRef">;

export function proposalRef(value: string): ProposalRef {
  return brandString(value, "ProposalRef");
}

export type StepUpSessionId = Brand<string, "StepUpSessionId">;

export function stepUpSessionId(value: string): StepUpSessionId {
  return brandString(value, "StepUpSessionId");
}

/** Trusted coordination key. Provider thread alone is insufficient. */
export type ConversationKey = Brand<string, "ConversationKey">;
export type ConversationTurnId = Brand<string, "ConversationTurnId">;
export type TurnAttemptId = Brand<string, "TurnAttemptId">;
export type DeliveryGroupId = Brand<string, "DeliveryGroupId">;

export function conversationKey(value: string): ConversationKey {
  return brandString(value, "ConversationKey");
}

export function conversationTurnId(value: string): ConversationTurnId {
  return brandString(value, "ConversationTurnId");
}

export function turnAttemptId(value: string): TurnAttemptId {
  return brandString(value, "TurnAttemptId");
}

export function deliveryGroupId(value: string): DeliveryGroupId {
  return brandString(value, "DeliveryGroupId");
}

/**
 * Materialize ConversationKey from trusted membership fields + Zoen conversation id.
 * Provider thread must not be the sole input.
 */
export function conversationKeyFrom(input: {
  readonly tenantId: string;
  readonly accountId: string;
  readonly workspaceId: string;
  readonly conversationId: string;
}): ConversationKey {
  const material = [
    input.tenantId,
    input.accountId,
    input.workspaceId,
    input.conversationId,
  ].join("|");
  if (
    input.tenantId.length === 0 ||
    input.accountId.length === 0 ||
    input.workspaceId.length === 0 ||
    input.conversationId.length === 0
  ) {
    throw new Error("ConversationKey requires tenant/account/workspace/conversation");
  }
  const digest = createHash("sha256").update(material).digest("hex").slice(0, 32);
  return conversationKey(`ck_${digest}`);
}
