import { createHash } from "node:crypto";
import canonicalize from "canonicalize";
import type { SurfaceDocument } from "../../surface/src/model.js";
import type { PublishedSurface, SurfaceAccess } from "./types.js";

export function publishSurface(input: {
  readonly packDigest: string;
  readonly surfaceDocument: SurfaceDocument;
  readonly access: SurfaceAccess;
  readonly packOntologyDigests?: ReadonlySet<string>;
}): PublishedSurface {
  let document = input.surfaceDocument;

  if (input.packOntologyDigests !== undefined) {
    for (const binding of document.queryBindings) {
      if (!input.packOntologyDigests.has(binding.ref.definition.digest)) {
        throw new Error(
          `surface query ${binding.id} pins digest outside pack ontology`,
        );
      }
    }
    for (const binding of document.actionBindings) {
      if (!input.packOntologyDigests.has(binding.ref.definition.digest)) {
        throw new Error(
          `surface action ${binding.id} pins digest outside pack ontology`,
        );
      }
    }
  }

  if (input.access.kind === "public_readonly") {
    document = filterPublicReadonly(document, input.access.allowedQueryBindingIds);
  }

  const canonical = canonicalize(document);
  if (canonical === undefined) {
    throw new Error("failed to canonicalize surface document");
  }
  const surfaceDigest = createHash("sha256").update(canonical).digest("hex");

  return {
    surfaceDigest,
    packDigest: input.packDigest,
    access: input.access,
    document,
  };
}

function filterPublicReadonly(
  document: SurfaceDocument,
  allowedQueryBindingIds: readonly string[],
): SurfaceDocument {
  const allow = new Set(allowedQueryBindingIds);
  const queryBindings = document.queryBindings.filter((binding) =>
    allow.has(binding.id),
  );
  const actionBindings = document.actionBindings.filter(() => false);

  const allowedBindingIds = new Set(queryBindings.map((binding) => binding.id));
  const nodes: Record<string, SurfaceDocument["nodes"][string]> = {};
  for (const [nodeId, node] of Object.entries(document.nodes)) {
    if (node.kind === "data-table") {
      nodes[nodeId] = {
        ...node,
        bindingIds: node.bindingIds.filter((id) => allowedBindingIds.has(id)),
      };
      continue;
    }
    if (node.kind === "evidence-panel") {
      nodes[nodeId] = {
        ...node,
        bindingIds: node.bindingIds.filter((id) => allowedBindingIds.has(id)),
        refs: node.refs.filter((ref) => {
          if (ref.kind !== "query-evidence") {
            return false;
          }
          return queryBindings.some(
            (binding) =>
              JSON.stringify(binding.ref) === JSON.stringify(ref.query),
          );
        }),
      };
      continue;
    }
    if (node.kind === "action-form") {
      continue;
    }
    nodes[nodeId] = node;
  }

  return {
    ...document,
    queryBindings,
    actionBindings,
    nodes,
    presentation: {
      ...document.presentation,
      actionsVisible: false,
    },
  };
}

/** Runtime gate: public fetch may not resolve a private query binding id. */
export function assertPublicQueryAllowed(input: {
  readonly access: SurfaceAccess;
  readonly queryBindingId: string;
}): void {
  if (input.access.kind !== "public_readonly") {
    throw new Error("public query check requires public_readonly access");
  }
  if (!input.access.allowedQueryBindingIds.includes(input.queryBindingId)) {
    throw new Error(
      `public surface denies query binding ${input.queryBindingId}`,
    );
  }
}

/** Runtime gate: mutating ActionRef requires trusted auth context. */
export function assertActionAuth(input: {
  readonly access: SurfaceAccess;
  readonly authenticated: boolean;
  readonly hasActiveMembership: boolean;
}): void {
  if (!input.authenticated || !input.hasActiveMembership) {
    throw new Error("surface Action requires trusted OIDC + Active Membership");
  }
  if (input.access.kind === "public_readonly") {
    throw new Error("public_readonly surface forbids mutating Actions");
  }
}
