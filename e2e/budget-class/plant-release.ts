import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseZoenJson, runZoenCli } from "../zoen-cli.js";

export interface BudgetClassSpec {
  deadlineMillis: number;
  fuel: number;
  id: string;
  instances: number;
  memories: number;
  memoryBytes: number;
  tableElements: number;
  tables: number;
}

export const defaultBudgetClasses: BudgetClassSpec[] = [
  {
    id: "clinic.query.standard",
    fuel: 5_000_000,
    memoryBytes: 8 * 1024 * 1024,
    tableElements: 1024,
    instances: 4,
    tables: 2,
    memories: 2,
    deadlineMillis: 2000,
  },
  {
    id: "clinic.query.tight",
    fuel: 20_000,
    memoryBytes: 8 * 1024 * 1024,
    tableElements: 1024,
    instances: 4,
    tables: 2,
    memories: 2,
    deadlineMillis: 2000,
  },
  {
    id: "clinic.query.deadline",
    fuel: 5_000_000,
    memoryBytes: 8 * 1024 * 1024,
    tableElements: 1024,
    instances: 4,
    tables: 2,
    memories: 2,
    deadlineMillis: 1,
  },
  {
    id: "clinic.query.memory",
    fuel: 100_000_000,
    memoryBytes: 2 * 1024 * 1024,
    tableElements: 1024,
    instances: 4,
    tables: 2,
    memories: 2,
    deadlineMillis: 2000,
  },
];

function sha256Hex(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export interface AuthorizationPolicy {
  actionId: string;
  definitionDigest: string;
  digest: string;
  policyId: string;
  revision: number;
  source: string;
}

function defaultDiscoverPolicy(): AuthorizationPolicy {
  const actionId = "zoen.world.discover";
  const definitionDigest = "a".repeat(64);
  const source = `permit (
    principal,
    action == Action::"discover",
    resource
)
when {
    context.actionId == "${actionId}"
};
`;
  return {
    actionId,
    definitionDigest,
    digest: sha256Hex(source),
    policyId: "policy.world.discover.r1",
    revision: 1,
    source,
  };
}

function buildPolicyCatalog(
  budgets: BudgetClassSpec[],
  authorizationPolicies?: AuthorizationPolicy[],
): {
  bytes: string;
  evidenceDigest: string;
} {
  const policies =
    authorizationPolicies !== undefined && authorizationPolicies.length > 0
      ? authorizationPolicies
      : [defaultDiscoverPolicy()];
  const bytes = `${JSON.stringify({
    schema: "zoen.policy-catalog.v1",
    authorization: { policies },
    membershipDelegation: [],
    sourceAdmission: [],
    computeBudgets: budgets,
  })}
`;
  return { bytes, evidenceDigest: sha256Hex(bytes) };
}

/**
 * Publish + preview + decide + activate a WorldRelease whose PolicyCatalog
 * carries the given BudgetClass entries. World id equals the tenant/world label.
 */
export async function plantBudgetRelease(input: {
  authorizationPolicies?: AuthorizationPolicy[];
  budgets?: BudgetClassSpec[];
  databaseUrl: string;
  generatedDirectory: string;
  principal?: string;
  world: string;
  zoenPath: string;
}): Promise<{
  budgetClassIds: string[];
  digest: string;
  policyCatalogDigest: string;
}> {
  const budgets = input.budgets ?? defaultBudgetClasses;
  const principal = input.principal ?? "principal.owner";
  await mkdir(input.generatedDirectory, { recursive: true });
  const policy = buildPolicyCatalog(budgets, input.authorizationPolicies);
  const bytes = {
    ontology: `ontology catalog for ${input.world} budget\n`,
    policy: policy.bytes,
    executors: `executor catalog for ${input.world} budget\n`,
    components: `component catalog for ${input.world} budget\n`,
  };
  const content = {
    world: input.world,
    parent: null,
    ontology: { bytes: bytes.ontology },
    policy: { bytes: bytes.policy },
    executors: { bytes: bytes.executors },
    components: { bytes: bytes.components },
  };
  const file = path.join(input.generatedDirectory, `release-${input.world}.json`);
  await writeFile(file, `${JSON.stringify(content)}\n`);

  const constructed = runZoenCli(input.zoenPath, input.databaseUrl, [
    "world",
    "release",
    "construct",
    "--file",
    file,
  ]);
  assert.equal(constructed.status, 0, constructed.stderr || constructed.stdout);
  const constructedBody = parseZoenJson(constructed.stdout);
  const digest = String(constructedBody.digest);

  const published = runZoenCli(input.zoenPath, input.databaseUrl, [
    "world",
    "release",
    "publish",
    "--file",
    file,
    "--principal",
    principal,
    "--policy-id",
    "policy.world",
    "--policy-digest",
    policy.evidenceDigest,
    "--policy-revision",
    "1",
    "--determining-policy",
    "policy.world",
  ]);
  assert.equal(published.status, 0, published.stderr || published.stdout);

  const previewed = runZoenCli(input.zoenPath, input.databaseUrl, [
    "world",
    "release",
    "preview",
    "--world",
    input.world,
    "--digest",
    digest,
    "--principal",
    principal,
  ]);
  assert.equal(previewed.status, 0, previewed.stderr || previewed.stdout);
  const previewBody = parseZoenJson(previewed.stdout);
  const previewDigest = String(previewBody.previewDigest);

  const decided = runZoenCli(input.zoenPath, input.databaseUrl, [
    "world",
    "release",
    "decide",
    "--preview-digest",
    previewDigest,
    "--principal",
    principal,
    "--decision",
    "approve",
  ]);
  assert.equal(decided.status, 0, decided.stderr || decided.stdout);

  const activated = runZoenCli(input.zoenPath, input.databaseUrl, [
    "world",
    "release",
    "activate",
    "--world",
    input.world,
    "--digest",
    digest,
    "--preview-digest",
    previewDigest,
    "--principal",
    principal,
  ]);
  assert.equal(activated.status, 0, activated.stderr || activated.stdout);

  return {
    budgetClassIds: budgets.map((entry) => entry.id),
    digest,
    policyCatalogDigest: sha256Hex(bytes.policy),
  };
}

export function listBudgets(
  zoenPath: string,
  databaseUrl: string,
  world: string,
): Record<string, unknown> {
  const result = runZoenCli(zoenPath, databaseUrl, [
    "world",
    "release",
    "budgets",
    "--world",
    world,
  ]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return parseZoenJson(result.stdout);
}
