export class WhatsAppMinuteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WhatsAppMinuteError";
  }
}

export interface WhatsAppMinuteRival {
  readonly sourceId: string;
  readonly label: string;
}

export interface WhatsAppMinuteInput {
  readonly entityId: string;
  readonly rivals: readonly WhatsAppMinuteRival[];
  readonly actionUrl: string;
}

export function parseWhatsAppMinuteSpec(raw: string): WhatsAppMinuteInput {
  const parsed: unknown = JSON.parse(raw);
  if (parsed === null || typeof parsed !== "object") {
    throw new WhatsAppMinuteError("minute spec must be an object");
  }
  const record = parsed as {
    actionUrl?: unknown;
    entityId?: unknown;
    rivals?: unknown;
  };
  if (typeof record.entityId !== "string" || typeof record.actionUrl !== "string") {
    throw new WhatsAppMinuteError("minute spec missing entityId or actionUrl");
  }
  if (!Array.isArray(record.rivals)) {
    throw new WhatsAppMinuteError("minute spec rivals must be an array");
  }
  const rivals: WhatsAppMinuteRival[] = [];
  for (const row of record.rivals) {
    if (row === null || typeof row !== "object") {
      throw new WhatsAppMinuteError("minute rival must be an object");
    }
    const rival = row as { label?: unknown; sourceId?: unknown };
    if (typeof rival.label !== "string" || typeof rival.sourceId !== "string") {
      throw new WhatsAppMinuteError("minute rival missing label or sourceId");
    }
    rivals.push({ label: rival.label, sourceId: rival.sourceId });
  }
  return {
    actionUrl: record.actionUrl,
    entityId: record.entityId,
    rivals,
  };
}

export function formatWhatsAppMinuteText(input: WhatsAppMinuteInput): string {
  if (input.entityId.trim().length === 0) {
    throw new WhatsAppMinuteError("minute entity id required");
  }
  if (input.rivals.length < 2) {
    throw new WhatsAppMinuteError("minute requires two quantity rivals");
  }
  const url = input.actionUrl.trim();
  if (!/^https:\/\//i.test(url)) {
    throw new WhatsAppMinuteError("minute actionUrl must be https");
  }
  const lines = [
    input.entityId.trim(),
    ...input.rivals.map((rival) => `${rival.label} (${rival.sourceId})`),
    url,
  ];
  const text = lines.join("\n");
  const httpsCount = text.split("https://").length - 1;
  if (httpsCount !== 1) {
    throw new WhatsAppMinuteError("minute must contain exactly one https URL");
  }
  if (
    text.includes("cta_url") ||
    text.includes("quick_reply") ||
    text.includes("zoen-rich:")
  ) {
    throw new WhatsAppMinuteError("minute forbids native WhatsApp widgets");
  }
  return text;
}
