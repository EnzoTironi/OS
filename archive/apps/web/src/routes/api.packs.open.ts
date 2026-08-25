import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { openPackDirectory } from "../pack-registry-server.js";

const bodySchema = z
  .object({
    packDigest: z.string().min(1).max(128),
  })
  .strict();

export const Route = createFileRoute("/api/packs/open")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = bodySchema.parse(await request.json());
          const view = await openPackDirectory(body.packDigest);
          if (view.kind === "unsupported") {
            return Response.json(view, { status: 404 });
          }
          return Response.json(view);
        } catch (cause: unknown) {
          const message =
            cause instanceof Error ? cause.message : String(cause);
          return Response.json(
            { kind: "unsupported", reason: message },
            { status: 400 },
          );
        }
      },
    },
  },
});
