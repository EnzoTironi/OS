import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const outputDirectory =
  process.env.ZOEN_E2E_GENERATED_DIR ??
  path.join("e2e", "adr-0007", ".generated");
const farFuture = 4_102_444_800;
const definitionIds = ["commercial.sales"];
const commercialActions = ["commercial.changeCommitment"];
const resourceIds = ["commercial.sales", "commercial.order-line.dirty-quote"];

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

function delegation(workloadId, actionIds, grantedResourceIds) {
  return JSON.stringify([
    {
      actionIds,
      delegationId: `delegation.${workloadId}`,
      expiresAt: farFuture,
      notBefore: 0,
      resourceIds: grantedResourceIds,
      workloadIds: [workloadId],
    },
  ]);
}

function confidentialClient({
  actionIds,
  actorId,
  clientId,
  principalId,
  resourceIds: grantedResourceIds,
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
        delegation(workloadId, actionIds, grantedResourceIds),
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
      actionIds: [...commercialActions, "zoen.definition.activate"],
      actorId: "actor.admin.a",
      clientId: "admin-a",
      principalId: "principal.admin.a",
      resourceIds: [...definitionIds, ...resourceIds],
      tenantId: "tenant.a",
      workloadId: "workload.admin.a",
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
