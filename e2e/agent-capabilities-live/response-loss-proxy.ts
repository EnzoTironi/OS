import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

const listenHost = "127.0.0.1";
const listenPort = 58_105;
const targetHost = "127.0.0.1";
const targetPort = 58_103;
const commitPath = "/zoen.action.v1.ActionService/Commit";
const operationStatusPath =
  "/zoen.action.v1.ActionService/GetOperationStatus";

let commitAttempts = 0;
let dropNextCommitResponse = false;
let droppedCommitResponses = 0;
let holdRecovery = false;
let operationStatusAttempts = 0;
const releaseWaiters = new Set<() => void>();

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
  if (
    request.method === "POST" &&
    url.pathname === "/control/drop-next-commit-response"
  ) {
    dropNextCommitResponse = true;
    holdRecovery = true;
    response.writeHead(204).end();
    return;
  }
  if (
    request.method === "POST" &&
    url.pathname === "/control/release-recovery"
  ) {
    holdRecovery = false;
    for (const release of releaseWaiters) {
      release();
    }
    releaseWaiters.clear();
    response.writeHead(204).end();
    return;
  }
  if (request.method === "GET" && url.pathname === "/control/status") {
    sendJson(response, 200, {
      commitAttempts,
      droppedCommitResponses,
      holdingRecovery: holdRecovery,
      operationStatusAttempts,
    });
    return;
  }

  const isCommit = url.pathname === commitPath;
  const isOperationStatus = url.pathname === operationStatusPath;
  if (isCommit) {
    commitAttempts += 1;
  }
  if (isOperationStatus) {
    operationStatusAttempts += 1;
    if (holdRecovery) {
      await waitForRecoveryRelease();
    }
  }
  await forward(request, response, isCommit);
}

function waitForRecoveryRelease(): Promise<void> {
  return new Promise((resolve) => {
    releaseWaiters.add(resolve);
  });
}

function forward(
  incoming: IncomingMessage,
  outgoing: ServerResponse,
  isCommit: boolean,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const upstream = httpRequest(
      {
        headers: incoming.headers,
        host: targetHost,
        method: incoming.method,
        path: incoming.url,
        port: targetPort,
      },
      (upstreamResponse) => {
        if (isCommit && dropNextCommitResponse) {
          dropNextCommitResponse = false;
          upstreamResponse.resume();
          upstreamResponse.once("end", () => {
            droppedCommitResponses += 1;
            outgoing.destroy(
              new Error("injected loss after ordinary Action commit"),
            );
            resolve();
          });
          return;
        }
        outgoing.writeHead(
          upstreamResponse.statusCode ?? 502,
          upstreamResponse.headers,
        );
        upstreamResponse.pipe(outgoing);
        upstreamResponse.once("end", resolve);
        upstreamResponse.once("error", reject);
      },
    );
    upstream.once("error", reject);
    incoming.pipe(upstream);
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
