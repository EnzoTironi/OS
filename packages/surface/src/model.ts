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
    }
  | {
      readonly definition: SurfaceDefinitionRef;
      readonly kind: "type";
      readonly limit: number;
      readonly typeId: string;
    };

export interface TypeQueryRef {
  readonly limit: number;
  readonly typeId: string;
}

export interface ActionRef {
  readonly actionId: string;
  readonly definition: SurfaceDefinitionRef;
  readonly resourceId: string;
}

export interface EvidenceRef {
  readonly kind: "query-evidence";
  readonly query: QueryRef;
}

export interface CompanySourceEvidenceRef {
  readonly fragmentDigest: string;
  readonly fragmentId: string;
  readonly kind: "company-source";
  readonly retrievalTraceId: string;
  readonly sourceDigest: string;
  readonly sourceId: string;
  readonly sourceRevision: string;
}

export type SurfaceEvidenceRef = EvidenceRef | CompanySourceEvidenceRef;

export type ExplanationRef =
  | {
      readonly action: ActionRef;
      readonly kind: "latest-action-explanation";
    }
  | {
      readonly explanationDigest: string;
      readonly kind: "operation-explanation";
      readonly operationId: string;
    };

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
  readonly refs: readonly SurfaceEvidenceRef[];
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

export interface DecisionSummaryNode extends BaseNode {
  readonly kind: "decision-summary";
  readonly summary: string;
  readonly title: string;
  readonly uncertainty: string;
}

export interface FreshnessStatusNode extends BaseNode {
  readonly bindingId: string;
  readonly generatedAt: string;
  readonly generatedCommitSequence: string;
  readonly kind: "freshness-status";
  readonly label: string;
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
  | EffectStatusNode
  | DecisionSummaryNode
  | FreshnessStatusNode;

export type SurfaceAttribution =
  | {
      readonly compiler: "deterministic";
      readonly definitionDigest: string;
      readonly generatedWithoutLlm: true;
    }
  | {
      readonly compiler: "adaptive-model";
      readonly definitionDigest: string;
      readonly explanationDigest: string;
      readonly generatedWithoutLlm: false;
      readonly knowledgeTraceId: string;
      readonly queryContextDigest: string;
    };

export interface SurfaceDocument {
  readonly actionBindings: readonly ActionBinding[];
  readonly attribution: SurfaceAttribution;
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
    readonly typeQuery?: TypeQueryRef;
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
      /** Opaque InteractionControlRef; open via approveUrl (/approve/<ref>). */
      readonly approveUrl: string;
      readonly controlRef: string;
      readonly kind: "awaiting_approval";
      readonly operationId: string;
      readonly proposalId: string;
    }
  | {
      readonly kind: "committing" | "proposing" | "recovering";
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
  readonly actionIds?: readonly string[];
  readonly definition: SurfaceDefinitionRef;
  readonly entityId: string;
  readonly metadata: DefinitionMetadata;
  readonly presentation?: Partial<SurfacePresentation>;
  readonly typeQuery?: TypeQueryRef;
}

export interface AdaptiveQueryContext {
  readonly actualCommitSequence: string;
  readonly binding: QueryBinding;
  readonly knowledgeCut: string;
  readonly resultDigest: string;
  readonly validAt: string;
  readonly values: readonly SurfaceExactValue[];
}

export interface AdaptiveSurfaceContext {
  readonly actions: readonly ActionBinding[];
  readonly definition: SurfaceDefinitionRef;
  readonly entityId: string;
  readonly evidence: readonly CompanySourceEvidenceRef[];
  readonly explanations: readonly ExplanationRef[];
  readonly generatedAt: string;
  readonly knowledgeTraceId: string;
  readonly queryContextDigest: string;
  readonly queries: readonly AdaptiveQueryContext[];
}

export interface AdaptiveSurfaceModelRequest {
  readonly maxOutputTokens: number;
  readonly prompt: string;
  readonly system: string;
}

export interface AdaptiveSurfaceModelResponse {
  readonly document: unknown;
  readonly providerCallId: string;
  readonly responseModelId: string;
}

export interface AdaptiveSurfaceModel {
  composeSurface(
    request: AdaptiveSurfaceModelRequest,
  ): Promise<AdaptiveSurfaceModelResponse>;
}

export interface AdaptiveSurfaceProviderEvidence {
  readonly configuredModelId: string;
  readonly promptDigest: string;
  readonly providerCallId: string;
  readonly providerRouteId: string;
  readonly responseModelId: string;
}

export interface AdaptiveSurfaceSession {
  readonly context: AdaptiveSurfaceContext;
  readonly createdAt: string;
  readonly document: SurfaceDocument;
  readonly provider: AdaptiveSurfaceProviderEvidence;
  readonly questionDigest: string;
  readonly schema: "zoen.surface.session.v1";
  readonly sessionId: string;
}
