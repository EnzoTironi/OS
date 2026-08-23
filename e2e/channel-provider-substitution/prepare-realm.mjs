import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const outputDirectory =
  process.env.ZOEN_E2E_GENERATED_DIR ??
  path.join("e2e", "messaging-conformance", ".generated");
const actionId = "inventory.requestStock";
const activationActionId = "zoen.definition.activate";
const definitionIds = ["inventory.governed"];
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

function delegation(workloadId, grants) {
  return JSON.stringify(
    grants ?? [
      {
        actionIds: [actionId],
        delegationId: `delegation.${workloadId}`,
        expiresAt: farFuture,
        notBefore: 0,
        resourceIds: [resourceId],
        workloadIds: [workloadId],
      },
    ],
  );
}

function activationDelegation(workloadId) {
  return delegation(workloadId, [
    {
      actionIds: [activationActionId],
      delegationId: `delegation.activation.${workloadId}`,
      expiresAt: farFuture,
      notBefore: 0,
      resourceIds: definitionIds,
      workloadIds: [workloadId],
    },
  ]);
}

function confidentialClient({
  actorId,
  clientId,
  delegationClaim,
  principalId,
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
        delegationClaim ?? delegation(workloadId),
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
    // Unbound V1 path: claims mint TEC directly.
    confidentialClient({
      actorId: "actor.unbound.a",
      clientId: "unbound-a",
      principalId: "principal.unbound.a",
      tenantId: "tenant.a",
      workloadId: "workload.unbound.a",
    }),
    confidentialClient({
      actorId: "actor.admin.a",
      clientId: "admin-a",
      delegationClaim: activationDelegation("workload.admin.a"),
      principalId: "principal.admin.a",
      tenantId: "tenant.a",
      workloadId: "workload.admin.a",
    }),
    // Bound path bait: JWT principal looks like a phone; membership must win.
    // tenant_id=tenant.a so Action RPC resolves the invite membership.
    confidentialClient({
      actorId: "actor.bound.bait",
      clientId: "bound-bait",
      principalId: "principal.phone.plus5511999999999",
      tenantId: "tenant.a",
      workloadId: "workload.bound.bait",
    }),
    confidentialClient({
      actorId: "actor.bound.second",
      clientId: "bound-second",
      principalId: "principal.phone.plus5511888888888",
      tenantId: "tenant.a",
      workloadId: "workload.bound.second",
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
