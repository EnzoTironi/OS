import type { DefinitionMetadata } from "@zoen/sdk";
import { z } from "zod";
import type {
  ActionBinding,
  AdaptiveSurfaceContext,
  ExplanationRef,
  QueryRef,
  SurfaceDocument,
  SurfaceEvidenceRef,
  SurfaceNode,
} from "./model.js";
import { surfaceCatalog, surfaceSchema } from "./model.js";

const maxSurfaceBytes = 65_536;
const maxNodes = 64;
const digestSchema = z.string().regex(/^[0-9a-f]{64}$/);
const semanticIdSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
const displayTextSchema = z.string().min(1).max(4_000);
const bindingIdSchema = semanticIdSchema;
const nodeIdSchema = semanticIdSchema;
export const surfaceDefinitionRefSchema = z
  .object({
    definitionId: semanticIdSchema,
    digest: digestSchema,
    revision: z.string().regex(/^[1-9][0-9]*$/),
  })
  .strict();
const queryRefSchema = z.discriminatedUnion("kind", [
  z
    .object({
      definition: surfaceDefinitionRefSchema,
      entityId: semanticIdSchema,
      kind: z.literal("relation"),
      relationId: semanticIdSchema,
    })
    .strict(),
  z
    .object({
      computationId: semanticIdSchema,
      definition: surfaceDefinitionRefSchema,
      entityId: semanticIdSchema,
      kind: z.literal("computation"),
    })
    .strict(),
]);
const actionRefSchema = z
  .object({
    actionId: semanticIdSchema,
    definition: surfaceDefinitionRefSchema,
    resourceId: semanticIdSchema,
  })
  .strict();
const valueTypeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("bool") }).strict(),
  z.object({ kind: z.literal("decimal") }).strict(),
  z.object({ kind: z.literal("integer") }).strict(),
  z
    .object({ kind: z.literal("quantity"), unit: z.string().min(1).max(80) })
    .strict(),
  z.object({ kind: z.literal("text") }).strict(),
]);
export const surfaceQueryBindingSchema = z
  .object({
    id: bindingIdSchema,
    ref: queryRefSchema,
  })
  .strict();
export const surfaceActionBindingSchema = z
  .object({
    id: bindingIdSchema,
    inputs: z
      .array(
        z
          .object({
            inputId: semanticIdSchema,
            label: z.string().min(1).max(200),
            valueType: valueTypeSchema,
          })
          .strict(),
      )
      .max(32),
    ref: actionRefSchema,
  })
  .strict();
const historyRefSchema = z
  .object({
    action: actionRefSchema,
    kind: z.literal("action-history"),
  })
  .strict();
const queryEvidenceRefSchema = z
  .object({
    kind: z.literal("query-evidence"),
    query: queryRefSchema,
  })
  .strict();
export const surfaceCompanySourceEvidenceRefSchema = z
  .object({
    fragmentDigest: digestSchema,
    fragmentId: digestSchema,
    kind: z.literal("company-source"),
    retrievalTraceId: digestSchema,
    sourceDigest: digestSchema,
    sourceId: semanticIdSchema,
    sourceRevision: digestSchema,
  })
  .strict();
export const surfaceEvidenceRefSchema = z.discriminatedUnion("kind", [
  queryEvidenceRefSchema,
  surfaceCompanySourceEvidenceRefSchema,
]);
export const surfaceExplanationRefSchema = z.discriminatedUnion("kind", [
  z
    .object({
      action: actionRefSchema,
      kind: z.literal("latest-action-explanation"),
    })
    .strict(),
  z
    .object({
      explanationDigest: digestSchema,
      kind: z.literal("operation-explanation"),
      operationId: semanticIdSchema,
    })
    .strict(),
]);
const effectRefSchema = z
  .object({
    action: actionRefSchema,
    kind: z.literal("latest-action-effect"),
  })
  .strict();

const sectionNodeSchema = z
  .object({
    children: z.array(nodeIdSchema).max(maxNodes),
    id: nodeIdSchema,
    kind: z.literal("section"),
    title: z.string().min(1).max(200),
  })
  .strict();
const dataTableNodeSchema = z
  .object({
    bindingIds: z.array(bindingIdSchema).min(1).max(32),
    id: nodeIdSchema,
    kind: z.literal("data-table"),
    label: z.string().min(1).max(200),
  })
  .strict();
const objectDetailNodeSchema = z
  .object({
    children: z.array(nodeIdSchema).max(maxNodes),
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
    label: z.string().min(1).max(200),
  })
  .strict();
const relationListNodeSchema = z
  .object({
    bindingId: bindingIdSchema,
    id: nodeIdSchema,
    kind: z.literal("relation-list"),
    label: z.string().min(1).max(200),
  })
  .strict();
const actionFormNodeSchema = z
  .object({
    bindingId: bindingIdSchema,
    id: nodeIdSchema,
    kind: z.literal("action-form"),
    label: z.string().min(1).max(200),
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
    bindingIds: z.array(bindingIdSchema).min(1).max(32),
    id: nodeIdSchema,
    kind: z.literal("evidence-panel"),
    refs: z.array(surfaceEvidenceRefSchema).min(1).max(40),
  })
  .strict();
const explanationNodeSchema = z
  .object({
    bindingId: bindingIdSchema,
    id: nodeIdSchema,
    kind: z.literal("explanation-panel"),
    ref: surfaceExplanationRefSchema,
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
const decisionSummaryNodeSchema = z
  .object({
    id: nodeIdSchema,
    kind: z.literal("decision-summary"),
    summary: displayTextSchema,
    title: z.string().min(1).max(200),
    uncertainty: displayTextSchema,
  })
  .strict();
const freshnessStatusNodeSchema = z
  .object({
    bindingId: bindingIdSchema,
    generatedAt: z.iso.datetime(),
    generatedCommitSequence: z.string().regex(/^[1-9][0-9]*$/),
    id: nodeIdSchema,
    kind: z.literal("freshness-status"),
    label: z.string().min(1).max(200),
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
  decisionSummaryNodeSchema,
  freshnessStatusNodeSchema,
]);
const deterministicAttributionSchema = z
  .object({
    compiler: z.literal("deterministic"),
    definitionDigest: digestSchema,
    generatedWithoutLlm: z.literal(true),
  })
  .strict();
const adaptiveAttributionSchema = z
  .object({
    compiler: z.literal("adaptive-model"),
    definitionDigest: digestSchema,
    explanationDigest: digestSchema,
    generatedWithoutLlm: z.literal(false),
    knowledgeTraceId: digestSchema,
    queryContextDigest: digestSchema,
  })
  .strict();
const documentShape = {
  actionBindings: z.array(surfaceActionBindingSchema).max(32),
  catalog: z.literal(surfaceCatalog),
  id: semanticIdSchema,
  nodes: z.record(nodeIdSchema, nodeSchema),
  presentation: z
    .object({
      actionsVisible: z.boolean(),
      density: z.enum(["comfortable", "compact"]),
      title: z.string().min(1).max(200),
    })
    .strict(),
  queryBindings: z.array(surfaceQueryBindingSchema).max(32),
  root: nodeIdSchema,
  schema: z.literal(surfaceSchema),
  semanticContext: z
    .object({
      definition: surfaceDefinitionRefSchema,
      entityId: semanticIdSchema,
    })
    .strict(),
};
const documentSchema = z
  .object({
    ...documentShape,
    attribution: z.discriminatedUnion("compiler", [
      deterministicAttributionSchema,
      adaptiveAttributionSchema,
    ]),
  })
  .strict();
export const adaptiveSurfaceDocumentSchema = z
  .object({
    ...documentShape,
    attribution: adaptiveAttributionSchema,
  })
  .strict();

export function parseSurfaceDocument(
  value: unknown,
  metadata: DefinitionMetadata,
  adaptiveContext?: AdaptiveSurfaceContext,
): SurfaceDocument {
  requireBoundedPayload(value);
  const document = documentSchema.parse(value);
  validateDocumentBindings(document, metadata, adaptiveContext);
  return document;
}

export function parseAdaptiveSurfaceDocument(
  value: unknown,
  context: AdaptiveSurfaceContext,
  metadata?: DefinitionMetadata,
): SurfaceDocument {
  requireBoundedPayload(value);
  const document = adaptiveSurfaceDocumentSchema.parse(value);
  validateDocumentBindings(document, metadata, context);
  return document;
}

function requireBoundedPayload(value: unknown): void {
  let encoded: string;
  try {
    encoded = JSON.stringify(value);
  } catch (cause: unknown) {
    throw new Error("Surface payload is not serializable", { cause });
  }
  if (new TextEncoder().encode(encoded).byteLength > maxSurfaceBytes) {
    throw new Error(`Surface payload exceeds ${maxSurfaceBytes} bytes`);
  }
}

function validateDocumentBindings(
  document: SurfaceDocument,
  metadata: DefinitionMetadata | undefined,
  adaptiveContext: AdaptiveSurfaceContext | undefined,
): void {
  if (Object.keys(document.nodes).length > maxNodes) {
    throw new Error(`Surface contains more than ${maxNodes} nodes`);
  }
  if (metadata !== undefined) {
    validateMetadataReference(document, metadata);
  }
  if (adaptiveContext !== undefined) {
    validateAdaptiveContext(document, adaptiveContext);
  }
  if (
    document.attribution.compiler === "adaptive-model" &&
    adaptiveContext === undefined
  ) {
    throw new Error("Adaptive Surface requires an authorized context");
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

  const relationIds = new Set(
    metadata?.relations.map((relation) => relation.id) ?? [],
  );
  const computationIds = new Set(
    metadata?.computations.map((computation) => computation.id) ?? [],
  );
  const actionIds = new Set(
    metadata?.actions.map((action) => action.id) ?? [],
  );
  const authorizedQueries = new Set(
    adaptiveContext?.queries.map((query) => stableKey(query.binding)) ?? [],
  );
  const authorizedActions = new Set(
    adaptiveContext?.actions.map(stableKey) ?? [],
  );
  const queryBindings = new Set<string>();
  for (const binding of document.queryBindings) {
    if (queryBindings.has(binding.id)) {
      throw new Error(`Duplicate Query binding ${binding.id}`);
    }
    queryBindings.add(binding.id);
    validateDefinitionRef(document, binding.ref.definition);
    validateQueryRef(binding.ref, relationIds, computationIds, metadata);
    if (
      adaptiveContext !== undefined &&
      !authorizedQueries.has(stableKey(binding))
    ) {
      throw new Error(`QueryRef ${binding.id} is outside authorized context`);
    }
  }

  const actionBindings = new Map<string, ActionBinding>();
  for (const binding of document.actionBindings) {
    if (actionBindings.has(binding.id)) {
      throw new Error(`Duplicate Action binding ${binding.id}`);
    }
    actionBindings.set(binding.id, binding);
    validateDefinitionRef(document, binding.ref.definition);
    if (metadata !== undefined && !actionIds.has(binding.ref.actionId)) {
      throw new Error(`Unknown ActionRef ${binding.ref.actionId}`);
    }
    if (
      adaptiveContext !== undefined &&
      !authorizedActions.has(stableKey(binding))
    ) {
      throw new Error(`ActionRef ${binding.ref.actionId} is not discoverable`);
    }
  }

  for (const [key, node] of Object.entries(document.nodes)) {
    if (node.id !== key) {
      throw new Error(`Surface node key ${key} does not match ${node.id}`);
    }
    validateNode(
      node,
      document.nodes,
      queryBindings,
      actionBindings,
      adaptiveContext,
    );
  }
  validateReachableAcyclicGraph(document);
  if (document.attribution.compiler === "adaptive-model") {
    validateAdaptiveRequirements(document);
  }
}

function validateMetadataReference(
  document: SurfaceDocument,
  metadata: DefinitionMetadata,
): void {
  if (
    document.semanticContext.definition.definitionId !== metadata.definitionId ||
    document.semanticContext.definition.revision !== metadata.revision.toString()
  ) {
    throw new Error("Surface definition reference does not match metadata");
  }
}

function validateAdaptiveContext(
  document: SurfaceDocument,
  context: AdaptiveSurfaceContext,
): void {
  if (
    stableKey(document.semanticContext.definition) !==
      stableKey(context.definition) ||
    document.semanticContext.entityId !== context.entityId
  ) {
    throw new Error("Surface semantic context is not authorized");
  }
  if (document.attribution.compiler !== "adaptive-model") {
    throw new Error("Adaptive context cannot validate a deterministic Surface");
  }
  const explanationDigest = context.explanations.find(
    (reference) => reference.kind === "operation-explanation",
  )?.explanationDigest;
  if (
    document.attribution.knowledgeTraceId !== context.knowledgeTraceId ||
    document.attribution.queryContextDigest !== context.queryContextDigest ||
    document.attribution.explanationDigest !== explanationDigest
  ) {
    throw new Error("Surface attribution is outside its recorded context");
  }
}

function validateQueryRef(
  reference: QueryRef,
  relationIds: ReadonlySet<string>,
  computationIds: ReadonlySet<string>,
  metadata: DefinitionMetadata | undefined,
): void {
  if (metadata === undefined) {
    return;
  }
  switch (reference.kind) {
    case "relation":
      if (!relationIds.has(reference.relationId)) {
        throw new Error(`Unknown QueryRef ${reference.relationId}`);
      }
      return;
    case "computation":
      if (!computationIds.has(reference.computationId)) {
        throw new Error(`Unknown QueryRef ${reference.computationId}`);
      }
      return;
    default: {
      const exhaustive: never = reference;
      throw new Error(`Unsupported QueryRef ${String(exhaustive)}`);
    }
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
  actionBindings: ReadonlyMap<string, ActionBinding>,
  adaptiveContext: AdaptiveSurfaceContext | undefined,
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
      for (const bindingId of node.bindingIds) {
        requireQueryBinding(queryBindings, bindingId);
      }
      return;
    case "evidence-panel":
      for (const bindingId of node.bindingIds) {
        requireQueryBinding(queryBindings, bindingId);
      }
      validateEvidenceRefs(node.refs, adaptiveContext);
      return;
    case "relation-list":
    case "relation-value":
      requireQueryBinding(queryBindings, node.bindingId);
      return;
    case "freshness-status": {
      requireQueryBinding(queryBindings, node.bindingId);
      const query = adaptiveContext?.queries.find(
        (candidate) => candidate.binding.id === node.bindingId,
      );
      if (
        query !== undefined &&
        (node.generatedCommitSequence !== query.actualCommitSequence ||
          node.generatedAt !== adaptiveContext?.generatedAt)
      ) {
        throw new Error("Freshness node does not match its generated query cut");
      }
      return;
    }
    case "action-form":
      requireActionBinding(actionBindings, node.bindingId);
      return;
    case "effect-status":
      validateActionNodeRef(
        actionBindings,
        node.bindingId,
        node.ref.action,
      );
      return;
    case "history-timeline":
      validateActionNodeRef(
        actionBindings,
        node.bindingId,
        node.ref.action,
      );
      return;
    case "explanation-panel":
      requireActionBinding(actionBindings, node.bindingId);
      validateExplanationRef(node.ref, adaptiveContext);
      if (node.ref.kind === "latest-action-explanation") {
        validateActionNodeRef(
          actionBindings,
          node.bindingId,
          node.ref.action,
        );
      }
      return;
    case "decision-summary":
      return;
    default: {
      const exhaustive: never = node;
      throw new Error(`Unsupported Surface node ${String(exhaustive)}`);
    }
  }
}

function validateEvidenceRefs(
  references: readonly SurfaceEvidenceRef[],
  context: AdaptiveSurfaceContext | undefined,
): void {
  if (context === undefined) {
    return;
  }
  const authorized = new Set([
    ...context.evidence.map(stableKey),
    ...context.queries.map((query) =>
      stableKey({ kind: "query-evidence", query: query.binding.ref }),
    ),
  ]);
  for (const reference of references) {
    if (!authorized.has(stableKey(reference))) {
      throw new Error("EvidenceRef is outside authorized context");
    }
  }
}

function validateExplanationRef(
  reference: ExplanationRef,
  context: AdaptiveSurfaceContext | undefined,
): void {
  if (
    context !== undefined &&
    !context.explanations.some(
      (authorized) => stableKey(authorized) === stableKey(reference),
    )
  ) {
    throw new Error("ExplanationRef is outside authorized context");
  }
}

function validateActionNodeRef(
  bindings: ReadonlyMap<string, ActionBinding>,
  bindingId: string,
  reference: ActionBinding["ref"],
): void {
  const binding = requireActionBinding(bindings, bindingId);
  if (stableKey(binding.ref) !== stableKey(reference)) {
    throw new Error(`Action node ${bindingId} crosses ActionRefs`);
  }
}

function requireQueryBinding(
  bindings: ReadonlySet<string>,
  bindingId: string,
): void {
  if (!bindings.has(bindingId)) {
    throw new Error(`Unknown Query binding ${bindingId}`);
  }
}

function requireActionBinding(
  bindings: ReadonlyMap<string, ActionBinding>,
  bindingId: string,
): ActionBinding {
  const binding = bindings.get(bindingId);
  if (binding === undefined) {
    throw new Error(`Unknown Action binding ${bindingId}`);
  }
  return binding;
}

function validateReachableAcyclicGraph(document: SurfaceDocument): void {
  const visited = new Set<string>();
  const active = new Set<string>();
  const visit = (nodeId: string): void => {
    if (active.has(nodeId)) {
      throw new Error(`Surface node graph contains a cycle at ${nodeId}`);
    }
    if (visited.has(nodeId)) {
      return;
    }
    const node = document.nodes[nodeId];
    if (node === undefined) {
      throw new Error(`Unknown child node ${nodeId}`);
    }
    active.add(nodeId);
    if (node.kind === "section" || node.kind === "object-detail") {
      for (const child of node.children) {
        visit(child);
      }
    }
    active.delete(nodeId);
    visited.add(nodeId);
  };
  visit(document.root);
  if (visited.size !== Object.keys(document.nodes).length) {
    throw new Error("Surface contains unreachable nodes");
  }
}

function validateAdaptiveRequirements(document: SurfaceDocument): void {
  const nodes = Object.values(document.nodes);
  const kinds = new Set(nodes.map((node) => node.kind));
  const required = [
    "action-form",
    "data-table",
    "decision-summary",
    "effect-status",
    "evidence-panel",
    "explanation-panel",
    "freshness-status",
  ] as const;
  for (const kind of required) {
    if (!kinds.has(kind)) {
      throw new Error(`Adaptive Surface is missing ${kind}`);
    }
  }
  const evidence = nodes.find((node) => node.kind === "evidence-panel");
  if (
    evidence?.kind !== "evidence-panel" ||
    !evidence.refs.some((reference) => reference.kind === "company-source") ||
    !evidence.refs.some((reference) => reference.kind === "query-evidence")
  ) {
    throw new Error("Adaptive Surface lacks source and semantic evidence refs");
  }
  const explanation = nodes.find(
    (node) =>
      node.kind === "explanation-panel" &&
      node.ref.kind === "operation-explanation",
  );
  if (explanation === undefined) {
    throw new Error("Adaptive Surface lacks its causal explanation ref");
  }
}

function stableKey(value: unknown): string {
  return JSON.stringify(value);
}
