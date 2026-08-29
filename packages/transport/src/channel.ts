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

export interface InboundInteraction {
  readonly idempotencyKey: string;
  readonly channel: ChannelObservation;
  readonly body: InboundKind;
  readonly audienceObservation: AudienceObservation;
}

export interface ResolvedChannelIdentity {
  readonly accountId: string;
  readonly bindingId: string;
  readonly membershipId: string;
  readonly tenantId: TenantIdString;
  readonly principalId: PrincipalIdString;
  readonly actorId: string;
  readonly workloadId: string;
}

export interface TrustedInteractionContext extends ResolvedChannelIdentity {
  readonly channel: ChannelObservation;
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
      readonly fallback: "text" | "link" | "dm" | "web_surface";
      readonly providerMessage?: ProviderMessageRef;
      readonly surfaceUrl?: string;
    };

export interface DeliveryObservation {
  readonly id: DeliveryObservationId;
  readonly intentId: DeliveryIntentId;
  readonly observedAt: string;
  readonly outcome: DeliveryOutcome;
}

export type DisclosureDenyReason =
  | "audience_unauthorized"
  | "classification_unknown"
  | "assurance_insufficient";

export type RedactionSpec = {
  readonly mode: "labels_only" | "summary" | "unavailable_notice";
  readonly notice: string;
};

export type AudienceDisclosure =
  | { readonly kind: "deliver_full" }
  | {
      readonly kind: "deliver_redacted";
      readonly redaction: RedactionSpec;
    }
  | {
      readonly kind: "redirect_private";
      readonly target: Extract<
        DeliveryTarget,
        { kind: "dm" } | { kind: "ephemeral_in_thread" }
      >;
    }
  | { readonly kind: "require_step_up" }
  | { readonly kind: "deny"; readonly reason: DisclosureDenyReason };

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
  readonly voice?: boolean;
  readonly readReceipts?: boolean;
  readonly extensions: {
    readonly imessageExperience: boolean;
    readonly imessageApp: boolean;
  };
}
