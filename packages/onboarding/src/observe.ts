import { sourceConnectionId } from "./brands.js";
import type {
  ObservedCapabilities,
  WorkspaceClass,
} from "./types.js";

/**
 * Wire shape from GET /identity/admin/accounts/{accountId} (AD-01).
 * Parsed once at the boundary; planner trusts ObservedCapabilities.
 */
export type IdentityAccountSnapshot = {
  readonly account: {
    readonly accountId: string;
    readonly status: string;
    readonly mergedInto?: string | null;
  };
  readonly bindings: ReadonlyArray<{
    readonly bindingId: string;
    readonly provider: string;
    readonly status: string;
  }>;
  readonly memberships: ReadonlyArray<{
    readonly membershipId: string;
    readonly tenantId: string;
    readonly status: string;
    readonly kind: string;
  }>;
  readonly personalTenant?: string | null;
};

export type ObserveCapabilitiesInput = {
  readonly snapshot: IdentityAccountSnapshot | null;
  readonly readSources?: ObservedCapabilities["readSources"];
  readonly queryReady?: boolean;
};

const emptyObserved: ObservedCapabilities = {
  accountStatus: "provisional",
  verifiedBindings: [],
  memberships: [],
  readSources: [],
  queryReady: false,
};

function accountStatus(
  status: string,
): ObservedCapabilities["accountStatus"] {
  if (status === "verified") {
    return "verified";
  }
  if (status === "merged_into" || status === "merged") {
    return "merged";
  }
  return "provisional";
}

function bindingProvider(
  provider: string,
): ObservedCapabilities["verifiedBindings"][number]["provider"] | null {
  if (
    provider === "web_oidc" ||
    provider === "whatsapp" ||
    provider === "telegram" ||
    provider === "linq"
  ) {
    return provider;
  }
  return null;
}

function workspaceClass(kind: string): WorkspaceClass | null {
  if (kind === "personal") {
    return "personal";
  }
  if (kind === "invite" || kind === "enterprise_oidc") {
    return "enterprise";
  }
  return null;
}

function membershipStatus(
  status: string,
): ObservedCapabilities["memberships"][number]["status"] {
  return status === "active" ? "active" : "inactive";
}

/**
 * Rebuild ObservedCapabilities from live AD-01 identity.
 * Session grants never become authority here.
 */
export function observeCapabilities(
  input: ObserveCapabilitiesInput,
): ObservedCapabilities {
  if (input.snapshot === null) {
    return {
      ...emptyObserved,
      readSources: input.readSources ?? [],
      queryReady: input.queryReady ?? false,
    };
  }

  const verifiedBindings = input.snapshot.bindings.flatMap((binding) => {
    if (binding.status !== "verified") {
      return [];
    }
    const provider = bindingProvider(binding.provider);
    if (provider === null) {
      return [];
    }
    return [{ provider, bindingId: binding.bindingId }];
  });

  const memberships = input.snapshot.memberships.flatMap((membership) => {
    const klass = workspaceClass(membership.kind);
    if (klass === null) {
      return [];
    }
    return [
      {
        membershipId: membership.membershipId,
        tenantId: membership.tenantId,
        workspaceClass: klass,
        status: membershipStatus(membership.status),
      },
    ];
  });

  return {
    accountStatus: accountStatus(input.snapshot.account.status),
    verifiedBindings,
    memberships,
    readSources: input.readSources ?? [],
    queryReady: input.queryReady ?? false,
  };
}

export function withReadSourceOverlay(
  observed: ObservedCapabilities,
  connectionId: string,
): ObservedCapabilities {
  return {
    ...observed,
    readSources: [
      {
        connectionId: sourceConnectionId(connectionId),
        scope: "readonly",
        status: "connected",
      },
    ],
    queryReady: true,
  };
}
