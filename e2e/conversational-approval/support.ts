import {
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { createConnection } from "node:net";
import path from "node:path";
import {
  e2eHttpUrl,
  e2ePort,
  e2ePostgresUrl,
} from "../host-env.js";

export const repositoryRoot = process.cwd();
export const webPortFallback = 58_592;
export const webOrigin = e2eHttpUrl("ZOEN_E2E_WEB_PORT", webPortFallback);
export const interactionDatabaseUrl = e2ePostgresUrl(
  "zoen_app",
  "zoen_app",
  55_498,
);

export interface WebProcess {
  readonly child: ChildProcessWithoutNullStreams;
  readonly output: string[];
}

export async function startWeb(input: {
  readonly rpcOrigin: string;
  readonly oidcIssuer: string;
  readonly definitionId: string;
}): Promise<WebProcess> {
  const output: string[] = [];
  const webPort = e2ePort("ZOEN_E2E_WEB_PORT", webPortFallback);
  const serverEntry = path.join(
    repositoryRoot,
    "apps",
    "web",
    ".output",
    "server",
    "index.mjs",
  );
  const child = spawn(process.execPath, [serverEntry], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      NITRO_HOST: "127.0.0.1",
      NITRO_PORT: webPort.toString(),
      PORT: webPort.toString(),
      ZOEN_INTERACTION_DATABASE_URL: interactionDatabaseUrl,
      ZOEN_WEB_DEFINITION_ID: input.definitionId,
      ZOEN_WEB_OIDC_CLIENT_ID: "zoen-web",
      ZOEN_WEB_OIDC_ISSUER: input.oidcIssuer,
      ZOEN_WEB_RESOURCE_ID: "inventory.item.1",
      ZOEN_WEB_RPC_ORIGIN: input.rpcOrigin,
      ZOEN_WEB_VALID_AT: "2026-08-19T00:00:00.000Z",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdin.end();
  child.stdout.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  await waitForProcessPort(child, output, webPort, "web");
  return { child, output };
}

export async function stopWeb(web: WebProcess): Promise<void> {
  if (web.child.exitCode !== null) {
    return;
  }
  web.child.kill("SIGTERM");
  const exited = await Promise.race([
    new Promise<boolean>((resolve) =>
      web.child.once("exit", () => resolve(true)),
    ),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5_000)),
  ]);
  if (!exited && web.child.exitCode === null) {
    web.child.kill("SIGKILL");
  }
}

async function waitForProcessPort(
  child: ChildProcessWithoutNullStreams,
  output: string[],
  port: number,
  label: string,
): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `${label} exited early (${child.exitCode}): ${output.join("")}`,
      );
    }
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = createConnection({ host: "127.0.0.1", port }, () => {
          socket.end();
          resolve();
        });
        socket.on("error", reject);
      });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error(`${label} did not listen on ${port}: ${output.join("")}`);
}
