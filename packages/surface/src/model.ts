import type {
  DefinitionMetadata,
  DefinitionValueType,
} from "@zoen/sdk";

export const surfaceSchema = "zoen.surface.v1";
export const surfaceCatalog = "zoen.surface.catalog.v1";

export interface SurfaceDefinitionRef {
  readonly definitionId: string;
  readonly digest: string;
  readonly revision: string;
}

export type QueryRef =
  | {
      readonly definition: SurfaceDefinitionRef;
      readonly entityId: string;
      readonly kind: "relation";
      readonly relationId: string;
    }
  | {
      readonly computationId: string;
      readonly definition: SurfaceDefinitionRef;
      readonly entityId: string;
      readonly kind: "computation";
    };

export interface ActionRef {
  readonly actionId: string;
  readonly definition: SurfaceDefinitionRef;
  readonly resourceId: string;
}

export interface EvidenceRef {
  readonly kind: "query-evidence";
  readonly query: QueryRef;
}

export interface ExplanationRef {
  readonly action: ActionRef;
  readonly kind: "latest-action-explanation";
}

export interface HistoryRef {
  readonly action: ActionRef;
  readonly kind: "action-history";
}

export interface EffectRef {
  readonly action: ActionRef;
  readonly kind: "latest-action-effect";
}

export interface QueryBinding {
  readonly id: string;
  readonly ref: QueryRef;
}

export interface ActionBinding {
  readonly id: string;
  readonly inputs: readonly ActionInputControl[];
  readonly ref: ActionRef;
}

export interface ActionInputControl {
  readonly inputId: string;
  readonly label: string;
  readonly valueType: DefinitionValueType;
}

export interface SurfacePresentation {
  readonly actionsVisible: boolean;
  readonly density: "comfortable" | "compact";
  readonly title: string;
}

interface BaseNode {
  readonly id: string;
}

export interface SectionNode extends BaseNode {
  readonly children: readonly string[];
  readonly kind: "section";
  readonly title: string;
}

export interface DataTableNode extends BaseNode {
  readonly bindingIds: readonly string[];
  readonly kind: "data-table";
  readonly label: string;
}

export interface ObjectDetailNode extends BaseNode {
  readonly children: readonly string[];
  readonly entityId: string;
  readonly kind: "object-detail";
  readonly typeId: string;
}

export interface RelationValueNode extends BaseNode {
  readonly bindingId: string;
  readonly kind: "relation-value";
  readonly label: string;
}

export interface RelationListNode extends BaseNode {
  readonly bindingId: string;
  readonly kind: "relation-list";
  readonly label: string;
}

export interface ActionFormNode extends BaseNode {
  readonly bindingId: string;
  readonly kind: "action-form";
  readonly label: string;
}

export interface HistoryTimelineNode extends BaseNode {
  readonly bindingId: string;
  readonly kind: "history-timeline";
  readonly ref: HistoryRef;
}

export interface EvidencePanelNode extends BaseNode {
  readonly bindingIds: readonly string[];
  readonly kind: "evidence-panel";
  readonly refs: readonly EvidenceRef[];
}

export interface ExplanationPanelNode extends BaseNode {
  readonly bindingId: string;
  readonly kind: "explanation-panel";
  readonly ref: ExplanationRef;
}

export interface EffectStatusNode extends BaseNode {
  readonly bindingId: string;
  readonly kind: "effect-status";
  readonly ref: EffectRef;
}

export type SurfaceNode =
  | SectionNode
  | DataTableNode
  | ObjectDetailNode
  | RelationValueNode
  | RelationListNode
  | ActionFormNode
  | HistoryTimelineNode
  | EvidencePanelNode
  | ExplanationPanelNode
  | EffectStatusNode;

export interface SurfaceDocument {
  readonly actionBindings: readonly ActionBinding[];
  readonly attribution: {
    readonly compiler: "deterministic";
    readonly definitionDigest: string;
    readonly generatedWithoutLlm: true;
  };
  readonly catalog: typeof surfaceCatalog;
  readonly id: string;
  readonly nodes: Readonly<Record<string, SurfaceNode>>;
  readonly presentation: SurfacePresentation;
  readonly queryBindings: readonly QueryBinding[];
  readonly root: string;
  readonly schema: typeof surfaceSchema;
  readonly semanticContext: {
    readonly definition: SurfaceDefinitionRef;
    readonly entityId: string;
  };
}

export type SurfaceExactValue =
  | { readonly kind: "bool"; readonly value: boolean }
  | { readonly kind: "decimal"; readonly value: string }
  | { readonly kind: "entity-ref"; readonly value: string }
  | { readonly kind: "integer"; readonly value: string }
  | {
      readonly amount: string;
      readonly kind: "quantity";
      readonly unit: string;
    }
  | { readonly kind: "text"; readonly value: string };

export interface QueryValueView {
  readonly evidence: readonly {
    readonly claimId: string;
    readonly role: string;
    readonly sourceRef: string;
  }[];
  readonly value: SurfaceExactValue;
}

export interface QueryBindingView {
  readonly actualCommitSequence: string;
  readonly values: readonly QueryValueView[];
}

export type EffectStatusView =
  | { readonly kind: "none" }
  | { readonly effectRequestId: string; readonly kind: "pending" }
  | { readonly effectRequestId: string; readonly kind: "unknown" }
  | {
      readonly effectRequestId: string;
      readonly kind: "settled";
      readonly outcome: "confirmed" | "confirmed-no-effect";
    }
  | { readonly effectRequestId: string; readonly kind: "contradicted" };

export type ActionOperationView =
  | { readonly kind: "idle" }
  | {
      readonly error: string;
      readonly kind: "denied" | "failed" | "stale" | "unavailable";
    }
  | {
      readonly kind: "proposed";
      readonly operationId: string;
      readonly proposalId: string;
    }
  | {
      readonly kind: "committing" | "recovering";
      readonly operationId: string;
      readonly proposalId: string;
    }
  | {
      readonly commitSequence: string;
      readonly effects: readonly EffectStatusView[];
      readonly kind: "committed";
      readonly operationId: string;
      readonly proposalId: string;
    };

export interface HistoryEntryView {
  readonly label: string;
  readonly sequence: string;
}

export interface SurfaceRuntimeData {
  readonly actions: Readonly<Record<string, ActionOperationView>>;
  readonly history: Readonly<Record<string, readonly HistoryEntryView[]>>;
  readonly queries: Readonly<Record<string, QueryBindingView>>;
}

export interface CompileSurfaceInput {
  readonly definition: SurfaceDefinitionRef;
  readonly entityId: string;
  readonly metadata: DefinitionMetadata;
  readonly presentation?: Partial<SurfacePresentation>;
}
