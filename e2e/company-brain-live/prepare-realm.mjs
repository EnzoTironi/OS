import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const outputDirectory = path.join(
  "e2e",
  "company-brain-live",
  ".generated",
);
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
  actionIds,
  clientId,
  principalId,
  resourceIds,
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
      actionIds: [actionId],
      clientId: "agent-a",
      principalId: "principal.agent.a",
      resourceIds: [resourceId],
      tenantId: "tenant.a",
      workloadId: "workload.agent.a",
    }),
    confidentialClient({
      actorId: "actor.agent.b",
      actionIds: [actionId],
      clientId: "agent-b",
      principalId: "principal.agent.b",
      resourceIds: [resourceId],
      tenantId: "tenant.b",
      workloadId: "workload.agent.b",
    }),
    confidentialClient({
      actorId: "actor.human.a",
      actionIds: [actionId],
      clientId: "human-a",
      principalId: "principal.human.a",
      resourceIds: [resourceId],
      tenantId: "tenant.a",
      workloadId: "workload.human.a",
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
    confidentialClient({
      actorId: "actor.effect-worker.a",
      actionIds: [],
      clientId: "effect-worker-a",
      principalId: "principal.effect-worker.a",
      resourceIds: [],
      tenantId: "tenant.a",
      workloadId: "workload.effect-worker",
    }),
    confidentialClient({
      actorId: "actor.effect-worker.b",
      actionIds: [],
      clientId: "effect-worker-b",
      principalId: "principal.effect-worker.b",
      resourceIds: [],
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

function pdfBytes(lines) {
  const escaped = lines.map((line) =>
    line.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)"),
  );
  const stream = [
    "BT",
    "/F1 11 Tf",
    "72 740 Td",
    "15 TL",
    ...escaped.flatMap((line) => [`(${line}) Tj`, "T*"]),
    "ET",
    "",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
  ];
  let document = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(document));
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(document);
  document += `xref\n0 ${objects.length + 1}\n`;
  document += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    document += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  document += `startxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(document);
}

await mkdir(outputDirectory, { recursive: true });
await writeFile(
  path.join(outputDirectory, "realm.json"),
  `${JSON.stringify(realm, null, 2)}\n`,
);
await writeFile(
  path.join(outputDirectory, "operating-policy.pdf"),
  pdfBytes([
    "Northwind Components procurement operating policy",
    "Supplier lead time for alloy housings is 14 calendar days.",
    "When governed available stock is at least 5 units and causal history",
    "confirms a prior governed stock request, request exactly 2 units.",
    "This document reports available stock as 4 units.",
    "The document value is planning evidence and may be stale.",
  ]),
);
