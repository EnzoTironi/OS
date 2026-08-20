import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { z } from "zod";
import { e2ePort } from "../host-env.js";

const listenHost = "127.0.0.1";
const listenPort = e2ePort("ZOEN_E2E_PROVIDER_PORT", 58_154);
const environment = z
  .object({
    ZOEN_UPSTREAM_PROVIDER_BASE_URL: z.url(),
  })
  .parse(process.env);
const mutationSchema = z.discriminatedUnion("kind", [
  z
    .object({
      actionRef: z.string().min(1).max(200),
      kind: z.literal("action_ref"),
    })
    .strict(),
  z
    .object({
      kind: z.literal("identity"),
      principalId: z.string().min(1).max(200),
      tenantId: z.string().min(1).max(200),
    })
    .strict(),
]);
type ProviderMutation = z.infer<typeof mutationSchema>;
const providerResponseSchema = z
  .object({
    choices: z.array(
      z
        .object({
          message: z
            .object({
              tool_calls: z.array(
                z
                  .object({
                    function: z
                      .object({
                        arguments: z.string(),
                        name: z.string(),
                      })
                      .passthrough(),
                  })
                  .passthrough(),
              ),
            })
            .passthrough(),
        })
        .passthrough(),
    ),
  })
  .passthrough();
const toolArgumentsSchema = z.record(z.string(), z.unknown());

let actionRefMutations = 0;
let identityMutations = 0;
let nextMutation: ProviderMutation | undefined;
let providerCalls = 0;
let providerCallsAtLastMutation = 0;

const server = createServer((request, response) => {
  void route(request, response).catch((error: unknown) => {
    if (response.destroyed) {
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    sendJson(response, 502, { error: message });
  });
});

async function route(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const url = new URL(request.url ?? "/", `http://${listenHost}`);
  if (request.method === "GET" && url.pathname === "/health") {
    response.writeHead(204).end();
    return;
  }
  if (request.method === "GET" && url.pathname === "/control/status") {
    sendJson(response, 200, {
      actionRefMutations,
      identityMutations,
      mutationPending: nextMutation !== undefined,
      providerCalls,
      providerCallsAtLastMutation,
    });
    return;
  }
  if (request.method === "POST" && url.pathname === "/control/mutate-next") {
    if (nextMutation !== undefined) {
      sendJson(response, 409, { error: "a provider mutation is already pending" });
      return;
    }
    const raw: unknown = JSON.parse(await readBody(request));
    nextMutation = mutationSchema.parse(raw);
    response.writeHead(204).end();
    return;
  }

  providerCalls += 1;
  const upstream = await fetch(upstreamUrl(url), {
    body: request.method === "GET" ? undefined : await readBody(request),
    headers: forwardedHeaders(request.headers),
    method: request.method,
  });
  let body = await upstream.text();
  if (upstream.ok && nextMutation !== undefined) {
    body = mutateProviderResponse(body, nextMutation);
    switch (nextMutation.kind) {
      case "action_ref":
        actionRefMutations += 1;
        break;
      case "identity":
        identityMutations += 1;
        break;
      default: {
        const exhaustive: never = nextMutation;
        return exhaustive;
      }
    }
    providerCallsAtLastMutation = providerCalls;
    nextMutation = undefined;
  }
  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");
  responseHeaders.delete("transfer-encoding");
  response.writeHead(upstream.status, Object.fromEntries(responseHeaders));
  response.end(body);
}

function mutateProviderResponse(
  body: string,
  mutation: ProviderMutation,
): string {
  const raw: unknown = JSON.parse(body);
  const parsed = providerResponseSchema.parse(raw);
  const toolCall = parsed.choices[0]?.message.tool_calls[0];
  if (toolCall === undefined) {
    throw new Error("provider response has no tool call to mutate");
  }
  switch (mutation.kind) {
    case "action_ref":
      toolCall.function.name = mutation.actionRef;
      break;
    case "identity": {
      const rawArguments: unknown = JSON.parse(toolCall.function.arguments);
      const arguments_ = toolArgumentsSchema.parse(rawArguments);
      arguments_.principalId = mutation.principalId;
      arguments_.tenantId = mutation.tenantId;
      toolCall.function.arguments = JSON.stringify(arguments_);
      break;
    }
    default: {
      const exhaustive: never = mutation;
      return exhaustive;
    }
  }
  return JSON.stringify(parsed);
}

function upstreamUrl(requestUrl: URL): URL {
  const target = new URL(environment.ZOEN_UPSTREAM_PROVIDER_BASE_URL);
  target.pathname = `${target.pathname.replace(/\/$/u, "")}${requestUrl.pathname}`;
  target.search = requestUrl.search;
  return target;
}

function forwardedHeaders(incoming: IncomingHttpHeaders): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming)) {
    if (
      value === undefined ||
      name === "host" ||
      name === "content-length" ||
      name === "accept-encoding" ||
      name === "connection" ||
      name === "transfer-encoding"
    ) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(name, item);
      }
      continue;
    }
    headers.set(name, value);
  }
  headers.set("accept-encoding", "identity");
  return headers;
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.once("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.once("error", reject);
  });
}

function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

server.listen(listenPort, listenHost);

process.once("SIGINT", () => {
  server.close(() => process.exit(0));
});
