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

const waitSchema = z.object({}).strict();

/**
 * Mutable scratch for one reasoning stage. Tools record here.
 * User-visible text comes only from speak_to_user.
 * `wait` clears the turn: empty bubbles, no send.
 */
export interface InteractionScratch {
  bubbles: string[];
  executionNotes: string[];
  waited: boolean;
  /** Set by speak_to_user / spawn_execution. Not by wait. */
  startedWork: boolean;
}

export interface InteractionToolOptions {
  readonly executeWork?: (task: string) => Promise<string>;
}

export function createInteractionScratch(): InteractionScratch {
  return {
    bubbles: [],
    executionNotes: [],
    startedWork: false,
    waited: false,
  };
}

/**
 * `wait` is only for thanks / ok closers. Greetings must speak.
 */
export const WAIT_TOOL_DESCRIPTION =
  "End the turn with no user-facing text (empty bubbles). Use only for thanks, ok, show, valeu, or obrigado. Never for greetings (oi, e aí, hi, hey, fala). Do not speak.";

export const INTERACTION_TOOL_NAMES = [
  "speak_to_user",
  "wait",
  "spawn_execution",
] as const;

export type InteractionToolName = (typeof INTERACTION_TOOL_NAMES)[number];

export function createInteractionTools(
  scratch: InteractionScratch,
  options: InteractionToolOptions = {},
): ToolSet {
  return {
    spawn_execution: tool({
      description:
        "Hand work off the conversation to the planted zoen CLI. Returns status: committed (...) only after Cedar commit on zoend. Do not tell the person a note or reminder worked unless this status is committed. Fail openly on denied or failed. Never mention this hand-off in user text.",
      execute: async ({ task }) => {
        scratch.startedWork = true;
        const status =
          options.executeWork === undefined
            ? `status: accepted (${task.trim().slice(0, 80)})`
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
        scratch.startedWork = true;
        for (const bubble of splitSpokenBubbles(text)) {
          scratch.bubbles.push(bubble);
        }
        return { ok: true };
      },
      inputSchema: speakToUserSchema,
    }),
    wait: tool({
      description: WAIT_TOOL_DESCRIPTION,
      execute: async () => {
        scratch.waited = true;
        scratch.bubbles.length = 0;
        return { ok: true };
      },
      inputSchema: waitSchema,
    }),
  };
}

export function createFirstContactTools(scratch: InteractionScratch): ToolSet {
  return {
    speak_to_user: tool({
      description:
        "Record one conversational reply for the person. Never mention tools, agents, or this function.",
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
