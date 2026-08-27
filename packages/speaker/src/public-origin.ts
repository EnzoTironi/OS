export function resolvePublicOrigin(
  override?: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const fromOverride = override?.trim();
  if (fromOverride !== undefined && fromOverride.length > 0) {
    return fromOverride.replace(/\/+$/, "");
  }
  const fromEnv = env.ZOEN_PUBLIC_ORIGIN?.trim();
  if (fromEnv !== undefined && fromEnv.length > 0) {
    return fromEnv.replace(/\/+$/, "");
  }
  return "https://app.zoen.local";
}

/**
 * Context: outbound and first-contact injection. The host may send at most one
 * https, and only when it is a real public URL (a minted onboard token, or a
 * world note that already carried https). Constructed `/approve/*` paths are
 * not a mint: zoend does not serve them.
 * Inputs: a candidate string, possibly model-invented or host-concatenated.
 * Outputs: true only for `https:` URLs whose host is not `app.zoen.local`
 * and whose path is not a constructed approve route.
 * Side effects: none.
 */
export function isHostPublicHref(value: string): boolean {
  return parseHostPublicHref(value) !== null;
}

/**
 * Context: same gate as `isHostPublicHref`, for callers that need the URL.
 * Inputs: a candidate string.
 * Outputs: the parsed `https:` URL, or null when it is not host-public.
 * Side effects: none.
 */
export function parseHostPublicHref(value: string): URL | null {
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "https:") {
      return null;
    }
    if (parsed.hostname.toLowerCase() === "app.zoen.local") {
      return null;
    }
    if (isConstructedApprovePath(parsed.pathname)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function isConstructedApprovePath(pathname: string): boolean {
  return pathname === "/approve" || pathname.startsWith("/approve/");
}

export function withOnboardHref(spoken: string, href: string): string {
  const text = spoken.trim();
  if (!isHostPublicHref(href)) {
    return text;
  }
  if (text.includes(href)) {
    return text;
  }
  if (text.length === 0) {
    return href;
  }
  return `${text}\n${href}`;
}
