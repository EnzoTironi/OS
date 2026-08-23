import {
  createFileStore,
  createMemoryStore,
  observeCapabilities,
  planNext,
  zoenAccountId,
  type IdentityAccountSnapshot,
  type ObservedCapabilities,
  type OnboardingSessionStore,
} from "@zoen/onboarding";

const defaultObserved: ObservedCapabilities = {
  accountStatus: "provisional",
  verifiedBindings: [],
  memberships: [],
  readSources: [],
  queryReady: false,
};

let storeSingleton: OnboardingSessionStore | undefined;
let observedByAccount = new Map<string, ObservedCapabilities>();
let sourceOverlayByAccount = new Map<
  string,
  Pick<ObservedCapabilities, "readSources" | "queryReady">
>();

export function onboardingStore(): OnboardingSessionStore {
  if (storeSingleton !== undefined) {
    return storeSingleton;
  }
  const filePath = process.env.ZOEN_ONBOARDING_STORE_PATH;
  storeSingleton =
    filePath === undefined || filePath === ""
      ? createMemoryStore()
      : createFileStore(filePath);
  return storeSingleton;
}

function zoendOrigin(): string | undefined {
  const origin = process.env.ZOEN_ORIGIN ?? process.env.ZOEN_E2E_ZOEND_ORIGIN;
  if (origin === undefined || origin === "") {
    return undefined;
  }
  return origin.replace(/\/$/, "");
}

function isIdentitySnapshot(body: unknown): body is IdentityAccountSnapshot {
  if (typeof body !== "object" || body === null) {
    return false;
  }
  const record = body as Record<string, unknown>;
  return (
    typeof record.account === "object" &&
    record.account !== null &&
    Array.isArray(record.bindings) &&
    Array.isArray(record.memberships)
  );
}

/** Live AD-01 observation when ZOEN_ORIGIN is set; else in-memory overlay. */
export async function loadObserved(
  accountId: string,
): Promise<ObservedCapabilities> {
  const overlay = sourceOverlayByAccount.get(accountId);
  const origin = zoendOrigin();
  if (origin !== undefined) {
    try {
      const response = await fetch(
        `${origin}/identity/admin/accounts/${encodeURIComponent(accountId)}`,
      );
      if (response.status === 404) {
        return observeCapabilities({
          snapshot: null,
          readSources: overlay?.readSources,
          queryReady: overlay?.queryReady,
        });
      }
      if (response.ok) {
        const body: unknown = await response.json();
        if (isIdentitySnapshot(body)) {
          return observeCapabilities({
            snapshot: body,
            readSources: overlay?.readSources,
            queryReady: overlay?.queryReady,
          });
        }
      }
    } catch {
      // Fall through to in-memory observation for local UI without zoend.
    }
  }
  return observedByAccount.get(accountId) ?? defaultObserved;
}

export function getObserved(accountId: string): ObservedCapabilities {
  return observedByAccount.get(accountId) ?? defaultObserved;
}

export function setObserved(
  accountId: string,
  observed: ObservedCapabilities,
): void {
  observedByAccount.set(accountId, observed);
  sourceOverlayByAccount.set(accountId, {
    readSources: observed.readSources,
    queryReady: observed.queryReady,
  });
}

export function accountBrand(accountId: string) {
  return zoenAccountId(accountId);
}

export { planNext };
