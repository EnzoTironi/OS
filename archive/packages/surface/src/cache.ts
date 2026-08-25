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
    queryScope(input.query),
    querySelection(input.query),
    input.commitSequence,
  ];
}

function queryScope(query: QueryRef): string {
  switch (query.kind) {
    case "relation":
    case "computation":
      return query.entityId;
    case "type":
      return `type:${query.typeId}`;
    default: {
      const exhaustive: never = query;
      return exhaustive;
    }
  }
}

function querySelection(query: QueryRef): string {
  switch (query.kind) {
    case "relation":
      return `relation:${query.relationId}`;
    case "computation":
      return `computation:${query.computationId}`;
    case "type":
      return `type:${query.typeId}:${query.limit}`;
    default: {
      const exhaustive: never = query;
      return exhaustive;
    }
  }
}
