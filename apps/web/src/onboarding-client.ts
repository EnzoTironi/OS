import { z } from "zod";

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

const planNextSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ask"), missing: missingSchema }).strict(),
  z.object({ kind: z.literal("ready_for_outcome") }).strict(),
  z
    .object({
      kind: z.literal("first_success"),
      record: z.record(z.string(), z.unknown()),
    })
    .strict(),
  z
    .object({
      kind: z.literal("blocked"),
      reason: z.string(),
      detail: z.string(),
    })
    .strict(),
]);

const captureResponseSchema = z
  .object({
    digest: z.string().min(1),
    wording: z.string().min(1),
    accountId: z.string().min(1),
    next: planNextSchema,
    entry: z
      .object({
        pack: z.string().nullable(),
        referral: z.string().nullable(),
        intent: z.string().nullable(),
        domainHints: z.array(z.string()),
      })
      .strict()
      .optional(),
  })
  .strict();

const resumeResponseSchema = z
  .object({
    digest: z.string().min(1),
    wording: z.string().min(1),
    accountId: z.string().min(1),
    next: planNextSchema,
  })
  .strict();

export type CaptureResponse = z.infer<typeof captureResponseSchema>;
export type ResumeResponse = z.infer<typeof resumeResponseSchema>;
export type PlanNextView = z.infer<typeof planNextSchema>;

export class OnboardingClient {
  constructor(private readonly baseUrl = "") {}

  async captureGoal(input: {
    readonly wording: string;
    readonly accountId: string;
    readonly workspaceClass?: "personal" | "enterprise";
    readonly pack?: string;
    readonly referral?: string;
    readonly intent?: string;
  }): Promise<CaptureResponse> {
    const response = await fetch(`${this.baseUrl}/api/onboarding/capture`, {
      body: JSON.stringify(input),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const body: unknown = await response.json();
    if (!response.ok) {
      throw new Error(
        typeof body === "object" &&
          body !== null &&
          "error" in body &&
          typeof (body as { error: unknown }).error === "string"
          ? (body as { error: string }).error
          : "captureGoal failed",
      );
    }
    return captureResponseSchema.parse(body);
  }

  async resume(input: {
    readonly digest: string;
    readonly accountId: string;
  }): Promise<ResumeResponse> {
    const url = new URL(
      `${this.baseUrl}/api/onboarding/resume`,
      window.location.origin,
    );
    url.searchParams.set("digest", input.digest);
    url.searchParams.set("accountId", input.accountId);
    const response = await fetch(url);
    const body: unknown = await response.json();
    if (!response.ok) {
      throw new Error("resumeOnboarding failed");
    }
    return resumeResponseSchema.parse(body);
  }

  async beginGrant(input: {
    readonly digest: string;
    readonly accountId: string;
    readonly missing: z.infer<typeof missingSchema>;
  }): Promise<{ redirectUrl: string; operationId: string; resumeToken: string }> {
    const response = await fetch(`${this.baseUrl}/api/onboarding/begin-grant`, {
      body: JSON.stringify(input),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const body: unknown = await response.json();
    if (!response.ok) {
      throw new Error("beginGrant failed");
    }
    return z
      .object({
        redirectUrl: z.string().min(1),
        operationId: z.string().min(1),
        resumeToken: z.string().min(1),
      })
      .parse(body);
  }
}
