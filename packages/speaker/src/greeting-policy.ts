import type { InteractionScratch } from "./interaction-tools.js";

export type GreetingLocale = "pt" | "en";

/**
 * Context: bound 1:1 inbound that is only a greeting token.
 * Inputs: raw inbound text. Accents and trailing punctuation are ignored.
 * Outputs: true for oi / e aí / fala / hi / hey. Consult text stays false.
 */
export function isGreetingInbound(text: string): boolean {
  const normalized = text
    .trim()
    .toLowerCase()
    .normalize("NFC")
    .replace(/[.!?,:;…]+/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
  switch (normalized) {
    case "oi":
    case "e aí":
    case "e ai":
    case "fala":
    case "hi":
    case "hey":
      return true;
    default:
      return false;
  }
}

/**
 * Last-resort spoken line when generate is silent on a greeting.
 * Does not override `wait`.
 */
export function applyGreetingCopy(
  scratch: InteractionScratch,
  locale: GreetingLocale,
): InteractionScratch {
  scratch.bubbles.length = 0;
  scratch.href = undefined;
  scratch.waited = false;
  scratch.bubbles.push(locale === "en" ? "hey" : "oi");
  return scratch;
}
