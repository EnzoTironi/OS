import { createFileRoute } from "@tanstack/react-router";
import { searchPublicPacks } from "../pack-registry-server.js";

export const Route = createFileRoute("/api/packs/search")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const entries = await searchPublicPacks();
          return Response.json({ entries });
        } catch (cause: unknown) {
          const message =
            cause instanceof Error ? cause.message : String(cause);
          return Response.json(
            { error: message, kind: "unsupported" },
            { status: 503 },
          );
        }
      },
    },
  },
});
