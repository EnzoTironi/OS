CREATE TABLE authority_heads (
    tenant_id TEXT PRIMARY KEY,
    commit_sequence BIGINT NOT NULL DEFAULT 0 CHECK (commit_sequence >= 0)
);

CREATE TABLE definition_revisions (
    tenant_id TEXT NOT NULL,
    definition_id TEXT NOT NULL,
    revision BIGINT NOT NULL CHECK (revision > 0),
    digest CHAR(64) NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
    canonical_json TEXT NOT NULL,
    commit_sequence BIGINT NOT NULL CHECK (commit_sequence > 0),
    published_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, definition_id, digest),
    UNIQUE (tenant_id, definition_id, revision),
    UNIQUE (tenant_id, commit_sequence),
    FOREIGN KEY (tenant_id) REFERENCES authority_heads (tenant_id)
);

CREATE TABLE active_definition_revisions (
    tenant_id TEXT NOT NULL,
    definition_id TEXT NOT NULL,
    digest CHAR(64) NOT NULL,
    activation_commit_sequence BIGINT NOT NULL CHECK (activation_commit_sequence > 0),
    PRIMARY KEY (tenant_id, definition_id),
    FOREIGN KEY (tenant_id, definition_id, digest)
        REFERENCES definition_revisions (tenant_id, definition_id, digest)
);

CREATE TABLE projection_outbox (
    tenant_id TEXT NOT NULL,
    commit_sequence BIGINT NOT NULL,
    ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
    event_type TEXT NOT NULL,
    definition_id TEXT NOT NULL,
    digest CHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, commit_sequence, ordinal),
    FOREIGN KEY (tenant_id, commit_sequence)
        REFERENCES definition_revisions (tenant_id, commit_sequence),
    FOREIGN KEY (tenant_id, definition_id, digest)
        REFERENCES definition_revisions (tenant_id, definition_id, digest)
);

CREATE FUNCTION reject_definition_revision_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'published definition revisions are immutable';
END;
$$;

CREATE TRIGGER definition_revisions_are_immutable
BEFORE UPDATE OR DELETE ON definition_revisions
FOR EACH ROW
EXECUTE FUNCTION reject_definition_revision_mutation();

ALTER TABLE authority_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE authority_heads FORCE ROW LEVEL SECURITY;
CREATE POLICY authority_heads_tenant_policy ON authority_heads
    USING (tenant_id = current_setting('zoen.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('zoen.tenant_id', true));

ALTER TABLE definition_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE definition_revisions FORCE ROW LEVEL SECURITY;
CREATE POLICY definition_revisions_tenant_policy ON definition_revisions
    USING (tenant_id = current_setting('zoen.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('zoen.tenant_id', true));

ALTER TABLE active_definition_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_definition_revisions FORCE ROW LEVEL SECURITY;
CREATE POLICY active_definition_revisions_tenant_policy ON active_definition_revisions
    USING (tenant_id = current_setting('zoen.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('zoen.tenant_id', true));

ALTER TABLE projection_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE projection_outbox FORCE ROW LEVEL SECURITY;
CREATE POLICY projection_outbox_tenant_policy ON projection_outbox
    USING (tenant_id = current_setting('zoen.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('zoen.tenant_id', true));
