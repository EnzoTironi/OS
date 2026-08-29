import type { InteractionControlRef } from "./brands.js";

export function stepUpUrl(origin: string, ref: InteractionControlRef): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/approve/${ref}`;
}
