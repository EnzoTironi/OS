import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const outputDirectory =
  process.env.ZOEN_E2E_GENERATED_DIR ??
  path.join("e2e", "domain-manufacturing-accounting", ".generated");
const farFuture = 4_102_444_800;
const definitionIds = [
  "accounting.foundation",
  "commercial.sales",
  "inventory.operations",
  "manufacturing.production",
  "party.core",
  "product.catalog",
];
const commercialActions = [
  "commercial.cancelCommitment",
  "commercial.changeCommitment",
  "commercial.correctCommitment",
  "commercial.createCommitment",
  "commercial.recordFulfillment",
  "party.admitIdentity",
  "party.assignRole",
  "product.admitItem",
  "product.correctLifecycle",
];
const inventoryActions = [
  "inventory.acceptPhysicalQuantity",
  "inventory.correctInventory",
  "inventory.recordCommercialCommitment",
  "inventory.recordMovement",
  "inventory.recordReceipt",
  "inventory.reserveInventory",
];
const manufacturingActions = [
  "manufacturing.correctCompletion",
  "manufacturing.planWork",
  "manufacturing.recordBillOfMaterial",
  "manufacturing.recordCompletion",
  "manufacturing.recordMaterialAvailability",
  "manufacturing.recordPartialCompletion",
  "manufacturing.recordRequirement",
  "manufacturing.recordRework",
  "manufacturing.recordScrap",
  "manufacturing.startWork",
];
const accountingActions = [
  "accounting.applySettlement",
  "accounting.correctPosting",
  "accounting.postPayable",
  "accounting.postReceivable",
  "accounting.recordAccountIdentity",
  "accounting.recordBookIdentity",
  "accounting.recordLedgerIdentity",
  "accounting.reversePosting",
];
const domainResources = [
  "accounting.account.receivable",
  "accounting.account.revenue",
  "accounting.book.primary",
  "accounting.claim.receivable.3001",
  "accounting.claim.rounding-proof.3001",
  "accounting.ledger.sales",
  "commercial.order-line.3001",
  "inventory.position.component.wh-1",
  "inventory.position.finished.wh-1",
  "manufacturing.bom.widget",
  "manufacturing.work.3001",
  "party.organization.customer",
  "product.item.component",
  "product.item.finished-widget",
];

function hardcodedClaim(name, value) {
  return {
    config: {
      "access.token.claim": "true",
      "claim.name": name,
      "claim.value": value,
      "id.token.claim": "false",
      "introspection.token.claim": "true",
      "jsonType.label": "String",
      "userinfo.token.claim": "false",
    },
    consentRequired: false,
    name,
    protocol: "openid-connect",
    protocolMapper: "oidc-hardcoded-claim-mapper",
  };
}

function audienceMapper() {
  return {
    config: {
      "access.token.claim": "true",
      "id.token.claim": "false",
      "included.client.audience": "zoend",
      "introspection.token.claim": "true",
    },
    consentRequired: false,
    name: "zoend-audience",
    protocol: "openid-connect",
    protocolMapper: "oidc-audience-mapper",
  };
}

function delegation(workloadId, actionIds, resourceIds) {
  return JSON.stringify([
    {
      actionIds,
      delegationId: `delegation.${workloadId}`,
      expiresAt: farFuture,
      notBefore: 0,
      resourceIds,
      workloadIds: [workloadId],
    },
  ]);
}

function confidentialClient({
  actionIds,
  actorId,
  clientId,
  principalId,
  resourceIds,
  tenantId,
  workloadId,
}) {
  const protocolMappers = [
    hardcodedClaim("tenant_id", tenantId),
    hardcodedClaim("actor_id", actorId),
    hardcodedClaim("principal_id", principalId),
    hardcodedClaim("workload_id", workloadId),
    audienceMapper(),
  ];
  if (actionIds !== undefined && resourceIds !== undefined) {
    protocolMappers.splice(
      4,
      0,
      hardcodedClaim(
        "zoen_delegation",
        delegation(workloadId, actionIds, resourceIds),
      ),
    );
  }
  return {
    attributes: {},
    clientAuthenticatorType: "client-secret",
    clientId,
    directAccessGrantsEnabled: false,
    enabled: true,
    protocol: "openid-connect",
    protocolMappers,
    publicClient: false,
    secret: `${clientId}-secret`,
    serviceAccountsEnabled: true,
    standardFlowEnabled: false,
  };
}

function tenantClients(tenantSuffix) {
  const tenantId = `tenant.${tenantSuffix}`;
  return [
    confidentialClient({
      actionIds: ["zoen.definition.activate"],
      actorId: `actor.domain-admin.${tenantSuffix}`,
      clientId: `domain-admin-${tenantSuffix}`,
      principalId: `principal.domain-admin.${tenantSuffix}`,
      resourceIds: definitionIds,
      tenantId,
      workloadId: `workload.domain-admin.${tenantSuffix}`,
    }),
    confidentialClient({
      actionIds: commercialActions,
      actorId: `actor.commercial-agent.${tenantSuffix}`,
      clientId: `commercial-agent-${tenantSuffix}`,
      principalId: `principal.commercial-agent.${tenantSuffix}`,
      resourceIds: domainResources,
      tenantId,
      workloadId: `workload.commercial-agent.${tenantSuffix}`,
    }),
    confidentialClient({
      actionIds: inventoryActions,
      actorId: `actor.inventory-agent.${tenantSuffix}`,
      clientId: `inventory-agent-${tenantSuffix}`,
      principalId: `principal.inventory-agent.${tenantSuffix}`,
      resourceIds: domainResources,
      tenantId,
      workloadId: `workload.inventory-agent.${tenantSuffix}`,
    }),
    confidentialClient({
      actionIds: manufacturingActions,
      actorId: `actor.manufacturing-agent.${tenantSuffix}`,
      clientId: `manufacturing-agent-${tenantSuffix}`,
      principalId: `principal.manufacturing-agent.${tenantSuffix}`,
      resourceIds: domainResources,
      tenantId,
      workloadId: `workload.manufacturing-agent.${tenantSuffix}`,
    }),
    confidentialClient({
      actionIds: accountingActions,
      actorId: `actor.accounting-agent.${tenantSuffix}`,
      clientId: `accounting-agent-${tenantSuffix}`,
      principalId: `principal.accounting-agent.${tenantSuffix}`,
      resourceIds: domainResources,
      tenantId,
      workloadId: `workload.accounting-agent.${tenantSuffix}`,
    }),
    confidentialClient({
      actionIds: ["accounting.applySettlement"],
      actorId: `actor.accounting-supervisor.${tenantSuffix}`,
      clientId: `accounting-supervisor-${tenantSuffix}`,
      principalId: `principal.accounting-supervisor.${tenantSuffix}`,
      resourceIds: domainResources,
      tenantId,
      workloadId: `workload.accounting-supervisor.${tenantSuffix}`,
    }),
    confidentialClient({
      actionIds: ["zoen.effect.execute"],
      actorId: `actor.effect-worker.${tenantSuffix}`,
      clientId: `effect-worker-${tenantSuffix}`,
      principalId: `principal.effect-worker.${tenantSuffix}`,
      resourceIds: ["zoen.effect.request"],
      tenantId,
      workloadId: "workload.effect-worker",
    }),
    confidentialClient({
      actionIds: ["zoen.effect.reconcile"],
      actorId: `actor.effect-reconciler.${tenantSuffix}`,
      clientId: `effect-reconciler-${tenantSuffix}`,
      principalId: `principal.effect-reconciler.${tenantSuffix}`,
      resourceIds: ["zoen.effect.request"],
      tenantId,
      workloadId: "workload.effect-reconciler",
    }),
  ];
}

const realm = {
  accessTokenLifespan: 300,
  clients: [
    {
      bearerOnly: true,
      clientId: "zoend",
      enabled: true,
      protocol: "openid-connect",
    },
    ...tenantClients("a"),
    ...tenantClients("b"),
  ],
  enabled: true,
  realm: "zoen",
  registrationAllowed: false,
  resetPasswordAllowed: false,
  sslRequired: "none",
};

await mkdir(outputDirectory, { recursive: true });
await writeFile(
  path.join(outputDirectory, "realm.json"),
  `${JSON.stringify(realm, null, 2)}\n`,
);
