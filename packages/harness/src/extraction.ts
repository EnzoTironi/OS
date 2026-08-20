import {
  Format,
  formatFromBytes,
  toMarkdownBytes,
  type ConvertErrorCode,
} from "@firecrawl/anydoc";
import { z } from "zod";

export const companyIdentifierSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/);
const base64 = z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/);
const messageSchema = z
  .object({
    channel: z.string().min(1).max(200),
    messageId: companyIdentifierSchema,
    sender: z.string().min(1).max(500),
    sentAt: z.iso.datetime(),
    subject: z.string().min(1).max(1_000),
    text: z.string().min(1).max(100_000),
  })
  .strict();

export const sourceInputSchema = z.discriminatedUnion("kind", [
  z
    .object({
      contentBase64: base64,
      filename: z.string().min(1).max(500),
      kind: z.literal("pdf"),
      sourceId: companyIdentifierSchema,
    })
    .strict(),
  z
    .object({
      filename: z.string().min(1).max(500),
      kind: z.literal("message"),
      message: messageSchema,
      sourceId: companyIdentifierSchema,
    })
    .strict(),
]);
export type SourceInput = z.infer<typeof sourceInputSchema>;

export interface ConvertError extends Error {
  readonly code: ConvertErrorCode;
}

export interface ParserProvenance {
  readonly extractionVersion: string;
  readonly name: string;
  readonly versionDigestInput: string;
}

const anydocParser = parserProvenance(
  "@firecrawl/anydoc",
  "0.2.0",
  "gfm-v1",
);
const messageParser = parserProvenance(
  "zoen-message-json",
  "1.0.0",
  "gfm-v1",
);

export function parserForSource(input: SourceInput): ParserProvenance {
  switch (input.kind) {
    case "pdf":
      return anydocParser;
    case "message":
      return messageParser;
    default: {
      const exhaustive: never = input;
      return exhaustive;
    }
  }
}

export function sourceBytes(input: SourceInput): Uint8Array {
  switch (input.kind) {
    case "pdf":
      return Buffer.from(input.contentBase64, "base64");
    case "message":
      return new TextEncoder().encode(
        JSON.stringify({
          channel: input.message.channel,
          messageId: input.message.messageId,
          sender: input.message.sender,
          sentAt: input.message.sentAt,
          subject: input.message.subject,
          text: input.message.text,
        }),
      );
    default: {
      const exhaustive: never = input;
      return exhaustive;
    }
  }
}

export async function extractCompanySource(
  mediaType: string,
  bytes: Uint8Array,
): Promise<readonly string[]> {
  return mediaType === "application/pdf"
    ? [await extractPdfMarkdown(bytes)]
    : extractMessage(bytes);
}

export async function extractPdfMarkdown(bytes: Uint8Array): Promise<string> {
  if (formatFromBytes(bytes) !== "pdf") {
    throw convertError(
      "unsupported",
      "source bytes do not contain a supported PDF signature",
    );
  }
  const markdown = (await toMarkdownBytes(bytes, Format.pdf)).trim();
  if (markdown.length === 0) {
    throw convertError(
      "unsupported",
      "PDF contains no extractable text and may require OCR",
    );
  }
  return markdown;
}

export function isConvertError(error: unknown): error is ConvertError {
  return (
    error instanceof Error &&
    "code" in error &&
    [
      "encrypted",
      "io",
      "malformed",
      "missingPart",
      "resourceLimit",
      "unsupported",
    ].includes(String(error.code))
  );
}

function extractMessage(bytes: Uint8Array): readonly string[] {
  const raw: unknown = JSON.parse(new TextDecoder().decode(bytes));
  const message = messageSchema.parse(raw);
  return [
    [
      `Subject: ${message.subject}`,
      `From: ${message.sender}`,
      `Channel: ${message.channel}`,
      `Sent: ${message.sentAt}`,
      "",
      message.text,
    ].join("\n"),
  ];
}

function parserProvenance(
  name: string,
  version: string,
  renderer: string,
): ParserProvenance {
  return {
    extractionVersion: `${name}@${version}:${renderer}`,
    name,
    versionDigestInput: `${name}\0${version}\0${renderer}`,
  };
}

function convertError(code: ConvertErrorCode, message: string): ConvertError {
  return Object.assign(new Error(message), { code });
}
