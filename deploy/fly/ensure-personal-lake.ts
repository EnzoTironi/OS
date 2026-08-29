import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { createClient, type Interceptor } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import { compileDefinition } from "../../packages/ontology/src/index.js";
import { DefinitionService } from "../../packages/sdk/src/gen/zoen/definition/v1/definition_pb.js";
import {
  DefinitionReferenceSchema,
  EvidenceClaimSchema,
  EvidenceProvenanceSchema,
  ExactValueSchema,
  QueryConsistencySchema,
  QuerySelectionSchema,
  QuantityValueSchema,
  StrongConsistencySchema,
  ValidTimeSchema,
  WorldService,
  type DefinitionReference,
} from "../../packages/sdk/src/gen/zoen/world/v1/world_pb.js";

const COMMERCIAL_ENTITY = "commercial.order-line.dirty-quote";
const QUOTED_QUANTITY = "commercial.quotedQuantity";

/**
 * Fly prestart: Publish+Activate personal.memory and commercial.sales,
 * then plant two quotedQuantity rivals. Speaker stays Propose→Commit.
 * Requires ZOEN_TENANT_ID (no default).
 */
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
  const world = createClient(WorldService, transport);

  const personal = await compileDefinition(personalPath);
  await publishAndActivate(definitions, personal, tenantId);
  writeReady(personalReady, {
    definitionId: personal.definition.definitionId,
    digest: personal.digest,
    event: "personalLakeReady",
  });

  const commercial = await compileDefinition(commercialPath);
  await publishAndActivate(definitions, commercial, tenantId);
  const rivals = await ensureQuotedQuantityRivals(
    world,
    wireDefinition(commercial),
    tenantId,
  );
  writeReady(commercialReady, {
    definitionId: commercial.definition.definitionId,
    digest: commercial.digest,
    event: "commercialLakeReady",
    rivals,
  });
}

async function publishAndActivate(
  definitions: ReturnType<typeof createClient<typeof DefinitionService>>,
  compiled: Awaited<ReturnType<typeof compileDefinition>>,
  tenantId: string,
): Promise<void> {
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
  if (currentDigest === compiled.digest) {
    return;
  }
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

async function ensureQuotedQuantityRivals(
  world: ReturnType<typeof createClient<typeof WorldService>>,
  definition: DefinitionReference,
  tenantId: string,
): Promise<number> {
  const existing = await quotedQuantityCount(world, definition, tenantId);
  if (existing >= 2) {
    return existing;
  }
  await recordQuantity(world, definition, tenantId, {
    amount: "10",
    claimId: "claim.quote.sheet",
    sourceId: "source.sheet",
  });
  await recordQuantity(world, definition, tenantId, {
    amount: "12",
    claimId: "claim.quote.erp",
    sourceId: "source.erp",
  });
  return quotedQuantityCount(world, definition, tenantId);
}

async function quotedQuantityCount(
  world: ReturnType<typeof createClient<typeof WorldService>>,
  definition: DefinitionReference,
  tenantId: string,
): Promise<number> {
  const response = await world.semanticQuery({
    consistency: create(QueryConsistencySchema, {
      value: { case: "strong", value: create(StrongConsistencySchema) },
    }),
    definition,
    entityId: COMMERCIAL_ENTITY,
    selection: create(QuerySelectionSchema, {
      value: { case: "relationId", value: QUOTED_QUANTITY },
    }),
    tenantId,
    validAt: timestampFromDate(new Date()),
  });
  return response.values.filter(
    (row) => row.value?.value.case === "quantityValue",
  ).length;
}

async function recordQuantity(
  world: ReturnType<typeof createClient<typeof WorldService>>,
  definition: DefinitionReference,
  tenantId: string,
  input: { readonly amount: string; readonly claimId: string; readonly sourceId: string },
): Promise<void> {
  await world.recordEvidence({
    claim: create(EvidenceClaimSchema, {
      claimId: input.claimId,
      definition,
      entityId: COMMERCIAL_ENTITY,
      provenance: create(EvidenceProvenanceSchema, {
        sourceDigest: createHash("sha256")
          .update(`${input.sourceId}:${input.claimId}`)
          .digest("hex"),
        sourceId: input.sourceId,
        sourceRef: `urn:zoen:fly:${input.claimId}`,
      }),
      relationId: QUOTED_QUANTITY,
      validTime: create(ValidTimeSchema, {
        value: { case: "instant", value: timestampFromDate(new Date()) },
      }),
      value: create(ExactValueSchema, {
        value: {
          case: "quantityValue",
          value: create(QuantityValueSchema, {
            amount: input.amount,
            unit: "each",
          }),
        },
      }),
    }),
    tenantId,
  });
}

function wireDefinition(
  compiled: Awaited<ReturnType<typeof compileDefinition>>,
): DefinitionReference {
  return create(DefinitionReferenceSchema, {
    definitionId: compiled.definition.definitionId,
    digest: compiled.digest,
    revision: BigInt(compiled.definition.revision),
  });
}

function writeReady(
  path: string,
  payload: Record<string, string | number>,
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
