import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  exactSourceCommit,
  gitHead,
  hasSourceCommitAlias,
  sourceCommitKeys,
} from "./scenario-evidence.js";

export const e2eRunnerIsolatedProcessGroup =
  process.env.ZOEN_E2E_RUNNER_PROCESS_GROUP === "1";
if (e2eRunnerIsolatedProcessGroup) {
  delete process.env.ZOEN_E2E_RUNNER_PROCESS_GROUP;
  process.once("SIGINT", () => process.exit(130));
  process.once("SIGTERM", () => process.exit(143));
}

/**
 * Host TCP port for an e2e scenario.
 *
 * `just e2e-run` sources `e2e/<scenario>/.env` so shared support modules
 * (effect-support/governed-action imported by other runners) bind the caller’s
 * ports instead of the module’s defaults.
 */
export function e2ePort(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") {
    return fallback;
  }
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} must be a host TCP port, got ${JSON.stringify(raw)}`);
  }
  return port;
}

/** `127.0.0.1:<port>` for process listen addresses. */
export function e2eListenAddr(name: string, fallback: number): string {
  return `127.0.0.1:${e2ePort(name, fallback)}`;
}

/** `http://127.0.0.1:<port><suffix>` for local HTTP clients. */
export function e2eHttpUrl(
  name: string,
  fallback: number,
  suffix = "",
): string {
  return `http://127.0.0.1:${e2ePort(name, fallback)}${suffix}`;
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
  fallbackPort: number,
): string {
  return `postgres://${user}:${password}@127.0.0.1:${e2ePort("ZOEN_E2E_POSTGRES_PORT", fallbackPort)}/zoen`;
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
  const override = process.env.ZOEN_E2E_ARTIFACTS_DIR;
  if (override !== undefined && override !== "") {
    return path.isAbsolute(override)
      ? override
      : path.join(repositoryRoot, override);
  }
  return path.join(repositoryRoot, "artifacts", scenario);
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
  const override = process.env.ZOEN_E2E_GENERATED_DIR;
  if (override !== undefined && override !== "") {
    return path.isAbsolute(override)
      ? override
      : path.join(repositoryRoot, override);
  }
  return path.join(repositoryRoot, "e2e", scenario, ".generated");
}

/**
 * Emit a TypeScript project through its own tsconfig.
 * Credential fiscal compiles `archive/domain/fiscal-brazil` when that tree is checked out.
 */
export function compileArchivedTsconfig(
  repositoryRoot: string,
  tsconfigRelative: string,
): void {
  execFileSync(
    process.execPath,
    [
      path.join(repositoryRoot, "node_modules", "typescript", "bin", "tsc"),
      "-p",
      path.join(repositoryRoot, tsconfigRelative),
      "--pretty",
      "false",
    ],
    { cwd: repositoryRoot, stdio: "inherit" },
  );
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
  const sourceCommit = gitHead(repositoryRoot);
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
  const serialized = JSON.stringify({ ...value, sourceCommit }, null, 2);
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
  await writeFile(outputPath, `${serialized}\n`);
  return outputPath;
}
