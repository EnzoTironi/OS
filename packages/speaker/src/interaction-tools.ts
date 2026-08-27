import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { speakerPreviewLeaksInternalIds } from "./action-preview.js";
import type { ConversationAudienceKind } from "./context-document.js";
import type {
  PersonalWriteKind,
  SpeakerActionClient,
} from "./osdk-action-client.js";
import {
  permissionForFeature,
  type ChannelAssurance,
} from "./permission.js";

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

const mintHrefSchema = z.object({}).passthrough();

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

export interface InteractionWriteCommit {
  readonly actionId: string;
  readonly kind: PersonalWriteKind;
}

export interface InteractionToolOptions {
  readonly actions?: SpeakerActionClient;
  readonly audienceKind?: ConversationAudienceKind;
  readonly executeWork?: (task: string) => Promise<string>;
  readonly channelAssurance?: ChannelAssurance;
  readonly publicWebOrigin?: string;
  readonly onWriteCommitted?: (
    commit: InteractionWriteCommit,
  ) => Promise<void>;
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
  return {
    request_external: tool({
      description:
        "Ask for a web report, bank access, or fiscal issuance. Do not claim it ran. Do not invent a link. Speak after this returns.",
      execute: async ({ boundary }) => {
        const decision = permissionForFeature({
          channelAssurance,
          feature: { boundary, kind: "external" },
        });
        switch (decision.kind) {
          case "allow":
            return { allowed: true, ok: true };
          case "escalate":
            return { allowed: false, escalate: false, ok: true, reason: "no approve mint" };
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
        return commitPersonalWrite(scratch, options, "note", body);
      },
      inputSchema: noteSchema,
    }),
    remind: tool({
      description:
        "Create a personal reminder through Propose then Commit. dueAt is text, not a datetime. Speak only after this returns ok. Never claim you scheduled it if this fails.",
      execute: async ({ body, dueAt }) => {
        scratch.startedWork = true;
        return commitPersonalWrite(scratch, options, "remind", body, dueAt);
      },
      inputSchema: remindSchema,
    }),
    mint_href: tool({
      description:
        "Ask the host for the turn href. The host mints onboard or approve. Do not invent a URL. A turn may have speech and no link.",
      execute: async () => {
        return { ok: false, reason: "host owns href" };
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
  options: InteractionToolOptions,
  kind: PersonalWriteKind,
  body: string,
  dueAt?: string,
): Promise<
  { ok: true; previewText: string } | { ok: false; reason: string }
> {
  if (
    options.audienceKind === "group" ||
    options.audienceKind === "channel"
  ) {
    scratch.writeFail = kind;
    return { ok: false, reason: "audience refuses personal write" };
  }
  if (options.actions === undefined) {
    scratch.writeFail = kind;
    return { ok: false, reason: "action client missing" };
  }
  try {
    const result = await commitByKind(options.actions, kind, body, dueAt);
    if (result.kind !== "committed") {
      scratch.writeFail = kind;
      return { ok: false, reason: result.message };
    }
    if (speakerPreviewLeaksInternalIds(result.previewText)) {
      scratch.writeFail = kind;
      return { ok: false, reason: "preview text leaked an internal identifier" };
    }
    if (options.onWriteCommitted !== undefined) {
      await options.onWriteCommitted({
        actionId: personalWriteActionId(kind),
        kind,
      });
    }
    return { ok: true, previewText: result.previewText };
  } catch (error: unknown) {
    scratch.writeFail = kind;
    const message = error instanceof Error ? error.message : "action commit failed";
    return { ok: false, reason: message };
  }
}

function personalWriteActionId(kind: PersonalWriteKind): string {
  switch (kind) {
    case "note":
      return "personal.writeMemory";
    case "remind":
      return "personal.createReminder";
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
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
