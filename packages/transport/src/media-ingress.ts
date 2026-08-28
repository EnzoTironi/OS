/**
 * Media ingress policy. WhatsApp V1 does not ingest media and must not
 * advertise image/voice as native. Type, size, content, and provenance
 * checks exist so a future allowlist cannot skip validation.
 */

export const WHATSAPP_INGESTED_MEDIA_TYPES: readonly string[] = [];

export const MAX_MEDIA_BYTES = 8 * 1024 * 1024;

export type MediaIngressFailure =
  | "media_not_supported"
  | "media_type_rejected"
  | "media_too_large"
  | "media_content_mismatch"
  | "media_provenance_missing";

export class MediaIngressError extends Error {
  readonly code: MediaIngressFailure;

  constructor(code: MediaIngressFailure, message: string) {
    super(message);
    this.name = "MediaIngressError";
    this.code = code;
  }
}

const MEDIA_FIELDS = [
  "media",
  "mediaUrl",
  "mediaRef",
  "image",
  "imageUrl",
  "audio",
  "video",
  "document",
  "sticker",
  "mime",
  "mimetype",
] as const;

const MAGIC: ReadonlyArray<{
  readonly mime: string;
  readonly bytes: readonly number[];
}> = [
  { bytes: [0x89, 0x50, 0x4e, 0x47], mime: "image/png" },
  { bytes: [0xff, 0xd8, 0xff], mime: "image/jpeg" },
  { bytes: [0x47, 0x49, 0x46, 0x38], mime: "image/gif" },
  { bytes: [0x25, 0x50, 0x44, 0x46], mime: "application/pdf" },
];

export function whatsappAdvertisesMedia(): boolean {
  return WHATSAPP_INGESTED_MEDIA_TYPES.length > 0;
}

export function rejectWhatsAppMediaFields(raw: unknown): void {
  if (raw === null || typeof raw !== "object") {
    return;
  }
  const record = raw as Record<string, unknown>;
  const admitted = admittedCompanionSpreadsheetOrVoice(record);
  for (const field of MEDIA_FIELDS) {
    if (admitted && (field === "mediaRef" || field === "mime")) {
      continue;
    }
    const value = record[field];
    if (value !== undefined && value !== null && value !== "") {
      throw new MediaIngressError(
        "media_not_supported",
        `WhatsApp does not ingest ${field}`,
      );
    }
  }
}

const CONVERTIBLE_EXT = [
  ".csv",
  ".doc",
  ".docm",
  ".docx",
  ".odp",
  ".ods",
  ".odt",
  ".pdf",
  ".ppt",
  ".pptx",
  ".xls",
  ".xlsx",
] as const;

/**
 * Companion document that may be planted onto isolate inbound/.
 * Voice notes stay admitted as evidence but are not AnyDoc input.
 */
export function admittedCompanionDocumentRef(
  raw: unknown,
): { filename: string; mediaRef: string } | undefined {
  if (raw === null || typeof raw !== "object") {
    return undefined;
  }
  const record = raw as Record<string, unknown>;
  if (!isConvertibleDocument(record)) {
    return undefined;
  }
  const mediaRef =
    typeof record.mediaRef === "string" ? record.mediaRef.trim() : "";
  const named =
    typeof record.filename === "string" ? record.filename.trim() : "";
  const fallback = mediaRef.split("/").pop() ?? mediaRef;
  return { filename: named.length > 0 ? named : fallback, mediaRef };
}

/** Spreadsheet, office, PDF, CSV, and voice notes are inbound evidence. Not native. */
function admittedCompanionSpreadsheetOrVoice(
  record: Record<string, unknown>,
): boolean {
  const kind = typeof record.mediaKind === "string" ? record.mediaKind : "";
  const ref =
    typeof record.mediaRef === "string" ? record.mediaRef.trim() : "";
  if (ref.length === 0) {
    return false;
  }
  return kind === "audio" || isConvertibleDocument(record);
}

function isConvertibleDocument(record: Record<string, unknown>): boolean {
  const kind = typeof record.mediaKind === "string" ? record.mediaKind : "";
  const ref =
    typeof record.mediaRef === "string" ? record.mediaRef.trim() : "";
  if (kind !== "document" || ref.length === 0) {
    return false;
  }
  const mime = typeof record.mime === "string" ? record.mime.toLowerCase() : "";
  const filename =
    typeof record.filename === "string" ? record.filename.toLowerCase() : "";
  const blob = `${filename} ${mime}`;
  return (
    CONVERTIBLE_EXT.some((ext) => filename.endsWith(ext) || ref.toLowerCase().endsWith(ext)) ||
    /sheet|excel|csv|pdf|word|presentation|opendocument|msword|ms-excel|ms-powerpoint/.test(
      blob,
    )
  );
}

export function validateMediaBlob(input: {
  readonly bytes: Uint8Array;
  readonly declaredMime?: string;
  readonly provenance?: string;
  readonly allow?: readonly string[];
}): void {
  const allow = input.allow ?? WHATSAPP_INGESTED_MEDIA_TYPES;
  if (allow.length === 0) {
    throw new MediaIngressError(
      "media_not_supported",
      "no media types are ingested",
    );
  }
  if (input.bytes.byteLength === 0 || input.bytes.byteLength > MAX_MEDIA_BYTES) {
    throw new MediaIngressError("media_too_large", "media exceeds size bounds");
  }
  if (input.provenance === undefined || input.provenance.trim().length === 0) {
    throw new MediaIngressError(
      "media_provenance_missing",
      "media provenance required",
    );
  }
  const detected = detectMime(input.bytes);
  const declared = input.declaredMime?.toLowerCase();
  if (declared === undefined || !allow.includes(declared)) {
    throw new MediaIngressError("media_type_rejected", "media type not allowlisted");
  }
  if (detected === undefined || detected !== declared) {
    throw new MediaIngressError(
      "media_content_mismatch",
      "media magic does not match declared type",
    );
  }
}

function detectMime(bytes: Uint8Array): string | undefined {
  for (const candidate of MAGIC) {
    if (bytes.length < candidate.bytes.length) {
      continue;
    }
    if (candidate.bytes.every((value, index) => bytes[index] === value)) {
      return candidate.mime;
    }
  }
  return undefined;
}
