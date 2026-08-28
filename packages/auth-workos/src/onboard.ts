export type OnboardStatus =
  | { readonly kind: "missing" }
  | { readonly kind: "ready" }
  | {
      readonly kind: "cli_complete";
      readonly verificationUriComplete: string;
    };

export type OnboardLookup = (token: string) => Promise<OnboardStatus>;

export type OnboardConfirm = (token: string) => Promise<"bound" | "failed">;

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
 * Path on the private zoend origin. `suffix` is `/confirm` for the bind POST.
 */
export function zoendOnboardUrl(baseUrl: string, token: string, suffix = ""): URL {
  return new URL(
    `/onboard/${encodeURIComponent(token)}${suffix}`,
    `${baseUrl}/`,
  );
}

/**
 * Fail closed unless this is a local redirect door without zoend.
 */
export function stubOnboardLookup(mode: "open" | "closed"): OnboardLookup {
  return async (token) => {
    if (mode === "closed" || parseOnboardToken(token) === undefined) {
      return { kind: "missing" };
    }
    return { kind: "ready" };
  };
}

/**
 * HTTP GET to private zoend. Returns ready or missing only.
 * Never invents `verification_uri_complete`.
 */
export function zoendOnboardLookup(baseUrl: string): OnboardLookup {
  return async (token) => {
    const parsed = parseOnboardToken(token);
    if (parsed === undefined) {
      return { kind: "missing" };
    }
    try {
      const response = await fetch(zoendOnboardUrl(baseUrl, parsed), {
        redirect: "manual",
        signal: AbortSignal.timeout(5_000),
      });
      return response.ok ? { kind: "ready" } : { kind: "missing" };
    } catch {
      return { kind: "missing" };
    }
  };
}

export function interpretConfirmResponse(
  status: number,
  body: string,
): "bound" | "failed" {
  if (status === 200) {
    return "bound";
  }
  if (status === 409 && body.includes("already consumed")) {
    return "bound";
  }
  return "failed";
}

/**
 * HTTP POST to zoend `/onboard/{token}/confirm` so `complete_onboard` binds
 * and consumes the WhatsApp JID. This package does not import zoend.
 */
export function zoendOnboardConfirm(baseUrl: string): OnboardConfirm {
  return async (token) => {
    const parsed = parseOnboardToken(token);
    if (parsed === undefined) {
      return "failed";
    }
    try {
      const response = await fetch(
        zoendOnboardUrl(baseUrl, parsed, "/confirm"),
        {
          method: "POST",
          redirect: "manual",
          signal: AbortSignal.timeout(5_000),
        },
      );
      return interpretConfirmResponse(response.status, await response.text());
    } catch {
      return "failed";
    }
  };
}

export function resolveOnboardLookup(
  lookup: OnboardLookup | undefined,
  identityBaseUrl: string | undefined,
  local: boolean,
): OnboardLookup {
  if (lookup !== undefined) {
    return lookup;
  }
  if (identityBaseUrl !== undefined) {
    return zoendOnboardLookup(identityBaseUrl);
  }
  return stubOnboardLookup(local ? "open" : "closed");
}

export function resolveOnboardConfirm(
  confirm: OnboardConfirm | undefined,
  identityBaseUrl: string | undefined,
): OnboardConfirm {
  if (confirm !== undefined) {
    return confirm;
  }
  if (identityBaseUrl !== undefined) {
    return zoendOnboardConfirm(identityBaseUrl);
  }
  return async () => "failed";
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

export function confirmFailedPage(): string {
  return page("Não deu para confirmar este WhatsApp.");
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
