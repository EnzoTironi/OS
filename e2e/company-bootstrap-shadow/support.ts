import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import {
  e2eGeneratedDirectory,
  e2eHttpUrl,
} from "../host-env.js";
import {
  activateDefinition,
  definitionClient,
  oidcToken,
  publishDefinition,
  startServer,
  stopServer,
  worldClient,
  type DefinitionFixture,
  type ServerProcess,
} from "../governed-action/support.js";
import {
  DefinitionReferenceSchema,
  EvidenceClaimSchema,
  EvidenceProvenanceSchema,
  ExactValueSchema,
  QueryConsistencySchema,
  QuerySelectionSchema,
  StrongConsistencySchema,
  ValidTimeSchema,
  type SemanticQueryResponse,
} from "../../gen/connect/zoen/world/v1/world_pb.js";

export const scenario = "company-bootstrap-shadow";
export const repositoryRoot = process.cwd();
export const generatedDirectory = e2eGeneratedDirectory(
  repositoryRoot,
  scenario,
);
export const baseUrl = e2eHttpUrl("ZOEN_E2E_ZOEND_PORT", 58_581);
export const enterpriseTenant = "tenant.sample.enterprise";
export const sampleItemId = "product.item.1";
export const sampleValidAt = new Date("2026-08-20T00:00:00.000Z");
export const actionId = "commercial.changeCommitment";

export {
  activateDefinition,
  definitionClient,
  oidcToken,
  publishDefinition,
  startServer,
  stopServer,
  worldClient,
  type DefinitionFixture,
  type ServerProcess,
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function writePolicyManifest(
  outputPath: string,
  definitionDigest: string,
  mode: "shadow" | "human_approval" = "shadow",
): Promise<{
  readonly actionPolicyDigest: string;
  readonly activationDigest: string;
  readonly mode: "shadow" | "human_approval";
}> {
  const actionSource = await readFile(
    path.join(
      repositoryRoot,
      "e2e",
      scenario,
      mode === "shadow" ? "shadow.cedar" : "human-approval.cedar",
    ),
    "utf8",
  );
  const activationSource = await readFile(
    path.join(repositoryRoot, "e2e", scenario, "activation.cedar"),
    "utf8",
  );
  const actionPolicyDigest = sha256(actionSource);
  const activationDigest = sha256(activationSource);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify(
      {
        policies: [
          {
            actionId,
            definitionDigest,
            digest: actionPolicyDigest,
            policyId:
              mode === "shadow"
                ? "policy.shadow.commercial"
                : "policy.human.commercial",
            revision: 1,
            source: actionSource,
          },
          {
            actionId: "zoen.definition.activate",
            definitionDigest,
            digest: activationDigest,
            policyId: "policy.activation.bootstrap",
            revision: 1,
            source: activationSource,
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  return { actionPolicyDigest, activationDigest, mode };
}

export async function recordOnHand(input: {
  readonly token: string;
  readonly fixture: DefinitionFixture;
  readonly claimId: string;
  readonly value: string;
  readonly sourceId: string;
  readonly sourceDigest: string;
}): Promise<void> {
  const world = worldClient(input.token);
  await world.recordEvidence({
    claim: create(EvidenceClaimSchema, {
      claimId: input.claimId,
      definition: input.fixture.definition,
      entityId: sampleItemId,
      provenance: create(EvidenceProvenanceSchema, {
        sourceDigest: input.sourceDigest,
        sourceId: input.sourceId,
        sourceRef: `urn:zoen:bootstrap:${input.claimId}`,
      }),
      relationId: "inventory.onHand",
      validTime: create(ValidTimeSchema, {
        value: {
          case: "instant",
          value: timestampFromDate(sampleValidAt),
        },
      }),
      value: create(ExactValueSchema, {
        value: { case: "integerValue", value: input.value },
      }),
    }),
    tenantId: enterpriseTenant,
  });
}

export async function runSemanticQuery(
  token: string,
  fixture: DefinitionFixture,
): Promise<SemanticQueryResponse> {
  const world = worldClient(token);
  return world.semanticQuery({
    consistency: create(QueryConsistencySchema, {
      value: {
        case: "strong",
        value: create(StrongConsistencySchema),
      },
    }),
    definition: fixture.definition,
    entityId: sampleItemId,
    selection: create(QuerySelectionSchema, {
      value: { case: "relationId", value: "inventory.onHand" },
    }),
    tenantId: enterpriseTenant,
    validAt: timestampFromDate(sampleValidAt),
  });
}

export function definitionFixtureFromCompiled(compiled: {
  readonly digest: string;
  readonly canonicalJson: string;
  readonly definition: { readonly definitionId: string; readonly revision: number };
}): DefinitionFixture {
  return {
    canonicalJson: compiled.canonicalJson,
    definition: create(DefinitionReferenceSchema, {
      definitionId: compiled.definition.definitionId,
      digest: compiled.digest,
      revision: BigInt(compiled.definition.revision),
    }),
    digest: compiled.digest,
    policyDigest: "",
    policyId: "policy.shadow.commercial",
    policyRevision: 1,
    policySource: "",
  };
}

/** Messy ERP+spreadsheet schema for Company Brain inspect. */
export function messyEnterpriseSchema(): {
  readonly sourceId: string;
  readonly sourceRevision: string;
  readonly contentDigest: string;
  readonly schemaDigest: string;
  readonly fields: ReadonlyArray<{
    readonly fieldId: string;
    readonly path: string;
    readonly valueKindHint: "text" | "number" | "date" | "entity_ref";
  }>;
  readonly workspaceClass: "enterprise";
} {
  const fields = [
    {
      fieldId: "ERP.B1_COD",
      path: "OITM.ItemCode",
      valueKindHint: "text" as const,
    },
    {
      fieldId: "spreadsheet.SKU",
      path: "Sheet1.SKU",
      valueKindHint: "text" as const,
    },
    {
      fieldId: "stock.qty",
      path: "OITW.OnHand",
      valueKindHint: "number" as const,
    },
    {
      fieldId: "order.promise_date",
      path: "ORDR.DocDueDate",
      valueKindHint: "date" as const,
    },
  ];
  const schemaDigest = sha256(
    JSON.stringify(
      fields.map((f) => ({ fieldId: f.fieldId, path: f.path, kind: f.valueKindHint })),
    ),
  );
  const contentDigest = sha256("erp+spreadsheet://sample-company/v3");
  return {
    sourceId: "source.erp.sample",
    sourceRevision: "rev-2026-08-20",
    contentDigest,
    schemaDigest,
    fields,
    workspaceClass: "enterprise",
  };
}
