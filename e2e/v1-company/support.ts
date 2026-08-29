import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { create } from "@bufbuild/protobuf";
import { z } from "zod";
import { canonicalDefinitionFromJson } from "../../packages/ontology/src/index.js";
import { DefinitionReferenceSchema } from "../../gen/connect/zoen/world/v1/world_pb.js";
import {
  compilePackage as compileManufacturingPackage,
  type DomainFixture as ManufacturingFixture,
} from "../domain-manufacturing-accounting/support.js";
import { compileFiscalPackage } from "../fiscal-fault-matrix/support.js";
import {
  compileDefinition,
  repositoryRoot as evolutionRepositoryRoot,
} from "../evolution-compatible/support.js";
import {
  e2eGeneratedDirectory,
  e2eHttpUrl,
} from "../host-env.js";

export const repositoryRoot = evolutionRepositoryRoot;

export {
  actionClient,
  activateDefinition,
  adminClient,
  definitionClient,
  expectConnectCode,
  explainOperation,
  historyClient,
  proposalRequest,
  publishDefinition,
  recordEvidence,
  semanticQuery,
  tenantA,
  tenantB,
  worldClient,
} from "../domain-commercial/support.js";
export type {
  ActionClient,
  DefinitionClient,
  HistoryClient,
  SemanticValue,
  WorldClient,
} from "../domain-commercial/support.js";
export { computationClient, loadComponentFixture } from "../wasm-code-mode/support.js";
export { dispatchOnce, effectClient } from "../effects/support.js";

export const scenario = "v1-company";
export const generatedDirectory = e2eGeneratedDirectory(
  repositoryRoot,
  scenario,
);
export const packagesPath = path.join(generatedDirectory, "packages.json");
export const policiesPath = path.join(generatedDirectory, "policies.json");
const oidcIssuer = e2eHttpUrl(
  "ZOEN_E2E_KEYCLOAK_PORT",
  31_590,
  "/realms/zoen",
);
const tokenResponseSchema = z
  .object({ access_token: z.string().min(1) })
  .passthrough();

export type CompanyPackageName =
  | "accounting-foundation"
  | "commercial"
  | "compatible-v1"
  | "compatible-v2"
  | "fiscal-brazil"
  | "inventory"
  | "manufacturing"
  | "migration-v1"
  | "migration-v2"
  | "party"
  | "procurement"
  | "product"
  | "surface";

export type CompanyFixture = Omit<ManufacturingFixture, "packageName"> & {
  readonly packageName: CompanyPackageName;
};

export interface PolicySource {
  readonly digest: string;
  readonly source: string;
}

const manufacturingNames = [
  "accounting-foundation",
  "commercial",
  "inventory",
  "manufacturing",
  "party",
  "procurement",
  "product",
] as const;

export async function compileCompanyPackage(
  packageName: CompanyPackageName,
): Promise<CompanyFixture> {
  switch (packageName) {
    case "accounting-foundation":
    case "commercial":
    case "inventory":
    case "manufacturing":
    case "party":
    case "procurement":
    case "product":
      return compileManufacturingPackage(packageName);
    case "fiscal-brazil":
      return compileFiscalPackage();
    case "compatible-v1":
      return compileNamedDefinition(
        packageName,
        path.join(
          repositoryRoot,
          "packages",
          "ontology",
          "fixtures",
          "inventory.zoen.ts",
        ),
      );
    case "compatible-v2":
      return compileNamedDefinition(
        packageName,
        path.join(
          repositoryRoot,
          "packages",
          "ontology",
          "fixtures",
          "inventory-v2.zoen.ts",
        ),
      );
    case "migration-v1":
      return compileNamedDefinition(
        packageName,
        path.join(
          repositoryRoot,
          "e2e",
          "v1-company",
          "fixtures",
          "migration-v1.zoen.ts",
        ),
      );
    case "migration-v2":
      return compileNamedDefinition(
        packageName,
        path.join(
          repositoryRoot,
          "e2e",
          "v1-company",
          "fixtures",
          "migration-v2.zoen.ts",
        ),
      );
    case "surface":
      return loadCanonicalFixture(
        packageName,
        path.join(
          repositoryRoot,
          "e2e",
          "shared-tenancy",
          "definition.canonical.json",
        ),
      );
    default: {
      const exhaustive: never = packageName;
      return exhaustive;
    }
  }
}

async function loadCanonicalFixture(
  packageName: CompanyPackageName,
  sourcePath: string,
): Promise<CompanyFixture> {
  const canonicalJson = (await readFile(sourcePath, "utf8")).trim();
  const digest = sha256(canonicalJson);
  const metadata = canonicalDefinitionFromJson(canonicalJson);
  const compiled = {
    canonicalJson,
    definition: {
      definitionId: metadata.definitionId,
      revision: metadata.revision,
    },
    digest,
  };
  return {
    canonicalJson,
    compiled,
    definition: create(DefinitionReferenceSchema, {
      definitionId: metadata.definitionId,
      digest,
      revision: BigInt(metadata.revision),
    }),
    digest,
    metadata,
    packageName,
  };
}

async function compileNamedDefinition(
  packageName: CompanyPackageName,
  sourcePath: string,
): Promise<CompanyFixture> {
  const compiled = await compileDefinition(sourcePath);
  return {
    canonicalJson: compiled.canonicalJson,
    compiled,
    definition: create(DefinitionReferenceSchema, {
      definitionId: compiled.definition.definitionId,
      digest: compiled.digest,
      revision: BigInt(compiled.definition.revision),
    }),
    digest: compiled.digest,
    metadata: canonicalDefinitionFromJson(compiled.canonicalJson),
    packageName,
  };
}

export async function compileCompanyPackages(): Promise<
  Record<CompanyPackageName, CompanyFixture>
> {
  const names: CompanyPackageName[] = [
    ...manufacturingNames,
    "fiscal-brazil",
    "compatible-v1",
    "compatible-v2",
    "migration-v1",
    "migration-v2",
    "surface",
  ];
  const compiled = await Promise.all(
    names.map((name) => compileCompanyPackage(name)),
  );
  return Object.fromEntries(
    compiled.map((fixture) => [fixture.packageName, fixture]),
  ) as Record<CompanyPackageName, CompanyFixture>;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function loadPolicy(
  sourcePath: string,
): Promise<PolicySource> {
  const source = await readFile(sourcePath, "utf8");
  return { digest: sha256(source), source };
}

function policyForAction(
  actionId: string,
  policies: {
    readonly accounting: PolicySource;
    readonly activation: PolicySource;
    readonly agent: PolicySource;
    readonly evolution: PolicySource;
    readonly human: PolicySource;
    readonly purchase: PolicySource;
    readonly settlement: PolicySource;
    readonly submit: PolicySource;
    readonly tax: PolicySource;
  },
): PolicySource {
  if (actionId === "zoen.definition.activate") {
    return policies.activation;
  }
  if (actionId === "commercial.createCommitment") {
    return policies.human;
  }
  if (actionId === "procurement.governPurchase") {
    return policies.purchase;
  }
  if (actionId === "accounting.applySettlement") {
    return policies.settlement;
  }
  if (
    actionId === "accounting.postReceivable" ||
    actionId === "accounting.postPayable" ||
    actionId === "accounting.reversePosting" ||
    actionId === "accounting.correctPosting"
  ) {
    return policies.accounting;
  }
  if (
    actionId === "fiscal.requestTaxDetermination" ||
    actionId === "fiscal.admitTaxDetermination" ||
    actionId === "fiscal.admitIntentTaxDetermination"
  ) {
    return policies.tax;
  }
  if (
    actionId === "fiscal.submitDocument" ||
    actionId === "fiscal.cancelDocument" ||
    actionId === "fiscal.correctDocument" ||
    actionId === "fiscal.admitDocumentAuthorization"
  ) {
    return policies.submit;
  }
  if (actionId === "inventory.replenish") {
    return policies.evolution;
  }
  return policies.agent;
}

export async function writeCompanyPolicies(
  fixtures: readonly CompanyFixture[],
): Promise<void> {
  const [activation, agent, human, purchase, settlement, accounting, tax, submit, evolution] =
    await Promise.all([
      loadPolicy(path.join(repositoryRoot, "e2e", "domain-commercial", "activation.cedar")),
      loadPolicy(path.join(repositoryRoot, "e2e", "v1-company", "agent.cedar")),
      loadPolicy(path.join(repositoryRoot, "e2e", "v1-company", "human.cedar")),
      loadPolicy(
        path.join(repositoryRoot, "e2e", "domain-inventory-procurement", "purchase.cedar"),
      ),
      loadPolicy(
        path.join(
          repositoryRoot,
          "e2e",
          "domain-manufacturing-accounting",
          "settlement.cedar",
        ),
      ),
      loadPolicy(
        path.join(
          repositoryRoot,
          "e2e",
          "domain-manufacturing-accounting",
          "accounting.cedar",
        ),
      ),
      loadPolicy(path.join(repositoryRoot, "e2e", "fiscal-fault-matrix", "tax.cedar")),
      loadPolicy(path.join(repositoryRoot, "e2e", "fiscal-fault-matrix", "submit.cedar")),
      loadPolicy(path.join(repositoryRoot, "e2e", "evolution-compatible", "action.cedar")),
    ]);
  const policySet = {
    accounting,
    activation,
    agent,
    evolution,
    human,
    purchase,
    settlement,
    submit,
    tax,
  };
  const policies = fixtures.flatMap((fixture) => [
    {
      actionId: "zoen.definition.activate",
      definitionDigest: fixture.digest,
      digest: activation.digest,
      policyId: `policy.activation.${fixture.metadata.definitionId}.r${fixture.metadata.revision}`,
      revision: fixture.metadata.revision,
      source: activation.source,
    },
    ...fixture.metadata.actions.map((action) => {
      const policy = policyForAction(action.id, policySet);
      return {
        actionId: action.id,
        definitionDigest: fixture.digest,
        digest: policy.digest,
        policyId: `policy.${action.id}.${fixture.packageName}.r${fixture.metadata.revision}`,
        revision: fixture.metadata.revision,
        source: policy.source,
      };
    }),
  ]);
  await mkdir(generatedDirectory, { recursive: true });
  await writeFile(policiesPath, `${JSON.stringify({ policies }, null, 2)}\n`);
}

export async function writeCompanyPackageIndex(
  fixtures: Record<CompanyPackageName, CompanyFixture>,
): Promise<void> {
  const index = Object.fromEntries(
    Object.values(fixtures).map((fixture) => [
      fixture.packageName,
      {
        canonicalJson: fixture.canonicalJson,
        definitionId: fixture.metadata.definitionId,
        digest: fixture.digest,
        revision: fixture.metadata.revision,
      },
    ]),
  );
  await mkdir(generatedDirectory, { recursive: true });
  await writeFile(packagesPath, `${JSON.stringify(index, null, 2)}\n`);
}

export async function oidcToken(clientId: string): Promise<string> {
  const response = await fetch(`${oidcIssuer}/protocol/openid-connect/token`, {
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: `${clientId}-secret`,
      grant_type: "client_credentials",
    }),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    method: "POST",
  });
  const body: unknown = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  return tokenResponseSchema.parse(body).access_token;
}

export async function passwordToken(username: string): Promise<string> {
  const response = await fetch(`${oidcIssuer}/protocol/openid-connect/token`, {
    body: new URLSearchParams({
      client_id: "zoen-web",
      grant_type: "password",
      password: "web-password",
      username,
    }),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    method: "POST",
  });
  const body: unknown = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  return tokenResponseSchema.parse(body).access_token;
}
