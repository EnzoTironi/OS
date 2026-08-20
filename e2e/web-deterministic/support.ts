import {
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { once } from "node:events";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { createConnection } from "node:net";
import path from "node:path";
import {
  e2eHttpUrl,
  e2ePort,
} from "../host-env.js";
import {
  definitionId,
  oidcIssuer,
  repositoryRoot,
  resourceId,
} from "../governed-action/support.js";

const commitPath = "/zoen.action.v1.ActionService/Commit";
const operationStatusPath =
  "/zoen.action.v1.ActionService/GetOperationStatus";
const proxyPortFallback = 58_188;
const webPortFallback = 58_187;

export interface ResponseLossProxy {
  readonly origin: string;
  readonly requests: readonly string[];
  allowStatusRecovery: () => void;
  close: () => Promise<void>;
  dropNextCommitResponse: () => void;
}

export interface WebProcess {
  readonly child: ChildProcessWithoutNullStreams;
  readonly output: string[];
}

export async function startResponseLossProxy(): Promise<ResponseLossProxy> {
  const requests: string[] = [];
  let dropCommit = false;
  let blockStatus = false;
  const server = createServer((request, response) => {
    void forward(request, response);
  });
  const origin = e2eHttpUrl("ZOEN_E2E_PROXY_PORT", proxyPortFallback);
  const targetOrigin = e2eHttpUrl("ZOEN_E2E_ZOEND_PORT", 58_181);

  async function forward(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const requestPath = request.url ?? "/";
    const pathname = new URL(requestPath, origin).pathname;
    requests.push(pathname);
    if (blockStatus && pathname.endsWith(operationStatusPath)) {
      response.statusCode = 503;
      response.end("Operation status is temporarily unavailable");
      return;
    }
    try {
      const body = await incomingBody(request);
      const headers = incomingHeaders(request);
      const requestBody = new Uint8Array(body);
      const upstream = await fetch(new URL(requestPath, targetOrigin), {
        body:
          request.method === "GET" || request.method === "HEAD"
            ? undefined
            : requestBody,
        headers,
        method: request.method,
        redirect: "manual",
      });
      const responseBody = Buffer.from(await upstream.arrayBuffer());
      if (dropCommit && pathname.endsWith(commitPath)) {
        dropCommit = false;
        blockStatus = true;
        request.socket.destroy();
        return;
      }
      response.statusCode = upstream.status;
      upstream.headers.forEach((value, name) => {
        if (name !== "content-length" && name !== "connection") {
          response.setHeader(name, value);
        }
      });
      response.end(responseBody);
    } catch (cause: unknown) {
      if (!response.headersSent) {
        response.statusCode = 502;
        response.end(cause instanceof Error ? cause.message : String(cause));
      }
    }
  }

  await listen(server, e2ePort("ZOEN_E2E_PROXY_PORT", proxyPortFallback));
  return {
    allowStatusRecovery: () => {
      blockStatus = false;
    },
    close: () => closeServer(server),
    dropNextCommitResponse: () => {
      dropCommit = true;
    },
    origin,
    requests,
  };
}

export async function startWeb(
  proxyOrigin: string,
): Promise<WebProcess> {
  const output: string[] = [];
  const webPort = e2ePort("ZOEN_E2E_WEB_PORT", webPortFallback);
  const child = spawn(
    process.execPath,
    [path.join(repositoryRoot, "apps", "web", ".output", "server", "index.mjs")],
    {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        HOST: "127.0.0.1",
        NITRO_HOST: "127.0.0.1",
        NITRO_PORT: webPort.toString(),
        PORT: webPort.toString(),
        ZOEN_WEB_DEFINITION_ID: definitionId,
        ZOEN_WEB_OIDC_CLIENT_ID: "zoen-web",
        ZOEN_WEB_OIDC_ISSUER: oidcIssuer,
        ZOEN_WEB_RESOURCE_ID: resourceId,
        ZOEN_WEB_RPC_ORIGIN: proxyOrigin,
        ZOEN_WEB_VALID_AT: "2026-08-19T00:00:00.000Z",
      },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  child.stdin.end();
  child.stdout.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  await waitForProcessPort(child, output, webPort, "web");
  return { child, output };
}

export async function stopWeb(web: WebProcess): Promise<void> {
  await stopChild(web.child);
}

function incomingHeaders(request: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(name, item);
      }
    } else {
      headers.set(name, value);
    }
  }
  headers.set("accept-encoding", "identity");
  headers.delete("connection");
  headers.delete("content-length");
  headers.delete("host");
  return headers;
}

async function incomingBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    });
  });
}

async function stopChild(
  child: ChildProcessWithoutNullStreams,
): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  child.kill("SIGINT");
  await once(child, "exit");
}

async function waitForProcessPort(
  child: ChildProcessWithoutNullStreams,
  output: readonly string[],
  port: number,
  name: string,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`${name} exited during startup:\n${output.join("")}`);
    }
    if (await canConnect(port)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${name} did not listen on port ${port}:\n${output.join("")}`);
}

function canConnect(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    let settled = false;
    const finish = (connected: boolean) => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolve(connected);
      }
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(200, () => finish(false));
  });
}
