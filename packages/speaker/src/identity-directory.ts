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

export type ChannelSubjectResolveFailure =
  | { readonly kind: "unbound"; readonly message: string }
  | { readonly kind: "merged"; readonly message: string }
  | { readonly kind: "inactive_membership"; readonly message: string }
  | { readonly kind: "tenant_hint_miss"; readonly message: string };

export class ChannelSubjectResolveError extends Error {
  readonly failure: ChannelSubjectResolveFailure;

  constructor(failure: ChannelSubjectResolveFailure) {
    super(failure.message);
    this.name = "ChannelSubjectResolveError";
    this.failure = failure;
  }

  get kind(): ChannelSubjectResolveFailure["kind"] {
    return this.failure.kind;
  }
}

/** ProviderKey is already a ChannelProvider.as_str() value. */
export function toChannelProvider(provider: ProviderKey): string {
  return String(provider);
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
 * Tiny HTTP client over zoend identity admin.
 * Resolve is load-only (GET resolve-subject). POST /provisional is onboarding-only.
 */
export function createIdentityDirectoryClient(
  options: IdentityDirectoryClientOptions,
): IdentityDirectory {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/$/, "");

  return {
    async resolveChannelSubject(input) {
      const channelProvider = toChannelProvider(input.provider);
      const params = new URLSearchParams({
        provider: channelProvider,
        subjectKey: input.subjectKey,
      });
      const snapshot = await getJson<SnapshotJson>(
        fetchImpl,
        `${baseUrl}/identity/admin/resolve-subject?${params.toString()}`,
      );

      if (snapshot.account.status === "merged_into") {
        throw new ChannelSubjectResolveError({
          kind: "merged",
          message: "account merged away",
        });
      }

      const binding = snapshot.bindings.find(
        (candidate) =>
          candidate.provider === channelProvider &&
          candidate.subjectKey === input.subjectKey &&
          candidate.status === "verified",
      );
      if (binding === undefined) {
        throw new ChannelSubjectResolveError({
          kind: "unbound",
          message: "unresolved channel subject: no verified binding",
        });
      }

      const active = snapshot.memberships.filter(
        (membership) => membership.status === "active",
      );
      if (active.length === 0) {
        throw new ChannelSubjectResolveError({
          kind: "inactive_membership",
          message: "inactive or missing membership",
        });
      }

      const membership =
        input.tenantHint === undefined
          ? active[0]
          : active.find((row) => row.tenantId === input.tenantHint);
      if (membership === undefined) {
        throw new ChannelSubjectResolveError({
          kind: "tenant_hint_miss",
          message: "no active membership for tenant hint",
        });
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

async function getJson<T>(fetchImpl: typeof fetch, url: string): Promise<T> {
  const response = await fetchImpl(url, { method: "GET" });
  const text = await response.text();
  const parsed = text.length === 0 ? {} : (JSON.parse(text) as unknown);
  if (!response.ok) {
    const message =
      typeof parsed === "object" &&
      parsed !== null &&
      "error" in parsed &&
      typeof (parsed as { error: unknown }).error === "string"
        ? (parsed as { error: string }).error
        : JSON.stringify(parsed);
    // resolve-subject is unauthenticated; 401 is SubjectUnbound.
    if (response.status === 401) {
      throw new ChannelSubjectResolveError({
        kind: "unbound",
        message,
      });
    }
    if (response.status === 409 && message.includes("merged")) {
      throw new ChannelSubjectResolveError({
        kind: "merged",
        message,
      });
    }
    throw new Error(
      `identity admin GET ${url} → ${response.status}: ${JSON.stringify(parsed)}`,
    );
  }
  return parsed as T;
}
