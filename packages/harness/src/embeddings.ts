import {
  pipeline,
  type FeatureExtractionPipeline,
} from "@huggingface/transformers";
import { z } from "zod";
import {
  embeddingProviderRouteSchema,
  type EmbeddingProvider,
  type EmbeddingProviderRoute,
} from "./types.js";

const embeddingBatchSchema = z.array(z.array(z.number().finite()));

type EmbeddingModelSource =
  | { readonly kind: "cache-or-remote" }
  | { readonly kind: "local"; readonly path: string };

export class LocalTransformerEmbeddingProvider implements EmbeddingProvider {
  readonly route: EmbeddingProviderRoute;
  #extractor: Promise<FeatureExtractionPipeline> | undefined;
  readonly #source: EmbeddingModelSource;

  constructor(
    route: EmbeddingProviderRoute,
    source: EmbeddingModelSource = { kind: "cache-or-remote" },
  ) {
    this.route = embeddingProviderRouteSchema.parse(route);
    this.#source = source;
  }

  async embed(
    texts: readonly string[],
  ): Promise<readonly (readonly number[])[]> {
    if (texts.length === 0) {
      return [];
    }
    const extractor = await this.extractor();
    const tensor = await extractor([...texts], {
      normalize: true,
      pooling: "mean",
    });
    const raw: unknown = tensor.tolist();
    const embeddings = embeddingBatchSchema.parse(raw);
    if (
      embeddings.length !== texts.length ||
      embeddings.some((embedding) => embedding.length !== this.route.dimensions)
    ) {
      throw new Error(
        `embedding model returned a shape other than ${texts.length}x${this.route.dimensions}`,
      );
    }
    return embeddings;
  }

  private extractor(): Promise<FeatureExtractionPipeline> {
    const local = this.#source.kind === "local";
    this.#extractor ??= pipeline(
      "feature-extraction",
      local ? this.#source.path : this.route.modelId,
      {
        dtype: "q8",
        local_files_only: local,
        revision: this.route.modelRevision,
      },
    );
    return this.#extractor;
  }
}
