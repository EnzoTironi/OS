import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import "../company-brain-live/prepare-realm.mjs";

const outputDirectory =
  process.env.ZOEN_E2E_GENERATED_DIR ??
  path.join("e2e", "web-adaptive-live", ".generated");
const realmPath = path.join(outputDirectory, "realm.json");
const webOrigin = `http://127.0.0.1:${process.env.ZOEN_E2E_WEB_PORT ?? "58199"}`;
const realm = JSON.parse(await readFile(realmPath, "utf8"));
const workloadId = "workload.web.adaptive.a";

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
    hardcodedClaim("actor_id", "actor.web.adaptive.a"),
    hardcodedClaim("principal_id", "principal.web.adaptive.a"),
    hardcodedClaim("workload_id", workloadId),
    hardcodedClaim(
      "zoen_delegation",
      JSON.stringify([
        {
          actionIds: ["inventory.requestStock"],
          delegationId: "delegation.web.adaptive.a",
          expiresAt: 4_102_444_800,
          notBefore: 0,
          resourceIds: ["inventory.item.1"],
          workloadIds: [workloadId],
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
    email: "adaptive-web-user@example.test",
    emailVerified: true,
    enabled: true,
    firstName: "Adaptive",
    lastName: "Operator",
    requiredActions: [],
    username: "web-user",
  },
];

await writeFile(realmPath, `${JSON.stringify(realm, null, 2)}\n`);

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
