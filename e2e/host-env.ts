import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Host TCP port for an e2e scenario.
 *
 * `just e2e-run` sources `e2e/<scenario>/.env` so shared support modules
 * (effects/governed-action imported by other runners) bind the caller’s
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

/** Postgres URL on the scenario’s published host port. */
export function e2ePostgresUrl(
  user: string,
  password: string,
  fallbackPort: number,
): string {
  return `postgres://${user}:${password}@127.0.0.1:${e2ePort("ZOEN_E2E_POSTGRES_PORT", fallbackPort)}/zoen`;
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

/** Nitro server entry for the archived TanStack web app. */
export function archivedWebServerEntry(repositoryRoot: string): string {
  return path.join(
    repositoryRoot,
    "archive",
    "apps",
    "web",
    ".output",
    "server",
    "index.mjs",
  );
}

/** Write `artifacts/<scenario>/<scenario>.json` and return the path. */
export async function writeScenarioArtifact(
  repositoryRoot: string,
  scenario: string,
  value: unknown,
): Promise<string> {
  const directory = e2eArtifactsDirectory(repositoryRoot, scenario);
  await mkdir(directory, { recursive: true });
  const outputPath = path.join(directory, `${scenario}.json`);
  await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`);
  return outputPath;
}
