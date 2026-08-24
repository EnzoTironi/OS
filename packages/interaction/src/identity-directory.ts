import {
  principalIdString,
  tenantIdString,
  type ProviderKey,
} from "./brands.js";
import type { ResolvedChannelIdentity } from "./types.js";

/**
 * Map provider subject → ExternalBinding → ZoenAccount → Active Membership.
 * Must call existing identity store semantics (zoend / IdentityStore).
 * Returns error on unbound subject, inactive membership, or merged-away account.
 *
 * ChannelObservation is attached by InteractionBoundary, not here.
 */
export interface IdentityDirectory {
  resolveChannelSubject(input: {
    provider: ProviderKey;
    subjectKey: string;
    /** Product policy tenant — never a thread id. */
    tenantHint?: string;
  }): Promise<ResolvedChannelIdentity>;
}

/** ProviderKey → ChannelProvider wire string. */
export function toChannelProvider(provider: ProviderKey): string {
  const key = String(provider);
  if (key === "telegram") {
    return "telegram";
  }
  if (key === "linq") {
    return "linq";
  }
  if (key === "whatsapp_business" || key === "whatsapp_cloud_api") {
    return "whatsapp";
  }
  throw new Error(`unsupported ProviderKey for identity: ${key}`);
}

interface BindingJson {
  bindingId: string;
  accountId: string;
  provider: string;
  subjectKey: string;
  status: string;
}

interface MembershipJson {
  membershipId: string;
  accountId: string;
  tenantId: string;
  principalId: string;
  status: string;
  actorId?: string;
  workloadId?: string;
}

interface SnapshotJson {
  account: { accountId: string; status: string; mergedInto?: string };
  bindings: BindingJson[];
  memberships: MembershipJson[];
}

export interface IdentityDirectoryClientOptions {
  readonly baseUrl: string;
  readonly fetchImpl?: typeof fetch;
}

/**
 * Tiny HTTP client over existing zoend identity admin.
 * Uses provisional (idempotent subject→account) + snapshot; no new endpoints.
 */
export function createIdentityDirectoryClient(
  options: IdentityDirectoryClientOptions,
): IdentityDirectory {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/$/, "");

  return {
    async resolveChannelSubject(input) {
      const channelProvider = toChannelProvider(input.provider);
      const provisional = await postJson<{ accountId: string; status: string }>(
        fetchImpl,
        `${baseUrl}/identity/admin/provisional`,
        {
          provider: channelProvider,
          subjectKey: input.subjectKey,
        },
      );
      if (provisional.status === "merged_into") {
        throw new Error("account merged away");
      }

      const snapshot = await getJson<SnapshotJson>(
        fetchImpl,
        `${baseUrl}/identity/admin/accounts/${encodeURIComponent(provisional.accountId)}`,
      );

      if (snapshot.account.status === "merged_into") {
        throw new Error("account merged away");
      }

      const binding = snapshot.bindings.find(
        (candidate) =>
          candidate.provider === channelProvider &&
          candidate.subjectKey === input.subjectKey &&
          candidate.status === "verified",
      );
      if (binding === undefined) {
        throw new Error("unresolved channel subject: no verified binding");
      }

      const active = snapshot.memberships.filter(
        (membership) => membership.status === "active",
      );
      if (active.length === 0) {
        throw new Error("inactive or missing membership");
      }

      const membership =
        input.tenantHint === undefined
          ? active[0]
          : active.find((row) => row.tenantId === input.tenantHint);
      if (membership === undefined) {
        throw new Error("no active membership for tenant hint");
      }

      // Never take tenant/principal from provider thread/user — Membership only.
      return {
        accountId: membership.accountId,
        actorId: membership.actorId ?? "actor.personal",
        bindingId: binding.bindingId,
        membershipId: membership.membershipId,
        principalId: principalIdString(membership.principalId),
        tenantId: tenantIdString(membership.tenantId),
        workloadId: membership.workloadId ?? "workload.personal",
      };
    },
  };
}

async function postJson<T>(
  fetchImpl: typeof fetch,
  url: string,
  body: unknown,
): Promise<T> {
  const response = await fetchImpl(url, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const text = await response.text();
  const parsed = text.length === 0 ? {} : (JSON.parse(text) as unknown);
  if (!response.ok) {
    throw new Error(
      `identity admin POST ${url} → ${response.status}: ${JSON.stringify(parsed)}`,
    );
  }
  return parsed as T;
}

async function getJson<T>(fetchImpl: typeof fetch, url: string): Promise<T> {
  const response = await fetchImpl(url, { method: "GET" });
  const text = await response.text();
  const parsed = text.length === 0 ? {} : (JSON.parse(text) as unknown);
  if (!response.ok) {
    throw new Error(
      `identity admin GET ${url} → ${response.status}: ${JSON.stringify(parsed)}`,
    );
  }
  return parsed as T;
}
