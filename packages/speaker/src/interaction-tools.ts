import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { speakerPreviewLeaksInternalIds } from "./action-preview.js";
import type {
  PersonalWriteKind,
  SpeakerActionClient,
} from "./osdk-action-client.js";
import {
  escalationHref,
  permissionForFeature,
  type ChannelAssurance,
} from "./permission.js";
import { resolvePublicOrigin } from "./public-origin.js";

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

const noteSchema = z
  .object({
    body: z.string().min(1),
  })
  .strict();

const remindSchema = z
  .object({
    body: z.string().min(1),
    dueAt: z.string().min(1),
  })
  .strict();

const requestExternalSchema = z
  .object({
    boundary: z.enum(["web_report", "bank_access", "fiscal_issuance"]),
  })
  .strict();

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
  /** Set by speak_to_user / note / remind / spawn_execution. Not by wait. */
  startedWork: boolean;
  writeFail?: PersonalWriteKind;
}

export interface InteractionToolOptions {
  readonly actions?: SpeakerActionClient;
  readonly executeWork?: (task: string) => Promise<string>;
  readonly channelAssurance?: ChannelAssurance;
  readonly publicWebOrigin?: string;
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

export function createInteractionTools(
  scratch: InteractionScratch,
  options: InteractionToolOptions = {},
): ToolSet {
  const channelAssurance = options.channelAssurance ?? "whatsapp_phone";
  const origin = resolvePublicOrigin(options.publicWebOrigin);
  return {
    request_external: tool({
      description:
        "Ask for a web report, bank access, or fiscal issuance. Do not claim it ran. Speak after this returns.",
      execute: async ({ boundary }) => {
        const decision = permissionForFeature({
          channelAssurance,
          feature: { boundary, kind: "external" },
        });
        switch (decision.kind) {
          case "allow":
            return { allowed: true, ok: true };
          case "escalate": {
            const href = escalationHref(origin, decision.boundary);
            if (!/^https:\/\//i.test(href) || !href.includes("/approve/")) {
              return { ok: false, reason: "escalation href rejected" };
            }
            if (scratch.href !== undefined) {
              return { ok: false, reason: "href already minted" };
            }
            scratch.href = href;
            return { allowed: false, escalate: true, ok: true };
          }
          default: {
            const exhaustive: never = decision;
            return exhaustive;
          }
        }
      },
      inputSchema: requestExternalSchema,
    }),
    note: tool({
      description:
        "Write a personal memory through Propose then Commit. Speak only after this returns ok. Never claim you wrote it if this fails.",
      execute: async ({ body }) => {
        scratch.startedWork = true;
        return commitPersonalWrite(scratch, options.actions, "note", body);
      },
      inputSchema: noteSchema,
    }),
    remind: tool({
      description:
        "Create a personal reminder through Propose then Commit. dueAt is text, not a datetime. Speak only after this returns ok. Never claim you scheduled it if this fails.",
      execute: async ({ body, dueAt }) => {
        scratch.startedWork = true;
        return commitPersonalWrite(scratch, options.actions, "remind", body, dueAt);
      },
      inputSchema: remindSchema,
    }),
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
        scratch.href = undefined;
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

async function commitPersonalWrite(
  scratch: InteractionScratch,
  actions: SpeakerActionClient | undefined,
  kind: PersonalWriteKind,
  body: string,
  dueAt?: string,
): Promise<
  { ok: true; previewText: string } | { ok: false; reason: string }
> {
  if (actions === undefined) {
    scratch.writeFail = kind;
    return { ok: false, reason: "action client missing" };
  }
  try {
    const result = await commitByKind(actions, kind, body, dueAt);
    if (result.kind !== "committed") {
      scratch.writeFail = kind;
      return { ok: false, reason: result.message };
    }
    if (speakerPreviewLeaksInternalIds(result.previewText)) {
      scratch.writeFail = kind;
      return { ok: false, reason: "preview text leaked an internal identifier" };
    }
    return { ok: true, previewText: result.previewText };
  } catch (error: unknown) {
    scratch.writeFail = kind;
    const message = error instanceof Error ? error.message : "action commit failed";
    return { ok: false, reason: message };
  }
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

async function commitByKind(
  actions: SpeakerActionClient,
  kind: PersonalWriteKind,
  body: string,
  dueAt: string | undefined,
) {
  switch (kind) {
    case "note":
      return actions.commitWriteMemory({ body });
    case "remind":
      return actions.commitCreateReminder({
        body,
        dueAt: dueAt ?? "",
      });
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

function isWrappedSpeech(text: string): boolean {
  return (
    (text.startsWith('"') && text.endsWith('"') && text.length >= 2) ||
    (text.startsWith("'") && text.endsWith("'") && text.length >= 2) ||
    (text.startsWith("```") && text.endsWith("```") && text.length >= 6) ||
    (text.startsWith("«") && text.endsWith("»") && text.length >= 2)
  );
}
