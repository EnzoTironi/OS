import {
  interactionControlRef,
  type InteractionControlRef,
  type ProposalRef,
  type ProviderThreadRef,
} from "./brands.js";
import { asApprovalControl, type InteractionControlRegistry } from "./controls.js";
import type { StepUpRegistry } from "./step-up.js";
import { stepUpUrl } from "./step-up.js";
import type {
  ApprovalControl,
  ControlActivation,
  FreeTextResolution,
  InboundInteraction,
  TrustedInteractionContext,
} from "./types.js";

export async function handleControlClick(input: {
  readonly controls: InteractionControlRegistry;
  readonly stepUps: StepUpRegistry;
  readonly inbound: InboundInteraction;
  readonly ctx: TrustedInteractionContext;
  readonly publicWebOrigin: string;
  readonly membershipActive?: boolean;
}): Promise<ControlActivation> {
  if (input.inbound.body.kind !== "control_click") {
    return { kind: "denied", reason: "unknown_ref" };
  }
  if (input.membershipActive === false) {
    return { kind: "denied", reason: "membership_inactive" };
  }

  const rawRef = input.inbound.body.controlRef;
  let control: ApprovalControl;
  try {
    const live = await input.controls.resolve(rawRef);
    control = asApprovalControl(live);
  } catch (cause: unknown) {
    const message = cause instanceof Error ? cause.message : String(cause);
    if (message.includes("unknown")) {
      return { kind: "denied", reason: "unknown_ref" };
    }
    if (message.includes("expired")) {
      return { kind: "denied", reason: "expired" };
    }
    if (message.includes("consumed")) {
      return { kind: "denied", reason: "already_consumed" };
    }
    if (message.includes("not an ApprovalControl")) {
      return { kind: "denied", reason: "unknown_ref" };
    }
    throw cause;
  }

  if (String(input.ctx.tenantId) !== String(control.tenantId)) {
    return { kind: "denied", reason: "tenant_mismatch" };
  }
  if (String(input.ctx.principalId) !== String(control.principalId)) {
    return { kind: "denied", reason: "principal_mismatch" };
  }

  // Audience worsened vs sealed disclosure → fail closed; never upgrade.
  if (
    audienceWorsened(
      control.sealedAudienceKind,
      input.inbound.audienceObservation.kind,
    )
  ) {
    return { kind: "denied", reason: "disclosure_fail_closed" };
  }

  if (
    control.assurance === "oidc_step_up" ||
    control.disclosure.kind === "require_step_up"
  ) {
    await input.stepUps.open({
      control,
      expiresAt: control.expiresAt,
    });
    return {
      control,
      kind: "step_up_required",
      proposalRef: control.proposalRef,
      stepUpUrl: stepUpUrl(input.publicWebOrigin, control.ref),
    };
  }

  return {
    control,
    kind: "inline_commit_ready",
    proposalRef: control.proposalRef,
  };
}

function audienceWorsened(
  sealed: ApprovalControl["sealedAudienceKind"],
  observed: ApprovalControl["sealedAudienceKind"],
): boolean {
  if (sealed === "dm" && (observed === "group" || observed === "channel")) {
    return true;
  }
  if (sealed === "group" && observed === "channel") {
    return true;
  }
  return false;
}

/** "approve" never means newest proposal globally. */
export function resolveApprovalUtterance(input: {
  readonly text: string;
  readonly liveControls: readonly ApprovalControl[];
  readonly thread: ProviderThreadRef;
}): FreeTextResolution {
  void input.thread;
  const normalized = input.text.trim().toLowerCase();
  if (!normalized.startsWith("approve")) {
    return { kind: "unbound", reason: "no_pending" };
  }

  if (input.liveControls.length === 0) {
    return { kind: "unbound", reason: "no_pending" };
  }

  if (input.liveControls.length === 1) {
    const only = input.liveControls[0];
    if (only === undefined) {
      return { kind: "unbound", reason: "no_pending" };
    }
    return { kind: "bound", controlRef: only.ref };
  }

  const candidates: ProposalRef[] = input.liveControls.map(
    (control) => control.proposalRef,
  );
  return { kind: "disambiguate", candidates };
}

/**
 * Provider callback string is never a ProposalRef.
 * Only controls.resolve after mint establishes trust.
 */
export function rejectRawProposalCallback(value: string): InteractionControlRef {
  return interactionControlRef(value);
}
