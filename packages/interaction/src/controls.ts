import { randomBytes } from "node:crypto";
import {
  interactionControlRef,
  type InteractionControlRef,
} from "./brands.js";
import type { InteractionControl, IssueControlInput } from "./types.js";

export interface InteractionControlRegistry {
  issue(input: IssueControlInput): Promise<InteractionControlRef>;
  resolve(ref: InteractionControlRef): Promise<InteractionControl>;
  consume(ref: InteractionControlRef): Promise<InteractionControl>;
}

export function createInteractionControlRegistry(
  now: () => Date = () => new Date(),
): InteractionControlRegistry {
  const controls = new Map<string, InteractionControl>();

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
      controls.set(ref, entry);
      return ref;
    },

    async resolve(ref) {
      return requireLive(controls, ref, now());
    },

    async consume(ref) {
      const live = requireLive(controls, ref, now());
      const consumed: InteractionControl = {
        ...live,
        consumedAt: now().toISOString(),
      };
      controls.set(ref, consumed);
      return consumed;
    },
  };
}

function requireLive(
  controls: Map<string, InteractionControl>,
  ref: InteractionControlRef,
  at: Date,
): InteractionControl {
  const entry = controls.get(ref);
  if (entry === undefined) {
    throw new Error("unknown InteractionControlRef");
  }
  if (entry.consumedAt !== undefined) {
    throw new Error("InteractionControlRef already consumed");
  }
  if (Date.parse(entry.expiresAt) <= at.getTime()) {
    throw new Error("InteractionControlRef expired");
  }
  return entry;
}

/** Type-level: raw callback strings are not InteractionControlRef without minting. */
export function assertOpaqueControlRef(
  value: string,
  registry: InteractionControlRegistry,
): Promise<InteractionControl> {
  return registry.resolve(interactionControlRef(value));
}
