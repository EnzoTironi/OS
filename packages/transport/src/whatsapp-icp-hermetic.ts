/**
 * Hermetic WhatsApp interaction-kernel simulation for ICP fixtures.
 *
 * Context: companion, OIDC, Postgres, and live doors stay out. The real
 * contact loop, assembler, ledger, and personal Action client still run.
 * Inputs: a validated ICP fixture plus optional hop witnesses.
 * Outputs: disposition, spoken text, hop set, and committed effect.
 * Side effects: in-process HTTP ingress and recording companion send.
 * Does not pair WhatsApp or call external providers.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  LanguageModelV3CallOptions,
  LanguageModelV3GenerateResult,
} from "@ai-sdk/provider";
import { create } from "@bufbuild/protobuf";
import { MockLanguageModelV3 } from "ai/test";
import { z } from "zod";
import {
  ChannelSubjectResolveError,
  createConversationContextAssembler,
  createMemoryTurnStore,
  createSpeakerActionClient,
  defaultConversationSources,
  defaultPersonalDefinitionPath,
  principalIdString,
  providerKey,
  tenantIdString,
  type ConversationContextAssembler,
  type IdentityDirectory,
  type SpeakerActionClient,
  type WorldQueryClient,
  type WorldQuerySnapshot,
} from "../../speaker/src/index.js";
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
import type { OsdkActionsPort } from "../../osdk/src/index.js";
import {
  createRecordingCompanionSession,
  type RecordingCompanionSession,
} from "./companion-session.js";
import { rejectWhatsAppMediaFields } from "./media-ingress.js";
import { generateWhsecSecret, signStandardWebhook } from "./standard-webhooks.js";
import {
  classifyWhatsAppContactInbound,
  createMemoryReplyLedger,
  createWhatsAppContactLoop,
  type ReplyLedger,
  type WhatsAppContactDisposition,
} from "./whatsapp-contact-loop.js";
import { resetWhatsAppIngressReplay } from "./whatsapp-ingress-auth.js";
import { createWhatsAppMessagingIngress } from "./whatsapp-ingress.js";

export const KERNEL_HOPS = [
  "companion_ingest",
  "media_policy",
  "jid_verify",
  "external_binding_resolve",
  "dedup_claim",
  "gateway_accept",
  "turn_claim",
  "context_assemble",
  "ontology_projection",
  "communication_contract",
  "downstream_effect",
  "same_thread_reply",
] as const;

export type KernelHop = (typeof KERNEL_HOPS)[number];

const kernelHopSchema = z.enum(KERNEL_HOPS);

const worldSnapshotSchema = z
  .object({
    entityIds: z.array(z.string().min(1)),
    notes: z.array(z.string().min(1)),
    rivals: z.array(
      z.object({
        label: z.string().min(1),
        sourceId: z.string().min(1).optional(),
      }),
    ),
  })
  .strict();

const inboundSchema = z
  .object({
    body: z.string(),
    chatJid: z.string().min(1),
    filename: z.string().min(1).optional(),
    fromMe: z.boolean(),
    isGroup: z.boolean(),
    mediaKind: z.enum(["document", "audio"]),
    mediaRef: z.string().min(1),
    messageId: z.string().min(1),
    mime: z.string().min(1),
    observedAt: z.string().min(1),
    senderAltJid: z.string().min(1),
    senderJid: z.string().min(1),
  })
  .strict();

export const icpFixtureSchema = z
  .object({
    doorE164: z.string().min(1),
    expectedEffectKind: z.enum(["spawn_execution", "write_memory"]),
    expectedEffectTask: z.string().min(1),
    expectedSpeech: z.string().min(1),
    hiddenTokens: z.array(z.string().min(1)),
    icp: z.enum(["foundry", "micro_confeiteira"]),
    inbound: inboundSchema,
    messageId: z.string().min(1),
    now: z.string().min(1),
    personJid: z.string().min(1),
    world: worldSnapshotSchema,
  })
  .strict();

export type IcpFixture = z.infer<typeof icpFixtureSchema>;

export const REQUIRED_KERNEL_HOPS: readonly KernelHop[] = KERNEL_HOPS;

export class KernelContractError extends Error {
  readonly missing: readonly KernelHop[];

  constructor(missing: readonly KernelHop[]) {
    super(
      `false-green: kernel hop ${missing.join(", ") || "unknown"} was bypassed`,
    );
    this.name = "KernelContractError";
    this.missing = missing;
  }
}

export interface HermeticIcpResult {
  readonly contextDigest: string | undefined;
  readonly disposition: WhatsAppContactDisposition;
  readonly hops: ReadonlySet<KernelHop>;
  readonly replayDisposition: WhatsAppContactDisposition;
  readonly sentText: string;
  readonly session: RecordingCompanionSession;
}

/**
 * Load and validate one committed ICP fixture.
 */
export async function loadIcpFixture(name: "foundry" | "micro_confeiteira"): Promise<IcpFixture> {
  const file =
    name === "foundry"
      ? "foundry-fiscal-file.json"
      : "micro-confeiteira-audio-reorder.json";
  const raw = await readFile(
    path.join(process.cwd(), "testdata", "whatsapp-icp", file),
    "utf8",
  );
  return icpFixtureSchema.parse(JSON.parse(raw));
}

/**
 * Fail closed when any required interaction-kernel hop is missing.
 */
export function assertKernelContracts(
  observed: ReadonlySet<string>,
  required: readonly KernelHop[] = REQUIRED_KERNEL_HOPS,
): void {
  const missing: KernelHop[] = [];
  for (const hop of required) {
    const parsed = kernelHopSchema.safeParse(hop);
    if (!parsed.success) {
      missing.push(hop);
      continue;
    }
    if (!observed.has(parsed.data)) {
      missing.push(parsed.data);
    }
  }
  if (missing.length > 0) {
    throw new KernelContractError(missing);
  }
}

function hopLabel(hop: KernelHop): string {
  switch (hop) {
    case "companion_ingest":
    case "media_policy":
    case "jid_verify":
    case "external_binding_resolve":
    case "dedup_claim":
    case "gateway_accept":
    case "turn_claim":
    case "context_assemble":
    case "ontology_projection":
    case "communication_contract":
    case "downstream_effect":
    case "same_thread_reply":
      return hop;
    default: {
      const exhaustive: never = hop;
      return exhaustive;
    }
  }
}

function recordHop(hops: Set<KernelHop>, hop: KernelHop): void {
  hops.add(hopLabel(hop) as KernelHop);
}

/**
 * Drive one ICP through the live WhatsApp contact loop with mocked companion.
 */
export async function runHermeticIcp(fixture: IcpFixture): Promise<HermeticIcpResult> {
  const hops = new Set<KernelHop>();
  const now = () => new Date(fixture.now);
  const store = createMemoryTurnStore();
  const ledger = witnessLedger(createMemoryReplyLedger(), hops);
  const world = witnessWorld(fixture.world, hops);
  const assembler = witnessAssembler(
    createConversationContextAssembler({
      now,
      sources: defaultConversationSources({ store, world }),
    }),
    fixture,
    hops,
  );
  const identity = witnessIdentity(fixture, hops);
  const effect = { kind: undefined as string | undefined, task: "" };
  const actions = witnessActions(fixture, hops, effect);
  const model = contractModel(fixture, hops);
  const session = createRecordingCompanionSession({
    ready: { connected: true, loggedIn: true, paired: true },
  });
  await session.open();

  const classified = classifyWhatsAppContactInbound(
    fixture.inbound,
    fixture.doorE164,
  );
  if (classified.drop) {
    throw new Error(`fixture inbound dropped: ${classified.reason}`);
  }
  rejectWhatsAppMediaFields(fixture.inbound);

  const previousDoor = process.env.ZOEN_WHATSAPP_DOOR_E164;
  process.env.ZOEN_WHATSAPP_DOOR_E164 = fixture.doorE164;
  const restoreDoor = (): void => {
    if (previousDoor === undefined) {
      delete process.env.ZOEN_WHATSAPP_DOOR_E164;
      return;
    }
    process.env.ZOEN_WHATSAPP_DOOR_E164 = previousDoor;
  };

  const loop = createWhatsAppContactLoop({
    actions,
    assembler,
    debounceMs: 0,
    doorE164: fixture.doorE164,
    executeWork: async (task) => {
      effect.kind = "spawn_execution";
      effect.task = task;
      recordHop(hops, "downstream_effect");
      return `status: ingested ${path.basename(fixture.inbound.filename ?? "file")}`;
    },
    identity,
    ledger,
    model,
    now,
    session,
    statusAfterMs: 60_000,
    store,
  });

  resetWhatsAppIngressReplay();
  const secret = generateWhsecSecret();
  const ingress = await createWhatsAppMessagingIngress({
    gateway: loop.gateway,
    ingressSecret: secret,
    port: 0,
    processInbound: (raw) => {
      const live = classifyWhatsAppContactInbound(raw, fixture.doorE164);
      if (live.drop) {
        throw new Error(`live inbound dropped: ${live.reason}`);
      }
      recordHop(hops, "jid_verify");
      rejectWhatsAppMediaFields(raw);
      recordHop(hops, "media_policy");
      return loop.handleRaw(raw);
    },
    session,
  });
  const address = ingress.server.address();
  if (address === null || typeof address === "string") {
    await ingress.close();
    await session.close();
    restoreDoor();
    throw new Error("hermetic ingress did not bind");
  }

  let contextDigest: string | undefined;
  try {
    const rawBody = JSON.stringify(fixture.inbound);
    const signed = signStandardWebhook({
      rawBody,
      secret,
      timestampSeconds: Math.floor(Date.now() / 1000),
      webhookId: `msg.${fixture.messageId}`,
    });
    const response = await fetch(
      `http://127.0.0.1:${String(address.port)}/inbound`,
      {
        body: rawBody,
        headers: {
          "content-type": "application/json",
          ...signed,
        },
        method: "POST",
      },
    );
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `hermetic inbound HTTP ${String(response.status)} ${detail}`,
      );
    }
    recordHop(hops, "companion_ingest");
    const body = (await response.json()) as WhatsAppContactDisposition;
    if (body.kind !== "bound") {
      throw new Error(`expected bound, got ${body.kind}`);
    }
    if (body.inbound.body.kind !== "media") {
      throw new Error("gateway_accept expected media inbound");
    }
    if (body.inbound.body.mediaRef !== fixture.inbound.mediaRef) {
      throw new Error("gateway_accept mediaRef mismatch");
    }
    recordHop(hops, "gateway_accept");

    const sent = session.sent()[0];
    if (sent === undefined || sent.shape.kind !== "text") {
      throw new Error("same_thread_reply missing text");
    }
    if (sent.chatJid !== fixture.personJid) {
      throw new Error(`reply chat ${sent.chatJid} !== ${fixture.personJid}`);
    }
    recordHop(hops, "same_thread_reply");
    assertCommunicationContract(sent.shape.text, fixture, hops);

    if (
      effect.kind !== fixture.expectedEffectKind ||
      !effect.task.includes(expectedEffectNeedle(fixture))
    ) {
      throw new KernelContractError(["downstream_effect"]);
    }

    const replay = await loop.handleRaw(fixture.inbound);
    if (replay.kind !== "duplicate") {
      throw new Error(`replay expected duplicate, got ${replay.kind}`);
    }
    if (session.sent().length !== 1) {
      throw new Error("dedup replay sent a second reply");
    }

    contextDigest = hops.has("context_assemble")
      ? assembler.lastDigest
      : undefined;

    assertKernelContracts(hops);
    return {
      contextDigest,
      disposition: body,
      hops,
      replayDisposition: replay,
      sentText: sent.shape.text,
      session,
    };
  } finally {
    await ingress.close();
    await session.close();
    restoreDoor();
  }
}

function expectedEffectNeedle(fixture: IcpFixture): string {
  switch (fixture.expectedEffectKind) {
    case "spawn_execution":
      return "nfe-entradas-2026-08.xlsx";
    case "write_memory":
      return "leite condensado";
    default: {
      const exhaustive: never = fixture.expectedEffectKind;
      return exhaustive;
    }
  }
}

function assertCommunicationContract(
  text: string,
  fixture: IcpFixture,
  hops: Set<KernelHop>,
): void {
  if (text !== fixture.expectedSpeech) {
    throw new Error(
      `communication_contract expected ${JSON.stringify(fixture.expectedSpeech)} got ${JSON.stringify(text)}`,
    );
  }
  const forbidden = [
    /Recebi/i,
    /\/onboard\//,
    /auxiliar|pronto para ajudar/i,
    /unbound|unlinked|unregistered/i,
    /spawn_execution|speak_to_user|status: ingested/i,
    /cta_url|quick_reply/,
  ];
  for (const pattern of forbidden) {
    if (pattern.test(text)) {
      throw new Error(`communication_contract hit ${String(pattern)}`);
    }
  }
  for (const token of fixture.hiddenTokens) {
    if (text.includes(token)) {
      throw new Error(`communication_contract leaked ${token}`);
    }
  }
  recordHop(hops, "communication_contract");
}

function witnessLedger(inner: ReplyLedger, hops: Set<KernelHop>): ReplyLedger {
  return {
    claim: async (key, inbound) => {
      const owned = await inner.claim(key, inbound);
      if (owned) {
        recordHop(hops, "dedup_claim");
      }
      return owned;
    },
    get: (key) => inner.get(key),
    put: (key, disposition) => inner.put(key, disposition),
  };
}

function witnessWorld(
  snapshot: WorldQuerySnapshot,
  hops: Set<KernelHop>,
): WorldQueryClient {
  return {
    async semanticQuery() {
      recordHop(hops, "ontology_projection");
      return snapshot;
    },
  };
}

function witnessAssembler(
  inner: ConversationContextAssembler,
  fixture: IcpFixture,
  hops: Set<KernelHop>,
): ConversationContextAssembler & { lastDigest?: string } {
  const witnessed: ConversationContextAssembler & { lastDigest?: string } = {
    async assembleBound(input) {
      if (input.claimedInteractionIds.length === 0) {
        throw new Error("false-green: assembleBound without a claimed turn");
      }
      recordHop(hops, "turn_claim");
      const envelope = await inner.assembleBound(input);
      const media = envelope.document.records.some(
        (record) =>
          record.trustClass === "interaction" &&
          record.payload.type === "interaction" &&
          record.payload.kind === "media" &&
          record.payload.mediaRef === fixture.inbound.mediaRef,
      );
      if (!media) {
        throw new Error("false-green: assembled context missing inbound media");
      }
      const world = envelope.document.records.some(
        (record) => record.trustClass === "world",
      );
      if (!world) {
        throw new Error("false-green: assembled context missing world");
      }
      witnessed.lastDigest = envelope.contextDigest;
      recordHop(hops, "context_assemble");
      return envelope;
    },
    async assembleUnbound() {
      throw new Error(
        "false-green: unbound assemble used on a verified binding",
      );
    },
  };
  return witnessed;
}

function witnessIdentity(
  fixture: IcpFixture,
  hops: Set<KernelHop>,
): IdentityDirectory {
  return {
    async resolveChannelSubject(input) {
      recordHop(hops, "external_binding_resolve");
      if (input.provider !== providerKey("whatsapp")) {
        throw new ChannelSubjectResolveError({
          kind: "unbound",
          message: "provider is not whatsapp",
        });
      }
      if (input.subjectKey !== fixture.personJid) {
        throw new ChannelSubjectResolveError({
          kind: "unbound",
          message: "unresolved channel subject: no verified binding",
        });
      }
      return {
        accountId: `account.wa.${fixture.icp}`,
        actorId: "actor.personal",
        bindingId: `binding.wa.${fixture.icp}`,
        membershipId: `membership.wa.${fixture.icp}`,
        principalId: principalIdString(`principal.wa.${fixture.icp}`),
        tenantId: tenantIdString(`tenant.wa.${fixture.icp}`),
        workloadId: "workload.personal",
      };
    },
  };
}

function witnessActions(
  fixture: IcpFixture,
  hops: Set<KernelHop>,
  effect: { kind: string | undefined; task: string },
): SpeakerActionClient {
  const proposed: ProposeRequest[] = [];
  const port = memoryActionPort(proposed);
  const inner = createSpeakerActionClient({
    actions: port,
    definitionPath: defaultPersonalDefinitionPath(),
    ids: () => ({
      approvalId: `approval.${fixture.icp}`,
      expiresAt: new Date("2026-08-27T16:05:00.000Z"),
      operationId: `operation.${fixture.icp}`,
      proposalId: `proposal.${fixture.icp}`,
      resourceId: `personal.note.${fixture.icp}`,
      validAt: new Date(fixture.now),
    }),
    now: () => new Date(fixture.now),
  });
  return {
    commitCreateReminder: (input) => inner.commitCreateReminder(input),
    commitWriteMemory: async (input) => {
      const committed = await inner.commitWriteMemory(input);
      if (committed.kind !== "committed") {
        throw new Error(`write_memory ${committed.kind}`);
      }
      effect.kind = "write_memory";
      effect.task = input.body;
      recordHop(hops, "downstream_effect");
      return committed;
    },
  };
}

function memoryActionPort(proposed: ProposeRequest[]): OsdkActionsPort {
  return {
    async approve() {
      return create(ApproveResponseSchema, {
        decision: PolicyDecision.PERMIT,
        evaluationError: "",
      });
    },
    async commit(request) {
      return create(CommitResponseSchema, {
        collisionKind: CommitIdentityKind.UNSPECIFIED,
        error: "",
        receipt: create(CommitReceiptSchema, {
          operationId: request.operationId,
          recordIds: ["record.writeMemory"],
        }),
        status: CommitStatus.COMMITTED,
      });
    },
    async discover() {
      return create(DiscoverResponseSchema, { actions: [] });
    },
    async propose(request) {
      proposed.push(request);
      return create(ProposeResponseSchema, {
        decision: PolicyDecision.PERMIT,
        evaluationError: "",
        proposal: create(ProposalSchema, {
          canonicalPreviewText: "Vou guardar esta nota",
          operationId: request.operationId,
          previewHash: "a".repeat(64),
          proposalId: request.proposalId,
          status: ProposalStatus.READY,
        }),
      });
    },
  };
}

function contractModel(
  fixture: IcpFixture,
  hops: Set<KernelHop>,
): MockLanguageModelV3 {
  let step = 0;
  return new MockLanguageModelV3({
    doGenerate: async (options) => {
      step += 1;
      if (step === 1) {
        assertModelSawKernel(options.prompt, fixture, hops);
        return firstToolCalls(fixture);
      }
      return stopCall();
    },
  });
}

function assertModelSawKernel(
  prompt: LanguageModelV3CallOptions["prompt"],
  fixture: IcpFixture,
  hops: Set<KernelHop>,
): void {
  const blob = flattenPrompt(prompt);
  if (!blob.includes(fixture.inbound.mediaRef)) {
    throw new Error("model prompt missing inbound mediaRef");
  }
  if (!hops.has("ontology_projection")) {
    throw new Error("false-green: model ran before world retrieve");
  }
  for (const note of fixture.world.notes) {
    if (!blob.includes(note)) {
      throw new Error(`model prompt missing world note ${note}`);
    }
  }
}

function firstToolCalls(fixture: IcpFixture): LanguageModelV3GenerateResult {
  switch (fixture.expectedEffectKind) {
    case "spawn_execution":
      return toolCalls([
        {
          input: JSON.stringify({ task: fixture.expectedEffectTask }),
          toolCallId: "call_spawn",
          toolName: "spawn_execution",
        },
        {
          input: JSON.stringify({ text: fixture.expectedSpeech }),
          toolCallId: "call_speak",
          toolName: "speak_to_user",
        },
      ]);
    case "write_memory":
      return toolCalls([
        {
          input: JSON.stringify({ body: fixture.expectedEffectTask }),
          toolCallId: "call_note",
          toolName: "note",
        },
        {
          input: JSON.stringify({ text: fixture.expectedSpeech }),
          toolCallId: "call_speak",
          toolName: "speak_to_user",
        },
      ]);
    default: {
      const exhaustive: never = fixture.expectedEffectKind;
      return exhaustive;
    }
  }
}

function toolCalls(
  calls: ReadonlyArray<{
    readonly input: string;
    readonly toolCallId: string;
    readonly toolName: string;
  }>,
): LanguageModelV3GenerateResult {
  return {
    content: calls.map((call) => ({
      input: call.input,
      toolCallId: call.toolCallId,
      toolName: call.toolName,
      type: "tool-call" as const,
    })),
    finishReason: { raw: "tool-calls", unified: "tool-calls" },
    usage: usage(),
    warnings: [],
  };
}

function stopCall(): LanguageModelV3GenerateResult {
  return {
    content: [],
    finishReason: { raw: "stop", unified: "stop" },
    usage: usage(),
    warnings: [],
  };
}

function usage() {
  return {
    inputTokens: { cacheRead: 0, cacheWrite: 0, noCache: 1, total: 1 },
    outputTokens: { reasoning: 0, text: 1, total: 1 },
  };
}

function flattenPrompt(prompt: LanguageModelV3CallOptions["prompt"]): string {
  return prompt
    .map((message) => {
      if (message.role === "system") {
        return message.content;
      }
      if (message.role === "user") {
        return message.content
          .map((part) => (part.type === "text" ? part.text : ""))
          .join("\n");
      }
      return "";
    })
    .join("\n");
}
