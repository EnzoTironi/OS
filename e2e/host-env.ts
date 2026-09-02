import { randomBytes } from "node:crypto";
import { link, mkdir, open, unlink } from "node:fs/promises";
import path from "node:path";
import { journeyRunContext } from "./journey-run-context.js";
import {
  exactSourceCommit,
  gitHead,
  hasSourceCommitAlias,
  sourceCommitKeys,
} from "./scenario-evidence.js";

type JourneyPortName = keyof ReturnType<typeof journeyRunContext>["ports"];

const journeyPortEnvironment = {
  ZOEN_E2E_ADAPTER_PORT: "adapter",
  ZOEN_E2E_AUTH_PORT: "auth",
  ZOEN_E2E_CONNECTOR_PORT: "connector",
  ZOEN_E2E_EFFECT_PROVIDER_PORT: "provider",
  ZOEN_E2E_EFFECT_WORKER_PORT: "effectWorker",
  ZOEN_E2E_KEYCLOAK_PORT: "keycloak",
  ZOEN_E2E_MINIO_PORT: "minio",
  ZOEN_E2E_PLUGNOTAS_ADAPTER_PORT: "adapter",
  ZOEN_E2E_POSTGRES_PORT: "postgres",
  ZOEN_E2E_PROTHEUS_ADAPTER_PORT: "adapter",
  ZOEN_E2E_PROVIDER_PORT: "provider",
  ZOEN_E2E_RESTATE_INGRESS_PORT: "restateIngress",
  ZOEN_E2E_RESTATE_NODE_PORT: "restateNode",
  ZOEN_E2E_RESTATE_UI_PORT: "restateUi",
  ZOEN_E2E_SYSTAX_ADAPTER_PORT: "adapter",
  ZOEN_E2E_WORKER_CONTROL_PORT: "workerControl",
  ZOEN_E2E_WORKER_PORT: "worker",
  ZOEN_E2E_ZOEND_PORT: "zoend",
} as const satisfies Readonly<Record<string, JourneyPortName>>;

/**
 * Host TCP port for an e2e scenario.
 *
 * The journey runtime publishes every owned port through the environment
 * before loading scenario code.
 */
export function e2ePort(name: string): number {
  return requiredE2ePort(name);
}

/** Host TCP port that must be assigned by the journey run context. */
export function requiredE2ePort(name: string): number {
  const context = journeyRunContext();
  const portName = Object.hasOwn(journeyPortEnvironment, name)
    ? journeyPortEnvironment[name as keyof typeof journeyPortEnvironment]
    : undefined;
  if (portName === undefined) {
    throw new Error(`${name} is not a journey runtime port`);
  }
  const raw = process.env[name];
  if (raw === undefined || raw === "") {
    throw new Error(`${name} is required; start journeys through e2e/run.sh`);
  }
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} must be a host TCP port, got ${JSON.stringify(raw)}`);
  }
  if (port !== context.ports[portName]) {
    throw new Error(
      `${name} must equal the owned ${portName} port ${context.ports[portName]}`,
    );
  }
  return port;
}

/** `127.0.0.1:<port>` for process listen addresses. */
export function e2eListenAddr(name: string): string {
  return `127.0.0.1:${e2ePort(name)}`;
}

/** `http://127.0.0.1:<port><suffix>` for local HTTP clients. */
export function e2eHttpUrl(
  name: string,
  suffix = "",
): string {
  return `http://127.0.0.1:${e2ePort(name)}${suffix}`;
}

const defaultIdentityAdminToken = "e2e-identity-admin";

/**
 * Machine bearer for identity-admin god routes in e2e.
 *
 * zoend fail-closes `provisional`, `invites`, and merge unless this matches
 * `ZOEN_IDENTITY_ADMIN_TOKEN`. OIDC bearers may bootstrap and mutate only
 * their own bound account.
 */
export function e2eIdentityAdminToken(): string {
  const configured = process.env.ZOEN_IDENTITY_ADMIN_TOKEN?.trim();
  if (configured !== undefined && configured !== "") {
    return configured;
  }
  return defaultIdentityAdminToken;
}

const defaultWhatsAppDoorE164 = "+553798136141";

/**
 * Door E.164 zoend needs to tell a WhatsApp person from the bot number.
 *
 * Missing/empty `ZOEN_WHATSAPP_DOOR_E164` fail-closes every WhatsApp subject
 * as `invalid external subject`. The default is not a person used by live
 * identity stories.
 */
export function e2eWhatsAppDoorE164(): string {
  const configured = process.env.ZOEN_WHATSAPP_DOOR_E164?.trim();
  if (configured !== undefined && configured !== "") {
    return configured;
  }
  return defaultWhatsAppDoorE164;
}

/** Postgres URL on the scenario’s published host port. */
export function e2ePostgresUrl(
  user: string,
  password: string,
): string {
  return `postgres://${user}:${password}@127.0.0.1:${e2ePort("ZOEN_E2E_POSTGRES_PORT")}/zoen`;
}

/** Environment inputs SQLx/libpq must never inherit in the projection process. */
export const projectionAmbientDatabaseVariables = [
  "DATABASE_URL",
  "ZOEN_APP_PASSWORD",
  "ZOEN_AUTH_DATABASE_URL",
  "POSTGRES_PASSWORD",
  "PGAPPNAME",
  "PGDATABASE",
  "PGHOST",
  "PGHOSTADDR",
  "PGPASSFILE",
  "PGPASSWORD",
  "PGPORT",
  "PGSERVICE",
  "PGSERVICEFILE",
  "PGSSLCERT",
  "PGSSLKEY",
  "PGSSLMODE",
  "PGSSLROOTCERT",
  "PGUSER",
  "PGOPTIONS",
] as const;

/** Copy an environment without alternate projection database inputs. */
export function projectionProcessEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const environment = { ...source };
  for (const variable of projectionAmbientDatabaseVariables) {
    delete environment[variable];
  }
  return environment;
}

/**
 * Directory for one scenario’s JSON evidence.
 *
 * Isolated so parallel runners never `rm -rf artifacts` of a sibling.
 */
export function e2eArtifactsDirectory(
  repositoryRoot: string,
  scenario: string,
): string {
  const context = matchingJourneyContext(repositoryRoot, scenario);
  return context.paths.artifacts;
}

/**
 * Directory for generated realm/policy files of one scenario.
 *
 * Isolated so cleanup of one Compose project cannot delete another’s realm.
 */
export function e2eGeneratedDirectory(
  repositoryRoot: string,
  scenario: string,
): string {
  const context = matchingJourneyContext(repositoryRoot, scenario);
  return context.paths.generated;
}

/** Write `artifacts/<scenario>/<scenario>.json` and return the path. */
export async function writeScenarioArtifact(
  repositoryRoot: string,
  scenario: string,
  value: unknown,
): Promise<string> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${scenario} artifact must be a JSON object`);
  }
  const context = matchingJourneyContext(repositoryRoot, scenario);
  const sourceCommit = gitHead(repositoryRoot);
  if (sourceCommit !== context.sourceSha) {
    throw new Error(
      `${scenario} run source ${context.sourceSha} does not match HEAD ${sourceCommit}`,
    );
  }
  const providedSourceCommitAlias = hasSourceCommitAlias(value);
  const providedSourceCommit = exactSourceCommit(value, sourceCommitKeys);
  if (providedSourceCommitAlias && providedSourceCommit !== sourceCommit) {
    throw new Error(
      `${scenario} artifact sourceCommit ${JSON.stringify(providedSourceCommit)} does not match HEAD ${sourceCommit}`,
    );
  }
  const directory = e2eArtifactsDirectory(repositoryRoot, scenario);
  await mkdir(directory, { recursive: true });
  const outputPath = path.join(directory, `${scenario}.json`);
  if (Object.hasOwn(value, "journeyRun")) {
    throw new Error(`${scenario} artifact must not provide journeyRun provenance`);
  }
  const journeyRun = {
    attempt: context.attempt,
    buildIdentity: context.buildIdentity,
    runId: context.runId,
    suiteId: context.suiteId,
  };
  const serialized = JSON.stringify(
    {
      ...value,
      journeyRun,
      sourceCommit,
    },
    null,
    2,
  );
  if (serialized === undefined) {
    throw new Error(`${scenario} artifact could not be serialized`);
  }
  const written: unknown = JSON.parse(serialized);
  if (
    written === null ||
    typeof written !== "object" ||
    Array.isArray(written) ||
    exactSourceCommit(written, sourceCommitKeys) !== sourceCommit
  ) {
    throw new Error(`${scenario} serialized artifact lost its exact sourceCommit`);
  }
  const temporary = `${outputPath}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  const handle = await open(temporary, "wx");
  try {
    await handle.writeFile(`${serialized}\n`);
  } finally {
    await handle.close();
  }
  try {
    await link(temporary, outputPath);
  } finally {
    await unlink(temporary);
  }
  return outputPath;
}

function matchingJourneyContext(repositoryRoot: string, scenario: string) {
  const context = journeyRunContext();
  if (
    context.paths.repository !== path.resolve(repositoryRoot) ||
    context.scenario !== scenario
  ) {
    throw new Error(
      `run context ${context.paths.repository}/${context.scenario} cannot serve ${repositoryRoot}/${scenario}`,
    );
  }
  return context;
}
