import {
  DoorToken,
  MembershipId,
  TenantId,
  type DoorToken as DoorTokenBrand,
  type MembershipId as MembershipIdBrand,
  type TenantId as TenantIdBrand,
} from "./membership";

export type HostCredential = {
  readonly membershipId: MembershipIdBrand;
  readonly tenantId: TenantIdBrand;
  readonly doorToken: DoorTokenBrand;
  readonly definitionId: string;
  readonly definitionDigest: string;
  readonly validAt: string;
};

const vault = new Map<string, HostCredential>();

export function putHostCredential(credential: HostCredential): void {
  vault.set(credential.membershipId, credential);
}

export function getHostCredential(membershipId: MembershipIdBrand): HostCredential | undefined {
  return vault.get(membershipId);
}

export function deleteHostCredential(membershipId: MembershipIdBrand): void {
  vault.delete(membershipId);
}

export function hostCredentialFromRaw(input: {
  readonly membershipId: string;
  readonly tenantId: string;
  readonly doorToken: string;
  readonly definitionId: string;
  readonly definitionDigest: string;
  readonly validAt: string;
}): HostCredential {
  return {
    membershipId: MembershipId(input.membershipId),
    tenantId: TenantId(input.tenantId),
    doorToken: DoorToken(input.doorToken),
    definitionId: input.definitionId,
    definitionDigest: input.definitionDigest,
    validAt: input.validAt,
  };
}
