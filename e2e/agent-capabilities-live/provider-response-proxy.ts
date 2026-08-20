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
const initialRateLimitRetryDelayMs = 30_000;
const maximumRateLimitRetryDelayMs = 60_000;
const maximumUpstreamAttempts = 3;
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
              tool_calls: z
                .array(
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
                )
                .optional(),
            })
            .passthrough(),
        })
        .passthrough(),
    ),
  })
  .passthrough();
const providerResponseToolCallsSchema = z
  .object({
    choices: z.array(
      z
        .object({
          message: z
            .object({ tool_calls: z.array(z.unknown()).optional() })
            .passthrough(),
        })
        .passthrough(),
    ),
  })
  .passthrough();
const toolArgumentsSchema = z.record(z.string(), z.unknown());

let actionRefMutations = 0;
let identityMutations = 0;
let lastProxyError: string | null = null;
let lastProxyStatus: number | null = null;
let lastRateLimitRetryDelayMs: number | null = null;
let lastUpstreamAttempts = 0;
let lastUpstreamBodyHadToolCalls: boolean | null = null;
let lastUpstreamStatus: number | null = null;
let nextMutation: ProviderMutation | undefined;
let providerCalls = 0;
let providerCallsAtLastMutation = 0;
let providerResponsesWithToolCalls = 0;
let rateLimitRetries = 0;
let upstreamAttempts = 0;

const server = createServer((request, response) => {
  void route(request, response).catch((error: unknown) => {
    if (response.destroyed) {
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    lastProxyError = message;
    lastProxyStatus = 502;
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
      lastProxyError,
      lastProxyStatus,
      lastRateLimitRetryDelayMs,
      lastUpstreamAttempts,
      lastUpstreamBodyHadToolCalls,
      lastUpstreamStatus,
      mutationPending: nextMutation !== undefined,
      providerCalls,
      providerCallsAtLastMutation,
      providerResponsesWithToolCalls,
      rateLimitRetries,
      upstreamAttempts,
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
  if (
    request.method === "POST" &&
    url.pathname === "/control/clear-pending-mutation"
  ) {
    nextMutation = undefined;
    response.writeHead(204).end();
    return;
  }

  providerCalls += 1;
  const mutation = nextMutation;
  lastProxyError = null;
  lastProxyStatus = null;
  lastRateLimitRetryDelayMs = null;
  lastUpstreamAttempts = 0;
  lastUpstreamBodyHadToolCalls = null;
  lastUpstreamStatus = null;
  const upstream = await fetchUpstreamWithRateLimitRetry(upstreamUrl(url), {
    body: request.method === "GET" ? undefined : await readBody(request),
    headers: forwardedHeaders(request.headers),
    method: request.method,
  });
  let body = await upstream.text();
  lastProxyStatus = upstream.status;
  lastUpstreamStatus = upstream.status;
  lastUpstreamBodyHadToolCalls = providerResponseHasToolCalls(body);
  if (lastUpstreamBodyHadToolCalls) {
    providerResponsesWithToolCalls += 1;
  }
  if (
    upstream.ok &&
    mutation !== undefined &&
    nextMutation === mutation
  ) {
    const mutatedBody = mutateProviderResponse(body, mutation);
    if (mutatedBody !== undefined) {
      body = mutatedBody;
      switch (mutation.kind) {
        case "action_ref":
          actionRefMutations += 1;
          break;
        case "identity":
          identityMutations += 1;
          break;
        default: {
          const exhaustive: never = mutation;
          return exhaustive;
        }
      }
      providerCallsAtLastMutation = providerCalls;
      nextMutation = undefined;
    }
  }
  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");
  responseHeaders.delete("transfer-encoding");
  response.writeHead(upstream.status, Object.fromEntries(responseHeaders));
  response.end(body);
}

async function fetchUpstreamWithRateLimitRetry(
  url: URL,
  request: RequestInit,
): Promise<Response> {
  for (let attempt = 1; attempt <= maximumUpstreamAttempts; attempt += 1) {
    upstreamAttempts += 1;
    lastUpstreamAttempts = attempt;
    const response = await fetch(url, request);
    lastUpstreamStatus = response.status;
    if (response.status !== 429 || attempt === maximumUpstreamAttempts) {
      return response;
    }
    rateLimitRetries += 1;
    lastRateLimitRetryDelayMs = rateLimitRetryDelayMs(
      response.headers.get("retry-after"),
      attempt - 1,
    );
    await response.body?.cancel();
    await sleep(lastRateLimitRetryDelayMs);
  }
  throw new Error("upstream retry loop exhausted without a response");
}

function rateLimitRetryDelayMs(
  retryAfter: string | null,
  retryIndex: number,
): number {
  if (retryAfter !== null) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return boundedRateLimitRetryDelay(seconds * 1_000);
    }
    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) {
      return boundedRateLimitRetryDelay(retryAt - Date.now());
    }
  }
  return boundedRateLimitRetryDelay(
    initialRateLimitRetryDelayMs * 2 ** retryIndex,
  );
}

function boundedRateLimitRetryDelay(delayMs: number): number {
  return Math.min(
    maximumRateLimitRetryDelayMs,
    Math.max(0, Math.ceil(delayMs)),
  );
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function mutateProviderResponse(
  body: string,
  mutation: ProviderMutation,
): string | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return undefined;
  }
  const result = providerResponseSchema.safeParse(raw);
  if (!result.success) {
    return undefined;
  }
  const parsed = result.data;
  const toolCall = parsed.choices[0]?.message.tool_calls?.[0];
  if (toolCall === undefined) {
    return undefined;
  }
  switch (mutation.kind) {
    case "action_ref":
      toolCall.function.name = mutation.actionRef;
      break;
    case "identity": {
      let rawArguments: unknown;
      try {
        rawArguments = JSON.parse(toolCall.function.arguments);
      } catch {
        return undefined;
      }
      const argumentsResult = toolArgumentsSchema.safeParse(rawArguments);
      if (!argumentsResult.success) {
        return undefined;
      }
      argumentsResult.data.principalId = mutation.principalId;
      argumentsResult.data.tenantId = mutation.tenantId;
      toolCall.function.arguments = JSON.stringify(argumentsResult.data);
      break;
    }
    default: {
      const exhaustive: never = mutation;
      return exhaustive;
    }
  }
  return JSON.stringify(parsed);
}

function providerResponseHasToolCalls(body: string): boolean {
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return false;
  }
  const result = providerResponseToolCallsSchema.safeParse(raw);
  return (
    result.success &&
    result.data.choices.some(
      (choice) => (choice.message.tool_calls?.length ?? 0) > 0,
    )
  );
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
