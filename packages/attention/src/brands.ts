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

export type TenantId = Brand<string, "AttentionTenantId">;
export type AttentionDefinitionId = Brand<string, "AttentionDefinitionId">;
export type AttentionDefinitionVersion = Brand<
  string,
  "AttentionDefinitionVersion"
>;
export type ConditionIdentityDigest = Brand<
  string,
  "ConditionIdentityDigest"
>;
export type MaterialFingerprint = Brand<string, "MaterialFingerprint">;
export type SemanticCutDigest = Brand<string, "SemanticCutDigest">;
export type AttentionItemId = Brand<string, "AttentionItemId">;

export function tenantId(value: string): TenantId {
  return brandString(value, "AttentionTenantId");
}

export function attentionDefinitionId(value: string): AttentionDefinitionId {
  return brandString(value, "AttentionDefinitionId");
}

export function attentionDefinitionVersion(
  value: string,
): AttentionDefinitionVersion {
  return brandString(value, "AttentionDefinitionVersion");
}

export function conditionIdentityDigest(
  value: string,
): ConditionIdentityDigest {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new Error("ConditionIdentityDigest must be sha256 hex");
  }
  return value as ConditionIdentityDigest;
}

export function materialFingerprint(value: string): MaterialFingerprint {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new Error("MaterialFingerprint must be sha256 hex");
  }
  return value as MaterialFingerprint;
}

export function semanticCutDigest(value: string): SemanticCutDigest {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new Error("SemanticCutDigest must be sha256 hex");
  }
  return value as SemanticCutDigest;
}

export function attentionItemId(value: string): AttentionItemId {
  return brandString(value, "AttentionItemId");
}
