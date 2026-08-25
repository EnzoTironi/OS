import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import "../governed-action/prepare-realm.mjs";

const outputDirectory =
  process.env.ZOEN_E2E_GENERATED_DIR ??
  path.join("e2e", "workshop-miniapp", ".generated");
const realmPath = path.join(outputDirectory, "realm.json");
const webOrigin = `http://127.0.0.1:${process.env.ZOEN_E2E_WEB_PORT ?? "58722"}`;
const definitionId = "commercial.sales";
const orderLines = [
  "commercial.order-line.1001",
  "commercial.order-line.1002",
];
const realm = JSON.parse(await readFile(realmPath, "utf8"));

addDefinitionToActivation(realm, "admin-a", definitionId);
addDefinitionToActivation(realm, "admin-b", definitionId);

realm.clients.push({
  attributes: {
    "pkce.code.challenge.method": "S256",
  },
  clientId: "zoen-web",
  directAccessGrantsEnabled: false,
  enabled: true,
  protocol: "openid-connect",
  protocolMappers: [
    hardcodedClaim("tenant_id", "tenant.a"),
    hardcodedClaim("actor_id", "actor.web.a"),
    hardcodedClaim("principal_id", "principal.web.a"),
    hardcodedClaim("workload_id", "workload.web.a"),
    hardcodedClaim(
      "zoen_delegation",
      JSON.stringify([
        {
          actionIds: ["commercial.changeCommitment"],
          delegationId: "delegation.web.a",
          expiresAt: 4_102_444_800,
          notBefore: 0,
          resourceIds: orderLines,
          workloadIds: ["workload.web.a"],
        },
      ]),
    ),
    audienceMapper(),
  ],
  publicClient: true,
  redirectUris: [`${webOrigin}/*`],
  serviceAccountsEnabled: false,
  standardFlowEnabled: true,
  webOrigins: [webOrigin],
});
realm.users = [
  {
    credentials: [
      {
        temporary: false,
        type: "password",
        value: "web-password",
      },
    ],
    email: "web-user@example.test",
    emailVerified: true,
    enabled: true,
    firstName: "Web",
    lastName: "User",
    requiredActions: [],
    username: "web-user",
  },
];

await writeFile(realmPath, `${JSON.stringify(realm, null, 2)}\n`);

function addDefinitionToActivation(realm, clientId, definitionId) {
  const client = realm.clients.find((candidate) => candidate.clientId === clientId);
  if (client === undefined) {
    throw new Error(`Missing realm client ${clientId}`);
  }
  const mapper = client.protocolMappers.find(
    (candidate) => candidate.name === "zoen_delegation",
  );
  if (mapper === undefined) {
    throw new Error(`Missing zoen_delegation mapper on ${clientId}`);
  }
  const grants = JSON.parse(mapper.config["claim.value"]);
  for (const grant of grants) {
    if (grant.actionIds.includes("zoen.definition.activate")) {
      grant.resourceIds = [...new Set([...grant.resourceIds, definitionId])];
    }
  }
  mapper.config["claim.value"] = JSON.stringify(grants);
}

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
