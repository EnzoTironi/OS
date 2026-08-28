import cookieParser from "cookie-parser";
import { doubleCsrf } from "csrf-csrf";
import express, { type Request } from "express";
import {
  callbackPath,
  identityBaseUrl,
  readAuthEnv,
  type AuthEnv,
} from "./env.js";
import { createAuth, type Auth, type AuthUser } from "./auth.js";
import {
  httpsRedirect,
  missingOnboardPage,
  onboardState,
  parseOnboardToken,
  resolveOnboardLookup,
  returnToWhatsAppPage,
  startOnboardPage,
  tokenFromState,
  type OnboardLookup,
} from "./onboard.js";

const SESSION_COOKIE = "wos-session";
const ONBOARD_COOKIE = "wos-onboard";
const cookieOptions = {
  httpOnly: true,
  path: "/",
  sameSite: "lax" as const,
  secure: true,
};

function queryString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function namedCookie(req: Request, name: string): string | undefined {
  const value = req.cookies?.[name];
  return typeof value === "string" ? value : undefined;
}

function sessionCookie(req: Request): string | undefined {
  return namedCookie(req, SESSION_COOKIE);
}

function doorPage(user: AuthUser | null): string {
  const welcome =
    user === null ? "" : `<p>Olá, ${escapeHtml(user.email)}.</p>`;
  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Zoen AuthKit</title></head>
<body>
<h1>Zoen AuthKit</h1>
${welcome}
<p>AuthKit hospedado: Google, Apple e e-mail.</p>
<p><a href="/auth/workos/login">Entrar</a></p>
<form action="/auth/workos/logout" method="POST" id="logout-form">
<input type="hidden" name="_csrf" id="csrf-token" />
<button type="submit">Sair</button>
</form>
<script>
fetch("/csrf-token").then((r) => r.json()).then((data) => {
  document.getElementById("csrf-token").value = data.csrfToken;
});
</script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function afterAuthPath(req: Request): string {
  const fromState = tokenFromState(queryString(req.query.state));
  const fromCookie = parseOnboardToken(namedCookie(req, ONBOARD_COOKIE));
  const token = fromState ?? fromCookie;
  return token === undefined ? "/auth/workos" : `/onboard/${token}`;
}

/**
 * Zoen's screens: AuthKit door + `/onboard/:token`. Do not mount inside zoend.
 */
export function createAuthWorkosApp(input: {
  auth?: Auth;
  env?: AuthEnv;
  identityBaseUrl?: string;
  onboardLookup?: OnboardLookup;
} = {}) {
  const env = input.env ?? readAuthEnv();
  const auth = input.auth ?? createAuth();
  const lookup = resolveOnboardLookup(
    input.onboardLookup,
    input.identityBaseUrl ?? identityBaseUrl(),
  );
  const app = express();
  app.use(cookieParser());
  app.use(express.urlencoded({ extended: false }));

  const { doubleCsrfProtection, generateCsrfToken } = doubleCsrf({
    getSecret: () => env.cookiePassword,
    getSessionIdentifier: (req) => sessionCookie(req) ?? "",
  });

  app.get("/auth/workos/login", (req, res) => {
    const token = parseOnboardToken(queryString(req.query.onboard));
    if (token !== undefined) {
      res.cookie(ONBOARD_COOKIE, token, { ...cookieOptions, maxAge: 600_000 });
      res.redirect(auth.loginUrl(onboardState(token)));
      return;
    }
    res.redirect(auth.loginUrl());
  });

  app.get(callbackPath(env.redirectUri), async (req, res) => {
    const code = queryString(req.query.code);
    if (code.length === 0) {
      res.status(400).send("Nenhum código fornecido");
      return;
    }
    try {
      const { sealedSession } = await auth.handleCallback(code);
      res.cookie(SESSION_COOKIE, sealedSession, cookieOptions);
      res.redirect(afterAuthPath(req));
    } catch {
      res.redirect("/auth/workos/login");
    }
  });

  app.get("/csrf-token", (req, res) => {
    res.json({ csrfToken: generateCsrfToken(req, res) });
  });

  app.post("/auth/workos/logout", doubleCsrfProtection, async (req, res) => {
    const { logoutUrl } = await auth.logout(sessionCookie(req));
    res.clearCookie(SESSION_COOKIE);
    res.clearCookie(ONBOARD_COOKIE);
    res.redirect(logoutUrl ?? "/auth/workos");
  });

  app.get("/auth/workos", async (req, res) => {
    const user = await auth.currentUser(sessionCookie(req));
    res.type("html").send(doorPage(user));
  });

  app.get("/onboard/:token", async (req, res) => {
    const token = parseOnboardToken(req.params.token);
    if (token === undefined) {
      res.status(404).type("html").send(missingOnboardPage());
      return;
    }
    const status = await lookup(token);
    if (status.kind === "missing") {
      res.status(404).type("html").send(missingOnboardPage());
      return;
    }
    if (status.kind === "cli_complete") {
      const location = httpsRedirect(status.verificationUriComplete);
      if (location === undefined) {
        res.status(404).type("html").send(missingOnboardPage());
        return;
      }
      res.redirect(location);
      return;
    }
    const user = await auth.currentUser(sessionCookie(req));
    if (user === null) {
      res.type("html").send(startOnboardPage(token));
      return;
    }
    res.type("html").send(returnToWhatsAppPage());
  });

  return app;
}
