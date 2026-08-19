import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import * as restate from "@restatedev/restate-sdk";
import { z } from "zod";
import {
  AgentRegistry,
  capabilityAliasForScope,
  connectZoenAgent,
  createAgentSessionService,
  parseLiveProviderConfig,
  providerRouteSchema,
  registerLiveProviders,
  semanticCapabilityScopeSchema,
  type Registration,
} from "../../packages/harness/src/index.js";

const environmentSchema = z
  .object({
    OPENCODE_API_KEY: z.string().min(1),
    OPENCODE_BASE_URL: z.url(),
    ZOEN_DISABLE_CAPABILITIES_ON_START: z.literal("true").optional(),
    ZOEN_DISABLE_PROVIDERS_ON_START: z.literal("true").optional(),
    ZOEN_AGENT_BEARER_TOKEN: z.string().min(1),
    ZOEN_AGENT_DEFINITION_DIGEST: z.string().regex(/^[0-9a-f]{64}$/),
    ZOEN_AGENT_SERVICE_URL: z.url(),
    ZOEN_PROVIDER_A_ID: z.string().min(1),
    ZOEN_PROVIDER_A_MODEL: z.string().min(1),
    ZOEN_PROVIDER_B_ID: z.string().min(1),
    ZOEN_PROVIDER_B_MODEL: z.string().min(1),
  })
  .parse(process.env);

const definition = {
  definitionId: "inventory.agentLive",
  digest: environmentSchema.ZOEN_AGENT_DEFINITION_DIGEST,
  revision: 1,
};
const validAt = "2026-08-19T00:00:00.000Z";
const scopes = [
  semanticCapabilityScopeSchema.parse({
    actionId: "inventory.requestStock",
    definition,
    kind: "action",
    resourceId: "inventory.item.1",
    validAt,
  }),
  semanticCapabilityScopeSchema.parse({
    actionId: "inventory.requestStock",
    definition,
    kind: "action",
    resourceId: "inventory.item.2",
    validAt,
  }),
  semanticCapabilityScopeSchema.parse({
    definition,
    entityId: "inventory.item.1",
    kind: "query",
    selection: { id: "inventory.available", kind: "relation" },
    validAt,
  }),
];
const routes = [
  providerRouteSchema.parse({
    capability: "reasoning-fast",
    id: environmentSchema.ZOEN_PROVIDER_A_ID,
    modelId: environmentSchema.ZOEN_PROVIDER_A_MODEL,
    provider: "openai-compatible",
  }),
  providerRouteSchema.parse({
    capability: "reasoning-high",
    id: environmentSchema.ZOEN_PROVIDER_B_ID,
    modelId: environmentSchema.ZOEN_PROVIDER_B_MODEL,
    provider: "openai-compatible",
  }),
];
const connected = await connectZoenAgent(
  {
    baseUrl: environmentSchema.ZOEN_AGENT_SERVICE_URL,
    bearerToken: environmentSchema.ZOEN_AGENT_BEARER_TOKEN,
  },
  scopes,
);
const registry = new AgentRegistry();
const capabilityRegistrations = new Map<string, Registration>();
for (const scope of scopes) {
  const alias = capabilityAliasForScope(scope);
  capabilityRegistrations.set(
    alias,
    registry.registerCapabilityScope(scope),
  );
}
const config = parseLiveProviderConfig({ routes });
const registeredProviders = registerLiveProviders(registry, config, [
  {
    apiKey: environmentSchema.OPENCODE_API_KEY,
    baseURL: environmentSchema.OPENCODE_BASE_URL,
    kind: "openai-compatible",
  },
]);
const providerRegistrations = new Map<string, Registration>();
for (const [index, route] of routes.entries()) {
  const registration = registeredProviders[index];
  if (registration === undefined) {
    throw new Error(`missing registration for provider ${route.id}`);
  }
  providerRegistrations.set(route.id, registration);
}
if (environmentSchema.ZOEN_DISABLE_CAPABILITIES_ON_START === "true") {
  disableAll(capabilityRegistrations);
}
if (environmentSchema.ZOEN_DISABLE_PROVIDERS_ON_START === "true") {
  disableAll(providerRegistrations);
}

const controlServer = createServer((request, response) => {
  void routeControl(request, response).catch(() => {
    sendJson(response, 500, { error: "control request failed" });
  });
});
controlServer.listen(58_106, "127.0.0.1");

async function routeControl(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (request.method === "GET" && url.pathname === "/health") {
    const discovery = await connected.authority.discover(
      registry.capabilityScopes(),
    );
    sendJson(response, 200, {
      capabilities: discovery.capabilities
        .map((capability) => capability.alias)
        .sort(),
      providers: [...registry.providerRouteIds()].sort(),
      trustedContext: discovery.trustedContext,
    });
    return;
  }
  const providerPrefix = "/disable-provider/";
  if (
    request.method === "POST" &&
    url.pathname.startsWith(providerPrefix)
  ) {
    disable(
      providerRegistrations,
      decodeURIComponent(url.pathname.slice(providerPrefix.length)),
      response,
    );
    return;
  }
  const capabilityPrefix = "/disable-capability/";
  if (
    request.method === "POST" &&
    url.pathname.startsWith(capabilityPrefix)
  ) {
    disable(
      capabilityRegistrations,
      decodeURIComponent(url.pathname.slice(capabilityPrefix.length)),
      response,
    );
    return;
  }
  sendJson(response, 404, { error: "control route not found" });
}

function disable(
  registrations: Map<string, Registration>,
  id: string,
  response: ServerResponse,
): void {
  const registration = registrations.get(id);
  if (registration === undefined) {
    sendJson(response, 404, { error: "registration not found" });
    return;
  }
  registration.dispose();
  registrations.delete(id);
  sendJson(response, 200, { disabled: id });
}

function disableAll(registrations: Map<string, Registration>): void {
  for (const registration of registrations.values()) {
    registration.dispose();
  }
  registrations.clear();
}

function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

await restate.serve({
  port: 58_104,
  services: [
    createAgentSessionService(
      {
        authority: connected.authority,
        registry,
      },
      environmentSchema.ZOEN_AGENT_BEARER_TOKEN,
    ),
  ],
});
