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
  createSpeakerActionClientFromEnv,
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
    previewText: "Vou guardar esta nota: comprar pão",
    recordIds: ["record.writeMemory"],
  });
  assert.deepEqual(calls, ["action.propose", "action.propose", "action.commit"]);
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
    previewText: "Vou criar este lembrete para amanhã 15h: dentista",
    recordIds: ["record.createReminder"],
  });
  assert.deepEqual(calls, ["action.propose", "action.propose", "action.commit"]);
  assert.equal(proposed[0]?.actionId, "personal.createReminder");
  assert.equal(proposed[0]?.resourceId, "personal.reminder.1");
  assert.deepEqual(
    proposed[0]?.inputs.map((entry) => entry.inputId).sort(),
    ["body", "dueAt"],
  );
});

test("compiled personal.memory digest is the Fly Cedar key", async () => {
  const compiled = await compileDefinition(defaultPersonalDefinitionPath());
  const policies = JSON.parse(
    await readFile(path.join("deploy", "fly", "policies.json"), "utf8"),
  ) as {
    policies: readonly {
      actionId: string;
      definitionDigest: string;
    }[];
  };
  const reminder = policies.policies.find(
    (entry) => entry.actionId === "personal.createReminder",
  );
  const note = policies.policies.find(
    (entry) => entry.actionId === "personal.writeMemory",
  );
  assert.equal(compiled.digest, reminder?.definitionDigest);
  assert.equal(compiled.digest, note?.definitionDigest);
});

test("Fly admin-a JWT grants createReminder on the lake and type roots, not a hex id", async () => {
  const realm = JSON.parse(
    await readFile(path.join("deploy", "fly", "realm.template.json"), "utf8"),
  ) as {
    clients: readonly {
      clientId: string;
      protocolMappers?: readonly {
        name: string;
        config: { readonly "claim.value": string };
      }[];
    }[];
  };
  const admin = realm.clients.find((client) => client.clientId === "admin-a");
  const mapper = admin?.protocolMappers?.find(
    (entry) => entry.name === "zoen_delegation",
  );
  assert.ok(mapper);
  const grants = JSON.parse(mapper.config["claim.value"]) as readonly {
    actionIds: readonly string[];
    resourceIds: readonly string[];
  }[];
  assert.equal(grants.length, 1);
  assert.equal(grants[0]?.actionIds.includes("personal.createReminder"), true);
  assert.equal(grants[0]?.resourceIds.includes("personal.memory"), true);
  assert.equal(grants[0]?.resourceIds.includes("personal.note"), true);
  assert.equal(grants[0]?.resourceIds.includes("personal.reminder"), true);
  assert.equal(
    grants[0]?.resourceIds.some((id) => /^personal\.(note|reminder)\.[0-9a-f]+$/u.test(id)),
    false,
  );
});

test("two reminds mint two personal.reminder entity ids", async () => {
  const compiled = await compileDefinition(defaultPersonalDefinitionPath());
  const proposed: ProposeRequest[] = [];
  const client = createSpeakerActionClient({
    actions: readyActionsPort([], proposed),
    compiled,
  });
  const first = await client.commitCreateReminder({
    body: "beber água",
    dueAt: "amanhã",
  });
  const second = await client.commitCreateReminder({
    body: "beber água de novo",
    dueAt: "depois de amanhã",
  });
  assert.equal(first.kind, "committed");
  assert.equal(second.kind, "committed");
  const reminderIds = [
    ...new Set(
      proposed
        .filter((entry) => entry.actionId === "personal.createReminder")
        .map((entry) => entry.resourceId),
    ),
  ];
  assert.equal(reminderIds.length, 2);
  assert.match(reminderIds[0] ?? "", /^personal\.reminder\.[0-9a-f]{16}$/u);
  assert.match(reminderIds[1] ?? "", /^personal\.reminder\.[0-9a-f]{16}$/u);
  assert.notEqual(reminderIds[0], reminderIds[1]);
  assert.equal(
    reminderIds.every((id) => id !== "personal.memory"),
    true,
  );
  assert.equal(proposed[0]?.definition?.definitionId, "personal.memory");
  assert.equal(proposed[0]?.definition?.digest, compiled.digest);
});

test("Fly personal lake prestart requires ZOEN_TENANT_ID; speaker does not Publish", async () => {
  const prestart = await readFile(
    path.join("deploy", "fly", "ensure-personal-lake.ts"),
    "utf8",
  );
  const speaker = await readFile(
    path.join("packages", "speaker", "src", "osdk-action-client.ts"),
    "utf8",
  );
  assert.match(prestart, /requiredEnv\("ZOEN_TENANT_ID"\)/);
  assert.doesNotMatch(prestart, /tenant\.a/);
  assert.doesNotMatch(speaker, /DefinitionService/);
  assert.doesNotMatch(speaker, /ensurePersonalLake|lakeEnsure/);
  assert.doesNotMatch(speaker, /tenant\.a/);
});

test("createSpeakerActionClientFromEnv stays unset without a personal definition path", () => {
  assert.equal(
    createSpeakerActionClientFromEnv({
      ZOEN_IDENTITY_BASE_URL: "http://127.0.0.1:58701",
      ZOEN_AGENT_BEARER_TOKEN: "token",
    }),
    undefined,
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
          canonicalPreviewText:
            request.actionId === "personal.createReminder"
              ? "Vou criar este lembrete para amanhã 15h: dentista"
              : "Vou guardar esta nota: comprar pão",
          operationId: request.operationId,
          previewHash: "a".repeat(64),
          proposalId: request.proposalId,
          status: ProposalStatus.READY,
        }),
      });
    },
  };
}
