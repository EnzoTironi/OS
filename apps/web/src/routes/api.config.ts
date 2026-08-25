import { createFileRoute } from "@tanstack/react-router";
import { runtimeConfigSchema } from "../config.js";

export const Route = createFileRoute("/api/config")({
  server: {
    handlers: {
      GET: () =>
        Response.json(
          runtimeConfigSchema.parse({
            actionIds: parseActionIds(process.env.ZOEN_WEB_ACTION_IDS),
            adaptiveSurfaceEnabled:
              process.env.ZOEN_WEB_ADAPTIVE_SURFACE_URL !== undefined,
            definitionId: requiredEnvironment("ZOEN_WEB_DEFINITION_ID"),
            oidcClientId: requiredEnvironment("ZOEN_WEB_OIDC_CLIENT_ID"),
            oidcIssuer: requiredEnvironment("ZOEN_WEB_OIDC_ISSUER"),
            resourceId: optionalEnvironment("ZOEN_WEB_RESOURCE_ID"),
            rpcBaseUrl: "/rpc",
            typeId: optionalEnvironment("ZOEN_WEB_TYPE_ID"),
            typeLimit: parseTypeLimit(process.env.ZOEN_WEB_TYPE_LIMIT),
            validAt: requiredEnvironment("ZOEN_WEB_VALID_AT"),
          }),
        ),
    },
  },
});

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} is required`);
  }
  return value;
}

function optionalEnvironment(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined || value === "") {
    return undefined;
  }
  return value;
}

function parseActionIds(raw: string | undefined): string[] | undefined {
  if (raw === undefined || raw.trim() === "") {
    return undefined;
  }
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function parseTypeLimit(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === "") {
    return undefined;
  }
  const limit = Number(raw);
  if (!Number.isInteger(limit)) {
    throw new Error("ZOEN_WEB_TYPE_LIMIT must be a positive integer");
  }
  return limit;
}
