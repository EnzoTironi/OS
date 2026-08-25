import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const MAX_SKEW_SECONDS = 5 * 60;

export class WebhookVerificationError extends Error {
  readonly code:
    | "missing_headers"
    | "stale_timestamp"
    | "bad_signature"
    | "bad_secret";

  constructor(
    code: WebhookVerificationError["code"],
    message: string,
  ) {
    super(message);
    this.name = "WebhookVerificationError";
    this.code = code;
  }
}

export type StandardWebhookHeaders = {
  readonly "webhook-id": string;
  readonly "webhook-timestamp": string;
  readonly "webhook-signature": string;
} & Record<string, string | undefined>;

export function extractStandardWebhookHeaders(
  headers: Record<string, string | string[] | undefined>,
): StandardWebhookHeaders {
  const id = headerValue(headers, "webhook-id");
  const timestamp = headerValue(headers, "webhook-timestamp");
  const signature = headerValue(headers, "webhook-signature");
  if (id === undefined || timestamp === undefined || signature === undefined) {
    throw new WebhookVerificationError(
      "missing_headers",
      "standard webhooks headers missing",
    );
  }
  return {
    "webhook-id": id,
    "webhook-signature": signature,
    "webhook-timestamp": timestamp,
  };
}

/** Verify Standard Webhooks signature. Returns webhook-id on success. */
export function verifyStandardWebhook(input: {
  readonly secret: string;
  readonly rawBody: string;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly now?: () => Date;
}): string {
  const headers = extractStandardWebhookHeaders(input.headers);
  const timestampSeconds = Number(headers["webhook-timestamp"]);
  if (!Number.isFinite(timestampSeconds)) {
    throw new WebhookVerificationError(
      "stale_timestamp",
      "webhook-timestamp is not a unix seconds value",
    );
  }
  const nowSeconds = Math.floor((input.now?.() ?? new Date()).getTime() / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > MAX_SKEW_SECONDS) {
    throw new WebhookVerificationError(
      "stale_timestamp",
      "webhook-timestamp outside 5-minute skew window",
    );
  }

  const keyBytes = decodeWhsec(input.secret);
  const signedContent = `${headers["webhook-id"]}.${headers["webhook-timestamp"]}.${input.rawBody}`;
  const expected = createHmac("sha256", keyBytes)
    .update(signedContent)
    .digest();

  const candidates = headers["webhook-signature"].split(" ");
  for (const candidate of candidates) {
    if (!candidate.startsWith("v1,")) {
      continue;
    }
    const provided = Buffer.from(candidate.slice(3), "base64");
    if (
      provided.length === expected.length &&
      timingSafeEqual(provided, expected)
    ) {
      return headers["webhook-id"];
    }
  }
  throw new WebhookVerificationError(
    "bad_signature",
    "webhook-signature does not match",
  );
}

/** Build a Standard Webhooks signature for local fixtures and tests. */
export function signStandardWebhook(input: {
  readonly secret: string;
  readonly webhookId: string;
  readonly timestampSeconds: number;
  readonly rawBody: string;
}): StandardWebhookHeaders {
  const keyBytes = decodeWhsec(input.secret);
  const signedContent = `${input.webhookId}.${String(input.timestampSeconds)}.${input.rawBody}`;
  const signature = createHmac("sha256", keyBytes)
    .update(signedContent)
    .digest("base64");
  return {
    "webhook-id": input.webhookId,
    "webhook-signature": `v1,${signature}`,
    "webhook-timestamp": String(input.timestampSeconds),
  };
}

/** Generate a `whsec_` secret for local signing (tests / e2e). */
export function generateWhsecSecret(bytes = 32): string {
  return `whsec_${randomBytes(bytes).toString("base64")}`;
}

function decodeWhsec(secret: string): Buffer {
  const stripped = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  try {
    const key = Buffer.from(stripped, "base64");
    if (key.length === 0) {
      throw new Error("empty");
    }
    return key;
  } catch {
    throw new WebhookVerificationError(
      "bad_secret",
      "webhook secret is not whsec_ + base64",
    );
  }
}

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const direct = headers[name] ?? headers[name.toLowerCase()];
  if (typeof direct === "string" && direct.length > 0) {
    return direct;
  }
  if (Array.isArray(direct) && typeof direct[0] === "string") {
    return direct[0];
  }
  return undefined;
}
