import { tool, type ToolSet } from "ai";
import { z } from "zod";

const speakToUserSchema = z
  .object({
    text: z.string().min(1),
  })
  .strict();

const spawnExecutionSchema = z
  .object({
    task: z.string().min(1),
  })
  .strict();

const mintHrefSchema = z
  .object({
    url: z.string().min(1),
  })
  .strict();

const waitSchema = z.object({}).strict();

/**
 * Mutable scratch for one reasoning stage. Tools record here.
 * User-visible text comes only from speak_to_user.
 * `wait` clears the turn: empty bubbles, no send.
 */
export interface InteractionScratch {
  bubbles: string[];
  executionNotes: string[];
  href?: string;
  waited: boolean;
  slowWork: boolean;
}

export interface InteractionToolOptions {
  readonly executeWork?: (task: string) => Promise<string>;
  /** Wall time that marks spawn_execution as slow. Production default is 2000. */
  readonly statusAfterMs?: number;
}

export function createInteractionScratch(): InteractionScratch {
  return {
    bubbles: [],
    executionNotes: [],
    slowWork: false,
    waited: false,
  };
}

/**
 * Poke-style Interaction tools. Few, and never named in user text.
 *
 * Context: one ToolLoopAgent turn. Closing inbound (valeu, ok, thanks) must
 * call `wait`, not `speak_to_user`.
 * Inputs: turn-local scratch plus optional executeWork / statusAfterMs.
 * Outputs: ToolSet. User-visible text is only what `speak_to_user` recorded.
 * Side effects: mutates scratch. `wait` marks the turn silent.
 *
 * @param scratch - Turn-local recorder for bubbles, one href, and execution notes
 * @param options.executeWork - Optional harness hand-off; defaults to a status string
 */
export function createInteractionTools(
  scratch: InteractionScratch,
  options: InteractionToolOptions = {},
): ToolSet {
  const statusAfterMs = options.statusAfterMs ?? 2000;
  return {
    mint_href: tool({
      description:
        "Mint at most one https URL for this turn. The mini-app door is a plain https link in the body. Never invent a second URL.",
      execute: async ({ url }) => {
        const trimmed = url.trim();
        if (!/^https:\/\//i.test(trimmed)) {
          return { ok: false, reason: "url must be https" };
        }
        if (scratch.href !== undefined) {
          return { ok: false, reason: "href already minted" };
        }
        scratch.href = trimmed;
        return { ok: true };
      },
      inputSchema: mintHrefSchema,
    }),
    spawn_execution: tool({
      description:
        "Hand work off the conversation. Returns a short status string. Do not mention this hand-off in user text.",
      execute: async ({ task }) => {
        const started = Date.now();
        const status =
          options.executeWork === undefined
            ? `status: accepted (${task.trim().slice(0, 80)})`
            : await options.executeWork(task);
        if (Date.now() - started > statusAfterMs) {
          scratch.slowWork = true;
        }
        scratch.executionNotes.push(status);
        return { status };
      },
      inputSchema: spawnExecutionSchema,
    }),
    speak_to_user: tool({
      description:
        "Record one conversational reply for the person. Newlines become separate bubbles unless the text is wrapped in quotes or a fenced block. Never mention tools, agents, or this function.",
      execute: async ({ text }) => {
        for (const bubble of splitSpokenBubbles(text)) {
          scratch.bubbles.push(bubble);
        }
        return { ok: true };
      },
      inputSchema: speakToUserSchema,
    }),
    wait: tool({
      description:
        "End the turn with no user-facing text (empty bubbles). Use for thanks, ok, show, or other closing inbound. Do not speak.",
      execute: async () => {
        scratch.waited = true;
        scratch.bubbles.length = 0;
        scratch.href = undefined;
        return { ok: true };
      },
      inputSchema: waitSchema,
    }),
  };
}

/**
 * Split spoken text on newlines unless the whole payload is wrapped.
 */
export function splitSpokenBubbles(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return [];
  }
  if (isWrappedSpeech(trimmed)) {
    return [trimmed];
  }
  return trimmed
    .split(/\n+/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function isWrappedSpeech(text: string): boolean {
  return (
    (text.startsWith('"') && text.endsWith('"') && text.length >= 2) ||
    (text.startsWith("'") && text.endsWith("'") && text.length >= 2) ||
    (text.startsWith("```") && text.endsWith("```") && text.length >= 6) ||
    (text.startsWith("«") && text.endsWith("»") && text.length >= 2)
  );
}
