import type { PostgresTurnStoreClient } from "../../speaker/src/turn-store.js";
import {
  verifyStandardWebhook,
  WebhookVerificationError,
} from "./standard-webhooks.js";

export const WHATSAPP_INGRESS_SECRET_ENV = "ZOEN_WHATSAPP_INGRESS_SECRET";

const replay = new Map<string, number>();
const REPLAY_TTL_MS = 10 * 60 * 1000;

export type WhatsAppIngressAuthFailure =
  | "secret_missing"
  | "headers_missing"
  | "stale_timestamp"
  | "bad_signature"
  | "replay";

export class WhatsAppIngressAuthError extends Error {
  readonly code: WhatsAppIngressAuthFailure;

  constructor(code: WhatsAppIngressAuthFailure, message: string) {
    super(message);
    this.name = "WhatsAppIngressAuthError";
    this.code = code;
  }

  status(): number {
    return this.code === "secret_missing" ? 503 : 401;
  }
}

export function readWhatsAppIngressSecret(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const value = env[WHATSAPP_INGRESS_SECRET_ENV]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}

export function verifyWhatsAppInbound(input: {
  readonly secret?: string;
  readonly rawBody: string;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly now?: () => Date;
}): string {
  const secret = input.secret ?? readWhatsAppIngressSecret();
  if (secret === undefined) {
    throw new WhatsAppIngressAuthError(
      "secret_missing",
      "ZOEN_WHATSAPP_INGRESS_SECRET required",
    );
  }
  let webhookId: string;
  try {
    webhookId = verifyStandardWebhook({
      headers: input.headers,
      now: input.now,
      rawBody: input.rawBody,
      secret,
    });
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      throw new WhatsAppIngressAuthError(
        error.code === "stale_timestamp"
          ? "stale_timestamp"
          : error.code === "missing_headers"
            ? "headers_missing"
            : "bad_signature",
        error.message,
      );
    }
    throw error;
  }
  const nowMs = (input.now?.() ?? new Date()).getTime();
  for (const [id, seen] of replay) {
    if (nowMs - seen > REPLAY_TTL_MS) {
      replay.delete(id);
    }
  }
  if (replay.has(webhookId)) {
    throw new WhatsAppIngressAuthError("replay", "webhook-id already accepted");
  }
  replay.set(webhookId, nowMs);
  return webhookId;
}

export function resetWhatsAppIngressReplay(): void {
  replay.clear();
}

/**
 * Durable webhook-id claim. Namespaced so zoend and the gateway can both
 * persist without colliding on the same hop.
 */
export async function claimWhatsAppIngressReplay(
  client: PostgresTurnStoreClient,
  webhookId: string,
  namespace = "gateway",
): Promise<void> {
  const key = `${namespace}:${webhookId}`;
  const result = await client.query(
    `INSERT INTO ingress_replay (webhook_id)
     VALUES ($1)
     ON CONFLICT (webhook_id) DO NOTHING
     RETURNING webhook_id`,
    [key],
  );
  if (result.rows[0] === undefined) {
    throw new WhatsAppIngressAuthError("replay", "webhook-id already accepted");
  }
}
