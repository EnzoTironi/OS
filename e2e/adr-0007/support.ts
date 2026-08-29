import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import {
  QueryConsistencySchema,
  QuerySelectionSchema,
  StrongConsistencySchema,
  TypeQuerySchema,
  type DefinitionReference,
  type SemanticQueryResponse,
} from "../../gen/connect/zoen/world/v1/world_pb.js";
import type { Client as PostgresClient } from "pg";
import { e2eGeneratedDirectory } from "../host-env.js";
import {
  compilePackage,
  proposalRequest,
  recordEvidence,
  repositoryRoot,
  tenantA,
  type DomainFixture,
  type WorldClient,
} from "../domain-commercial/support.js";
import {
  delay,
  sha256,
  waitForProviderOperation,
  waitForState,
} from "../effects/scenario.js";
import {
  actionId,
  activationActionId,
  correctionEntityId,
  erpClaimId,
  erpSourceId,
  quantityRelationId,
  resourceId,
  scenario,
  sheetClaimId,
  sheetSourceId,
  validAt,
} from "./ids.js";

export {
  actionClient,
  activateDefinition,
  adminClient,
  compilePackage,
  definitionClient,
  dispatchOnce,
  effectClient,
  oidcToken,
  proposalRequest,
  publishDefinition,
  recordEvidence,
  registerWorker,
  repositoryRoot,
  setProviderMode,
  startConnector,
  startFaultProvider,
  startWorker,
  stopProcess,
  tenantA,
  tenantB,
  valueShapes,
  worldClient,
} from "../domain-commercial/support.js";
export {
  oidcAudience,
  oidcIssuer,
  providerOperation,
  startZoend,
} from "../effects/support.js";
export { delay, sha256, waitForProviderOperation, waitForState };
export type {
  ActionClient,
  DefinitionClient,
  DomainFixture,
  ManagedProcess,
  WorldClient,
} from "../domain-commercial/support.js";
export type { ProviderOperation } from "../effects/support.js";
export {
  actionId,
  activationActionId,
  correctionEntityId,
  quantityRelationId,
  resourceId,
  scenario,
  validAt,
} from "./ids.js";

export const generatedDirectory = e2eGeneratedDirectory(
  repositoryRoot,
  scenario,
);
const scenarioDirectory = path.join(repositoryRoot, "e2e", scenario);

export async function compileCommercial(): Promise<DomainFixture> {
  return compilePackage("commercial");
}

export async function writePolicyManifest(
  outputPath: string,
  fixture: DomainFixture,
): Promise<void> {
  const [activationSource, actionSource] = await Promise.all([
    readFile(path.join(scenarioDirectory, "activation.cedar"), "utf8"),
    readFile(path.join(scenarioDirectory, "action.cedar"), "utf8"),
  ]);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify(
      {
        policies: [
          {
            actionId,
            definitionDigest: fixture.digest,
            digest: sha256(actionSource),
            policyId: "policy.changeCommitment.r1",
            revision: fixture.metadata.revision,
            source: actionSource,
          },
          {
            actionId: activationActionId,
            definitionDigest: fixture.digest,
            digest: sha256(activationSource),
            policyId: "policy.activation.r1",
            revision: fixture.metadata.revision,
            source: activationSource,
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
}

export function changeCommitmentRequest(
  fixture: DomainFixture,
  suffix: string,
) {
  return proposalRequest({
    actionId,
    fixture,
    inputs: [
      {
        id: "correctionOf",
        value: { kind: "entity-ref", value: correctionEntityId },
      },
      {
        id: "quantity",
        value: { amount: "8", kind: "quantity", unit: "each" },
      },
      { id: "revision", value: { kind: "integer", value: "2" } },
      { id: "unitPrice", value: { kind: "decimal", value: "19.99" } },
    ],
    resourceId,
    suffix,
    validAt,
  });
}

export async function ingestQuotedQuantityRivals(
  client: WorldClient,
  fixture: DomainFixture,
): Promise<{ readonly afterErp: bigint; readonly afterSheet: bigint }> {
  const afterSheet = await recordEvidence(client, {
    claimId: sheetClaimId,
    entityId: resourceId,
    fixture,
    relationId: quantityRelationId,
    sourceId: sheetSourceId,
    sourceNamespace: scenario,
    tenantId: tenantA,
    time: { at: validAt, kind: "instant" },
    value: { amount: "10", kind: "quantity", unit: "each" },
  });
  const afterErp = await recordEvidence(client, {
    claimId: erpClaimId,
    entityId: resourceId,
    fixture,
    relationId: quantityRelationId,
    sourceId: erpSourceId,
    sourceNamespace: scenario,
    tenantId: tenantA,
    time: { at: validAt, kind: "instant" },
    value: { amount: "12", kind: "quantity", unit: "each" },
  });
  return { afterErp, afterSheet };
}

export async function ingestChangeCommitmentBasis(
  client: WorldClient,
  fixture: DomainFixture,
): Promise<void> {
  await recordEvidence(client, {
    claimId: "claim.proposed.quantity",
    entityId: resourceId,
    fixture,
    relationId: "commercial.proposedQuantity",
    sourceId: "source.customer-message",
    sourceNamespace: scenario,
    tenantId: tenantA,
    time: { at: validAt, kind: "instant" },
    value: { amount: "4", kind: "quantity", unit: "each" },
  });
  await recordEvidence(client, {
    claimId: "claim.committed.quantity",
    entityId: resourceId,
    fixture,
    relationId: "commercial.committedQuantity",
    sourceId: "source.commercial-control",
    sourceNamespace: scenario,
    tenantId: tenantA,
    time: { at: validAt, kind: "instant" },
    value: { amount: "10", kind: "quantity", unit: "each" },
  });
  await recordEvidence(client, {
    claimId: "claim.committed.unit-price",
    entityId: resourceId,
    fixture,
    relationId: "commercial.committedUnitPrice",
    sourceId: "source.commercial-control",
    sourceNamespace: scenario,
    tenantId: tenantA,
    time: { at: validAt, kind: "instant" },
    value: { kind: "decimal", value: "19.99" },
  });
  await recordEvidence(client, {
    claimId: "claim.committed.revision",
    entityId: resourceId,
    fixture,
    relationId: "commercial.commitmentRevision",
    sourceId: "source.commercial-control",
    sourceNamespace: scenario,
    tenantId: tenantA,
    time: { at: validAt, kind: "instant" },
    value: { kind: "integer", value: "1" },
  });
}

function strongConsistency() {
  return create(QueryConsistencySchema, {
    value: {
      case: "strong",
      value: create(StrongConsistencySchema),
    },
  });
}

export function queryRelation(
  client: WorldClient,
  definition: DefinitionReference,
  relationId: string,
) {
  return client.semanticQuery({
    consistency: strongConsistency(),
    definition,
    entityId: resourceId,
    selection: create(QuerySelectionSchema, {
      value: { case: "relationId", value: relationId },
    }),
    tenantId: tenantA,
    validAt: timestampFromDate(validAt),
  });
}

export function queryOrderLines(
  client: WorldClient,
  definition: DefinitionReference,
) {
  return client.semanticQuery({
    consistency: strongConsistency(),
    definition,
    entityId: "",
    query: {
      case: "byType",
      value: create(TypeQuerySchema, {
        limit: 10,
        typeId: "commercial.OrderLine",
      }),
    },
    tenantId: tenantA,
    validAt: timestampFromDate(validAt),
  });
}

export function quantityLabels(response: SemanticQueryResponse): string[] {
  return response.values
    .map((result) => {
      const value = result.value?.value;
      assert.equal(value?.case, "quantityValue");
      return `${value.value.amount} ${value.value.unit}`;
    })
    .sort();
}

export function entityIds(response: SemanticQueryResponse): string[] {
  return response.values
    .map((result) => {
      const value = result.value?.value;
      assert.equal(value?.case, "entityRefValue");
      return value.value;
    })
    .sort();
}

export function sourceIds(response: SemanticQueryResponse): string[] {
  const ids = new Set<string>();
  for (const result of response.values) {
    for (const dependency of result.dependencies) {
      if (dependency.sourceId !== "") {
        ids.add(dependency.sourceId);
      }
    }
  }
  return [...ids].sort();
}

export async function semanticClaimCount(
  admin: PostgresClient,
  relationId?: string,
): Promise<number> {
  const result =
    relationId === undefined
      ? await admin.query<{ count: string }>(
          `SELECT count(*)::text AS count
           FROM semantic_claims
           WHERE tenant_id = $1
             AND entity_id = $2`,
          [tenantA, resourceId],
        )
      : await admin.query<{ count: string }>(
          `SELECT count(*)::text AS count
           FROM semantic_claims
           WHERE tenant_id = $1
             AND entity_id = $2
             AND relation_id = $3`,
          [tenantA, resourceId, relationId],
        );
  return Number(result.rows[0]?.count ?? "0");
}
