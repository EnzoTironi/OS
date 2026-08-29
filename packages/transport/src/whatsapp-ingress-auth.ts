import type { PostgresQueryClient } from "./postgres-query.js";
import {
  verifyStandardWebhook,
  WebhookVerificationError,
} from "./standard-webhooks.js";

export const WHATSAPP_INGRESS_SECRET_ENV = "ZOEN_WHATSAPP_INGRESS_SECRET";

/** Persist-only hop prefix. HMAC still signs the raw `webhook-id`. */
export const GATEWAY_INGRESS_REPLAY_NAMESPACE = "gateway:";

function namespacedIngressReplayId(webhookId: string): string {
  return `${GATEWAY_INGRESS_REPLAY_NAMESPACE}${webhookId}`;
}

export type WhatsAppIngressAuthFailure =
  | "secret_missing"
  | "headers_missing"
  | "stale_timestamp"
  | "bad_signature"
  | "replay"
  | "store_failure";

export class WhatsAppIngressAuthError extends Error {
  readonly code: WhatsAppIngressAuthFailure;

  constructor(code: WhatsAppIngressAuthFailure, message: string) {
    super(message);
    this.name = "WhatsAppIngressAuthError";
    this.code = code;
  }

  status(): number {
    return this.code === "secret_missing" || this.code === "store_failure"
      ? 503
      : 401;
  }
}

export interface IngressReplayStore {
  begin(webhookId: string): Promise<void>;
  commit(webhookId: string): Promise<void>;
  contains(webhookId: string): Promise<boolean>;
  release(webhookId: string): Promise<void>;
}

export function createMemoryIngressReplayStore(): IngressReplayStore {
  const inflight = new Set<string>();
  const committed = new Set<string>();
  return {
    async begin(webhookId) {
      const key = namespacedIngressReplayId(webhookId);
      if (inflight.has(key)) {
        throw new WhatsAppIngressAuthError("replay", "webhook-id already accepted");
      }
      inflight.add(key);
    },
    async contains(webhookId) {
      return committed.has(namespacedIngressReplayId(webhookId));
    },
    async commit(webhookId) {
      const key = namespacedIngressReplayId(webhookId);
      committed.add(key);
      inflight.delete(key);
    },
    async release(webhookId) {
      inflight.delete(namespacedIngressReplayId(webhookId));
    },
  };
}

export function createPostgresIngressReplayStore(
  client: PostgresQueryClient,
): IngressReplayStore {
  const inflight = new Set<string>();
  return {
    async begin(webhookId) {
      const key = namespacedIngressReplayId(webhookId);
      if (inflight.has(key)) {
        throw new WhatsAppIngressAuthError("replay", "webhook-id already accepted");
      }
      inflight.add(key);
    },
    async contains(webhookId) {
      const key = namespacedIngressReplayId(webhookId);
      const result = await client.query(
        `SELECT webhook_id FROM ingress_replay WHERE webhook_id = $1`,
        [key],
      );
      return result.rows[0] !== undefined;
    },
    async commit(webhookId) {
      const key = namespacedIngressReplayId(webhookId);
      try {
        await client.query(
          `INSERT INTO ingress_replay (webhook_id)
           VALUES ($1)
           ON CONFLICT (webhook_id) DO NOTHING`,
          [key],
        );
      } finally {
        inflight.delete(key);
      }
    },
    async release(webhookId) {
      inflight.delete(namespacedIngressReplayId(webhookId));
    },
  };
}

export function readWhatsAppIngressSecret(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const value = env[WHATSAPP_INGRESS_SECRET_ENV]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}

/** HMAC-only Standard Webhooks check. Replay is a store. */
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
  try {
    return verifyStandardWebhook({
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
}

/**
 * In-flight lock, then work, then durable commit after success.
 * Release the lock on error so a retry can run.
 */
export async function admitWhatsAppIngress(input: {
  readonly store: IngressReplayStore;
  readonly webhookId: string;
  readonly work: () => Promise<void>;
}): Promise<void> {
  await input.store.begin(input.webhookId);
  try {
    if (await input.store.contains(input.webhookId)) {
      throw new WhatsAppIngressAuthError("replay", "webhook-id already accepted");
    }
    await input.work();
    await input.store.commit(input.webhookId);
  } catch (error) {
    await input.store.release(input.webhookId);
    throw error;
  }
}

/** Kept for tests that reset module state between cases. */
export function resetWhatsAppIngressReplay(): void {
  return;
}
