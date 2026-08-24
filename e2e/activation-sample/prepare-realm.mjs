import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const outputDirectory =
  process.env.ZOEN_E2E_GENERATED_DIR ??
  path.join("e2e", "activation-sample", ".generated");
const webOrigin = `http://127.0.0.1:${process.env.ZOEN_E2E_WEB_PORT ?? "58359"}`;
const farFuture = 4_102_444_800;
const definitionIds = [
  "commercial.sales",
  "inventory.operations",
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
const domainResources = [
  "commercial.order-line.1001",
  "inventory.position.widget-pro.wh-1",
  "party.organization.supplier",
  "procurement.purchase-line.2001",
  "product.item.widget-pro",
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
      actionIds: procurementActions,
      actorId: `actor.procurement-agent.${tenantSuffix}`,
      clientId: `procurement-agent-${tenantSuffix}`,
      principalId: `principal.procurement-agent.${tenantSuffix}`,
      resourceIds: domainResources,
      tenantId,
      workloadId: `workload.procurement-agent.${tenantSuffix}`,
    }),
    confidentialClient({
      actionIds: ["procurement.governPurchase"],
      actorId: `actor.procurement-supervisor.${tenantSuffix}`,
      clientId: `procurement-supervisor-${tenantSuffix}`,
      principalId: `principal.procurement-supervisor.${tenantSuffix}`,
      resourceIds: domainResources,
      tenantId,
      workloadId: `workload.procurement-supervisor.${tenantSuffix}`,
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

const workloadId = "workload.web.a";
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
    {
      attributes: {
        "pkce.code.challenge.method": "S256",
      },
      clientId: "zoen-web",
      directAccessGrantsEnabled: true,
      enabled: true,
      protocol: "openid-connect",
      protocolMappers: [
        hardcodedClaim("tenant_id", "tenant.a"),
        hardcodedClaim("actor_id", "actor.web.a"),
        hardcodedClaim("principal_id", "principal.web.a"),
        hardcodedClaim("workload_id", workloadId),
        hardcodedClaim(
          "zoen_delegation",
          delegation(
            workloadId,
            [...inventoryActions, "procurement.governPurchase"],
            domainResources,
          ),
        ),
        audienceMapper(),
      ],
      publicClient: true,
      redirectUris: [`${webOrigin}/*`],
      serviceAccountsEnabled: false,
      standardFlowEnabled: true,
      webOrigins: [webOrigin],
    },
  ],
  enabled: true,
  realm: "zoen",
  registrationAllowed: false,
  resetPasswordAllowed: false,
  sslRequired: "none",
  users: [
    {
      credentials: [
        {
          temporary: false,
          type: "password",
          value: "web-password",
        },
      ],
      email: "web-user@example.test",
      emailVerified: true,
      enabled: true,
      firstName: "Web",
      lastName: "User",
      requiredActions: [],
      username: "web-user",
    },
  ],
};

await mkdir(outputDirectory, { recursive: true });
await writeFile(
  path.join(outputDirectory, "realm.json"),
  `${JSON.stringify(realm, null, 2)}\n`,
);
