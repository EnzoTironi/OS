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
