import { createHash } from "node:crypto";
import canonicalize from "canonicalize";

export type JcsErrorKind =
  | "empty_document"
  | "invalid_utf8"
  | "non_finite_number"
  | "unexpected_token";

export class JcsError extends Error {
  readonly kind: JcsErrorKind;

  constructor(kind: JcsErrorKind, message: string) {
    super(message);
    this.name = "JcsError";
    this.kind = kind;
  }
}

/**
 * RFC 8785 JCS via `canonicalize` 4.x. Same bytes as testdata/jcs success cases.
 * Speaker hashes its own documents. Ontology compile stays on `@zoen/ontology`.
 */
export function canonicalizeJson(input: string): string {
  return canonicalizeJsonBytes(Buffer.from(input, "utf8"));
}

export function canonicalizeJsonBytes(input: Uint8Array): string {
  const text = decodeUtf8(input);
  if (text.trim().length === 0) {
    throw new JcsError("empty_document", "empty JSON document");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new JcsError("unexpected_token", "invalid JSON document");
  }
  const canonical = canonicalize(parsed);
  if (canonical === undefined) {
    throw new JcsError("non_finite_number", "non-finite JSON number");
  }
  return canonical;
}

export function sha256Hex(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function isCanonicalDigestHex(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

function decodeUtf8(input: Uint8Array): string {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    return decoder.decode(input);
  } catch {
    throw new JcsError("invalid_utf8", "JSON is not valid UTF-8");
  }
}
