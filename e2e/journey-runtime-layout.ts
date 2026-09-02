import { createHash } from "node:crypto";

export const journeyPortBase = 20_000;
export const journeyPortBlockWidth = 32;
export const journeyPortSlotCount = 384;

export function journeyPortAt(slot: number, offset: number): number {
  return journeyPortBase + slot * journeyPortBlockWidth + offset;
}

export function preferredJourneyPortSlot(
  suiteId: string,
  scenario: string,
  runId: string,
): number {
  const runKey = createHash("sha256")
    .update(`${suiteId}\0${scenario}\0${runId}`)
    .digest("hex");
  return Number.parseInt(runKey.slice(0, 8), 16) % journeyPortSlotCount;
}
