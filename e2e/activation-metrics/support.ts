import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Client as PostgresClient } from "pg";
import {
  compilePack,
  definePack,
  firstSuccess,
  ontologyDep,
  optionalCapability,
  requireCapability,
  type CompiledPack,
} from "../../packages/pack/src/index.js";
import {
  compilePackage,
  writePolicyManifest,
  type DomainFixture,
} from "../domain-inventory-procurement/support.js";
import {
  e2eGeneratedDirectory,
  e2eHttpUrl,
  e2ePostgresUrl,
  writeScenarioArtifact,
} from "../host-env.js";

export const scenario = "activation-metrics";
export const repositoryRoot = process.cwd();
export const generatedDirectory = e2eGeneratedDirectory(
  repositoryRoot,
  scenario,
);
export const baseUrl = e2eHttpUrl("ZOEN_E2E_ZOEND_PORT", 58_561);
export const tenantA = "tenant.a";
export const tenantB = "tenant.b";
export const postgresPort = 55_492;

export const adminDatabaseUrl = e2ePostgresUrl(
  "postgres",
  "postgres",
  postgresPort,
);
export const applicationDatabaseUrl = e2ePostgresUrl(
  "zoen_app",
  "zoen_app",
  postgresPort,
);

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

export function buildSamplePack(
  fixtures: readonly DomainFixture[],
  options?: {
    readonly version?: string;
  },
): CompiledPack & { readonly ontologyArtifacts: OntologyArtifact[] } {
  const version = options?.version ?? "1.0.0";
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
      title: "Sample Company",
    },
    publisher: { displayName: "Zoen Official", id: "pub.zoen.official" },
    version,
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

export type OntologyArtifact = {
  readonly definitionId: string;
  readonly digest: string;
  readonly canonicalJson: string;
};

export async function packAdmin(
  method: string,
  route: string,
  token: string,
  body?: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${baseUrl}${route}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    method,
  });
  const text = await response.text();
  const parsed =
    text.length === 0
      ? {}
      : (JSON.parse(text) as Record<string, unknown>);
  return { body: parsed, status: response.status };
}

export async function applyActivationSchema(
  connectionString = adminDatabaseUrl,
): Promise<void> {
  const sql = await readFile(
    path.join(
      repositoryRoot,
      "packages",
      "activation-metrics",
      "sql",
      "0001_activation_observations.sql",
    ),
    "utf8",
  );
  const client = new PostgresClient({ connectionString });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

export async function openAppClient(): Promise<PostgresClient> {
  const client = new PostgresClient({
    connectionString: applicationDatabaseUrl,
  });
  await client.connect();
  return client;
}

export { writeScenarioArtifact };

export async function writePackFixture(
  compiled: CompiledPack & { readonly ontologyArtifacts: OntologyArtifact[] },
): Promise<string> {
  const directory = path.join(
    repositoryRoot,
    "e2e",
    scenario,
    "fixtures",
    "sample-company.zoenpack",
  );
  await mkdir(path.join(directory, "artifacts", "ontology"), {
    recursive: true,
  });
  await writeFile(
    path.join(directory, "manifest.jcs.json"),
    `${compiled.canonicalJson}\n`,
  );
  await writeFile(path.join(directory, "manifest.sha256"), `${compiled.digest}\n`);
  for (const artifact of compiled.ontologyArtifacts) {
    await writeFile(
      path.join(
        directory,
        "artifacts",
        "ontology",
        `${artifact.definitionId}.${artifact.digest}.json`,
      ),
      `${artifact.canonicalJson}\n`,
    );
  }
  return directory;
}
