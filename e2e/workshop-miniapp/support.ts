import {
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import path from "node:path";
import {
  compilePackage,
  type DomainFixture,
} from "../domain-commercial/support.js";
import {
  oidcIssuer,
  repositoryRoot,
} from "../governed-action/support.js";
import {
  archivedWebServerEntry,
  e2eGeneratedDirectory,
  e2eHttpUrl,
  e2ePort,
} from "../host-env.js";

export const scenario = "workshop-miniapp";
export const changeCommitmentBinding = "action.commercial.changeCommitment";
export const orderLineOne = "commercial.order-line.1001";
export const orderLineTwo = "commercial.order-line.1002";
export const typeId = "commercial.OrderLine";
export const typeLimit = 8;
export const validAt = new Date("2026-08-21T12:00:00.000Z");
export const webOrigin = e2eHttpUrl("ZOEN_E2E_WEB_PORT", 58_722);
export const zoendOrigin = e2eHttpUrl("ZOEN_E2E_ZOEND_PORT", 58_721);

const webPortFallback = 58_722;

export interface WebProcess {
  readonly child: ChildProcessWithoutNullStreams;
  readonly output: string[];
}

export async function loadPolicy(sourceName: string): Promise<{
  readonly digest: string;
  readonly source: string;
}> {
  const source = await readFile(
    path.join(repositoryRoot, "e2e", scenario, sourceName),
    "utf8",
  );
  return { digest: sha256(source), source };
}

export async function compileCommercial(): Promise<DomainFixture> {
  return compilePackage("commercial");
}

export async function writePolicyManifest(
  outputPath: string,
  fixture: DomainFixture,
  activation: { readonly digest: string; readonly source: string },
  actionPolicy: { readonly digest: string; readonly source: string },
): Promise<void> {
  const policies = [
    {
      actionId: "zoen.definition.activate",
      definitionDigest: fixture.digest,
      digest: activation.digest,
      policyId: `policy.activation.${fixture.metadata.definitionId}.r${fixture.metadata.revision}`,
      revision: fixture.metadata.revision,
      source: activation.source,
    },
    ...fixture.metadata.actions.map((action) => ({
      actionId: action.id,
      definitionDigest: fixture.digest,
      digest: actionPolicy.digest,
      policyId: `policy.${action.id}.r${fixture.metadata.revision}`,
      revision: fixture.metadata.revision,
      source: actionPolicy.source,
    })),
  ];
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify({ policies }, null, 2)}\n`);
}

export async function startWeb(rpcOrigin: string): Promise<WebProcess> {
  const output: string[] = [];
  const webPort = e2ePort("ZOEN_E2E_WEB_PORT", webPortFallback);
  const onboardingStorePath = path.join(
    e2eGeneratedDirectory(repositoryRoot, scenario),
    "onboarding-store.json",
  );
  await mkdir(path.dirname(onboardingStorePath), { recursive: true });
  const child = spawn(
    process.execPath,
    [archivedWebServerEntry(repositoryRoot)],
    {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        HOST: "127.0.0.1",
        NITRO_HOST: "127.0.0.1",
        NITRO_PORT: webPort.toString(),
        PORT: webPort.toString(),
        ZOEN_ONBOARDING_STORE_PATH: onboardingStorePath,
        ZOEN_WEB_ACTION_IDS: "commercial.changeCommitment",
        ZOEN_WEB_DEFINITION_ID: "commercial.sales",
        ZOEN_WEB_OIDC_CLIENT_ID: "zoen-web",
        ZOEN_WEB_OIDC_ISSUER: oidcIssuer,
        ZOEN_WEB_RPC_ORIGIN: rpcOrigin,
        ZOEN_WEB_TYPE_ID: typeId,
        ZOEN_WEB_TYPE_LIMIT: String(typeLimit),
        ZOEN_WEB_VALID_AT: validAt.toISOString(),
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
  if (web.child.exitCode !== null || web.child.signalCode !== null) {
    return;
  }
  web.child.kill("SIGINT");
  await once(web.child, "exit");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
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
  throw new Error(
    `${name} did not listen on port ${port}:\n${output.join("")}`,
  );
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
