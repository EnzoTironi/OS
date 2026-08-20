import type { ReactNode } from "react";
import type {
  SurfaceDocument,
  SurfaceNode,
} from "../model.js";
import { RendererBoundary } from "./boundary.js";
import {
  ActionFormView,
  DecisionSummaryView,
  EffectStatusViewList,
  EvidenceView,
  ExplanationView,
  FreshnessStatusView,
  HistoryView,
  QueryTableView,
  RelationView,
} from "./views.js";

export function ReferenceRenderer(props: {
  readonly document: SurfaceDocument;
}) {
  return (
    <RendererBoundary name="Reference renderer">
      <div
        className={`reference-renderer density-${props.document.presentation.density}`}
        data-definition-digest={
          props.document.semanticContext.definition.digest
        }
        data-renderer="reference"
        data-surface-id={props.document.id}
      >
        {renderNode(
          props.document.nodes[props.document.root],
          props.document,
        )}
      </div>
    </RendererBoundary>
  );
}

function renderNode(
  node: SurfaceNode | undefined,
  document: SurfaceDocument,
): ReactNode {
  if (node === undefined) {
    throw new Error("Reference renderer received an unknown node");
  }
  switch (node.kind) {
    case "section":
      return (
        <section key={node.id}>
          <h3>{node.title}</h3>
          {node.children.map((child) =>
            renderNode(document.nodes[child], document),
          )}
        </section>
      );
    case "data-table":
      return (
        <QueryTableView
          bindingIds={node.bindingIds}
          key={node.id}
          label={node.label}
        />
      );
    case "object-detail":
      return (
        <article className="object-detail" key={node.id}>
          <header>
            <span>{node.typeId}</span>
            <code>{node.entityId}</code>
          </header>
          {node.children.map((child) =>
            renderNode(document.nodes[child], document),
          )}
        </article>
      );
    case "relation-value":
      return (
        <RelationView
          bindingId={node.bindingId}
          key={node.id}
          label={node.label}
          mode="value"
        />
      );
    case "relation-list":
      return (
        <RelationView
          bindingId={node.bindingId}
          key={node.id}
          label={node.label}
          mode="list"
        />
      );
    case "action-form":
      return document.presentation.actionsVisible ? (
        <ActionFormView
          bindingId={node.bindingId}
          instanceId="reference"
          key={node.id}
          label={node.label}
        />
      ) : null;
    case "history-timeline":
      return <HistoryView bindingId={node.bindingId} key={node.id} />;
    case "evidence-panel":
      return (
        <EvidenceView
          bindingIds={node.bindingIds}
          key={node.id}
          refs={node.refs}
        />
      );
    case "explanation-panel":
      return (
        <ExplanationView
          bindingId={node.bindingId}
          key={node.id}
          ref={node.ref}
        />
      );
    case "effect-status":
      return <EffectStatusViewList bindingId={node.bindingId} key={node.id} />;
    case "decision-summary":
      return (
        <DecisionSummaryView
          key={node.id}
          summary={node.summary}
          title={node.title}
          uncertainty={node.uncertainty}
        />
      );
    case "freshness-status":
      return (
        <FreshnessStatusView
          bindingId={node.bindingId}
          generatedAt={node.generatedAt}
          generatedCommitSequence={node.generatedCommitSequence}
          key={node.id}
          label={node.label}
        />
      );
    default: {
      const exhaustive: never = node;
      return exhaustive;
    }
  }
}
