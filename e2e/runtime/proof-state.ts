import type { JourneyRunContext } from "../journey-run-context.js";
import type { RunningJourney, RunningPool } from "./proof-contracts.js";

export const assertions: Record<string, true> = {};
export const contexts: JourneyRunContext[] = [];
export const runningJourneys = new Set<RunningJourney>();
export const runningPools = new Set<RunningPool>();
export const temporaryRoots: string[] = [];
type MutableProofState = {
  alternateWorktree: string | undefined;
  sentinelStarted: boolean;
};

export const proofState: MutableProofState = {
  alternateWorktree: undefined,
  sentinelStarted: false,
};
