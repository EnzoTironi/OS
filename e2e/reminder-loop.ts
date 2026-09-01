import assert from "node:assert/strict";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { z } from "zod";
import { CommitStatus } from "../gen/connect/zoen/action/v1/action_pb.js";
import { EffectKnowledgeState } from "../gen/connect/zoen/effect/v1/effect_pb.js";
import { DefinitionReferenceSchema } from "../gen/connect/zoen/world/v1/world_pb.js";
import {
  invitePersona,
  plantPersonas,
  sessionOf,
  startAuthDoor,
  stopAuthDoor,
} from "./ba-door.js";
import canonicalize from "canonicalize";

import { sha256, waitForState } from "./effect-scenario.js";
import {
  actionClient,
  adminClient,
  adminDatabaseUrl,
  authDatabaseUrl,
  definitionClient,
  dispatchOnce,
  effectClient,
  registerWorker,
  repositoryRoot,
  startWorker,
  startZoend,
  stopProcess,
  tenantA,
  zoenBaseUrl,
  type ManagedProcess,
} from "./effect-support.js";
import {
  type DefinitionFixture,
  activateDefinition,
  publishDefinition,
  textInput,
} from "./governed-action/support.js";
import {
  e2eGeneratedDirectory,
  e2eIdentityAdminToken,
  writeScenarioArtifact,
} from "./host-env.js";

const reminderActionId = "personal.createReminder";

function channelCredential(subjectKey: string): string {
  const encode = (value: string): string =>
    Buffer.from(value, "utf8").toString("base64url");
  return `chx.${encode(e2eIdentityAdminToken())}.${encode(`whatsapp:${subjectKey}`)}`;
}

async function bindVerifiedSubject(
  accountId: string,
  subjectKey: string,
): Promise<void> {
  const response = await fetch(`${zoenBaseUrl}/identity/admin/bind-verified`, {
    body: JSON.stringify({ accountId, provider: "whatsapp", subjectKey }),
    headers: {
      authorization: `Bearer ${e2eIdentityAdminToken()}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
  assert.equal(
    response.status,
    200,
    `bind-verified ${subjectKey} -> ${await response.text()}`,
  );
}

async function committedAttribution(
  operationId: string,
): Promise<{ channelSubject: string | null; principalId: string } | undefined> {
  const client = adminClient();
  await client.connect();
  try {
    const result = await client.query(
      "SELECT committed_principal_id, committed_channel_subject FROM action_operations WHERE operation_id = $1",
      [operationId],
    );
    const row = result.rows[0] as
      | { committed_channel_subject: string | null; committed_principal_id: string }
      | undefined;
    return row === undefined
      ? undefined
      : {
          channelSubject: row.committed_channel_subject,
          principalId: row.committed_principal_id,
        };
  } finally {
    await client.end();
  }
}
const reminderResourceId = "personal.reminder";
const waId = "5531987654321";
const kapsoPhoneNumberId = "e2e-kapso-phone-number-id";
const reminderBody = "ligar pro Carlos";
const validAt = new Date("2026-08-19T00:00:00.000Z");

const reminderDeliverySchema = z
  .object({
    body: z.string().min(1),
    channel: z.object({ kind: z.literal("whatsapp"), to: z.string().min(1) }),
    dueAt: z.string().min(1),
    executorClass: z.literal("reminder_delivery"),
    schemaVersion: z.literal(1),
  })
  .strict();

interface KapsoMessage {
  readonly path: string;
  readonly text: string;
  readonly to: string;
}

async function startMockKapso(): Promise<{
  readonly messages: KapsoMessage[];
  readonly url: string;
  readonly close: () => Promise<void>;
}> {
  const messages: KapsoMessage[] = [];
  const server: Server = createServer(
    (request: IncomingMessage, response: ServerResponse) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        const match = /^\/meta\/whatsapp\/([^/]+)\/messages$/.exec(
          request.url ?? "",
        );
        if (request.method !== "POST" || match === null) {
          response.writeHead(404).end();
          return;
        }
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
          text?: { body?: string };
          to?: string;
        };
        messages.push({
          path: match[1] ?? "",
          text: body.text?.body ?? "",
          to: body.to ?? "",
        });
        response
          .writeHead(200, { "content-type": "application/json" })
          .end(JSON.stringify({ messages: [{ id: "wamid.e2e.reminder" }] }));
      });
    },
  );
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  assert.ok(address !== null && typeof address !== "string");
  return {
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
    messages,
    url: `http://127.0.0.1:${address.port}`,
  };
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const kapso = await startMockKapso();
  process.env.ZOEN_E2E_REMINDER_CHANNEL_URL = kapso.url;

  const baseDefinition = JSON.parse(
    (
      await readFile(
        path.join(repositoryRoot, "testdata/lakes/personal.canonical.json"),
        "utf8",
      )
    ).trimEnd(),
  ) as {
    actions: Array<{ id: string; inputs?: Array<unknown> }>;
  };
  const canonicalJson = canonicalize(baseDefinition);
  assert.ok(canonicalJson !== undefined);
  const digest = sha256(canonicalJson);
  const definitionId = "personal.memory";
  const policySource =
    'permit (\n    principal,\n    action == Action::"discover",\n    resource\n);\n\npermit (\n    principal,\n    action == Action::"commit",\n    resource\n);\n';
  const activationSource = await readFile(
    path.join(repositoryRoot, "e2e/governed-action/activation.cedar"),
    "utf8",
  );
  const readSource =
    'permit (\n    principal,\n    action == Action::"read",\n    resource\n);\n';
  const fixture: DefinitionFixture = {
    canonicalJson,
    definition: create(DefinitionReferenceSchema, {
      definitionId,
      digest,
      revision: 1n,
    }),
    digest,
    policyDigest: sha256(policySource),
    policyId: "policy.personal.reminder",
    policyRevision: 1,
    policySource,
  };
  const policyManifestPath = path.join(
    e2eGeneratedDirectory(repositoryRoot, "reminder-loop"),
    "reminder-loop-policies.json",
  );
  await writeFile(
    policyManifestPath,
    `${JSON.stringify(
      {
        policies: [
          {
            actionId: reminderActionId,
            definitionDigest: digest,
            digest: fixture.policyDigest,
            policyId: fixture.policyId,
            revision: 1,
            source: policySource,
          },
          {
            actionId: "zoen.definition.activate",
            definitionDigest: digest,
            digest: sha256(activationSource),
            policyId: "policy.activation.personal",
            revision: 1,
            source: activationSource,
          },
          {
            actionId: "zoen.world.read",
            definitionDigest: digest,
            digest: sha256(readSource),
            policyId: "policy.read.personal",
            revision: 1,
            source: readSource,
          },
        ],
      },
      null,
      2,
    )}\n`,
  );

  const door = await startAuthDoor(authDatabaseUrl);
  const processes: ManagedProcess[] = [];
  const assertions: Record<string, boolean> = {};
  const observe = (name: string, value: boolean): void => {
    assert.ok(value, name);
    assertions[name] = value;
  };

  try {
    processes.push(await startZoend(policyManifestPath));
    const planted = await plantPersonas(door, {
      adminToken: e2eIdentityAdminToken(),
      applicationDatabaseUrl: adminDatabaseUrl,
      personas: [
        invitePersona({
          actionIds: [reminderActionId],
          actorId: "actor.wa.user",
          id: "wa-user",
          principalId: "principal.wa.user",
          resourceIds: [reminderResourceId],
          tenantId: tenantA,
          workloadId: "workload.wa.user",
        }),
        invitePersona({
          actionIds: ["zoen.definition.activate", reminderActionId],
          actorId: "actor.admin.a",
          id: "admin-a",
          principalId: "principal.admin.a",
          resourceIds: [definitionId, reminderResourceId],
          tenantId: tenantA,
          workloadId: "workload.admin.a",
        }),
        invitePersona({
          actionIds: [reminderActionId],
          actorId: "actor.effect.worker.a",
          id: "effect-worker-a",
          principalId: "principal.effect-worker.a",
          resourceIds: [reminderResourceId],
          tenantId: tenantA,
          workloadId: "workload.effect-worker",
        }),
        // The engine gates reconcile on a dedicated reconciler workload
        // identity, separate from the claiming worker (require_reconciler).
        invitePersona({
          actionIds: [reminderActionId],
          actorId: "actor.effect.reconciler.a",
          id: "effect-reconciler-a",
          principalId: "principal.effect-reconciler.a",
          resourceIds: [reminderResourceId],
          tenantId: tenantA,
          workloadId: "workload.effect-reconciler",
        }),
      ],
      zoendBaseUrl: zoenBaseUrl,
    });
    const waSession = sessionOf(planted, "wa-user");
    // The WhatsApp sender's provider-native subject is bound (verified) to the
    // same account the door invite created; channel-authenticated commits then
    // converge on the same membership instead of a parallel principal.
    await bindVerifiedSubject(waSession.accountId, `${waId}@s.whatsapp.net`);
    const waToken = channelCredential(`${waId}@s.whatsapp.net`);
    const adminToken = sessionOf(planted, "admin-a").token;
    const workerToken = sessionOf(planted, "effect-worker-a").token;
    const reconcilerToken = sessionOf(planted, "effect-reconciler-a").token;

    processes.push(
      await startWorker(
        { [tenantA]: workerToken },
        { connectorUrl: null, reconcilerTokens: { [tenantA]: reconcilerToken } },
      ),
    );
    const registration = await registerWorker();
    assert.match(registration, /runner|normal/i);

    const definitions = definitionClient(adminToken, tenantA);
    await publishDefinition(definitions, tenantA, fixture);
    await activateDefinition(definitions, tenantA, fixture);

    const dueAt = new Date(Date.now() + 3000);
    const action = actionClient(waToken, tenantA);
    const operationId = "operation.reminder.loop.1";
    const proposalId = "proposal.reminder.loop.1";
    const proposed = await action.propose({
      actionId: reminderActionId,
      definition: fixture.definition,
      expiresAt: timestampFromDate(new Date(Date.now() + 300_000)),
      inputs: [
        textInput("body", reminderBody),
        textInput("dueAt", dueAt.toISOString()),
      ],
      operationId,
      proposalId,
      resourceId: reminderResourceId,
      validAt: timestampFromDate(validAt),
    });
    assert.ok(proposed.proposal);
    const committed = await action.commit({ operationId, proposalId });
    assert.equal(committed.status, CommitStatus.COMMITTED);
    assert.ok(committed.receipt);
    const attribution = await committedAttribution(operationId);
    observe(
      "commit_carries_channel_subject",
      attribution?.channelSubject === `whatsapp:${waId}@s.whatsapp.net`,
    );
    observe(
      "commit_principal_is_converged_membership",
      attribution?.principalId === "principal.wa.user",
    );
    const effectRequestIds = committed.receipt.effectRequestIds;
    assert.equal(effectRequestIds.length, 2);

    const effects = effectClient(workerToken, tenantA);
    const payloadByEffect = new Map<string, unknown>();
    let reminderEffectRequestId: string | undefined;
    for (const effectRequestId of effectRequestIds) {
      const response = await effects.getEffect({ effectRequestId });
      const payload = response.snapshot?.request?.payload;
      assert.ok(payload, `${effectRequestId} has no payload`);
      const parsed: unknown = JSON.parse(
        Buffer.from(payload).toString("utf8"),
      );
      payloadByEffect.set(effectRequestId, parsed);
      const contract = reminderDeliverySchema.safeParse(parsed);
      if (contract.success) {
        reminderEffectRequestId = effectRequestId;
      }
    }
    assert.ok(
      reminderEffectRequestId !== undefined,
      "no effect_request carried the reminder_delivery contract",
    );
    observe("exactly_one_reminder_delivery_payload", true);
    const contractPayload = reminderDeliverySchema.parse(
      payloadByEffect.get(reminderEffectRequestId),
    );
    observe("contract_to_is_wa_id", contractPayload.channel.to === waId);
    observe("contract_body_matches", contractPayload.body === reminderBody);
    observe(
      "contract_due_at_matches",
      contractPayload.dueAt === dueAt.toISOString(),
    );

    await dispatchOnce(tenantA);
    await waitForState(
      effects,
      reminderEffectRequestId,
      EffectKnowledgeState.CONFIRMED,
    );
    observe("reminder_effect_reconciled_confirmed", true);
    observe("kapso_received_exactly_one_message", kapso.messages.length === 1);
    const delivered = kapso.messages[0];
    assert.ok(delivered);
    observe("kapso_path_is_planted_phone_number_id", delivered.path === kapsoPhoneNumberId);
    observe("kapso_to_is_wa_id", delivered.to === waId);
    observe("kapso_text_is_reminder_body", delivered.text === reminderBody);

    await writeScenarioArtifact(repositoryRoot, "reminder-loop", {
      assertions,
      componentVersions: {
        postgres: "18",
        rivet: "2.3.11",
        sessionDoor: "better-auth",
      },
      finishedAt: new Date().toISOString(),
      scenario: "reminder-loop",
      startedAt,
    });
  } finally {
    for (const process of processes) {
      await stopProcess(process);
    }
    await stopAuthDoor(door);
    await kapso.close();
  }
}

await main();
