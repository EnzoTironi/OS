import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import * as restate from "@restatedev/restate-sdk";
import { z } from "zod";
import {
  AgentRegistry,
  connectZoenAgent,
  createAgentSessionService,
  parseLiveProviderConfig,
  providerRouteSchema,
  registerLiveProviders,
  semanticCapabilitySchema,
  type Registration,
} from "../../packages/harness/src/index.js";

const environmentSchema = z
  .object({
    OPENCODE_API_KEY: z.string().min(1),
    OPENCODE_BASE_URL: z.url(),
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
const candidates = [
  semanticCapabilitySchema.parse({
    actionId: "inventory.requestStock",
    alias: "request-stock",
    definition,
    description: "Request exactly two units of governed inventory stock.",
    inputs: [{ id: "quantity", kind: "integer" }],
    kind: "action",
    resourceId: "inventory.item.1",
    validAt,
  }),
  semanticCapabilitySchema.parse({
    actionId: "inventory.restrictedAction",
    alias: "restricted-action",
    definition,
    description: "A capability outside the agent delegation.",
    inputs: [],
    kind: "action",
    resourceId: "inventory.item.1",
    validAt,
  }),
].map((capability) => {
  if (capability.kind !== "action") {
    throw new Error("agent Action candidate parsed as a Query");
  }
  return capability;
});
const query = semanticCapabilitySchema.parse({
  alias: "available-stock",
  definition,
  description: "Read available governed inventory stock.",
  entityId: "inventory.item.1",
  kind: "query",
  selection: { id: "inventory.available", kind: "relation" },
  validAt,
});
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
  candidates,
);
const registry = new AgentRegistry();
const capabilityRegistrations = new Map<string, Registration>();
for (const capability of [...connected.actions, query]) {
  capabilityRegistrations.set(
    capability.alias,
    registry.registerCapability(capability),
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

const controlServer = createServer((request, response) => {
  routeControl(request, response);
});
controlServer.listen(58_106, "127.0.0.1");

function routeControl(
  request: IncomingMessage,
  response: ServerResponse,
): void {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, {
      capabilities: [...capabilityRegistrations.keys()].sort(),
      providers: [...providerRegistrations.keys()].sort(),
      trustedContext: connected.trustedContext,
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
    createAgentSessionService({
      authority: connected.authority,
      registry,
    }),
  ],
});
