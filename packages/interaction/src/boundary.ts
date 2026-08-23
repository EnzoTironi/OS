import { createHash, randomBytes } from "node:crypto";
import {
  deliveryIntentId,
  interactionId,
  type InteractionId,
} from "./brands.js";
import type { IdentityDirectory } from "./identity-directory.js";
import type { InteractionControlRegistry } from "./controls.js";
import type {
  DeliveryIntent,
  DeliveryObservation,
  InboundInteraction,
  InteractionRecord,
  PlanDeliveryInput,
  TrustedInteractionContext,
} from "./types.js";

export interface InteractionBoundary {
  resolveTrustedContext(
    inbound: InboundInteraction,
  ): Promise<TrustedInteractionContext>;
  accept(
    inbound: InboundInteraction,
    ctx: TrustedInteractionContext,
  ): Promise<InteractionRecord>;
  planDelivery(input: PlanDeliveryInput): Promise<DeliveryIntent>;
  recordObservation(obs: DeliveryObservation): Promise<void>;
}

export interface InteractionBoundaryOptions {
  readonly identity: IdentityDirectory;
  readonly controls: InteractionControlRegistry;
  readonly now?: () => Date;
  /** Stable correlation seed for provider-substitution tests. */
  readonly correlationNamespace?: string;
}

export function createInteractionBoundary(
  options: InteractionBoundaryOptions,
): InteractionBoundary {
  const now = options.now ?? (() => new Date());
  const accepted = new Map<string, InteractionRecord>();
  const observations = new Map<string, DeliveryObservation>();
  const namespace = options.correlationNamespace ?? "zoen.interaction";

  return {
    async resolveTrustedContext(inbound) {
      const resolved = await options.identity.resolveChannelSubject({
        provider: inbound.channel.provider,
        subjectKey: String(inbound.channel.providerUser),
      });
      return {
        ...resolved,
        channel: inbound.channel,
      };
    },

    async accept(inbound, ctx) {
      assertCtxMatchesInbound(inbound, ctx);
      const existing = accepted.get(inbound.idempotencyKey);
      if (existing !== undefined) {
        return existing;
      }
      const record: InteractionRecord = {
        acceptedAt: now().toISOString(),
        ctx,
        id: interactionId(`ixn_${randomBytes(12).toString("hex")}`),
        inbound,
        semanticCorrelationKey: semanticCorrelationKey(
          namespace,
          ctx.accountId,
          ctx.tenantId,
          ctx.principalId,
        ),
      };
      accepted.set(inbound.idempotencyKey, record);
      return record;
    },

    async planDelivery(input) {
      if (input.ctx.membershipId.length === 0) {
        throw new Error("planDelivery requires TrustedInteractionContext");
      }
      const record = findRecord(accepted, input.recordId);
      if (record === undefined) {
        throw new Error("unknown InteractionRecord");
      }
      for (const ref of input.controls) {
        await options.controls.resolve(ref);
      }
      return {
        controlRefs: input.controls,
        deliveryGroupId: input.deliveryGroupId,
        id: deliveryIntentId(`di_${randomBytes(12).toString("hex")}`),
        presentation: input.presentation,
        provider: input.ctx.channel.provider,
        recordId: input.recordId,
        sequenceIndex: input.sequenceIndex,
        stableProviderDeliveryId:
          input.stableProviderDeliveryId ??
          `spd_${input.recordId}_${randomBytes(6).toString("hex")}`,
        target:
          input.target ??
          ({
            kind: "same_thread",
            thread: input.ctx.channel.thread,
          } as const),
        turnAttemptId: input.turnAttemptId,
      };
    },

    async recordObservation(obs) {
      observations.set(obs.id, obs);
    },
  };
}

function assertCtxMatchesInbound(
  inbound: InboundInteraction,
  ctx: TrustedInteractionContext,
): void {
  if (ctx.channel.provider !== inbound.channel.provider) {
    throw new Error("TrustedInteractionContext channel mismatch");
  }
  // Mutant guard: thread/user must not equal tenant/principal.
  if (String(ctx.tenantId) === String(inbound.channel.thread)) {
    throw new Error("tenantId must not equal provider thread");
  }
  if (String(ctx.principalId) === String(inbound.channel.providerUser)) {
    throw new Error("principalId must not equal provider user");
  }
}

function semanticCorrelationKey(
  namespace: string,
  accountId: string,
  tenantId: string,
  principalId: string,
): string {
  return createHash("sha256")
    .update(`${namespace}|${accountId}|${tenantId}|${principalId}`)
    .digest("hex");
}

function findRecord(
  accepted: Map<string, InteractionRecord>,
  id: InteractionId,
): InteractionRecord | undefined {
  for (const record of accepted.values()) {
    if (record.id === id) {
      return record;
    }
  }
  return undefined;
}
