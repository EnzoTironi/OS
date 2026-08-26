export type ExternalBoundary =
  | "web_report"
  | "bank_access"
  | "fiscal_issuance";

export type FeatureAccess =
  | { readonly kind: "in_lake" }
  | { readonly kind: "external"; readonly boundary: ExternalBoundary };

export type ChannelAssurance = "whatsapp_phone" | "oidc_bound";

export type PermissionDecision =
  | { readonly kind: "allow"; readonly assurance: "channel_inline" }
  | {
      readonly kind: "escalate";
      readonly assurance: "oidc_step_up";
      readonly boundary: ExternalBoundary;
    };

export function permissionForFeature(input: {
  readonly feature: FeatureAccess;
  readonly channelAssurance: ChannelAssurance;
}): PermissionDecision {
  switch (input.feature.kind) {
    case "in_lake":
      return { kind: "allow", assurance: "channel_inline" };
    case "external":
      switch (input.channelAssurance) {
        case "whatsapp_phone":
          return {
            kind: "escalate",
            assurance: "oidc_step_up",
            boundary: input.feature.boundary,
          };
        case "oidc_bound":
          return { kind: "allow", assurance: "channel_inline" };
        default: {
          const exhaustive: never = input.channelAssurance;
          return exhaustive;
        }
      }
    default: {
      const exhaustive: never = input.feature;
      return exhaustive;
    }
  }
}
