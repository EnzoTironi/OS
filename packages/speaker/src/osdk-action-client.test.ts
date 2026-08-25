import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { create } from "@bufbuild/protobuf";
import { compileDefinition } from "../../ontology/src/index.js";
import type { OsdkActionsPort } from "../../osdk/src/index.js";
import {
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
  type ProposeRequest,
} from "../../sdk/src/gen/zoen/action/v1/action_pb.js";
import {
  createSpeakerActionClient,
  defaultPersonalDefinitionPath,
} from "./osdk-action-client.js";

const fixtureDirectory = path.join(
  process.cwd(),
  "packages",
  "ontology",
  "fixtures",
);
const validAt = new Date("2026-08-25T12:00:00.000Z");
const expiresAt = new Date("2026-08-25T12:05:00.000Z");

test("WriteMemory and CreateReminder Propose+Commit with permissive Cedar become READY then committed", async () => {
  const compiled = await compileDefinition(defaultPersonalDefinitionPath());
  assert.equal(compiled.definition.definitionId, "personal.memory");
  const writeMemoryCedar = await readFile(
    path.join(fixtureDirectory, "personal.writeMemory.cedar"),
    "utf8",
  );
  const createReminderCedar = await readFile(
    path.join(fixtureDirectory, "personal.createReminder.cedar"),
    "utf8",
  );
  assert.match(writeMemoryCedar, /Action::"commit"/);
  assert.match(writeMemoryCedar, /Action::"discover"/);
  assert.match(writeMemoryCedar, /personal\.writeMemory/);
  assert.doesNotMatch(writeMemoryCedar, /quantity/);
  assert.match(createReminderCedar, /Action::"commit"/);
  assert.match(createReminderCedar, /Action::"discover"/);
  assert.match(createReminderCedar, /personal\.createReminder/);
  assert.doesNotMatch(createReminderCedar, /quantity/);

  const calls: string[] = [];
  const proposed: ProposeRequest[] = [];
  const client = createSpeakerActionClient({
    actions: readyActionsPort(calls, proposed),
    compiled,
    ids: (kind) => ({
      approvalId: `approval.${kind}`,
      expiresAt,
      operationId: `operation.${kind}`,
      proposalId: `proposal.${kind}`,
      resourceId:
        kind === "remind" ? "personal.reminder.1" : "personal.note.1",
      validAt,
    }),
  });

  const noted = await client.commitWriteMemory({ body: "comprar pão" });
  assert.deepEqual(noted, {
    kind: "committed",
    operationId: "operation.note",
    recordIds: ["record.writeMemory"],
  });
  assert.deepEqual(calls, ["action.propose", "action.commit"]);
  assert.equal(proposed[0]?.actionId, "personal.writeMemory");
  assert.equal(proposed[0]?.resourceId, "personal.note.1");
  assert.deepEqual(
    proposed[0]?.inputs.map((entry) => entry.inputId),
    ["body"],
  );

  calls.length = 0;
  proposed.length = 0;
  const reminded = await client.commitCreateReminder({
    body: "dentista",
    dueAt: "amanhã 15h",
  });
  assert.deepEqual(reminded, {
    kind: "committed",
    operationId: "operation.remind",
    recordIds: ["record.createReminder"],
  });
  assert.deepEqual(calls, ["action.propose", "action.commit"]);
  assert.equal(proposed[0]?.actionId, "personal.createReminder");
  assert.equal(proposed[0]?.resourceId, "personal.reminder.1");
  assert.deepEqual(
    proposed[0]?.inputs.map((entry) => entry.inputId).sort(),
    ["body", "dueAt"],
  );
});

function readyActionsPort(
  calls: string[],
  proposed: ProposeRequest[],
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
      const actionId = proposed.at(-1)?.actionId ?? "unknown";
      const recordId =
        actionId === "personal.createReminder"
          ? "record.createReminder"
          : "record.writeMemory";
      return create(CommitResponseSchema, {
        collisionKind: CommitIdentityKind.UNSPECIFIED,
        error: "",
        receipt: create(CommitReceiptSchema, {
          operationId: request.operationId,
          recordIds: [recordId],
        }),
        status: CommitStatus.COMMITTED,
      });
    },
    async discover() {
      calls.push("action.discover");
      return create(DiscoverResponseSchema, {
        actions: [],
      });
    },
    async propose(request) {
      calls.push("action.propose");
      proposed.push(request);
      return create(ProposeResponseSchema, {
        decision: PolicyDecision.PERMIT,
        evaluationError: "",
        proposal: create(ProposalSchema, {
          operationId: request.operationId,
          proposalId: request.proposalId,
          status: ProposalStatus.READY,
        }),
      });
    },
  };
}
