import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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
  e2ePostgresUrl,
  writeScenarioArtifact,
} from "../host-env.js";

export const scenario = "pack-registry";
export const repositoryRoot = process.cwd();
export const generatedDirectory = e2eGeneratedDirectory(
  repositoryRoot,
  scenario,
);
export const baseUrl = e2eHttpUrl("ZOEN_E2E_ZOEND_PORT", 58_531);
export const postgresPort = 55_486;
export const tenantA = "tenant.a";
export const tenantB = "tenant.b";
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

export type OntologyArtifact = {
  readonly definitionId: string;
  readonly digest: string;
  readonly canonicalJson: string;
};

export function buildSamplePack(
  fixtures: readonly DomainFixture[],
  options?: {
    readonly version?: string;
    readonly packId?: string;
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
    id: options?.packId ?? "pack.zoen.sample-company",
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
  const response = await fetch(`${baseUrl}${route}`, {
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

export async function writeMutantFixture(
  name: string,
  payload: unknown,
): Promise<void> {
  const directory = path.join(
    repositoryRoot,
    "e2e",
    scenario,
    "fixtures",
    name,
  );
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, "payload.json"),
    `${JSON.stringify(payload, null, 2)}\n`,
  );
}

export { writeScenarioArtifact };
