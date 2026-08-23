import { createHash } from "node:crypto";
import {
  presentationIntentRef,
  type InteractionControlRef,
  type PresentationIntentRef,
} from "../../interaction/src/index.js";
import type { SurfaceDocument, SurfaceNode } from "./model.js";

export const presentationSchema = "zoen.presentation.v1" as const;

export type ConversationalBlock =
  | { readonly kind: "text"; readonly body: string }
  | {
      readonly kind: "card";
      readonly title: string;
      readonly body: string;
      readonly fields?: readonly { readonly label: string; readonly value: string }[];
    }
  | {
      readonly kind: "button";
      readonly label: string;
      readonly controlRef: InteractionControlRef;
      readonly critical: true;
    }
  | {
      readonly kind: "link";
      readonly label: string;
      readonly url: string;
      readonly controlRef?: InteractionControlRef;
    }
  | {
      readonly kind: "file";
      readonly mediaRef: string;
      readonly mime?: string;
      readonly caption?: string;
    }
  | {
      readonly kind: "secure_web_fallback";
      readonly surfaceUrl: string;
      readonly label: string;
      readonly controlRef?: InteractionControlRef;
    };

export interface PresentationIntent {
  readonly ref: PresentationIntentRef;
  readonly schema: typeof presentationSchema;
  readonly surfaceId: string;
  readonly surfaceDigest: string;
  readonly blocks: readonly ConversationalBlock[];
  readonly fullBodyText: string;
  readonly createdAt: string;
}

export interface CreatePresentationIntentInput {
  readonly surface: SurfaceDocument;
  /** ActionBinding.id → opaque control. Critical buttons require a ref. */
  readonly controlRefsByBindingId?: Readonly<
    Record<string, InteractionControlRef>
  >;
  readonly ref?: PresentationIntentRef;
  readonly now?: () => Date;
}

export interface PresentationIntentStore {
  put(intent: PresentationIntent): Promise<void>;
  get(ref: PresentationIntentRef): Promise<PresentationIntent | undefined>;
}

/** Project SurfaceDocument nodes into Zoen conversational IR. Never Chat SDK. */
export function createPresentationIntent(
  input: CreatePresentationIntentInput,
): PresentationIntent {
  const surface = input.surface;
  const controlMap = input.controlRefsByBindingId ?? {};
  const blocks: ConversationalBlock[] = [];
  const bodyParts: string[] = [];
  const visited = new Set<string>();

  const walk = (nodeId: string): void => {
    if (visited.has(nodeId)) {
      return;
    }
    visited.add(nodeId);
    const node = surface.nodes[nodeId];
    if (node === undefined) {
      return;
    }
    appendNode(node, surface, controlMap, blocks, bodyParts);
    if (node.kind === "section" || node.kind === "object-detail") {
      for (const child of node.children) {
        walk(child);
      }
    }
  };

  walk(surface.root);

  if (surface.presentation.actionsVisible) {
    for (const binding of surface.actionBindings) {
      const controlRef = controlMap[binding.id];
      if (controlRef === undefined) {
        throw new Error(
          `critical action binding ${binding.id} requires InteractionControlRef`,
        );
      }
      const already = blocks.some(
        (block) =>
          block.kind === "button" && String(block.controlRef) === String(controlRef),
      );
      if (!already) {
        const form = Object.values(surface.nodes).find(
          (candidate) =>
            candidate.kind === "action-form" && candidate.bindingId === binding.id,
        );
        blocks.push({
          controlRef,
          critical: true,
          kind: "button",
          label:
            form !== undefined && form.kind === "action-form"
              ? form.label
              : "Approve",
        });
      }
    }
  }

  const surfaceDigest = digestSurface(surface);
  const ref =
    input.ref ??
    presentationIntentRef(`pres_${surfaceDigest.slice(0, 24)}`);
  const fullBodyText = bodyParts.filter((part) => part.length > 0).join("\n");
  const now = input.now ?? (() => new Date());

  return {
    blocks,
    createdAt: now().toISOString(),
    fullBodyText,
    ref,
    schema: presentationSchema,
    surfaceDigest,
    surfaceId: surface.id,
  };
}

export function createMemoryPresentationStore(): PresentationIntentStore {
  const byRef = new Map<string, PresentationIntent>();
  return {
    async get(ref) {
      return byRef.get(String(ref));
    },
    async put(intent) {
      byRef.set(String(intent.ref), intent);
    },
  };
}

function appendNode(
  node: SurfaceNode,
  surface: SurfaceDocument,
  controlMap: Readonly<Record<string, InteractionControlRef>>,
  blocks: ConversationalBlock[],
  bodyParts: string[],
): void {
  switch (node.kind) {
    case "decision-summary": {
      const fields = node.summary
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => {
          const idx = line.indexOf(":");
          if (idx <= 0) {
            return { label: "detail", value: line };
          }
          return {
            label: line.slice(0, idx).trim(),
            value: line.slice(idx + 1).trim(),
          };
        });
      blocks.push({
        body: node.summary,
        fields,
        kind: "card",
        title: node.title,
      });
      bodyParts.push(node.title, node.summary, node.uncertainty);
      return;
    }
    case "action-form": {
      const controlRef = controlMap[node.bindingId];
      if (controlRef === undefined) {
        if (surface.presentation.actionsVisible) {
          throw new Error(
            `action-form ${node.id} missing InteractionControlRef for ${node.bindingId}`,
          );
        }
        return;
      }
      blocks.push({
        controlRef,
        critical: true,
        kind: "button",
        label: node.label,
      });
      return;
    }
    case "explanation-panel": {
      const body =
        node.ref.kind === "operation-explanation"
          ? `Explanation for ${node.ref.operationId}`
          : `Explanation for action ${node.ref.action.actionId}`;
      blocks.push({ body, kind: "text" });
      bodyParts.push(body);
      return;
    }
    case "freshness-status": {
      blocks.push({ body: node.label, kind: "text" });
      bodyParts.push(node.label);
      return;
    }
    case "section": {
      bodyParts.push(node.title);
      return;
    }
    case "data-table":
    case "object-detail":
    case "relation-value":
    case "relation-list":
    case "history-timeline":
    case "evidence-panel":
    case "effect-status": {
      if ("label" in node && typeof node.label === "string") {
        bodyParts.push(node.label);
      }
      return;
    }
    default: {
      const _exhaustive: never = node;
      void _exhaustive;
      return;
    }
  }
}

function digestSurface(surface: SurfaceDocument): string {
  const material = JSON.stringify({
    actionBindings: surface.actionBindings,
    id: surface.id,
    nodes: surface.nodes,
    presentation: surface.presentation,
    root: surface.root,
    schema: surface.schema,
  });
  return createHash("sha256").update(material).digest("hex");
}
