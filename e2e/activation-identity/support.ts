import { createClient, type Client, type Interceptor } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import { HistoryService } from "../../gen/connect/zoen/history/v1/history_pb.js";
import { e2eHttpUrl } from "../host-env.js";

const baseUrl = e2eHttpUrl("ZOEN_E2E_ZOEND_PORT", 58_401);

export type HistoryClient = Client<typeof HistoryService>;

export function historyClient(token: string): HistoryClient {
  const authorization: Interceptor = (next) => async (request) => {
    request.header.set("authorization", `Bearer ${token}`);
    return next(request);
  };
  return createClient(
    HistoryService,
    createConnectTransport({
      baseUrl,
      httpVersion: "1.1",
      interceptors: [authorization],
    }),
  );
}
