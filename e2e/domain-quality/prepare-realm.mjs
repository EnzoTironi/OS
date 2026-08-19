import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const outputDirectory =
  process.env.ZOEN_E2E_GENERATED_DIR ??
  path.join("e2e", "domain-quality", ".generated");
const farFuture = 4_102_444_800;
const qualityActions = ["quality.quarantineLot", "quality.releaseLot"];
const remappedActions = ["lab.quarantineLot", "lab.releaseLot"];
const qualityResource = "quality.inspection.lot-42";
const remappedResource = "lab.inspection.lot-42";

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
      actionIds: qualityActions,
      actorId: "actor.quality-agent.a",
      clientId: "quality-agent-a",
      principalId: "principal.quality-agent.a",
      resourceIds: [qualityResource],
      tenantId: "tenant.a",
      workloadId: "workload.quality-agent.a",
    }),
    confidentialClient({
      actionIds: remappedActions,
      actorId: "actor.quality-agent.b",
      clientId: "quality-agent-b",
      principalId: "principal.quality-agent.b",
      resourceIds: [remappedResource],
      tenantId: "tenant.b",
      workloadId: "workload.quality-agent.b",
    }),
    confidentialClient({
      actionIds: ["quality.releaseLot"],
      actorId: "actor.inspector.a",
      clientId: "quality-inspector-a",
      principalId: "principal.inspector.a",
      resourceIds: [qualityResource],
      tenantId: "tenant.a",
      workloadId: "workload.inspector.a",
    }),
    confidentialClient({
      actionIds: ["quality.releaseLot"],
      actorId: "actor.supervisor.a",
      clientId: "quality-supervisor-a",
      principalId: "principal.supervisor.a",
      resourceIds: [qualityResource],
      tenantId: "tenant.a",
      workloadId: "workload.supervisor.a",
    }),
    confidentialClient({
      actionIds: qualityActions,
      actorId: "actor.effect-worker.a",
      clientId: "effect-worker-a",
      principalId: "principal.effect-worker.a",
      resourceIds: [qualityResource],
      tenantId: "tenant.a",
      workloadId: "workload.effect-worker",
    }),
    confidentialClient({
      actionIds: remappedActions,
      actorId: "actor.effect-worker.b",
      clientId: "effect-worker-b",
      principalId: "principal.effect-worker.b",
      resourceIds: [remappedResource],
      tenantId: "tenant.b",
      workloadId: "workload.effect-worker",
    }),
    confidentialClient({
      actionIds: qualityActions,
      actorId: "actor.effect-reconciler.a",
      clientId: "effect-reconciler-a",
      principalId: "principal.effect-reconciler.a",
      resourceIds: [qualityResource],
      tenantId: "tenant.a",
      workloadId: "workload.effect-reconciler",
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
