import { createClient, type Client, type Interceptor } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import { HistoryService } from "../../gen/connect/zoen/history/v1/history_pb.js";
import { zoenBaseUrl } from "../effect-support.js";

export type HistoryClient = Client<typeof HistoryService>;

export function historyClient(token: string): HistoryClient {
  const authorization: Interceptor = (next) => async (request) => {
    request.header.set("authorization", `Bearer ${token}`);
    return next(request);
  };
  return createClient(
    HistoryService,
    createConnectTransport({
      baseUrl: zoenBaseUrl,
      httpVersion: "1.1",
      interceptors: [authorization],
    }),
  );
}
