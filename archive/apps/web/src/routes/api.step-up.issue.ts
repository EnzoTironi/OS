import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  bearerFromRequest,
  issueAuthenticatedApprovalControl,
} from "../step-up-server.js";

const actionRefSchema = z
  .object({
    actionId: z.string().min(1),
    definition: z
      .object({
        definitionId: z.string().min(1),
        digest: z.string().min(1),
        revision: z.string().min(1),
      })
      .strict(),
    resourceId: z.string().min(1),
  })
  .strict();

const bodySchema = z
  .object({
    actionBindingId: z.string().min(1),
    actionRef: actionRefSchema,
    operationId: z.string().min(1),
    proposalId: z.string().min(1),
  })
  .strict();

export const Route = createFileRoute("/api/step-up/issue")({
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
          const issued = await issueAuthenticatedApprovalControl({
            accessToken: token,
            actionBindingId: body.actionBindingId,
            actionRef: body.actionRef,
            operationId: body.operationId,
            proposalId: body.proposalId,
            publicOrigin: new URL(request.url).origin,
          });
          return Response.json({
            approveUrl: issued.approveUrl,
            controlRef: String(issued.controlRef),
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
