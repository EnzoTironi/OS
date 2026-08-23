import type {
  DeliveryIntentId,
  DeliveryObservationId,
  InteractionControlRef,
  InteractionId,
  PresentationIntentRef,
  PrincipalIdString,
  ProviderKey,
  ProviderMessageRef,
  ProviderThreadRef,
  ProviderUserRef,
  TenantIdString,
} from "./brands.js";

/** Transport provenance. Observation only — never authorization. */
export interface ChannelObservation {
  readonly provider: ProviderKey;
  readonly providerUser: ProviderUserRef;
  readonly thread: ProviderThreadRef;
  readonly message?: ProviderMessageRef;
  readonly replyToMessage?: ProviderMessageRef;
  readonly group?: {
    readonly thread: ProviderThreadRef;
    readonly title?: string;
  };
  readonly receivedAt: string;
}

export type InboundKind =
  | { readonly kind: "text"; readonly text: string }
  | {
      readonly kind: "media";
      readonly mediaRef: string;
      readonly mime?: string;
    }
  | {
      readonly kind: "control_click";
      readonly controlRef: InteractionControlRef;
    }
  | {
      readonly kind: "reaction";
      readonly emoji: string;
      readonly targetMessage: ProviderMessageRef;
    }
  | { readonly kind: "unsupported"; readonly reason: string };

export interface AudienceObservation {
  readonly kind: "dm" | "group" | "channel" | "unknown";
  readonly observedParticipantCount?: number;
  readonly observedParticipants?: readonly ProviderUserRef[];
}

/**
 * Canonical inbound contract. Owned by Zoen.
 * No Chat SDK Card / Thread / Adapter types appear here.
 */
export interface InboundInteraction {
  readonly idempotencyKey: string;
  readonly channel: ChannelObservation;
  readonly body: InboundKind;
  readonly audienceObservation: AudienceObservation;
}

/**
 * Membership resolution only. Channel observation is attached by the boundary.
 * Provider thread/user never appear as tenant/principal fields.
 */
export interface ResolvedChannelIdentity {
  readonly accountId: string;
  readonly bindingId: string;
  readonly membershipId: string;
  readonly tenantId: TenantIdString;
  readonly principalId: PrincipalIdString;
  readonly actorId: string;
  readonly workloadId: string;
}

/**
 * Resolved trust after IdentityDirectory. Constructed ONLY from Active Membership.
 */
export interface TrustedInteractionContext {
  readonly accountId: string;
  readonly bindingId: string;
  readonly membershipId: string;
  readonly tenantId: TenantIdString;
  readonly principalId: PrincipalIdString;
  readonly actorId: string;
  readonly workloadId: string;
  readonly channel: ChannelObservation;
}

export interface InteractionRecord {
  readonly id: InteractionId;
  readonly acceptedAt: string;
  readonly inbound: InboundInteraction;
  readonly ctx: TrustedInteractionContext;
  readonly semanticCorrelationKey: string;
}

export type DeliveryTarget =
  | { readonly kind: "same_thread"; readonly thread: ProviderThreadRef }
  | { readonly kind: "dm"; readonly providerUser: ProviderUserRef }
  | {
      readonly kind: "ephemeral_in_thread";
      readonly thread: ProviderThreadRef;
    };

export interface DeliveryIntent {
  readonly id: DeliveryIntentId;
  readonly recordId: InteractionId;
  readonly provider: ProviderKey;
  readonly target: DeliveryTarget;
  readonly presentation: PresentationIntentRef;
  readonly controlRefs: readonly InteractionControlRef[];
  readonly stableProviderDeliveryId: string;
}

export type DeliveryOutcome =
  | { readonly kind: "accepted"; readonly providerMessage: ProviderMessageRef }
  | { readonly kind: "unknown" }
  | { readonly kind: "rejected"; readonly reason: string }
  | {
      readonly kind: "degraded";
      readonly fallback: "text" | "link" | "dm";
      readonly providerMessage?: ProviderMessageRef;
    };

export interface DeliveryObservation {
  readonly id: DeliveryObservationId;
  readonly intentId: DeliveryIntentId;
  readonly observedAt: string;
  readonly outcome: DeliveryOutcome;
}

export interface InteractionControl {
  readonly ref: InteractionControlRef;
  readonly tenantId: TenantIdString;
  readonly principalId: PrincipalIdString;
  readonly proposalRef?: string;
  readonly actionBindingId?: string;
  readonly nonce: string;
  readonly expiresAt: string;
  readonly consumedAt?: string;
}

export interface ChannelPresentationCapability {
  readonly provider: ProviderKey;
  readonly text: true;
  readonly cards: boolean;
  readonly buttons: boolean;
  readonly linkButtons: boolean;
  readonly files: boolean;
  readonly typing: boolean;
  readonly reactions: boolean;
  readonly ephemeral: boolean;
  readonly extensions: {
    readonly imessageExperience: boolean;
    readonly imessageApp: boolean;
  };
}

export interface PlanDeliveryInput {
  readonly recordId: InteractionId;
  readonly ctx: TrustedInteractionContext;
  readonly presentation: PresentationIntentRef;
  readonly controls: readonly InteractionControlRef[];
  readonly target?: DeliveryTarget;
  readonly stableProviderDeliveryId?: string;
}

export interface IssueControlInput {
  readonly kind: string;
  readonly tenantId: TenantIdString;
  readonly principalId: PrincipalIdString;
  readonly proposalRef?: string;
  readonly actionBindingId?: string;
  readonly expiresAt: string;
}
