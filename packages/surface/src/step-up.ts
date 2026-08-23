import type {
  ActionFormNode,
  ActionRef,
  DecisionSummaryNode,
  ExplanationPanelNode,
  FreshnessStatusNode,
  SectionNode,
  SurfaceDocument,
} from "./model.js";
import { surfaceCatalog, surfaceSchema } from "./model.js";

export type StepUpAssuranceGate = "channel_inline" | "oidc_step_up";

export interface CompileStepUpSurfaceInput {
  readonly proposalRef: string;
  readonly actionRef: ActionRef;
  readonly workspaceLabel: string;
  readonly subjectLabel: string;
  readonly materialInputs: readonly { label: string; value: string }[];
  readonly explanation: string;
  readonly stale: boolean;
  readonly requiredAssurance: StepUpAssuranceGate;
}

/**
 * One-purpose step-up Surface IR. No bespoke mutation endpoint;
 * ActionBinding.ref is an ordinary ActionRef for propose/commit.
 */
export function compileStepUpSurface(
  input: CompileStepUpSurfaceInput,
): SurfaceDocument {
  const bindingId = `action.stepup.${input.actionRef.actionId}`;
  const summary: DecisionSummaryNode = {
    id: "node.decision-summary",
    kind: "decision-summary",
    summary: [
      `Workspace: ${input.workspaceLabel}`,
      `Subject: ${input.subjectLabel}`,
      ...input.materialInputs.map(
        (entry) => `${entry.label}: ${entry.value}`,
      ),
      `Assurance: ${input.requiredAssurance}`,
      `Proposal: ${input.proposalRef}`,
    ].join("\n"),
    title: "Step-up approval",
    uncertainty: input.stale
      ? "StateBasis may be stale; revalidate before commit."
      : "Freshness pending server StateBasis check.",
  };
  const freshness: FreshnessStatusNode = {
    bindingId,
    generatedAt: new Date(0).toISOString(),
    generatedCommitSequence: "0",
    id: "node.freshness",
    kind: "freshness-status",
    label: input.stale ? "Stale — revalidate required" : "Awaiting revalidation",
  };
  const explanation: ExplanationPanelNode = {
    bindingId: "explanation.stepup",
    id: "node.explanation",
    kind: "explanation-panel",
    ref: {
      explanationDigest: "stepup.inline",
      kind: "operation-explanation",
      operationId: input.proposalRef,
    },
  };
  const form: ActionFormNode = {
    bindingId,
    id: "node.action-form",
    kind: "action-form",
    label: "Approve",
  };
  const root: SectionNode = {
    children: [summary.id, freshness.id, explanation.id, form.id],
    id: "node.root",
    kind: "section",
    title: "Authenticated approval",
  };

  return {
    actionBindings: [
      {
        id: bindingId,
        inputs: input.materialInputs.map((entry, index) => ({
          inputId: `input.${index}`,
          label: entry.label,
          valueType: { kind: "text" as const },
        })),
        ref: input.actionRef,
      },
    ],
    attribution: {
      compiler: "deterministic",
      definitionDigest: input.actionRef.definition.digest,
      generatedWithoutLlm: true,
    },
    catalog: surfaceCatalog,
    id: `surface.stepup.${input.proposalRef}`,
    nodes: {
      [summary.id]: summary,
      [freshness.id]: freshness,
      [explanation.id]: explanation,
      [form.id]: form,
      [root.id]: root,
    },
    presentation: {
      actionsVisible: true,
      density: "comfortable",
      title: "Step-up approval",
    },
    queryBindings: [],
    root: root.id,
    schema: surfaceSchema,
    semanticContext: {
      definition: input.actionRef.definition,
      entityId: input.actionRef.resourceId,
    },
  };
}
