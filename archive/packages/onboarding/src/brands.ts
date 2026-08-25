declare const brand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [brand]: B };

function brandString<B extends string>(
  value: string,
  label: B,
): Brand<string, B> {
  if (value.length === 0 || value.length > 512) {
    throw new Error(`${label} must be 1..512 chars`);
  }
  return value as Brand<string, B>;
}

export type GoalDigest = Brand<string, "GoalDigest">;
export type ZoenAccountId = Brand<string, "ZoenAccountId">;
export type OperationId = Brand<string, "OperationId">;
export type ResumeToken = Brand<string, "ResumeToken">;
export type CapabilityGrantId = Brand<string, "CapabilityGrantId">;
export type SourceConnectionId = Brand<string, "SourceConnectionId">;
export type FirstSuccessContractId = Brand<string, "FirstSuccessContractId">;
export type InviteId = Brand<string, "InviteId">;
export type AmbiguityQuestionId = Brand<string, "AmbiguityQuestionId">;
export type MappingArtifactId = Brand<string, "MappingArtifactId">;
export type MappingRevision = Brand<string, "MappingRevision">;
export type AmbiguityRecordId = Brand<string, "AmbiguityRecordId">;
export type AmbiguityCandidateId = Brand<string, "AmbiguityCandidateId">;
export type ShadowDecisionId = Brand<string, "ShadowDecisionId">;

export function goalDigest(value: string): GoalDigest {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new Error("GoalDigest must be sha256 hex");
  }
  return value as GoalDigest;
}

export function zoenAccountId(value: string): ZoenAccountId {
  return brandString(value, "ZoenAccountId");
}

export function operationId(value: string): OperationId {
  return brandString(value, "OperationId");
}

export function resumeToken(value: string): ResumeToken {
  return brandString(value, "ResumeToken");
}

export function capabilityGrantId(value: string): CapabilityGrantId {
  return brandString(value, "CapabilityGrantId");
}

export function sourceConnectionId(value: string): SourceConnectionId {
  return brandString(value, "SourceConnectionId");
}

export function firstSuccessContractId(value: string): FirstSuccessContractId {
  return brandString(value, "FirstSuccessContractId");
}

export function inviteId(value: string): InviteId {
  return brandString(value, "InviteId");
}

export function ambiguityQuestionId(value: string): AmbiguityQuestionId {
  return brandString(value, "AmbiguityQuestionId");
}

export function mappingArtifactId(value: string): MappingArtifactId {
  return brandString(value, "MappingArtifactId");
}

export function mappingRevision(value: string): MappingRevision {
  return brandString(value, "MappingRevision");
}

export function ambiguityRecordId(value: string): AmbiguityRecordId {
  return brandString(value, "AmbiguityRecordId");
}

export function ambiguityCandidateId(value: string): AmbiguityCandidateId {
  return brandString(value, "AmbiguityCandidateId");
}

export function shadowDecisionId(value: string): ShadowDecisionId {
  return brandString(value, "ShadowDecisionId");
}

export const DEFAULT_FIRST_SUCCESS_CONTRACT_ID = firstSuccessContractId(
  "onboarding.first_attributable_query",
);
