import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createClient, type Interceptor } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import { DefinitionService } from "../../gen/connect/zoen/definition/v1/definition_pb.js";

async function main(): Promise<void> {
  const tenantId = requiredEnv("ZOEN_TENANT_ID");
  const personalPath = requiredEnv("ZOEN_PERSONAL_DEFINITION_PATH");
  const commercialPath = requiredEnv("ZOEN_WORLD_DEFINITION_PATH");
  const baseUrl = requiredEnv("ZOEN_IDENTITY_BASE_URL");
  const tokenFile = requiredEnv("ZOEN_AGENT_BEARER_TOKEN_FILE");
  const personalReady = process.env.ZOEN_PERSONAL_LAKE_READY_FILE?.trim()
    ?? "/data/zoen/personal.lake.ready";
  const commercialReady = process.env.ZOEN_COMMERCIAL_LAKE_READY_FILE?.trim()
    ?? "/data/zoen/commercial.lake.ready";
  const token = readFileSync(tokenFile, "utf8").trim();
  if (token.length === 0) {
    throw new Error("agent bearer token is empty");
  }
  const transport = connectTransport(baseUrl, token);
  const definitions = createClient(DefinitionService, transport);

  const personal = loadCanonical(personalPath);
  await publishAndActivate(definitions, personal, tenantId);
  writeReady(personalReady, {
    definitionId: personal.definitionId,
    digest: personal.digest,
    event: "personalLakeReady",
  });

  const commercial = loadCanonical(commercialPath);
  await publishAndActivate(definitions, commercial, tenantId);
  writeReady(commercialReady, {
    definitionId: commercial.definitionId,
    digest: commercial.digest,
    event: "commercialLakeReady",
  });
}

function loadCanonical(path: string): {
  readonly canonicalJson: string;
  readonly digest: string;
  readonly definitionId: string;
} {
  const canonicalJson = readFileSync(path, "utf8").trim();
  const digest = createHash("sha256").update(canonicalJson).digest("hex");
  const parsed = JSON.parse(canonicalJson) as { definitionId?: string };
  if (typeof parsed.definitionId !== "string" || parsed.definitionId.length === 0) {
    throw new Error(`${path} is not canonical definition JSON`);
  }
  return { canonicalJson, digest, definitionId: parsed.definitionId };
}

async function publishAndActivate(
  definitions: ReturnType<typeof createClient<typeof DefinitionService>>,
  compiled: {
    readonly canonicalJson: string;
    readonly digest: string;
    readonly definitionId: string;
  },
  tenantId: string,
): Promise<void> {
  await definitions.publish({
    canonicalJson: new TextEncoder().encode(compiled.canonicalJson),
    digest: compiled.digest,
    tenantId,
  });
  const active = await definitions.getActiveRevision({
    definitionId: compiled.definitionId,
    tenantId,
  });
  const currentDigest = active.definitionRevision?.digest;
  if (currentDigest === compiled.digest) {
    return;
  }
  await definitions.activateRevision({
    activeRevisionPrecondition:
      currentDigest === undefined || currentDigest.length === 0
        ? { case: "expectNoActiveRevision", value: true }
        : { case: "expectedActiveDigest", value: currentDigest },
    definitionId: compiled.definitionId,
    digest: compiled.digest,
    tenantId,
  });
}

function writeReady(
  path: string,
  payload: Record<string, string>,
): void {
  writeFileSync(path, `${JSON.stringify(payload)}\n`);
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
