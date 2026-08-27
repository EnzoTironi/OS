import type {
  ConversationContextDocument,
  ConversationContextProjection,
  ConversationContextRecord,
} from "./context-document.js";

const HIDDEN_FIELD = /tenant|principal|proposal|operation|claim|hash/i;

/**
 * Context: model sees instructions separately from labeled data.
 * Inputs: sealed document plus already-built instruction copy.
 * Outputs: instruction copy (not hashed) and labeled data blocks.
 * Tenant/principal strings never enter `data`.
 */
export function projectConversationContext(input: {
  readonly document: ConversationContextDocument;
  readonly hiddenTokens?: readonly string[];
  readonly instructions: string;
}): ConversationContextProjection {
  const blocks: string[] = [];
  for (const record of input.document.records) {
    if (record.trustClass === "instruction") {
      continue;
    }
    const block = formatRecordBlock(record, input.hiddenTokens ?? []);
    if (block.length > 0) {
      blocks.push(block);
    }
  }
  return {
    data: blocks.join("\n\n"),
    instructions: input.instructions,
  };
}

function formatRecordBlock(
  record: ConversationContextRecord,
  hiddenTokens: readonly string[],
): string {
  const lines = [`trustClass: ${record.trustClass}`];
  lines.push(`attribution: ${attributionLabel(record)}`);
  switch (record.payload.type) {
    case "instruction":
      return "";
    case "interaction":
      lines.push(`kind: ${record.payload.kind}`);
      if (record.payload.speaker === true) {
        lines.push("speaker: yes");
      }
      if (record.payload.text !== undefined) {
        lines.push(`text: ${sanitize(record.payload.text, hiddenTokens)}`);
      }
      if (record.payload.mediaRef !== undefined) {
        lines.push(
          `mediaRef: ${sanitize(record.payload.mediaRef, hiddenTokens)}`,
        );
      }
      break;
    case "preference":
      lines.push(`key: ${sanitize(record.payload.key, hiddenTokens)}`);
      lines.push(`text: ${sanitize(record.payload.text, hiddenTokens)}`);
      break;
    case "knowledge":
      lines.push(`admitted: ${record.payload.admitted ? "yes" : "no"}`);
      lines.push(`text: ${sanitize(record.payload.text, hiddenTokens)}`);
      break;
    case "world":
      lines.push("rivals:");
      for (const rival of record.payload.rivals) {
        lines.push(`- ${sanitize(rival.label, hiddenTokens)}`);
      }
      if (record.payload.notes.length > 0) {
        lines.push("notes:");
        for (const note of record.payload.notes) {
          lines.push(`- ${sanitize(note, hiddenTokens)}`);
        }
      }
      break;
    case "history":
      lines.push(`complete: ${record.payload.complete ? "yes" : "no"}`);
      for (const label of record.payload.labels) {
        lines.push(`- ${sanitize(label, hiddenTokens)}`);
      }
      break;
    case "personal_memory":
      lines.push(`body: ${sanitize(record.payload.body, hiddenTokens)}`);
      break;
    default: {
      const exhaustive: never = record.payload;
      return exhaustive;
    }
  }
  return lines.join("\n");
}

function attributionLabel(record: ConversationContextRecord): string {
  switch (record.attribution.kind) {
    case "interaction":
      return "interaction";
    case "query":
      return "query";
    case "explain":
      return "explain";
    case "action":
      return "action";
    case "onboard":
      return "onboard";
    default: {
      const exhaustive: never = record.attribution;
      return exhaustive;
    }
  }
}

function sanitize(text: string, hiddenTokens: readonly string[]): string {
  let next = text;
  for (const token of hiddenTokens) {
    if (token.length === 0) {
      continue;
    }
    next = next.split(token).join("");
  }
  return next
    .split(/\s+/u)
    .filter((word) => !HIDDEN_FIELD.test(word))
    .join(" ")
    .replace(/\s{2,}/gu, " ")
    .trim();
}
