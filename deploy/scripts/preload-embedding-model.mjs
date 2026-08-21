import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { env } from "@huggingface/transformers";
import {
  defaultEmbeddingModelPath,
  defaultEmbeddingRoute,
} from "../../dist/packages/harness/src/default-embedding.js";
import { LocalTransformerEmbeddingProvider } from "../../dist/packages/harness/src/embeddings.js";

const provider = new LocalTransformerEmbeddingProvider(defaultEmbeddingRoute);
await provider.embed(["Zoen shared SaaS embedding model preload"]);

if (env.cacheDir === null) {
  throw new Error("transformer filesystem cache is unavailable");
}
const revisionCache = join(
  env.cacheDir,
  defaultEmbeddingRoute.modelId,
  defaultEmbeddingRoute.modelRevision,
);
await rm(defaultEmbeddingModelPath, { force: true, recursive: true });
await mkdir(dirname(defaultEmbeddingModelPath), { recursive: true });
await cp(revisionCache, defaultEmbeddingModelPath, { recursive: true });
await rm(env.cacheDir, { force: true, recursive: true });
