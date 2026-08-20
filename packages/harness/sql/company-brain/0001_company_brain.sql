BEGIN;
SET LOCAL ROLE zoen_app;

CREATE TABLE company_sources (
    tenant_id TEXT NOT NULL,
    source_id TEXT NOT NULL,
    source_revision TEXT NOT NULL,
    kind TEXT NOT NULL,
    filename TEXT NOT NULL,
    media_type TEXT NOT NULL,
    content_digest TEXT NOT NULL,
    object_key TEXT NOT NULL,
    extraction_version TEXT NOT NULL,
    parser_name TEXT NOT NULL,
    parser_version_digest TEXT NOT NULL,
    status TEXT NOT NULL CHECK (
        status IN ('pending', 'stored', 'indexed', 'failed')
    ),
    failure_code TEXT CHECK (
        failure_code IS NULL OR failure_code IN (
            'corrupt_source',
            'embedding_unavailable',
            'extraction_failed',
            'metadata_store_unavailable',
            'object_store_unavailable',
            'unsupported_source'
        )
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, source_id, source_revision)
);

CREATE TABLE company_fragments (
    tenant_id TEXT NOT NULL,
    fragment_id TEXT NOT NULL,
    fragment_digest TEXT NOT NULL,
    source_id TEXT NOT NULL,
    source_revision TEXT NOT NULL,
    ordinal INTEGER NOT NULL,
    text TEXT NOT NULL,
    extraction_version TEXT NOT NULL,
    parser_name TEXT NOT NULL,
    parser_version_digest TEXT NOT NULL,
    index_version TEXT NOT NULL,
    embedding_model_id TEXT NOT NULL,
    embedding_model_revision TEXT NOT NULL,
    embedding_version_digest TEXT NOT NULL,
    embedding vector(384) NOT NULL,
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

CREATE TABLE company_retrieval_traces (
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

CREATE TABLE company_surface_sessions (
    tenant_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    session_digest TEXT NOT NULL,
    surface_session JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, session_id)
);

CREATE INDEX company_fragments_fts_idx
    ON company_fragments USING gin (search_vector);
CREATE INDEX company_fragments_vector_idx
    ON company_fragments USING hnsw (embedding vector_cosine_ops);

COMMIT;
