import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createPublisherKeyPair,
  signPackDigest,
  type PublisherKeyPair,
} from "../../archive/packages/pack/src/index.js";
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

export const scenario = "pack-kitchen";
export const repositoryRoot = process.cwd();
export const generatedDirectory = e2eGeneratedDirectory(
  repositoryRoot,
  scenario,
);
export const postgresPort = 55_504;
export const keycloakPort = 58_620;
export const zoendPort = 58_621;
export const baseUrl = e2eHttpUrl("ZOEN_E2E_ZOEND_PORT", zoendPort);
export const applicationDatabaseUrl = e2ePostgresUrl(
  "zoen_app",
  "zoen_app",
  postgresPort,
);
export const tenantCreator = "tenant.a";
export const tenantFresh = "tenant.b";
export const publisherId = "pub.partner";
export const publisherDisplayName = "Partner Co";

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

export function publisherKeys(
  publicKeyId = "key.pub.partner.1",
): PublisherKeyPair {
  return createPublisherKeyPair(publicKeyId);
}

export function signCandidate(
  packDigest: string,
  keys: PublisherKeyPair,
) {
  return signPackDigest(packDigest, keys);
}

export async function api(
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
