import { serve } from "@hono/node-server";
import { appsRouter } from "@rivet-dev/dynamic-apps";
import type { Context, Next } from "hono";
import { Hono } from "hono";

const TRAILING_SLASHES = /\/+$/u;

interface Session {
  readonly doorToken: string;
  readonly membershipId: string;
  readonly principalId: string;
  readonly tenantId: string;
}

interface WorkshopEnv {
  Variables: { session: Session };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function trimmedEnv(name: string): string | undefined {
  return nonEmptyString(process.env[name]?.trim());
}

function requiredEnv(name: string): string {
  const value = trimmedEnv(name);
  if (value === undefined) {
    throw new Error(`workshop: ${name} is required`);
  }
  return value;
}

function stripTrailingSlashes(url: string): string {
  return url.replace(TRAILING_SLASHES, "");
}

function userId(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return nonEmptyString(value.id);
}

function sessionUser(body: unknown): unknown {
  if (!isRecord(body)) {
    return undefined;
  }
  if (body.user !== undefined) {
    return body.user;
  }
  if (isRecord(body.session) && body.session.user !== undefined) {
    return body.session.user;
  }
  return undefined;
}

function sessionHeaders(request: Request): Headers | null {
  const headers = new Headers();
  const cookie = request.headers.get("cookie");
  const authorization = request.headers.get("authorization");
  if (cookie !== null && cookie.length > 0) {
    headers.set("cookie", cookie);
  }
  if (authorization !== null && authorization.length > 0) {
    headers.set("authorization", authorization);
  }
  if (headers.get("cookie") === null && headers.get("authorization") === null) {
    return null;
  }
  return headers;
}

async function fetchJson(
  url: string,
  init?: RequestInit
): Promise<unknown | undefined> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    return undefined;
  }
  if (!response.ok) {
    return undefined;
  }
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function opaqueDoorToken(request: Request): string | undefined {
  const authorization = request.headers.get("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    const token = authorization.slice("bearer ".length).trim();
    if (token.length > 0 && token.split(".").length !== 3) {
      return token;
    }
  }
  const cookie = request.headers.get("cookie");
  if (cookie === null || cookie.length === 0) {
    return undefined;
  }
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name?.endsWith("session_token")) {
      const value = rest.join("=");
      if (value.length > 0 && value.split(".").length !== 3) {
        return decodeURIComponent(value);
      }
    }
  }
  return undefined;
}

async function resolveMembership(
  zoendBaseUrl: string,
  token: string,
  tenantHint: string
): Promise<{ membershipId: string; tenantId: string } | undefined> {
  const url = `${stripTrailingSlashes(zoendBaseUrl)}/identity/admin/resolve-context?tenant=${encodeURIComponent(tenantHint)}`;
  const body = await fetchJson(url, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!isRecord(body)) {
    return undefined;
  }
  const { membershipId, tenantId: tenant } = body;
  if (typeof membershipId !== "string" || membershipId.length === 0) {
    return undefined;
  }
  return {
    membershipId,
    tenantId: nonEmptyString(tenant) ?? tenantId,
  };
}

function sanitizeAppId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 63);
}

const authBase = stripTrailingSlashes(requiredEnv("ZOEN_AUTH_BASE_URL"));
const zoendBase = stripTrailingSlashes(requiredEnv("ZOEN_ZOEND_BASE_URL"));
const tenantId = trimmedEnv("ZOEN_TENANT_ID") ?? "tenant.a";
const port = Number(trimmedEnv("ZOEN_WORKSHOP_PORT") ?? "58707");
// Loopback by default: production keeps the workshop private behind zoend's
// apps_proxy on the same host. E2E binds 0.0.0.0 so the dockerized Rivet
// engine can reach the /api/rivet runner callback via the host gateway.
const hostname = trimmedEnv("ZOEN_WORKSHOP_HOST") ?? "127.0.0.1";

async function resolveSession(request: Request): Promise<Session | undefined> {
  const headers = sessionHeaders(request);
  if (headers === null) {
    return undefined;
  }
  const body = await fetchJson(`${authBase}/api/auth/get-session`, {
    headers,
    method: "GET",
  });
  const principalId = userId(sessionUser(body));
  if (principalId === undefined) {
    return undefined;
  }
  const doorToken = opaqueDoorToken(request);
  if (doorToken === undefined) {
    return undefined;
  }
  const resolved = await resolveMembership(zoendBase, doorToken, tenantId);
  if (resolved === undefined) {
    return undefined;
  }
  return { doorToken, principalId, ...resolved };
}

const app = new Hono<WorkshopEnv>();

function doorAuth(mode: "api" | "page") {
  return async (c: Context<WorkshopEnv>, next: Next) => {
    const session = await resolveSession(c.req.raw);
    if (session === undefined) {
      return mode === "page"
        ? c.redirect("/login", 302)
        : c.json({ error: { code: "unauthorized" } }, 401);
    }
    c.set("session", session);
    await next();
  };
}

app.use("/apps/*", doorAuth("page"));
app.use("/zoen/*", doorAuth("api"));

// Tenancy: the outer wrapper stamped the requested membership on
// x-workshop-membership before rewriting /apps/<membership>/<slug>/* to the
// appsRouter shape /apps/<membership>-<slug>/*. Another membership's app does
// not exist for you, and direct /apps/<appId> access (no stamp) is not part of
// the public contract.
app.use("/apps/*", async (c, next) => {
  const membership = c.req.header("x-workshop-membership");
  const session = c.get("session");
  if (membership === undefined || membership !== session.membershipId) {
    return c.text("not found", 404);
  }
  const headers = new Headers(c.req.raw.headers);
  headers.delete("x-workshop-membership");
  c.req.raw = new Request(c.req.raw, { headers });
  await next();
});

// Backend for frontend: generated apps never hold a token. Same-origin
// /zoen/<Service>/<Method> calls are proxied to zoend with the session's door
// token and the Connect header contract (cli.rs). Governance stays
// server-side: Cedar decides whether a commit lands directly or becomes a
// human approval in chat.
app.all("/zoen/*", async (c) => {
  const session = c.get("session");
  const url = new URL(c.req.raw.url);
  const upstream = `${zoendBase}${url.pathname.slice("/zoen".length)}${url.search}`;
  const headers = new Headers();
  headers.set("authorization", `Bearer ${session.doorToken}`);
  headers.set("connect-protocol-version", "1");
  headers.set("content-type", "application/json");
  headers.set("x-zoen-tenant", session.tenantId);
  const hasBody = c.req.method !== "GET" && c.req.method !== "HEAD";
  const body = hasBody ? await c.req.raw.arrayBuffer() : undefined;
  let response: Response;
  try {
    response = await fetch(upstream, { body, headers, method: c.req.method });
  } catch {
    return c.json({ error: { code: "zoend_unreachable" } }, 502);
  }
  const responseHeaders = new Headers();
  const contentType = response.headers.get("content-type");
  if (contentType !== null) {
    responseHeaders.set("content-type", contentType);
  }
  return new Response(response.body, {
    headers: responseHeaders,
    status: response.status,
  });
});

// Engine callback for the private apps registry. Internal only: zoend's
// apps_proxy never routes /api/rivet, and the deploy flow pins the callback
// to <origin>/api/rivet via DYNAMIC_APPS_CALLBACK_URL.
app.all("/api/rivet/*", (c) => appsRouter.fetch(c.req.raw));

app.route("/apps", appsRouter);

const APPS_PATH = /^\/apps\/([^/]+)\/([^/]+)(\/.*)?$/u;

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const match = APPS_PATH.exec(url.pathname);
  if (match === null) {
    return await app.fetch(request);
  }
  const [, membership, slug, rest] = match;
  if (membership === undefined || slug === undefined) {
    return await app.fetch(request);
  }
  const appId = sanitizeAppId(`${membership}-${slug}`);
  const rewritten = new URL(
    `/apps/${appId}${rest ?? "/"}${url.search}`,
    request.url
  );
  const forward = new Request(rewritten, request);
  forward.headers.set("x-workshop-membership", membership);
  return await app.fetch(forward);
}

serve({ fetch: handle, hostname, port }, (info) => {
  console.log(`workshop: listening on ${hostname}:${info.port}`);
});
