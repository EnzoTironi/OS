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
  ResolvedChannelIdentity,
  TrustedInteractionContext,
} from "./types.js";
import {
  createWorldQueryClientFromEnv,
  looksLikeEntityId,
  type WorldQueryClient,
  type WorldQuerySnapshot,
} from "./world-query.js";

export interface InteractionTurnResult {
  readonly bubbles: string[];
  readonly href?: string;
}

export type InteractionLocale = "pt" | "en";

export interface InteractionTurnInput {
  readonly membership: ResolvedChannelIdentity | TrustedInteractionContext;
  readonly inbound: InboundInteraction;
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

/**
 * Run one Interaction turn: coordinator stages plus a ToolLoopAgent reasoning step.
 *
 * Context: bound 1:1 WhatsApp (and other channels) after membership resolve.
 * Inputs: membership + inbound. Optional model/world/coordinator for tests.
 * Outputs: conversational bubbles and at most one https URL. Empty bubbles mean wait (no send).
 * Side effects: claims the burst on the coordinator and advances attempt phases.
 * Does not invent OrderLines. Does not echo inbound as "Recebi".
 */
export async function runInteractionTurn(
  input: InteractionTurnInput,
): Promise<InteractionTurnResult> {
  const now = input.now ?? (() => new Date());
  const ctx = trustedContext(input.membership, input.inbound);
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
  const locale = detectInboundLocale(inboundText);
  const snapshot = await assembleWorld(ctx, input.world);
  const hiddenIds = hiddenIdentityTokens(ctx, snapshot);

  await coordinator.advanceStage(attemptId, "reasoning");
  const scratch = await reasonTurn({
    executeWork: input.executeWork,
    inboundText,
    locale,
    model: input.model ?? resolveLanguageModel(),
    snapshot,
  });

  await coordinator.advanceStage(attemptId, "rendering");
  const result = renderTurn({
    hiddenIds,
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
export function outboundBubbles(result: InteractionTurnResult): string[] {
  const bubbles = result.bubbles
    .map((bubble) => bubble.trim())
    .filter((bubble) => bubble.length > 0);
  if (
    result.href !== undefined &&
    !bubbles.some((bubble) => bubble.includes(result.href!))
  ) {
    return [...bubbles, result.href];
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

export function inboundBodyText(inbound: InboundInteraction): string {
  switch (inbound.body.kind) {
    case "text":
      return inbound.body.text;
    case "media":
    case "control_click":
    case "reaction":
    case "unsupported":
      return "";
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
  readonly inbound: InboundInteraction;
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
  inbound: InboundInteraction,
  now: () => Date,
): InteractionRecord {
  return {
    acceptedAt: now().toISOString(),
    ctx,
    id: interactionId(`ixn_${randomBytes(12).toString("hex")}`),
    inbound,
    semanticCorrelationKey: `turn:${ctx.membershipId}`,
  };
}

function trustedContext(
  membership: ResolvedChannelIdentity | TrustedInteractionContext,
  inbound: InboundInteraction,
): TrustedInteractionContext {
  if ("channel" in membership) {
    return membership;
  }
  return {
    ...membership,
    channel: inbound.channel,
  };
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
  readonly inboundText: string;
  readonly locale: InteractionLocale;
  readonly model: LanguageModel | undefined;
  readonly snapshot: WorldQuerySnapshot | undefined;
}): Promise<InteractionScratch> {
  if (input.model === undefined) {
    return failClosedScratch(input.locale, input.inboundText, input.snapshot);
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
      prompt: reasoningPrompt(input.inboundText, input.snapshot),
    });
  } catch {
    return failClosedScratch(input.locale, input.inboundText, input.snapshot);
  }
  return scratch;
}

function failClosedScratch(
  locale: InteractionLocale,
  inboundText: string,
  snapshot: WorldQuerySnapshot | undefined,
): InteractionScratch {
  const scratch = createInteractionScratch();
  const empty = inboundText.trim().length === 0;
  const rivalLabels = (snapshot?.rivals ?? [])
    .map((rival) => rival.label.trim())
    .filter((label) => label.length > 0 && !looksLikeEntityId(label));
  if (empty) {
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
  readonly inboundText: string;
  readonly locale: InteractionLocale;
  readonly scratch: InteractionScratch;
  readonly snapshot: WorldQuerySnapshot | undefined;
}): InteractionTurnResult {
  const spoken: string[] = [];
  for (const raw of input.scratch.bubbles) {
    for (const piece of splitSpokenBubbles(raw)) {
      const cleaned = sanitizeUserText(piece, input.hiddenIds);
      if (cleaned.length > 0) {
        spoken.push(cleaned);
      }
    }
  }
  const href = pickHref(input.scratch.href, spoken, input.snapshot);
  const emptyInbound = input.inboundText.trim().length === 0;
  const stripped = emptyInbound
    ? spoken.filter((bubble) => !containsHiddenId(bubble, input.hiddenIds))
    : spoken;
  if (stripped.length === 0 && input.scratch.bubbles.length === 0 && href === undefined) {
    return { bubbles: [] };
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
): string | undefined {
  const candidates: string[] = [];
  if (minted !== undefined && /^https:\/\//i.test(minted)) {
    candidates.push(minted);
  }
  for (const bubble of bubbles) {
    const found = bubble.match(/https:\/\/[^\s]+/gi) ?? [];
    for (const url of found) {
      candidates.push(url);
    }
  }
  if (
    snapshot?.href !== undefined &&
    /^https:\/\//i.test(snapshot.href) &&
    candidates.length === 0
  ) {
    candidates.push(snapshot.href);
  }
  return candidates[0];
}

function sanitizeUserText(text: string, hiddenIds: readonly string[]): string {
  let next = text.replace(
    /\b(speak_to_user|spawn_execution|mint_href|ToolLoopAgent|LangGraph|Mastra)\b/gi,
    "",
  );
  next = stripTokens(next, hiddenIds);
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

function interactionInstructions(locale: InteractionLocale): string {
  const language =
    locale === "pt"
      ? "Reply in Portuguese (Brazil)."
      : "Reply in English to match the inbound.";
  return [
    "You talk to one person. Interaction only.",
    language,
    "Use speak_to_user for every user-visible sentence.",
    "Use spawn_execution to hand work off. Use mint_href for at most one https URL.",
    "If you should stay quiet, call no speak_to_user.",
    "Never mention tools, agents, models, or this loop.",
    "Never invent OrderLines or other business entities.",
    "Rival claims coexist. Do not collapse disagreement into one number.",
    "Do not dump membership ids, tenant ids, or entity ids into user text.",
    "Do not echo the inbound with Recebi or I received.",
  ].join(" ");
}

function reasoningPrompt(
  inboundText: string,
  snapshot: WorldQuerySnapshot | undefined,
): string {
  return JSON.stringify({
    inbound: inboundText,
    world:
      snapshot === undefined
        ? null
        : {
            notes: snapshot.notes,
            rivals: snapshot.rivals.map((rival) => rival.label),
          },
  });
}
