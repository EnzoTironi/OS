import { createHash } from "node:crypto";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getDocument, version as pdfjsVersion } from "pdfjs-dist/legacy/build/pdf.mjs";
import { Pool, type PoolClient } from "pg";
import { z } from "zod";
import { AgentRegistry } from "./registry.js";
import {
  modelCapabilityAliasSchema,
  type EmbeddingProvider,
  type KnowledgeContext,
  type KnowledgeContextResult,
  type ModelCapabilityAlias,
} from "./types.js";

const identifier = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/);
const digest = z.string().regex(/^[0-9a-f]{64}$/);
const base64 = z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/);
const scoreSchema = z.number().finite().nullable();
const rankSchema = z.number().int().positive().nullable();
const messageSchema = z
  .object({
    channel: z.string().min(1).max(200),
    messageId: identifier,
    sender: z.string().min(1).max(500),
    sentAt: z.iso.datetime(),
    subject: z.string().min(1).max(1_000),
    text: z.string().min(1).max(100_000),
  })
  .strict();

export const sourceInputSchema = z.discriminatedUnion("kind", [
  z
    .object({
      contentBase64: base64,
      filename: z.string().min(1).max(500),
      kind: z.literal("pdf"),
      sourceId: identifier,
    })
    .strict(),
  z
    .object({
      filename: z.string().min(1).max(500),
      kind: z.literal("message"),
      message: messageSchema,
      sourceId: identifier,
    })
    .strict(),
]);
export type SourceInput = z.infer<typeof sourceInputSchema>;

export interface RawSourceObject {
  readonly contentDigest: string;
  readonly extractionVersion: string;
  readonly filename: string;
  readonly mediaType: string;
  readonly objectKey: string;
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
  readonly source_digest: string;
  readonly source_id: string;
  readonly source_revision: string;
  readonly text: string;
  readonly vector_rank: string | null;
  readonly vector_score: number | null;
}

const directJournal: IngestJournal = {
  run: (_name, action) => action(),
};

export const companyBrainIndexVersion = "hybrid-rrf-v1";

export class CompanyBrain {
  readonly #bucket: string;
  readonly #embeddingCapability: ModelCapabilityAlias;
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
    await this.#pool.query("CREATE EXTENSION IF NOT EXISTS vector");
    await this.#pool.query(`
      CREATE TABLE IF NOT EXISTS company_sources (
        tenant_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        source_revision TEXT NOT NULL,
        kind TEXT NOT NULL,
        filename TEXT NOT NULL,
        media_type TEXT NOT NULL,
        content_digest TEXT NOT NULL,
        object_key TEXT NOT NULL,
        extraction_version TEXT NOT NULL,
        status TEXT NOT NULL,
        failure_code TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
        PRIMARY KEY (tenant_id, source_id, source_revision)
      );

      CREATE TABLE IF NOT EXISTS company_fragments (
        tenant_id TEXT NOT NULL,
        fragment_id TEXT NOT NULL,
        fragment_digest TEXT NOT NULL,
        source_id TEXT NOT NULL,
        source_revision TEXT NOT NULL,
        ordinal INTEGER NOT NULL,
        text TEXT NOT NULL,
        extraction_version TEXT NOT NULL,
        index_version TEXT NOT NULL,
        embedding_model_id TEXT NOT NULL,
        embedding_model_revision TEXT NOT NULL,
        embedding_version_digest TEXT NOT NULL,
        embedding vector(${embedding.route.dimensions}) NOT NULL,
        search_vector tsvector GENERATED ALWAYS AS (
          to_tsvector('english', text)
        ) STORED,
        created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
        PRIMARY KEY (tenant_id, fragment_id),
        UNIQUE (tenant_id, source_id, source_revision, ordinal),
        FOREIGN KEY (tenant_id, source_id, source_revision)
          REFERENCES company_sources (tenant_id, source_id, source_revision)
          ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS company_retrieval_traces (
        tenant_id TEXT NOT NULL,
        trace_id TEXT NOT NULL,
        query_digest TEXT NOT NULL,
        index_version TEXT NOT NULL,
        embedding_model_id TEXT NOT NULL,
        embedding_model_revision TEXT NOT NULL,
        embedding_version_digest TEXT NOT NULL,
        trace JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
        PRIMARY KEY (tenant_id, trace_id)
      );
    `);
    await this.createIndexes();
  }

  async ingest(
    trustedTenantId: string,
    value: unknown,
    journal: IngestJournal = directJournal,
  ): Promise<IngestionResult> {
    const tenantId = identifier.parse(trustedTenantId);
    const input = sourceInputSchema.parse(value);
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
      await this.markFailed(raw, failureCode(error));
      throw error;
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
      DROP INDEX IF EXISTS company_fragments_fts_idx;
      DROP INDEX IF EXISTS company_fragments_vector_idx;
    `);
    await this.createIndexes();
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
    await this.#pool.query(
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
          status,
          failure_code
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', NULL)
        ON CONFLICT (tenant_id, source_id, source_revision)
        DO UPDATE SET
          filename = EXCLUDED.filename,
          media_type = EXCLUDED.media_type,
          object_key = EXCLUDED.object_key,
          extraction_version = EXCLUDED.extraction_version,
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
      ],
    );
    const body = sourceBytes(input);
    await this.#s3.send(
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
    );
    await this.#pool.query(
      `
        UPDATE company_sources
        SET status = 'stored', updated_at = clock_timestamp()
        WHERE tenant_id = $1
          AND source_id = $2
          AND source_revision = $3
      `,
      [source.tenantId, source.sourceId, source.sourceRevision],
    );
    return source;
  }

  private async extract(
    source: RawSourceObject,
  ): Promise<readonly ExtractedFragment[]> {
    const bytes = await this.readObject(source.objectKey);
    if (sha256(bytes) !== source.contentDigest) {
      throw new Error("stored source digest does not match source metadata");
    }
    const texts =
      source.mediaType === "application/pdf"
        ? await extractPdf(bytes)
        : extractMessage(bytes);
    if (texts.length === 0) {
      throw new Error("source extraction produced no text fragments");
    }
    return texts.map((text, ordinal) =>
      fragmentFor(source, normalizeText(text), ordinal),
    );
  }

  private async index(
    source: RawSourceObject,
    fragments: readonly ExtractedFragment[],
  ): Promise<void> {
    const embedding = this.embeddingProvider();
    const vectors = await embedding.embed(fragments.map((fragment) => fragment.text));
    if (vectors.length !== fragments.length) {
      throw new Error("embedding provider returned the wrong fragment count");
    }
    const client = await this.#pool.connect();
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
          throw new Error(`missing embedding for fragment ${fragment.fragmentId}`);
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
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async createIndexes(): Promise<void> {
    await this.#pool.query(`
      CREATE INDEX IF NOT EXISTS company_fragments_fts_idx
        ON company_fragments USING gin (search_vector);
      CREATE INDEX IF NOT EXISTS company_fragments_vector_idx
        ON company_fragments USING hnsw (embedding vector_cosine_ops);
    `);
  }

  private embeddingProvider(): EmbeddingProvider {
    const resolution = this.#registry.resolveEmbeddingProvider(
      this.#embeddingCapability,
    );
    switch (resolution.kind) {
      case "available":
        return resolution.provider;
      case "unavailable":
        throw new Error(
          `embedding provider ${this.#embeddingCapability} is unavailable`,
        );
      default: {
        const exhaustive: never = resolution;
        return exhaustive;
      }
    }
  }

  private async readObject(objectKey: string): Promise<Uint8Array> {
    const response = await this.#s3.send(
      new GetObjectCommand({
        Bucket: this.#bucket,
        Key: objectKey,
      }),
    );
    if (response.Body === undefined) {
      throw new Error(`object ${objectKey} returned no body`);
    }
    return response.Body.transformToByteArray();
  }

  private async loadSource(
    tenantId: string,
    sourceId: string,
    sourceRevision: string,
  ): Promise<RawSourceObject> {
    const result = await this.#pool.query<StoredSourceRow>(
      `
        SELECT tenant_id, source_id, source_revision, filename, media_type,
               content_digest, object_key, extraction_version
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
      sourceId: row.source_id,
      sourceRevision: row.source_revision,
      tenantId: row.tenant_id,
    };
  }

  private async markFailed(
    source: RawSourceObject,
    code: string,
  ): Promise<void> {
    await this.#pool
      .query(
        `
          UPDATE company_sources
          SET status = 'failed', failure_code = $4,
              updated_at = clock_timestamp()
          WHERE tenant_id = $1
            AND source_id = $2
            AND source_revision = $3
        `,
        [source.tenantId, source.sourceId, source.sourceRevision, code],
      )
      .catch(() => undefined);
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
        index_version,
        embedding_model_id,
        embedding_model_revision,
        embedding_version_digest,
        embedding
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::vector
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
  const extractionVersion =
    input.kind === "pdf" ? `pdfjs-${pdfjsVersion}` : "message-v1";
  const mediaType =
    input.kind === "pdf" ? "application/pdf" : "application/vnd.zoen.message+json";
  return {
    contentDigest,
    extractionVersion,
    filename: input.filename,
    mediaType,
    objectKey: `company-brain/${tenantId}/${contentDigest}`,
    sourceId: input.sourceId,
    sourceRevision: contentDigest,
    tenantId,
  };
}

function sourceBytes(input: SourceInput): Uint8Array {
  switch (input.kind) {
    case "pdf":
      return Buffer.from(input.contentBase64, "base64");
    case "message":
      return new TextEncoder().encode(
        JSON.stringify({
          channel: input.message.channel,
          messageId: input.message.messageId,
          sender: input.message.sender,
          sentAt: input.message.sentAt,
          subject: input.message.subject,
          text: input.message.text,
        }),
      );
    default: {
      const exhaustive: never = input;
      return exhaustive;
    }
  }
}

async function extractPdf(bytes: Uint8Array): Promise<readonly string[]> {
  const loading = getDocument({
    data: bytes,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const document = await loading.promise;
  try {
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ");
      if (normalizeText(text).length > 0) {
        pages.push(text);
      }
    }
    return pages;
  } finally {
    await document.destroy();
  }
}

function extractMessage(bytes: Uint8Array): readonly string[] {
  const raw: unknown = JSON.parse(new TextDecoder().decode(bytes));
  const message = messageSchema.parse(raw);
  return [
    [
      `Subject: ${message.subject}`,
      `From: ${message.sender}`,
      `Channel: ${message.channel}`,
      `Sent: ${message.sentAt}`,
      "",
      message.text,
    ].join("\n"),
  ];
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
    throw new Error("embedding vector must contain finite values");
  }
  return `[${vector.join(",")}]`;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function failureCode(error: unknown): string {
  if (error instanceof Error) {
    if (/embedding provider/u.test(error.message)) {
      return "embedding_provider_unavailable";
    }
    if (/PDF|pdf/u.test(error.message)) {
      return "extraction_failed";
    }
  }
  return "ingestion_failed";
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
