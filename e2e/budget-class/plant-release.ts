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
  priority: number;
  resourceId: string;
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
    priority: 100,
    resourceId: "zoen.compute.budget.standard",
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
    priority: 10,
    resourceId: "zoen.compute.budget.tight",
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

const kernelAuthorityDigest =
  "3dfddf9c946656d9ce19ccaacecba5db3d284417c1c3f1f9d0ee710163e42dfc";

function computePolicy(
  world: string,
  budgets: BudgetClassSpec[],
): AuthorizationPolicy {
  const actionId = "zoen.world.execute";
  const resources = [...new Set(budgets.map((budget) => budget.resourceId))].sort(
    (left, right) => left.localeCompare(right),
  );
  assert.ok(resources.length > 0, "compute policy requires at least one BudgetClass resource");
  const resourcePredicate = resources
    .map((resource) => `resource == Zoen::Resource::${JSON.stringify(resource)}`)
    .join(" ||\n        ");
  const source = `permit (
    principal,
    action == Action::"execute",
    resource
)
when {
    context.actionId == "${actionId}" &&
    context.approved == true &&
    context.tenantId == ${JSON.stringify(world)} &&
    principal in Zoen::Tenant::${JSON.stringify(world)} &&
    (${resourcePredicate})
};
`;
  return {
    actionId,
    definitionDigest: kernelAuthorityDigest,
    digest: sha256Hex(source),
    policyId: `policy.world.compute.${world}.r1`,
    revision: 1,
    source,
  };
}

function buildPolicyCatalog(
  budgets: BudgetClassSpec[],
  world: string,
  authorizationPolicies?: AuthorizationPolicy[],
): {
  bytes: string;
} {
  const supplied =
    authorizationPolicies !== undefined && authorizationPolicies.length > 0
      ? authorizationPolicies
      : [defaultDiscoverPolicy()];
  const policies = supplied.filter(
    (policy) =>
      policy.actionId !== "zoen.world.execute" ||
      policy.definitionDigest !== kernelAuthorityDigest,
  );
  policies.push(computePolicy(world, budgets));
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

async function prepareBudgetCandidate(input: {
  authorizationPolicies?: AuthorizationPolicy[];
  budgets: BudgetClassSpec[];
  generatedDirectory: string;
  suffix?: string;
  world: string;
}): Promise<{
  file: string;
  policyCatalogDigest: string;
}> {
  await mkdir(input.generatedDirectory, { recursive: true });
  const policy = buildPolicyCatalog(
    input.budgets,
    input.world,
    input.authorizationPolicies,
  );
  const content = {
    world: input.world,
    parent: null,
    ontology: {
      bytes: `${JSON.stringify({
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
    },
    policy: { bytes: policy.bytes },
    executors: {
      bytes: `executor catalog for ${input.world} budget\n`,
    },
    components: {
      bytes: `component catalog for ${input.world} budget\n`,
    },
  };
  const suffix = input.suffix === undefined ? "" : `-${input.suffix}`;
  const file = path.join(
    input.generatedDirectory,
    `release-${input.world}${suffix}.json`,
  );
  await writeFile(file, `${JSON.stringify(content)}\n`);
  return {
    file,
    policyCatalogDigest: sha256Hex(policy.bytes),
  };
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
  const candidate = await prepareBudgetCandidate({
    authorizationPolicies: input.authorizationPolicies,
    budgets,
    generatedDirectory: input.generatedDirectory,
    world: input.world,
  });
  const actors = await provisionWorldReleaseActors({
    baseUrl: input.identityBaseUrl ?? e2eHttpUrl("ZOEN_E2E_ZOEND_PORT", 58_171),
    subjectKey: `budget-release-${input.world}-${candidate.policyCatalogDigest.slice(0, 12)}`,
    world: input.world,
  });
  const file = candidate.file;

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
    policyCatalogDigest: candidate.policyCatalogDigest,
    previewDigest,
  };
}

export async function expectBudgetPublicationRejected(input: {
  authorizationPolicies?: AuthorizationPolicy[];
  budgets: BudgetClassSpec[];
  databaseUrl: string;
  expected: RegExp;
  generatedDirectory: string;
  identityBaseUrl?: string;
  name: string;
  world: string;
  zoenPath: string;
}): Promise<void> {
  const candidate = await prepareBudgetCandidate({
    authorizationPolicies: input.authorizationPolicies,
    budgets: input.budgets,
    generatedDirectory: input.generatedDirectory,
    suffix: input.name,
    world: input.world,
  });
  const actors = await provisionWorldReleaseActors({
    baseUrl: input.identityBaseUrl ?? e2eHttpUrl("ZOEN_E2E_ZOEND_PORT", 58_171),
    subjectKey: `budget-rejection-${input.world}-${input.name}`,
    world: input.world,
  });
  const published = runZoenCli(input.zoenPath, input.databaseUrl, [
    "world",
    "release",
    "publish",
    "--file",
    candidate.file,
    "--principal",
    actors.builder.principal,
    "--membership",
    actors.builder.membership,
  ]);
  assert.notEqual(published.status, 0, published.stdout);
  assert.match(`${published.stderr}\n${published.stdout}`, input.expected);
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
