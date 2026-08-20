import { defineCatalog } from "@json-render/core";
import { defineRegistry, Renderer } from "@json-render/react";
import { schema } from "@json-render/react/schema";
import { z } from "zod";
import type { SurfaceDocument, SurfaceNode } from "../model.js";
import { RendererBoundary } from "./boundary.js";
import { useSurfaceInteraction } from "./interaction.js";
import {
  ActionFormView,
  EffectStatusViewList,
  EvidenceView,
  ExplanationView,
  HistoryView,
  QueryTableView,
  RelationView,
} from "./views.js";

const catalog = defineCatalog(schema, {
  actions: {},
  components: {
    Section: {
      description: "Groups related semantic controls and values.",
      props: z.object({ title: z.string() }).strict(),
    },
    DataTable: {
      description: "Displays values returned by typed semantic queries.",
      props: z
        .object({
          bindingIds: z.array(z.string()),
          label: z.string(),
        })
        .strict(),
    },
    ObjectDetail: {
      description: "Displays one semantic entity.",
      props: z
        .object({
          entityId: z.string(),
          typeId: z.string(),
        })
        .strict(),
    },
    RelationValue: {
      description: "Displays a single relation value.",
      props: z
        .object({
          bindingId: z.string(),
          label: z.string(),
        })
        .strict(),
    },
    RelationList: {
      description: "Displays relation values as a list.",
      props: z
        .object({
          bindingId: z.string(),
          label: z.string(),
        })
        .strict(),
    },
    ActionForm: {
      description: "Collects typed inputs for one governed ActionRef.",
      props: z
        .object({
          bindingId: z.string(),
          label: z.string(),
        })
        .strict(),
    },
    HistoryTimeline: {
      description: "Displays durable Action history.",
      props: z.object({ bindingId: z.string() }).strict(),
    },
    EvidencePanel: {
      description: "Displays evidence references from semantic query lineage.",
      props: z.object({ bindingIds: z.array(z.string()) }).strict(),
    },
    ExplanationPanel: {
      description: "Displays the stable explanation reference for an Action.",
      props: z.object({ bindingId: z.string() }).strict(),
    },
    EffectStatus: {
      description: "Distinguishes local commit from external effect knowledge.",
      props: z.object({ bindingId: z.string() }).strict(),
    },
  },
});

const { registry } = defineRegistry(catalog, {
  components: {
    Section: ({ children, props }) => (
      <section className="json-section">
        <h3>{props.title}</h3>
        {children}
      </section>
    ),
    DataTable: ({ props }) => (
      <QueryTableView
        bindingIds={props.bindingIds}
        label={props.label}
      />
    ),
    ObjectDetail: ({ children, props }) => (
      <article className="object-detail json-object">
        <header>
          <span>{props.typeId}</span>
          <code>{props.entityId}</code>
        </header>
        {children}
      </article>
    ),
    RelationValue: ({ props }) => (
      <RelationView
        bindingId={props.bindingId}
        label={props.label}
        mode="value"
      />
    ),
    RelationList: ({ props }) => (
      <RelationView
        bindingId={props.bindingId}
        label={props.label}
        mode="list"
      />
    ),
    ActionForm: ({ props }) => {
      const { document } = useSurfaceInteraction();
      return document.presentation.actionsVisible ? (
        <ActionFormView
          bindingId={props.bindingId}
          instanceId="json-render"
          label={props.label}
        />
      ) : null;
    },
    HistoryTimeline: ({ props }) => (
      <HistoryView bindingId={props.bindingId} />
    ),
    EvidencePanel: ({ props }) => (
      <EvidenceView bindingIds={props.bindingIds} />
    ),
    ExplanationPanel: ({ props }) => (
      <ExplanationView bindingId={props.bindingId} />
    ),
    EffectStatus: ({ props }) => (
      <EffectStatusViewList bindingId={props.bindingId} />
    ),
  },
});

export function JsonRenderAdapter(props: {
  readonly document: SurfaceDocument;
}) {
  return (
    <RendererBoundary name="json-render adapter">
      <div
        className={`json-renderer density-${props.document.presentation.density}`}
        data-renderer="json-render"
      >
        <Renderer registry={registry} spec={toJsonRenderSpec(props.document)} />
      </div>
    </RendererBoundary>
  );
}

export function toJsonRenderSpec(document: SurfaceDocument) {
  return {
    elements: Object.fromEntries(
      Object.entries(document.nodes).map(([id, node]) => [
        id,
        jsonElement(node),
      ]),
    ),
    root: document.root,
  };
}

function jsonElement(node: SurfaceNode) {
  switch (node.kind) {
    case "section":
      return {
        children: [...node.children],
        props: { title: node.title },
        type: "Section",
      };
    case "data-table":
      return {
        children: [],
        props: {
          bindingIds: [...node.bindingIds],
          label: node.label,
        },
        type: "DataTable",
      };
    case "object-detail":
      return {
        children: [...node.children],
        props: {
          entityId: node.entityId,
          typeId: node.typeId,
        },
        type: "ObjectDetail",
      };
    case "relation-value":
      return {
        children: [],
        props: {
          bindingId: node.bindingId,
          label: node.label,
        },
        type: "RelationValue",
      };
    case "relation-list":
      return {
        children: [],
        props: {
          bindingId: node.bindingId,
          label: node.label,
        },
        type: "RelationList",
      };
    case "action-form":
      return {
        children: [],
        props: {
          bindingId: node.bindingId,
          label: node.label,
        },
        type: "ActionForm",
      };
    case "history-timeline":
      return {
        children: [],
        props: { bindingId: node.bindingId },
        type: "HistoryTimeline",
      };
    case "evidence-panel":
      return {
        children: [],
        props: { bindingIds: [...node.bindingIds] },
        type: "EvidencePanel",
      };
    case "explanation-panel":
      return {
        children: [],
        props: { bindingId: node.bindingId },
        type: "ExplanationPanel",
      };
    case "effect-status":
      return {
        children: [],
        props: { bindingId: node.bindingId },
        type: "EffectStatus",
      };
    default: {
      const exhaustive: never = node;
      return exhaustive;
    }
  }
}
