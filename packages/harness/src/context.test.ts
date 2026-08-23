import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  interactionId,
  principalIdString,
  providerKey,
  providerThreadRef,
  providerUserRef,
  tenantIdString,
  type InteractionRecord,
} from "../../interaction/src/index.js";
import {
  createEvidenceAdmission,
  createMemoryInteractionContextStore,
  createMemoryKnowledgeAdmissionIndex,
  createMemoryPreferenceStore,
  createRetrievedContextRecord,
  createTrustTaggedAssembler,
  InteractionContextSource,
  KnowledgeContextSource,
  PreferenceContextSource,
  projectAssembledForModel,
  WorldContextSource,
  HistoryContextSource,
} from "./context.js";
import type { AgentAuthority } from "./session.js";
import {
  capabilityAliasSchema,
  type CausalContext,
  type KnowledgeContext,
  type QueryCapability,
  type QueryContext,
  type TrustedAgentContext,
} from "./types.js";

const trusted: TrustedAgentContext = {
  actorId: "actor.a",
  delegationIds: [],
  principalId: "principal.a",
  tenantId: "tenant.a",
  workloadId: "workload.a",
};

const queryCapability: QueryCapability = {
  alias: capabilityAliasSchema.parse("query-available"),
  definition: {
    definitionId: "inventory.companyBrain",
    digest: "a".repeat(64),
    revision: 1,
  },
  description: "available",
  entityId: "inventory.item.1",
  kind: "query",
  selection: { id: "inventory.available", kind: "relation" },
  validAt: "2026-08-20T00:00:00.000Z",
};

const liveQuery: QueryContext = {
  actualCommitSequence: "1",
  alias: queryCapability.alias,
  definition: queryCapability.definition,
  entityId: queryCapability.entityId,
  knowledgeCut: "1",
  resultDigest: "b".repeat(64),
  selection: queryCapability.selection,
  validAt: queryCapability.validAt,
  values: [{ kind: "integer", value: "10" }],
};

const liveHistory: CausalContext = {
  actionId: "inventory.requestStock",
  commitSequence: "1",
  complete: true,
  explanationDigest: "c".repeat(64),
  operationId: "operation.baseline",
};

function interactionRecord(id: string, text: string): InteractionRecord {
  return {
    id: interactionId(id),
    acceptedAt: "2026-08-20T00:00:00.000Z",
    inbound: {
      idempotencyKey: `idem.${id}`,
      channel: {
        provider: providerKey("telegram"),
        providerUser: providerUserRef("user.1"),
        thread: providerThreadRef("thread.1"),
        receivedAt: "2026-08-20T00:00:00.000Z",
      },
      body: { kind: "text", text },
      audienceObservation: { kind: "dm" },
    },
    ctx: {
      accountId: "account.a",
      bindingId: "binding.a",
      membershipId: "membership.a",
      tenantId: tenantIdString("tenant.a"),
      principalId: principalIdString(trusted.principalId),

      actorId: trusted.actorId,
      workloadId: trusted.workloadId,
      channel: {
        provider: providerKey("telegram"),
        providerUser: providerUserRef("user.1"),
        thread: providerThreadRef("thread.1"),
        receivedAt: "2026-08-20T00:00:00.000Z",
      },
    },
    semanticCorrelationKey: `corr.${id}`,
  };
}

test("createRetrievedContextRecord rejects trustClass/payload mismatch", () => {
  assert.throws(() =>
    createRetrievedContextRecord({
      trustClass: "knowledge",
      scope: { kind: "tenant", tenantId: "tenant.a" },
      attribution: {
        kind: "source",
        sourceId: "source.1",
        sourceRevision: "1",
        contentDigest: "d".repeat(64),
      },
      retention: { kind: "knowledge-source" },
      payload: {
        trustClass: "preference",
        key: "presentation.style",
        value: {
          type: "presentation",
          density: "compact",
          cardsPreferred: false,
        },
        preferenceScope: {
          kind: "principal",
          tenantId: "tenant.a",
          principalId: "principal.a",
        },
      },
    }),
  );
});

test("assembler keeps distinct trust classes and never string-joins", async () => {
  const interactions = createMemoryInteractionContextStore();
  await interactions.accept(interactionRecord("chat-1", "ordinary chat"));
  const preferences = createMemoryPreferenceStore();
  await preferences.put({
    scope: {
      kind: "principal",
      tenantId: trusted.tenantId,
      principalId: trusted.principalId,
    },
    key: "presentation.style",
    value: {
      type: "presentation",
      density: "compact",
      cardsPreferred: true,
    },
    updatedByPrincipalId: trusted.principalId,
  });

  const brain = {
    async retrieve(): Promise<KnowledgeContext> {
      return {
        embeddingModel: {
          modelId: "test",
          modelRevision: "1",
          versionDigest: "e".repeat(64),
        },
        queryDigest: "f".repeat(64),
        results: [
          {
            fragmentDigest: "1".repeat(64),
            fragmentId: "2".repeat(64),
            indexVersion: "v1",
            lexicalRank: 1,
            lexicalScore: 1,
            parserName: "text",
            parserVersionDigest: "3".repeat(64),
            sourceDigest: "4".repeat(64),
            sourceId: "source.conflict",
            sourceRevision: "1",
            text: "SKU-42 available is 999 (stale knowledge)",
            vectorRank: 1,
            vectorScore: 1,
          },
        ],
        traceId: "5".repeat(64),
      };
    },
  };

  const authority: AgentAuthority = {
    async commitOrRecover() {
      throw new Error("unused");
    },
    async discover() {
      throw new Error("unused");
    },
    async explain() {
      return liveHistory;
    },
    async propose() {
      throw new Error("unused");
    },
    async query() {
      return liveQuery;
    },
  };

  const assembler = createTrustTaggedAssembler({
    sources: [
      new InteractionContextSource(interactions),
      new PreferenceContextSource(preferences),
      new KnowledgeContextSource(brain as never),
      new WorldContextSource(authority),
      new HistoryContextSource(authority),
    ],
  });

  const assembled = await assembler.assemble({
    trustedContext: trusted,
    audience: { kind: "enterprise", tenantId: trusted.tenantId },
    purpose: {
      kind: "planning",
      sessionId: "session.1",
      taskId: "task.1",
      knowledgeQuery: "why is SKU-42 short?",
      explainOperationId: liveHistory.operationId,
      queryCapabilities: [queryCapability],
    },
  });

  const classes = new Set(assembled.records.map((record) => record.trustClass));
  assert.ok(classes.has("interaction"));
  assert.ok(classes.has("preference"));
  assert.ok(classes.has("knowledge"));
  assert.ok(classes.has("world"));
  assert.ok(classes.has("history"));
  assert.equal(
    (assembled as { memory_text?: unknown }).memory_text,
    undefined,
  );
  const projected = projectAssembledForModel(assembled);
  assert.equal(typeof projected.knowledge, "object");
  assert.notEqual(typeof projected.knowledge, "string");

  const knowledge = assembled.records.filter(
    (record) => record.trustClass === "knowledge",
  );
  assert.ok(
    knowledge.every(
      (record) =>
        record.payload.trustClass === "knowledge" &&
        record.payload.admission.kind !== "admitted",
    ),
  );

  const world = assembled.records.find((record) => record.trustClass === "world");
  assert.ok(world?.payload.trustClass === "world");
  assert.deepEqual(world.payload.query.values, liveQuery.values);
});

test("ordinary chat stays interaction-only until explicit admit", async () => {
  const interactions = createMemoryInteractionContextStore();
  const admissions = createMemoryKnowledgeAdmissionIndex();
  const stored = await interactions.accept(
    interactionRecord("chat-2", "remember warehouse has 3"),
  );
  assert.equal(stored.admission.kind, "interaction-only");

  let recorded = 0;
  const admission = createEvidenceAdmission({
    interactions,
    knowledgeAdmissions: admissions,
    async recordEvidence() {
      recorded += 1;
    },
  });
  const state = await admission.admit({
    tenantId: trusted.tenantId,
    principalId: trusted.principalId,
    from: { kind: "interaction", interactionId: "chat-2" },
    claimId: "claim.from-chat.1",
    definition: queryCapability.definition,
    entityId: "inventory.item.1",
    relationId: "inventory.available",
    validAt: "2026-08-20T00:00:00.000Z",
  });
  assert.equal(state.kind, "admitted");
  assert.equal(recorded, 1);
  const after = await interactions.get("chat-2");
  assert.equal(after?.admission.kind, "admitted");
});

test("forgetInteraction leaves admitted evidence with dangling provenance", async () => {
  const interactions = createMemoryInteractionContextStore();
  const admissions = createMemoryKnowledgeAdmissionIndex();
  await interactions.accept(interactionRecord("chat-3", "admit then forget"));
  const admission = createEvidenceAdmission({
    interactions,
    knowledgeAdmissions: admissions,
    async recordEvidence() {},
  });
  await admission.admit({
    tenantId: trusted.tenantId,
    principalId: trusted.principalId,
    from: { kind: "interaction", interactionId: "chat-3" },
    claimId: "claim.forget.1",
    definition: queryCapability.definition,
    entityId: "inventory.item.1",
    relationId: "inventory.available",
    validAt: "2026-08-20T00:00:00.000Z",
  });
  await interactions.forgetInteraction("chat-3");
  const forgotten = await interactions.get("chat-3");
  assert.equal(forgotten?.present, false);
  assert.equal(forgotten?.admission.kind, "admitted");
  if (forgotten?.admission.kind === "admitted") {
    assert.equal(forgotten.admission.sourceRefsPresent, false);
  }
});

test("personal source absent from enterprise assemble", async () => {
  const personal = createRetrievedContextRecord({
    trustClass: "preference",
    scope: { kind: "account", accountId: "account.personal" },
    attribution: {
      kind: "preference",
      preferenceId: "pref.personal",
      key: "presentation.style",
    },
    retention: { kind: "preference" },
    payload: {
      trustClass: "preference",
      key: "presentation.style",
      value: {
        type: "presentation",
        density: "comfortable",
        cardsPreferred: false,
      },
      preferenceScope: { kind: "account", accountId: "account.personal" },
    },
  });
  const assembler = createTrustTaggedAssembler({
    sources: [
      {
        id: "personal-leak",
        retrieve: async () => [personal],
      },
    ],
  });
  const assembled = await assembler.assemble({
    trustedContext: trusted,
    audience: { kind: "enterprise", tenantId: trusted.tenantId },
    purpose: { kind: "continuity", sessionId: "session.1" },
  });
  assert.equal(assembled.records.length, 0);
  assert.ok(
    assembled.failures.some(
      (failure) => failure.code === "cross_workspace_denied",
    ),
  );
});

test("voice transcript carries originalAudioDigest distinct from transcript", () => {
  const audioDigest = "a".repeat(64);
  const transcript = "spoken inventory note";
  const transcriptDigest = createHash("sha256").update(transcript).digest("hex");
  assert.notEqual(audioDigest, transcriptDigest);
  const record = createRetrievedContextRecord({
    trustClass: "knowledge",
    scope: { kind: "tenant", tenantId: "tenant.a" },
    attribution: {
      kind: "fragment",
      fragmentId: "6".repeat(64),
      fragmentDigest: "7".repeat(64),
      sourceId: "source.voice",
      sourceRevision: "1",
      contentDigest: transcriptDigest,
    },
    retention: { kind: "knowledge-source" },
    payload: {
      trustClass: "knowledge",
      text: transcript,
      admission: { kind: "ingested" },
      derivation: {
        originalAudioDigest: audioDigest,
        modelId: "whisper-test",
        modelRevision: "1",
        parserVersionDigest: "8".repeat(64),
        transcribedAt: "2026-08-20T00:00:00.000Z",
      },
    },
  });
  assert.ok(record.payload.trustClass === "knowledge");
  assert.notEqual(
    record.payload.derivation?.originalAudioDigest,
    transcriptDigest,
  );
});

test("unit swap one ContextSource mock leaves planning contract intact", async () => {
  const authority: AgentAuthority = {
    async commitOrRecover() {
      throw new Error("unused");
    },
    async discover() {
      throw new Error("unused");
    },
    async explain() {
      return liveHistory;
    },
    async propose() {
      throw new Error("unused");
    },
    async query() {
      return liveQuery;
    },
  };
  const assembler = createTrustTaggedAssembler({
    sources: [
      { id: "interaction", retrieve: async () => [] },
      { id: "preference", retrieve: async () => [] },
      { id: "knowledge", retrieve: async () => [] },
      new WorldContextSource(authority),
      new HistoryContextSource(authority),
    ],
  });
  const assembled = await assembler.assemble({
    trustedContext: trusted,
    audience: { kind: "enterprise", tenantId: trusted.tenantId },
    purpose: {
      kind: "planning",
      sessionId: "session.swap",
      taskId: "task.swap",
      explainOperationId: liveHistory.operationId,
      queryCapabilities: [queryCapability],
    },
  });
  const projected = projectAssembledForModel(assembled);
  assert.deepEqual(projected.knowledge, []);
  assert.equal(projected.semanticWorld.length, 1);
  assert.equal(projected.causalHistory.length, 1);
});

test("voice admit rejects identical audio and transcript digests", async () => {
  const interactions = createMemoryInteractionContextStore();
  const admissions = createMemoryKnowledgeAdmissionIndex();
  await interactions.accept(interactionRecord("voice-1", "transcript"));
  const admission = createEvidenceAdmission({
    interactions,
    knowledgeAdmissions: admissions,
    async recordEvidence() {},
  });
  const digest = "9".repeat(64);
  await assert.rejects(() =>
    admission.admit({
      tenantId: trusted.tenantId,
      principalId: trusted.principalId,
      from: {
        kind: "voice_transcript",
        interactionId: "voice-1",
        audioDigest: digest,
        transcriptDigest: digest,
        parserName: "whisper",
        parserVersionDigest: "0".repeat(64),
      },
      claimId: "claim.voice.1",
      definition: queryCapability.definition,
      entityId: "inventory.item.1",
      relationId: "inventory.available",
      validAt: "2026-08-20T00:00:00.000Z",
    }),
  );
});
