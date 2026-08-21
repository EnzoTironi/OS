import { createHash } from "node:crypto";
import { embeddingProviderRouteSchema } from "./types.js";

const modelId = "Xenova/all-MiniLM-L6-v2";
const modelRevision = "751bff37182d3f1213fa05d7196b954e230abad9";

export const defaultEmbeddingModelPath =
  "/app/models/Xenova/all-MiniLM-L6-v2";

export const defaultEmbeddingRoute = embeddingProviderRouteSchema.parse({
  capability: "embedding-default",
  dimensions: 384,
  id: "local-minilm",
  kind: "local-embedding",
  modelId,
  modelRevision,
  versionDigest: createHash("sha256")
    .update(
      JSON.stringify({
        dimensions: 384,
        dtype: "q8",
        modelId,
        modelRevision,
        normalize: true,
        pooling: "mean",
      }),
    )
    .digest("hex"),
});
