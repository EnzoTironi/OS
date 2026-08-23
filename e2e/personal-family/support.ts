import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Client as PostgresClient } from "pg";
import {
  e2eGeneratedDirectory,
  e2eHttpUrl,
  e2ePostgresUrl,
  writeScenarioArtifact,
} from "../host-env.js";

export const scenario = "personal-family";
export const repositoryRoot = process.cwd();
export const generatedDirectory = e2eGeneratedDirectory(
  repositoryRoot,
  scenario,
);
export const postgresPort = 55_510;
export const keycloakPort = 58_650;
export const zoendPort = 58_651;
export const baseUrl = e2eHttpUrl("ZOEN_E2E_ZOEND_PORT", zoendPort);
export const publicWebOrigin = "http://127.0.0.1:3000";

export const adminDatabaseUrl = e2ePostgresUrl(
  "postgres",
  "postgres",
  postgresPort,
);
export const applicationDatabaseUrl = e2ePostgresUrl(
  "zoen_app",
  "zoen_app",
  postgresPort,
);

export { writeScenarioArtifact };

export const familyTenantId = "tenant.family.1";
export const orgTenantId = "tenant.org.a";
export const familyViewerPrincipal = "principal.family.viewer";
export const familyApproverPrincipal = "principal.family.approver";
export const orgMemberPrincipal = "principal.org.member";
export const sharedEntityId = "inventory.item.1";

export async function applyAttentionSchema(
  connectionString = adminDatabaseUrl,
): Promise<void> {
  const sql = await readFile(
    path.join(
      repositoryRoot,
      "packages",
      "attention",
      "sql",
      "0001_attention.sql",
    ),
    "utf8",
  );
  const client = new PostgresClient({ connectionString });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

export async function openAppClient(): Promise<PostgresClient> {
  const client = new PostgresClient({
    connectionString: applicationDatabaseUrl,
  });
  await client.connect();
  return client;
}

export async function writePolicyManifest(outputPath: string): Promise<{
  canonicalJson: string;
  digest: string;
  definitionId: string;
  policyDigest: string;
  policySource: string;
}> {
  const canonicalJson = (
    await readFile(
      path.join(
        repositoryRoot,
        "e2e",
        scenario,
        "definition-direct.canonical.json",
      ),
      "utf8",
    )
  ).trimEnd();
  const digest = createHash("sha256").update(canonicalJson).digest("hex");
  const policySource = await readFile(
    path.join(repositoryRoot, "e2e", scenario, "direct.cedar"),
    "utf8",
  );
  const activationSource = await readFile(
    path.join(repositoryRoot, "e2e", scenario, "activation.cedar"),
    "utf8",
  );
  const policyDigest = createHash("sha256").update(policySource).digest("hex");
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify(
      {
        policies: [
          {
            actionId: "inventory.requestStock",
            definitionDigest: digest,
            digest: policyDigest,
            policyId: "policy.personal-family.direct",
            revision: 1,
            source: policySource,
          },
          {
            actionId: "zoen.definition.activate",
            definitionDigest: digest,
            digest: createHash("sha256").update(activationSource).digest("hex"),
            policyId: "policy.activation.inventory.governed",
            revision: 1,
            source: activationSource,
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  return {
    canonicalJson,
    definitionId: "inventory.governed",
    digest,
    policyDigest,
    policySource,
  };
}

export async function admin(
  method: string,
  route: string,
  body?: unknown,
  token?: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${baseUrl}${route}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    },
    method,
  });
  const text = await response.text();
  const parsed =
    text.length === 0 ? {} : (JSON.parse(text) as Record<string, unknown>);
  return { body: parsed, status: response.status };
}

export async function resolveContext(
  token: string,
  tenant: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  return admin(
    "GET",
    `/identity/admin/resolve-context?tenant=${encodeURIComponent(tenant)}`,
    undefined,
    token,
  );
}
