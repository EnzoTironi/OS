import type { PreferencePayload } from "../../harness/src/index.js";
import type {
  AttentionClassPolicy,
  AttentionDeliveryPreference,
  PreferenceDecisionEvidence,
} from "./types.js";

export type PreferenceRow = {
  readonly preferenceId: string;
  readonly key: string;
  readonly value: PreferencePayload | AttentionDeliveryPreference;
};

export type PreferenceDecision =
  | {
      readonly kind: "deliver";
      readonly evidence: PreferenceDecisionEvidence;
      readonly delivery: AttentionDeliveryPreference;
    }
  | {
      readonly kind: "hold";
      readonly evidence: PreferenceDecisionEvidence;
      readonly reason: string;
      readonly delivery: AttentionDeliveryPreference;
    };

const DEFAULT_DELIVERY: AttentionDeliveryPreference = {
  type: "attention_delivery",
  mode: "immediate",
  cooldownMinutes: 0,
  preferredChannels: ["dm"],
  fallbackChannels: ["web_surface"],
  mute: false,
  escalationPrincipalIds: [],
  redactSensitiveBody: true,
};

export function parseAttentionDelivery(
  value: unknown,
): AttentionDeliveryPreference | undefined {
  if (value === null || typeof value !== "object") {
    return undefined;
  }
  const row = value as Record<string, unknown>;
  if (row.type !== "attention_delivery") {
    return undefined;
  }
  return {
    type: "attention_delivery",
    mode: row.mode === "digest" ? "digest" : "immediate",
    cooldownMinutes: Number(row.cooldownMinutes ?? 0),
    maxPerDay:
      row.maxPerDay === undefined ? undefined : Number(row.maxPerDay),
    preferredChannels: Array.isArray(row.preferredChannels)
      ? (row.preferredChannels as AttentionDeliveryPreference["preferredChannels"])
      : ["dm"],
    fallbackChannels: Array.isArray(row.fallbackChannels)
      ? (row.fallbackChannels as AttentionDeliveryPreference["fallbackChannels"])
      : ["web_surface"],
    mute: Boolean(row.mute),
    snoozeUntil:
      typeof row.snoozeUntil === "string" ? row.snoozeUntil : undefined,
    escalationPrincipalIds: Array.isArray(row.escalationPrincipalIds)
      ? row.escalationPrincipalIds.map(String)
      : [],
    redactSensitiveBody: row.redactSensitiveBody !== false,
  };
}

export function decideAttentionPreferences(input: {
  readonly prefs: readonly PreferenceRow[];
  readonly classPolicy: AttentionClassPolicy;
  readonly now: Date;
  readonly lastDeliveredAt?: string;
}): PreferenceDecision {
  const preferenceIds = input.prefs.map((row) => row.preferenceId);
  let delivery = { ...DEFAULT_DELIVERY };
  let quiet: Extract<PreferencePayload, { type: "quiet_hours" }> | undefined;

  for (const row of input.prefs) {
    if (row.value.type === "attention_delivery") {
      const parsed = parseAttentionDelivery(row.value);
      if (parsed !== undefined) {
        delivery = parsed;
      }
    } else if (row.value.type === "quiet_hours") {
      quiet = row.value;
    } else if (row.value.type === "notification" && row.value.channel === "mute") {
      delivery = { ...delivery, mute: true };
    }
  }

  const decidedAt = input.now.toISOString();
  const muted = delivery.mute;
  const snoozed =
    delivery.snoozeUntil !== undefined &&
    Date.parse(delivery.snoozeUntil) > input.now.getTime();
  const quietHoursApplied =
    quiet !== undefined && isInQuietHours(input.now, quiet);
  const cooldownApplied =
    delivery.cooldownMinutes > 0 &&
    input.lastDeliveredAt !== undefined &&
    input.now.getTime() - Date.parse(input.lastDeliveredAt) <
      delivery.cooldownMinutes * 60_000;
  const digestHeld = delivery.mode === "digest";
  const criticalBypassMute = input.classPolicy.critical && muted;

  const evidence: PreferenceDecisionEvidence = {
    quietHoursApplied,
    cooldownApplied,
    digestHeld,
    muted,
    snoozed,
    escalationUsed: false,
    criticalBypassMute,
    decidedAt,
    preferenceIds,
  };

  if (muted && !input.classPolicy.critical) {
    return {
      kind: "hold",
      evidence,
      reason: "muted",
      delivery,
    };
  }
  if (snoozed && !input.classPolicy.critical) {
    return {
      kind: "hold",
      evidence,
      reason: "snoozed",
      delivery,
    };
  }
  if (quietHoursApplied && !input.classPolicy.critical) {
    return {
      kind: "hold",
      evidence,
      reason: "quiet_hours",
      delivery,
    };
  }
  if (cooldownApplied && !input.classPolicy.critical) {
    return {
      kind: "hold",
      evidence,
      reason: "cooldown",
      delivery,
    };
  }
  if (digestHeld && !input.classPolicy.critical) {
    return {
      kind: "hold",
      evidence,
      reason: "digest",
      delivery,
    };
  }

  return { kind: "deliver", evidence, delivery };
}

function isInQuietHours(
  now: Date,
  quiet: Extract<PreferencePayload, { type: "quiet_hours" }>,
): boolean {
  const local = localMinutes(now, quiet.timezone);
  for (const window of quiet.windows) {
    const start = parseHm(window.start);
    const end = parseHm(window.end);
    if (start === undefined || end === undefined) {
      continue;
    }
    if (start <= end) {
      if (local >= start && local < end) {
        return true;
      }
    } else if (local >= start || local < end) {
      return true;
    }
  }
  return false;
}

function localMinutes(now: Date, timezone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      timeZone: timezone,
    }).formatToParts(now);
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
    const minute = Number(
      parts.find((part) => part.type === "minute")?.value ?? 0,
    );
    return hour * 60 + minute;
  } catch {
    return now.getUTCHours() * 60 + now.getUTCMinutes();
  }
}

function parseHm(value: string): number | undefined {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (match === null) {
    return undefined;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}
