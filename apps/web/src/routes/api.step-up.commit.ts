import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  bearerFromRequest,
  completeAuthenticatedStepUp,
} from "../step-up-server.js";

const bodySchema = z
  .object({
    sessionId: z.string().min(1),
  })
  .strict();

export const Route = createFileRoute("/api/step-up/commit")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const token = bearerFromRequest(request);
          if (token === undefined) {
            return Response.json(
              { error: "chat_cookie_insufficient" },
              { status: 401 },
            );
          }
          const body = bodySchema.parse(await request.json());
          const receipt = await completeAuthenticatedStepUp({
            accessToken: token,
            commit: (proposalRef, operationId) =>
              commitViaActionApi(token, proposalRef, operationId),
            sessionId: body.sessionId,
          });
          return Response.json({
            operationId: receipt.operationId,
            proposalRef: receipt.proposalRef,
          });
        } catch (cause: unknown) {
          const message =
            cause instanceof Error ? cause.message : String(cause);
          const status =
            message === "chat_cookie_insufficient" ||
            message === "wrong_account"
              ? 401
              : 400;
          return Response.json({ error: message }, { status });
        }
      },
    },
  },
});

async function commitViaActionApi(
  accessToken: string,
  proposalId: string,
  operationId: string,
): Promise<{ operationId: string }> {
  const origin = process.env.ZOEN_WEB_RPC_ORIGIN;
  if (origin === undefined || origin === "") {
    throw new Error("ZOEN_WEB_RPC_ORIGIN is required");
  }
  const rpcBase = origin.replace(/\/$/u, "");
  // AWAITING_APPROVAL proposals need Approve before Commit. READY proposals
  // may deny Approve; ignore and continue to Commit.
  await tryApproveViaActionApi(rpcBase, accessToken, proposalId);
  const response = await fetch(
    `${rpcBase}/zoen.action.v1.ActionService/Commit`,
    {
      body: JSON.stringify({ operationId, proposalId }),
      headers: {
        authorization: `Bearer ${accessToken}`,
        "connect-protocol-version": "1",
        "content-type": "application/json",
      },
      method: "POST",
    },
  );
  const raw: unknown = await response.json();
  if (!response.ok) {
    throw new Error(
      typeof raw === "object" &&
        raw !== null &&
        "message" in raw &&
        typeof (raw as { message: unknown }).message === "string"
        ? (raw as { message: string }).message
        : `action_commit_http_${response.status}`,
    );
  }
  const body = raw as {
    receipt?: { operationId?: string };
    status?: string | number;
  };
  const committedId = body.receipt?.operationId;
  if (committedId === undefined || committedId.length === 0) {
    throw new Error(
      `action_commit_not_receipt:${JSON.stringify(body.status ?? null)}`,
    );
  }
  return { operationId: committedId };
}

async function tryApproveViaActionApi(
  rpcBase: string,
  accessToken: string,
  proposalId: string,
): Promise<void> {
  const expiresAt = new Date(Date.now() + 240_000).toISOString();
  try {
    await fetch(`${rpcBase}/zoen.action.v1.ActionService/Approve`, {
      body: JSON.stringify({
        approvalId: `approval.stepup.${proposalId}`,
        expiresAt,
        proposalId,
      }),
      headers: {
        authorization: `Bearer ${accessToken}`,
        "connect-protocol-version": "1",
        "content-type": "application/json",
      },
      method: "POST",
    });
  } catch {
    // Network errors fall through to Commit, which surfaces the real failure.
  }
}
