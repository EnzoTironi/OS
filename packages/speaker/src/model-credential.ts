export type ModelCredential =
  | { readonly kind: "missing" }
  | { readonly kind: "opaque" }
  | {
      readonly kind: "oauthJwt";
      readonly exp: number | null;
      readonly expired: boolean;
    };

export function inspectModelCredential(
  value: string,
  nowMs: number,
): ModelCredential {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { kind: "missing" };
  }
  const jwt = readOauthJwt(trimmed, nowMs);
  if (jwt === undefined) {
    return { kind: "opaque" };
  }
  return jwt;
}

export function assertConfiguredModelCredential(
  env: NodeJS.ProcessEnv = process.env,
  nowMs: number = Date.now(),
): void {
  const specified = env.ZOEN_MODEL?.trim();
  if (specified === undefined || specified.length === 0) {
    return;
  }
  const { envVar, value } = modelApiKey(specified, env);
  if (value === undefined || value.length === 0) {
    return;
  }
  const inspected = inspectModelCredential(value, nowMs);
  if (
    inspected.kind !== "oauthJwt" ||
    !inspected.expired ||
    inspected.exp === null
  ) {
    return;
  }
  const expiredAt = new Date(inspected.exp * 1000).toISOString();
  throw new Error(
    `${envVar} is an expired OAuth JWT (expired at ${expiredAt})`,
  );
}

export function redactCredentialText(text: string): string {
  return text
    .replace(
      /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      "[redacted-jwt]",
    )
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\bsk-[A-Za-z0-9_-]+/g, "sk-[redacted]");
}

function modelApiKey(
  specified: string,
  env: NodeJS.ProcessEnv,
): { readonly envVar: string; readonly value: string | undefined } {
  const provider = parseModelProvider(specified);
  switch (provider) {
    case "anthropic":
      return {
        envVar: "ANTHROPIC_API_KEY",
        value: env.ANTHROPIC_API_KEY?.trim(),
      };
    case "openai":
    case "openai-compatible":
      return {
        envVar: "OPENAI_API_KEY",
        value: env.OPENAI_API_KEY?.trim(),
      };
    default: {
      const exhaustive: never = provider;
      return exhaustive;
    }
  }
}

function parseModelProvider(
  specified: string,
): "anthropic" | "openai" | "openai-compatible" {
  const separator = specified.includes("/")
    ? "/"
    : specified.includes(":")
      ? ":"
      : undefined;
  if (separator === undefined) {
    return "openai";
  }
  const provider = specified.slice(0, specified.indexOf(separator));
  switch (provider) {
    case "anthropic":
    case "openai":
    case "openai-compatible":
      return provider;
    default:
      return "openai";
  }
}

function readOauthJwt(
  value: string,
  nowMs: number,
): Extract<ModelCredential, { kind: "oauthJwt" }> | undefined {
  const parts = value.split(".");
  if (parts.length !== 3) {
    return undefined;
  }
  const headerPart = parts[0];
  const payloadPart = parts[1];
  if (headerPart === undefined || payloadPart === undefined) {
    return undefined;
  }
  const header = decodeJsonObject(headerPart);
  const payload = decodeJsonObject(payloadPart);
  if (header === undefined || payload === undefined) {
    return undefined;
  }
  if (typeof header.alg !== "string") {
    return undefined;
  }
  const exp = typeof payload.exp === "number" ? payload.exp : null;
  return {
    kind: "oauthJwt",
    exp,
    expired: exp !== null && exp * 1000 <= nowMs,
  };
}

function decodeJsonObject(segment: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(segment, "base64url").toString("utf8"),
    );
    if (!isJsonObject(parsed)) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
