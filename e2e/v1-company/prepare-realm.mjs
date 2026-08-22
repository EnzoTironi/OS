import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const outputDirectory =
  process.env.ZOEN_E2E_GENERATED_DIR ?? path.join("e2e", "v1-company", ".generated");
const webPort = process.env.ZOEN_E2E_WEB_PORT ?? "31580";
const farFuture = 4_102_444_800;
const definitionIds = [
  "accounting.foundation",
  "commercial.sales",
  "fiscal.brazil",
  "inventory.companyBrain",
  "inventory.definition",
  "inventory.migration",
  "inventory.operations",
  "manufacturing.production",
  "party.core",
  "procurement.purchasing",
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
const procurementActions = [
  "procurement.cancelRemaining",
  "procurement.correctReceipt",
  "procurement.governPurchase",
  "procurement.recordPartialReceipt",
  "procurement.recordRequirement",
  "procurement.recordReturn",
  "procurement.requestSupplier",
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
const fiscalActions = [
  "fiscal.admitDocumentAuthorization",
  "fiscal.admitIntentTaxDetermination",
  "fiscal.admitTaxDetermination",
  "fiscal.cancelDocument",
  "fiscal.correctDocument",
  "fiscal.requestTaxDetermination",
  "fiscal.submitDocument",
];
const evolutionActions = ["inventory.replenish"];
const commercialResources = [
  "commercial.order-line.1001",
  "party.organization.northstar",
  "party.person.ana",
  "product.item.widget-pro",
];
const inventoryResources = ["inventory.position.widget-pro.wh-1"];
const procurementResources = ["procurement.purchase-line.2001"];
const manufacturingResources = [
  "manufacturing.bom.widget",
  "manufacturing.work.3001",
];
const accountingResources = [
  "accounting.book.commercial",
  "accounting.claim.receivable.3001",
  "accounting.ledger.sales",
];
const fiscalResources = [
  "fiscal.document.3001",
  "fiscal.intent.3001",
  "fiscal.tax.3001",
];
const evolutionResources = ["inventory.item.1", "inventory.item.migration"];
const serviceAccounts = [];

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

function userAttributeClaim(name) {
  return {
    config: {
      "access.token.claim": "true",
      "claim.name": name,
      "id.token.claim": "false",
      "introspection.token.claim": "true",
      "jsonType.label": "String",
      "user.attribute": name,
      "userinfo.token.claim": "false",
    },
    consentRequired: false,
    name,
    protocol: "openid-connect",
    protocolMapper: "oidc-usermodel-attribute-mapper",
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
  serviceAccounts.push({
    attributes: {
      zoen_delegation: [delegation(workloadId, actionIds, resourceIds)],
    },
    enabled: true,
    serviceAccountClientId: clientId,
    username: `service-account-${clientId}`,
  });
  return {
    attributes: { "access.token.lifespan": "300" },
    clientAuthenticatorType: "client-secret",
    clientId,
    directAccessGrantsEnabled: false,
    enabled: true,
    protocol: "openid-connect",
    protocolMappers: [
      hardcodedClaim("tenant_id", tenantId),
      hardcodedClaim("actor_id", actorId),
      hardcodedClaim("principal_id", principalId),
      hardcodedClaim("workload_id", workloadId),
      userAttributeClaim("zoen_delegation"),
      audienceMapper(),
    ],
    publicClient: false,
    secret: `${clientId}-secret`,
    serviceAccountsEnabled: true,
    standardFlowEnabled: false,
  };
}

function tenantClients(suffix) {
  const tenantId = `tenant.${suffix}`;
  return [
    confidentialClient({
      actionIds: ["zoen.definition.activate"],
      actorId: `actor.domain-admin.${suffix}`,
      clientId: `domain-admin-${suffix}`,
      principalId: `principal.domain-admin.${suffix}`,
      resourceIds: definitionIds,
      tenantId,
      workloadId: `workload.domain-admin.${suffix}`,
    }),
    confidentialClient({
      actionIds: commercialActions,
      actorId: `actor.commercial-agent.${suffix}`,
      clientId: `commercial-agent-${suffix}`,
      principalId: `principal.commercial-agent.${suffix}`,
      resourceIds: commercialResources,
      tenantId,
      workloadId: `workload.commercial-agent.${suffix}`,
    }),
    confidentialClient({
      actionIds: inventoryActions,
      actorId: `actor.inventory-agent.${suffix}`,
      clientId: `inventory-agent-${suffix}`,
      principalId: `principal.inventory-agent.${suffix}`,
      resourceIds: inventoryResources,
      tenantId,
      workloadId: `workload.inventory-agent.${suffix}`,
    }),
    confidentialClient({
      actionIds: procurementActions,
      actorId: `actor.procurement-agent.${suffix}`,
      clientId: `procurement-agent-${suffix}`,
      principalId: `principal.procurement-agent.${suffix}`,
      resourceIds: procurementResources,
      tenantId,
      workloadId: `workload.procurement-agent.${suffix}`,
    }),
    confidentialClient({
      actionIds: ["procurement.governPurchase"],
      actorId: `actor.procurement-supervisor.${suffix}`,
      clientId: `procurement-supervisor-${suffix}`,
      principalId: `principal.procurement-supervisor.${suffix}`,
      resourceIds: procurementResources,
      tenantId,
      workloadId: `workload.procurement-supervisor.${suffix}`,
    }),
    confidentialClient({
      actionIds: manufacturingActions,
      actorId: `actor.manufacturing-agent.${suffix}`,
      clientId: `manufacturing-agent-${suffix}`,
      principalId: `principal.manufacturing-agent.${suffix}`,
      resourceIds: manufacturingResources,
      tenantId,
      workloadId: `workload.manufacturing-agent.${suffix}`,
    }),
    confidentialClient({
      actionIds: accountingActions,
      actorId: `actor.accounting-agent.${suffix}`,
      clientId: `accounting-agent-${suffix}`,
      principalId: `principal.accounting-agent.${suffix}`,
      resourceIds: accountingResources,
      tenantId,
      workloadId: `workload.accounting-agent.${suffix}`,
    }),
    confidentialClient({
      actionIds: ["accounting.applySettlement"],
      actorId: `actor.accounting-supervisor.${suffix}`,
      clientId: `accounting-supervisor-${suffix}`,
      principalId: `principal.accounting-supervisor.${suffix}`,
      resourceIds: accountingResources,
      tenantId,
      workloadId: `workload.accounting-supervisor.${suffix}`,
    }),
    confidentialClient({
      actionIds: fiscalActions,
      actorId: `actor.fiscal-agent.${suffix}`,
      clientId: `fiscal-agent-${suffix}`,
      principalId: `principal.fiscal-agent.${suffix}`,
      resourceIds: fiscalResources,
      tenantId,
      workloadId: `workload.fiscal-agent.${suffix}`,
    }),
    confidentialClient({
      actionIds: evolutionActions,
      actorId: `actor.evolution-agent.${suffix}`,
      clientId: `evolution-agent-${suffix}`,
      principalId: `principal.evolution-agent.${suffix}`,
      resourceIds: evolutionResources,
      tenantId,
      workloadId: `workload.evolution-agent.${suffix}`,
    }),
    confidentialClient({
      actionIds: ["zoen.effect.execute"],
      actorId: `actor.effect-worker.${suffix}`,
      clientId: `effect-worker-${suffix}`,
      principalId: `principal.effect-worker.${suffix}`,
      resourceIds: ["zoen.effect.request"],
      tenantId,
      workloadId: "workload.effect-worker",
    }),
    confidentialClient({
      actionIds: ["zoen.effect.reconcile"],
      actorId: `actor.effect-reconciler.${suffix}`,
      clientId: `effect-reconciler-${suffix}`,
      principalId: `principal.effect-reconciler.${suffix}`,
      resourceIds: ["zoen.effect.request"],
      tenantId,
      workloadId: "workload.effect-reconciler",
    }),
    confidentialClient({
      actionIds: ["inventory.requestStock"],
      actorId: `actor.harness.${suffix}`,
      clientId: `harness-${suffix}`,
      principalId: `principal.harness.${suffix}`,
      resourceIds: ["inventory.item.1"],
      tenantId,
      workloadId: `workload.harness.${suffix}`,
    }),
  ];
}

function webUser(tenant, username, principalId, actorId, actionIds, resourceIds) {
  const workloadId = `workload.web.${username}`;
  return {
    attributes: {
      actor_id: [actorId],
      organization_id: [`org.${tenant}`],
      principal_id: [principalId],
      tenant_id: [tenant],
      workload_id: [workloadId],
      zoen_delegation: [delegation(workloadId, actionIds, resourceIds)],
    },
    credentials: [
      {
        temporary: false,
        type: "password",
        value: "web-password",
      },
    ],
    email: `${username}@example.test`,
    emailVerified: true,
    enabled: true,
    firstName: username,
    groups: [`/org-${tenant}`],
    lastName: "Operator",
    realmRoles: ["tenant-operator"],
    username,
  };
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
    confidentialClient({
      actionIds: ["commercial.createCommitment"],
      actorId: "actor.human.a",
      clientId: "human-a",
      principalId: "principal.human.a",
      resourceIds: commercialResources,
      tenantId: "tenant.a",
      workloadId: "workload.human.a",
    }),
    confidentialClient({
      actionIds: ["commercial.createCommitment"],
      actorId: "actor.denied.a",
      clientId: "denied-a",
      principalId: "principal.denied.a",
      resourceIds: commercialResources,
      tenantId: "tenant.a",
      workloadId: "workload.denied.a",
    }),
    {
      clientAuthenticatorType: "client-secret",
      clientId: "platform-observer",
      directAccessGrantsEnabled: false,
      enabled: true,
      protocol: "openid-connect",
      protocolMappers: [hardcodedClaim("platform_role", "cross-tenant-observer")],
      publicClient: false,
      secret: "platform-observer-secret",
      serviceAccountsEnabled: true,
      standardFlowEnabled: false,
    },
    {
      attributes: {
        "pkce.code.challenge.method": "S256",
      },
      clientId: "zoen-web",
      directAccessGrantsEnabled: true,
      enabled: true,
      protocol: "openid-connect",
      protocolMappers: [
        userAttributeClaim("tenant_id"),
        userAttributeClaim("organization_id"),
        userAttributeClaim("actor_id"),
        userAttributeClaim("principal_id"),
        userAttributeClaim("workload_id"),
        userAttributeClaim("zoen_delegation"),
        audienceMapper(),
      ],
      publicClient: true,
      redirectUris: [`http://127.0.0.1:${webPort}/*`],
      serviceAccountsEnabled: false,
      standardFlowEnabled: true,
      webOrigins: [`http://127.0.0.1:${webPort}`],
    },
  ],
  enabled: true,
  groups: [{ name: "org-tenant.a" }, { name: "org-tenant.b" }],
  realm: "zoen",
  registrationAllowed: false,
  resetPasswordAllowed: false,
  roles: {
    realm: [{ name: "tenant-operator" }, { name: "platform-observer" }],
  },
  sslRequired: "none",
  users: [
    ...serviceAccounts,
    webUser(
      "tenant.a",
      "web-tenant.a",
      "principal.human.a",
      "actor.human.a",
      ["commercial.createCommitment"],
      commercialResources,
    ),
    webUser(
      "tenant.a",
      "web-denied.a",
      "principal.denied.a",
      "actor.denied.a",
      ["commercial.createCommitment"],
      commercialResources,
    ),
    webUser(
      "tenant.b",
      "web-tenant.b",
      "principal.commercial-agent.b",
      "actor.commercial-agent.b",
      commercialActions,
      commercialResources,
    ),
  ],
};

await mkdir(outputDirectory, { recursive: true });
await writeFile(
  path.join(outputDirectory, "realm.json"),
  `${JSON.stringify(realm, null, 2)}\n`,
);
