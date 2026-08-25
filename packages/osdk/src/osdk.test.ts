import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { compileDefinition } from "../../ontology/src/index.js";
import {
  CommitStatus,
  PolicyDecision,
  ProposalStatus,
} from "../../sdk/src/gen/zoen/action/v1/action_pb.js";
import { createOsdkFromCompiled } from "./client.js";
import { generateOsdkModules } from "./generator.js";
import type { OsdkActionsPort, OsdkWorld, SemanticQueryInit } from "./ports.js";

type _WorldHasNoBeliefWrite = "recordEvidence" extends keyof OsdkWorld
  ? false
  : true;
const worldPortHasNoBeliefWrite: _WorldHasNoBeliefWrite = true;
void worldPortHasNoBeliefWrite;

const execFileAsync = promisify(execFile);
const commercialDefinition = path.join(
  process.cwd(),
  "packages",
  "commercial",
  "src",
  "commercial.zoen.ts",
);

test("generated OSDK typechecks objects.OrderLine and a link accessor", async () => {
  const compiled = await compileDefinition(commercialDefinition);
  const modules = generateOsdkModules(compiled);

  assert.match(modules.files["objects.ts"], /export interface OsdkObjects/);
  assert.match(modules.files["objects.ts"], /readonly OrderLine: ObjectSet<OrderLine>/);
  assert.match(
    modules.files["objects.ts"],
    /readonly requestReference: SingleLinkAccessor<Request>/,
  );
  assert.match(
    modules.files["objects.ts"],
    /readonly commitmentReference: ManyLinkAccessor<Commitment>/,
  );
  assert.match(modules.files["actions.ts"], /preview\(call:/);
  assert.match(modules.files["actions.ts"], /commit\(call:/);
  assert.match(modules.files["actions.ts"], /recordQuote/);
  assert.match(
    modules.files["actions.ts"],
    /never writes belief through World\.recordEvidence/,
  );

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
  const world = fakeWorld(calls);
  const actions = fakeActions(calls, ProposalStatus.READY);
  const osdk = createOsdkFromCompiled(compiled, {
    actions,
    tenantId: "tenant.a",
    world,
  });
  const orderLines = osdk.objects.OrderLine;
  assert.ok(orderLines);
  const line = await orderLines.fetch("commercial.orderLine.1");
  assert.equal(line.$typeId, "commercial.OrderLine");
  assert.equal(line.$claimProjection, true);
  assert.equal(line.$primaryKey, "commercial.orderLine.1");
  assert.deepEqual(line.props.quotedUnitPrice, "19.99");

  const requestLink = line.links.requestReference;
  assert.ok(requestLink);
  assert.ok("fetch" in requestLink);
  const request = await requestLink.fetch();
  assert.equal(request?.$typeId, "commercial.Request");
  assert.equal(request?.$primaryKey, "commercial.request.1");

  const recordQuote = osdk.actions.recordQuote;
  assert.ok(recordQuote);
  assert.notEqual(recordQuote.preview, recordQuote.commit);

  calls.length = 0;
  const preview = await recordQuote.preview({
    inputs: { quoteReference: "commercial.quote.1" },
    operationId: "operation.preview",
    proposalId: "proposal.preview",
    resourceId: "commercial.orderLine.1",
  });
  assert.deepEqual(preview, {
    kind: "permit",
    proposalId: "proposal.preview",
    status: "ready",
    wroteBelief: false,
  });
  assert.deepEqual(calls, ["action.propose"]);
  assert.ok(!calls.includes("action.commit"));
  assert.ok(!calls.includes("world.recordEvidence"));

  calls.length = 0;
  const committed = await recordQuote.commit({
    inputs: { quoteReference: "commercial.quote.1" },
    operationId: "operation.commit",
    proposalId: "proposal.commit",
    resourceId: "commercial.orderLine.1",
  });
  assert.deepEqual(committed, {
    kind: "committed",
    operationId: "operation.commit",
    recordIds: ["record.1"],
  });
  assert.deepEqual(calls, ["action.propose", "action.commit"]);
  assert.ok(!calls.includes("world.recordEvidence"));
  assert.ok(!calls.includes("action.approve"));
});

test("commit approves when the proposal is awaiting approval", async () => {
  const compiled = await compileDefinition(commercialDefinition);
  const calls: string[] = [];
  const osdk = createOsdkFromCompiled(compiled, {
    actions: fakeActions(calls, ProposalStatus.AWAITING_APPROVAL),
    tenantId: "tenant.a",
    world: fakeWorld(calls),
  });
  const recordQuote = osdk.actions.recordQuote;
  assert.ok(recordQuote);
  const committed = await recordQuote.commit({
    approvalId: "approval.commit",
    inputs: { quoteReference: "commercial.quote.1" },
    operationId: "operation.commit",
    proposalId: "proposal.commit",
    resourceId: "commercial.orderLine.1",
  });
  assert.equal(committed.kind, "committed");
  assert.deepEqual(calls, ["action.propose", "action.approve", "action.commit"]);
});

const commercialUsageSource = `import type { OrderLine, OsdkObjects } from "./objects.js";
import type { OsdkActions } from "./actions.js";

type OrderLineSet = OsdkObjects["OrderLine"];
type FetchedOrderLine = Awaited<ReturnType<OrderLineSet["fetch"]>>;
type RequestLink = FetchedOrderLine["links"]["requestReference"];
type CommitmentLink = FetchedOrderLine["links"]["commitmentReference"];
type Preview = OsdkActions["recordQuote"]["preview"];
type Commit = OsdkActions["recordQuote"]["commit"];

type _FetchedIsOrderLine = FetchedOrderLine extends OrderLine ? true : false;
const fetchedIsOrderLine: _FetchedIsOrderLine = true;

type _HasSingleLink = RequestLink extends { fetch: () => Promise<unknown> }
  ? true
  : false;
const hasSingleLink: _HasSingleLink = true;

type _HasManyLink = CommitmentLink extends {
  fetchPage: (options?: { readonly limit?: number }) => Promise<unknown>;
}
  ? true
  : false;
const hasManyLink: _HasManyLink = true;

type _Distinct = Preview extends Commit
  ? Commit extends Preview
    ? false
    : true
  : true;
const previewAndCommitAreDistinct: _Distinct = true;

export function typecheck(objects: OsdkObjects, actions: OsdkActions): void {
  const orderLines = objects.OrderLine;
  void orderLines.fetch;
  void orderLines.fetchPage;
  void actions.recordQuote.preview;
  void actions.recordQuote.commit;
  void fetchedIsOrderLine;
  void hasSingleLink;
  void hasManyLink;
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
    async semanticQuery(request: SemanticQueryInit) {
      calls.push("world.semanticQuery");
      if (request.query?.case === "byType") {
        return {
          values: [
            {
              dependencies: [{ entityId: "commercial.orderLine.1" }],
              value: {
                value: {
                  case: "entityRefValue",
                  value: "commercial.orderLine.1",
                },
              },
            },
          ],
        };
      }
      if (
        request.selection?.value?.case === "relationId" &&
        request.selection.value.value !== undefined
      ) {
        return claimsForRelation(request.selection.value.value, request.entityId);
      }
      return { values: [] };
    },
  };
}

function claimsForRelation(relationId: string, entityId: string) {
  switch (relationId) {
    case "commercial.quotedUnitPrice":
      return {
        values: [
          {
            dependencies: [{ entityId }],
            value: { value: { case: "decimalValue" as const, value: "19.99" } },
          },
        ],
      };
    case "commercial.requestReference":
      return {
        values: [
          {
            dependencies: [{ entityId }],
            value: {
              value: {
                case: "entityRefValue" as const,
                value: "commercial.request.1",
              },
            },
          },
        ],
      };
    default:
      return { values: [] };
  }
}

function fakeActions(
  calls: string[],
  status: ProposalStatus,
): OsdkActionsPort {
  return {
    async approve(request) {
      calls.push("action.approve");
      return {
        decision: PolicyDecision.PERMIT,
        evaluationError: "",
      };
    },
    async commit(request) {
      calls.push("action.commit");
      return {
        receipt: {
          operationId: request.operationId,
          recordIds: ["record.1"],
        },
        status: CommitStatus.COMMITTED,
      };
    },
    async propose(request) {
      calls.push("action.propose");
      return {
        decision: PolicyDecision.PERMIT,
        evaluationError: "",
        proposal: {
          operationId: request.operationId,
          proposalId: request.proposalId,
          status,
        },
      };
    },
  };
}
