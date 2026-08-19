ALTER TABLE authority_commits
ADD COLUMN commit_kind TEXT NOT NULL DEFAULT 'definition_publication'
CHECK (commit_kind IN ('definition_publication', 'evidence'));

ALTER TABLE definition_revisions
ADD CONSTRAINT definition_revisions_exact_revision_unique
UNIQUE (tenant_id, definition_id, digest, revision);

CREATE TABLE semantic_claims (
    tenant_id TEXT NOT NULL,
    claim_id TEXT NOT NULL,
    definition_id TEXT NOT NULL,
    definition_digest CHAR(64) NOT NULL CHECK (definition_digest ~ '^[0-9a-f]{64}$'),
    definition_revision BIGINT NOT NULL CHECK (definition_revision > 0),
    entity_id TEXT NOT NULL,
    relation_id TEXT NOT NULL,
    value_kind TEXT NOT NULL
        CHECK (value_kind IN ('bool', 'decimal', 'integer', 'quantity', 'text')),
    value_text TEXT NOT NULL,
    value_unit TEXT,
    valid_time_kind TEXT NOT NULL CHECK (valid_time_kind IN ('instant', 'interval')),
    valid_from_micros BIGINT NOT NULL,
    valid_to_micros BIGINT,
    source_id TEXT NOT NULL,
    source_digest CHAR(64) NOT NULL CHECK (source_digest ~ '^[0-9a-f]{64}$'),
    source_ref TEXT NOT NULL CHECK (source_ref <> ''),
    commit_sequence BIGINT NOT NULL CHECK (commit_sequence > 0),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, claim_id),
    FOREIGN KEY (tenant_id, commit_sequence)
        REFERENCES authority_commits (tenant_id, commit_sequence),
    FOREIGN KEY (
        tenant_id,
        definition_id,
        definition_digest,
        definition_revision
    ) REFERENCES definition_revisions (
        tenant_id,
        definition_id,
        digest,
        revision
    ),
    CHECK (
        (value_kind = 'quantity' AND value_unit IS NOT NULL)
        OR (value_kind <> 'quantity' AND value_unit IS NULL)
    ),
    CHECK (
        (valid_time_kind = 'instant' AND valid_to_micros IS NULL)
        OR (
            valid_time_kind = 'interval'
            AND valid_to_micros IS NOT NULL
            AND valid_from_micros < valid_to_micros
        )
    )
);

CREATE INDEX semantic_claims_query_index
ON semantic_claims (
    tenant_id,
    definition_id,
    definition_digest,
    relation_id,
    commit_sequence,
    valid_from_micros
);

CREATE TABLE projection_manifests (
    tenant_id TEXT NOT NULL,
    projection_id TEXT NOT NULL,
    manifest_digest CHAR(64) NOT NULL CHECK (manifest_digest ~ '^[0-9a-f]{64}$'),
    build_id TEXT NOT NULL,
    from_commit BIGINT NOT NULL CHECK (from_commit > 0),
    through_commit BIGINT NOT NULL CHECK (through_commit >= from_commit),
    manifest_object_key TEXT NOT NULL,
    parquet_object_key TEXT NOT NULL,
    parquet_digest CHAR(64) NOT NULL CHECK (parquet_digest ~ '^[0-9a-f]{64}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, projection_id, manifest_digest),
    UNIQUE (tenant_id, projection_id, build_id),
    FOREIGN KEY (tenant_id, through_commit)
        REFERENCES authority_commits (tenant_id, commit_sequence)
);

CREATE TABLE projection_watermarks (
    tenant_id TEXT NOT NULL,
    projection_id TEXT NOT NULL,
    through_commit BIGINT NOT NULL CHECK (through_commit > 0),
    manifest_digest CHAR(64) NOT NULL CHECK (manifest_digest ~ '^[0-9a-f]{64}$'),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, projection_id),
    FOREIGN KEY (tenant_id, through_commit)
        REFERENCES authority_commits (tenant_id, commit_sequence),
    FOREIGN KEY (tenant_id, projection_id, manifest_digest)
        REFERENCES projection_manifests (tenant_id, projection_id, manifest_digest)
);

CREATE FUNCTION reject_semantic_history_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'semantic history and projection manifests are immutable';
END;
$$;

CREATE TRIGGER semantic_claims_are_immutable
BEFORE UPDATE OR DELETE ON semantic_claims
FOR EACH ROW
EXECUTE FUNCTION reject_semantic_history_mutation();

CREATE TRIGGER projection_outbox_is_immutable
BEFORE UPDATE OR DELETE ON projection_outbox
FOR EACH ROW
EXECUTE FUNCTION reject_semantic_history_mutation();

CREATE TRIGGER projection_manifests_are_immutable
BEFORE UPDATE OR DELETE ON projection_manifests
FOR EACH ROW
EXECUTE FUNCTION reject_semantic_history_mutation();

ALTER TABLE semantic_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE semantic_claims FORCE ROW LEVEL SECURITY;
CREATE POLICY semantic_claims_tenant_policy ON semantic_claims
    USING (tenant_id = current_setting('zoen.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('zoen.tenant_id', true));

ALTER TABLE projection_manifests ENABLE ROW LEVEL SECURITY;
ALTER TABLE projection_manifests FORCE ROW LEVEL SECURITY;
CREATE POLICY projection_manifests_tenant_policy ON projection_manifests
    USING (tenant_id = current_setting('zoen.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('zoen.tenant_id', true));

ALTER TABLE projection_watermarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE projection_watermarks FORCE ROW LEVEL SECURITY;
CREATE POLICY projection_watermarks_tenant_policy ON projection_watermarks
    USING (tenant_id = current_setting('zoen.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('zoen.tenant_id', true));
