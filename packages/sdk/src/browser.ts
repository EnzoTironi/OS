import {
  createClient,
  type Interceptor,
  type Transport,
} from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { z } from "zod";
import { ActionService } from "./gen/zoen/action/v1/action_pb.js";
import { DefinitionService } from "./gen/zoen/definition/v1/definition_pb.js";
import { EffectService } from "./gen/zoen/effect/v1/effect_pb.js";
import { HistoryService } from "./gen/zoen/history/v1/history_pb.js";
import { WorldService } from "./gen/zoen/world/v1/world_pb.js";

const tokenClaimsSchema = z
  .object({
    tenant_id: z.string().min(1),
  })
  .passthrough();

export interface ZoenBrowserClient {
  readonly actions: ReturnType<typeof createActionClient>;
  readonly definitions: ReturnType<typeof createDefinitionClient>;
  readonly effects: ReturnType<typeof createEffectClient>;
  readonly history: ReturnType<typeof createHistoryClient>;
  readonly tenantId: string;
  readonly world: ReturnType<typeof createWorldClient>;
}

export interface ZoenBrowserClientOptions {
  readonly accessToken: string;
  readonly baseUrl: string;
}

export function createZoenBrowserClient(
  options: ZoenBrowserClientOptions,
): ZoenBrowserClient {
  const transport = createConnectTransport({
    baseUrl: options.baseUrl,
    interceptors: [authorization(options.accessToken)],
  });
  return {
    actions: createActionClient(transport),
    definitions: createDefinitionClient(transport),
    effects: createEffectClient(transport),
    history: createHistoryClient(transport),
    tenantId: tenantIdFromAccessToken(options.accessToken),
    world: createWorldClient(transport),
  };
}

function authorization(accessToken: string): Interceptor {
  return (next) => async (request) => {
    request.header.set("authorization", `Bearer ${accessToken}`);
    return next(request);
  };
}

function tenantIdFromAccessToken(accessToken: string): string {
  const payload = accessToken.split(".")[1];
  if (payload === undefined) {
    throw new Error("OIDC access token has no payload");
  }
  const normalized = payload.replaceAll("-", "+").replaceAll("_", "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  const claims: unknown = JSON.parse(atob(`${normalized}${padding}`));
  return tokenClaimsSchema.parse(claims).tenant_id;
}

function createActionClient(
  transport: Transport,
) {
  return createClient(ActionService, transport);
}

function createDefinitionClient(
  transport: Transport,
) {
  return createClient(DefinitionService, transport);
}

function createEffectClient(
  transport: Transport,
) {
  return createClient(EffectService, transport);
}

function createHistoryClient(
  transport: Transport,
) {
  return createClient(HistoryService, transport);
}

function createWorldClient(
  transport: Transport,
) {
  return createClient(WorldService, transport);
}
