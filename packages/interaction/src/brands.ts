declare const brand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [brand]: B };

function brandString<B extends string>(
  value: string,
  label: B,
): Brand<string, B> {
  if (value.length === 0 || value.length > 200) {
    throw new Error(`${label} must be 1..200 chars`);
  }
  return value as Brand<string, B>;
}

export type InteractionId = Brand<string, "InteractionId">;
export type DeliveryIntentId = Brand<string, "DeliveryIntentId">;
export type DeliveryObservationId = Brand<string, "DeliveryObservationId">;
export type InteractionControlRef = Brand<string, "InteractionControlRef">;
export type ProviderKey = Brand<string, "ProviderKey">;
export type ProviderUserRef = Brand<string, "ProviderUserRef">;
export type ProviderThreadRef = Brand<string, "ProviderThreadRef">;
export type ProviderMessageRef = Brand<string, "ProviderMessageRef">;
export type PresentationIntentRef = Brand<string, "PresentationIntentRef">;

export function interactionId(value: string): InteractionId {
  return brandString(value, "InteractionId");
}

export function deliveryIntentId(value: string): DeliveryIntentId {
  return brandString(value, "DeliveryIntentId");
}

export function deliveryObservationId(value: string): DeliveryObservationId {
  return brandString(value, "DeliveryObservationId");
}

export function interactionControlRef(value: string): InteractionControlRef {
  return brandString(value, "InteractionControlRef");
}

export function providerKey(value: string): ProviderKey {
  return brandString(value, "ProviderKey");
}

export function providerUserRef(value: string): ProviderUserRef {
  return brandString(value, "ProviderUserRef");
}

export function providerThreadRef(value: string): ProviderThreadRef {
  return brandString(value, "ProviderThreadRef");
}

export function providerMessageRef(value: string): ProviderMessageRef {
  return brandString(value, "ProviderMessageRef");
}

export function presentationIntentRef(value: string): PresentationIntentRef {
  return brandString(value, "PresentationIntentRef");
}

/** Compile-time: branded provider refs are not TenantId/PrincipalId strings. */
export type TenantIdString = Brand<string, "TenantId">;
export type PrincipalIdString = Brand<string, "PrincipalId">;

export function tenantIdString(value: string): TenantIdString {
  return brandString(value, "TenantId");
}

export function principalIdString(value: string): PrincipalIdString {
  return brandString(value, "PrincipalId");
}
