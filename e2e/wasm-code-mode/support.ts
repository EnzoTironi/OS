import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import {
  createClient,
  type Client,
  type Interceptor,
} from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import {
  ActionCapabilitySchema,
  CapabilityManifestSchema,
  CapabilitySchema,
  ComputationService,
  ExplainCapabilitySchema,
  QueryCapabilitySchema,
  type CapabilityManifest,
  type ExecuteResponse,
} from "../../gen/connect/zoen/computation/v1/computation_pb.js";
import {
  QuerySelectionSchema,
  type DefinitionReference,
} from "../../gen/connect/zoen/world/v1/world_pb.js";
import { invitePersona, type DoorPersona } from "../ba-door.js";
import { definitionPublishActionId } from "../definition-publish-policy.js";
import { e2eHttpUrl } from "../host-env.js";

export const componentInterface = "zoen:code-mode/computation@1.0.0";
export const entityId = "inventory.item.1";
export const relationId = "inventory.available";
export const validAt = new Date("2026-08-19T00:00:00.000Z");

const wasmDefinitionIds = [
  "inventory.governed",
  "inventory.governed.human",
] as const;

export const wasmCodeModePersonas: readonly DoorPersona[] = [
  invitePersona({
    actionIds: ["inventory.requestStock"],
    actorId: "actor.agent.a",
    id: "agent-a",
    principalId: "principal.agent.a",
    resourceIds: [entityId],
    tenantId: "tenant.a",
    workloadId: "workload.agent.a",
  }),
  invitePersona({
    actionIds: ["zoen.definition.activate"],
    actorId: "actor.agent.b",
    id: "agent-b",
    principalId: "principal.agent.b",
    resourceIds: [entityId],
    tenantId: "tenant.b",
    workloadId: "workload.agent.b",
  }),
  invitePersona({
    actionIds: [definitionPublishActionId, "zoen.definition.activate"],
    actorId: "actor.admin.a",
    id: "admin-a",
    principalId: "principal.admin.a",
    resourceIds: wasmDefinitionIds,
    tenantId: "tenant.a",
    workloadId: "workload.admin.a",
  }),
  invitePersona({
    actionIds: [definitionPublishActionId, "zoen.definition.activate"],
    actorId: "actor.admin.b",
    id: "admin-b",
    principalId: "principal.admin.b",
    resourceIds: wasmDefinitionIds,
    tenantId: "tenant.b",
    workloadId: "workload.admin.b",
  }),
];

const repositoryRoot = process.cwd();
const fixtureDirectory = path.join(
  repositoryRoot,
  "e2e",
  "wasm-code-mode",
  "fixtures",
);
const baseUrl = e2eHttpUrl("ZOEN_E2E_ZOEND_PORT", 58_171);

export type ComputationClient = Client<typeof ComputationService>;

export interface ComponentFixture {
  bytes: Uint8Array;
  digest: string;
  name: string;
}

export interface ManifestOverrides {
  actionId?: string;
  componentInterface?: string;
  entityId?: string;
  resourceId?: string;
}

export const budgetClassStandard = "clinic.query.standard";
export const budgetClassTight = "clinic.query.tight";
export const budgetClassDeadline = "clinic.query.deadline";
export const budgetClassMemory = "clinic.query.memory";

export function computationClient(
  token: string,
  tenantId: string,
): ComputationClient {
  const authorization: Interceptor = (next) => async (request) => {
    request.header.set("authorization", `Bearer ${token}`);
    request.header.set("x-zoen-tenant", tenantId);
    return next(request);
  };
  return createClient(
    ComputationService,
    createConnectTransport({
      baseUrl,
      httpVersion: "1.1",
      interceptors: [authorization],
    }),
  );
}

export async function loadComponentFixture(
  name: string,
): Promise<ComponentFixture> {
  const bytes = await readFile(
    path.join(fixtureDirectory, `${name}.component.wasm`),
  );
  const expectedDigest = (
    await readFile(
      path.join(fixtureDirectory, `${name}.component.sha256`),
      "utf8",
    )
  ).trim();
  const digest = sha256(bytes);
  assert.equal(digest, expectedDigest);
  return { bytes, digest, name };
}

export function emptyManifest(
  interfaceName = componentInterface,
): CapabilityManifest {
  return create(CapabilityManifestSchema, {
    componentInterface: interfaceName,
  });
}

export function scopedManifest(
  definition: DefinitionReference,
  overrides: ManifestOverrides = {},
): CapabilityManifest {
  const proposedAt = new Date();
  const expiresAt = new Date(proposedAt.getTime() + 5 * 60_000);
  return create(CapabilityManifestSchema, {
    capabilities: [
      create(CapabilitySchema, {
        capability: {
          case: "query",
          value: create(QueryCapabilitySchema, {
            capabilityId: "query.available",
            definition,
            entityId: overrides.entityId ?? entityId,
            selection: create(QuerySelectionSchema, {
              value: { case: "relationId", value: relationId },
            }),
            validAt: timestampFromDate(validAt),
          }),
        },
      }),
      create(CapabilitySchema, {
        capability: {
          case: "explain",
          value: create(ExplainCapabilitySchema, {
            capabilityId: "explain.selected",
          }),
        },
      }),
      create(CapabilitySchema, {
        capability: {
          case: "action",
          value: create(ActionCapabilitySchema, {
            actionId: overrides.actionId ?? "inventory.requestStock",
            capabilityId: "action.request-stock",
            definition,
            expiresAt: timestampFromDate(expiresAt),
            proposedAt: timestampFromDate(proposedAt),
            resourceId: overrides.resourceId ?? entityId,
            validAt: timestampFromDate(validAt),
          }),
        },
      }),
    ],
    componentInterface: overrides.componentInterface ?? componentInterface,
  });
}

export async function execute(
  client: ComputationClient,
  fixture: ComponentFixture,
  executionId: string,
  input: string,
  manifest: CapabilityManifest,
  budgetClass = budgetClassStandard,
): Promise<ExecuteResponse> {
  return client.execute({
    budgetClass,
    componentDigest: fixture.digest,
    executionId,
    input: new TextEncoder().encode(input),
    manifest,
  });
}

export async function publish(
  client: ComputationClient,
  fixture: ComponentFixture,
  interfaceName = componentInterface,
) {
  return client.publishComponent({
    claimedDigest: fixture.digest,
    component: fixture.bytes,
    componentInterface: interfaceName,
  });
}

export function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}
