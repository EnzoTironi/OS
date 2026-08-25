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
  createInteractionScratch,
  createInteractionTools,
  splitSpokenBubbles,
  type InteractionScratch,
} from "./interaction-tools.js";
import {
  createConversationTurnCoordinator,
  type ConversationTurnCoordinator,
} from "./turn-coordinator.js";
import { createMemoryTurnStore, type TurnStore } from "./turn-store.js";
import type {
  InboundInteraction,
  InteractionRecord,
  TrustedInteractionContext,
} from "./types.js";
import { createWorldQueryClientFromEnv } from "./osdk-world-query.js";
import {
  looksLikeEntityId,
  type WorldQueryClient,
  type WorldQuerySnapshot,
} from "./world-query.js";

/**
 * Live outbound for one Interaction turn.
 * `href` is always present: a URL or null. Empty `bubbles` means wait (no send).
 */
export interface OutboundTurn {
  readonly bubbles: string[];
  readonly href: URL | null;
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
}

const FAIL_CLOSED_PT =
  "Não consegui consultar agora. Tenta de novo em instantes.";
const FAIL_CLOSED_EN =
  "I couldn't look that up just now. Try again in a moment.";
const EMPTY_INBOUND_PT = "Pode mandar de novo? Não entendi o que você precisa.";
const EMPTY_INBOUND_EN = "Can you send that again? I didn't catch what you need.";
const MEDIA_INBOUND_PT =
  "Ainda não abro arquivo por aqui. Manda em texto?";
const MEDIA_INBOUND_EN =
  "I can't open files here yet. Send it as text?";

/**
 * Run one Interaction turn: coordinator stages plus a ToolLoopAgent reasoning step.
 *
 * Context: bound 1:1 WhatsApp (and other channels) after membership resolve.
 * Inputs: membership + inbound. Optional model/world/coordinator for tests.
 * Outputs: conversational bubbles and at most one https URL. Empty bubbles mean wait (no send).
 * A successful generate that never called speak_to_user on non-empty inbound is a lookup fail, not a wait.
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
      debounceMs: 50,
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
  const scratch = await reasonTurn({
    executeWork: input.executeWork,
    inbound: input.inbound,
    inboundText,
    locale,
    model: input.model ?? resolveLanguageModel(),
    snapshot,
  });

  await coordinator.advanceStage(attemptId, "rendering");
  const result = renderTurn({
    hiddenIds,
    inbound: input.inbound,
    inboundText,
    locale,
    scratch,
    snapshot,
  });

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
  const claimed = await input.coordinator.claimBurst(conversationKey);
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

async function reasonTurn(input: {
  readonly executeWork?: (task: string) => Promise<string>;
  readonly inbound: InteractionInbound;
  readonly inboundText: string;
  readonly locale: InteractionLocale;
  readonly model: LanguageModel | undefined;
  readonly snapshot: WorldQuerySnapshot | undefined;
}): Promise<InteractionScratch> {
  if (input.model === undefined) {
    return failClosedScratch(
      input.locale,
      input.inbound,
      input.inboundText,
      input.snapshot,
    );
  }
  const scratch = createInteractionScratch();
  const agent = new ToolLoopAgent({
    instructions: interactionInstructions(input.locale),
    maxRetries: 0,
    model: input.model,
    stopWhen: isStepCount(8),
    tools: createInteractionTools(scratch, {
      executeWork: input.executeWork,
    }),
  });
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
    return failClosedScratch(
      input.locale,
      input.inbound,
      input.inboundText,
      input.snapshot,
    );
  }
  if (scratch.bubbles.length === 0 && input.inboundText.trim().length > 0) {
    return lookupFailScratch(input.locale);
  }
  return scratch;
}

/**
 * Hard fail after a successful generate that never called speak_to_user.
 * Lookup copy only. Does not speak World rivals.
 */
function lookupFailScratch(locale: InteractionLocale): InteractionScratch {
  const scratch = createInteractionScratch();
  scratch.bubbles.push(locale === "pt" ? FAIL_CLOSED_PT : FAIL_CLOSED_EN);
  return scratch;
}

function failClosedScratch(
  locale: InteractionLocale,
  inbound: InteractionInbound,
  inboundText: string,
  snapshot: WorldQuerySnapshot | undefined,
): InteractionScratch {
  const scratch = createInteractionScratch();
  const rivalLabels = (snapshot?.rivals ?? [])
    .map((rival) => rival.label.trim())
    .filter((label) => label.length > 0 && !looksLikeEntityId(label));
  switch (inbound.kind) {
    case "media":
      scratch.bubbles.push(
        locale === "pt" ? MEDIA_INBOUND_PT : MEDIA_INBOUND_EN,
      );
      return scratch;
    case "text":
      break;
    default: {
      const exhaustive: never = inbound;
      return exhaustive;
    }
  }
  if (inboundText.trim().length === 0) {
    scratch.bubbles.push(locale === "pt" ? EMPTY_INBOUND_PT : EMPTY_INBOUND_EN);
    return scratch;
  }
  if (rivalLabels.length >= 2) {
    scratch.bubbles.push(
      locale === "pt"
        ? "Tem mais de uma leitura e as duas ficam de pé."
        : "There is more than one reading, and both still stand.",
    );
    for (const label of rivalLabels) {
      scratch.bubbles.push(label);
    }
    if (snapshot?.href !== undefined) {
      scratch.href = snapshot.href;
    }
    return scratch;
  }
  scratch.bubbles.push(locale === "pt" ? FAIL_CLOSED_PT : FAIL_CLOSED_EN);
  return scratch;
}

function renderTurn(input: {
  readonly hiddenIds: readonly string[];
  readonly inbound: InteractionInbound;
  readonly inboundText: string;
  readonly locale: InteractionLocale;
  readonly scratch: InteractionScratch;
  readonly snapshot: WorldQuerySnapshot | undefined;
}): OutboundTurn {
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
  if (stripped.length === 0 && input.scratch.bubbles.length === 0) {
    return { bubbles: [], href };
  }
  if (stripped.length === 0) {
    return {
      bubbles: [
        input.locale === "pt" ? EMPTY_INBOUND_PT : EMPTY_INBOUND_EN,
      ],
      href,
    };
  }
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
    /\b(speak_to_user|spawn_execution|mint_href|ToolLoopAgent|LangGraph|Mastra)\b/gi,
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

/**
 * Locale-aware Interaction system prompt.
 * Interaction talks. Execution never talks to the person.
 *
 * @param locale - Detected inbound locale (`pt` or `en`)
 * @returns Instructions for ToolLoopAgent. Never names harness internals.
 */
export function interactionInstructions(locale: InteractionLocale): string {
  switch (locale) {
    case "pt":
      return [
        "Você é a Interaction da Zoen. Você conversa com uma pessoa. Execution nunca fala com ela.",
        "O único texto visível sai de speak_to_user. spawn_execution trabalha fora do chat. mint_href libera no máximo um https.",
        "Fala como um amigo ocupado: curto, quente, sem abertura e sem fecho de atendimento.",
        "Frases proibidas: How can I help you. Como posso te auxiliar. Let me know if you need anything. Estou por aqui e pronto para ajudar. Recebi.",
        "Responde o inbound mais recente. Se o World trouxer rivais ou notas, fala esses fatos. Duas leituras ficam de pé. Não cumprimente no lugar de responder.",
        "Responde em português do Brasil. Um oi ou um probe é um toque curto, não um parágrafo de helpdesk.",
        "Nunca cite tools, agents, models, ToolLoopAgent, spawn_execution.",
        "Não invente OrderLines nem ids de entidade. Rivais convivem. Não junte desacordo num número só.",
        "Não despeje membership, tenant ou entity id no texto. Sem widgets nativos do WhatsApp.",
      ].join("\n");
    case "en":
      return [
        "You are Zoen's Interaction. You talk to one person. Execution never talks to them.",
        "User-visible text comes only from speak_to_user. spawn_execution works off-chat. mint_href mints at most one https URL.",
        "Write like a busy friend: terse, warm, no preamble and no helpdesk sign-off.",
        "Forbidden phrases: How can I help you. Como posso te auxiliar. Let me know if you need anything. Estou por aqui e pronto para ajudar. Recebi.",
        "Answer the latest inbound. If World has rivals or notes, speak those facts. Two readings stand. Do not greet instead of answering.",
        "Reply in English. A hi or a probe is one short beat, not a helpdesk paragraph.",
        "Never mention tools, agents, models, ToolLoopAgent, spawn_execution.",
        "Never invent OrderLines or entity ids. Rival claims coexist. Do not collapse disagreement into one number.",
        "Do not dump membership, tenant, or entity ids into user text. No native WhatsApp widgets.",
      ].join("\n");
    default: {
      const exhaustive: never = locale;
      return exhaustive;
    }
  }
}

/**
 * User prompt for one turn. World rivals and notes are the subject, not optional JSON.
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
        "Não cumprimente no lugar de responder. Não use as frases proibidas.",
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
        "Do not greet instead of answering. Do not use the forbidden phrases.",
      ].join("\n");
    default: {
      const exhaustive: never = locale;
      return exhaustive;
    }
  }
}

function formatWorldSubject(
  snapshot: WorldQuerySnapshot | undefined,
  locale: InteractionLocale,
): string {
  const rivalLabels = (snapshot?.rivals ?? [])
    .map((rival) => rival.label.trim())
    .filter((label) => label.length > 0);
  const notes = (snapshot?.notes ?? [])
    .map((note) => note.trim())
    .filter((note) => note.length > 0);
  if (rivalLabels.length === 0 && notes.length === 0) {
    return locale === "pt"
      ? "(vazio — responde o inbound num toque curto)"
      : "(empty — answer the inbound in one short beat)";
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
