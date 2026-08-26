/**
 * Coarse inbound intent for the host-owned status phrase.
 *
 * This does not decide wait vs speak. The `wait` tool still owns that
 * speech act. The regex only names which status line transport may send
 * if the turn has already started non-wait work past the gate.
 */

export type StatusLocale = "pt" | "en";

export type StatusIntent = "note" | "remind" | "lookup" | "generic";

const NOTE_PATTERN =
  /\b(anota|anote|anotar|guarda|guardar|escreve|escrever|note down|write down)\b/i;
const REMIND_PATTERN =
  /\b(lembr[ae]|lembrar|agenda|agendar|marca|marcar|remind|schedule)\b/i;
const LOOKUP_PATTERN =
  /\b(quanto|cotação|cotacao|pedido|preço|preco|prazo|onde|status|how much|quote|order|price|when|where)\b/i;

/**
 * Name the status-phrase intent for one inbound text.
 *
 * Empty or unmatched text is `generic`. Acknowledgments such as `ok` /
 * `valeu` stay `generic` so Tier 2 still runs.
 */
export function classifyStatusIntent(text: string): StatusIntent {
  const normalized = text.trim();
  if (normalized.length === 0) {
    return "generic";
  }
  if (NOTE_PATTERN.test(normalized)) {
    return "note";
  }
  if (REMIND_PATTERN.test(normalized)) {
    return "remind";
  }
  if (LOOKUP_PATTERN.test(normalized)) {
    return "lookup";
  }
  return "generic";
}

const STATUS_PHRASES: Record<StatusLocale, Record<StatusIntent, string>> = {
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

/** Same locale and intent always name the same phrase. */
export function pickStatusPhrase(
  locale: StatusLocale,
  intent: StatusIntent,
): string {
  return STATUS_PHRASES[locale][intent];
}

/** True when `text` is exactly one of the status phrases for `locale`. */
export function isStatusPhrase(text: string, locale: StatusLocale): boolean {
  return Object.values(STATUS_PHRASES[locale]).includes(text.trim());
}

/**
 * Drop a leading host-owned status phrase from final bubbles.
 * Leaves the rest of the list untouched, including a phrase that is only
 * a prefix of a longer bubble.
 */
export function dropLeadingStatusPhrase(
  bubbles: readonly string[],
  locale: StatusLocale,
): string[] {
  const first = bubbles[0];
  if (first !== undefined && isStatusPhrase(first, locale)) {
    return bubbles.slice(1);
  }
  return [...bubbles];
}
