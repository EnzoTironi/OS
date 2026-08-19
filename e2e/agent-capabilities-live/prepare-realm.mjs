import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const outputDirectory = path.join(
  "e2e",
  "agent-capabilities-live",
  ".generated",
);
const definitionId = "inventory.agentLive";
const requestStock = "inventory.requestStock";
const restrictedAction = "inventory.restrictedAction";
const taskExcludedAction = "inventory.taskExcludedAction";
const resourceId = "inventory.item.1";
const farFuture = 4_102_444_800;

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
  actorId,
  actionIds,
  clientId,
  principalId,
  resourceIds,
  tenantId,
  workloadId,
}) {
  return {
    attributes: { "access.token.lifespan": "3600" },
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
  accessTokenLifespan: 3600,
  clients: [
    {
      bearerOnly: true,
      clientId: "zoend",
      enabled: true,
      protocol: "openid-connect",
    },
    confidentialClient({
      actorId: "actor.agent.a",
      actionIds: [requestStock, taskExcludedAction],
      clientId: "agent-a",
      principalId: "principal.agent.a",
      resourceIds: [resourceId],
      tenantId: "tenant.a",
      workloadId: "workload.agent.a",
    }),
    confidentialClient({
      actorId: "actor.agent.b",
      actionIds: [requestStock, taskExcludedAction],
      clientId: "agent-b",
      principalId: "principal.agent.b",
      resourceIds: [resourceId],
      tenantId: "tenant.b",
      workloadId: "workload.agent.b",
    }),
    confidentialClient({
      actorId: "actor.human.a",
      actionIds: [requestStock, restrictedAction, taskExcludedAction],
      clientId: "human-a",
      principalId: "principal.human.a",
      resourceIds: [resourceId],
      tenantId: "tenant.a",
      workloadId: "workload.human.a",
    }),
    confidentialClient({
      actorId: "actor.approver.a",
      actionIds: [requestStock],
      clientId: "approver-a",
      principalId: "principal.approver.a",
      resourceIds: [resourceId],
      tenantId: "tenant.a",
      workloadId: "workload.approver.a",
    }),
    confidentialClient({
      actorId: "actor.admin.a",
      actionIds: ["zoen.definition.activate"],
      clientId: "admin-a",
      principalId: "principal.admin.a",
      resourceIds: [definitionId],
      tenantId: "tenant.a",
      workloadId: "workload.admin.a",
    }),
    confidentialClient({
      actorId: "actor.admin.b",
      actionIds: ["zoen.definition.activate"],
      clientId: "admin-b",
      principalId: "principal.admin.b",
      resourceIds: [definitionId],
      tenantId: "tenant.b",
      workloadId: "workload.admin.b",
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
