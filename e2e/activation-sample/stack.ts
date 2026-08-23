import { execFile, spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import {
  access,
  mkdir,
  readFile,
  unlink,
  writeFile,
} from "node:fs/promises";
import { createConnection } from "node:net";
import path from "node:path";
import { Client as PostgresClient } from "pg";
import {
  e2eGeneratedDirectory,
  e2eHttpUrl,
  e2eListenAddr,
  e2ePort,
  e2ePostgresUrl,
} from "../host-env.js";
import {
  startWeb,
  stopWeb,
  type WebProcess,
} from "../web-deterministic/support.js";
import {
  ACTIVATION_BUDGET_MS,
  COMPOSE_PROJECT,
  SCENARIO,
  type ComponentHealth,
  type ComponentName,
  type DoctorReport,
  type SampleCompanyRef,
  type StackEndpoints,
  type StackHandle,
  type StackStatus,
  type TimingPhase,
  type TimingReport,
} from "./types.js";

const repositoryRoot = process.cwd();
const scenarioDirectory = path.join(repositoryRoot, "e2e", SCENARIO);
const composeFile = path.join("e2e", SCENARIO, "compose.yaml");
const zoendBinary = path.join(repositoryRoot, "target", "debug", "zoend");

type HostProcess = {
  readonly child: ChildProcess;
  readonly output: string[];
};

let liveZoend: HostProcess | undefined;
let liveWeb: WebProcess | undefined;

export function stackGeneratedDir(root = repositoryRoot): string {
  return e2eGeneratedDirectory(root, SCENARIO);
}

export function stackEndpoints(): StackEndpoints {
  const keycloakOrigin = e2eHttpUrl("ZOEN_E2E_KEYCLOAK_PORT", 58_350);
  return {
    postgresUrl: e2ePostgresUrl("postgres", "postgres", 55_457),
    keycloakOrigin,
    oidcIssuer: `${keycloakOrigin}/realms/zoen`,
    zoendOrigin: e2eHttpUrl("ZOEN_E2E_ZOEND_PORT", 58_351),
    webOrigin: e2eHttpUrl("ZOEN_E2E_WEB_PORT", 58_359),
    projectName: COMPOSE_PROJECT,
  };
}

export async function loadLocalStack(
  root = repositoryRoot,
): Promise<StackHandle | null> {
  const generatedDir = stackGeneratedDir(root);
  const stackPath = path.join(generatedDir, "stack.json");
  try {
    await access(stackPath);
  } catch {
    return null;
  }
  const raw = JSON.parse(await readFile(stackPath, "utf8")) as StackHandle;
  return {
    ...raw,
    root,
    generatedDir,
    endpoints: stackEndpoints(),
  };
}

export async function loadSampleRef(
  handle: StackHandle,
): Promise<SampleCompanyRef | undefined> {
  const samplePath = path.join(handle.generatedDir, "sample.json");
  try {
    await access(samplePath);
  } catch {
    return undefined;
  }
  return JSON.parse(await readFile(samplePath, "utf8")) as SampleCompanyRef;
}

export async function writeSampleRef(
  handle: StackHandle,
  sample: SampleCompanyRef,
): Promise<void> {
  await mkdir(handle.generatedDir, { recursive: true });
  await writeFile(
    path.join(handle.generatedDir, "sample.json"),
    `${JSON.stringify(sample, null, 2)}\n`,
  );
}

async function writeStackHandle(handle: StackHandle): Promise<void> {
  await mkdir(handle.generatedDir, { recursive: true });
  await writeFile(
    path.join(handle.generatedDir, "stack.json"),
    `${JSON.stringify(handle, null, 2)}\n`,
  );
}

export async function ensureStackReady(opts: {
  readonly createIfMissing: boolean;
  readonly root?: string;
  readonly seed?: boolean;
}): Promise<{ handle: StackHandle; timing: TimingReport; status: StackStatus }> {
  const root = opts.root ?? repositoryRoot;
  const phases: TimingPhase[] = [];
  const wallStarted = Date.now();
  const existing = await loadLocalStack(root);
  if (existing !== null) {
    const status = await statusStack(root);
    if (status.kind === "Ready") {
      return {
        handle: existing,
        status,
        timing: finalizeTiming(wallStarted, phases),
      };
    }
    if (status.kind === "Degraded" && opts.createIfMissing) {
      await stopStack(root);
    } else if (status.kind === "Degraded") {
      throw new Error(formatStatusError(status));
    }
  } else if (!opts.createIfMissing) {
    throw new Error("activation-sample stack is Stopped; run `just start`");
  }

  const status = await startStack(root, {
    seed: opts.seed ?? true,
    phases,
    wallStarted,
  });
  if (status.kind !== "Ready") {
    throw new Error(formatStatusError(status));
  }
  const handle = await loadLocalStack(root);
  if (handle === null) {
    throw new Error("stack handle missing after Ready");
  }
  return {
    handle,
    status,
    timing: finalizeTiming(wallStarted, phases),
  };
}

export async function startStack(
  root = repositoryRoot,
  opts: {
    readonly seed?: boolean;
    readonly phases?: TimingPhase[];
    readonly wallStarted?: number;
  } = {},
): Promise<StackStatus> {
  const phases = opts.phases ?? [];
  const wallStarted = opts.wallStarted ?? Date.now();
  const generatedDir = stackGeneratedDir(root);
  const endpoints = stackEndpoints();
  const policyManifestPath = path.join(generatedDir, "policies.json");
  const handle: StackHandle = {
    root,
    generatedDir,
    endpoints,
    pidFiles: {
      zoend: path.join(generatedDir, "zoend.pid"),
      web: path.join(generatedDir, "web.pid"),
    },
    policyManifestPath,
  };

  await mkdir(generatedDir, { recursive: true });
  await phase(phases, "prepare-realm", async () => {
    await command(process.execPath, [
      path.join(scenarioDirectory, "prepare-realm.mjs"),
    ], {
      ZOEN_E2E_GENERATED_DIR: generatedDir,
      ZOEN_E2E_WEB_PORT: String(e2ePort("ZOEN_E2E_WEB_PORT", 58_359)),
    });
  });

  await phase(phases, "compose-up", async () => {
    await compose("up", "--detach", "--wait");
  });

  const postgres = await probePostgres(endpoints);
  const keycloak = await probeKeycloak(endpoints);
  if (postgres.state !== "ready" || keycloak.state !== "ready") {
    return {
      kind: "Degraded",
      components: [postgres, keycloak],
      endpoints,
    };
  }

  await phase(phases, "policy-manifest", async () => {
    const { preparePolicyManifest } = await import("./seed.js");
    await preparePolicyManifest(handle);
  });

  await phase(phases, "zoend", async () => {
    liveZoend = await startZoend(handle);
    await writeFile(
      handle.pidFiles.zoend!,
      `${liveZoend.child.pid ?? ""}\n`,
    );
  });

  const zoend = await probeZoend(endpoints);
  if (zoend.state !== "ready") {
    return {
      kind: "Degraded",
      components: [postgres, keycloak, zoend],
      endpoints,
    };
  }

  let sample: SampleCompanyRef | undefined;
  if (opts.seed !== false) {
    await phase(phases, "sample-seed", async () => {
      const { seedSampleCompany } = await import("./seed.js");
      const result = await seedSampleCompany(handle, { mode: "ensure" });
      sample = result.sample;
    });
  }

  if (sample === undefined) {
    sample = await loadSampleRef(handle);
  }

  await phase(phases, "web", async () => {
    liveWeb = await startWeb(endpoints.zoendOrigin, {
      definitionId: sample?.webBindings.definitionId,
      resourceId: sample?.webBindings.resourceId,
      validAt: sample?.webBindings.validAt,
    });
    await writeFile(handle.pidFiles.web!, `${liveWeb.child.pid ?? ""}\n`);
  });

  await writeStackHandle(handle);
  const components = await probeAll(endpoints, sample);
  const timing = finalizeTiming(wallStarted, phases);
  await writeFile(
    path.join(generatedDir, "timing.json"),
    `${JSON.stringify(timing, null, 2)}\n`,
  );

  if (!components.every((component) => component.state === "ready")) {
    return { kind: "Degraded", components, endpoints, sample };
  }
  return { kind: "Ready", components, endpoints, sample };
}

export async function stopStack(root = repositoryRoot): Promise<void> {
  const handle = await loadLocalStack(root);
  if (liveWeb !== undefined) {
    await stopWeb(liveWeb);
    liveWeb = undefined;
  } else if (handle?.pidFiles.web !== undefined) {
    await killPidFile(handle.pidFiles.web);
  }
  if (liveZoend !== undefined) {
    await stopChild(liveZoend.child);
    liveZoend = undefined;
  } else if (handle?.pidFiles.zoend !== undefined) {
    await killPidFile(handle.pidFiles.zoend);
  }
  try {
    await compose("down", "--volumes", "--remove-orphans");
  } catch {}
  if (handle !== null) {
    await unlink(path.join(handle.generatedDir, "stack.json")).catch(() => undefined);
  }
}

export async function statusStack(root = repositoryRoot): Promise<StackStatus> {
  const handle = await loadLocalStack(root);
  if (handle === null) {
    return {
      kind: "Stopped",
      components: [
        absent("postgres"),
        absent("keycloak"),
        absent("zoend"),
        absent("web"),
        absent("sample-seed"),
      ],
    };
  }
  const sample = await loadSampleRef(handle);
  const components = await probeAll(handle.endpoints, sample);
  if (components.every((component) => component.state === "ready")) {
    return {
      kind: "Ready",
      components,
      endpoints: handle.endpoints,
      sample,
    };
  }
  if (components.every((component) => component.state === "absent")) {
    return { kind: "Stopped", components };
  }
  return {
    kind: "Degraded",
    components,
    endpoints: handle.endpoints,
    sample,
  };
}

export async function doctorStack(root = repositoryRoot): Promise<DoctorReport> {
  const blockers: string[] = [];
  const hints: string[] = [];
  if (!(await pathExists(zoendBinary))) {
    blockers.push("missing target/debug/zoend; run `just build`");
  }
  if (
    !(await pathExists(
      path.join(repositoryRoot, "apps", "web", ".output", "server", "index.mjs"),
    ))
  ) {
    blockers.push(
      "missing apps/web/.output/server/index.mjs; run `npm run build`",
    );
  }
  try {
    await command("docker", ["info"]);
  } catch {
    blockers.push("docker is not available");
    hints.push("Install Docker Desktop or a compatible engine");
  }

  const status = await statusStack(root);
  switch (status.kind) {
    case "Stopped":
      blockers.push("stack is Stopped");
      hints.push("Run `just start` to bring up the Sample Company stack");
      break;
    case "Degraded":
      for (const component of status.components) {
        if (component.state !== "ready") {
          blockers.push(
            `${component.name}: ${component.state}${component.detail ? ` (${component.detail})` : ""}`,
          );
        }
      }
      break;
    case "Ready":
      break;
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }

  return {
    status,
    blockers,
    hints,
    mutantGuards: {
      readinessRequiresAllReady: true,
      noSleepAsSuccess: true,
      sampleUsesOidcNotZoenAccount: true,
    },
  };
}

async function probeAll(
  endpoints: StackEndpoints,
  sample: SampleCompanyRef | undefined,
): Promise<ComponentHealth[]> {
  return [
    await probePostgres(endpoints),
    await probeKeycloak(endpoints),
    await probeZoend(endpoints),
    await probeWeb(endpoints),
    await probeSampleSeed(endpoints, sample),
  ];
}

async function probePostgres(endpoints: StackEndpoints): Promise<ComponentHealth> {
  const client = new PostgresClient({
    connectionString: endpoints.postgresUrl,
    connectionTimeoutMillis: 2_000,
  });
  try {
    await client.connect();
    await client.query("SELECT 1");
    return { name: "postgres", state: "ready" };
  } catch (cause: unknown) {
    return {
      name: "postgres",
      state: "unhealthy",
      detail: cause instanceof Error ? cause.message : String(cause),
    };
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function probeKeycloak(
  endpoints: StackEndpoints,
): Promise<ComponentHealth> {
  try {
    const response = await fetch(
      `${endpoints.oidcIssuer}/.well-known/openid-configuration`,
      { signal: AbortSignal.timeout(3_000) },
    );
    if (!response.ok) {
      return {
        name: "keycloak",
        state: "unhealthy",
        detail: `OIDC discovery HTTP ${response.status}`,
      };
    }
    return { name: "keycloak", state: "ready", detail: "OIDC discovery" };
  } catch (cause: unknown) {
    return {
      name: "keycloak",
      state: "unhealthy",
      detail: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

async function probeZoend(endpoints: StackEndpoints): Promise<ComponentHealth> {
  const port = Number(new URL(endpoints.zoendOrigin).port);
  if (await canConnect(port)) {
    return { name: "zoend", state: "ready" };
  }
  return { name: "zoend", state: "absent", detail: `not listening on ${port}` };
}

async function probeWeb(endpoints: StackEndpoints): Promise<ComponentHealth> {
  try {
    const response = await fetch(endpoints.webOrigin, {
      signal: AbortSignal.timeout(3_000),
    });
    if (response.status >= 500) {
      return {
        name: "web",
        state: "unhealthy",
        detail: `HTTP ${response.status}`,
      };
    }
    return { name: "web", state: "ready" };
  } catch (cause: unknown) {
    return {
      name: "web",
      state: "absent",
      detail: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

async function probeSampleSeed(
  endpoints: StackEndpoints,
  sample: SampleCompanyRef | undefined,
): Promise<ComponentHealth> {
  if (sample === undefined) {
    return { name: "sample-seed", state: "absent", detail: "sample.json missing" };
  }
  try {
    const { oidcToken, worldClient } = await import(
      "../domain-inventory-procurement/support.js"
    );
    const { create } = await import("@bufbuild/protobuf");
    const { timestampFromDate } = await import("@bufbuild/protobuf/wkt");
    const {
      QueryConsistencySchema,
      QuerySelectionSchema,
      StrongConsistencySchema,
    } = await import("../../packages/sdk/src/gen/zoen/world/v1/world_pb.js");
    const token = await oidcToken("inventory-agent-a");
    const world = worldClient(token);
    const response = await world.semanticQuery({
      consistency: create(QueryConsistencySchema, {
        value: { case: "strong", value: create(StrongConsistencySchema) },
      }),
      definition: {
        definitionId: sample.definitionId,
        digest: sample.definitionDigest,
        revision: BigInt(sample.activatedRevision),
      },
      entityId: sample.stockPositionId,
      selection: create(QuerySelectionSchema, {
        value: {
          case: "relationId",
          value: "inventory.physicalQuantityClaim",
        },
      }),
      tenantId: sample.tenantId,
      validAt: timestampFromDate(new Date(sample.webBindings.validAt)),
    });
    if (response.values.length === 0) {
      return {
        name: "sample-seed",
        state: "unhealthy",
        detail: "stock position has no physical quantity claims",
      };
    }
    return {
      name: "sample-seed",
      state: "ready",
      detail: sample.commitmentOperationId,
    };
  } catch (cause: unknown) {
    return {
      name: "sample-seed",
      state: "unhealthy",
      detail: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

async function startZoend(handle: StackHandle): Promise<HostProcess> {
  const output: string[] = [];
  const child = spawn(zoendBinary, [], {
    cwd: handle.root,
    env: {
      ...process.env,
      DATABASE_URL: e2ePostgresUrl("zoen_app", "zoen_app", 55_457),
      S3_ACCESS_KEY_ID: "zoen-access",
      S3_ALLOW_HTTP: "true",
      S3_BUCKET: "zoen-projections",
      S3_ENDPOINT: e2eHttpUrl("ZOEN_E2E_MINIO_PORT", 59_016),
      S3_REGION: "us-east-1",
      S3_SECRET_ACCESS_KEY: "zoen-secret",
      ZOEN_CEDAR_POLICY_MANIFEST: handle.policyManifestPath,
      ZOEN_LISTEN_ADDR: e2eListenAddr("ZOEN_E2E_ZOEND_PORT", 58_351),
      ZOEN_OIDC_AUDIENCE: "zoend",
      ZOEN_OIDC_ISSUER: handle.endpoints.oidcIssuer,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdin?.end();
  child.stdout?.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  child.stderr?.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  const port = e2ePort("ZOEN_E2E_ZOEND_PORT", 58_351);
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`zoend exited during startup:\n${output.join("")}`);
    }
    if (await canConnect(port)) {
      return { child, output };
    }
    await delay(100);
  }
  throw new Error(`zoend did not listen on ${port}:\n${output.join("")}`);
}

function absent(name: ComponentName): ComponentHealth {
  return { name, state: "absent" };
}

function finalizeTiming(
  wallStarted: number,
  phases: readonly TimingPhase[],
): TimingReport {
  const wallMs = Date.now() - wallStarted;
  return {
    wallMs,
    phases,
    budgetMs: ACTIVATION_BUDGET_MS,
    withinBudget: wallMs <= ACTIVATION_BUDGET_MS,
  };
}

async function phase(
  phases: TimingPhase[],
  name: string,
  work: () => Promise<void>,
): Promise<void> {
  const started = Date.now();
  await work();
  phases.push({ name, ms: Date.now() - started });
}

function formatStatusError(status: StackStatus): string {
  const lines = status.components.map(
    (component) =>
      `- ${component.name}: ${component.state}${component.detail ? ` (${component.detail})` : ""}`,
  );
  return `stack is ${status.kind}\n${lines.join("\n")}`;
}

async function compose(...arguments_: string[]): Promise<string> {
  return command("docker", [
    "compose",
    "--project-name",
    COMPOSE_PROJECT,
    "--file",
    composeFile,
    ...arguments_,
  ]);
}

function command(
  executable: string,
  arguments_: readonly string[],
  env: NodeJS.ProcessEnv = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      executable,
      [...arguments_],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: { ...process.env, ...env },
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error !== null) {
          reject(new Error(`${stdout}${stderr}`, { cause: error }));
          return;
        }
        resolve(stdout.trim());
      },
    );
  });
}

async function killPidFile(pidFile: string): Promise<void> {
  try {
    const raw = (await readFile(pidFile, "utf8")).trim();
    const pid = Number(raw);
    if (Number.isInteger(pid) && pid > 0) {
      try {
        process.kill(pid, "SIGINT");
      } catch {}
    }
    await unlink(pidFile).catch(() => undefined);
  } catch {}
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  child.kill("SIGINT");
  await once(child, "exit");
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

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
