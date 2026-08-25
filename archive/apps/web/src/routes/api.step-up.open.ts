import { createFileRoute } from "@tanstack/react-router";
import { compileStepUpSurface } from "@zoen/surface";
import { z } from "zod";
import {
  bearerFromRequest,
  openAuthenticatedStepUp,
  stepUpControls,
} from "../step-up-server.js";

const bodySchema = z
  .object({
    controlRef: z.string().min(1),
  })
  .strict();

export const Route = createFileRoute("/api/step-up/open")({
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
          const session = await openAuthenticatedStepUp({
            accessToken: token,
            controlRef: body.controlRef,
          });
          const controls = await stepUpControls();
          const control = await controls.resolveApproval(session.controlRef);
          const document = compileStepUpSurface({
            actionRef: control.actionRef,
            explanation:
              "Step-up approval for sealed ProposalRef via opaque control.",
            materialInputs: [
              { label: "Control", value: String(control.ref) },
            ],
            proposalRef: String(control.proposalRef),
            requiredAssurance: "oidc_step_up",
            stale: false,
            subjectLabel: control.actionRef.resourceId,
            workspaceLabel: String(control.tenantId),
          });
          const summaryNode = document.nodes["node.decision-summary"];
          const summary =
            summaryNode !== undefined && summaryNode.kind === "decision-summary"
              ? summaryNode.summary
              : String(control.proposalRef);
          return Response.json({
            operationId: control.operationId ?? null,
            proposalRef: String(session.proposalRef),
            sessionId: session.id,
            status: session.status,
            summary,
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
