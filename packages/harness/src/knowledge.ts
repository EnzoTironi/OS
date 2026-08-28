import { createHash } from "node:crypto";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Pool, type PoolClient } from "pg";
import { z } from "zod";
import {
  companyIdentifierSchema,
  extractCompanySource,
  isConvertError,
  parserForSource,
  sourceBytes,
  sourceInputSchema,
  type SourceInput,
} from "./extraction.js";
import { AgentRegistry } from "./registry.js";
import {
  modelCapabilityAliasSchema,
  type EmbeddingProvider,
  type KnowledgeContext,
  type KnowledgeContextResult,
  type ModelCapabilityAlias,
} from "./types.js";

const identifier = companyIdentifierSchema;
const digest = z.string().regex(/^[0-9a-f]{64}$/);
const scoreSchema = z.number().finite().nullable();
const rankSchema = z.number().int().positive().nullable();
export interface RawSourceObject {
  readonly contentDigest: string;
  readonly extractionVersion: string;
  readonly filename: string;
  readonly mediaType: string;
  readonly objectKey: string;
  readonly parserName: string;
  readonly parserVersionDigest: string;
  readonly sourceId: string;
  readonly sourceRevision: string;
  readonly tenantId: string;
}

export interface ExtractedFragment {
  readonly extractionVersion: string;
  readonly fragmentDigest: string;
  readonly fragmentId: string;
  readonly indexVersion: string;
  readonly ordinal: number;
  readonly parserName: string;
  readonly parserVersionDigest: string;
  readonly sourceId: string;
  readonly sourceRevision: string;
  readonly tenantId: string;
  readonly text: string;
}

export interface IngestionResult {
  readonly fragments: readonly ExtractedFragment[];
  readonly source: RawSourceObject;
}

export interface IngestJournal {
  run<T>(name: string, action: () => Promise<T>): Promise<T>;
}

interface CompanyBrainOptions {
  readonly bucket: string;
  readonly embeddingCapability: ModelCapabilityAlias;
  readonly pool: Pool;
  readonly registry: AgentRegistry;
  readonly s3: S3Client;
}

interface StoredSourceRow {
  readonly content_digest: string;
  readonly extraction_version: string;
  readonly filename: string;
  readonly media_type: string;
  readonly object_key: string;
  readonly parser_name: string;
  readonly parser_version_digest: string;
  readonly source_id: string;
  readonly source_revision: string;
  readonly tenant_id: string;
}

interface RetrievalRow {
  readonly extraction_version: string;
  readonly fragment_digest: string;
  readonly fragment_id: string;
  readonly index_version: string;
  readonly lexical_rank: string | null;
  readonly lexical_score: number | null;
  readonly parser_name: string;
  readonly parser_version_digest: string;
  readonly source_digest: string;
  readonly source_id: string;
  readonly source_revision: string;
  readonly text: string;
  readonly vector_rank: string | null;
  readonly vector_score: number | null;
}

interface StorageCatalogRow {
  readonly embedding_type: string | null;
  readonly extversion: string;
  readonly fragment_table: string | null;
  readonly source_table: string | null;
  readonly trace_table: string | null;
}

const directJournal: IngestJournal = {
  run: (_name, action) => action(),
};

export const companyBrainIndexVersion = "hybrid-rrf-v1";

export const ingestFailureCodes = [
  "corrupt_source",
  "embedding_unavailable",
  "extraction_failed",
  "metadata_store_unavailable",
  "object_store_unavailable",
  "unsupported_source",
] as const;
export type IngestFailureCode = (typeof ingestFailureCodes)[number];

export class IngestFailure extends Error {
  readonly code: IngestFailureCode;

  constructor(
    code: IngestFailureCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.code = code;
    this.name = "IngestFailure";
  }
}

export class CompanyBrainConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompanyBrainConfigurationError";
  }
}

export class CompanyBrain {
  readonly #bucket: string;
  readonly #embeddingCapability: ModelCapabilityAlias;
  #embeddingDimensions: number | undefined;
  readonly #pool: Pool;
  readonly #registry: AgentRegistry;
  readonly #s3: S3Client;

  constructor(options: CompanyBrainOptions) {
    this.#bucket = z.string().min(1).parse(options.bucket);
    this.#embeddingCapability = modelCapabilityAliasSchema.parse(
      options.embeddingCapability,
    );
    this.#pool = options.pool;
    this.#registry = options.registry;
    this.#s3 = options.s3;
  }

  async initialize(): Promise<void> {
    const embedding = this.embeddingProvider();
    const catalog = await this.#pool.query<StorageCatalogRow>(`
      SELECT extension.extversion,
             format_type(attribute.atttypid, attribute.atttypmod)
               AS embedding_type,
             to_regclass('public.company_sources')::text AS source_table,
             to_regclass('public.company_fragments')::text AS fragment_table,
             to_regclass('public.company_retrieval_traces')::text AS trace_table
      FROM pg_extension AS extension
      LEFT JOIN pg_class AS relation
        ON relation.oid = to_regclass('public.company_fragments')
      LEFT JOIN pg_attribute AS attribute
        ON attribute.attrelid = relation.oid
       AND attribute.attname = 'embedding'
       AND NOT attribute.attisdropped
      WHERE extension.extname = 'vector'
    `);
    const row = catalog.rows[0];
    if (row === undefined) {
      throw new CompanyBrainConfigurationError(
        "pgvector extension is not installed",
      );
    }
    if (
      row.source_table === null ||
      row.fragment_table === null ||
      row.trace_table === null
    ) {
      throw new CompanyBrainConfigurationError(
        "Company Brain storage migration is incomplete",
      );
    }
    const expectedType = `vector(${embedding.route.dimensions})`;
    if (row.embedding_type !== expectedType) {
      throw new CompanyBrainConfigurationError(
        `Company Brain embedding column is ${
          row.embedding_type ?? "missing"
        }; expected ${expectedType}`,
      );
    }
    this.#embeddingDimensions = embedding.route.dimensions;
  }

  async ingest(
    trustedTenantId: string,
    value: unknown,
    journal: IngestJournal = directJournal,
  ): Promise<IngestionResult> {
    const tenantId = identifier.parse(trustedTenantId);
    const parsedInput = sourceInputSchema.safeParse(value);
    if (!parsedInput.success) {
      throw new IngestFailure(
        "corrupt_source",
        "company source input is invalid",
        { cause: parsedInput.error },
      );
    }
    const input = parsedInput.data;
    const raw = rawSource(tenantId, input);
    try {
      const source = await journal.run("store raw company source", () =>
        this.storeRawSource(raw, input),
      );
      const fragments = await journal.run("extract company source", () =>
        this.extract(source),
      );
      await journal.run("embed and index company fragments", () =>
        this.index(source, fragments),
      );
      return { fragments, source };
    } catch (error: unknown) {
      const failure = asIngestFailure(error);
      try {
        await this.markFailed(raw, failure.code);
      } catch (statusError: unknown) {
        throw new IngestFailure(
          "metadata_store_unavailable",
          "ingest failed and its terminal status could not be persisted",
          { cause: new AggregateError([failure, statusError]) },
        );
      }
      throw failure;
    }
  }

  async retrieve(
    trustedTenantId: string,
    query: string,
    limit = 5,
  ): Promise<KnowledgeContext> {
    const tenantId = identifier.parse(trustedTenantId);
    const parsedQuery = z.string().min(1).max(16_000).parse(query);
    const parsedLimit = z.number().int().min(1).max(20).parse(limit);
    const embedding = this.embeddingProvider();
    const vectors = await embedding.embed([parsedQuery]);
    const queryVector = vectors[0];
    if (queryVector === undefined) {
      throw new Error("embedding provider returned no query vector");
    }
    const rows = await this.#pool.query<RetrievalRow>(
      `
        WITH lexical_candidates AS (
          SELECT fragment_id,
                 ts_rank_cd(
                   search_vector,
                   websearch_to_tsquery('english', $2)
                 ) AS score
          FROM company_fragments
          WHERE tenant_id = $1
            AND index_version = $4
            AND search_vector @@ websearch_to_tsquery('english', $2)
          ORDER BY score DESC, fragment_id
          LIMIT $5
        ),
        lexical AS (
          SELECT fragment_id,
                 score,
                 row_number() OVER (ORDER BY score DESC, fragment_id) AS rank
          FROM lexical_candidates
        ),
        vector_candidates AS (
          SELECT fragment_id,
                 1 - (embedding <=> $3::vector) AS score
          FROM company_fragments
          WHERE tenant_id = $1
            AND index_version = $4
          ORDER BY embedding <=> $3::vector, fragment_id
          LIMIT $5
        ),
        vector_results AS (
          SELECT fragment_id,
                 score,
                 row_number() OVER (ORDER BY score DESC, fragment_id) AS rank
          FROM vector_candidates
        ),
        candidates AS (
          SELECT fragment_id FROM lexical
          UNION
          SELECT fragment_id FROM vector_results
        )
        SELECT fragment.fragment_id,
               fragment.fragment_digest,
               fragment.text,
               fragment.extraction_version,
               fragment.parser_name,
               fragment.parser_version_digest,
               fragment.index_version,
               source.source_id,
               source.source_revision,
               source.content_digest AS source_digest,
               lexical.rank::text AS lexical_rank,
               lexical.score::float8 AS lexical_score,
               vector_results.rank::text AS vector_rank,
               vector_results.score::float8 AS vector_score
        FROM candidates
        JOIN company_fragments AS fragment
          ON fragment.tenant_id = $1
         AND fragment.fragment_id = candidates.fragment_id
        JOIN company_sources AS source
          ON source.tenant_id = fragment.tenant_id
         AND source.source_id = fragment.source_id
         AND source.source_revision = fragment.source_revision
        LEFT JOIN lexical ON lexical.fragment_id = fragment.fragment_id
        LEFT JOIN vector_results
          ON vector_results.fragment_id = fragment.fragment_id
        ORDER BY
          COALESCE(1.0 / (60 + lexical.rank), 0) +
          COALESCE(1.0 / (60 + vector_results.rank), 0) DESC,
          fragment.fragment_id
        LIMIT $6
      `,
      [
        tenantId,
        parsedQuery,
        vectorLiteral(queryVector),
        companyBrainIndexVersion,
        parsedLimit * 4,
        parsedLimit,
      ],
    );
    const results = rows.rows.map(retrievalResult);
    const queryDigest = sha256(parsedQuery);
    const traceId = sha256(
      JSON.stringify({
        embeddingVersionDigest: embedding.route.versionDigest,
        indexVersion: companyBrainIndexVersion,
        queryDigest,
        results: results.map((result) => ({
          fragmentDigest: result.fragmentDigest,
          fragmentId: result.fragmentId,
          lexicalRank: result.lexicalRank,
          vectorRank: result.vectorRank,
        })),
        tenantId,
      }),
    );
    const trace: KnowledgeContext = {
      embeddingModel: {
        modelId: embedding.route.modelId,
        modelRevision: embedding.route.modelRevision,
        versionDigest: embedding.route.versionDigest,
      },
      queryDigest,
      results,
      traceId,
    };
    await this.#pool.query(
      `
        INSERT INTO company_retrieval_traces (
          tenant_id,
          trace_id,
          query_digest,
          index_version,
          embedding_model_id,
          embedding_model_revision,
          embedding_version_digest,
          trace
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
        ON CONFLICT (tenant_id, trace_id) DO NOTHING
      `,
      [
        tenantId,
        traceId,
        queryDigest,
        companyBrainIndexVersion,
        embedding.route.modelId,
        embedding.route.modelRevision,
        embedding.route.versionDigest,
        JSON.stringify(trace),
      ],
    );
    return trace;
  }

  async rebuildIndexes(): Promise<void> {
    await this.#pool.query(`
      REINDEX INDEX company_fragments_fts_idx;
      REINDEX INDEX company_fragments_vector_idx;
    `);
  }

  async sourceBytes(
    trustedTenantId: string,
    sourceId: string,
    sourceRevision: string,
  ): Promise<Uint8Array> {
    const source = await this.loadSource(
      identifier.parse(trustedTenantId),
      identifier.parse(sourceId),
      digest.parse(sourceRevision),
    );
    return this.readObject(source.objectKey);
  }

  async fragmentIds(
    trustedTenantId: string,
  ): Promise<readonly string[]> {
    const result = await this.#pool.query<{ fragment_id: string }>(
      `
        SELECT fragment_id
        FROM company_fragments
        WHERE tenant_id = $1
        ORDER BY fragment_id
      `,
      [identifier.parse(trustedTenantId)],
    );
    return result.rows.map((row) => row.fragment_id);
  }

  private async storeRawSource(
    source: RawSourceObject,
    input: SourceInput,
  ): Promise<RawSourceObject> {
    await metadataOperation(
      "store pending company source metadata",
      () =>
        this.#pool.query(
          `
            INSERT INTO company_sources (
              tenant_id,
              source_id,
              source_revision,
              kind,
              filename,
              media_type,
              content_digest,
              object_key,
              extraction_version,
              parser_name,
              parser_version_digest,
              status,
              failure_code
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending', NULL
            )
            ON CONFLICT (tenant_id, source_id, source_revision)
            DO UPDATE SET
              filename = EXCLUDED.filename,
              media_type = EXCLUDED.media_type,
              object_key = EXCLUDED.object_key,
              extraction_version = EXCLUDED.extraction_version,
              parser_name = EXCLUDED.parser_name,
              parser_version_digest = EXCLUDED.parser_version_digest,
              status = 'pending',
              failure_code = NULL,
              updated_at = clock_timestamp()
          `,
          [
            source.tenantId,
            source.sourceId,
            source.sourceRevision,
            input.kind,
            source.filename,
            source.mediaType,
            source.contentDigest,
            source.objectKey,
            source.extractionVersion,
            source.parserName,
            source.parserVersionDigest,
          ],
        ),
    );
    const body = sourceBytes(input);
    await objectStoreOperation(
      "store raw company source",
      () =>
        this.#s3.send(
          new PutObjectCommand({
            Body: body,
            Bucket: this.#bucket,
            ContentType: source.mediaType,
            Key: source.objectKey,
            Metadata: {
              "content-digest": source.contentDigest,
              "source-id": source.sourceId,
              "source-revision": source.sourceRevision,
              "tenant-id": source.tenantId,
            },
          }),
        ),
    );
    await metadataOperation(
      "mark company source as stored",
      () =>
        this.#pool.query(
          `
            UPDATE company_sources
            SET status = 'stored', updated_at = clock_timestamp()
            WHERE tenant_id = $1
              AND source_id = $2
              AND source_revision = $3
          `,
          [source.tenantId, source.sourceId, source.sourceRevision],
        ),
    );
    return source;
  }

  private async extract(
    source: RawSourceObject,
  ): Promise<readonly ExtractedFragment[]> {
    const bytes = await this.readObject(source.objectKey);
    if (sha256(bytes) !== source.contentDigest) {
      throw new IngestFailure(
        "corrupt_source",
        "stored source digest does not match source metadata",
      );
    }
    let texts: readonly string[];
    try {
      texts = await extractCompanySource(source.mediaType, bytes);
    } catch (error: unknown) {
      throw extractionFailure(error);
    }
    if (texts.length === 0) {
      throw new IngestFailure(
        "extraction_failed",
        "source extraction produced no text fragments",
      );
    }
    return texts.map((text, ordinal) =>
      fragmentFor(source, text.trim(), ordinal),
    );
  }

  private async index(
    source: RawSourceObject,
    fragments: readonly ExtractedFragment[],
  ): Promise<void> {
    const embedding = this.embeddingProvider();
    const vectors = await embeddingOperation(() =>
      embedding.embed(fragments.map((fragment) => fragment.text)),
    );
    if (vectors.length !== fragments.length) {
      throw new IngestFailure(
        "embedding_unavailable",
        "embedding provider returned the wrong fragment count",
      );
    }
    const client = await metadataOperation(
      "connect to Company Brain metadata store",
      () => this.#pool.connect(),
    );
    try {
      await client.query("BEGIN");
      await client.query(
        `
          DELETE FROM company_fragments
          WHERE tenant_id = $1
            AND source_id = $2
            AND source_revision = $3
        `,
        [source.tenantId, source.sourceId, source.sourceRevision],
      );
      for (const [index, fragment] of fragments.entries()) {
        const vector = vectors[index];
        if (vector === undefined) {
          throw new IngestFailure(
            "embedding_unavailable",
            `missing embedding for fragment ${fragment.fragmentId}`,
          );
        }
        await insertFragment(client, fragment, embedding, vector);
      }
      await client.query(
        `
          UPDATE company_sources
          SET status = 'indexed', failure_code = NULL,
              updated_at = clock_timestamp()
          WHERE tenant_id = $1
            AND source_id = $2
            AND source_revision = $3
        `,
        [source.tenantId, source.sourceId, source.sourceRevision],
      );
      await client.query("COMMIT");
    } catch (error: unknown) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError: unknown) {
        throw new IngestFailure(
          "metadata_store_unavailable",
          "Company Brain index transaction and rollback both failed",
          { cause: new AggregateError([error, rollbackError]) },
        );
      }
      if (error instanceof IngestFailure) {
        throw error;
      }
      throw new IngestFailure(
        "metadata_store_unavailable",
        "Company Brain index transaction failed",
        { cause: error },
      );
    } finally {
      client.release();
    }
  }

  private embeddingProvider(): EmbeddingProvider {
    const resolution = this.#registry.resolveEmbeddingProvider(
      this.#embeddingCapability,
    );
    switch (resolution.kind) {
      case "available":
        if (
          this.#embeddingDimensions !== undefined &&
          resolution.route.dimensions !== this.#embeddingDimensions
        ) {
          throw new CompanyBrainConfigurationError(
            `embedding route width ${resolution.route.dimensions} does not ` +
              `match initialized storage width ${this.#embeddingDimensions}`,
          );
        }
        return resolution.provider;
      case "unavailable":
        throw new IngestFailure(
          "embedding_unavailable",
          `embedding provider ${this.#embeddingCapability} is unavailable`,
        );
      default: {
        const exhaustive: never = resolution;
        return exhaustive;
      }
    }
  }

  private async readObject(objectKey: string): Promise<Uint8Array> {
    const response = await objectStoreOperation(
      "read raw company source",
      () =>
        this.#s3.send(
          new GetObjectCommand({
            Bucket: this.#bucket,
            Key: objectKey,
          }),
        ),
    );
    if (response.Body === undefined) {
      throw new IngestFailure(
        "object_store_unavailable",
        `object ${objectKey} returned no body`,
      );
    }
    const body = response.Body;
    return objectStoreOperation("read raw company source body", () =>
      body.transformToByteArray(),
    );
  }

  private async loadSource(
    tenantId: string,
    sourceId: string,
    sourceRevision: string,
  ): Promise<RawSourceObject> {
    const result = await this.#pool.query<StoredSourceRow>(
      `
        SELECT tenant_id, source_id, source_revision, filename, media_type,
               content_digest, object_key, extraction_version,
               parser_name, parser_version_digest
        FROM company_sources
        WHERE tenant_id = $1
          AND source_id = $2
          AND source_revision = $3
      `,
      [tenantId, sourceId, sourceRevision],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error("company source was not found");
    }
    return {
      contentDigest: row.content_digest,
      extractionVersion: row.extraction_version,
      filename: row.filename,
      mediaType: row.media_type,
      objectKey: row.object_key,
      parserName: row.parser_name,
      parserVersionDigest: row.parser_version_digest,
      sourceId: row.source_id,
      sourceRevision: row.source_revision,
      tenantId: row.tenant_id,
    };
  }

  private async markFailed(
    source: RawSourceObject,
    code: IngestFailureCode,
  ): Promise<void> {
    const result = await metadataOperation(
      "persist failed company ingest status",
      () =>
        this.#pool.query(
          `
          UPDATE company_sources
          SET status = 'failed', failure_code = $4,
              updated_at = clock_timestamp()
          WHERE tenant_id = $1
            AND source_id = $2
            AND source_revision = $3
        `,
          [source.tenantId, source.sourceId, source.sourceRevision, code],
        ),
    );
    if (result.rowCount !== 1) {
      throw new IngestFailure(
        "metadata_store_unavailable",
        "failed ingest source metadata was unavailable for status update",
      );
    }
  }
}

async function insertFragment(
  client: PoolClient,
  fragment: ExtractedFragment,
  embedding: EmbeddingProvider,
  vector: readonly number[],
): Promise<void> {
  await client.query(
    `
      INSERT INTO company_fragments (
        tenant_id,
        fragment_id,
        fragment_digest,
        source_id,
        source_revision,
        ordinal,
        text,
        extraction_version,
        parser_name,
        parser_version_digest,
        index_version,
        embedding_model_id,
        embedding_model_revision,
        embedding_version_digest,
        embedding
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::vector
      )
    `,
    [
      fragment.tenantId,
      fragment.fragmentId,
      fragment.fragmentDigest,
      fragment.sourceId,
      fragment.sourceRevision,
      fragment.ordinal,
      fragment.text,
      fragment.extractionVersion,
      fragment.parserName,
      fragment.parserVersionDigest,
      fragment.indexVersion,
      embedding.route.modelId,
      embedding.route.modelRevision,
      embedding.route.versionDigest,
      vectorLiteral(vector),
    ],
  );
}

function rawSource(tenantId: string, input: SourceInput): RawSourceObject {
  const bytes = sourceBytes(input);
  const contentDigest = sha256(bytes);
  const parser = parserForSource(input);
  const mediaType =
    input.kind === "pdf" ? "application/pdf" : "application/vnd.zoen.message+json";
  return {
    contentDigest,
    extractionVersion: parser.extractionVersion,
    filename: input.filename,
    mediaType,
    objectKey: `company-brain/${tenantId}/${contentDigest}`,
    parserName: parser.name,
    parserVersionDigest: sha256(parser.versionDigestInput),
    sourceId: input.sourceId,
    sourceRevision: contentDigest,
    tenantId,
  };
}

function fragmentFor(
  source: RawSourceObject,
  text: string,
  ordinal: number,
): ExtractedFragment {
  const fragmentDigest = sha256(text);
  const fragmentId = sha256(
    [
      "company-fragment-v1",
      source.tenantId,
      source.contentDigest,
      source.extractionVersion,
      String(ordinal),
      fragmentDigest,
    ].join("\0"),
  );
  return {
    extractionVersion: source.extractionVersion,
    fragmentDigest,
    fragmentId,
    indexVersion: companyBrainIndexVersion,
    ordinal,
    parserName: source.parserName,
    parserVersionDigest: source.parserVersionDigest,
    sourceId: source.sourceId,
    sourceRevision: source.sourceRevision,
    tenantId: source.tenantId,
    text,
  };
}

function retrievalResult(row: RetrievalRow): KnowledgeContextResult {
  return {
    fragmentDigest: digest.parse(row.fragment_digest),
    fragmentId: digest.parse(row.fragment_id),
    indexVersion: row.index_version,
    lexicalRank: rankSchema.parse(
      row.lexical_rank === null ? null : Number(row.lexical_rank),
    ),
    lexicalScore: scoreSchema.parse(row.lexical_score),
    parserName: row.parser_name,
    parserVersionDigest: digest.parse(row.parser_version_digest),
    sourceDigest: digest.parse(row.source_digest),
    sourceId: identifier.parse(row.source_id),
    sourceRevision: digest.parse(row.source_revision),
    text: row.text,
    vectorRank: rankSchema.parse(
      row.vector_rank === null ? null : Number(row.vector_rank),
    ),
    vectorScore: scoreSchema.parse(row.vector_score),
  };
}

function vectorLiteral(vector: readonly number[]): string {
  if (vector.length === 0 || vector.some((value) => !Number.isFinite(value))) {
    throw new IngestFailure(
      "embedding_unavailable",
      "embedding vector must contain finite values",
    );
  }
  return `[${vector.join(",")}]`;
}

function asIngestFailure(error: unknown): IngestFailure {
  return error instanceof IngestFailure
    ? error
    : new IngestFailure(
        "extraction_failed",
        "Company Brain ingest failed unexpectedly",
        { cause: error },
      );
}

function extractionFailure(error: unknown): IngestFailure {
  if (error instanceof IngestFailure) {
    return error;
  }
  if (!isConvertError(error)) {
    return new IngestFailure(
      "extraction_failed",
      "company source extraction failed",
      { cause: error },
    );
  }
  switch (error.code) {
    case "needsOcr":
    case "unsupported":
      return new IngestFailure("unsupported_source", error.message, {
        cause: error,
      });
    case "encrypted":
    case "malformed":
    case "missingPart":
      return new IngestFailure("corrupt_source", error.message, {
        cause: error,
      });
    case "hosted":
    case "io":
    case "resourceLimit":
      return new IngestFailure("extraction_failed", error.message, {
        cause: error,
      });
    default: {
      const exhaustive: never = error.code;
      return exhaustive;
    }
  }
}

async function embeddingOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error: unknown) {
    if (error instanceof IngestFailure) {
      throw error;
    }
    throw new IngestFailure(
      "embedding_unavailable",
      "company source embedding failed",
      { cause: error },
    );
  }
}

async function metadataOperation<T>(
  description: string,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error: unknown) {
    if (error instanceof IngestFailure) {
      throw error;
    }
    throw new IngestFailure("metadata_store_unavailable", description, {
      cause: error,
    });
  }
}

async function objectStoreOperation<T>(
  description: string,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error: unknown) {
    if (error instanceof IngestFailure) {
      throw error;
    }
    throw new IngestFailure("object_store_unavailable", description, {
      cause: error,
    });
  }
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
