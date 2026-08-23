import { createFileRoute } from "@tanstack/react-router";
import { goalDigest, resumeOnboarding } from "@zoen/onboarding";
import {
  accountBrand,
  getObserved,
  onboardingStore,
} from "../onboarding-server.js";

export const Route = createFileRoute("/api/onboarding/resume")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const digestRaw = url.searchParams.get("digest");
          const accountRaw = url.searchParams.get("accountId");
          if (digestRaw === null || accountRaw === null) {
            return Response.json(
              { error: "digest and accountId required" },
              { status: 400 },
            );
          }
          const accountId = accountBrand(accountRaw);
          const { session, next } = await resumeOnboarding({
            store: onboardingStore(),
            digest: goalDigest(digestRaw),
            accountId,
            observed: getObserved(accountRaw),
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
          const status = message === "SessionNotFound" ? 404 : 400;
          return Response.json({ error: message }, { status });
        }
      },
    },
  },
});
