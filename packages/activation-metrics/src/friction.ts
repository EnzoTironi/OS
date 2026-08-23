import {
  parseActivationContractId,
  type ActivationContractId,
  type OpaqueId,
} from "./brands.js";
import type { FrictionCategory, FrictionEntry, FrictionStore } from "./types.js";

export type AppendFrictionArgs = {
  readonly frictionId: string;
  readonly contractId: ActivationContractId;
  readonly sessionId: OpaqueId;
  readonly elapsedMicros: number;
  readonly category: FrictionCategory;
  readonly userVisibleMessageCode: string;
  readonly recoveryPath: string;
  readonly manualHelpNeeded: boolean;
  readonly buildId: string;
  readonly store: FrictionStore;
  readonly recordedAtMicros?: number;
};

export async function appendFriction(
  args: AppendFrictionArgs,
): Promise<FrictionEntry> {
  const entry: FrictionEntry = {
    frictionId: args.frictionId,
    contractId: parseActivationContractId(args.contractId),
    sessionId: args.sessionId,
    elapsedMicros: args.elapsedMicros,
    category: args.category,
    userVisibleMessageCode: args.userVisibleMessageCode,
    recoveryPath: args.recoveryPath,
    manualHelpNeeded: args.manualHelpNeeded,
    buildId: args.buildId,
    recordedAtMicros: args.recordedAtMicros ?? Date.now() * 1000,
  };
  return args.store.append(entry);
}
