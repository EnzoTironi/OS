import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { toNodeHandler } from "better-auth/node";
import { auth, config } from "./auth.ts";
import {
  devicePage,
  homePage,
  loginPage,
  onboardDone,
  onboardStart,
} from "./html.ts";

const handleAuth = toNodeHandler(auth);

function pathnameOf(req: IncomingMessage): string {
  return new URL(req.url ?? "/", "http://127.0.0.1").pathname;
}

function isGooglePath(pathname: string): boolean {
  return (
    pathname === "/api/auth/sign-in/social" ||
    pathname === "/api/auth/callback/google"
  );
}

function sendHtml(res: ServerResponse, body: string): void {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(body);
}

function sendText(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(body);
}

const server = createServer((req, res) => {
  const pathname = pathnameOf(req);

  if (pathname.startsWith("/api/auth")) {
    if (config.google.kind === "unset" && isGooglePath(pathname)) {
      sendText(res, 503, "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set");
      return;
    }
    handleAuth(req, res);
    return;
  }

  if (req.method !== "GET") {
    sendText(res, 405, "method not allowed");
    return;
  }

  if (pathname === "/" || pathname === "") {
    sendHtml(res, homePage(config.google));
    return;
  }

  if (pathname === "/login") {
    sendHtml(res, loginPage(config.google));
    return;
  }

  if (pathname === "/onboard/done") {
    sendHtml(res, onboardDone());
    return;
  }

  if (pathname === "/device") {
    sendHtml(res, devicePage());
    return;
  }

  const onboardPrefix = "/onboard/";
  if (pathname.startsWith(onboardPrefix)) {
    const token = pathname.slice(onboardPrefix.length);
    if (token.length > 0 && !token.includes("/")) {
      sendHtml(res, onboardStart(config.google));
      return;
    }
  }

  sendText(res, 404, "not found");
});

server.listen(config.listenPort, config.listenHost, () => {
  process.stdout.write(
    `http://${config.listenHost}:${String(config.listenPort)}\n`
  );
});
