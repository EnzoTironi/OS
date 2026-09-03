-- Four content-addressed catalog blobs. Digest is SHA-256 of `content`.
-- WorldRelease rows bind these digests; publication metadata stays outside.

CREATE TABLE world_ontology_catalogs (
    digest TEXT PRIMARY KEY CHECK (digest ~ '^[0-9a-f]{64}$'),
    content BYTEA NOT NULL,
    stored_at_micros BIGINT NOT NULL
);

CREATE TABLE world_policy_catalogs (
    digest TEXT PRIMARY KEY CHECK (digest ~ '^[0-9a-f]{64}$'),
    content BYTEA NOT NULL,
    stored_at_micros BIGINT NOT NULL
);

CREATE TABLE world_executor_catalogs (
    digest TEXT PRIMARY KEY CHECK (digest ~ '^[0-9a-f]{64}$'),
    content BYTEA NOT NULL,
    stored_at_micros BIGINT NOT NULL
);

CREATE TABLE world_component_catalogs (
    digest TEXT PRIMARY KEY CHECK (digest ~ '^[0-9a-f]{64}$'),
    content BYTEA NOT NULL,
    stored_at_micros BIGINT NOT NULL
);

CREATE FUNCTION reject_world_release_catalog_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'world release catalogs are immutable';
END;
$$;

CREATE TRIGGER world_ontology_catalogs_are_immutable
BEFORE UPDATE OR DELETE ON world_ontology_catalogs
FOR EACH ROW
EXECUTE FUNCTION reject_world_release_catalog_mutation();

CREATE TRIGGER world_policy_catalogs_are_immutable
BEFORE UPDATE OR DELETE ON world_policy_catalogs
FOR EACH ROW
EXECUTE FUNCTION reject_world_release_catalog_mutation();

CREATE TRIGGER world_executor_catalogs_are_immutable
BEFORE UPDATE OR DELETE ON world_executor_catalogs
FOR EACH ROW
EXECUTE FUNCTION reject_world_release_catalog_mutation();

CREATE TRIGGER world_component_catalogs_are_immutable
BEFORE UPDATE OR DELETE ON world_component_catalogs
FOR EACH ROW
EXECUTE FUNCTION reject_world_release_catalog_mutation();

CREATE TRIGGER world_ontology_catalogs_cannot_be_truncated
BEFORE TRUNCATE ON world_ontology_catalogs
FOR EACH STATEMENT
EXECUTE FUNCTION reject_world_release_catalog_mutation();

CREATE TRIGGER world_policy_catalogs_cannot_be_truncated
BEFORE TRUNCATE ON world_policy_catalogs
FOR EACH STATEMENT
EXECUTE FUNCTION reject_world_release_catalog_mutation();

CREATE TRIGGER world_executor_catalogs_cannot_be_truncated
BEFORE TRUNCATE ON world_executor_catalogs
FOR EACH STATEMENT
EXECUTE FUNCTION reject_world_release_catalog_mutation();

CREATE TRIGGER world_component_catalogs_cannot_be_truncated
BEFORE TRUNCATE ON world_component_catalogs
FOR EACH STATEMENT
EXECUTE FUNCTION reject_world_release_catalog_mutation();
