import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const outputDirectory =
  process.env.ZOEN_E2E_GENERATED_DIR ??
  path.join("e2e", "wasm-code-mode", ".generated");
const farFuture = 4_102_444_800;
const definitions = ["inventory.governed", "inventory.governed.human"];

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

function delegation(delegationId, workloadId, actionIds, resourceIds) {
  return JSON.stringify([
    {
      actionIds,
      delegationId,
      expiresAt: farFuture,
      notBefore: 0,
      resourceIds,
      workloadIds: [workloadId],
    },
  ]);
}

function client({
  actionIds,
  actorId,
  clientId,
  principalId,
  resourceIds,
  tenantId,
  workloadId,
}) {
  return {
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
        delegation(`delegation.${clientId}`, workloadId, actionIds, resourceIds),
      ),
      audienceMapper(),
    ],
    publicClient: false,
    secret: `${clientId}-secret`,
    serviceAccountsEnabled: true,
    standardFlowEnabled: false,
  };
}

const clients = [
  {
    bearerOnly: true,
    clientId: "zoend",
    enabled: true,
    protocol: "openid-connect",
  },
  client({
    actionIds: ["inventory.requestStock"],
    actorId: "actor.agent.a",
    clientId: "agent-a",
    principalId: "principal.agent.a",
    resourceIds: ["inventory.item.1"],
    tenantId: "tenant.a",
    workloadId: "workload.agent.a",
  }),
  client({
    actionIds: ["inventory.readStock"],
    actorId: "actor.agent.b",
    clientId: "agent-b",
    principalId: "principal.agent.b",
    resourceIds: ["inventory.item.1"],
    tenantId: "tenant.b",
    workloadId: "workload.agent.b",
  }),
  client({
    actionIds: ["zoen.definition.activate"],
    actorId: "actor.admin.a",
    clientId: "admin-a",
    principalId: "principal.admin.a",
    resourceIds: definitions,
    tenantId: "tenant.a",
    workloadId: "workload.admin.a",
  }),
  client({
    actionIds: ["zoen.definition.activate"],
    actorId: "actor.admin.b",
    clientId: "admin-b",
    principalId: "principal.admin.b",
    resourceIds: definitions,
    tenantId: "tenant.b",
    workloadId: "workload.admin.b",
  }),
];

await mkdir(outputDirectory, { recursive: true });
await writeFile(
  path.join(outputDirectory, "realm.json"),
  `${JSON.stringify(
    {
      accessTokenLifespan: 300,
      clients,
      enabled: true,
      realm: "zoen",
      registrationAllowed: false,
      resetPasswordAllowed: false,
      sslRequired: "none",
    },
    null,
    2,
  )}\n`,
);
