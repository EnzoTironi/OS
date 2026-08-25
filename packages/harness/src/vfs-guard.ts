/**
 * Isolate VFS policy for the gated just-bash workbench.
 * Production execution is Wasmtime (ADR-0017) and does not use this path.
 */

const BLOCKED_COMMAND =
  /\b(curl|wget|nc|ncat|ssh|scp|python3?|node|npm|deno|bun|chmod|chown|mount|umount)\b/;
const BLOCKED_PATH =
  /(?:^|[\s"'=])(\/etc\/|\/proc\/|\/sys\/|\/dev\/|\/root\/|\/var\/run\/)/;
const TRAVERSAL = /(?:^|[/\s])\.\.(?:[/\s]|$)/;
const SYMLINK = /\bln\s+(-[sfn]+\s+)*/;

export type VfsVerdict =
  | { readonly kind: "allow" }
  | { readonly kind: "deny"; readonly reason: string };

export function inspectBashInvocation(
  command: string,
  destination: string,
): VfsVerdict {
  const text = command.trim();
  if (text.length === 0) {
    return { kind: "deny", reason: "empty command" };
  }
  if (TRAVERSAL.test(text)) {
    return { kind: "deny", reason: "path traversal" };
  }
  if (BLOCKED_PATH.test(text)) {
    return { kind: "deny", reason: "host filesystem" };
  }
  if (BLOCKED_COMMAND.test(text)) {
    return { kind: "deny", reason: "network or process escape" };
  }
  if (SYMLINK.test(text) && text.includes("/")) {
    return { kind: "deny", reason: "symlink escape" };
  }
  if (/\b(env|printenv)\b/.test(text) && /SECRET|TOKEN|PASSWORD|ZOEN_/.test(text)) {
    return { kind: "deny", reason: "secret exfiltration" };
  }
  if (absoluteOutsideDestination(text, destination)) {
    return { kind: "deny", reason: "absolute path outside isolate" };
  }
  if (text.length > 8_192) {
    return { kind: "deny", reason: "command too large" };
  }
  return { kind: "allow" };
}

function absoluteOutsideDestination(command: string, destination: string): boolean {
  const matches = command.match(/(?:^|[\s"'=])(\/[A-Za-z0-9._/-]+)/g) ?? [];
  for (const raw of matches) {
    const path = raw.trim().replace(/^['"=]/, "");
    if (!path.startsWith("/")) {
      continue;
    }
    if (path === destination || path.startsWith(`${destination}/`)) {
      continue;
    }
    return true;
  }
  return false;
}
