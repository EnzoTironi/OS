-- Activation preview and owner Decide. Outside ReleaseDigest.
-- Activate requires an approving decision bound to preview+world+release.

CREATE TABLE world_release_previews (
    preview_digest TEXT PRIMARY KEY CHECK (preview_digest ~ '^[0-9a-f]{64}$'),
    world_id TEXT NOT NULL,
    release_digest TEXT NOT NULL REFERENCES world_releases (digest),
    current_active_digest TEXT CHECK (
        current_active_digest IS NULL OR current_active_digest ~ '^[0-9a-f]{64}$'
    ),
    candidate_ontology_digest TEXT NOT NULL CHECK (candidate_ontology_digest ~ '^[0-9a-f]{64}$'),
    candidate_policy_digest TEXT NOT NULL CHECK (candidate_policy_digest ~ '^[0-9a-f]{64}$'),
    candidate_executors_digest TEXT NOT NULL CHECK (candidate_executors_digest ~ '^[0-9a-f]{64}$'),
    candidate_components_digest TEXT NOT NULL CHECK (candidate_components_digest ~ '^[0-9a-f]{64}$'),
    current_ontology_digest TEXT CHECK (
        current_ontology_digest IS NULL OR current_ontology_digest ~ '^[0-9a-f]{64}$'
    ),
    current_policy_digest TEXT CHECK (
        current_policy_digest IS NULL OR current_policy_digest ~ '^[0-9a-f]{64}$'
    ),
    current_executors_digest TEXT CHECK (
        current_executors_digest IS NULL OR current_executors_digest ~ '^[0-9a-f]{64}$'
    ),
    current_components_digest TEXT CHECK (
        current_components_digest IS NULL OR current_components_digest ~ '^[0-9a-f]{64}$'
    ),
    canonical_jcs TEXT NOT NULL,
    created_at_micros BIGINT NOT NULL,
    CONSTRAINT world_release_previews_current_shape CHECK (
        (
            current_active_digest IS NULL
            AND current_ontology_digest IS NULL
            AND current_policy_digest IS NULL
            AND current_executors_digest IS NULL
            AND current_components_digest IS NULL
        )
        OR (
            current_active_digest IS NOT NULL
            AND current_ontology_digest IS NOT NULL
            AND current_policy_digest IS NOT NULL
            AND current_executors_digest IS NOT NULL
            AND current_components_digest IS NOT NULL
        )
    )
);

CREATE INDEX world_release_previews_by_release
    ON world_release_previews (world_id, release_digest);

CREATE TABLE world_release_decisions (
    preview_digest TEXT PRIMARY KEY
        REFERENCES world_release_previews (preview_digest),
    release_digest TEXT NOT NULL REFERENCES world_releases (digest),
    world_id TEXT NOT NULL,
    decided_at_micros BIGINT NOT NULL,
    decided_by TEXT NOT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('approve', 'reject'))
);

CREATE FUNCTION reject_world_release_preview_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'world release preview history is immutable';
END;
$$;

CREATE TRIGGER world_release_previews_are_immutable
BEFORE UPDATE OR DELETE ON world_release_previews
FOR EACH ROW
EXECUTE FUNCTION reject_world_release_preview_mutation();

CREATE TRIGGER world_release_decisions_are_immutable
BEFORE UPDATE OR DELETE ON world_release_decisions
FOR EACH ROW
EXECUTE FUNCTION reject_world_release_preview_mutation();

CREATE TRIGGER world_release_previews_cannot_be_truncated
BEFORE TRUNCATE ON world_release_previews
FOR EACH STATEMENT
EXECUTE FUNCTION reject_world_release_preview_mutation();

CREATE TRIGGER world_release_decisions_cannot_be_truncated
BEFORE TRUNCATE ON world_release_decisions
FOR EACH STATEMENT
EXECUTE FUNCTION reject_world_release_preview_mutation();
