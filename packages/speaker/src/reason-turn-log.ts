/**
 * Context: one Fly stderr line per bound turn (`reasonTurn`).
 * Inputs: speaker facts plus the host's `statusFired` (`raced.gated`).
 * Outputs: JSON keys only. No API keys, bearer, prompt, inbound dump, JWT,
 * entity ids, or a full URL with query/token.
 * Side effects: one stderr write from `emitReasonTurnLog`.
 * Related: `attemptId` equals `conversationContext.contextRef`.
 */
export const REASON_TURN_LOG_KEYS = [
  "attemptId",
  "bubbleCount",
  "errorClass",
  "event",
  "generate",
  "generateMs",
  "hasMemory",
  "hasWorld",
  "hrefHost",
  "hrefPath",
  "hrefPresent",
  "hrefSource",
  "model",
  "path",
  "recordCount",
  "rivals",
  "statusFired",
  "tools",
] as const;

export type ReasonTurnLogKey = (typeof REASON_TURN_LOG_KEYS)[number];

export type ReasonTurnPath =
  | "lookupFail"
  | "scheduleFail"
  | "threw"
  | "noModel"
  | "spoke"
  | "wait";

export type ReasonTurnGenerate = "ok" | "throw";

export type ReasonTurnHrefSource = "fallback" | "mint" | "none" | "speech";

/**
 * Speaker facts for one turn. No `statusFired` — that is a host race fact.
 */
export interface ReasonTurnFacts {
  readonly attemptId: string;
  readonly bubbleCount: number;
  readonly errorClass: string | null;
  readonly generate: ReasonTurnGenerate;
  readonly generateMs: number;
  readonly hasMemory: boolean;
  readonly hasWorld: boolean;
  readonly hrefHost: string | null;
  readonly hrefPath: string | null;
  readonly hrefPresent: boolean;
  readonly hrefSource: ReasonTurnHrefSource;
  readonly model: string | null;
  readonly path: ReasonTurnPath;
  readonly recordCount: number;
  readonly rivals: number;
  readonly tools: readonly string[];
}

export interface ReasonTurnLog extends ReasonTurnFacts {
  readonly event: "reasonTurn";
  readonly statusFired: boolean;
}

/**
 * Context: host writes after `raceWithStatusGate`.
 * Inputs: speaker facts plus `statusFired: raced.gated`.
 * Outputs: one JSON line. Spread — do not hand-copy keys.
 * Side effects: writes stderr.
 */
export function emitReasonTurnLog(
  facts: ReasonTurnFacts & { readonly statusFired: boolean },
): void {
  const line: ReasonTurnLog = { ...facts, event: "reasonTurn" };
  process.stderr.write(`${JSON.stringify(line)}\n`);
}
