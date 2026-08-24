import { randomBytes } from "node:crypto";
import {
  stepUpSessionId,
  type InteractionControlRef,
  type ProposalRef,
  type StepUpSessionId,
  type TenantIdString,
  type PrincipalIdString,
} from "./brands.js";
import {
  asApprovalControl,
  type InteractionControlRegistry,
} from "./controls.js";
import { type ControlStore } from "./store.js";
import type { ApprovalControl, StepUpSession } from "./types.js";

export interface StepUpRegistry {
  open(input: {
    readonly control: ApprovalControl;
    readonly expiresAt: string;
  }): Promise<StepUpSession>;
  authenticate(input: {
    readonly sessionId: StepUpSessionId;
    readonly controlRef: InteractionControlRef;
    readonly verified: {
      readonly accountId: string;
      readonly tenantId: TenantIdString;
      readonly principalId: PrincipalIdString;
      readonly oidcSubject: string;
    };
  }): Promise<StepUpSession>;
  get(id: StepUpSessionId): Promise<StepUpSession>;
  markCommitted(id: StepUpSessionId): Promise<StepUpSession>;
}

export interface StepUpRegistryOptions {
  readonly store: ControlStore;
  readonly now?: () => Date;
}

export function createStepUpRegistry(
  options: StepUpRegistryOptions,
): StepUpRegistry {
  const store = options.store;
  const now = options.now ?? (() => new Date());

  return {
    async open(input) {
      const existing = await store.findStepUpByControl(input.control.ref);
      if (existing !== undefined && existing.status !== "rejected") {
        if (Date.parse(existing.expiresAt) > now().getTime()) {
          return existing;
        }
      }
      const session: StepUpSession = {
        controlRef: input.control.ref,
        expiresAt: input.expiresAt,
        id: stepUpSessionId(`sus_${randomBytes(12).toString("hex")}`),
        proposalRef: input.control.proposalRef,
        requiredPrincipalId: input.control.principalId,
        status: "open",
        tenantId: input.control.tenantId,
      };
      await store.putStepUp(session);
      return session;
    },

    async authenticate(input) {
      const session = await requireSession(store, input.sessionId, now());
      if (String(session.controlRef) !== String(input.controlRef)) {
        return reject(store, session);
      }
      if (String(session.tenantId) !== String(input.verified.tenantId)) {
        return reject(store, session);
      }
      if (
        String(session.requiredPrincipalId) !==
        String(input.verified.principalId)
      ) {
        return reject(store, session);
      }
      const authenticated: StepUpSession = {
        ...session,
        accountId: input.verified.accountId,
        oidcSubject: input.verified.oidcSubject,
        status: "authenticated",
      };
      await store.putStepUp(authenticated);
      return authenticated;
    },

    async get(id) {
      return requireSession(store, id, now());
    },

    async markCommitted(id) {
      const session = await requireSession(store, id, now());
      if (session.status === "committed") {
        throw new Error("StepUpSession already committed");
      }
      if (session.status !== "authenticated") {
        throw new Error("StepUpSession not authenticated");
      }
      const committed: StepUpSession = {
        ...session,
        status: "committed",
      };
      await store.putStepUp(committed);
      return committed;
    },
  };
}

async function reject(
  store: ControlStore,
  session: StepUpSession,
): Promise<StepUpSession> {
  const rejected: StepUpSession = { ...session, status: "rejected" };
  await store.putStepUp(rejected);
  return rejected;
}

async function requireSession(
  store: ControlStore,
  id: StepUpSessionId,
  at: Date,
): Promise<StepUpSession> {
  const session = await store.getStepUp(id);
  if (session === undefined) {
    throw new Error("unknown StepUpSession");
  }
  if (session.status === "expired" || Date.parse(session.expiresAt) <= at.getTime()) {
    const expired: StepUpSession = { ...session, status: "expired" };
    await store.putStepUp(expired);
    throw new Error("StepUpSession expired");
  }
  return session;
}

export function stepUpUrl(origin: string, ref: InteractionControlRef): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/approve/${ref}`;
}

/**
 * Chat cookie alone is insufficient. Caller must pass OIDC-verified membership.
 */
export async function openStepUpSession(input: {
  readonly controls: InteractionControlRegistry;
  readonly stepUps: StepUpRegistry;
  readonly controlRef: InteractionControlRef;
  readonly oidcBearerVerified:
    | {
        readonly accountId: string;
        readonly tenantId: TenantIdString;
        readonly principalId: PrincipalIdString;
        readonly oidcSubject: string;
      }
    | undefined;
  readonly chatCookieOnly?: boolean;
}): Promise<StepUpSession> {
  if (input.chatCookieOnly === true || input.oidcBearerVerified === undefined) {
    throw new Error("chat_cookie_insufficient");
  }

  const live = await input.controls.resolve(input.controlRef);
  const control = asApprovalControl(live);
  if (
    control.assurance !== "oidc_step_up" &&
    control.disclosure.kind !== "require_step_up"
  ) {
    throw new Error("step-up not required for control");
  }

  const opened = await input.stepUps.open({
    control,
    expiresAt: control.expiresAt,
  });

  const authenticated = await input.stepUps.authenticate({
    controlRef: control.ref,
    sessionId: opened.id,
    verified: input.oidcBearerVerified,
  });

  if (authenticated.status === "rejected") {
    throw new Error("wrong_account");
  }
  return authenticated;
}

export async function completeStepUpCommit(input: {
  readonly controls: InteractionControlRegistry;
  readonly stepUps: StepUpRegistry;
  readonly session: StepUpSession;
  readonly commit: (
    proposalRef: ProposalRef,
  ) => Promise<{ operationId: string }>;
}): Promise<{ proposalRef: ProposalRef; operationId: string }> {
  if (input.session.status !== "authenticated") {
    throw new Error("StepUpSession not authenticated");
  }

  await input.controls.consume(input.session.controlRef);
  const receipt = await input.commit(input.session.proposalRef);
  await input.stepUps.markCommitted(input.session.id);
  return {
    operationId: receipt.operationId,
    proposalRef: input.session.proposalRef,
  };
}
