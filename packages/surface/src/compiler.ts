import type {
  ActionBinding,
  ActionFormNode,
  CompileSurfaceInput,
  DataTableNode,
  EffectStatusNode,
  EvidencePanelNode,
  ExplanationPanelNode,
  HistoryTimelineNode,
  ObjectDetailNode,
  QueryBinding,
  RelationListNode,
  RelationValueNode,
  SectionNode,
  SurfaceDocument,
  SurfaceNode,
} from "./model.js";
import { surfaceCatalog, surfaceSchema } from "./model.js";

export function compileDeterministicSurface(
  input: CompileSurfaceInput,
): SurfaceDocument {
  const relations = [...input.metadata.relations].sort(byId);
  const computations = [...input.metadata.computations].sort(byId);
  const actions = [...input.metadata.actions].sort(byId);
  const queryBindings: QueryBinding[] = [
    ...relations.map((relation): QueryBinding => ({
      id: `query.relation.${relation.id}`,
      ref: {
        definition: input.definition,
        entityId: input.entityId,
        kind: "relation",
        relationId: relation.id,
      },
    })),
    ...computations.map((computation): QueryBinding => ({
      id: `query.computation.${computation.id}`,
      ref: {
        computationId: computation.id,
        definition: input.definition,
        entityId: input.entityId,
        kind: "computation",
      },
    })),
  ];
  const actionBindings: ActionBinding[] = actions.map((action) => ({
    id: `action.${action.id}`,
    inputs: action.inputs.map((field) => ({
      inputId: field.id,
      label: humanLabel(field.id),
      valueType: field.valueType,
    })),
    ref: {
      actionId: action.id,
      definition: input.definition,
      resourceId: input.entityId,
    },
  }));

  const table: DataTableNode = {
    bindingIds: queryBindings.map((binding) => binding.id),
    id: "node.semantic-table",
    kind: "data-table",
    label: "Semantic state",
  };
  const relationNodes: (RelationListNode | RelationValueNode)[] = relations.map(
    (relation) =>
      relation.cardinality === "one"
        ? {
            bindingId: `query.relation.${relation.id}`,
            id: `node.relation.${relation.id}`,
            kind: "relation-value",
            label: humanLabel(relation.id),
          }
        : {
            bindingId: `query.relation.${relation.id}`,
            id: `node.relation.${relation.id}`,
            kind: "relation-list",
            label: humanLabel(relation.id),
          },
  );
  const evidence: EvidencePanelNode = {
    bindingIds: queryBindings.map((binding) => binding.id),
    id: "node.evidence",
    kind: "evidence-panel",
    refs: queryBindings.map((binding) => ({
      kind: "query-evidence",
      query: binding.ref,
    })),
  };
  const object: ObjectDetailNode = {
    children: [
      table.id,
      ...relationNodes.map((node) => node.id),
      evidence.id,
    ],
    entityId: input.entityId,
    id: "node.object",
    kind: "object-detail",
    typeId:
      relations[0]?.sourceType ??
      input.metadata.types[0]?.id ??
      "semantic.object",
  };

  const actionNodes = actionBindings.flatMap((binding) =>
    actionNodesFor(binding),
  );
  const actionSection: SectionNode = {
    children: actionNodes.map((node) => node.id),
    id: "node.actions",
    kind: "section",
    title: "Governed actions",
  };
  const root: SectionNode = {
    children: [
      object.id,
      ...(actionNodes.length === 0 ? [] : [actionSection.id]),
    ],
    id: "node.root",
    kind: "section",
    title: input.presentation?.title ?? humanLabel(input.metadata.definitionId),
  };
  const nodes = [
    root,
    object,
    table,
    ...relationNodes,
    evidence,
    ...(actionNodes.length === 0 ? [] : [actionSection]),
    ...actionNodes,
  ];

  return {
    actionBindings,
    attribution: {
      compiler: "deterministic",
      definitionDigest: input.definition.digest,
      generatedWithoutLlm: true,
    },
    catalog: surfaceCatalog,
    id: `surface.${input.definition.definitionId}.${input.entityId}`,
    nodes: Object.fromEntries(
      nodes.map((node): [string, SurfaceNode] => [node.id, node]),
    ),
    presentation: {
      actionsVisible: input.presentation?.actionsVisible ?? true,
      density: input.presentation?.density ?? "comfortable",
      title: input.presentation?.title ?? humanLabel(input.metadata.definitionId),
    },
    queryBindings,
    root: root.id,
    schema: surfaceSchema,
    semanticContext: {
      definition: input.definition,
      entityId: input.entityId,
    },
  };
}

function actionNodesFor(
  binding: ActionBinding,
): readonly [
  ActionFormNode,
  EffectStatusNode,
  HistoryTimelineNode,
  ExplanationPanelNode,
] {
  const suffix = binding.ref.actionId;
  return [
    {
      bindingId: binding.id,
      id: `node.action.${suffix}`,
      kind: "action-form",
      label: humanLabel(binding.ref.actionId),
    },
    {
      bindingId: binding.id,
      id: `node.effect.${suffix}`,
      kind: "effect-status",
      ref: {
        action: binding.ref,
        kind: "latest-action-effect",
      },
    },
    {
      bindingId: binding.id,
      id: `node.history.${suffix}`,
      kind: "history-timeline",
      ref: {
        action: binding.ref,
        kind: "action-history",
      },
    },
    {
      bindingId: binding.id,
      id: `node.explanation.${suffix}`,
      kind: "explanation-panel",
      ref: {
        action: binding.ref,
        kind: "latest-action-explanation",
      },
    },
  ];
}

function byId(left: { readonly id: string }, right: { readonly id: string }) {
  return left.id.localeCompare(right.id);
}

function humanLabel(identifier: string): string {
  const tail = identifier.split(".").at(-1) ?? identifier;
  const words = tail.replaceAll(/([a-z])([A-Z])/g, "$1 $2").replaceAll("-", " ");
  return `${words.slice(0, 1).toUpperCase()}${words.slice(1)}`;
}
