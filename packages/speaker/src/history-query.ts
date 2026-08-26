import { create } from "@bufbuild/protobuf";
import { createClient, type Interceptor } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import {
  ExplanationTargetSchema,
  HistoryService,
} from "../../sdk/src/gen/zoen/history/v1/history_pb.js";
import { hashCanonicalJson } from "./context-document.js";

/**
 * Speakable History.Explain projection. Internal ids stay off the data path.
 */
export interface HistoryExplanation {
  readonly complete: boolean;
  readonly explanationDigest: string;
  readonly labels: readonly string[];
  readonly operationId: string;
}

export interface HistoryQueryClient {
  explain(operationId: string): Promise<HistoryExplanation | undefined>;
}

/**
 * Thin HistoryService.Explain client. No new RPC.
 */
export function createConnectHistoryQueryClient(options: {
  readonly baseUrl: string;
  readonly bearerToken: string;
}): HistoryQueryClient {
  const authorization: Interceptor = (next) => async (request) => {
    request.header.set("authorization", `Bearer ${options.bearerToken}`);
    return next(request);
  };
  const transport = createConnectTransport({
    baseUrl: options.baseUrl.replace(/\/$/u, ""),
    httpVersion: "1.1",
    interceptors: [authorization],
  });
  const history = createClient(HistoryService, transport);
  return {
    async explain(operationId) {
      try {
        const response = await history.explain({
          target: create(ExplanationTargetSchema, {
            target: { case: "operationId", value: operationId },
          }),
        });
        const explanation = response.explanation;
        if (explanation === undefined) {
          return undefined;
        }
        const labels = speakableHistoryLabels(explanation.complete);
        return {
          complete: explanation.complete,
          explanationDigest: hashCanonicalJson({
            complete: explanation.complete,
            operationId,
          }),
          labels,
          operationId,
        };
      } catch {
        return undefined;
      }
    },
  };
}

function speakableHistoryLabels(complete: boolean): readonly string[] {
  return complete ? ["complete"] : ["incomplete"];
}
