const HTTPS_URL = /https:\/\/[^\s<>"'`]+/gi;
const TRAILING_URL_PUNCTUATION = /[),.;:!?]+$/u;
const MULTI_SPACE = /[ \t]{2,}/g;
const PADDED_NEWLINE = / *\n */g;
const FAKE_HOST =
  /(?:^https:\/\/)?(?:app\.zoen\.local|localhost|127\.0\.0\.1)(?:[:/]|\b)/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(text: string): unknown | undefined {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function readString(
  record: Record<string, unknown>,
  key: string
): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function flattenButton(button: unknown): string[] {
  if (typeof button === "string") {
    return [button];
  }
  if (!isRecord(button)) {
    return [];
  }
  const parts: string[] = [];
  const label = readString(button, "title") ?? readString(button, "text");
  if (label !== undefined) {
    parts.push(label);
  }
  const url = readString(button, "url");
  if (url !== undefined && !FAKE_HOST.test(url)) {
    parts.push(url);
  }
  return parts;
}

function flattenButtons(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap(flattenButton);
}

function flattenCards(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const parts: string[] = [];
  for (const card of value) {
    const nested = flattenStructured(card);
    if (nested !== undefined) {
      parts.push(nested);
    }
  }
  return parts;
}

function flattenStructured(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const { buttons, cards } = value;
  const parts: string[] = [];
  const text =
    readString(value, "text") ??
    readString(value, "title") ??
    readString(value, "body");
  if (text !== undefined) {
    parts.push(text);
  }
  parts.push(...flattenButtons(buttons), ...flattenCards(cards));
  if (parts.length === 0) {
    return undefined;
  }
  return parts.join("\n");
}

/** Drop invented/local hosts. Keep every real https that already belongs. */
export function sanitizeOutboundUrls(text: string): string {
  return text
    .replace(HTTPS_URL, (url) => {
      const trimmed = url.replace(TRAILING_URL_PUNCTUATION, "");
      if (FAKE_HOST.test(trimmed)) {
        return "";
      }
      return trimmed;
    })
    .replace(MULTI_SPACE, " ")
    .replace(PADDED_NEWLINE, "\n")
    .trim();
}

export function flattenOutbound(message: string): string {
  const trimmed = message.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const parsed = parseJson(trimmed);
    if (parsed !== undefined) {
      const structured = flattenStructured(parsed);
      if (structured !== undefined) {
        return sanitizeOutboundUrls(structured);
      }
    }
  }
  return sanitizeOutboundUrls(trimmed);
}

export function flattenInputRequests(
  requests: ReadonlyArray<{
    prompt: string;
    options?: ReadonlyArray<{ label: string }>;
  }>
): string {
  const structured = flattenStructured({
    cards: requests.map((request) => ({
      buttons: (request.options ?? []).map((option) => ({
        title: option.label,
      })),
      title: request.prompt,
    })),
  });
  return sanitizeOutboundUrls(structured ?? "");
}
