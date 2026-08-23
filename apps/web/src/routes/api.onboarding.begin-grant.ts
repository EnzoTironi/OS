import { createFileRoute } from "@tanstack/react-router";
import {
  beginCapabilityGrant,
  goalDigest,
  type MissingCapability,
} from "@zoen/onboarding";
import { z } from "zod";
import {
  accountBrand,
  loadObserved,
  onboardingStore,
} from "../onboarding-server.js";

const missingSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("identity"),
      grantClass: z.enum(["verify_binding", "oidc_login"]),
      why: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("workspace"),
      workspaceClass: z.enum(["personal", "enterprise"]),
      why: z.string().min(1),
      inviteRef: z.string().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("read_source"),
      scope: z.literal("readonly"),
      why: z.string().min(1),
      sourceHint: z.string().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("write_scope"),
      scope: z.literal("action_effect"),
      why: z.string().min(1),
      actionId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("ambiguity"),
      questionId: z.string().min(1),
      prompt: z.string().min(1),
      why: z.string().min(1),
    })
    .strict(),
]);

const bodySchema = z
  .object({
    digest: z.string().min(1),
    accountId: z.string().min(1),
    missing: missingSchema,
  })
  .strict();

export const Route = createFileRoute("/api/onboarding/begin-grant")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = bodySchema.parse(await request.json());
          if (body.missing.kind === "write_scope") {
            return Response.json(
              { error: "IllegalWriteScopeForContract" },
              { status: 400 },
            );
          }
          const accountId = accountBrand(body.accountId);
          const result = await beginCapabilityGrant({
            store: onboardingStore(),
            digest: goalDigest(body.digest),
            accountId,
            missing: body.missing as MissingCapability,
            observed: await loadObserved(body.accountId),
            redirectUrlFor: (missing, operationId) => {
              const callback = new URL(
                "/onboarding/auth/callback",
                request.url,
              );
              callback.searchParams.set("digest", body.digest);
              callback.searchParams.set("accountId", body.accountId);
              callback.searchParams.set("operationId", operationId);
              callback.searchParams.set("missing", missing.kind);
              return callback.toString();
            },
          });
          return Response.json({
            redirectUrl: result.redirectUrl,
            operationId: result.operationId,
            resumeToken: result.resumeToken,
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
