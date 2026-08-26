import type {
  ConversationDroppedReason,
  ConversationContextRecord,
} from "./context-document.js";

export const DEFAULT_DATA_TOKEN_BUDGET = 6000;

export interface ConversationBudgetDrop {
  readonly reason: Extract<ConversationDroppedReason, "budget">;
  readonly recordId: string;
}

export interface ConversationBudgetResult {
  readonly dropped: ConversationBudgetDrop[];
  readonly records: ConversationContextRecord[];
}

export interface ApplyConversationBudgetInput {
  readonly budget?: number;
  readonly carryForwardInteractionIds: readonly string[];
  readonly claimedInteractionIds: readonly string[];
  readonly records: readonly ConversationContextRecord[];
}

export function applyConversationBudget(
  input: ApplyConversationBudgetInput,
): ConversationBudgetResult {
  const budget = input.budget ?? DEFAULT_DATA_TOKEN_BUDGET;
  if (budget < 0) {
    throw new Error("conversation data token budget must be >= 0");
  }
  const claimed = new Set(input.claimedInteractionIds);
  const carryForward = new Set(input.carryForwardInteractionIds);
  const records = input.records.map(cloneRecord);
  const dropped: ConversationBudgetDrop[] = [];

  const overBudget = (): boolean => dataTokens(records) > budget;
  if (!overBudget()) {
    return { dropped, records };
  }

  dropKnowledge(records, dropped, overBudget);
  stripOldestCarryForwardText(records, carryForward, claimed, dropped, overBudget);
  dropOldestPersonalMemory(records, dropped, overBudget);
  dropWorldNotes(records, dropped, overBudget);
  truncateRemainingText(records, claimed, dropped, budget);
  lastResortTruncateOversized(records, dropped, budget);

  return { dropped, records };
}

export function estimateDataTokens(chars: number): number {
  if (chars <= 0) {
    return 0;
  }
  return Math.ceil(chars / 4);
}

function dataTokens(records: readonly ConversationContextRecord[]): number {
  let chars = 0;
  for (const record of records) {
    chars += speakableChars(record);
  }
  return estimateDataTokens(chars);
}

function speakableChars(record: ConversationContextRecord): number {
  switch (record.payload.type) {
    case "instruction":
      return 0;
    case "interaction":
      return (record.payload.text ?? record.payload.mediaRef ?? "").length;
    case "preference":
      return record.payload.text.length;
    case "knowledge":
      return record.payload.text.length;
    case "world":
      return (
        record.payload.notes.join("").length +
        record.payload.rivals.map((rival) => rival.label).join("").length
      );
    case "history":
      return record.payload.labels.join("").length;
    case "personal_memory":
      return record.payload.body.length;
    default: {
      const exhaustive: never = record.payload;
      return exhaustive;
    }
  }
}

function dropKnowledge(
  records: ConversationContextRecord[],
  dropped: ConversationBudgetDrop[],
  overBudget: () => boolean,
): void {
  for (let index = records.length - 1; index >= 0 && overBudget(); index -= 1) {
    const record = records[index];
    if (record === undefined || record.trustClass !== "knowledge") {
      continue;
    }
    dropped.push({ reason: "budget", recordId: record.recordId });
    records.splice(index, 1);
  }
}

function stripOldestCarryForwardText(
  records: ConversationContextRecord[],
  carryForward: ReadonlySet<string>,
  claimed: ReadonlySet<string>,
  dropped: ConversationBudgetDrop[],
  overBudget: () => boolean,
): void {
  for (const record of records) {
    if (!overBudget()) {
      return;
    }
    if (record.payload.type !== "interaction") {
      continue;
    }
    if (record.attribution.kind !== "interaction") {
      continue;
    }
    const interactionId = record.attribution.interactionId;
    if (claimed.has(interactionId) || !carryForward.has(interactionId)) {
      continue;
    }
    if ((record.payload.text ?? "").length === 0) {
      continue;
    }
    record.payload = { kind: record.payload.kind, type: "interaction" };
    dropped.push({ reason: "budget", recordId: record.recordId });
  }
}

function dropOldestPersonalMemory(
  records: ConversationContextRecord[],
  dropped: ConversationBudgetDrop[],
  overBudget: () => boolean,
): void {
  for (let index = 0; index < records.length && overBudget(); index += 1) {
    const record = records[index];
    if (record === undefined || record.trustClass !== "personal_memory") {
      continue;
    }
    dropped.push({ reason: "budget", recordId: record.recordId });
    records.splice(index, 1);
    index -= 1;
  }
}

function dropWorldNotes(
  records: ConversationContextRecord[],
  dropped: ConversationBudgetDrop[],
  overBudget: () => boolean,
): void {
  for (const record of records) {
    if (!overBudget()) {
      return;
    }
    if (record.payload.type !== "world" || record.payload.notes.length === 0) {
      continue;
    }
    record.payload = {
      notes: [],
      rivals: record.payload.rivals,
      type: "world",
    };
    dropped.push({ reason: "budget", recordId: record.recordId });
  }
}

function truncateRemainingText(
  records: ConversationContextRecord[],
  claimed: ReadonlySet<string>,
  dropped: ConversationBudgetDrop[],
  budget: number,
): void {
  if (dataTokens(records) <= budget) {
    return;
  }
  for (const record of records) {
    if (dataTokens(records) <= budget) {
      return;
    }
    if (isClaimedInbound(record, claimed)) {
      continue;
    }
    const before = speakableChars(record);
    applyTextTruncate(record, remainingChars(records, before, budget));
    if (speakableChars(record) < before) {
      dropped.push({ reason: "budget", recordId: record.recordId });
    }
  }
}

function lastResortTruncateOversized(
  records: ConversationContextRecord[],
  dropped: ConversationBudgetDrop[],
  budget: number,
): void {
  if (dataTokens(records) <= budget) {
    return;
  }
  for (const record of records) {
    if (dataTokens(records) <= budget) {
      return;
    }
    const chars = speakableChars(record);
    if (chars <= budget * 4) {
      continue;
    }
    applyTextTruncate(record, remainingChars(records, chars, budget));
    if (speakableChars(record) < chars) {
      dropped.push({ reason: "budget", recordId: record.recordId });
    }
  }
}

function isClaimedInbound(
  record: ConversationContextRecord,
  claimed: ReadonlySet<string>,
): boolean {
  return (
    record.payload.type === "interaction" &&
    record.attribution.kind === "interaction" &&
    claimed.has(record.attribution.interactionId)
  );
}

function applyTextTruncate(
  record: ConversationContextRecord,
  maxChars: number,
): void {
  switch (record.payload.type) {
    case "instruction":
    case "world":
    case "history":
      return;
    case "interaction": {
      const text = record.payload.text;
      if (text === undefined || text.length === 0) {
        return;
      }
      record.payload = {
        kind: record.payload.kind,
        text: truncateToBudget(text, maxChars),
        type: "interaction",
        ...(record.payload.mediaRef === undefined
          ? {}
          : { mediaRef: record.payload.mediaRef }),
      };
      return;
    }
    case "preference":
      record.payload = {
        ...record.payload,
        text: truncateToBudget(record.payload.text, maxChars),
      };
      return;
    case "knowledge":
      record.payload = {
        ...record.payload,
        text: truncateToBudget(record.payload.text, maxChars),
      };
      return;
    case "personal_memory":
      record.payload = {
        ...record.payload,
        body: truncateToBudget(record.payload.body, maxChars),
      };
      return;
    default: {
      const exhaustive: never = record.payload;
      return exhaustive;
    }
  }
}

function remainingChars(
  records: readonly ConversationContextRecord[],
  currentChars: number,
  budget: number,
): number {
  let usedChars = 0;
  for (const record of records) {
    usedChars += speakableChars(record);
  }
  if (estimateDataTokens(usedChars) <= budget) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, budget * 4 - (usedChars - currentChars));
}

function truncateToBudget(text: string, maxChars: number): string {
  if (!Number.isFinite(maxChars) || maxChars >= text.length) {
    return text;
  }
  return text.slice(0, Math.max(0, maxChars));
}

function cloneRecord(
  record: ConversationContextRecord,
): ConversationContextRecord {
  return {
    ...record,
    payload: structuredClone(record.payload),
  };
}
