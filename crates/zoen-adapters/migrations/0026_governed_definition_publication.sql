-- The migration role is subject to forced RLS. Toggle it inside one DO
-- transaction so the emptiness check covers every tenant and any failure
-- restores the prior RLS state.
DO $$
DECLARE
    has_existing_revisions BOOLEAN;
BEGIN
    EXECUTE 'ALTER TABLE definition_revisions DISABLE ROW LEVEL SECURITY';
    SELECT EXISTS (SELECT 1 FROM definition_revisions)
    INTO has_existing_revisions;
    EXECUTE 'ALTER TABLE definition_revisions ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE definition_revisions FORCE ROW LEVEL SECURITY';

    IF has_existing_revisions THEN
        RAISE EXCEPTION 'migration 0026 requires an empty definition_revisions baseline; reset this pre-launch database before retrying';
    END IF;
END;
$$;

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
    grant_count INTEGER NOT NULL CHECK (grant_count > 0),
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

CREATE TRIGGER definition_publications_cannot_be_truncated
BEFORE TRUNCATE ON definition_publications
FOR EACH STATEMENT
EXECUTE FUNCTION reject_definition_publication_mutation();

CREATE TRIGGER definition_publication_grants_cannot_be_truncated
BEFORE TRUNCATE ON definition_publication_grants
FOR EACH STATEMENT
EXECUTE FUNCTION reject_definition_publication_mutation();

CREATE FUNCTION require_exact_definition_publication_grants()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    expected_grant_count INTEGER;
    actual_grant_count BIGINT;
    in_range_grant_count BIGINT;
BEGIN
    SELECT grant_count
    INTO expected_grant_count
    FROM definition_publications
    WHERE tenant_id = NEW.tenant_id
      AND commit_sequence = NEW.commit_sequence;

    IF expected_grant_count IS NULL THEN
        RAISE EXCEPTION 'definition publication grant set requires publication';
    END IF;

    SELECT
        count(*),
        count(*) FILTER (
            WHERE ordinal >= 0 AND ordinal < expected_grant_count
        )
    INTO actual_grant_count, in_range_grant_count
    FROM definition_publication_grants
    WHERE tenant_id = NEW.tenant_id
      AND commit_sequence = NEW.commit_sequence;

    IF actual_grant_count <> expected_grant_count
       OR in_range_grant_count <> expected_grant_count THEN
        RAISE EXCEPTION 'definition publication grant set must exactly match admitted evidence';
    END IF;
    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER definition_publication_requires_exact_grants
AFTER INSERT ON definition_publications
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION require_exact_definition_publication_grants();

CREATE CONSTRAINT TRIGGER definition_publication_grant_set_is_exact
AFTER INSERT ON definition_publication_grants
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION require_exact_definition_publication_grants();

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
