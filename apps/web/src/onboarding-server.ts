import {
  createFileStore,
  createMemoryStore,
  planNext,
  zoenAccountId,
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

export function getObserved(accountId: string): ObservedCapabilities {
  return observedByAccount.get(accountId) ?? defaultObserved;
}

export function setObserved(
  accountId: string,
  observed: ObservedCapabilities,
): void {
  observedByAccount.set(accountId, observed);
}

export function accountBrand(accountId: string) {
  return zoenAccountId(accountId);
}

export { planNext };
