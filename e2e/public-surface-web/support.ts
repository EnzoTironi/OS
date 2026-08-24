import {
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { createConnection } from "node:net";
import path from "node:path";
import {
  compilePack,
  createPublisherKeyPair,
  definePack,
  firstSuccess,
  ontologyDep,
  optionalCapability,
  requireCapability,
  signPackDigest,
  type CompiledPack,
  type PublisherKeyPair,
} from "../../packages/pack/src/index.js";
import {
  compilePackage,
  writePolicyManifest,
  type DomainFixture,
} from "../domain-inventory-procurement/support.js";
import {
  e2eGeneratedDirectory,
  e2eHttpUrl,
  e2ePort,
  e2ePostgresUrl,
  writeScenarioArtifact,
} from "../host-env.js";
import {
  definitionId,
  oidcIssuer,
  resourceId,
} from "../governed-action/support.js";

export const scenario = "public-surface-web";
export const repositoryRoot = process.cwd();
export const generatedDirectory = e2eGeneratedDirectory(
  repositoryRoot,
  scenario,
);
export const zoendOrigin = e2eHttpUrl("ZOEN_E2E_ZOEND_PORT", 58_661);
export const webOrigin = e2eHttpUrl("ZOEN_E2E_WEB_PORT", 58_662);
export const postgresPort = 55_512;
export const tenantA = "tenant.a";
export const applicationDatabaseUrl = e2ePostgresUrl(
  "zoen_app",
  "zoen_app",
  postgresPort,
);

export { writeScenarioArtifact };

export async function loadLocalPolicy(sourceName: string) {
  const source = await readFile(
    path.join(repositoryRoot, "e2e", scenario, sourceName),
    "utf8",
  );
  return {
    digest: createHash("sha256").update(source).digest("hex"),
    source,
  };
}

export async function preparePolicyManifest(
  outputPath: string,
): Promise<readonly DomainFixture[]> {
  const packageNames = [
    "party",
    "product",
    "commercial",
    "inventory",
    "procurement",
  ] as const;
  const fixtures = await Promise.all(
    packageNames.map((packageName) => compilePackage(packageName)),
  );
  const [activation, domain, inventory, procurement, purchase] =
    await Promise.all([
      loadLocalPolicy("activation.cedar"),
      loadLocalPolicy("domain.cedar"),
      loadLocalPolicy("inventory.cedar"),
      loadLocalPolicy("procurement.cedar"),
      loadLocalPolicy("purchase.cedar"),
    ]);
  await writePolicyManifest(outputPath, fixtures, {
    activation,
    domain,
    inventory,
    procurement,
    purchase,
  });
  return fixtures;
}

export type OntologyArtifact = {
  readonly definitionId: string;
  readonly digest: string;
  readonly canonicalJson: string;
};

export function buildSamplePack(
  fixtures: readonly DomainFixture[],
): CompiledPack & { readonly ontologyArtifacts: OntologyArtifact[] } {
  const authored = definePack({
    capabilities: [
      requireCapability({
        class: "source_read",
        id: "cap.source.inventory.read",
        scope: "inventory",
        sensitivity: "non_sensitive",
      }),
      optionalCapability({
        class: "external_write",
        degrade: {
          actionIds: ["procurement.raisePurchase"],
          mode: "hide_actions",
        },
        id: "cap.effect.procurement.write",
        scope: "procurement",
        sensitivity: "sensitive",
      }),
    ],
    firstSuccess: firstSuccess({
      id: "sample.first_governed_commitment",
      outcome: {
        actionId: "commercial.changeCommitment",
        kind: "action_committed",
      },
    }),
    id: "pack.zoen.sample-company",
    ontology: fixtures.map((fixture) =>
      ontologyDep({
        canonicalJson: fixture.canonicalJson,
        definitionId: fixture.metadata.definitionId,
        digest: fixture.digest,
      }),
    ),
    presentation: {
      summary: "Governed inventory + commercial baseline for local activation.",
      title: "Prevent late orders",
    },
    publisher: { displayName: "Zoen Official", id: "pub.zoen.official" },
    version: "1.0.0",
  });
  const compiled = compilePack(authored);
  return {
    ...compiled,
    ontologyArtifacts: fixtures.map((fixture) => ({
      canonicalJson: fixture.canonicalJson,
      definitionId: fixture.metadata.definitionId,
      digest: fixture.digest,
    })),
  };
}

export function publisherKeys(): PublisherKeyPair {
  return createPublisherKeyPair("key.pub.zoen.official.1");
}

export function signedSample(
  sample: CompiledPack & { readonly ontologyArtifacts: OntologyArtifact[] },
  keys: PublisherKeyPair,
) {
  return {
    ...sample,
    signature: signPackDigest(sample.digest, keys),
  };
}

export async function registryApi(
  method: string,
  route: string,
  token: string,
  body?: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${zoendOrigin}${route}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    method,
  });
  const text = await response.text();
  let parsed: Record<string, unknown> = {};
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(
        `${method} ${route} returned ${response.status} non-JSON: ${text.slice(0, 500)}`,
      );
    }
  }
  return { body: parsed, status: response.status };
}

export interface WebProcess {
  readonly child: ChildProcessWithoutNullStreams;
  readonly output: string[];
}

export async function startWeb(input: {
  readonly packRegistryBearer: string;
  readonly rpcOrigin: string;
}): Promise<WebProcess> {
  const output: string[] = [];
  const webPort = e2ePort("ZOEN_E2E_WEB_PORT", 58_662);
  const onboardingStorePath = path.join(
    generatedDirectory,
    "onboarding-store.json",
  );
  await mkdir(path.dirname(onboardingStorePath), { recursive: true });
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
        ZOEN_ONBOARDING_STORE_PATH: onboardingStorePath,
        ZOEN_WEB_DEFINITION_ID: definitionId,
        ZOEN_WEB_OIDC_CLIENT_ID: "zoen-web",
        ZOEN_WEB_OIDC_ISSUER: oidcIssuer,
        ZOEN_WEB_PACK_REGISTRY_BEARER: input.packRegistryBearer,
        ZOEN_WEB_RESOURCE_ID: resourceId,
        ZOEN_WEB_RPC_ORIGIN: input.rpcOrigin,
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

async function stopChild(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null) {
    return;
  }
  child.kill("SIGTERM");
  const exited = await Promise.race([
    new Promise<boolean>((resolve) => child.once("exit", () => resolve(true))),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5_000)),
  ]);
  if (!exited && child.exitCode === null) {
    child.kill("SIGKILL");
  }
}

export async function ensureGeneratedDirectory(): Promise<void> {
  await mkdir(generatedDirectory, { recursive: true });
}
