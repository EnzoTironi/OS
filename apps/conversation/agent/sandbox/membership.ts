import { mkdir } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

declare const membershipIdBrand: unique symbol;
declare const worldIdBrand: unique symbol;
declare const doorTokenBrand: unique symbol;

export type MembershipId = string & {
  readonly [membershipIdBrand]: undefined;
};
export type WorldId = string & { readonly [worldIdBrand]: undefined };
export type DoorToken = string & { readonly [doorTokenBrand]: undefined };

const UNBOUND_RAW = "unbound";

export function MembershipId(raw: string): MembershipId {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new Error("MembershipId empty");
  }
  if (
    trimmed.includes("..") ||
    trimmed.includes(sep) ||
    trimmed.includes("/")
  ) {
    throw new Error("MembershipId path characters");
  }
  return trimmed as MembershipId;
}

export function WorldId(raw: string): WorldId {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new Error("WorldId empty");
  }
  return trimmed as WorldId;
}

export function DoorToken(raw: string): DoorToken {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new Error("DoorToken empty");
  }
  if (trimmed.split(".").length === 3) {
    throw new Error("DoorToken rejects JWT");
  }
  return trimmed as DoorToken;
}

export const unboundMembership: MembershipId = MembershipId(UNBOUND_RAW);

export interface MembershipDisk {
  readonly membershipId: MembershipId;
  readonly root: string;
  readonly workspace: string;
}

export function membershipDisk(
  disksRoot: string,
  membershipId: MembershipId
): MembershipDisk {
  const root = resolve(join(disksRoot, encodeURIComponent(membershipId)));
  const workspace = join(root, "workspace");
  const disks = resolve(disksRoot);
  if (root !== disks && !root.startsWith(`${disks}${sep}`)) {
    throw new Error("membership disk escaped disksRoot");
  }
  return { membershipId, root, workspace };
}

export async function ensureMembershipDisk(
  disk: MembershipDisk
): Promise<void> {
  await mkdir(disk.workspace, { recursive: true });
}

export function guestToHost(disk: MembershipDisk, guestPath: string): string {
  const resolved = guestPath.startsWith("/")
    ? guestPath
    : `/workspace/${guestPath}`;
  if (resolved === "/workspace") {
    return disk.workspace;
  }
  if (!resolved.startsWith("/workspace/")) {
    throw new Error(`path outside /workspace: ${guestPath}`);
  }
  const relative = resolved.slice("/workspace/".length);
  const host = resolve(disk.workspace, relative);
  if (host !== disk.workspace && !host.startsWith(`${disk.workspace}${sep}`)) {
    throw new Error(`path escaped membership disk: ${guestPath}`);
  }
  return host;
}

export function resolveWorkspacePath(path: string): string {
  if (path.startsWith("/")) {
    return path;
  }
  return `/workspace/${path}`;
}
