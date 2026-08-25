import {
  parseActivationContractId,
  type ActivationContractId,
  type OpaqueId,
} from "./brands.js";
import { getActivationContract } from "./catalog.js";
import { assertNoContentPayload } from "./privacy.js";
import type {
  ContractObservation,
  FirstSuccessEvalResult,
  FrictionCategory,
  ObservationRecord,
  ObservationStatus,
  ObservationStore,
} from "./types.js";

export type ContractEvaluator =
  | {
      readonly kind: "outcome";
      evaluate(): Promise<{
        readonly status: ObservationStatus;
        readonly outcomeRef?: string;
        readonly observedAtMicros?: number;
        readonly declaredContractId?: string;
        readonly reasonCategory?: FrictionCategory;
      }>;
    }
  | {
      readonly kind: "abandon";
      readonly afterContractId: ActivationContractId;
      readonly reasonCategory: FrictionCategory;
    };

export type ObserveContractArgs = {
  readonly contractId: ActivationContractId;
  readonly tenantId: OpaqueId;
  readonly sessionId: OpaqueId;
  readonly eventId: string;
  readonly buildId: string;
  readonly accountId?: OpaqueId;
  readonly productId?: OpaqueId;
  readonly evaluator: ContractEvaluator;
  readonly store: ObservationStore;
  readonly nowMicros?: () => number;
};

function now(): number {
  return Date.now() * 1000;
}

export async function observeContract(
  args: ObserveContractArgs,
): Promise<ContractObservation> {
  const contractId = parseActivationContractId(args.contractId);
  const catalog = getActivationContract(contractId);
  if (catalog === undefined) {
    throw new Error(`unknown contract: ${contractId}`);
  }

  const existing = await args.store.getByEventId(args.tenantId, args.eventId);
  if (existing !== undefined) {
    return existing;
  }

  let status: ObservationStatus;
  let outcomeRef: string | undefined;
  let observedAtMicros = args.nowMicros?.() ?? now();
  let declaredContractId = catalog.declaredContractId;
  let reasonCategory: FrictionCategory | undefined;

  if (args.evaluator.kind === "abandon") {
    status = "abandoned";
    reasonCategory = args.evaluator.reasonCategory;
  } else {
    if (catalog.outcome.kind === "not_ready_slot") {
      status = "not_ready";
      reasonCategory = "no_outcome";
    } else {
      const result = await args.evaluator.evaluate();
      status = result.status;
      outcomeRef = result.outcomeRef;
      if (result.observedAtMicros !== undefined) {
        observedAtMicros = result.observedAtMicros;
      }
      if (result.declaredContractId !== undefined) {
        declaredContractId = result.declaredContractId;
      }
      reasonCategory = result.reasonCategory;
    }
  }

  const record: ObservationRecord = {
    eventId: args.eventId,
    contractId,
    declaredContractId,
    status,
    observedAtMicros,
    tenantId: args.tenantId,
    accountId: args.accountId,
    sessionId: args.sessionId,
    productId: args.productId,
    buildId: args.buildId,
    outcomeRef,
    reasonCategory,
  };
  assertNoContentPayload(record);
  return args.store.insert(record);
}

export type ObservePackFirstSuccessArgs = {
  readonly tenantId: OpaqueId;
  readonly sessionId: OpaqueId;
  readonly installId: string;
  readonly eventId: string;
  readonly buildId: string;
  readonly accountId?: OpaqueId;
  readonly productId?: OpaqueId;
  readonly store: ObservationStore;
  /** Must call AD-08 evaluate_first_success (pack admin / pack store). */
  readonly evaluate: () => Promise<FirstSuccessEvalResult>;
  readonly nowMicros?: () => number;
};

/**
 * Pack FirstSuccess observation. Matched only when AD-08 eval returns Matched.
 * Connect / OAuth / setup must not forge Matched here.
 */
export async function observePackFirstSuccess(
  args: ObservePackFirstSuccessArgs,
): Promise<ContractObservation> {
  return observeContract({
    contractId: "pack_first_success",
    tenantId: args.tenantId,
    sessionId: args.sessionId,
    eventId: args.eventId,
    buildId: args.buildId,
    accountId: args.accountId,
    productId: args.productId,
    store: args.store,
    nowMicros: args.nowMicros,
    evaluator: {
      kind: "outcome",
      evaluate: async () => {
        const evalResult = await args.evaluate();
        switch (evalResult.status) {
          case "matched":
            return {
              status: "matched",
              outcomeRef: evalResult.outcomeRef,
              observedAtMicros: evalResult.firedAtMicros,
              declaredContractId: "sample.first_governed_commitment",
            };
          case "not_matched":
            return { status: "not_matched" };
          case "not_ready":
            return { status: "not_ready" };
          default: {
            const _exhaustive: never = evalResult;
            return _exhaustive;
          }
        }
      },
    },
  });
}
