import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const sessionIdSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
const generateRequestSchema = z
  .object({
    question: z.string().min(1).max(16_000),
  })
  .strict();

export const Route = createFileRoute("/api/adaptive-surface")({
  server: {
    handlers: {
      GET: ({ request }) => forwardAdaptiveSurface(request, "reload"),
      POST: ({ request }) => forwardAdaptiveSurface(request, "generate"),
    },
  },
});

async function forwardAdaptiveSurface(
  request: Request,
  mode: "generate" | "reload",
): Promise<Response> {
  const authorization = request.headers.get("authorization");
  if (authorization === null || !authorization.startsWith("Bearer ")) {
    return new Response("OIDC bearer token is required", { status: 401 });
  }
  const target = new URL(requiredEnvironment("ZOEN_WEB_ADAPTIVE_SURFACE_URL"));
  let body: string | undefined;
  if (mode === "generate") {
    body = JSON.stringify(generateRequestSchema.parse(await request.json()));
  } else {
    const sessionId = sessionIdSchema.parse(
      new URL(request.url).searchParams.get("sessionId"),
    );
    target.searchParams.set("sessionId", sessionId);
  }
  const response = await fetch(target, {
    body,
    headers: {
      authorization,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    method: mode === "generate" ? "POST" : "GET",
    redirect: "manual",
    signal: AbortSignal.timeout(300_000),
  });
  return new Response(response.body, {
    headers: {
      "content-type":
        response.headers.get("content-type") ?? "application/json",
    },
    status: response.status,
  });
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} is required`);
  }
  return value;
}
