import type { QueryRef } from "./model.js";

export interface SemanticQueryCacheInput {
  readonly commitSequence: string;
  readonly query: QueryRef;
  readonly tenantId: string;
}

export function semanticQueryCacheKey(
  input: SemanticQueryCacheInput,
): readonly [
  "zoen-semantic-query",
  string,
  string,
  string,
  string,
  string,
] {
  return [
    "zoen-semantic-query",
    input.tenantId,
    input.query.definition.digest,
    input.query.entityId,
    querySelection(input.query),
    input.commitSequence,
  ];
}

function querySelection(query: QueryRef): string {
  switch (query.kind) {
    case "relation":
      return `relation:${query.relationId}`;
    case "computation":
      return `computation:${query.computationId}`;
    default: {
      const exhaustive: never = query;
      return exhaustive;
    }
  }
}
