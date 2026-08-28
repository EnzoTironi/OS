const DISCOVERY_PATH = "/.well-known/openid-configuration";

/**
 * Wait until Keycloak realm discovery answers. TCP health can pass before
 * import finishes. Fetches abort so a hung peer cannot ignore the deadline.
 */
export async function waitForOidc(
  issuer: string,
  timeoutMs = 90_000,
): Promise<void> {
  const url = `${issuer}${DISCOVERY_PATH}`;
  const deadline = Date.now() + timeoutMs;
  let last = "not attempted";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
      });
      if (response.ok) {
        return;
      }
      last = `HTTP ${String(response.status)}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await pause(deadline);
  }
  throw new Error(`keycloak OIDC discovery not ready: ${last}`);
}

export async function fetchOidcJson(
  url: string,
  init: RequestInit,
  deadline: number,
): Promise<{ ok: boolean; body: unknown }> {
  try {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
    });
    return { body: await response.json(), ok: response.ok };
  } catch (error) {
    const last = error instanceof Error ? error.message : String(error);
    throw new TransientOidcError(last);
  }
}

export function isTransientOidcError(body: unknown): boolean {
  if (body === null || typeof body !== "object") {
    return false;
  }
  const error = "error" in body ? body.error : undefined;
  return error === "unknown_error" || error === "temporarily_unavailable";
}

export class TransientOidcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransientOidcError";
  }
}

export async function pause(deadline: number): Promise<void> {
  if (Date.now() >= deadline) {
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
}
