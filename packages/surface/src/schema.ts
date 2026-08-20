import { z } from "zod";
import type { DefinitionMetadata } from "@zoen/sdk";
import type { SurfaceDocument, SurfaceNode } from "./model.js";
import { surfaceCatalog, surfaceSchema } from "./model.js";

const semanticIdSchema = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
const bindingIdSchema = semanticIdSchema;
const nodeIdSchema = semanticIdSchema;
const definitionRefSchema = z
  .object({
    definitionId: semanticIdSchema,
    digest: z.string().regex(/^[0-9a-f]{64}$/),
    revision: z.string().regex(/^[1-9][0-9]*$/),
  })
  .strict();
const queryRefSchema = z.discriminatedUnion("kind", [
  z
    .object({
      definition: definitionRefSchema,
      entityId: semanticIdSchema,
      kind: z.literal("relation"),
      relationId: semanticIdSchema,
    })
    .strict(),
  z
    .object({
      computationId: semanticIdSchema,
      definition: definitionRefSchema,
      entityId: semanticIdSchema,
      kind: z.literal("computation"),
    })
    .strict(),
]);
const actionRefSchema = z
  .object({
    actionId: semanticIdSchema,
    definition: definitionRefSchema,
    resourceId: semanticIdSchema,
  })
  .strict();
const valueTypeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("bool") }).strict(),
  z.object({ kind: z.literal("decimal") }).strict(),
  z.object({ kind: z.literal("integer") }).strict(),
  z.object({ kind: z.literal("quantity"), unit: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("text") }).strict(),
]);
const queryBindingSchema = z
  .object({
    id: bindingIdSchema,
    ref: queryRefSchema,
  })
  .strict();
const actionBindingSchema = z
  .object({
    id: bindingIdSchema,
    inputs: z.array(
      z
        .object({
          inputId: semanticIdSchema,
          label: z.string().min(1),
          valueType: valueTypeSchema,
        })
        .strict(),
    ),
    ref: actionRefSchema,
  })
  .strict();
const historyRefSchema = z
  .object({
    action: actionRefSchema,
    kind: z.literal("action-history"),
  })
  .strict();
const evidenceRefSchema = z
  .object({
    kind: z.literal("query-evidence"),
    query: queryRefSchema,
  })
  .strict();
const explanationRefSchema = z
  .object({
    action: actionRefSchema,
    kind: z.literal("latest-action-explanation"),
  })
  .strict();
const effectRefSchema = z
  .object({
    action: actionRefSchema,
    kind: z.literal("latest-action-effect"),
  })
  .strict();

const sectionNodeSchema = z
  .object({
    children: z.array(nodeIdSchema),
    id: nodeIdSchema,
    kind: z.literal("section"),
    title: z.string().min(1),
  })
  .strict();
const dataTableNodeSchema = z
  .object({
    bindingIds: z.array(bindingIdSchema),
    id: nodeIdSchema,
    kind: z.literal("data-table"),
    label: z.string().min(1),
  })
  .strict();
const objectDetailNodeSchema = z
  .object({
    children: z.array(nodeIdSchema),
    entityId: semanticIdSchema,
    id: nodeIdSchema,
    kind: z.literal("object-detail"),
    typeId: semanticIdSchema,
  })
  .strict();
const relationValueNodeSchema = z
  .object({
    bindingId: bindingIdSchema,
    id: nodeIdSchema,
    kind: z.literal("relation-value"),
    label: z.string().min(1),
  })
  .strict();
const relationListNodeSchema = z
  .object({
    bindingId: bindingIdSchema,
    id: nodeIdSchema,
    kind: z.literal("relation-list"),
    label: z.string().min(1),
  })
  .strict();
const actionFormNodeSchema = z
  .object({
    bindingId: bindingIdSchema,
    id: nodeIdSchema,
    kind: z.literal("action-form"),
    label: z.string().min(1),
  })
  .strict();
const historyNodeSchema = z
  .object({
    bindingId: bindingIdSchema,
    id: nodeIdSchema,
    kind: z.literal("history-timeline"),
    ref: historyRefSchema,
  })
  .strict();
const evidenceNodeSchema = z
  .object({
    bindingIds: z.array(bindingIdSchema),
    id: nodeIdSchema,
    kind: z.literal("evidence-panel"),
    refs: z.array(evidenceRefSchema),
  })
  .strict();
const explanationNodeSchema = z
  .object({
    bindingId: bindingIdSchema,
    id: nodeIdSchema,
    kind: z.literal("explanation-panel"),
    ref: explanationRefSchema,
  })
  .strict();
const effectNodeSchema = z
  .object({
    bindingId: bindingIdSchema,
    id: nodeIdSchema,
    kind: z.literal("effect-status"),
    ref: effectRefSchema,
  })
  .strict();
const nodeSchema = z.discriminatedUnion("kind", [
  sectionNodeSchema,
  dataTableNodeSchema,
  objectDetailNodeSchema,
  relationValueNodeSchema,
  relationListNodeSchema,
  actionFormNodeSchema,
  historyNodeSchema,
  evidenceNodeSchema,
  explanationNodeSchema,
  effectNodeSchema,
]);

const documentSchema = z
  .object({
    actionBindings: z.array(actionBindingSchema),
    attribution: z
      .object({
        compiler: z.literal("deterministic"),
        definitionDigest: z.string().regex(/^[0-9a-f]{64}$/),
        generatedWithoutLlm: z.literal(true),
      })
      .strict(),
    catalog: z.literal(surfaceCatalog),
    id: semanticIdSchema,
    nodes: z.record(nodeIdSchema, nodeSchema),
    presentation: z
      .object({
        actionsVisible: z.boolean(),
        density: z.enum(["comfortable", "compact"]),
        title: z.string().min(1),
      })
      .strict(),
    queryBindings: z.array(queryBindingSchema),
    root: nodeIdSchema,
    schema: z.literal(surfaceSchema),
    semanticContext: z
      .object({
        definition: definitionRefSchema,
        entityId: semanticIdSchema,
      })
      .strict(),
  })
  .strict();

export function parseSurfaceDocument(
  value: unknown,
  metadata: DefinitionMetadata,
): SurfaceDocument {
  const document = documentSchema.parse(value);
  validateDocumentBindings(document, metadata);
  return document;
}

function validateDocumentBindings(
  document: SurfaceDocument,
  metadata: DefinitionMetadata,
): void {
  if (
    document.semanticContext.definition.definitionId !== metadata.definitionId ||
    document.semanticContext.definition.revision !== metadata.revision.toString()
  ) {
    throw new Error("Surface definition reference does not match metadata");
  }
  if (
    document.attribution.definitionDigest !==
    document.semanticContext.definition.digest
  ) {
    throw new Error("Surface attribution digest does not match its definition");
  }
  if (document.nodes[document.root] === undefined) {
    throw new Error(`Unknown Surface root ${document.root}`);
  }

  const relationIds = new Set(metadata.relations.map((relation) => relation.id));
  const computationIds = new Set(
    metadata.computations.map((computation) => computation.id),
  );
  const actionIds = new Set(metadata.actions.map((action) => action.id));
  const queryBindings = new Set<string>();
  for (const binding of document.queryBindings) {
    if (queryBindings.has(binding.id)) {
      throw new Error(`Duplicate Query binding ${binding.id}`);
    }
    queryBindings.add(binding.id);
    validateDefinitionRef(document, binding.ref.definition);
    switch (binding.ref.kind) {
      case "relation":
        if (!relationIds.has(binding.ref.relationId)) {
          throw new Error(`Unknown QueryRef ${binding.ref.relationId}`);
        }
        break;
      case "computation":
        if (!computationIds.has(binding.ref.computationId)) {
          throw new Error(`Unknown QueryRef ${binding.ref.computationId}`);
        }
        break;
      default: {
        const exhaustive: never = binding.ref;
        throw new Error(`Unsupported QueryRef ${String(exhaustive)}`);
      }
    }
  }

  const actionBindings = new Set<string>();
  for (const binding of document.actionBindings) {
    if (actionBindings.has(binding.id)) {
      throw new Error(`Duplicate Action binding ${binding.id}`);
    }
    actionBindings.add(binding.id);
    validateDefinitionRef(document, binding.ref.definition);
    if (!actionIds.has(binding.ref.actionId)) {
      throw new Error(`Unknown ActionRef ${binding.ref.actionId}`);
    }
  }

  for (const [key, node] of Object.entries(document.nodes)) {
    if (node.id !== key) {
      throw new Error(`Surface node key ${key} does not match ${node.id}`);
    }
    validateNode(node, document.nodes, queryBindings, actionBindings);
  }
}

function validateDefinitionRef(
  document: SurfaceDocument,
  reference: SurfaceDocument["semanticContext"]["definition"],
): void {
  if (
    reference.definitionId !==
      document.semanticContext.definition.definitionId ||
    reference.revision !== document.semanticContext.definition.revision ||
    reference.digest !== document.semanticContext.definition.digest
  ) {
    throw new Error("Surface binding crosses definition revisions");
  }
}

function validateNode(
  node: SurfaceNode,
  nodes: Readonly<Record<string, SurfaceNode>>,
  queryBindings: ReadonlySet<string>,
  actionBindings: ReadonlySet<string>,
): void {
  switch (node.kind) {
    case "section":
    case "object-detail":
      for (const child of node.children) {
        if (nodes[child] === undefined) {
          throw new Error(`Unknown child node ${child}`);
        }
      }
      return;
    case "data-table":
    case "evidence-panel":
      for (const bindingId of node.bindingIds) {
        requireBinding(queryBindings, bindingId, "Query");
      }
      return;
    case "relation-list":
    case "relation-value":
      requireBinding(queryBindings, node.bindingId, "Query");
      return;
    case "action-form":
    case "effect-status":
    case "explanation-panel":
    case "history-timeline":
      requireBinding(actionBindings, node.bindingId, "Action");
      return;
    default: {
      const exhaustive: never = node;
      throw new Error(`Unsupported Surface node ${String(exhaustive)}`);
    }
  }
}

function requireBinding(
  bindings: ReadonlySet<string>,
  bindingId: string,
  kind: "Action" | "Query",
): void {
  if (!bindings.has(bindingId)) {
    throw new Error(`Unknown ${kind} binding ${bindingId}`);
  }
}
