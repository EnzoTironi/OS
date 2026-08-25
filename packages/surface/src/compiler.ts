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
  const typeQuery = requireTypeQuery(input);
  const relations = [...input.metadata.relations]
    .filter(
      (relation) =>
        typeQuery === undefined || relation.sourceType === typeQuery.typeId,
    )
    .sort(byId);
  const computations =
    typeQuery === undefined
      ? [...input.metadata.computations].sort(byId)
      : [];
  const actions = [...input.metadata.actions]
    .filter(
      (action) =>
        input.actionIds === undefined || input.actionIds.includes(action.id),
    )
    .sort(byId);
  if (input.actionIds !== undefined) {
    for (const actionId of input.actionIds) {
      if (!input.metadata.actions.some((action) => action.id === actionId)) {
        throw new Error(`Unknown ActionRef ${actionId}`);
      }
    }
  }
  const typeBinding: QueryBinding | undefined =
    typeQuery === undefined
      ? undefined
      : {
          id: `query.type.${typeQuery.typeId}`,
          ref: {
            definition: input.definition,
            kind: "type",
            limit: typeQuery.limit,
            typeId: typeQuery.typeId,
          },
        };
  const queryBindings: QueryBinding[] = [
    ...(typeBinding === undefined ? [] : [typeBinding]),
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
    bindingIds:
      typeBinding === undefined
        ? queryBindings.map((binding) => binding.id)
        : [typeBinding.id],
    id: "node.semantic-table",
    kind: "data-table",
    label: typeBinding === undefined ? "Semantic state" : "Objects",
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
    children:
      typeBinding === undefined
        ? [table.id, ...relationNodes.map((node) => node.id), evidence.id]
        : [...relationNodes.map((node) => node.id), evidence.id],
    entityId: input.entityId,
    id: "node.object",
    kind: "object-detail",
    typeId:
      typeQuery?.typeId ??
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
    children:
      typeBinding === undefined
        ? [
            object.id,
            ...(actionNodes.length === 0 ? [] : [actionSection.id]),
          ]
        : [
            table.id,
            object.id,
            ...(actionNodes.length === 0 ? [] : [actionSection.id]),
          ],
    id: "node.root",
    kind: "section",
    title: input.presentation?.title ?? humanLabel(input.metadata.definitionId),
  };
  const nodes = [
    root,
    ...(typeBinding === undefined ? [] : [table]),
    object,
    ...(typeBinding === undefined ? [table] : []),
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
    id:
      typeQuery === undefined
        ? `surface.${input.definition.definitionId}.${input.entityId}`
        : `surface.${input.definition.definitionId}.${typeQuery.typeId}`,
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
      ...(typeQuery === undefined ? {} : { typeQuery }),
    },
  };
}

function requireTypeQuery(
  input: CompileSurfaceInput,
): CompileSurfaceInput["typeQuery"] {
  if (input.typeQuery === undefined) {
    return undefined;
  }
  if (
    !input.metadata.types.some((type) => type.id === input.typeQuery?.typeId)
  ) {
    throw new Error(`Unknown type QueryRef ${input.typeQuery.typeId}`);
  }
  if (input.typeQuery.limit < 1) {
    throw new Error("type query limit must be positive");
  }
  return input.typeQuery;
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
