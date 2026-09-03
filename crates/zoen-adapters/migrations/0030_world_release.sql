-- WorldRelease content is content-addressed. Publication metadata and the
-- active pointer stay outside the digest. SQL keeps historical spelling of
-- no tenant_id column: isolation is WorldId bound into the digest.

CREATE TABLE world_releases (
    digest TEXT PRIMARY KEY CHECK (digest ~ '^[0-9a-f]{64}$'),
    world_id TEXT NOT NULL,
    parent_digest TEXT CHECK (parent_digest IS NULL OR parent_digest ~ '^[0-9a-f]{64}$'),
    ontology_digest TEXT NOT NULL CHECK (ontology_digest ~ '^[0-9a-f]{64}$'),
    policy_digest TEXT NOT NULL CHECK (policy_digest ~ '^[0-9a-f]{64}$'),
    executors_digest TEXT NOT NULL CHECK (executors_digest ~ '^[0-9a-f]{64}$'),
    components_digest TEXT NOT NULL CHECK (components_digest ~ '^[0-9a-f]{64}$'),
    canonical_jcs TEXT NOT NULL,
    stored_at_micros BIGINT NOT NULL
);

CREATE TABLE world_release_publications (
    digest TEXT PRIMARY KEY REFERENCES world_releases (digest),
    published_at_micros BIGINT NOT NULL,
    published_by TEXT NOT NULL,
    policy_id TEXT NOT NULL,
    policy_revision BIGINT NOT NULL CHECK (policy_revision > 0),
    policy_digest TEXT NOT NULL CHECK (policy_digest ~ '^[0-9a-f]{64}$'),
    determining_policies TEXT[] NOT NULL CHECK (cardinality(determining_policies) > 0)
);

CREATE TABLE world_active_releases (
    world_id TEXT PRIMARY KEY,
    digest TEXT NOT NULL REFERENCES world_releases (digest),
    activated_at_micros BIGINT NOT NULL
);

CREATE FUNCTION reject_world_release_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'world release history is immutable';
END;
$$;

CREATE TRIGGER world_releases_are_immutable
BEFORE UPDATE OR DELETE ON world_releases
FOR EACH ROW
EXECUTE FUNCTION reject_world_release_mutation();

CREATE TRIGGER world_release_publications_are_immutable
BEFORE UPDATE OR DELETE ON world_release_publications
FOR EACH ROW
EXECUTE FUNCTION reject_world_release_mutation();

CREATE TRIGGER world_releases_cannot_be_truncated
BEFORE TRUNCATE ON world_releases
FOR EACH STATEMENT
EXECUTE FUNCTION reject_world_release_mutation();

CREATE TRIGGER world_release_publications_cannot_be_truncated
BEFORE TRUNCATE ON world_release_publications
FOR EACH STATEMENT
EXECUTE FUNCTION reject_world_release_mutation();
