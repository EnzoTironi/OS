import { readFileSync, writeFileSync } from "node:fs";
import { createClient, type Interceptor } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import { compileDefinition } from "../../packages/ontology/src/index.js";
import { DefinitionService } from "../../packages/sdk/src/gen/zoen/definition/v1/definition_pb.js";

/**
 * Fly prestart: Publish+Activate personal.memory once zoend and remint exist.
 * Speaker stays Propose→Commit. Requires ZOEN_TENANT_ID (no default).
 */
async function main(): Promise<void> {
  const tenantId = requiredEnv("ZOEN_TENANT_ID");
  const definitionPath = requiredEnv("ZOEN_PERSONAL_DEFINITION_PATH");
  const baseUrl = requiredEnv("ZOEN_IDENTITY_BASE_URL");
  const tokenFile = requiredEnv("ZOEN_AGENT_BEARER_TOKEN_FILE");
  const readyPath = process.env.ZOEN_PERSONAL_LAKE_READY_FILE?.trim()
    ?? "/data/zoen/personal.lake.ready";
  const token = readFileSync(tokenFile, "utf8").trim();
  if (token.length === 0) {
    throw new Error("agent bearer token is empty");
  }
  const compiled = await compileDefinition(definitionPath);
  const definitions = createClient(
    DefinitionService,
    connectTransport(baseUrl, token),
  );
  await definitions.publish({
    canonicalJson: new TextEncoder().encode(compiled.canonicalJson),
    digest: compiled.digest,
    tenantId,
  });
  const active = await definitions.getActiveRevision({
    definitionId: compiled.definition.definitionId,
    tenantId,
  });
  const currentDigest = active.definitionRevision?.digest;
  if (currentDigest !== compiled.digest) {
    await definitions.activateRevision({
      activeRevisionPrecondition:
        currentDigest === undefined || currentDigest.length === 0
          ? { case: "expectNoActiveRevision", value: true }
          : { case: "expectedActiveDigest", value: currentDigest },
      definitionId: compiled.definition.definitionId,
      digest: compiled.digest,
      tenantId,
    });
  }
  writeFileSync(
    readyPath,
    `${JSON.stringify({
      definitionId: compiled.definition.definitionId,
      digest: compiled.digest,
      event: "personalLakeReady",
    })}\n`,
  );
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function connectTransport(baseUrl: string, bearerToken: string) {
  const authorization: Interceptor = (next) => async (request) => {
    request.header.set("authorization", `Bearer ${bearerToken}`);
    return next(request);
  };
  return createConnectTransport({
    baseUrl: baseUrl.replace(/\/$/u, ""),
    httpVersion: "1.1",
    interceptors: [authorization],
  });
}

await main();
