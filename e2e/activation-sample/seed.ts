import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import {
  CommitStatus,
  PolicyDecision,
  ProposalStatus,
} from "../../packages/sdk/src/gen/zoen/action/v1/action_pb.js";
import {
  QueryConsistencySchema,
  QuerySelectionSchema,
  StrongConsistencySchema,
} from "../../packages/sdk/src/gen/zoen/world/v1/world_pb.js";
import { Client as PostgresClient } from "pg";
import {
  afterCorrectionAt,
  createCommitment,
  lifecycleAt,
  orderLineId,
  organizationId,
  productId,
  purchaseLineId,
  stockPositionId,
  supplierPartyId,
} from "../v1-company/actions.js";
import {
  actionClient,
  activateDefinition,
  compilePackage,
  definitionClient,
  oidcToken,
  proposalRequest,
  publishDefinition,
  recordEvidence,
  tenantA,
  worldClient,
  writePolicyManifest,
  type ActionClient,
  type DomainFixture,
  type SemanticValue,
} from "../domain-inventory-procurement/support.js";
import { e2ePostgresUrl } from "../host-env.js";
import { loadSampleRef, writeSampleRef } from "./stack.js";
import type {
  SampleCompanyRef,
  SeedMode,
  SeedResult,
  StackHandle,
} from "./types.js";

const scenarioDirectory = path.join(process.cwd(), "e2e", "activation-sample");

const SAMPLE_COMMITMENT_SUFFIX = "sample-commitment";
const SAMPLE_COMMITMENT_OPERATION = `operation.commercial.${SAMPLE_COMMITMENT_SUFFIX}`;
const VALID_AT = afterCorrectionAt.toISOString();
const YEAR_START = new Date("2026-01-01T00:00:00.000Z");
const YEAR_END = new Date("2027-01-01T00:00:00.000Z");

export async function preparePolicyManifest(
  handle: StackHandle,
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
  const [
    activationPolicy,
    domainPolicy,
    inventoryPolicy,
    procurementPolicy,
    purchasePolicy,
  ] = await Promise.all([
    loadLocalPolicy("activation.cedar"),
    loadLocalPolicy("domain.cedar"),
    loadLocalPolicy("inventory.cedar"),
    loadLocalPolicy("procurement.cedar"),
    loadLocalPolicy("purchase.cedar"),
  ]);
  await writePolicyManifest(handle.policyManifestPath, fixtures, {
    activation: activationPolicy,
    domain: domainPolicy,
    inventory: inventoryPolicy,
    procurement: procurementPolicy,
    purchase: purchasePolicy,
  });
  return fixtures;
}

async function loadLocalPolicy(sourceName: string) {
  const source = await readFile(
    path.join(scenarioDirectory, sourceName),
    "utf8",
  );
  return {
    digest: createHash("sha256").update(source).digest("hex"),
    source,
  };
}

export async function seedSampleCompany(
  stack: StackHandle,
  opts: { readonly mode: SeedMode },
): Promise<SeedResult> {
  if (opts.mode === "reset") {
    await resetTenantAuthority(tenantA);
  } else {
    const existing = await loadSampleRef(stack);
    if (existing !== undefined && (await commitmentAlreadySeeded(existing))) {
      return { outcome: "already-seeded", sample: existing };
    }
  }

  const fixtures = await preparePolicyManifest(stack);
  const byName = Object.fromEntries(
    fixtures.map((fixture) => [fixture.packageName, fixture]),
  );
  const party = requireFixture(byName, "party");
  const product = requireFixture(byName, "product");
  const commercial = requireFixture(byName, "commercial");
  const inventory = requireFixture(byName, "inventory");

  const [adminToken, commercialToken, inventoryToken] = await Promise.all([
    oidcToken("domain-admin-a"),
    oidcToken("commercial-agent-a"),
    oidcToken("inventory-agent-a"),
  ]);
  const definitions = definitionClient(adminToken);
  const commercialAction = actionClient(commercialToken);
  const inventoryAction = actionClient(inventoryToken);
  const world = worldClient(inventoryToken);

  for (const fixture of fixtures) {
    await publishDefinition(definitions, tenantA, fixture);
    await activateDefinition(definitions, tenantA, fixture);
  }

  await recordSharedPartyAndProduct(world, party, product);
  await recordInventoryIdentity(world, inventory);

  if (!(await operationCommitted(commercialAction, SAMPLE_COMMITMENT_OPERATION))) {
    await commitReadyAction(
      commercialAction,
      createCommitment(
        commercial as Parameters<typeof createCommitment>[0],
        SAMPLE_COMMITMENT_SUFFIX,
        "10",
      ),
    );
  }

  await Promise.all(
    [
      {
        claimId: "claim.inventory.sample.wms",
        sourceId: "source.wms",
        value: "10",
      },
      {
        claimId: "claim.inventory.sample.erp",
        sourceId: "source.erp",
        value: "8",
      },
      {
        claimId: "claim.inventory.sample.manual",
        sourceId: "source.manual-count",
        value: "6",
      },
    ].map((claim) =>
      recordEvidence(world, {
        claimId: claim.claimId,
        entityId: stockPositionId,
        fixture: inventory,
        relationId: "inventory.physicalQuantityClaim",
        sourceId: claim.sourceId,
        tenantId: tenantA,
        time: { end: YEAR_END, kind: "interval", start: YEAR_START },
        value: { amount: claim.value, kind: "quantity", unit: "each" },
      }).catch(() => undefined),
    ),
  );

  const acceptPhysical = proposalRequest({
    actionId: "inventory.acceptPhysicalQuantity",
    fixture: inventory,
    inputs: [
      {
        id: "quantity",
        value: { amount: "6", kind: "quantity", unit: "each" },
      },
      {
        id: "sourceReference",
        value: {
          kind: "text",
          value: "reconciliation.sample.erp-wms-manual",
        },
      },
    ],
    resourceId: stockPositionId,
    suffix: "accept-sample-physical",
    validAt: afterCorrectionAt,
  });
  if (!(await operationCommitted(inventoryAction, acceptPhysical.operationId))) {
    await commitReadyAction(inventoryAction, acceptPhysical);
  }

  const commercialFeed = proposalRequest({
    actionId: "inventory.recordCommercialCommitment",
    fixture: inventory,
    inputs: [
      {
        id: "commitmentReference",
        value: { kind: "text", value: "commitment.order-1001" },
      },
      {
        id: "quantity",
        value: { amount: "10", kind: "quantity", unit: "each" },
      },
    ],
    resourceId: stockPositionId,
    suffix: "commercial-feed-sample",
    validAt: afterCorrectionAt,
  });
  if (!(await operationCommitted(inventoryAction, commercialFeed.operationId))) {
    await commitReadyAction(inventoryAction, commercialFeed);
  }

  const rivals = await world.semanticQuery({
    consistency: create(QueryConsistencySchema, {
      value: { case: "strong", value: create(StrongConsistencySchema) },
    }),
    definition: inventory.definition,
    entityId: stockPositionId,
    selection: create(QuerySelectionSchema, {
      value: {
        case: "relationId",
        value: "inventory.physicalQuantityClaim",
      },
    }),
    tenantId: tenantA,
    validAt: timestampFromDate(afterCorrectionAt),
  });
  assert.ok(
    rivals.values.length >= 3,
    "sample seed must retain rival physical quantity claims",
  );

  const sample: SampleCompanyRef = {
    tenantId: tenantA,
    organizationId,
    orderLineId,
    stockPositionId,
    purchaseLineId,
    definitionId: inventory.definition.definitionId,
    definitionDigest: inventory.digest,
    activatedRevision: inventory.definition.revision.toString(),
    commitmentOperationId: SAMPLE_COMMITMENT_OPERATION,
    webBindings: {
      definitionId: inventory.definition.definitionId,
      resourceId: stockPositionId,
      validAt: VALID_AT,
      oidcClientId: "zoen-web",
      oidcIssuer: stack.endpoints.oidcIssuer,
    },
  };
  await writeSampleRef(stack, sample);
  return {
    outcome: opts.mode === "reset" ? "reset-and-seeded" : "seeded",
    sample,
  };
}

export async function resetSample(stack: StackHandle): Promise<SeedResult> {
  return seedSampleCompany(stack, { mode: "reset" });
}

async function commitmentAlreadySeeded(
  sample: SampleCompanyRef,
): Promise<boolean> {
  try {
    const token = await oidcToken("commercial-agent-a");
    return operationCommitted(actionClient(token), sample.commitmentOperationId);
  } catch {
    return false;
  }
}

async function operationCommitted(
  client: ActionClient,
  operationId: string,
): Promise<boolean> {
  try {
    const status = await client.getOperationStatus({ operationId });
    return status.status === CommitStatus.COMMITTED;
  } catch {
    return false;
  }
}

async function resetTenantAuthority(tenantId: string): Promise<void> {
  const client = new PostgresClient({
    connectionString: e2ePostgresUrl("postgres", "postgres", 55_457),
  });
  await client.connect();
  try {
    const tables = [
      "effect_reconciliations",
      "effect_evidence",
      "effect_requests",
      "action_approvals",
      "action_proposals",
      "action_operations",
      "projection_outbox",
      "semantic_claims",
      "authority_commits",
      "definition_activations",
      "definition_revisions",
    ];
    for (const table of tables) {
      await client.query(`DELETE FROM ${table} WHERE tenant_id = $1`, [
        tenantId,
      ]).catch(() => undefined);
    }
  } finally {
    await client.end();
  }
}

async function commitReadyAction(
  client: ActionClient,
  request: ReturnType<typeof proposalRequest>,
) {
  const proposed = await client.propose(request);
  assert.equal(proposed.decision, PolicyDecision.PERMIT);
  assert.equal(proposed.proposal?.status, ProposalStatus.READY);
  assert.ok(proposed.proposal);
  const committed = await client.commit({
    operationId: request.operationId,
    proposalId: request.proposalId,
  });
  assert.equal(committed.status, CommitStatus.COMMITTED);
  assert.ok(committed.receipt);
  return committed.receipt;
}

function requireFixture(
  fixtures: Record<string, DomainFixture>,
  packageName: DomainFixture["packageName"],
): DomainFixture {
  const fixture = fixtures[packageName];
  if (fixture === undefined) {
    throw new Error(`missing ${packageName} fixture`);
  }
  return fixture;
}

async function recordSharedPartyAndProduct(
  client: ReturnType<typeof worldClient>,
  party: DomainFixture,
  product: DomainFixture,
): Promise<void> {
  await Promise.all([
    recordEvidence(client, {
      claimId: "claim.party.sample.supplier-external-id",
      entityId: supplierPartyId,
      fixture: party,
      relationId: "party.externalIdentifier",
      sourceId: "source.party-master",
      tenantId: tenantA,
      time: { at: lifecycleAt, kind: "instant" },
      value: { kind: "text", value: "supplier:ACME" },
    }),
    recordEvidence(client, {
      claimId: "claim.party.sample.supplier-role",
      entityId: supplierPartyId,
      fixture: party,
      relationId: "party.role",
      sourceId: "source.party-governance",
      tenantId: tenantA,
      time: { at: lifecycleAt, kind: "instant" },
      value: { kind: "text", value: "supplier" },
    }),
    recordEvidence(client, {
      claimId: "claim.product.sample.external-id",
      entityId: productId,
      fixture: product,
      relationId: "product.externalIdentifier",
      sourceId: "source.product-catalog",
      tenantId: tenantA,
      time: { at: lifecycleAt, kind: "instant" },
      value: { kind: "text", value: "sku:WIDGET-PRO" },
    }),
  ]);
}

async function recordInventoryIdentity(
  client: ReturnType<typeof worldClient>,
  fixture: DomainFixture,
): Promise<void> {
  const records: readonly {
    readonly claimId: string;
    readonly relationId: string;
    readonly value: SemanticValue;
  }[] = [
    {
      claimId: "claim.inventory.sample.product-reference",
      relationId: "inventory.productReference",
      value: { kind: "text", value: productId },
    },
    {
      claimId: "claim.inventory.sample.owner-reference",
      relationId: "inventory.ownershipPartyReference",
      value: { kind: "text", value: "party.organization.tenant-owner" },
    },
    {
      claimId: "claim.inventory.sample.custodian-reference",
      relationId: "inventory.custodyPartyReference",
      value: { kind: "text", value: "party.organization.warehouse-operator" },
    },
    {
      claimId: "claim.inventory.sample.location",
      relationId: "inventory.location",
      value: { kind: "entity-ref", value: "inventory.location.wh-1" },
    },
  ];
  for (const record of records) {
    await recordEvidence(client, {
      ...record,
      entityId: stockPositionId,
      fixture,
      sourceId: "source.inventory-master",
      tenantId: tenantA,
      time: { at: afterCorrectionAt, kind: "instant" },
    }).catch(() => undefined);
  }
}


