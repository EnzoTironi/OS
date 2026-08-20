import { createFileRoute } from "@tanstack/react-router";

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
  const path = incoming.pathname.replace(/^\/rpc/u, "");
  const target = new URL(`${path}${incoming.search}`, targetOrigin);
  const headers = new Headers(request.headers);
  headers.set("accept-encoding", "identity");
  headers.delete("content-length");
  headers.delete("host");
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
