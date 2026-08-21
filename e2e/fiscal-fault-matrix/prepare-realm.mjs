import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const outputDirectory =
  process.env.ZOEN_E2E_GENERATED_DIR ??
  path.join("e2e", "fiscal-fault-matrix", ".generated");
const farFuture = 4_102_444_800;
const definitionIds = ["commercial.sales", "fiscal.brazil"];
const fiscalActions = [
  "fiscal.cancelDocument",
  "fiscal.correctDocument",
  "fiscal.requestTaxDetermination",
  "fiscal.submitDocument",
];
const resources = [
  "fiscal.document.a",
  "fiscal.document.b",
  "fiscal.intent.credential",
  "fiscal.intent.http200",
  "fiscal.intent.live",
  "fiscal.intent.pending",
  "fiscal.intent.presend",
  "fiscal.intent.protheus",
  "fiscal.intent.rejected",
  "fiscal.intent.schema",
  "fiscal.intent.timeout",
  "fiscal.tax.error",
  "fiscal.tax.live",
  "fiscal.tax.outage",
  "fiscal.tax.success",
  "fiscal.tax.validation",
];

function claim(name, value) {
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

function audience() {
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

function client(input) {
  const protocolMappers = [
    claim("tenant_id", input.tenantId),
    claim("actor_id", input.actorId),
    claim("principal_id", input.principalId),
    claim("workload_id", input.workloadId),
    audience(),
  ];
  if (input.actionIds !== undefined && input.resourceIds !== undefined) {
    protocolMappers.splice(
      4,
      0,
      claim(
        "zoen_delegation",
        delegation(input.workloadId, input.actionIds, input.resourceIds),
      ),
    );
  }
  return {
    attributes: {},
    clientAuthenticatorType: "client-secret",
    clientId: input.clientId,
    directAccessGrantsEnabled: false,
    enabled: true,
    protocol: "openid-connect",
    protocolMappers,
    publicClient: false,
    secret: `${input.clientId}-secret`,
    serviceAccountsEnabled: true,
    standardFlowEnabled: false,
  };
}

function tenantClients(suffix) {
  const tenantId = `tenant.${suffix}`;
  return [
    client({
      actionIds: ["zoen.definition.activate"],
      actorId: `actor.domain-admin.${suffix}`,
      clientId: `domain-admin-${suffix}`,
      principalId: `principal.domain-admin.${suffix}`,
      resourceIds: definitionIds,
      tenantId,
      workloadId: `workload.domain-admin.${suffix}`,
    }),
    client({
      actionIds: fiscalActions,
      actorId: `actor.fiscal-agent.${suffix}`,
      clientId: `fiscal-agent-${suffix}`,
      principalId: `principal.fiscal-agent.${suffix}`,
      resourceIds: resources,
      tenantId,
      workloadId: `workload.fiscal-agent.${suffix}`,
    }),
    client({
      actionIds: [
        "zoen.effect.read",
        "zoen.history.explain",
        "zoen.world.query",
      ],
      actorId: `actor.fiscal-adapter.${suffix}`,
      clientId: `fiscal-adapter-${suffix}`,
      principalId: `principal.fiscal-adapter.${suffix}`,
      resourceIds: ["zoen.effect.request", ...resources],
      tenantId,
      workloadId: `workload.fiscal-adapter.${suffix}`,
    }),
    client({
      actionIds: ["zoen.effect.execute"],
      actorId: `actor.effect-worker.${suffix}`,
      clientId: `effect-worker-${suffix}`,
      principalId: `principal.effect-worker.${suffix}`,
      resourceIds: ["zoen.effect.request"],
      tenantId,
      workloadId: "workload.effect-worker",
    }),
    client({
      actionIds: ["zoen.effect.reconcile"],
      actorId: `actor.effect-reconciler.${suffix}`,
      clientId: `effect-reconciler-${suffix}`,
      principalId: `principal.effect-reconciler.${suffix}`,
      resourceIds: ["zoen.effect.request"],
      tenantId,
      workloadId: "workload.effect-reconciler",
    }),
  ];
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
    ...tenantClients("a"),
    ...tenantClients("b"),
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
