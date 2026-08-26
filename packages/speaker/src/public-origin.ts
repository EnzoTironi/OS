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

export function withOnboardHref(spoken: string, href: string): string {
  const text = spoken.trim();
  if (text.includes(href)) {
    return text;
  }
  if (text.length === 0) {
    return href;
  }
  return `${text}\n${href}`;
}
