import {
  DoorToken,
  type DoorToken as DoorTokenBrand,
  MembershipId,
  type MembershipId as MembershipIdBrand,
  WorldId,
  type WorldId as WorldIdBrand,
} from "./membership";

export interface HostCredential {
  readonly definitionDigest: string;
  readonly definitionId: string;
  readonly doorToken: DoorTokenBrand;
  readonly membershipId: MembershipIdBrand;
  readonly validAt: string;
  readonly worldId: WorldIdBrand;
}

const vault = new Map<string, HostCredential>();

export function putHostCredential(credential: HostCredential): void {
  vault.set(credential.membershipId, credential);
}

export function getHostCredential(
  membershipId: MembershipIdBrand
): HostCredential | undefined {
  return vault.get(membershipId);
}

export function deleteHostCredential(membershipId: MembershipIdBrand): void {
  vault.delete(membershipId);
}

export function hostCredentialFromRaw(input: {
  readonly membershipId: string;
  readonly worldId: string;
  readonly doorToken: string;
  readonly definitionId: string;
  readonly definitionDigest: string;
  readonly validAt: string;
}): HostCredential {
  return {
    definitionDigest: input.definitionDigest,
    definitionId: input.definitionId,
    doorToken: DoorToken(input.doorToken),
    membershipId: MembershipId(input.membershipId),
    validAt: input.validAt,
    worldId: WorldId(input.worldId),
  };
}
