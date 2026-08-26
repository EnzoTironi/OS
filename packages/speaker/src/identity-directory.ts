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
    tenantHint?: string;
  }): Promise<ResolvedChannelIdentity>;
  mintOnboardToken?(input: {
    provider: ProviderKey;
    subjectKey: string;
  }): Promise<{ href: string; token: string }>;
  admitWhatsAppSubject?(input: {
    provider: ProviderKey;
    subjectKey: string;
  }): Promise<ResolvedChannelIdentity>;
}

export type ChannelSubjectResolveFailure =
  | { readonly kind: "unbound"; readonly message: string }
  | { readonly kind: "merged"; readonly message: string }
  | { readonly kind: "inactive_membership"; readonly message: string }
  | { readonly kind: "ambiguous_membership"; readonly message: string }
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
  kind?: string;
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
  readonly adminToken?: string;
}

export function createIdentityDirectoryClient(
  options: IdentityDirectoryClientOptions,
): IdentityDirectory {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const adminToken =
    options.adminToken?.trim() ||
    process.env.ZOEN_IDENTITY_ADMIN_TOKEN?.trim() ||
    "";

  return {
    async admitWhatsAppSubject(input) {
      if (adminToken.length === 0) {
        throw new Error("ZOEN_IDENTITY_ADMIN_TOKEN required for identity directory");
      }
      const response = await fetchImpl(
        `${baseUrl}/identity/admin/admit-whatsapp`,
        {
          body: JSON.stringify({
            provider: toChannelProvider(input.provider),
            subjectKey: input.subjectKey,
          }),
          headers: {
            authorization: `Bearer ${adminToken}`,
            "content-type": "application/json",
          },
          method: "POST",
        },
      );
      const snapshot = await readSnapshot(response, "admit-whatsapp");
      return identityFromSnapshot(
        snapshot,
        toChannelProvider(input.provider),
        input.subjectKey,
      );
    },
    async mintOnboardToken(input) {
      if (adminToken.length === 0) {
        throw new Error("ZOEN_IDENTITY_ADMIN_TOKEN required for identity directory");
      }
      const response = await fetchImpl(
        `${baseUrl}/identity/admin/onboard-tokens`,
        {
          body: JSON.stringify({
            provider: toChannelProvider(input.provider),
            subjectKey: input.subjectKey,
          }),
          headers: {
            authorization: `Bearer ${adminToken}`,
            "content-type": "application/json",
          },
          method: "POST",
        },
      );
      const text = await response.text();
      const parsed = text.length === 0 ? {} : (JSON.parse(text) as unknown);
      if (!response.ok) {
        const message =
          typeof parsed === "object" &&
          parsed !== null &&
          "error" in parsed &&
          typeof (parsed as { error: unknown }).error === "string"
            ? (parsed as { error: string }).error
            : `onboard mint HTTP ${String(response.status)}`;
        throw new Error(message);
      }
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        typeof (parsed as { href?: unknown }).href !== "string" ||
        typeof (parsed as { token?: unknown }).token !== "string"
      ) {
        throw new Error("onboard mint missing href");
      }
      return {
        href: (parsed as { href: string }).href,
        token: (parsed as { token: string }).token,
      };
    },
    async resolveChannelSubject(input) {
      if (adminToken.length === 0) {
        throw new Error("ZOEN_IDENTITY_ADMIN_TOKEN required for identity directory");
      }
      const channelProvider = toChannelProvider(input.provider);
      const params = new URLSearchParams({
        provider: channelProvider,
        subjectKey: input.subjectKey,
      });
      const snapshot = await getJson<SnapshotJson>(
        fetchImpl,
        `${baseUrl}/identity/admin/resolve-subject?${params.toString()}`,
        adminToken,
      );
      return identityFromSnapshot(
        snapshot,
        channelProvider,
        input.subjectKey,
        input.tenantHint,
      );
    },
  };
}

function identityFromSnapshot(
  snapshot: SnapshotJson,
  channelProvider: string,
  subjectKey: string,
  tenantHint?: string,
): ResolvedChannelIdentity {
  if (snapshot.account.status === "merged_into") {
    throw new ChannelSubjectResolveError({
      kind: "merged",
      message: "account merged away",
    });
  }

  const binding = snapshot.bindings.find(
    (candidate) =>
      candidate.provider === channelProvider &&
      candidate.subjectKey === subjectKey &&
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
    tenantHint === undefined
      ? uniqueMembership(active)
      : active.find((row) => row.tenantId === tenantHint);
  if (membership === undefined) {
    throw new ChannelSubjectResolveError({
      kind:
        tenantHint === undefined ? "ambiguous_membership" : "tenant_hint_miss",
      message:
        tenantHint === undefined
          ? "multiple active memberships require a tenant hint"
          : "no active membership for tenant hint",
    });
  }

  return {
    accountId: membership.accountId,
    actorId: membership.actorId ?? "actor.personal",
    bindingId: binding.bindingId,
    membershipId: membership.membershipId,
    principalId: principalIdString(membership.principalId),
    tenantId: tenantIdString(membership.tenantId),
    workloadId: membership.workloadId ?? "workload.personal",
  };
}

function uniqueMembership(
  active: readonly MembershipJson[],
): MembershipJson | undefined {
  if (active.length === 1) {
    return active[0];
  }
  const personals = active.filter((row) => row.kind === "personal");
  if (personals.length === 1) {
    return personals[0];
  }
  return undefined;
}

async function readSnapshot(
  response: Response,
  label: string,
): Promise<SnapshotJson> {
  const text = await response.text();
  const parsed = text.length === 0 ? {} : (JSON.parse(text) as unknown);
  if (!response.ok) {
    const message =
      typeof parsed === "object" &&
      parsed !== null &&
      "error" in parsed &&
      typeof (parsed as { error: unknown }).error === "string"
        ? (parsed as { error: string }).error
        : `${label} HTTP ${String(response.status)}`;
    throw new Error(message);
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("account" in parsed) ||
    !("bindings" in parsed) ||
    !("memberships" in parsed)
  ) {
    throw new Error(`${label} missing snapshot`);
  }
  return parsed as SnapshotJson;
}

async function getJson<T>(
  fetchImpl: typeof fetch,
  url: string,
  adminToken: string,
): Promise<T> {
  const response = await fetchImpl(url, {
    headers: { authorization: `Bearer ${adminToken}` },
    method: "GET",
  });
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
    if (response.status === 401) {
      throw new Error(`identity admin unauthenticated: ${message}`);
    }
    if (response.status === 404) {
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
