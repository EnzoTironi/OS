import {
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { createConnection } from "node:net";
import path from "node:path";
import {
  baseUrl,
  environment,
  repositoryRoot,
  type ManagedProcess,
} from "../company-brain-live/support.js";
import {
  e2eHttpUrl,
  e2ePort,
  e2ePostgresUrl,
} from "../host-env.js";
import {
  startWeb,
  type WebProcess,
} from "../web-deterministic/support.js";

const postgresPortFallback = 55_449;
const providerPortFallback = 58_194;
const workerPortFallback = 58_195;
const workerControlPortFallback = 58_196;
const minioPortFallback = 59_011;
const workerPort = e2ePort("ZOEN_E2E_WORKER_PORT", workerPortFallback);
const workerControlPort = e2ePort(
  "ZOEN_E2E_WORKER_CONTROL_PORT",
  workerControlPortFallback,
);
export const surfaceUrl = e2eHttpUrl(
  "ZOEN_E2E_WORKER_CONTROL_PORT",
  workerControlPortFallback,
  "/surface",
);

export async function startAdaptiveWorker(input: {
  readonly baselineOperationId: string;
  readonly bearerToken: string;
  readonly definitionDigest: string;
}): Promise<ManagedProcess> {
  const output: string[] = [];
  const stderr: string[] = [];
  const child = spawn(
    process.execPath,
    [
      path.join(
        repositoryRoot,
        "dist",
        "e2e",
        "web-adaptive-live",
        "worker.js",
      ),
    ],
    {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        DATABASE_URL: e2ePostgresUrl(
          "zoen_app",
          "zoen_app",
          postgresPortFallback,
        ),
        OPENCODE_API_KEY: environment.OPENCODE_API_KEY,
        OPENCODE_BASE_URL: e2eHttpUrl(
          "ZOEN_E2E_PROVIDER_PORT",
          providerPortFallback,
        ),
        S3_ACCESS_KEY_ID: "zoen-access",
        S3_BUCKET: "zoen-company-brain",
        S3_ENDPOINT: e2eHttpUrl("ZOEN_E2E_MINIO_PORT", minioPortFallback),
        S3_REGION: "us-east-1",
        S3_SECRET_ACCESS_KEY: "zoen-secret",
        ZOEN_AGENT_BEARER_TOKEN: input.bearerToken,
        ZOEN_AGENT_DEFINITION_DIGEST: input.definitionDigest,
        ZOEN_AGENT_SERVICE_URL: baseUrl,
        ZOEN_BASELINE_OPERATION_ID: input.baselineOperationId,
        ZOEN_PROVIDER_A_ID: environment.ZOEN_PROVIDER_A_ID,
        ZOEN_PROVIDER_A_MODEL: environment.ZOEN_PROVIDER_A_MODEL,
        ZOEN_PROVIDER_B_ID: environment.ZOEN_PROVIDER_B_ID,
        ZOEN_PROVIDER_B_MODEL: environment.ZOEN_PROVIDER_B_MODEL,
      },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  child.stdin.end();
  child.stdout.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    output.push(text);
    stderr.push(text);
  });
  const processHandle = {
    child,
    name: "Adaptive Surface worker",
    output,
    stderr,
  };
  await waitForPort(child, output, workerPort, "Adaptive Surface worker");
  await waitForPort(
    child,
    output,
    workerControlPort,
    "Adaptive Surface control server",
  );
  return processHandle;
}

export function startAdaptiveWeb(proxyOrigin: string): Promise<WebProcess> {
  return startWeb(proxyOrigin, {
    adaptiveSurfaceUrl: surfaceUrl,
    definitionId: "inventory.companyBrain",
    resourceId: "inventory.item.1",
    validAt: "2026-08-20T00:00:00.000Z",
  });
}

async function waitForPort(
  child: ChildProcessWithoutNullStreams,
  output: readonly string[],
  port: number,
  name: string,
): Promise<void> {
  for (let attempt = 0; attempt < 600; attempt += 1) {
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
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(connected);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(200, () => finish(false));
  });
}
