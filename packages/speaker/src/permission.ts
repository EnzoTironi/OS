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
      return { assurance: "channel_inline", kind: "allow" };
    case "external":
      return permissionForExternal(input.feature.boundary, input.channelAssurance);
    default: {
      const exhaustive: never = input.feature;
      return exhaustive;
    }
  }
}

function permissionForExternal(
  boundary: ExternalBoundary,
  channelAssurance: ChannelAssurance,
): PermissionDecision {
  switch (channelAssurance) {
    case "whatsapp_phone":
      return { assurance: "oidc_step_up", boundary, kind: "escalate" };
    case "oidc_bound":
      return { assurance: "channel_inline", kind: "allow" };
    default: {
      const exhaustive: never = channelAssurance;
      return exhaustive;
    }
  }
}

export function escalationHref(origin: string, boundary: ExternalBoundary): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/approve/external.${boundary}`;
}
