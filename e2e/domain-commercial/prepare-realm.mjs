import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const outputDirectory =
  process.env.ZOEN_E2E_GENERATED_DIR ??
  path.join("e2e", "domain-commercial", ".generated");
const farFuture = 4_102_444_800;
const definitionIds = ["party.core", "product.catalog", "commercial.sales"];
const commercialActions = [
  "commercial.cancelCommitment",
  "commercial.changeCommitment",
  "commercial.correctCommitment",
  "commercial.createCommitment",
  "commercial.recordFulfillment",
];
const identityActions = ["party.admitIdentity", "product.admitItem"];

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
  return {
    attributes: {},
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
      hardcodedClaim(
        "zoen_delegation",
        delegation(workloadId, actionIds, resourceIds),
      ),
      audienceMapper(),
    ],
    publicClient: false,
    secret: `${clientId}-secret`,
    serviceAccountsEnabled: true,
    standardFlowEnabled: false,
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
    confidentialClient({
      actionIds: ["zoen.definition.activate"],
      actorId: "actor.domain-admin.a",
      clientId: "domain-admin-a",
      principalId: "principal.domain-admin.a",
      resourceIds: definitionIds,
      tenantId: "tenant.a",
      workloadId: "workload.domain-admin.a",
    }),
    confidentialClient({
      actionIds: [...commercialActions, ...identityActions],
      actorId: "actor.commercial-agent.a",
      clientId: "commercial-agent-a",
      principalId: "principal.commercial-agent.a",
      resourceIds: [
        "commercial.order-line.1001",
        "commercial.order-line.1002",
        "party.organization.northstar",
        "party.person.ana",
        "product.item.widget-pro",
      ],
      tenantId: "tenant.a",
      workloadId: "workload.commercial-agent.a",
    }),
    confidentialClient({
      actionIds: ["zoen.definition.activate"],
      actorId: "actor.domain-admin.b",
      clientId: "domain-admin-b",
      principalId: "principal.domain-admin.b",
      resourceIds: definitionIds,
      tenantId: "tenant.b",
      workloadId: "workload.domain-admin.b",
    }),
    confidentialClient({
      actionIds: commercialActions,
      actorId: "actor.commercial-agent.b",
      clientId: "commercial-agent-b",
      principalId: "principal.commercial-agent.b",
      resourceIds: ["commercial.order-line.partner-1"],
      tenantId: "tenant.b",
      workloadId: "workload.commercial-agent.b",
    }),
    confidentialClient({
      actionIds: ["zoen.effect.execute"],
      actorId: "actor.effect-worker.a",
      clientId: "effect-worker-a",
      principalId: "principal.effect-worker.a",
      resourceIds: ["zoen.effect.request"],
      tenantId: "tenant.a",
      workloadId: "workload.effect-worker",
    }),
    confidentialClient({
      actionIds: ["zoen.effect.execute"],
      actorId: "actor.effect-worker.b",
      clientId: "effect-worker-b",
      principalId: "principal.effect-worker.b",
      resourceIds: ["zoen.effect.request"],
      tenantId: "tenant.b",
      workloadId: "workload.effect-worker",
    }),
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
