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

/**
 * Mutable scratch for one reasoning stage. Tools record here.
 * User-visible text comes only from speak_to_user.
 */
export interface InteractionScratch {
  bubbles: string[];
  executionNotes: string[];
  href?: string;
}

export const SPAWN_NOT_WIRED_STATUS = "denied/not_wired";

export interface InteractionToolOptions {
  readonly executeWork?: (task: string) => Promise<string>;
}

export function createInteractionScratch(): InteractionScratch {
  return {
    bubbles: [],
    executionNotes: [],
  };
}

/**
 * Poke-style Interaction tools. Few, and never named in user text.
 *
 * @param scratch - Turn-local recorder for bubbles, one href, and execution notes
 * @param options.executeWork - Optional hand-off. Unwired spawn is denied/not_wired, never accepted.
 */
export function createInteractionTools(
  scratch: InteractionScratch,
  options: InteractionToolOptions = {},
): ToolSet {
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
        const status =
          options.executeWork === undefined
            ? SPAWN_NOT_WIRED_STATUS
            : await options.executeWork(task);
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
