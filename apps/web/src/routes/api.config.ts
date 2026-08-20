import { createFileRoute } from "@tanstack/react-router";
import { runtimeConfigSchema } from "../config.js";

export const Route = createFileRoute("/api/config")({
  server: {
    handlers: {
      GET: () =>
        Response.json(
          runtimeConfigSchema.parse({
            adaptiveSurfaceEnabled:
              process.env.ZOEN_WEB_ADAPTIVE_SURFACE_URL !== undefined,
            definitionId: requiredEnvironment("ZOEN_WEB_DEFINITION_ID"),
            oidcClientId: requiredEnvironment("ZOEN_WEB_OIDC_CLIENT_ID"),
            oidcIssuer: requiredEnvironment("ZOEN_WEB_OIDC_ISSUER"),
            resourceId: requiredEnvironment("ZOEN_WEB_RESOURCE_ID"),
            rpcBaseUrl: "/rpc",
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
