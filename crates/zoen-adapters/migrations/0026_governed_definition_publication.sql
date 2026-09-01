CREATE TABLE definition_publications (
    tenant_id TEXT NOT NULL,
    definition_id TEXT NOT NULL,
    revision BIGINT NOT NULL CHECK (revision > 0),
    digest CHAR(64) NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
    commit_sequence BIGINT NOT NULL CHECK (commit_sequence > 0),
    published_at_micros BIGINT NOT NULL,
    actor_id TEXT NOT NULL,
    principal_id TEXT NOT NULL,
    workload_id TEXT NOT NULL,
    policy_id TEXT NOT NULL,
    policy_revision BIGINT NOT NULL CHECK (policy_revision > 0),
    policy_digest CHAR(64) NOT NULL CHECK (policy_digest ~ '^[0-9a-f]{64}$'),
    determining_policies TEXT[] NOT NULL,
    PRIMARY KEY (tenant_id, definition_id, digest, revision),
    UNIQUE (tenant_id, commit_sequence),
    FOREIGN KEY (tenant_id, commit_sequence)
        REFERENCES authority_commits (tenant_id, commit_sequence),
    FOREIGN KEY (tenant_id, definition_id, digest, revision)
        REFERENCES definition_revisions (tenant_id, definition_id, digest, revision)
);

CREATE TABLE definition_publication_grants (
    tenant_id TEXT NOT NULL,
    commit_sequence BIGINT NOT NULL CHECK (commit_sequence > 0),
    ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
    delegation_id TEXT NOT NULL,
    action_ids TEXT[] NOT NULL CHECK (cardinality(action_ids) > 0),
    resource_ids TEXT[] NOT NULL CHECK (cardinality(resource_ids) > 0),
    workload_ids TEXT[] NOT NULL CHECK (cardinality(workload_ids) > 0),
    not_before_micros BIGINT NOT NULL,
    expires_at_micros BIGINT NOT NULL,
    PRIMARY KEY (tenant_id, commit_sequence, ordinal),
    FOREIGN KEY (tenant_id, commit_sequence)
        REFERENCES definition_publications (tenant_id, commit_sequence)
);

CREATE FUNCTION reject_definition_publication_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'definition publication history is immutable';
END;
$$;

CREATE TRIGGER definition_publications_are_immutable
BEFORE UPDATE OR DELETE ON definition_publications
FOR EACH ROW
EXECUTE FUNCTION reject_definition_publication_mutation();

CREATE TRIGGER definition_publication_grants_are_immutable
BEFORE UPDATE OR DELETE ON definition_publication_grants
FOR EACH ROW
EXECUTE FUNCTION reject_definition_publication_mutation();

CREATE FUNCTION require_governed_definition_publication()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM definition_publications
        WHERE tenant_id = NEW.tenant_id
          AND definition_id = NEW.definition_id
          AND digest = NEW.digest
          AND revision = NEW.revision
          AND commit_sequence = NEW.commit_sequence
    ) THEN
        RAISE EXCEPTION 'definition revision requires governed publication';
    END IF;
    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER definition_revision_requires_publication
AFTER INSERT ON definition_revisions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION require_governed_definition_publication();

DO $$
DECLARE
    table_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'definition_publications',
        'definition_publication_grants'
    ]
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
        EXECUTE format(
            'CREATE POLICY %I ON %I USING (tenant_id = current_setting(''zoen.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''zoen.tenant_id'', true))',
            table_name || '_tenant_policy',
            table_name
        );
    END LOOP;
END;
$$;
