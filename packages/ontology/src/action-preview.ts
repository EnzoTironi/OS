import { canonicalizeJson, isCanonicalDigestHex, sha256Hex } from "./jcs.js";

export const ACTION_PREVIEW_SCHEMA = "zoen.action.preview.v1";
export const ACTION_PREVIEW_LOCALE = "pt-BR";

export type ActionPreviewValue =
  | { readonly kind: "bool"; readonly value: boolean }
  | { readonly kind: "decimal"; readonly value: string }
  | { readonly kind: "entity"; readonly value: string }
  | { readonly kind: "integer"; readonly value: string }
  | {
      readonly kind: "quantity";
      readonly amount: string;
      readonly unit: string;
    }
  | { readonly kind: "text"; readonly value: string };

export interface ActionPreviewInput {
  readonly id: string;
  readonly value: ActionPreviewValue;
}

export interface ActionPreviewDocument {
  readonly action: string;
  readonly canonicalPreviewText: string;
  readonly inputs: readonly ActionPreviewInput[];
  readonly locale: string;
  readonly resource: string;
  readonly schema: string;
}

export function buildActionPreviewDocument(input: {
  readonly actionId: string;
  readonly resourceId: string;
  readonly inputs: readonly ActionPreviewInput[];
}): ActionPreviewDocument {
  const inputs = [...input.inputs].sort((left, right) =>
    compareIds(left.id, right.id)
  );
  return {
    action: input.actionId,
    canonicalPreviewText: canonicalPreviewText(input.actionId, inputs),
    inputs,
    locale: ACTION_PREVIEW_LOCALE,
    resource: input.resourceId,
    schema: ACTION_PREVIEW_SCHEMA,
  };
}

export function canonicalPreviewText(
  actionId: string,
  inputs: readonly ActionPreviewInput[]
): string {
  switch (actionId) {
    case "personal.writeMemory":
      return `Vou guardar esta nota: ${textInput(inputs, "body") ?? ""}`;
    case "personal.createReminder":
      return `Vou criar este lembrete para ${textInput(inputs, "dueAt") ?? ""}: ${textInput(inputs, "body") ?? ""}`;
    default: {
      const label = actionLabel(actionId);
      const quantity = displayInput(inputs, "quantity");
      return quantity === undefined
        ? `Vou executar ${label}.`
        : `Vou executar ${label} com quantidade ${quantity}.`;
    }
  }
}

/**
 * SHA-256 of RFC 8785 JCS bytes. Matches zoen-engine::preview_hash.
 */
export function actionPreviewHash(document: ActionPreviewDocument): string {
  const canonical = canonicalizeJson(JSON.stringify(toWireDocument(document)));
  const digest = sha256Hex(canonical);
  if (!isCanonicalDigestHex(digest)) {
    throw new Error("preview hash is not lowercase SHA-256 hex");
  }
  return digest;
}

export function toWireDocument(document: ActionPreviewDocument): unknown {
  return {
    action: document.action,
    canonical_preview_text: document.canonicalPreviewText,
    inputs: document.inputs.map((input) => wireInput(input)),
    locale: document.locale,
    resource: document.resource,
    schema: document.schema,
  };
}

function wireInput(input: ActionPreviewInput): unknown {
  switch (input.value.kind) {
    case "bool":
      return { id: input.id, kind: "bool", value: input.value.value };
    case "decimal":
      return { id: input.id, kind: "decimal", value: input.value.value };
    case "entity":
      return { id: input.id, kind: "entity", value: input.value.value };
    case "integer":
      return { id: input.id, kind: "integer", value: input.value.value };
    case "quantity":
      return {
        amount: input.value.amount,
        id: input.id,
        kind: "quantity",
        unit: input.value.unit,
      };
    case "text":
      return { id: input.id, kind: "text", value: input.value.value };
    default: {
      const exhaustive: never = input.value;
      return exhaustive;
    }
  }
}

function compareIds(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function actionLabel(actionId: string): string {
  const parts = actionId.split(".");
  return parts.at(-1) ?? actionId;
}

function textInput(
  inputs: readonly ActionPreviewInput[],
  id: string
): string | undefined {
  const found = inputs.find((input) => input.id === id);
  return found?.value.kind === "text" ? found.value.value : undefined;
}

function displayInput(
  inputs: readonly ActionPreviewInput[],
  id: string
): string | undefined {
  const found = inputs.find((input) => input.id === id);
  if (found === undefined) {
    return undefined;
  }
  switch (found.value.kind) {
    case "bool":
      return String(found.value.value);
    case "decimal":
    case "entity":
    case "integer":
    case "text":
      return found.value.value;
    case "quantity":
      return `${found.value.amount} ${found.value.unit}`;
    default: {
      const exhaustive: never = found.value;
      return exhaustive;
    }
  }
}
