export type OnboardStatus =
  | { readonly kind: "missing" }
  | { readonly kind: "ready" }
  | {
      readonly kind: "cli_complete";
      readonly verificationUriComplete: string;
    };

export type OnboardLookup = (token: string) => Promise<OnboardStatus>;

const TOKEN = /^[\w.-]+$/u;

/**
 * Onboard tokens are zoend URL-safe values or a CLI Auth user-code.
 * Do not accept paths or verification URLs as the path token.
 */
export function parseOnboardToken(raw: string | undefined): string | undefined {
  const token = raw?.trim() ?? "";
  if (token.length === 0 || token.length > 128 || !TOKEN.test(token)) {
    return undefined;
  }
  return token;
}

export function onboardState(token: string): string {
  return `onboard.${token}`;
}

export function tokenFromState(state: string | undefined): string | undefined {
  if (state === undefined || !state.startsWith("onboard.")) {
    return undefined;
  }
  return parseOnboardToken(state.slice("onboard.".length));
}

export function httpsRedirect(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Fail closed: unknown or unreachable invite is missing.
 * Fail open: local door without zoend treats a well-formed token as ready.
 */
export function stubOnboardLookup(mode: "open" | "closed"): OnboardLookup {
  return async (token) => {
    if (mode === "closed" || parseOnboardToken(token) === undefined) {
      return { kind: "missing" };
    }
    return { kind: "ready" };
  };
}

export function zoendOnboardLookup(baseUrl: string): OnboardLookup {
  return async (token) => {
    const parsed = parseOnboardToken(token);
    if (parsed === undefined) {
      return { kind: "missing" };
    }
    try {
      const url = new URL(
        `/onboard/${encodeURIComponent(parsed)}`,
        baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`,
      );
      const response = await fetch(url, { redirect: "manual" });
      return response.ok ? { kind: "ready" } : { kind: "missing" };
    } catch {
      return { kind: "missing" };
    }
  };
}

export function resolveOnboardLookup(
  lookup: OnboardLookup | undefined,
  identityBaseUrl: string | undefined,
): OnboardLookup {
  return lookup ?? (identityBaseUrl === undefined
    ? stubOnboardLookup("open")
    : zoendOnboardLookup(identityBaseUrl));
}

export function missingOnboardPage(): string {
  return page("Este convite não vale mais.");
}

export function startOnboardPage(token: string): string {
  const href = `/auth/workos/login?onboard=${encodeURIComponent(token)}`;
  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Zoen</title></head>
<body>
<p>Confirmar este WhatsApp e continuar.</p>
<p><a href="${href}">Continuar</a></p>
</body>
</html>`;
}

export function returnToWhatsAppPage(): string {
  return page("Volta pro Zap.");
}

function page(body: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Zoen</title></head>
<body>
<p>${body}</p>
</body>
</html>`;
}
