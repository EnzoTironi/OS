import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const outputDirectory =
  process.env.ZOEN_E2E_GENERATED_DIR ??
  path.join("e2e", "shared-tenancy", ".generated");
const definitionId = "inventory.companyBrain";
const actionId = "inventory.requestStock";
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
  clientId,
  resourceIds,
  tenantId,
  workloadId,
}) {
  return {
    attributes: { "access.token.lifespan": "300" },
    clientAuthenticatorType: "client-secret",
    clientId,
    directAccessGrantsEnabled: false,
    enabled: true,
    protocol: "openid-connect",
    protocolMappers: [
      hardcodedClaim("tenant_id", tenantId),
      hardcodedClaim("organization_id", `org.${tenantId}`),
      hardcodedClaim("actor_id", `actor.${clientId}`),
      hardcodedClaim("principal_id", `principal.${clientId}`),
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

function webUser(tenant) {
  const workloadId = `workload.web.${tenant}`;
  return {
    attributes: {
      actor_id: [`actor.web.${tenant}`],
      organization_id: [`org.${tenant}`],
      principal_id: [`principal.web.${tenant}`],
      tenant_id: [tenant],
      workload_id: [workloadId],
      zoen_delegation: [
        delegation(workloadId, [actionId], [resourceId]),
      ],
    },
    credentials: [
      {
        temporary: false,
        type: "password",
        value: "web-password",
      },
    ],
    email: `${tenant}@example.test`,
    emailVerified: true,
    enabled: true,
    firstName: tenant,
    groups: [`/org-${tenant}`],
    lastName: "Operator",
    realmRoles: ["tenant-operator"],
    username: `web-${tenant}`,
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
      clientId: "admin-a",
      resourceIds: [definitionId],
      tenantId: "tenant.a",
      workloadId: "workload.admin.a",
    }),
    confidentialClient({
      actionIds: ["zoen.definition.activate"],
      clientId: "admin-b",
      resourceIds: [definitionId],
      tenantId: "tenant.b",
      workloadId: "workload.admin.b",
    }),
    confidentialClient({
      actionIds: [actionId],
      clientId: "agent-a",
      resourceIds: [resourceId],
      tenantId: "tenant.a",
      workloadId: "workload.agent.a",
    }),
    confidentialClient({
      actionIds: [actionId],
      clientId: "agent-b",
      resourceIds: [resourceId],
      tenantId: "tenant.b",
      workloadId: "workload.agent.b",
    }),
    confidentialClient({
      actionIds: [actionId],
      clientId: "harness-a",
      resourceIds: [resourceId],
      tenantId: "tenant.a",
      workloadId: "workload.harness.a",
    }),
    confidentialClient({
      actionIds: [actionId],
      clientId: "harness-b",
      resourceIds: [resourceId],
      tenantId: "tenant.b",
      workloadId: "workload.harness.b",
    }),
    confidentialClient({
      actionIds: [actionId],
      clientId: "effect-worker-a",
      resourceIds: [resourceId],
      tenantId: "tenant.a",
      workloadId: "workload.effect-worker",
    }),
    confidentialClient({
      actionIds: [actionId],
      clientId: "effect-worker-b",
      resourceIds: [resourceId],
      tenantId: "tenant.b",
      workloadId: "workload.effect-worker",
    }),
    {
      clientAuthenticatorType: "client-secret",
      clientId: "platform-observer",
      directAccessGrantsEnabled: false,
      enabled: true,
      protocol: "openid-connect",
      protocolMappers: [
        hardcodedClaim("platform_role", "cross-tenant-observer"),
      ],
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
      redirectUris: ["http://127.0.0.1:32080/*"],
      serviceAccountsEnabled: false,
      standardFlowEnabled: true,
      webOrigins: ["http://127.0.0.1:32080"],
    },
  ],
  enabled: true,
  groups: [
    { name: "org-tenant.a" },
    { name: "org-tenant.b" },
  ],
  realm: "zoen",
  registrationAllowed: false,
  resetPasswordAllowed: false,
  roles: {
    realm: [
      { name: "tenant-operator" },
      { name: "platform-observer" },
    ],
  },
  sslRequired: "none",
  users: [webUser("tenant.a"), webUser("tenant.b")],
};

await mkdir(outputDirectory, { recursive: true });
await writeFile(
  path.join(outputDirectory, "realm.json"),
  `${JSON.stringify(realm, null, 2)}\n`,
);
