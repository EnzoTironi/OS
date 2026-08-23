import type {
  InteractionControlRef,
  InteractionId,
  PresentationIntentRef,
} from "./brands.js";
import type { InteractionBoundary } from "./boundary.js";
import type {
  AudienceDisclosure,
  AudienceDisclosureInput,
  ChannelPresentationCapability,
  DeliveryIntent,
  LinkButtonDegrade,
  TrustedInteractionContext,
} from "./types.js";

/**
 * Total product disclosure table. Not Cedar. Not a second policy language.
 * Result is sealed onto the control at issue so click-time cannot upgrade it.
 */
export function decideAudienceDisclosure(
  input: AudienceDisclosureInput,
): AudienceDisclosure {
  const audienceKind = input.audience.kind;

  switch (input.resourceClass) {
    case "public":
      return { kind: "deliver_full" };
    case "restricted":
      return { kind: "require_step_up" };
    case "confidential":
      if (audienceKind === "dm") {
        return input.actionRisk === "high"
          ? { kind: "require_step_up" }
          : { kind: "deliver_full" };
      }
      if (audienceKind === "group" || audienceKind === "channel") {
        return { kind: "require_step_up" };
      }
      return { kind: "deny", reason: "audience_unauthorized" };
    case "internal":
      if (audienceKind === "dm") {
        return { kind: "deliver_full" };
      }
      if (audienceKind === "group" || audienceKind === "channel") {
        return {
          kind: "deliver_redacted",
          redaction: {
            mode: "labels_only",
            notice:
              "Details available in a private channel or authenticated step-up.",
          },
        };
      }
      return { kind: "deny", reason: "audience_unauthorized" };
    default: {
      const _exhaustive: never = input.resourceClass;
      void _exhaustive;
      return { kind: "deny", reason: "classification_unknown" };
    }
  }
}

/**
 * Stamp high-risk onto AssuranceGate even when disclosure is deliver_*.
 * Callers use this when sealing IssueApprovalControlInput.
 */
export function assuranceForRisk(
  actionRisk: "low" | "high",
  disclosure: AudienceDisclosure,
): "channel_inline" | "oidc_step_up" {
  if (actionRisk === "high" || disclosure.kind === "require_step_up") {
    return "oidc_step_up";
  }
  return "channel_inline";
}

export async function planDisclosureDelivery(input: {
  readonly boundary: InteractionBoundary;
  readonly recordId: InteractionId;
  readonly ctx: TrustedInteractionContext;
  readonly presentation: PresentationIntentRef;
  readonly controlRef: InteractionControlRef;
  readonly disclosure: AudienceDisclosure;
  readonly confidentialBody?: string;
}): Promise<{
  readonly intent: DeliveryIntent;
  readonly body: string;
  readonly includesConfidentialBody: boolean;
}> {
  const disclosure = input.disclosure;

  if (disclosure.kind === "deny") {
    const intent = await input.boundary.planDelivery({
      controls: [],
      ctx: input.ctx,
      presentation: input.presentation,
      recordId: input.recordId,
      target: {
        kind: "same_thread",
        thread: input.ctx.channel.thread,
      },
    });
    return {
      body: `Unavailable: ${disclosure.reason}`,
      includesConfidentialBody: false,
      intent,
    };
  }

  if (disclosure.kind === "deliver_full") {
    const intent = await input.boundary.planDelivery({
      controls: [input.controlRef],
      ctx: input.ctx,
      presentation: input.presentation,
      recordId: input.recordId,
    });
    return {
      body: input.confidentialBody ?? "",
      includesConfidentialBody: true,
      intent,
    };
  }

  if (disclosure.kind === "deliver_redacted") {
    const intent = await input.boundary.planDelivery({
      controls: [input.controlRef],
      ctx: input.ctx,
      presentation: input.presentation,
      recordId: input.recordId,
    });
    return {
      body: disclosure.redaction.notice,
      includesConfidentialBody: false,
      intent,
    };
  }

  if (disclosure.kind === "redirect_private") {
    const intent = await input.boundary.planDelivery({
      controls: [input.controlRef],
      ctx: input.ctx,
      presentation: input.presentation,
      recordId: input.recordId,
      target:
        disclosure.target.kind === "dm"
          ? disclosure.target
          : {
              kind: "dm",
              providerUser: input.ctx.channel.providerUser,
            },
    });
    return {
      body: input.confidentialBody ?? "",
      includesConfidentialBody: true,
      intent,
    };
  }

  const intent = await input.boundary.planDelivery({
    controls: [input.controlRef],
    ctx: input.ctx,
    presentation: input.presentation,
    recordId: input.recordId,
  });
  return {
    body: "Approval requires authenticated step-up. Open the secure link to continue.",
    includesConfidentialBody: false,
    intent,
  };
}

/** Graft from C: degrade to link text when provider has no URL buttons. */
export function planLinkButtonDegrade(input: {
  readonly capability: ChannelPresentationCapability;
  readonly url: string;
  readonly label: string;
}): LinkButtonDegrade {
  if (input.capability.buttons && input.capability.linkButtons) {
    return { kind: "native_url_button", url: input.url };
  }
  return { kind: "link_text", label: input.label, url: input.url };
}
