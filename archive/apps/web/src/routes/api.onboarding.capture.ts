import { createFileRoute } from "@tanstack/react-router";
import {
  captureGoal,
  goalDigest,
  resumeOnboarding,
} from "@zoen/onboarding";
import { z } from "zod";
import { entryDomainHints } from "../pack-registry.js";
import {
  accountBrand,
  loadObserved,
  onboardingStore,
} from "../onboarding-server.js";

const bodySchema = z
  .object({
    wording: z.string().min(1).max(4000),
    accountId: z.string().min(1).max(200),
    workspaceClass: z.enum(["personal", "enterprise"]).optional(),
    pack: z.string().min(1).max(128).optional(),
    referral: z.string().min(1).max(200).optional(),
    intent: z.string().min(1).max(4000).optional(),
  })
  .strict();

export const Route = createFileRoute("/api/onboarding/capture")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = bodySchema.parse(await request.json());
          const accountId = accountBrand(body.accountId);
          const domainHints = entryDomainHints({
            intent: body.intent,
            pack: body.pack,
            referral: body.referral,
          });
          const session = await captureGoal({
            store: onboardingStore(),
            accountId,
            wording: body.wording,
            slots: {
              outcomeKind: "query_result",
              workspaceClass: body.workspaceClass ?? "enterprise",
              ...(domainHints === undefined ? {} : { domainHints }),
            },
          });
          const { next } = await resumeOnboarding({
            store: onboardingStore(),
            digest: goalDigest(session.digest),
            accountId,
            observed: await loadObserved(body.accountId),
          });
          return Response.json({
            digest: session.digest,
            wording: session.contract.wording,
            accountId: session.accountId,
            next,
            entry: {
              pack: body.pack ?? null,
              referral: body.referral ?? null,
              intent: body.intent ?? null,
              domainHints: domainHints ?? [],
            },
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
