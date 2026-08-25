import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { create } from "@bufbuild/protobuf";
import { compileDefinition } from "../../ontology/src/index.js";
import {
  ActionCapabilitySchema,
  ApproveResponseSchema,
  CommitIdentityKind,
  CommitReceiptSchema,
  CommitResponseSchema,
  CommitStatus,
  DiscoverResponseSchema,
  PolicyDecision,
  ProposalSchema,
  ProposeResponseSchema,
  ProposalStatus,
} from "../../sdk/src/gen/zoen/action/v1/action_pb.js";
import {
  ExactValueSchema,
  LineageDependencySchema,
  LineageRole,
  QuantityValueSchema,
  SemanticQueryResponseSchema,
  SemanticValueResultSchema,
  type ExactValue,
  type SemanticQueryRequest,
} from "../../sdk/src/gen/zoen/world/v1/world_pb.js";
import { createOsdkFromCompiled } from "./client.js";
import { generateOsdkModules } from "./generator.js";
import type { OsdkActionsPort, OsdkWorld } from "./ports.js";

type _WorldHasNoBeliefWrite = "recordEvidence" extends keyof OsdkWorld
  ? false
  : true;
const worldPortHasNoBeliefWrite: _WorldHasNoBeliefWrite = true;
void worldPortHasNoBeliefWrite;

const execFileAsync = promisify(execFile);
const commercialDefinition = path.join(
  process.cwd(),
  "packages",
  "ontology",
  "fixtures",
  "commercial.zoen.ts",
);
const validAt = new Date("2026-08-25T00:00:00.000Z");
const expiresAt = new Date("2026-08-25T00:05:00.000Z");

test("generated OSDK typechecks objects.OrderLine and a link accessor", async () => {
  const compiled = await compileDefinition(commercialDefinition);
  const modules = generateOsdkModules(compiled);

  assert.match(modules.files["objects.ts"], /export interface OsdkObjects/);
  assert.match(modules.files["objects.ts"], /readonly OrderLine: TypeQuery<OrderLine>/);
  assert.match(
    modules.files["objects.ts"],
    /readonly requestReference: \(\) => Promise<string \| null>/,
  );
  assert.match(
    modules.files["objects.ts"],
    /readonly commitmentReference: \(\) => Promise<readonly string\[\]>/,
  );
  assert.match(modules.files["objects.ts"], /readonly quotedUnitPrice: ClaimRead/);
  assert.match(
    modules.files["objects.ts"],
    /readonly openQuantity: \(input: \{ readonly entityId: string \}\) => Promise<ClaimRead>/,
  );
  assert.match(modules.files["actions.ts"], /preview\(call:/);
  assert.match(modules.files["actions.ts"], /approvalId: string/);
  assert.match(modules.files["actions.ts"], /previewHash: string/);
  assert.match(modules.files["actions.ts"], /recordQuote/);

  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "zoen-osdk-"));
  await writeFile(
    path.join(temporaryDirectory, "objects.ts"),
    modules.files["objects.ts"],
  );
  await writeFile(
    path.join(temporaryDirectory, "actions.ts"),
    modules.files["actions.ts"],
  );
  await writeFile(
    path.join(temporaryDirectory, "index.ts"),
    modules.files["index.ts"],
  );
  await writeFile(
    path.join(temporaryDirectory, "usage.ts"),
    commercialUsageSource,
  );
  const configPath = path.join(temporaryDirectory, "tsconfig.json");
  await writeFile(
    configPath,
    JSON.stringify({
      compilerOptions: {
        noEmit: true,
        rootDir: path.parse(process.cwd()).root,
        typeRoots: [path.join(process.cwd(), "node_modules", "@types")],
      },
      extends: path.join(process.cwd(), "tsconfig.json"),
      files: [
        path.join(temporaryDirectory, "objects.ts"),
        path.join(temporaryDirectory, "actions.ts"),
        path.join(temporaryDirectory, "index.ts"),
        path.join(temporaryDirectory, "usage.ts"),
      ],
      include: [],
    }),
  );

  try {
    await execFileAsync(
      process.execPath,
      [
        path.join(process.cwd(), "node_modules", "typescript", "bin", "tsc"),
        "--project",
        configPath,
      ],
      { cwd: process.cwd() },
    );
  } catch (error: unknown) {
    throw new Error(`generated OSDK typecheck failed:\n${commandOutput(error)}`, {
      cause: error,
    });
  }
});

test("preview and commit are distinct; commit uses Action+Cedar, not World writes", async () => {
  const compiled = await compileDefinition(commercialDefinition);
  const calls: string[] = [];
  const osdk = createOsdkFromCompiled(compiled, {
    actions: fakeActions(calls, ProposalStatus.READY),
    tenantId: "tenant.a",
    validAt,
    world: fakeWorld(calls),
  });
  const orderLines = osdk.objects.OrderLine;
  assert.ok(orderLines);
  const line = await orderLines.fetch("commercial.orderLine.1");
  assert.equal(line.typeId, "commercial.OrderLine");
  assert.equal(line.entityId, "commercial.orderLine.1");
  const quotedUnitPrice = line.values.quotedUnitPrice;
  if (quotedUnitPrice === undefined || Array.isArray(quotedUnitPrice)) {
    throw new Error("quotedUnitPrice must be a single ClaimRead");
  }
  assert.deepEqual(quotedUnitPrice.value, {
    kind: "decimal",
    value: "19.99",
  });
  assert.equal(quotedUnitPrice.entityId, "commercial.orderLine.1");
  assert.deepEqual(quotedUnitPrice.lineage, [
    {
      claimId: "claim.quotedUnitPrice.1",
      commitSequence: 1n,
      entityId: "commercial.orderLine.1",
      relationId: "commercial.quotedUnitPrice",
      role: LineageRole.SUPPORTING,
      sourceId: "",
    },
  ]);

  const queryOpenQuantity = osdk.computations.openQuantity;
  assert.ok(queryOpenQuantity);
  const openQuantity = await queryOpenQuantity({
    entityId: "commercial.orderLine.1",
  });
  assert.deepEqual(openQuantity.value, {
    amount: "3",
    kind: "quantity",
    unit: "each",
  });
  assert.equal(
    openQuantity.lineage[0]?.role,
    LineageRole.COMPUTATION_DEPENDENCY,
  );

  const discovered = await osdk.discover({
    resourceId: "commercial.orderLine.1",
  });
  assert.deepEqual(discovered, [
    {
      actionId: "commercial.recordQuote",
      decision: PolicyDecision.PERMIT,
      evaluationError: "",
    },
  ]);

  const requestLink = line.links.requestReference;
  if (requestLink === undefined) {
    throw new Error("requestReference walk is missing");
  }
  const requestId = await requestLink();
  assert.equal(requestId, "commercial.request.1");

  const recordQuote = osdk.actions.recordQuote;
  assert.ok(recordQuote);
  assert.notEqual(recordQuote.preview, recordQuote.commit);

  calls.length = 0;
  const preview = await recordQuote.preview({
    expiresAt,
    inputs: {
      quoteReference: { kind: "entity", value: "commercial.quote.1" },
    },
    operationId: "operation.preview",
    proposalId: "proposal.preview",
    resourceId: "commercial.orderLine.1",
    validAt,
  });
  assert.deepEqual(preview, {
    kind: "permit",
    previewHash: "a".repeat(64),
    previewText: "Vou executar recordQuote.",
    proposalId: "proposal.preview",
    status: "ready",
  });
  assert.deepEqual(calls, ["action.propose"]);

  calls.length = 0;
  const committed = await recordQuote.commit({
    approvalId: "approval.commit",
    expiresAt,
    inputs: {
      quoteReference: { kind: "entity", value: "commercial.quote.1" },
    },
    operationId: "operation.commit",
    previewHash: "a".repeat(64),
    proposalId: "proposal.commit",
    resourceId: "commercial.orderLine.1",
    validAt,
  });
  assert.deepEqual(committed, {
    kind: "committed",
    operationId: "operation.commit",
    previewText: "Vou executar recordQuote.",
    recordIds: ["record.1"],
  });
  assert.deepEqual(calls, ["action.propose", "action.commit"]);
});

test("commit reports preview_mismatch without mutating", async () => {
  const compiled = await compileDefinition(commercialDefinition);
  const calls: string[] = [];
  const osdk = createOsdkFromCompiled(compiled, {
    actions: {
      ...fakeActions(calls, ProposalStatus.READY),
      async commit(request) {
        calls.push("action.commit");
        assert.match(request.previewHash, /^[0-9a-f]{64}$/);
        return create(CommitResponseSchema, {
          collisionKind: CommitIdentityKind.UNSPECIFIED,
          error: "preview hash does not match the stored proposal",
          status: CommitStatus.PREVIEW_MISMATCH,
        });
      },
    },
    tenantId: "tenant.a",
    validAt,
    world: fakeWorld(calls),
  });
  const recordQuote = osdk.actions.recordQuote;
  assert.ok(recordQuote);
  const rejected = await recordQuote.commit({
    approvalId: "approval.commit",
    expiresAt,
    inputs: {
      quoteReference: { kind: "entity", value: "commercial.quote.1" },
    },
    operationId: "operation.commit",
    previewHash: "a".repeat(64),
    proposalId: "proposal.commit",
    resourceId: "commercial.orderLine.1",
    validAt,
  });
  assert.deepEqual(rejected, {
    kind: "preview_mismatch",
    message: "preview hash does not match the stored proposal",
  });
  assert.deepEqual(calls, ["action.propose", "action.commit"]);
});

test("commit without a presented previewHash fails closed", async () => {
  const compiled = await compileDefinition(commercialDefinition);
  const calls: string[] = [];
  const osdk = createOsdkFromCompiled(compiled, {
    actions: fakeActions(calls, ProposalStatus.READY),
    tenantId: "tenant.a",
    validAt,
    world: fakeWorld(calls),
  });
  const recordQuote = osdk.actions.recordQuote;
  assert.ok(recordQuote);
  const rejected = await recordQuote.commit({
    approvalId: "approval.commit",
    expiresAt,
    inputs: {
      quoteReference: { kind: "entity", value: "commercial.quote.1" },
    },
    operationId: "operation.commit",
    previewHash: "",
    proposalId: "proposal.commit",
    resourceId: "commercial.orderLine.1",
    validAt,
  });
  assert.deepEqual(rejected, {
    kind: "preview_mismatch",
    message: "preview hash does not match the stored proposal",
  });
  assert.deepEqual(calls, ["action.propose"]);
});

test("commit refuses a confirmed hash that does not match Propose", async () => {
  const compiled = await compileDefinition(commercialDefinition);
  const calls: string[] = [];
  const osdk = createOsdkFromCompiled(compiled, {
    actions: fakeActions(calls, ProposalStatus.READY),
    tenantId: "tenant.a",
    validAt,
    world: fakeWorld(calls),
  });
  const recordQuote = osdk.actions.recordQuote;
  assert.ok(recordQuote);
  const rejected = await recordQuote.commit({
    approvalId: "approval.commit",
    expiresAt,
    inputs: {
      quoteReference: { kind: "entity", value: "commercial.quote.1" },
    },
    operationId: "operation.commit",
    previewHash: "b".repeat(64),
    proposalId: "proposal.commit",
    resourceId: "commercial.orderLine.1",
    validAt,
  });
  assert.deepEqual(rejected, {
    kind: "preview_mismatch",
    message: "preview hash does not match the stored proposal",
  });
  assert.deepEqual(calls, ["action.propose"]);
});

test("commit approves when the proposal is awaiting approval", async () => {
  const compiled = await compileDefinition(commercialDefinition);
  const calls: string[] = [];
  const osdk = createOsdkFromCompiled(compiled, {
    actions: fakeActions(calls, ProposalStatus.AWAITING_APPROVAL),
    tenantId: "tenant.a",
    validAt,
    world: fakeWorld(calls),
  });
  const recordQuote = osdk.actions.recordQuote;
  assert.ok(recordQuote);
  const committed = await recordQuote.commit({
    approvalId: "approval.commit",
    expiresAt,
    inputs: {
      quoteReference: { kind: "entity", value: "commercial.quote.1" },
    },
    operationId: "operation.commit",
    previewHash: "a".repeat(64),
    proposalId: "proposal.commit",
    resourceId: "commercial.orderLine.1",
    validAt,
  });
  assert.equal(committed.kind, "committed");
  assert.deepEqual(calls, ["action.propose", "action.approve", "action.commit"]);
});

const commercialUsageSource = `import type { ClaimRead } from "@zoen/osdk";
import type { OrderLine, OsdkComputations, OsdkObjects } from "./objects.js";
import type { OsdkActions } from "./actions.js";

type OrderLineSet = OsdkObjects["OrderLine"];
type FetchedOrderLine = Awaited<ReturnType<OrderLineSet["fetch"]>>;
type RequestLink = FetchedOrderLine["links"]["requestReference"];
type CommitmentLink = FetchedOrderLine["links"]["commitmentReference"];
type QuotedPrice = FetchedOrderLine["values"]["quotedUnitPrice"];
type Preview = OsdkActions["recordQuote"]["preview"];
type Commit = OsdkActions["recordQuote"]["commit"];

type _FetchedIsOrderLine = FetchedOrderLine extends OrderLine ? true : false;
const fetchedIsOrderLine: _FetchedIsOrderLine = true;

type _HasSingleLink = RequestLink extends () => Promise<string | null>
  ? true
  : false;
const hasSingleLink: _HasSingleLink = true;

type _HasManyLink = CommitmentLink extends () => Promise<readonly string[]>
  ? true
  : false;
const hasManyLink: _HasManyLink = true;

type _PriceIsClaimRead = QuotedPrice extends ClaimRead ? true : false;
const priceIsClaimRead: _PriceIsClaimRead = true;

type OpenQuantity = OsdkComputations["openQuantity"];
type _OpenNeedsEntity = Parameters<OpenQuantity>[0] extends {
  readonly entityId: string;
}
  ? true
  : false;
const openNeedsEntity: _OpenNeedsEntity = true;
type _OpenReturnsClaim = Awaited<ReturnType<OpenQuantity>> extends ClaimRead
  ? true
  : false;
const openReturnsClaim: _OpenReturnsClaim = true;

type _Distinct = Preview extends Commit
  ? Commit extends Preview
    ? false
    : true
  : true;
const previewAndCommitAreDistinct: _Distinct = true;

export function typecheck(objects: OsdkObjects, actions: OsdkActions): void {
  const orderLines = objects.OrderLine;
  void orderLines.fetch;
  void orderLines.ids;
  void actions.recordQuote.preview;
  void actions.recordQuote.commit;
  void fetchedIsOrderLine;
  void hasSingleLink;
  void hasManyLink;
  void priceIsClaimRead;
  void openNeedsEntity;
  void openReturnsClaim;
  void previewAndCommitAreDistinct;
}
`;

function commandOutput(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const stdout = Reflect.get(error, "stdout");
    const stderr = Reflect.get(error, "stderr");
    const output = [stdout, stderr]
      .filter((value) => typeof value === "string" && value.length > 0)
      .join("\n");
    if (output.length > 0) {
      return output;
    }
  }
  return error instanceof Error ? error.message : String(error);
}

function fakeWorld(calls: string[]): OsdkWorld {
  return {
    async semanticQuery(request: SemanticQueryRequest) {
      calls.push("world.semanticQuery");
      if (request.query.case === "byType") {
        return queryResponse(
          "commercial.orderLine.1",
          create(ExactValueSchema, {
            value: {
              case: "entityRefValue",
              value: "commercial.orderLine.1",
            },
          }),
        );
      }
      if (request.selection?.value.case === "computationId") {
        return claimsForComputation(
          request.selection.value.value,
          request.entityId,
        );
      }
      if (request.selection?.value.case === "relationId") {
        return claimsForRelation(
          request.selection.value.value,
          request.entityId,
        );
      }
      return create(SemanticQueryResponseSchema, {
        actualCommitSequence: 0n,
        knowledgeCut: 0n,
        values: [],
      });
    },
  };
}

function claimsForComputation(computationId: string, entityId: string) {
  switch (computationId) {
    case "commercial.openQuantity":
      return queryResponse(
        entityId,
        create(ExactValueSchema, {
          value: {
            case: "quantityValue",
            value: create(QuantityValueSchema, {
              amount: "3",
              unit: "each",
            }),
          },
        }),
        {
          claimId: "claim.committedQuantity.1",
          relationId: "commercial.committedQuantity",
          role: LineageRole.COMPUTATION_DEPENDENCY,
        },
      );
    default:
      return create(SemanticQueryResponseSchema, {
        actualCommitSequence: 0n,
        knowledgeCut: 0n,
        values: [],
      });
  }
}

function claimsForRelation(relationId: string, entityId: string) {
  switch (relationId) {
    case "commercial.quotedUnitPrice":
      return queryResponse(
        entityId,
        create(ExactValueSchema, {
          value: { case: "decimalValue", value: "19.99" },
        }),
        {
          claimId: "claim.quotedUnitPrice.1",
          relationId: "commercial.quotedUnitPrice",
          role: LineageRole.SUPPORTING,
        },
      );
    case "commercial.requestReference":
      return queryResponse(
        entityId,
        create(ExactValueSchema, {
          value: {
            case: "entityRefValue",
            value: "commercial.request.1",
          },
        }),
        {
          claimId: "claim.requestReference.1",
          relationId: "commercial.requestReference",
          role: LineageRole.SUPPORTING,
        },
      );
    default:
      return create(SemanticQueryResponseSchema, {
        actualCommitSequence: 0n,
        knowledgeCut: 0n,
        values: [],
      });
  }
}

function queryResponse(
  entityId: string,
  value: ExactValue,
  lineage?: {
    readonly claimId: string;
    readonly relationId: string;
    readonly role: LineageRole;
  },
) {
  return create(SemanticQueryResponseSchema, {
    actualCommitSequence: 0n,
    knowledgeCut: 0n,
    values: [
      create(SemanticValueResultSchema, {
        dependencies: [
          create(LineageDependencySchema, {
            claimId: lineage?.claimId ?? "",
            commitSequence: lineage === undefined ? 0n : 1n,
            entityId,
            relationId: lineage?.relationId ?? "",
            role: lineage?.role ?? LineageRole.UNSPECIFIED,
          }),
        ],
        value,
      }),
    ],
  });
}

function fakeActions(
  calls: string[],
  status: ProposalStatus,
): OsdkActionsPort {
  return {
    async approve() {
      calls.push("action.approve");
      return create(ApproveResponseSchema, {
        decision: PolicyDecision.PERMIT,
        evaluationError: "",
      });
    },
    async commit(request) {
      calls.push("action.commit");
      return create(CommitResponseSchema, {
        collisionKind: CommitIdentityKind.UNSPECIFIED,
        error: "",
        receipt: create(CommitReceiptSchema, {
          operationId: request.operationId,
          recordIds: ["record.1"],
        }),
        status: CommitStatus.COMMITTED,
      });
    },
    async discover() {
      calls.push("action.discover");
      return create(DiscoverResponseSchema, {
        actions: [
          create(ActionCapabilitySchema, {
            actionId: "commercial.recordQuote",
            decision: PolicyDecision.PERMIT,
            evaluationError: "",
          }),
        ],
      });
    },
    async propose(request) {
      calls.push("action.propose");
      return create(ProposeResponseSchema, {
        decision: PolicyDecision.PERMIT,
        evaluationError: "",
        proposal: create(ProposalSchema, {
          canonicalPreviewText: "Vou executar recordQuote.",
          operationId: request.operationId,
          previewHash: "a".repeat(64),
          proposalId: request.proposalId,
          status,
        }),
      });
    },
  };
}
