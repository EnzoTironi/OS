import {
  stepUpUrl,
  type AudienceDisclosure,
  type ChannelPresentationCapability,
  type DeliveryTarget,
  type InteractionControlRef,
} from "../../interaction/src/index.js";
import type {
  ConversationalBlock,
  PresentationIntent,
} from "../../surface/src/presentation-intent.js";
import type { CapabilityProbes, DegradeTarget } from "./capability-probes.js";
import type { ChatSdkOutbound, ChatSdkThreadRef } from "./chat-sdk-shape.js";

export class CriticalControlUnreachableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CriticalControlUnreachableError";
  }
}

export class DisclosureRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DisclosureRequiredError";
  }
}

export interface LowerPresentationIntentInput {
  readonly intent: PresentationIntent;
  /** Body already filtered by planDisclosureDelivery. */
  readonly disclosedBody: string;
  readonly includesConfidentialBody: boolean;
  /** Sealed disclosure decision. Required before any critical control lowers. */
  readonly disclosure: AudienceDisclosure;
  readonly controlRefs: readonly InteractionControlRef[];
  readonly probes: CapabilityProbes;
  readonly caps: ChannelPresentationCapability;
  readonly publicWebOrigin: string;
  readonly clientDeliveryId: string;
  readonly target: DeliveryTarget;
  readonly threadKind: ChatSdkThreadRef["kind"];
}

export interface LowerPresentationResult {
  readonly outbound: ChatSdkOutbound;
  readonly degraded: boolean;
  readonly fallback?: DegradeTarget;
  readonly criticalReachable: boolean;
}

/**
 * Sole Chat SDK author for Surface IR. Observation-only: never commits Action.
 * Business packs must not construct ChatSdkOutbound beside this function.
 */
export function lowerPresentationIntent(
  input: LowerPresentationIntentInput,
): LowerPresentationResult {
  const criticalBlocks = input.intent.blocks.filter(isCriticalButton);
  if (criticalBlocks.length > 0 && input.disclosure === undefined) {
    throw new DisclosureRequiredError(
      "critical controls require sealed AudienceDisclosure before lower",
    );
  }
  if (criticalBlocks.length > 0 && input.controlRefs.length === 0) {
    throw new DisclosureRequiredError(
      "critical controls require sealed controlRefs before lower",
    );
  }

  assertNoAuthorityLeak(input);

  let degraded = false;
  let fallback: DegradeTarget | undefined;
  const textParts: string[] = [];
  if (input.disclosedBody.length > 0) {
    textParts.push(input.disclosedBody);
  }

  let card: boolean | undefined;
  let surfaceUrl: string | undefined;
  const buttons: { label: string; callbackData: string }[] = [];
  let mediaRef: string | undefined;
  let mime: string | undefined;

  for (const block of input.intent.blocks) {
    const piece = lowerBlock(block, input, {
      markDegraded(target) {
        degraded = true;
        fallback = target;
      },
      setSurfaceUrl(url) {
        surfaceUrl = url;
      },
    });
    if (piece.text !== undefined && piece.text.length > 0) {
      if (
        !input.includesConfidentialBody ||
        piece.text === input.disclosedBody ||
        !isFromConfidentialCard(block, input)
      ) {
        if (piece.useDisclosedOnly !== true) {
          textParts.push(piece.text);
        }
      }
    }
    if (piece.card === true) {
      card = true;
    }
    if (piece.button !== undefined) {
      buttons.push(piece.button);
    }
    if (piece.linkText !== undefined) {
      textParts.push(piece.linkText);
    }
    if (piece.mediaRef !== undefined) {
      mediaRef = piece.mediaRef;
      mime = piece.mime;
    }
  }

  for (const ref of input.controlRefs) {
    const present =
      buttons.some((button) => button.callbackData === String(ref)) ||
      textParts.some((part) => part.includes(String(ref))) ||
      (surfaceUrl !== undefined && surfaceUrl.includes(String(ref))) ||
      textParts.some((part) =>
        part.includes(stepUpUrl(input.publicWebOrigin, ref)),
      );
    if (present) {
      continue;
    }
    const buttonProbe = input.probes.canNativeButton();
    if (buttonProbe.status === "native") {
      const label =
        criticalBlocks.find((block) => String(block.controlRef) === String(ref))
          ?.label ?? "Approve";
      buttons.push({ callbackData: String(ref), label });
      continue;
    }
    const degrade = buttonProbe.degradeTo;
    degraded = true;
    fallback = degrade;
    const url = stepUpUrl(input.publicWebOrigin, ref);
    if (degrade === "link" || degrade === "text") {
      textParts.push(`Approve: ${url}`);
      continue;
    }
    if (degrade === "web_surface" || degrade === "dm") {
      surfaceUrl =
        surfaceUrl ??
        `${input.publicWebOrigin.replace(/\/$/, "")}/surface/${String(input.intent.ref)}?c=${String(ref)}`;
      textParts.push(`Continue approval: ${surfaceUrl}`);
      continue;
    }
    throw new CriticalControlUnreachableError(
      `critical control ${String(ref)} has no degrade path`,
    );
  }

  const uniqueText = dedupeText(textParts);
  const experience =
    input.caps.extensions.imessageExperience === true ? true : undefined;

  const outbound: ChatSdkOutbound = {
    buttons: buttons.length > 0 ? buttons : undefined,
    card,
    clientDeliveryId: input.clientDeliveryId,
    ephemeral: input.target.kind === "ephemeral_in_thread",
    experience,
    mediaRef,
    mime,
    surfaceUrl,
    text: uniqueText.length > 0 ? uniqueText : "(empty)",
    thread:
      input.target.kind === "dm"
        ? undefined
        : {
            id: String(input.target.thread),
            kind: input.threadKind,
          },
    toUser:
      input.target.kind === "dm"
        ? { id: String(input.target.providerUser) }
        : undefined,
  };

  const criticalReachable =
    criticalBlocks.length === 0 ||
    criticalBlocks.every((block) =>
      controlReachable(outbound, block.controlRef, input.publicWebOrigin),
    );
  if (criticalBlocks.length > 0 && !criticalReachable) {
    throw new CriticalControlUnreachableError(
      "critical control omitted after lower",
    );
  }

  return {
    criticalReachable,
    degraded,
    fallback,
    outbound,
  };
}

function isCriticalButton(
  block: ConversationalBlock,
): block is Extract<ConversationalBlock, { kind: "button"; critical: true }> {
  return block.kind === "button" && block.critical === true;
}

function assertNoAuthorityLeak(input: LowerPresentationIntentInput): void {
  for (const block of input.intent.blocks) {
    if (block.kind !== "button") {
      continue;
    }
    const value = String(block.controlRef);
    if (value.startsWith("proposal.") || value.startsWith("tenant.")) {
      throw new CriticalControlUnreachableError(
        "button value must not encode ProposalRef or tenant authority",
      );
    }
  }
}

function isFromConfidentialCard(
  block: ConversationalBlock,
  input: LowerPresentationIntentInput,
): boolean {
  if (block.kind !== "card" && block.kind !== "text") {
    return false;
  }
  if (input.includesConfidentialBody) {
    return false;
  }
  if (input.disclosure.kind === "deliver_full") {
    return false;
  }
  return true;
}

function lowerBlock(
  block: ConversationalBlock,
  input: LowerPresentationIntentInput,
  sink: {
    markDegraded(target: DegradeTarget): void;
    setSurfaceUrl(url: string): void;
  },
): {
  text?: string;
  card?: boolean;
  button?: { label: string; callbackData: string };
  linkText?: string;
  mediaRef?: string;
  mime?: string;
  useDisclosedOnly?: boolean;
} {
  switch (block.kind) {
    case "text": {
      if (!input.includesConfidentialBody) {
        return { useDisclosedOnly: true };
      }
      return { text: block.body };
    }
    case "card": {
      const cardProbe = input.probes.canNativeCard();
      if (!input.includesConfidentialBody) {
        return { useDisclosedOnly: true };
      }
      if (cardProbe.status === "native") {
        return { card: true, text: `${block.title}\n${block.body}` };
      }
      sink.markDegraded(cardProbe.degradeTo);
      if (cardProbe.degradeTo === "web_surface") {
        const url = `${input.publicWebOrigin.replace(/\/$/, "")}/surface/${String(input.intent.ref)}`;
        sink.setSurfaceUrl(url);
        return { linkText: `${block.title}\n${url}`, text: block.title };
      }
      return { text: `${block.title}\n${block.body}` };
    }
    case "button": {
      const buttonProbe = input.probes.canNativeButton();
      const callbackData = String(block.controlRef);
      if (buttonProbe.status === "native") {
        return { button: { callbackData, label: block.label } };
      }
      sink.markDegraded(buttonProbe.degradeTo);
      const url = stepUpUrl(input.publicWebOrigin, block.controlRef);
      if (buttonProbe.degradeTo === "web_surface") {
        const surface = `${input.publicWebOrigin.replace(/\/$/, "")}/surface/${String(input.intent.ref)}?c=${callbackData}`;
        sink.setSurfaceUrl(surface);
        return { linkText: `${block.label}: ${surface}` };
      }
      if (buttonProbe.degradeTo === "link" || buttonProbe.degradeTo === "text") {
        return { linkText: `${block.label}: ${url}` };
      }
      if (buttonProbe.degradeTo === "dm") {
        return { linkText: `${block.label}: ${url}` };
      }
      throw new CriticalControlUnreachableError(
        `unsupported native_button with no degrade for ${callbackData}`,
      );
    }
    case "link": {
      const linkProbe = input.probes.canNativeLink();
      if (linkProbe.status === "native" && input.caps.linkButtons) {
        return { linkText: `${block.label}: ${block.url}` };
      }
      sink.markDegraded(
        linkProbe.status === "unsupported" ? linkProbe.degradeTo : "text",
      );
      return { linkText: `${block.label}: ${block.url}` };
    }
    case "file": {
      const fileProbe = input.probes.canImageFile();
      if (fileProbe.status === "native") {
        return {
          mediaRef: block.mediaRef,
          mime: block.mime,
          text: block.caption,
        };
      }
      sink.markDegraded(fileProbe.degradeTo);
      return {
        linkText: block.caption
          ? `${block.caption}: ${block.mediaRef}`
          : block.mediaRef,
      };
    }
    case "secure_web_fallback": {
      sink.setSurfaceUrl(block.surfaceUrl);
      return { linkText: `${block.label}: ${block.surfaceUrl}` };
    }
    default: {
      const _exhaustive: never = block;
      void _exhaustive;
      return {};
    }
  }
}

function controlReachable(
  outbound: ChatSdkOutbound,
  ref: InteractionControlRef,
  publicWebOrigin: string,
): boolean {
  const raw = String(ref);
  if (outbound.buttons?.some((button) => button.callbackData === raw)) {
    return true;
  }
  if (outbound.surfaceUrl?.includes(raw)) {
    return true;
  }
  const url = stepUpUrl(publicWebOrigin, ref);
  if (outbound.text.includes(url) || outbound.text.includes(raw)) {
    return true;
  }
  return false;
}

function dedupeText(parts: string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out.join("\n");
}
