import { randomBytes } from "node:crypto";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { isStepCount, ToolLoopAgent, type LanguageModel } from "ai";
import {
  conversationKeyFrom,
  interactionId,
  type TurnAttemptId,
} from "./brands.js";
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
  TURN_STATUS_AFTER_MS,
  type ConversationTurnCoordinator,
} from "./turn-coordinator.js";
import { createMemoryTurnStore, type TurnStore } from "./turn-store.js";
import type {
  InboundInteraction,
  InteractionRecord,
  TrustedInteractionContext,
} from "./types.js";
import {
  createSpeakerActionClientFromEnv,
  type PersonalWriteKind,
  type SpeakerActionClient,
} from "./osdk-action-client.js";
import type { ChannelAssurance } from "./permission.js";
import { createWorldQueryClientFromEnv } from "./osdk-world-query.js";
import type {
  WorldQueryClient,
  WorldQuerySnapshot,
} from "./world-query.js";

export type ReasonTurnPath =
  | "lookupFail"
  | "threw"
  | "noModel"
  | "spoke"
  | "wait";

export type ReasonTurnGenerate = "ok" | "throw";

/**
 * Live outbound for one Interaction turn.
 * `href` is always present: a URL or null. Empty `bubbles` means wait (no send).
 * Visible text is speak_to_user, or the single fail copy on noModel/threw/lookupFail.
 */
export interface OutboundTurn {
  readonly bubbles: string[];
  readonly href: URL | null;
  readonly reasonTurn: {
    readonly path: ReasonTurnPath;
    readonly rivals: number;
    readonly generate: ReasonTurnGenerate;
  };
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
  readonly channelAssurance?: ChannelAssurance;
  readonly publicWebOrigin?: string;
  /** Status bubble after generate/spawn_execution exceeds this. Default 2000. */
  readonly statusAfterMs?: number;
  readonly debounceMs?: number;
  readonly clock?: () => number;
  readonly actions?: SpeakerActionClient;
}

const FAIL_CLOSED_PT = "não consegui consultar agora";
const FAIL_CLOSED_EN = "couldn't look that up";
const WRITE_FAIL_PT = {
  note: "não consegui anotar agora",
  remind: "não consegui agendar agora",
} as const;
const WRITE_FAIL_EN = {
  note: "couldn't note that down now",
  remind: "couldn't schedule that now",
} as const;
const STATUS_AFTER_MS = TURN_STATUS_AFTER_MS;

export interface ReasonTurnLog {
  readonly event: "reasonTurn";
  readonly path: ReasonTurnPath;
  readonly rivals: number;
  readonly generate: ReasonTurnGenerate;
}

/**
 * Run one Interaction turn: coordinator stages plus a ToolLoopAgent reasoning step.
 *
 * Context: bound 1:1 WhatsApp (and other channels) after membership resolve.
 * Inputs: membership + inbound. Optional model/world/coordinator for tests.
 * Outputs: conversational bubbles and at most one https URL. Empty bubbles mean wait (no send).
 * A successful generate that never called speak_to_user on non-empty inbound is a lookup fail, not a wait.
 * Closing inbound should call the `wait` tool. That is an empty send, not a lookup fail.
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
  const snapshot = await assembleWorld(ctx, input.world);
  const hiddenIds = hiddenIdentityTokens(ctx, snapshot);

  await coordinator.advanceStage(attemptId, "reasoning");
  const reasoned = await reasonTurn({
    actions: input.actions ?? createSpeakerActionClientFromEnv(),
    channelAssurance: input.channelAssurance,
    executeWork: input.executeWork,
    publicWebOrigin: input.publicWebOrigin,
    inbound: input.inbound,
    inboundText,
    locale,
    model: input.model ?? resolveLanguageModel(),
    snapshot,
    clock: input.clock,
    statusAfterMs: input.statusAfterMs ?? STATUS_AFTER_MS,
  });
  const scratch = reasoned.scratch;

  await coordinator.advanceStage(attemptId, "rendering");
  const rendered = renderTurn({
    hiddenIds,
    inbound: input.inbound,
    inboundText,
    scratch,
    snapshot,
  });
  const result: OutboundTurn = {
    ...rendered,
    reasonTurn: {
      generate: reasoned.generate,
      path: reasoned.path,
      rivals: snapshot?.rivals.length ?? 0,
    },
  };
  emitReasonTurnLog(result.reasonTurn);

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
  const conversationKey = conversationKeyFrom({
    accountId: input.ctx.accountId,
    conversationId: `${String(input.ctx.channel.provider)}:${String(input.ctx.channel.thread)}`,
    tenantId: String(input.ctx.tenantId),
    workspaceId: input.ctx.workloadId,
  });
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
      audienceObservation: { kind: "dm" },
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

async function assembleWorld(
  ctx: TrustedInteractionContext,
  world: WorldQueryClient | undefined,
): Promise<WorldQuerySnapshot | undefined> {
  const client = world ?? createWorldQueryClientFromEnv();
  if (client === undefined) {
    return undefined;
  }
  try {
    return await client.semanticQuery({
      membershipId: ctx.membershipId,
      tenantId: String(ctx.tenantId),
    });
  } catch {
    return undefined;
  }
}

interface ReasonTurnResult {
  readonly generate: ReasonTurnGenerate;
  readonly path: ReasonTurnPath;
  readonly scratch: InteractionScratch;
}

async function reasonTurn(input: {
  readonly actions?: SpeakerActionClient;
  readonly channelAssurance?: ChannelAssurance;
  readonly publicWebOrigin?: string;
  readonly executeWork?: (task: string) => Promise<string>;
  readonly inbound: InteractionInbound;
  readonly inboundText: string;
  readonly locale: InteractionLocale;
  readonly model: LanguageModel | undefined;
  readonly snapshot: WorldQuerySnapshot | undefined;
  readonly statusAfterMs: number;
  readonly clock?: () => number;
}): Promise<ReasonTurnResult> {
  if (input.model === undefined) {
    return {
      generate: "ok",
      path: "noModel",
      scratch: failCopyScratch(input.locale),
    };
  }
  const scratch = createInteractionScratch();
  const agent = new ToolLoopAgent({
    instructions: interactionInstructions(input.locale),
    maxRetries: 0,
    model: input.model,
    stopWhen: isStepCount(8),
    tools: createInteractionTools(scratch, {
      actions: input.actions,
      channelAssurance: input.channelAssurance,
      clock: input.clock,
      executeWork: input.executeWork,
      publicWebOrigin: input.publicWebOrigin,
      statusAfterMs: input.statusAfterMs,
    }),
  });
  const nowMs = input.clock ?? Date.now;
  const started = nowMs();
  try {
    await agent.generate({
      prompt: reasoningPrompt(
        input.inbound,
        input.inboundText,
        input.snapshot,
        input.locale,
      ),
    });
  } catch {
    return {
      generate: "throw",
      path: "threw",
      scratch: failCopyScratch(input.locale),
    };
  }
  if (scratch.writeFail !== undefined) {
    return {
      generate: "ok",
      path: "spoke",
      scratch: writeFailScratch(input.locale, scratch.writeFail),
    };
  }
  if (scratch.waited) {
    scratch.bubbles.length = 0;
    scratch.href = undefined;
    return { generate: "ok", path: "wait", scratch };
  }
  if (scratch.bubbles.length === 0 && input.inboundText.trim().length > 0) {
    return {
      generate: "ok",
      path: "lookupFail",
      scratch: failCopyScratch(input.locale),
    };
  }
  const slow =
    nowMs() - started > input.statusAfterMs || scratch.slowWork;
  if (slow && scratch.bubbles.length > 0) {
    applySlowStatus(scratch, input.locale, input.inboundText);
  }
  return {
    generate: "ok",
    path: scratch.bubbles.length === 0 ? "wait" : "spoke",
    scratch,
  };
}

function emitReasonTurnLog(reasonTurn: OutboundTurn["reasonTurn"]): void {
  const line: ReasonTurnLog = {
    event: "reasonTurn",
    path: reasonTurn.path,
    rivals: reasonTurn.rivals,
    generate: reasonTurn.generate,
  };
  process.stderr.write(`${JSON.stringify(line)}\n`);
}

function applySlowStatus(
  scratch: InteractionScratch,
  locale: InteractionLocale,
  seed: string,
): void {
  const first = scratch.bubbles[0];
  if (first !== undefined && isStatusPhrase(first, locale)) {
    return;
  }
  scratch.bubbles.unshift(pickStatusPhrase(locale, seed));
}

function pickStatusPhrase(locale: InteractionLocale, seed: string): string {
  let sum = 0;
  for (const char of seed) {
    sum = (sum + char.charCodeAt(0)) | 0;
  }
  const even = Math.abs(sum) % 2 === 0;
  switch (locale) {
    case "en":
      return even ? "looking" : "one sec";
    case "pt":
      return even ? "vendo aqui" : "um seg";
    default: {
      const exhaustive: never = locale;
      return exhaustive;
    }
  }
}

function isStatusPhrase(text: string, locale: InteractionLocale): boolean {
  const needle = text.trim();
  switch (locale) {
    case "en":
      return needle === "looking" || needle === "one sec";
    case "pt":
      return needle === "vendo aqui" || needle === "um seg";
    default: {
      const exhaustive: never = locale;
      return exhaustive;
    }
  }
}

function failCopyScratch(locale: InteractionLocale): InteractionScratch {
  const scratch = createInteractionScratch();
  scratch.bubbles.push(locale === "pt" ? FAIL_CLOSED_PT : FAIL_CLOSED_EN);
  return scratch;
}

function writeFailScratch(
  locale: InteractionLocale,
  kind: PersonalWriteKind,
): InteractionScratch {
  const scratch = createInteractionScratch();
  switch (locale) {
    case "pt":
      scratch.bubbles.push(WRITE_FAIL_PT[kind]);
      break;
    case "en":
      scratch.bubbles.push(WRITE_FAIL_EN[kind]);
      break;
    default: {
      const exhaustive: never = locale;
      return exhaustive;
    }
  }
  return scratch;
}

function renderTurn(input: {
  readonly hiddenIds: readonly string[];
  readonly inbound: InteractionInbound;
  readonly inboundText: string;
  readonly scratch: InteractionScratch;
  readonly snapshot: WorldQuerySnapshot | undefined;
}): { readonly bubbles: string[]; readonly href: URL | null } {
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
  const href = pickHref(input.scratch.href, spoken, input.snapshot);
  const emptyInbound =
    input.inbound.kind === "text" && input.inboundText.trim().length === 0;
  const stripped = emptyInbound
    ? spoken.filter((bubble) => !containsHiddenId(bubble, input.hiddenIds))
    : spoken;
  return { bubbles: stripped, href };
}

function pickHref(
  minted: string | undefined,
  bubbles: readonly string[],
  snapshot: WorldQuerySnapshot | undefined,
): URL | null {
  const candidates: string[] = [];
  if (minted !== undefined) {
    candidates.push(minted);
  }
  for (const bubble of bubbles) {
    const found = bubble.match(/https:\/\/[^\s]+/gi) ?? [];
    for (const url of found) {
      candidates.push(url);
    }
  }
  if (snapshot?.href !== undefined && candidates.length === 0) {
    candidates.push(snapshot.href);
  }
  for (const candidate of candidates) {
    const parsed = parseHttpsUrl(candidate);
    if (parsed !== null) {
      return parsed;
    }
  }
  return null;
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
    /\b(speak_to_user|spawn_execution|mint_href|note|remind|wait|ToolLoopAgent|LangGraph|Mastra)\b/gi,
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

function hiddenIdentityTokens(
  ctx: TrustedInteractionContext,
  snapshot: WorldQuerySnapshot | undefined,
): string[] {
  return [
    ctx.accountId,
    ctx.actorId,
    ctx.bindingId,
    ctx.membershipId,
    String(ctx.principalId),
    String(ctx.tenantId),
    ctx.workloadId,
    ...(snapshot?.entityIds ?? []),
  ].filter((token) => token.length > 0);
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
  readonly generate?: (inboundText: string) => Promise<string>;
  readonly href?: string;
  readonly model?: LanguageModel;
}): Promise<string> {
  const locale = detectInboundLocale(input.inboundText);
  const fallback = locale === "en" ? "hey" : "oi";
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
          prompt: [
            firstContactAddendum(locale),
            "",
            `inbound: ${input.inboundText}`,
            input.href === undefined ? "" : `href: ${input.href}`,
          ]
            .filter((line) => line.length > 0)
            .join("\n"),
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
        "texto visível só por speak_to_user. spawn_execution trabalha fora. mint_href: no máximo um https de verdade",
        "note grava memória. remind agenda. só speak_to_user depois que a tool voltar ok. se falhar, não diga que anotou ou agendou",
        "preview da tool é o texto canônico. nunca fale proposal, operation, claim, tenant, principal nem hash",
        "valeu, ok, show, obrigado: chame wait. sem bolha. não fale",
        "oi, e aí, fala, hi, hey: speak_to_user. nunca wait",
        "minúsculas por padrão. linha curta sem ponto final. sem travessão",
        "casa língua e tamanho. inbound em pt sai em pt. um oi é um oi, não um parágrafo",
        "proibido: How can I help you. Como posso te auxiliar. Let me know if you need anything. Estou por aqui e pronto para ajudar. Recebi",
        "world é o assunto. rivais se falam como sujeito. duas leituras ficam de pé. não cumprimente no lugar de responder",
        "status (vendo aqui / um seg) só se generate ou spawn_execution passar de 2s. turno rápido: sem essa bolha",
        "sem link falso. sem app.zoen.local. sem nome de tool no texto",
        "erro: não consegui [ação] / deu ruim ao [ação]. fiz merda só se a gente quebrou parse ou código",
        "xinga só se a pessoa já xinga muito nesta conversa. nunca comece",
      ].join("\n");
    case "en":
      return [
        "you are zoen. one entity. you talk to the person. execution never talks",
        "visible text only from speak_to_user. spawn_execution works off-chat. mint_href: at most one real https",
        "note writes a memory. remind schedules. speak_to_user only after the tool returns ok. if it fails, do not claim you wrote or scheduled it",
        "tool preview is the canonical text. never speak proposal, operation, claim, tenant, principal, or hash",
        "thanks, ok, show: call wait. no bubble. do not speak",
        "oi, e aí, fala, hi, hey: speak_to_user. never wait",
        "lowercase default. short line, no trailing period. no em dash",
        "match language and length. english in, english out. a hi is a hi, not a paragraph",
        "forbidden: How can I help you. Como posso te auxiliar. Let me know if you need anything. Estou por aqui e pronto para ajudar. Recebi",
        "world is the subject. speak rivals as the subject. two readings stand. do not greet instead of answering",
        "status (looking / one sec) only if generate or spawn_execution exceeds 2s. fast turn: no status bubble",
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
 * User prompt for one turn. World rivals and notes are the subject, not optional JSON.
 * Empty world: answer the inbound. A greeting is a short speak_to_user, never wait.
 * World with rivals or notes: do not greet instead of answering.
 *
 * @param inbound - Live inbound (text or media)
 * @param inboundText - Body text already extracted from inbound
 * @param snapshot - Membership World snapshot, if assembled
 * @param locale - Detected inbound locale
 * @returns Prompt the model must answer
 */
export function reasoningPrompt(
  inbound: InteractionInbound,
  inboundText: string,
  snapshot: WorldQuerySnapshot | undefined,
  locale: InteractionLocale = "pt",
): string {
  const inboundBlock =
    inbound.kind === "text"
      ? `kind: text\ntext: ${inboundText}`
      : `kind: media\nmediaRef: ${inbound.mediaRef}`;
  const worldBlock = formatWorldSubject(snapshot, locale);
  const closer = reasoningCloser(locale, worldIsEmpty(snapshot));
  switch (locale) {
    case "pt":
      return [
        "Responde o inbound abaixo. O World abaixo é o assunto desta fala, não um JSON opcional que você pode ignorar.",
        "",
        "Inbound",
        inboundBlock,
        "",
        "World",
        worldBlock,
        "",
        closer,
      ].join("\n");
    case "en":
      return [
        "Answer the inbound below. The World below is the subject of this reply, not optional JSON you can ignore.",
        "",
        "Inbound",
        inboundBlock,
        "",
        "World",
        worldBlock,
        "",
        closer,
      ].join("\n");
    default: {
      const exhaustive: never = locale;
      return exhaustive;
    }
  }
}

function reasoningCloser(
  locale: InteractionLocale,
  emptyWorld: boolean,
): string {
  switch (locale) {
    case "pt":
      return emptyWorld
        ? "Responde o inbound. Cumprimento (oi, e aí, fala, hi, hey) é speak_to_user curto. Nunca wait. Não use as frases proibidas."
        : "Não cumprimente no lugar de responder. Não use as frases proibidas.";
    case "en":
      return emptyWorld
        ? "Answer the inbound. A greeting (oi, e aí, fala, hi, hey) is a short speak_to_user. Never wait. Do not use the forbidden phrases."
        : "Do not greet instead of answering. Do not use the forbidden phrases.";
    default: {
      const exhaustive: never = locale;
      return exhaustive;
    }
  }
}

function standingWorldReadings(snapshot: WorldQuerySnapshot | undefined): {
  readonly notes: readonly string[];
  readonly rivalLabels: readonly string[];
} {
  return {
    notes: (snapshot?.notes ?? [])
      .map((note) => note.trim())
      .filter((note) => note.length > 0),
    rivalLabels: (snapshot?.rivals ?? [])
      .map((rival) => rival.label.trim())
      .filter((label) => label.length > 0),
  };
}

function worldIsEmpty(snapshot: WorldQuerySnapshot | undefined): boolean {
  const standing = standingWorldReadings(snapshot);
  return standing.notes.length === 0 && standing.rivalLabels.length === 0;
}

function formatWorldSubject(
  snapshot: WorldQuerySnapshot | undefined,
  locale: InteractionLocale,
): string {
  const { notes, rivalLabels } = standingWorldReadings(snapshot);
  if (rivalLabels.length === 0 && notes.length === 0) {
    return locale === "pt"
      ? "(vazio. responde o inbound num toque curto)"
      : "(empty. answer the inbound in one short beat)";
  }
  const header =
    locale === "pt"
      ? "Estas são as leituras em pé. Se houver rivais ou notas, fala esses fatos. Duas leituras ficam de pé. Não invente entidades. Rivais convivem."
      : "These readings stand. If rivals or notes are present, speak those facts. Two readings stand. Do not invent entities. Rivals coexist.";
  const lines = [header];
  if (rivalLabels.length > 0) {
    lines.push("rivals:");
    for (const label of rivalLabels) {
      lines.push(`- ${label}`);
    }
  }
  if (notes.length > 0) {
    lines.push("notes:");
    for (const note of notes) {
      lines.push(`- ${note}`);
    }
  }
  return lines.join("\n");
}
