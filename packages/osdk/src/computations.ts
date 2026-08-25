import { emptyClaimRead, type ClaimRead } from "./claims.js";
import type { ObjectRuntime } from "./objects.js";
import { queryClaims } from "./query.js";

export type ComputationQuery = (input: {
  readonly entityId: string;
}) => Promise<ClaimRead>;

/**
 * Context: typed helpers over SemanticQuery `selection.computationId`.
 * Inputs: compiled computation ids plus a World port.
 * Outputs: one `ClaimRead` per entity (empty claim when zoend returns no row).
 * Side effects: World.semanticQuery only.
 */
export function createComputationQueries(
  runtime: ObjectRuntime,
): Readonly<Record<string, ComputationQuery>> {
  const computations: Record<string, ComputationQuery> = {};
  for (const computation of runtime.model.computations) {
    computations[computation.apiName] = (input) =>
      fetchComputation(runtime, computation.computationId, input.entityId);
  }
  return computations;
}

async function fetchComputation(
  runtime: ObjectRuntime,
  computationId: string,
  entityId: string,
): Promise<ClaimRead> {
  const claims = await queryClaims({
    computationId,
    definition: runtime.definition,
    entityId,
    kind: "computation",
    tenantId: runtime.tenantId,
    validAt: runtime.validAt,
    world: runtime.world,
  });
  return claims[0] ?? emptyClaimRead(entityId);
}
