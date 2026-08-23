import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const outputDirectory =
  process.env.ZOEN_E2E_GENERATED_DIR ??
  path.join("e2e", "human-executor", ".generated");
const actionId = "inventory.requestStock";
const activationActionId = "zoen.definition.activate";
const definitionIds = [
  "inventory.governed",
  "inventory.governed.deny",
  "inventory.governed.error",
  "inventory.governed.human",
  "inventory.governed.multi",
  "inventory.governed.self",
];
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
  audience = true,
  clientId,
  delegationClaim,
  principalId,
  tenantId,
  tokenLifespan,
  workloadId,
}) {
  const protocolMappers = [
    hardcodedClaim("tenant_id", tenantId),
    hardcodedClaim("actor_id", actorId),
    hardcodedClaim("principal_id", principalId),
    hardcodedClaim("workload_id", workloadId),
    hardcodedClaim(
      "zoen_delegation",
      delegationClaim ?? delegation(workloadId),
    ),
  ];
  if (audience) {
    protocolMappers.push(audienceMapper());
  }
  return {
    attributes:
      tokenLifespan === undefined
        ? {}
        : { "access.token.lifespan": String(tokenLifespan) },
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

const expandedDelegation = delegation("workload.expanded.a", [
  {
    actionIds: [actionId],
    delegationId: "delegation.parent.a",
    expiresAt: farFuture,
    notBefore: 0,
    resourceIds: [resourceId],
    workloadIds: ["workload.expanded.a"],
  },
  {
    actionIds: [actionId, "inventory.deleteStock"],
    delegationId: "delegation.child.a",
    expiresAt: farFuture,
    notBefore: 0,
    resourceIds: [resourceId],
    workloadIds: ["workload.expanded.a"],
  },
]);

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
      actorId: "actor.agent.a",
      clientId: "agent-a",
      principalId: "principal.agent.a",
      tenantId: "tenant.a",
      workloadId: "workload.agent.a",
    }),
    confidentialClient({
      actorId: "actor.admin.a",
      clientId: "admin-a",
      delegationClaim: activationDelegation("workload.admin.a"),
      principalId: "principal.admin.a",
      tenantId: "tenant.a",
      workloadId: "workload.admin.a",
    }),
    confidentialClient({
      actorId: "actor.approver.a",
      clientId: "approver-a",
      principalId: "principal.approver.a",
      tenantId: "tenant.a",
      workloadId: "workload.human.a",
    }),
    confidentialClient({
      actorId: "actor.agent.b",
      clientId: "agent-b",
      principalId: "principal.agent.b",
      tenantId: "tenant.b",
      workloadId: "workload.agent.b",
    }),
    confidentialClient({
      actorId: "actor.admin.b",
      clientId: "admin-b",
      delegationClaim: activationDelegation("workload.admin.b"),
      principalId: "principal.admin.b",
      tenantId: "tenant.b",
      workloadId: "workload.admin.b",
    }),
    confidentialClient({
      actorId: "actor.effect-worker.a",
      clientId: "effect-worker-a",
      principalId: "principal.effect-worker.a",
      tenantId: "tenant.a",
      workloadId: "workload.effect-worker",
    }),
    confidentialClient({
      actorId: "actor.effect-worker.b",
      clientId: "effect-worker-b",
      principalId: "principal.effect-worker.b",
      tenantId: "tenant.b",
      workloadId: "workload.effect-worker",
    }),
    confidentialClient({
      actorId: "actor.effect-reconciler.a",
      clientId: "effect-reconciler-a",
      principalId: "principal.effect-reconciler.a",
      tenantId: "tenant.a",
      workloadId: "workload.effect-reconciler",
    }),
    confidentialClient({
      actorId: "actor.effect-reconciler.b",
      clientId: "effect-reconciler-b",
      principalId: "principal.effect-reconciler.b",
      tenantId: "tenant.b",
      workloadId: "workload.effect-reconciler",
    }),
    confidentialClient({
      actorId: "actor.expanded.a",
      clientId: "expanded-a",
      delegationClaim: expandedDelegation,
      principalId: "principal.expanded.a",
      tenantId: "tenant.a",
      workloadId: "workload.expanded.a",
    }),
    confidentialClient({
      actorId: "actor.wrong-audience.a",
      audience: false,
      clientId: "wrong-audience-a",
      principalId: "principal.wrong-audience.a",
      tenantId: "tenant.a",
      workloadId: "workload.wrong-audience.a",
    }),
    confidentialClient({
      actorId: "actor.expired.a",
      clientId: "expired-a",
      principalId: "principal.expired.a",
      tenantId: "tenant.a",
      tokenLifespan: 1,
      workloadId: "workload.expired.a",
    }),
    confidentialClient({
      actorId: "actor.human-executor.a",
      clientId: "human-executor-a",
      principalId: "principal.human-executor.a",
      tenantId: "tenant.a",
      workloadId: "workload.human-executor",
    }),
    confidentialClient({
      actorId: "actor.human-executor.b",
      clientId: "human-executor-b",
      principalId: "principal.human-executor.b",
      tenantId: "tenant.b",
      workloadId: "workload.human-executor",
    }),
    confidentialClient({
      actorId: "actor.human-executor-revoked.a",
      clientId: "human-executor-revoked-a",
      principalId: "principal.human-executor-revoked.a",
      tenantId: "tenant.a",
      workloadId: "workload.human-executor.revoked",
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
