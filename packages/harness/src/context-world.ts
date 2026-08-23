import {
  audienceAllowsScope,
  createRetrievedContextRecord,
  type ContextRetrieveRequest,
  type ContextSource,
  type RetrievedContextRecord,
} from "./context-source.js";
import type { AgentAuthority } from "./session.js";

export class WorldContextSource implements ContextSource {
  readonly id = "world";
  readonly #authority: AgentAuthority;

  constructor(authority: AgentAuthority) {
    this.#authority = authority;
  }

  async retrieve(
    request: ContextRetrieveRequest,
  ): Promise<readonly RetrievedContextRecord[]> {
    if (request.purpose.kind !== "planning") {
      return [];
    }
    const capabilities = request.purpose.queryCapabilities ?? [];
    const records: RetrievedContextRecord[] = [];
    for (const capability of capabilities) {
      const query = await this.#authority.query(capability);
      const scope = {
        kind: "tenant" as const,
        tenantId: request.trustedContext.tenantId,
      };
      const allow = audienceAllowsScope(request.audience, scope);
      if (!allow.ok) {
        continue;
      }
      records.push(
        createRetrievedContextRecord({
          trustClass: "world",
          scope,
          attribution: {
            kind: "query",
            resultDigest: query.resultDigest,
            alias: query.alias,
            definitionDigest: query.definition.digest,
          },
          retention: { kind: "authority" },
          payload: {
            trustClass: "world",
            query,
          },
        }),
      );
    }
    return records;
  }
}

export class HistoryContextSource implements ContextSource {
  readonly id = "history";
  readonly #authority: AgentAuthority;

  constructor(authority: AgentAuthority) {
    this.#authority = authority;
  }

  async retrieve(
    request: ContextRetrieveRequest,
  ): Promise<readonly RetrievedContextRecord[]> {
    if (request.purpose.kind !== "planning") {
      return [];
    }
    const operationId = request.purpose.explainOperationId;
    if (operationId === undefined) {
      return [];
    }
    const history = await this.#authority.explain(operationId);
    const scope = {
      kind: "tenant" as const,
      tenantId: request.trustedContext.tenantId,
    };
    const allow = audienceAllowsScope(request.audience, scope);
    if (!allow.ok) {
      return [];
    }
    return [
      createRetrievedContextRecord({
        trustClass: "history",
        scope,
        attribution: {
          kind: "explain",
          explanationDigest: history.explanationDigest,
          operationId: history.operationId,
        },
        retention: { kind: "authority" },
        payload: {
          trustClass: "history",
          history,
        },
      }),
    ];
  }
}
