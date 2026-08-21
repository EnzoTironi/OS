import { defaultEmbeddingRoute } from "../../dist/packages/harness/src/default-embedding.js";
import { LocalTransformerEmbeddingProvider } from "../../dist/packages/harness/src/embeddings.js";

const provider = new LocalTransformerEmbeddingProvider(defaultEmbeddingRoute);
await provider.embed(["Zoen shared SaaS embedding model preload"]);
