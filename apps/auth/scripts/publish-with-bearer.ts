import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Code, ConnectError, createClient, type Interceptor } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import { DefinitionService } from "../../../gen/connect/zoen/definition/v1/definition_pb.js";

const baseUrl = required("ZOEN_IDENTITY_BASE_URL");
const tenantId = required("ZOEN_TENANT_ID");
const personalPath = required("ZOEN_PERSONAL_DEFINITION_PATH");
const bearer = bearerFromEnv();

const authorization: Interceptor = (next) => async (request) => {
  request.header.set("authorization", `Bearer ${bearer}`);
  return next(request);
};

const definitions = createClient(
  DefinitionService,
  createConnectTransport({
    baseUrl: baseUrl.replace(/\/$/u, ""),
    httpVersion: "1.1",
    interceptors: [authorization],
  }),
);

const canonicalJson = readFileSync(personalPath, "utf8").trim();
const digest = createHash("sha256").update(canonicalJson).digest("hex");
try {
  await definitions.publish({
    canonicalJson: new TextEncoder().encode(canonicalJson),
    digest,
    tenantId,
  });
  console.log("status=ok");
  process.exit(0);
} catch (error) {
  if (error instanceof ConnectError) {
    console.log(`status=${error.code === Code.Unauthenticated ? "401" : String(error.code)}`);
    process.exit(error.code === Code.Unauthenticated ? 0 : 1);
  }
  throw error;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function bearerFromEnv(): string {
  const inline = process.env.ZOEN_PUBLISH_BEARER?.trim();
  if (inline !== undefined && inline.length > 0) {
    return inline;
  }
  const file = process.env.ZOEN_AGENT_BEARER_TOKEN_FILE?.trim();
  if (file === undefined || file.length === 0) {
    throw new Error("ZOEN_PUBLISH_BEARER or ZOEN_AGENT_BEARER_TOKEN_FILE is required");
  }
  const token = readFileSync(file, "utf8").trim();
  if (token.length === 0) {
    throw new Error("agent bearer token is empty");
  }
  return token;
}
