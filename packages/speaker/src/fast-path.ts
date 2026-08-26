/**
 * Tier 1: deterministic, no-model classification for one inbound text.
 *
 * Two jobs, both sub-millisecond and side-effect free. First, recognize a
 * closing acknowledgment (valeu, ok, thanks) so the turn can skip Tier 2
 * entirely, the same outcome the `wait` tool produces today but without
 * paying for a model round trip. Second, name the coarse intent behind a
 * message so the status gate (see status-gate.ts) can show a status line
 * that matches what Tier 2 is doing instead of a generic filler.
 */

export type FastPathLocale = "pt" | "en";

export type FastPathIntent = "note" | "remind" | "lookup" | "generic";

export type FastPathClassification =
  | { readonly kind: "simple_ack" }
  | { readonly kind: "continue"; readonly intent: FastPathIntent };

// Mirrors the closing-ack list already named in interactionInstructions:
// pt "valeu, ok, show, obrigado", en "thanks, ok, show".
const ACK_PATTERN =
  /^(valeu|vlw|obrigad[oa]s?|obg|de nada|ok(?:ay)?|show|thanks?(?: you)?|tks|ty)[.!]*$/i;

const NOTE_PATTERN =
  /\b(anota|anote|anotar|guarda|guardar|escreve|escrever|note down|write down)\b/i;
const REMIND_PATTERN =
  /\b(lembr[ae]|lembrar|agenda|agendar|marca|marcar|remind|schedule)\b/i;
const LOOKUP_PATTERN =
  /\b(quanto|cotação|cotacao|pedido|preço|preco|prazo|onde|status|how much|quote|order|price|when|where)\b/i;

/**
 * Classify one inbound text without a model call.
 *
 * @param text - Raw inbound text, untrimmed is fine
 * @returns `simple_ack` when the turn can end right away (empty send, no
 * Tier 2), otherwise `continue` with the coarse intent Tier 2 is about to
 * work on
 */
export function classifyFastPath(text: string): FastPathClassification {
  const normalized = text.trim();
  if (normalized.length === 0) {
    return { intent: "generic", kind: "continue" };
  }
  if (ACK_PATTERN.test(normalized)) {
    return { kind: "simple_ack" };
  }
  if (NOTE_PATTERN.test(normalized)) {
    return { intent: "note", kind: "continue" };
  }
  if (REMIND_PATTERN.test(normalized)) {
    return { intent: "remind", kind: "continue" };
  }
  if (LOOKUP_PATTERN.test(normalized)) {
    return { intent: "lookup", kind: "continue" };
  }
  return { intent: "generic", kind: "continue" };
}

const STATUS_PHRASES: Record<FastPathLocale, Record<FastPathIntent, string>> = {
  en: {
    generic: "one sec",
    lookup: "looking",
    note: "noting",
    remind: "scheduling",
  },
  pt: {
    generic: "um seg",
    lookup: "vendo",
    note: "anotando",
    remind: "agendando",
  },
};

/**
 * Immediate, context-aware status line for `intent`. No model call, no
 * randomness: same locale and intent always name the same phrase.
 */
export function pickStatusPhrase(
  locale: FastPathLocale,
  intent: FastPathIntent,
): string {
  return STATUS_PHRASES[locale][intent];
}

/** True when `text` is exactly one of the status phrases for `locale`. */
export function isStatusPhrase(text: string, locale: FastPathLocale): boolean {
  return Object.values(STATUS_PHRASES[locale]).includes(text.trim());
}
