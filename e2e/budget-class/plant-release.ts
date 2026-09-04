import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { e2eHttpUrl } from "../host-env.js";
import {
  provisionWorldReleaseActors,
  releaseAuthorityPolicies,
  type WorldReleaseActors,
} from "../kernel-world-support.js";
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
    // High enough that the 1ms epoch deadline trips before fuel on spin.
    fuel: Number.MAX_SAFE_INTEGER,
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
} {
  const policies =
    authorizationPolicies !== undefined && authorizationPolicies.length > 0
      ? authorizationPolicies
      : [defaultDiscoverPolicy()];
  const allPolicies = [...policies, ...releaseAuthorityPolicies()];
  const bytes = `${JSON.stringify({
    schema: "zoen.policy-catalog.v1",
    authorization: { policies: allPolicies },
    membershipDelegation: [],
    sourceAdmission: [],
    computeBudgets: budgets,
  })}
`;
  return { bytes };
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
  identityBaseUrl?: string;
  world: string;
  zoenPath: string;
}): Promise<{
  actors: WorldReleaseActors;
  budgetClassIds: string[];
  digest: string;
  policyCatalogDigest: string;
  previewDigest: string;
}> {
  const budgets = input.budgets ?? defaultBudgetClasses;
  await mkdir(input.generatedDirectory, { recursive: true });
  const actors = await provisionWorldReleaseActors({
    baseUrl: input.identityBaseUrl ?? e2eHttpUrl("ZOEN_E2E_ZOEND_PORT", 58_171),
    subjectKey: `budget-release-${input.world}`,
    world: input.world,
  });
  const policy = buildPolicyCatalog(budgets, input.authorizationPolicies);
  const bytes = {
    ontology: `${JSON.stringify({
      label: `${input.world}.budget`,
      publicVerbs: [
        "Discover",
        "Query",
        "Propose",
        "Decide",
        "Commit",
        "Explain",
        "Execute",
      ],
      schema: "zoen.ontology-catalog.v1",
    })}\n`,
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
    actors.builder.principal,
    "--membership",
    actors.builder.membership,
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
    actors.owner.principal,
    "--membership",
    actors.owner.membership,
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
    actors.owner.principal,
    "--membership",
    actors.owner.membership,
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
    actors.owner.principal,
    "--membership",
    actors.owner.membership,
  ]);
  assert.equal(activated.status, 0, activated.stderr || activated.stdout);

  return {
    actors,
    budgetClassIds: budgets.map((entry) => entry.id),
    digest,
    policyCatalogDigest: sha256Hex(bytes.policy),
    previewDigest,
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
