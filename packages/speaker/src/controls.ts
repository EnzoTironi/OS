import { randomBytes } from "node:crypto";
import {
  interactionControlRef,
  proposalRef,
  type InteractionControlRef,
  type ProposalRef,
} from "./brands.js";
import { requireUnconsumedControl, type ControlStore } from "./store.js";
import type {
  ApprovalControl,
  InteractionControl,
  IssueApprovalControlInput,
  IssueControlInput,
} from "./types.js";

export interface InteractionControlRegistry {
  issue(input: IssueControlInput): Promise<InteractionControlRef>;
  issueApproval(input: IssueApprovalControlInput): Promise<InteractionControlRef>;
  resolve(ref: InteractionControlRef): Promise<InteractionControl>;
  resolveApproval(ref: InteractionControlRef): Promise<ApprovalControl>;
  consume(ref: InteractionControlRef): Promise<InteractionControl>;
  listLiveApprovals(input: {
    readonly tenantId: string;
    readonly principalId: string;
  }): Promise<readonly ApprovalControl[]>;
}

export interface InteractionControlRegistryOptions {
  readonly store: ControlStore;
  readonly now?: () => Date;
}

export function createInteractionControlRegistry(
  options: InteractionControlRegistryOptions,
): InteractionControlRegistry {
  const now = options.now ?? (() => new Date());
  const store = options.store;

  return {
    async issue(input) {
      const ref = interactionControlRef(`icr_${randomBytes(16).toString("hex")}`);
      const entry: InteractionControl = {
        actionBindingId: input.actionBindingId,
        expiresAt: input.expiresAt,
        nonce: randomBytes(8).toString("hex"),
        principalId: input.principalId,
        proposalRef: input.proposalRef,
        ref,
        tenantId: input.tenantId,
      };
      await store.putControl(entry);
      return ref;
    },

    async issueApproval(input) {
      if (input.disclosure.kind === "deny") {
        throw new Error("cannot issue approval control for deny disclosure");
      }
      const ref = interactionControlRef(`icr_${randomBytes(16).toString("hex")}`);
      const entry: InteractionControl = {
        actionBindingId: input.actionBindingId,
        actionRef: input.actionRef,
        assurance: input.assurance,
        disclosure: input.disclosure,
        expiresAt: input.expiresAt,
        nonce: randomBytes(8).toString("hex"),
        operationId: input.operationId,
        previewHash: input.previewHash,
        previewText: input.previewText,
        principalId: input.principalId,
        proposalRef: String(input.proposalRef),
        ref,
        sealedAudienceKind: input.sealedAudienceKind,
        tenantId: input.tenantId,
      };
      await store.putControl(entry);
      return ref;
    },

    async resolve(ref) {
      return requireLive(store, ref, now());
    },

    async resolveApproval(ref) {
      const live = await requireLive(store, ref, now());
      return asApprovalControl(live);
    },

    async consume(ref) {
      return store.consumeControl(ref, now().toISOString());
    },

    async listLiveApprovals(input) {
      const at = now();
      const out: ApprovalControl[] = [];
      for (const entry of await store.listControls(input)) {
        if (entry.consumedAt !== undefined) {
          continue;
        }
        if (Date.parse(entry.expiresAt) <= at.getTime()) {
          continue;
        }
        try {
          out.push(asApprovalControl(entry));
        } catch {
          // non-approval controls stay out of the live approval set
        }
      }
      return out;
    },
  };
}

export function issueApprovalControl(
  registry: InteractionControlRegistry,
  input: IssueApprovalControlInput,
): Promise<InteractionControlRef> {
  return registry.issueApproval(input);
}

async function requireLive(
  store: ControlStore,
  ref: InteractionControlRef,
  at: Date,
): Promise<InteractionControl> {
  return requireUnconsumedControl(await store.getControl(ref), at);
}

export function asApprovalControl(control: InteractionControl): ApprovalControl {
  if (
    control.proposalRef === undefined ||
    control.actionBindingId === undefined ||
    control.actionRef === undefined ||
    control.disclosure === undefined ||
    control.assurance === undefined ||
    control.sealedAudienceKind === undefined
  ) {
    throw new Error("InteractionControl is not an ApprovalControl");
  }
  return {
    actionBindingId: control.actionBindingId,
    actionRef: control.actionRef,
    assurance: control.assurance,
    consumedAt: control.consumedAt,
    disclosure: control.disclosure,
    expiresAt: control.expiresAt,
    nonce: control.nonce,
    operationId: control.operationId,
    previewHash: control.previewHash,
    previewText: control.previewText,
    principalId: control.principalId,
    proposalRef: proposalRef(control.proposalRef),
    ref: control.ref,
    sealedAudienceKind: control.sealedAudienceKind,
    stepUpSessionId: control.stepUpSessionId,
    tenantId: control.tenantId,
  };
}

/** Type-level: raw callback strings are not InteractionControlRef without minting. */
export function assertOpaqueControlRef(
  value: string,
  registry: InteractionControlRegistry,
): Promise<InteractionControl> {
  return registry.resolve(interactionControlRef(value));
}

export function parseProposalRefFromControl(
  control: ApprovalControl,
): ProposalRef {
  return control.proposalRef;
}
