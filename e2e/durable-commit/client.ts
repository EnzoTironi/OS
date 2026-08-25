import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import { z } from "zod";
import { ActionService } from "../../packages/sdk/src/gen/zoen/action/v1/action_pb.js";

const environmentSchema = z.object({
  ZOEN_E2E_BASE_URL: z.url(),
  ZOEN_E2E_OPERATION_ID: z.string().min(1),
  ZOEN_E2E_PREVIEW_HASH: z.string().min(1),
  ZOEN_E2E_PROPOSAL_ID: z.string().min(1),
  ZOEN_E2E_TOKEN: z.string().min(1),
});

async function main(): Promise<void> {
  const environment = environmentSchema.parse(process.env);
  const transport = createConnectTransport({
    baseUrl: environment.ZOEN_E2E_BASE_URL,
    httpVersion: "1.1",
    interceptors: [
      (next) => async (request) => {
        request.header.set(
          "authorization",
          `Bearer ${environment.ZOEN_E2E_TOKEN}`,
        );
        return next(request);
      },
    ],
  });
  const response = await createClient(ActionService, transport).commit({
    operationId: environment.ZOEN_E2E_OPERATION_ID,
    previewHash: environment.ZOEN_E2E_PREVIEW_HASH,
    proposalId: environment.ZOEN_E2E_PROPOSAL_ID,
  });
  process.stdout.write(
    `${JSON.stringify({
      collisionKind: response.collisionKind,
      currentStateBasisDigest: response.currentStateBasis?.digest,
      receipt:
        response.receipt === undefined
          ? undefined
          : {
              commitSequence: response.receipt.commitSequence.toString(),
              effectRequestIds: response.receipt.effectRequestIds,
              intentDigest: response.receipt.intentDigest,
              operationId: response.receipt.operationId,
              proposalId: response.receipt.proposalId,
              recordIds: response.receipt.recordIds,
            },
      status: response.status,
    })}\n`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
