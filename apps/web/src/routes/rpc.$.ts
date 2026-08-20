import { createFileRoute } from "@tanstack/react-router";

const connectPath =
  /^\/zoen\.[a-z][a-z0-9_]*\.v1\.[A-Z][A-Za-z0-9_]*Service\/[A-Z][A-Za-z0-9_]*$/u;
const hopByHopHeaders = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
] as const;

export const Route = createFileRoute("/rpc/$")({
  server: {
    handlers: {
      GET: ({ request }) => proxyConnect(request),
      POST: ({ request }) => proxyConnect(request),
    },
  },
});

async function proxyConnect(request: Request): Promise<Response> {
  const targetOrigin = process.env.ZOEN_WEB_RPC_ORIGIN;
  if (targetOrigin === undefined || targetOrigin === "") {
    throw new Error("ZOEN_WEB_RPC_ORIGIN is required");
  }
  const incoming = new URL(request.url);
  const target = connectTarget(incoming, targetOrigin);
  if (target === undefined) {
    return new Response("Invalid Connect RPC path", { status: 400 });
  }
  const headers = proxyHeaders(request.headers);
  headers.set("accept-encoding", "identity");
  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.arrayBuffer();
  return fetch(target, {
    body,
    headers,
    method: request.method,
    redirect: "manual",
  });
}

function connectTarget(incoming: URL, targetOrigin: string): URL | undefined {
  const path = incoming.pathname.replace(/^\/rpc/u, "");
  const pathWithoutLeadingSlash = path.startsWith("/") ? path.slice(1) : path;
  if (
    path.startsWith("//") ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(pathWithoutLeadingSlash) ||
    !connectPath.test(path)
  ) {
    return undefined;
  }
  const origin = new URL(targetOrigin);
  const target = new URL(path, origin);
  target.search = incoming.search;
  return target.origin === origin.origin ? target : undefined;
}

function proxyHeaders(incoming: Headers): Headers {
  const headers = new Headers(incoming);
  const connection = headers.get("connection");
  if (connection !== null) {
    for (const name of connection.split(",")) {
      headers.delete(name.trim());
    }
  }
  for (const name of hopByHopHeaders) {
    headers.delete(name);
  }
  headers.delete("content-length");
  headers.delete("host");
  return headers;
}
