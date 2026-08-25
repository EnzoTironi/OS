import type { ExactValue } from "@zoen/ontology";
import type { LineageDependency } from "../../sdk/src/gen/zoen/world/v1/world_pb.js";

/**
 * Live lineage fields from SemanticQuery. Not a second object identity.
 */
export type ClaimLineage = Pick<
  LineageDependency,
  "claimId" | "commitSequence" | "entityId" | "relationId" | "role"
>;

/**
 * One SemanticQuery row as a claim projection.
 * `value` is required-nullable: the selection was queried; the claim may be empty.
 */
export interface ClaimRead {
  readonly entityId: string;
  readonly lineage: readonly ClaimLineage[];
  readonly value: ExactValue | null;
}

export function lineageFrom(
  dependencies: readonly LineageDependency[],
): readonly ClaimLineage[] {
  return dependencies.map((dependency) => ({
    claimId: dependency.claimId,
    commitSequence: dependency.commitSequence,
    entityId: dependency.entityId,
    relationId: dependency.relationId,
    role: dependency.role,
  }));
}

export function emptyClaimRead(entityId: string): ClaimRead {
  return { entityId, lineage: [], value: null };
}
