import { randomBytes } from "node:crypto";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { isStepCount, ToolLoopAgent, type LanguageModel } from "ai";
import { interactionId, type TurnAttemptId } from "./brands.js";
import {
  assembleTurnContext,
  audienceKindFromMembership,
  createConversationContextAssembler,
  defaultConversationSources,
  type ConversationContextAssembler,
  type ConversationWorkspaceKind,
} from "./context-assembler.js";
import {
  conversationKeyFromChannel,
  conversationKeyFromKind,
} from "./conversation-kind.js";
import type {
  ConversationAudienceKind,
  ConversationContextDocument,
} from "./context-document.js";
import type { HistoryQueryClient } from "./history-query.js";
import {
  createFirstContactTools,
  createInteractionScratch,
  createInteractionTools,
  splitSpokenBubbles,
  type InteractionScratch,
} from "./interaction-tools.js";
import {
  createConversationTurnCoordinator,
  TURN_DEBOUNCE_MS,
  type ConversationTurnCoordinator,
} from "./turn-coordinator.js";
import { createMemoryTurnStore, type TurnStore } from "./turn-store.js";
import type {
  AudienceObservation,
  InboundInteraction,
  InteractionRecord,
  TrustedInteractionContext,
} from "./types.js";
import { redactCredentialText } from "./model-credential.js";
import type {
  ReasonTurnFacts,
  ReasonTurnGenerate,
  ReasonTurnHrefSource,
  ReasonTurnPath,
} from "./reason-turn-log.js";
import {
  looksLikeEntityId,
  type WorldQueryClient,
} from "./world-query.js";

export type {
  ReasonTurnFacts,
  ReasonTurnGenerate,
  ReasonTurnHrefSource,
  ReasonTurnLog,
  ReasonTurnPath,
} from "./reason-turn-log.js";

/**
 * Live outbound for one Interaction turn.
 * `href` is always present: a URL or null.
 * Visible text is speak_to_user, or the single fail copy on noModel/lookupFail.
 * `wait` and `threw` are sealed empty sends: no bubbles, no world hrefFallback.
 * `reasonTurn` is speaker facts only. The host adds `statusFired` when it emits.
 */
export interface OutboundTurn {
  readonly bubbles: string[];
  readonly href: URL | null;
  readonly reasonTurn: ReasonTurnFacts;
}

/**
 * Live inbound for one Interaction turn. Text or media only.
 * Other InboundKind values are mapped at the channel edge.
 */
export type InteractionInbound =
  | { readonly kind: "text"; readonly text: string }
  | {
      readonly kind: "media";
      readonly mediaRef: string;
      readonly mime?: string;
    };

export type InteractionLocale = "pt" | "en";

export interface InteractionTurnInput {
  readonly membership: TrustedInteractionContext;
  readonly inbound: InteractionInbound;
  readonly model?: LanguageModel;
  readonly world?: WorldQueryClient;
  readonly coordinator?: ConversationTurnCoordinator;
  readonly attemptId?: TurnAttemptId;
  readonly store?: TurnStore;
  readonly now?: () => Date;
  readonly executeWork?: (task: string) => Promise<string>;
  readonly debounceMs?: number;
  /**
   * Shared scratch so a host can observe `startedWork` / `waited` while
   * generate is still running. Transport uses this to decide whether a
   * status line may go out. Speaker never sends that line.
   */
  readonly scratch?: InteractionScratch;
  readonly assembler?: ConversationContextAssembler;
  readonly audienceKind?: ConversationAudienceKind;
  readonly history?: HistoryQueryClient;
  readonly workspaceKind?: ConversationWorkspaceKind;
}

const FAIL_CLOSED_PT = "não consegui consultar agora";
const FAIL_CLOSED_EN = "couldn't look that up";

/**
 * Run one Interaction turn: coordinator stages plus a ToolLoopAgent reasoning step.
 *
 * Context: bound 1:1 WhatsApp (and other channels) after membership resolve.
 * Inputs: membership + inbound. Optional model/world/coordinator for tests.
 * Outputs: conversational bubbles and at most one https URL.
 * A successful generate that never called speak_to_user on non-empty inbound is a lookup fail, not a wait.
 * Closing inbound should call the `wait` tool. That is a sealed empty send, not a lookup fail.
 * Generate throw is the same sealed empty send. No consult copy, no world hrefFallback.
 * Side effects: claims the burst on the coordinator and advances attempt phases.
 * Does not invent OrderLines. Does not echo inbound as "Recebi".
 */
export async function runInteractionTurn(
  input: InteractionTurnInput,
): Promise<OutboundTurn> {
  const now = input.now ?? (() => new Date());
  const ctx = input.membership;
  const store = input.store ?? createMemoryTurnStore();
  const coordinator =
    input.coordinator ??
    createConversationTurnCoordinator({
      debounceMs: input.debounceMs ?? TURN_DEBOUNCE_MS,
      now,
      store,
    });

  const attemptId = await claimAttempt({
    attemptId: input.attemptId,
    coordinator,
    ctx,
    inbound: input.inbound,
    now,
  });

  await coordinator.advanceStage(attemptId, "assembling_context");
  const inboundText = inboundBodyText(input.inbound);
  const locale = detectInboundLocale(
    input.inbound.kind === "text" ? inboundText : "",
  );
  const attempt = await coordinator.getAttempt(attemptId);
  if (attempt === undefined) {
    throw new Error("interaction turn missing claimed attempt");
  }
  const audienceKind =
    input.audienceKind ?? audienceKindFromMembership(ctx);
  const world = input.world;
  const assembler =
    input.assembler ??
    createConversationContextAssembler({
      now,
      sources: defaultConversationSources({
        history: input.history,
        store,
        world,
      }),
    });
  const envelope = await assembleTurnContext({
    assembler,
    attempt,
    audienceKind,
    hiddenTokens: hiddenIdentityTokens(ctx),
    inbound: input.inbound,
    instructions: interactionInstructions(locale),
    locale,
    membership: ctx,
    store,
    workspaceKind: input.workspaceKind,
  });
  await store.putAttempt({
    ...attempt,
    contextDigest: envelope.contextDigest,
    contextDroppedIds: envelope.document.dropped.map((row) => row.recordId),
    contextHash: envelope.contextDigest,
    contextRef: envelope.contextRef,
  });
  const hiddenIds = [
    ...hiddenIdentityTokens(ctx),
    ...entityIdsFromDocument(envelope.document),
  ];
  const scratch = input.scratch ?? createInteractionScratch();
  const model = input.model ?? resolveLanguageModel();

  await coordinator.advanceStage(attemptId, "reasoning");
  const reasoned = await reasonTurn({
    executeWork: input.executeWork,
    inbound: input.inbound,
    inboundText,
    locale,
    model,
    prompt: reasoningPrompt(envelope.projection.data),
    scratch,
  });

  await coordinator.advanceStage(attemptId, "rendering");
  const sealed = isSealedSilencePath(reasoned.path);
  const rendered = renderTurn({
    hiddenIds,
    hrefFallback: sealed ? undefined : hrefFromDocument(envelope.document),
    inbound: input.inbound,
    inboundText,
    scratch,
    sealed,
  });
  const result: OutboundTurn = {
    bubbles: rendered.bubbles,
    href: rendered.href,
    reasonTurn: {
      attemptId: envelope.contextRef,
      bubbleCount: rendered.bubbles.length,
      errorClass: reasoned.errorClass,
      errorMessage: reasoned.errorMessage,
      generate: reasoned.generate,
      generateMs: reasoned.generateMs,
      hasMemory: envelope.document.records.some(
        (record) => record.trustClass === "personal_memory",
      ),
      hasWorld: envelope.document.records.some(
        (record) => record.trustClass === "world",
      ),
      hrefHost: rendered.href?.hostname ?? null,
      hrefPath: rendered.href?.pathname ?? null,
      hrefPresent: rendered.href !== null,
      hrefSource: rendered.hrefSource,
      model: languageModelId(model),
      path: reasoned.path,
      recordCount: envelope.document.records.length,
      rivals: rivalCount(envelope.document),
      tools: [...scratch.tools],
    },
  };

  await coordinator.advanceStage(attemptId, "planning_delivery");
  return result;
}

/**
 * Place href into the bubble list when the agent minted one but did not speak it.
 */
export function outboundBubbles(result: OutboundTurn): string[] {
  const bubbles = result.bubbles
    .map((bubble) => bubble.trim())
    .filter((bubble) => bubble.length > 0);
  const href = result.href;
  if (href !== null && !bubbles.some((bubble) => bubble.includes(href.href))) {
    return [...bubbles, href.href];
  }
  return bubbles;
}

export function detectInboundLocale(text: string): InteractionLocale {
  if (text.trim().length === 0) {
    return "pt";
  }
  if (
    /[áàâãéêíóôõúç]/i.test(text) ||
    /\b(oi|olá|ola|obrigad[oa]|por favor|quanto|pedido|cotação|cotacao|não|nao|você|voce|prazo|manda)\b/i.test(
      text,
    )
  ) {
    return "pt";
  }
  if (
    /\b(hi|hey|hello|please|thanks|thank you|how much|quote|order)\b/i.test(text)
  ) {
    return "en";
  }
  return "pt";
}

export function inboundBodyText(inbound: InteractionInbound): string {
  switch (inbound.kind) {
    case "text":
      return inbound.text;
    case "media":
      return "";
    default: {
      const exhaustive: never = inbound;
      return exhaustive;
    }
  }
}

/**
 * Narrow a channel inbound to the live Interaction contract.
 * Non-text/media kinds become empty text so the turn can fail closed.
 */
export function toInteractionInbound(
  inbound: InboundInteraction,
): InteractionInbound {
  switch (inbound.body.kind) {
    case "text":
      return { kind: "text", text: inbound.body.text };
    case "media":
      return {
        kind: "media",
        mediaRef: inbound.body.mediaRef,
        mime: inbound.body.mime,
      };
    case "control_click":
    case "reaction":
    case "unsupported":
      return { kind: "text", text: "" };
    default: {
      const exhaustive: never = inbound.body;
      return exhaustive;
    }
  }
}

export function resolveLanguageModel(
  env: NodeJS.ProcessEnv = process.env,
): LanguageModel | undefined {
  const specified = env.ZOEN_MODEL?.trim();
  if (specified === undefined || specified.length === 0) {
    return undefined;
  }
  const openaiKey = env.OPENAI_API_KEY?.trim();
  const anthropicKey = env.ANTHROPIC_API_KEY?.trim();
  const parsed = parseModelRef(specified);
  switch (parsed.provider) {
    case "anthropic":
      if (anthropicKey === undefined) {
        return undefined;
      }
      return createAnthropic({ apiKey: anthropicKey }).messages(parsed.modelId);
    case "openai":
      if (openaiKey === undefined) {
        return undefined;
      }
      return createOpenAI({ apiKey: openaiKey }).chat(parsed.modelId);
    case "openai-compatible": {
      const baseURL = env.OPENAI_BASE_URL?.trim();
      if (openaiKey === undefined || baseURL === undefined) {
        return undefined;
      }
      return createOpenAICompatible({
        apiKey: openaiKey,
        baseURL,
        name: "zoen",
      }).chatModel(parsed.modelId);
    }
    default: {
      const exhaustive: never = parsed.provider;
      return exhaustive;
    }
  }
}

function parseModelRef(specified: string): {
  readonly modelId: string;
  readonly provider: "anthropic" | "openai" | "openai-compatible";
} {
  const separator = specified.includes("/")
    ? "/"
    : specified.includes(":")
      ? ":"
      : undefined;
  if (separator === undefined) {
    return { modelId: specified, provider: "openai" };
  }
  const provider = specified.slice(0, specified.indexOf(separator));
  const modelId = specified.slice(specified.indexOf(separator) + 1);
  switch (provider) {
    case "anthropic":
    case "openai":
    case "openai-compatible":
      return { modelId, provider };
    default:
      return { modelId: specified, provider: "openai" };
  }
}

function languageModelId(model: LanguageModel | undefined): string | null {
  if (model === undefined || typeof model !== "object" || model === null) {
    return null;
  }
  if (!("modelId" in model)) {
    return null;
  }
  const id = model.modelId;
  if (typeof id !== "string") {
    return null;
  }
  const trimmed = id.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function generateErrorClass(error: unknown): string {
  if (error instanceof Error) {
    const name = error.name.trim();
    if (name.length > 0) {
      return name;
    }
    const ctor = error.constructor.name.trim();
    if (ctor.length > 0) {
      return ctor;
    }
    return "Error";
  }
  return "Unknown";
}

const MAX_THROW_MESSAGE = 240;

function generateErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const redacted = redactCredentialText(raw);
  if (redacted.length <= MAX_THROW_MESSAGE) {
    return redacted;
  }
  return `${redacted.slice(0, MAX_THROW_MESSAGE)}...`;
}

async function claimAttempt(input: {
  readonly attemptId?: TurnAttemptId;
  readonly coordinator: ConversationTurnCoordinator;
  readonly ctx: TrustedInteractionContext;
  readonly inbound: InteractionInbound;
  readonly now: () => Date;
}): Promise<TurnAttemptId> {
  if (input.attemptId !== undefined) {
    return input.attemptId;
  }
  const record = interactionRecord(input.ctx, input.inbound, input.now);
  const conversationKey = conversationKeyFromMembership(input.ctx);
  await input.coordinator.signalInbound({
    conversationKey,
    record,
    workspaceId: input.ctx.workloadId,
  });
  const claimed = await input.coordinator.awaitClaim(conversationKey);
  if (claimed === undefined) {
    throw new Error("interaction turn claimed no inbound");
  }
  return claimed.attempt.id;
}

function interactionRecord(
  ctx: TrustedInteractionContext,
  inbound: InteractionInbound,
  now: () => Date,
): InteractionRecord {
  return {
    acceptedAt: now().toISOString(),
    ctx,
    id: interactionId(`ixn_${randomBytes(12).toString("hex")}`),
    inbound: {
      audienceObservation: audienceObservationFromMembership(ctx),
      body: inbound,
      channel: ctx.channel,
      idempotencyKey: inboundIdempotencyKey(ctx, inbound),
    },
    semanticCorrelationKey: `turn:${ctx.membershipId}`,
  };
}

function inboundIdempotencyKey(
  ctx: TrustedInteractionContext,
  inbound: InteractionInbound,
): string {
  switch (inbound.kind) {
    case "text":
      return `turn:${ctx.membershipId}:text:${inbound.text.slice(0, 48)}`;
    case "media":
      return `turn:${ctx.membershipId}:media:${inbound.mediaRef.slice(0, 48)}`;
    default: {
      const exhaustive: never = inbound;
      return exhaustive;
    }
  }
}

interface ReasonTurnResult {
  readonly errorClass: string | null;
  readonly errorMessage: string | null;
  readonly generate: ReasonTurnGenerate;
  readonly generateMs: number;
  readonly path: ReasonTurnPath;
  readonly scratch: InteractionScratch;
}

async function reasonTurn(input: {
  readonly executeWork?: (task: string) => Promise<string>;
  readonly inbound: InteractionInbound;
  readonly inboundText: string;
  readonly locale: InteractionLocale;
  readonly model: LanguageModel | undefined;
  readonly prompt: string;
  readonly scratch: InteractionScratch;
}): Promise<ReasonTurnResult> {
  const scratch = input.scratch;
  if (input.model === undefined) {
    return {
      errorClass: null,
      errorMessage: null,
      generate: "ok",
      generateMs: 0,
      path: "noModel",
      scratch: applyFailCopy(scratch, input.locale),
    };
  }
  const agent = new ToolLoopAgent({
    instructions: interactionInstructions(input.locale),
    maxRetries: 0,
    model: input.model,
    stopWhen: isStepCount(8),
    tools: createInteractionTools(scratch, {
      executeWork: input.executeWork,
    }),
  });
  const started = Date.now();
  try {
    await agent.generate({
      prompt: input.prompt,
    });
  } catch (error: unknown) {
    return {
      errorClass: generateErrorClass(error),
      errorMessage: generateErrorMessage(error),
      generate: "throw",
      generateMs: Date.now() - started,
      path: "threw",
      scratch: silenceScratch(scratch),
    };
  }
  const generateMs = Date.now() - started;
  if (scratch.waited) {
    return {
      errorClass: null,
      errorMessage: null,
      generate: "ok",
      generateMs,
      path: "wait",
      scratch: silenceScratch(scratch),
    };
  }
  if (scratch.bubbles.length === 0 && input.inboundText.trim().length > 0) {
    return {
      errorClass: null,
      errorMessage: null,
      generate: "ok",
      generateMs,
      path: "lookupFail",
      scratch: applyFailCopy(scratch, input.locale),
    };
  }
  return {
    errorClass: null,
    errorMessage: null,
    generate: "ok",
    generateMs,
    path: scratch.bubbles.length === 0 ? "wait" : "spoke",
    scratch,
  };
}

function silenceScratch(scratch: InteractionScratch): InteractionScratch {
  scratch.bubbles.length = 0;
  return scratch;
}

function isSealedSilencePath(path: ReasonTurnPath): boolean {
  switch (path) {
    case "threw":
    case "wait":
      return true;
    case "lookupFail":
    case "noModel":
    case "spoke":
      return false;
    default: {
      const exhaustive: never = path;
      return exhaustive;
    }
  }
}

function applyFailCopy(
  scratch: InteractionScratch,
  locale: InteractionLocale,
): InteractionScratch {
  silenceScratch(scratch);
  scratch.waited = false;
  scratch.bubbles.push(locale === "pt" ? FAIL_CLOSED_PT : FAIL_CLOSED_EN);
  return scratch;
}

function renderTurn(input: {
  readonly hiddenIds: readonly string[];
  readonly hrefFallback?: string;
  readonly inbound: InteractionInbound;
  readonly inboundText: string;
  readonly scratch: InteractionScratch;
  readonly sealed: boolean;
}): {
  readonly bubbles: string[];
  readonly href: URL | null;
  readonly hrefSource: ReasonTurnHrefSource;
} {
  if (input.sealed) {
    return { bubbles: [], href: null, hrefSource: "none" };
  }
  const spoken: string[] = [];
  for (const raw of input.scratch.bubbles) {
    for (const piece of splitSpokenBubbles(raw)) {
      const cleaned = sanitizeUserText(
        piece,
        input.hiddenIds,
        input.scratch.executionNotes,
      );
      if (cleaned.length > 0) {
        spoken.push(cleaned);
      }
    }
  }
  const picked = pickHref(spoken, input.hrefFallback);
  const emptyInbound =
    input.inbound.kind === "text" && input.inboundText.trim().length === 0;
  const stripped = emptyInbound
    ? spoken.filter((bubble) => !containsHiddenId(bubble, input.hiddenIds))
    : spoken;
  return { bubbles: stripped, href: picked.href, hrefSource: picked.source };
}

function pickHref(
  bubbles: readonly string[],
  hrefFallback: string | undefined,
): { readonly href: URL | null; readonly source: ReasonTurnHrefSource } {
  for (const bubble of bubbles) {
    const found = bubble.match(/https:\/\/[^\s]+/gi) ?? [];
    for (const url of found) {
      const href = parseHttpsUrl(url);
      if (href !== null) {
        return { href, source: "speech" };
      }
    }
  }
  if (hrefFallback !== undefined) {
    const href = parseHttpsUrl(hrefFallback);
    if (href !== null) {
      return { href, source: "fallback" };
    }
  }
  return { href: null, source: "none" };
}

function parseHttpsUrl(value: string): URL | null {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed : null;
  } catch {
    return null;
  }
}

function sanitizeUserText(
  text: string,
  hiddenIds: readonly string[],
  executionNotes: readonly string[] = [],
): string {
  let next = text.replace(
    /\b(speak_to_user|spawn_execution|mint_href|note|remind|wait|request_external|ToolLoopAgent|LangGraph|Mastra)\b/gi,
    "",
  );
  next = stripTokens(next, hiddenIds);
  next = stripTokens(next, executionNotes);
  return next.replace(/\s{2,}/gu, " ").trim();
}

function stripTokens(text: string, tokens: readonly string[]): string {
  let next = text;
  for (const token of tokens) {
    if (token.length === 0) {
      continue;
    }
    next = next.split(token).join("");
  }
  return next;
}

function containsHiddenId(text: string, hiddenIds: readonly string[]): boolean {
  return hiddenIds.some((id) => id.length > 0 && text.includes(id));
}

function hiddenIdentityTokens(ctx: TrustedInteractionContext): string[] {
  return [
    ctx.accountId,
    ctx.actorId,
    ctx.bindingId,
    ctx.membershipId,
    String(ctx.principalId),
    String(ctx.tenantId),
    ctx.workloadId,
  ].filter((token) => token.length > 0);
}

function conversationKeyFromMembership(
  ctx: TrustedInteractionContext,
): ReturnType<typeof conversationKeyFromKind> {
  return conversationKeyFromChannel({
    accountId: ctx.accountId,
    channel: ctx.channel,
    tenantId: String(ctx.tenantId),
    workspaceId: ctx.workloadId,
  });
}

function audienceObservationFromMembership(
  ctx: TrustedInteractionContext,
): AudienceObservation {
  return { kind: audienceKindFromMembership(ctx) };
}

function rivalCount(document: ConversationContextDocument): number {
  let count = 0;
  for (const record of document.records) {
    if (record.payload.type === "world") {
      count += record.payload.rivals.length;
    }
  }
  return count;
}

function hrefFromDocument(
  document: ConversationContextDocument,
): string | undefined {
  for (const record of document.records) {
    if (record.payload.type !== "world") {
      continue;
    }
    for (const note of record.payload.notes) {
      const found = note.match(/https:\/\/[^\s]+/i);
      if (found?.[0] !== undefined) {
        return found[0];
      }
    }
  }
  return undefined;
}

function entityIdsFromDocument(
  document: ConversationContextDocument,
): string[] {
  const ids: string[] = [];
  for (const record of document.records) {
    if (record.payload.type !== "world") {
      continue;
    }
    for (const note of record.payload.notes) {
      if (looksLikeEntityId(note)) {
        ids.push(note);
      }
    }
    for (const rival of record.payload.rivals) {
      if (looksLikeEntityId(rival.label)) {
        ids.push(rival.label);
      }
    }
  }
  return ids;
}

export function firstContactAddendum(locale: InteractionLocale): string {
  switch (locale) {
    case "pt":
      return [
        "esta é a primeira mensagem de uma pessoa desconhecida",
        "cumpra como um amigo afiado",
        "se disseram oi, só cumprimente",
        "convide numa linha curta",
        "nunca diga que não está vinculado, desvinculado, sem cadastro, unbound, unlinked, unregistered",
        "nunca despeje checklist de setup",
        "sem uuid, sem helpdesk, sem nome de worker ou tool",
        "o https já vem no turno; não invente outro URL",
      ].join("\n");
    case "en":
      return [
        "this is the first message from an unknown person",
        "greet like a sharp friend",
        "if they said hi or oi, only greet",
        "invite them in one short line",
        "never say they are unbound, unlinked, or unregistered",
        "never dump a setup checklist",
        "no uuid, no helpdesk, no worker or tool names",
        "the https is already on the turn; do not invent another URL",
      ].join("\n");
    default: {
      const exhaustive: never = locale;
      return exhaustive;
    }
  }
}

export function firstContactInstructions(locale: InteractionLocale): string {
  return `${interactionInstructions(locale)}\n${firstContactAddendum(locale)}`;
}

export async function runFirstContactTurn(input: {
  readonly inboundText: string;
  readonly assembler?: ConversationContextAssembler;
  readonly generate?: (inboundText: string) => Promise<string>;
  readonly href?: string;
  readonly model?: LanguageModel;
}): Promise<string> {
  const locale = detectInboundLocale(input.inboundText);
  const fallback = locale === "en" ? "hey" : "oi";
  const assembler =
    input.assembler ?? createConversationContextAssembler();
  const assembly = await assembler.assembleUnbound({
    href: input.href,
    inbound: { kind: "text", text: input.inboundText },
    instructions: firstContactInstructions(locale),
    locale,
  });
  let spoken: string;
  if (input.generate !== undefined) {
    spoken = (await input.generate(input.inboundText)).trim();
  } else {
    const model = input.model ?? resolveLanguageModel();
    if (model === undefined) {
      spoken = fallback;
    } else {
      const scratch = createInteractionScratch();
      const agent = new ToolLoopAgent({
        instructions: firstContactInstructions(locale),
        maxRetries: 0,
        model,
        stopWhen: isStepCount(8),
        tools: createFirstContactTools(scratch),
      });
      try {
        await agent.generate({
          prompt: reasoningPrompt(assembly.projection.data),
        });
        spoken = scratch.bubbles
          .map((bubble) => bubble.trim())
          .filter((bubble) => bubble.length > 0)
          .join("\n");
        if (spoken.length === 0) {
          spoken = fallback;
        }
      } catch {
        spoken = fallback;
      }
    }
  }
  return injectHref(spoken, input.href);
}

function injectHref(spoken: string, href: string | undefined): string {
  if (href === undefined || href.trim().length === 0) {
    return spoken;
  }
  if (spoken.includes(href)) {
    return spoken;
  }
  if (spoken.trim().length === 0) {
    return href;
  }
  return `${spoken.trim()}\n${href}`;
}

export function interactionInstructions(locale: InteractionLocale): string {
  switch (locale) {
    case "pt":
      return [
        "você é a zoen. uma só entidade. você fala com a pessoa. execution nunca fala",
        "texto visível só por speak_to_user. spawn_execution trabalha fora. nunca invente um URL",
        "lembrar ou anotar: spawn_execution. só diga que deu certo se o status for committed. senão fale que não conseguiu. nunca invente que guardou",
        "nunca fale proposal, operation, claim, tenant, principal nem hash",
        "valeu, ok, show, obrigado: chame wait. sem bolha. não fale",
        "oi, e aí, fala, hi, hey: speak_to_user. nunca wait",
        "minúsculas por padrão. linha curta sem ponto final. sem travessão",
        "casa língua e tamanho. inbound em pt sai em pt. um oi é um oi, não um parágrafo",
        "proibido: How can I help you. Como posso te auxiliar. Let me know if you need anything. Estou por aqui e pronto para ajudar. Recebi",
        "world é o assunto. rivais se falam como sujeito. duas leituras ficam de pé. não cumprimente no lugar de responder",
        "sem link falso. sem app.zoen.local. sem nome de tool no texto",
        "erro: não consegui [ação] / deu ruim ao [ação]. fiz merda só se a gente quebrou parse ou código",
        "xinga só se a pessoa já xinga muito nesta conversa. nunca comece",
      ].join("\n");
    case "en":
      return [
        "you are zoen. one entity. you talk to the person. execution never talks",
        "visible text only from speak_to_user. spawn_execution works off-chat. never invent a URL",
        "note or remind: spawn_execution. say it worked only when status is committed. otherwise say you couldn't. never invent a save",
        "never speak proposal, operation, claim, tenant, principal, or hash",
        "thanks, ok, show: call wait. no bubble. do not speak",
        "oi, e aí, fala, hi, hey: speak_to_user. never wait",
        "lowercase default. short line, no trailing period. no em dash",
        "match language and length. english in, english out. a hi is a hi, not a paragraph",
        "forbidden: How can I help you. Como posso te auxiliar. Let me know if you need anything. Estou por aqui e pronto para ajudar. Recebi",
        "world is the subject. speak rivals as the subject. two readings stand. do not greet instead of answering",
        "no fake link. no app.zoen.local. no tool names in user text",
        "errors: couldn't [action] / that broke while [action]. 'fiz merda' only for our parse or code bugs",
        "swear only if the person already swears a lot in this conversation. never go first",
      ].join("\n");
    default: {
      const exhaustive: never = locale;
      return exhaustive;
    }
  }
}

/**
 * User prompt for one turn. Only labeled `projection.data`.
 * Instruction copy stays on ToolLoopAgent.instructions and is not hashed.
 */
export function reasoningPrompt(data: string): string {
  return data;
}
