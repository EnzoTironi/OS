import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const outputDirectory =
  process.env.ZOEN_E2E_GENERATED_DIR ??
  path.join("e2e", "cedar-object-projection", ".generated");
const farFuture = 4_102_444_800;
const actionIds = ["commercial.recordQuote", "zoen.definition.activate"];
const resourceIds = [
  "commercial.sales",
  "commercial.order-line.permitted",
  "commercial.order-line.neighbor",
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

function confidentialClient({
  actorId,
  clientId,
  principalId,
  tenantId,
  workloadId,
}) {
  const delegation = JSON.stringify([
    {
      actionIds,
      delegationId: `delegation.${workloadId}`,
      expiresAt: farFuture,
      notBefore: 0,
      resourceIds,
      workloadIds: [workloadId],
    },
  ]);
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
      hardcodedClaim("zoen_delegation", delegation),
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
      actorId: "actor.admin.a",
      clientId: "admin-a",
      principalId: "principal.admin.a",
      tenantId: "tenant.a",
      workloadId: "workload.admin.a",
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
