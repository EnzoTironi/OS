import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { PolicyDecision } from "../../packages/sdk/src/gen/zoen/action/v1/action_pb.js";
import {
  EventualConsistencySchema,
  EvidenceClaimSchema,
  EvidenceProvenanceSchema,
  QueryConsistencySchema,
  QuerySelectionSchema,
  StrongConsistencySchema,
  ValidTimeSchema,
  type DefinitionReference,
  type EvidenceClaim,
  type ExactValue,
} from "../../packages/sdk/src/gen/zoen/world/v1/world_pb.js";
import {
  actionClient,
  adminClient,
  command,
  compileDefinition,
  definitionClient,
  definitionId,
  definitionReference,
  fixtureDirectory,
  historyClient,
  oidcToken,
  publish,
  rebuildProjection,
  repositoryRoot,
  resourceId,
  sha256,
  startServer,
  stopServer,
  tenantA,
  tenantB,
  worldClient,
  type ActionClient,
  type CompiledDefinition,
  type DefinitionClient,
  type ServerProcess,
  type WorldClient,
} from "../evolution-compatible/support.js";

export {
  actionClient,
  adminClient,
  command,
  compileDefinition,
  definitionClient,
  definitionId,
  definitionReference,
  fixtureDirectory,
  historyClient,
  oidcToken,
  publish,
  rebuildProjection,
  repositoryRoot,
  resourceId,
  sha256,
  startServer,
  stopServer,
  tenantA,
  tenantB,
  worldClient,
};
export type {
  ActionClient,
  CompiledDefinition,
  DefinitionClient,
  ServerProcess,
  WorldClient,
};

export const scenarioDirectory = path.join(
  repositoryRoot,
  "e2e",
  "evolution-breaking",
);
export const generatedDirectory = path.join(
  scenarioDirectory,
  ".generated",
);
export const validAt = new Date("2026-08-19T00:00:00.000Z");

export async function writePolicyManifest(
  outputPath: string,
  definitions: readonly CompiledDefinition[],
): Promise<void> {
  const lifecycleSource = await readFile(
    path.join(scenarioDirectory, "lifecycle.cedar"),
    "utf8",
  );
  const actionSource = await readFile(
    path.join(scenarioDirectory, "action.cedar"),
    "utf8",
  );
  const policies = definitions.flatMap((definition) => {
    const revision = definition.definition.revision;
    return [
      {
        actionId: "inventory.replenish",
        definitionDigest: definition.digest,
        digest: sha256(actionSource),
        policyId: `policy.replenish.v${revision}`,
        revision,
        source: actionSource,
      },
      ...[
        "zoen.definition.activate",
        "zoen.definition.migrate",
        "zoen.definition.rollback",
      ].map((actionId) => ({
        actionId,
        definitionDigest: definition.digest,
        digest: sha256(lifecycleSource),
        policyId: `policy.${actionId.split(".").at(-1)}.v${revision}`,
        revision,
        source: lifecycleSource,
      })),
    ];
  });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify({ policies }, null, 2)}\n`,
  );
}

export async function recordEvidence(
  client: WorldClient,
  definition: DefinitionReference,
  relationId: string,
  value: ExactValue,
  claimId: string,
  tenantId = tenantA,
): Promise<bigint> {
  const response = await client.recordEvidence({
    claim: evidenceClaim(definition, relationId, value, claimId),
    tenantId,
  });
  assert.equal(response.claimId, claimId);
  return response.commitSequence;
}

export function evidenceClaim(
  definition: DefinitionReference,
  relationId: string,
  value: ExactValue,
  claimId: string,
): EvidenceClaim {
  return create(EvidenceClaimSchema, {
    claimId,
    definition,
    entityId: resourceId,
    provenance: create(EvidenceProvenanceSchema, {
      sourceDigest: sha256(claimId),
      sourceId: "source.evolutionBreaking",
      sourceRef: `urn:zoen:evolution-breaking:${claimId}`,
    }),
    relationId,
    validTime: create(ValidTimeSchema, {
      value: {
        case: "instant",
        value: timestampFromDate(validAt),
      },
    }),
    value,
  });
}

export async function commitAction(
  client: ActionClient,
  definition: DefinitionReference,
  suffix: string,
  inputId: string,
  value: ExactValue,
) {
  const request = actionProposal(definition, suffix, inputId, value);
  const proposed = await client.propose(request);
  assert.equal(proposed.decision, PolicyDecision.PERMIT);
  assert.ok(proposed.proposal);
  const committed = await client.commit({
    operationId: request.operationId,
    proposalId: request.proposalId,
  });
  assert.ok(committed.receipt);
  return committed.receipt;
}

export function actionProposal(
  definition: DefinitionReference,
  suffix: string,
  inputId: string,
  value: ExactValue,
) {
  return {
    actionId: "inventory.replenish",
    definition,
    expiresAt: timestampFromDate(new Date(Date.now() + 300_000)),
    inputs: [{ inputId, value }],
    operationId: `operation.${suffix}`,
    proposalId: `proposal.${suffix}`,
    resourceId,
    validAt: timestampFromDate(validAt),
  };
}

export async function queryValues(
  client: WorldClient,
  definition: DefinitionReference,
  relationId: string,
  consistency: "eventual" | "strong" = "strong",
) {
  return client.semanticQuery({
    consistency: create(QueryConsistencySchema, {
      value:
        consistency === "strong"
          ? {
              case: "strong",
              value: create(StrongConsistencySchema),
            }
          : {
              case: "eventual",
              value: create(EventualConsistencySchema),
            },
    }),
    definition,
    entityId: resourceId,
    selection: create(QuerySelectionSchema, {
      value: { case: "relationId", value: relationId },
    }),
    tenantId: tenantA,
    validAt: timestampFromDate(validAt),
  });
}

export async function queryValue(
  client: WorldClient,
  definition: DefinitionReference,
  relationId: string,
  consistency: "eventual" | "strong" = "strong",
) {
  const response = await queryValues(
    client,
    definition,
    relationId,
    consistency,
  );
  assert.equal(response.values.length, 1);
  assert.ok(response.values[0]?.value);
  return {
    dependencies: response.values[0].dependencies,
    definition: response.definition,
    value: response.values[0].value,
  };
}

export async function expectProjectionFailure(tenantId: string): Promise<void> {
  const workerPath = path.join(
    repositoryRoot,
    "target",
    "debug",
    "zoen-projection",
  );
  await assert.rejects(
    command(workerPath, ["--rebuild", tenantId], {
      ...process.env,
      DATABASE_URL: "postgres://zoen_app:zoen_app@127.0.0.1:55438/zoen",
      S3_ACCESS_KEY_ID: "zoen-access",
      S3_ALLOW_HTTP: "true",
      S3_BUCKET: "missing-projection-bucket",
      S3_ENDPOINT: "http://127.0.0.1:59005",
      S3_REGION: "us-east-1",
      S3_SECRET_ACCESS_KEY: "zoen-secret",
    }),
  );
}

export function composeOutput(...arguments_: string[]): Promise<string> {
  return command("docker", [
    "compose",
    "--project-name",
    "zoen-evolution-breaking",
    "--file",
    path.join("e2e", "evolution-breaking", "compose.yaml"),
    ...arguments_,
  ]);
}
