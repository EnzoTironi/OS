import cookieParser from "cookie-parser";
import { doubleCsrf } from "csrf-csrf";
import express, { type Request } from "express";
import { callbackPath, readAuthEnv, type AuthEnv } from "./env.js";
import { createAuth, type Auth, type AuthUser } from "./auth.js";

const SESSION_COOKIE = "wos-session";
const cookieOptions = {
  httpOnly: true,
  path: "/",
  sameSite: "lax" as const,
  secure: true,
};

function queryString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function cookieString(req: Request): string | undefined {
  const value = req.cookies?.[SESSION_COOKIE];
  return typeof value === "string" ? value : undefined;
}

function page(user: AuthUser | null): string {
  const welcome =
    user === null ? "" : `<p>Olá, ${escapeHtml(user.email)}.</p>`;
  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Zoen AuthKit</title></head>
<body>
<h1>Zoen AuthKit</h1>
${welcome}
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

/**
 * Standalone AuthKit routes. Do not mount this inside zoend.
 */
export function createAuthWorkosApp(input: {
  auth?: Auth;
  env?: AuthEnv;
} = {}) {
  const env = input.env ?? readAuthEnv();
  const auth = input.auth ?? createAuth();
  const app = express();
  app.use(cookieParser());
  app.use(express.urlencoded({ extended: false }));

  const { doubleCsrfProtection, generateCsrfToken } = doubleCsrf({
    getSecret: () => env.cookiePassword,
    getSessionIdentifier: (req) => cookieString(req) ?? "",
  });

  app.get("/auth/workos/login", (_req, res) => {
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
      res.redirect("/auth/workos");
    } catch {
      res.redirect("/auth/workos/login");
    }
  });

  app.get("/csrf-token", (req, res) => {
    res.json({ csrfToken: generateCsrfToken(req, res) });
  });

  app.post("/auth/workos/logout", doubleCsrfProtection, async (req, res) => {
    const { logoutUrl } = await auth.logout(cookieString(req));
    res.clearCookie(SESSION_COOKIE);
    res.redirect(logoutUrl ?? "/auth/workos");
  });

  app.get("/auth/workos", async (req, res) => {
    const user = await auth.currentUser(cookieString(req));
    res.type("html").send(page(user));
  });

  return app;
}
