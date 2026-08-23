import { createFileRoute } from "@tanstack/react-router";
import {
  captureGoal,
  goalDigest,
  resumeOnboarding,
} from "@zoen/onboarding";
import { z } from "zod";
import {
  accountBrand,
  getObserved,
  onboardingStore,
} from "../onboarding-server.js";

const bodySchema = z
  .object({
    wording: z.string().min(1).max(4000),
    accountId: z.string().min(1).max(200),
    workspaceClass: z.enum(["personal", "enterprise"]).optional(),
  })
  .strict();

export const Route = createFileRoute("/api/onboarding/capture")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = bodySchema.parse(await request.json());
          const accountId = accountBrand(body.accountId);
          const session = await captureGoal({
            store: onboardingStore(),
            accountId,
            wording: body.wording,
            slots: {
              outcomeKind: "query_result",
              workspaceClass: body.workspaceClass ?? "enterprise",
            },
          });
          const { next } = await resumeOnboarding({
            store: onboardingStore(),
            digest: goalDigest(session.digest),
            accountId,
            observed: getObserved(body.accountId),
          });
          return Response.json({
            digest: session.digest,
            wording: session.contract.wording,
            accountId: session.accountId,
            next,
          });
        } catch (cause: unknown) {
          const message =
            cause instanceof Error ? cause.message : String(cause);
          return Response.json({ error: message }, { status: 400 });
        }
      },
    },
  },
});
