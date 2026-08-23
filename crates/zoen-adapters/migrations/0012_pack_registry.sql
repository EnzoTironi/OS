-- Content-addressed pack registry. PackDigest is identity; catalog is a projection.

CREATE TABLE pack_registry_objects (
    pack_digest CHAR(64) PRIMARY KEY CHECK (pack_digest ~ '^[0-9a-f]{64}$'),
    format_version TEXT NOT NULL CHECK (format_version = 'zoen.pack.v1'),
    pack_id TEXT NOT NULL,
    pack_version TEXT NOT NULL CHECK (pack_version <> 'latest' AND char_length(pack_version) > 0),
    publisher_id TEXT NOT NULL,
    manifest_jcs TEXT NOT NULL,
    signature_json JSONB NOT NULL,
    lock_jcs TEXT NOT NULL,
    stored_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    stored_by TEXT NOT NULL
);

CREATE UNIQUE INDEX pack_registry_objects_pack_version
    ON pack_registry_objects (pack_id, pack_version);

CREATE TABLE pack_registry_object_ontology (
    pack_digest CHAR(64) NOT NULL CHECK (pack_digest ~ '^[0-9a-f]{64}$'),
    definition_id TEXT NOT NULL,
    definition_digest CHAR(64) NOT NULL CHECK (definition_digest ~ '^[0-9a-f]{64}$'),
    canonical_json TEXT NOT NULL,
    PRIMARY KEY (pack_digest, definition_id),
    FOREIGN KEY (pack_digest) REFERENCES pack_registry_objects (pack_digest)
);

CREATE TABLE pack_publisher_keys (
    public_key_id TEXT PRIMARY KEY,
    publisher_id TEXT NOT NULL,
    algorithm TEXT NOT NULL CHECK (algorithm = 'ed25519'),
    public_key_pem TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'rotated', 'revoked')),
    valid_from TIMESTAMPTZ NOT NULL,
    valid_to TIMESTAMPTZ,
    CHECK (
        (status = 'active' AND valid_to IS NULL)
        OR (status IN ('rotated', 'revoked'))
    )
);

CREATE INDEX pack_publisher_keys_publisher
    ON pack_publisher_keys (publisher_id, status);

CREATE TABLE pack_catalog_entries (
    pack_digest CHAR(64) PRIMARY KEY CHECK (pack_digest ~ '^[0-9a-f]{64}$'),
    pack_id TEXT NOT NULL,
    pack_version TEXT NOT NULL CHECK (pack_version <> 'latest'),
    publisher_id TEXT NOT NULL,
    outcome_label TEXT NOT NULL DEFAULT '',
    categories JSONB NOT NULL DEFAULT '[]'::jsonb,
    visibility_kind TEXT NOT NULL CHECK (visibility_kind IN ('public', 'private', 'local')),
    tenant_allowlist JSONB NOT NULL DEFAULT '[]'::jsonb,
    deprecated BOOLEAN NOT NULL DEFAULT FALSE,
    blocked_for_new_install BOOLEAN NOT NULL DEFAULT FALSE,
    advisory_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    install_count BIGINT NOT NULL DEFAULT 0,
    first_success_count BIGINT NOT NULL DEFAULT 0,
    indexed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    FOREIGN KEY (pack_digest) REFERENCES pack_registry_objects (pack_digest)
);

CREATE INDEX pack_catalog_entries_public_search
    ON pack_catalog_entries (visibility_kind, outcome_label)
    WHERE visibility_kind = 'public' AND NOT blocked_for_new_install;

CREATE TABLE pack_share_refs (
    token TEXT PRIMARY KEY,
    pack_digest CHAR(64) NOT NULL CHECK (pack_digest ~ '^[0-9a-f]{64}$'),
    publisher_id TEXT NOT NULL,
    referral_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    expires_at TIMESTAMPTZ,
    FOREIGN KEY (pack_digest) REFERENCES pack_registry_objects (pack_digest)
);

CREATE TABLE pack_attribution_events (
    event_id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN (
        'share_visit',
        'install_intent',
        'installed',
        'first_success'
    )),
    pack_digest CHAR(64) NOT NULL CHECK (pack_digest ~ '^[0-9a-f]{64}$'),
    publisher_id TEXT NOT NULL,
    referral_id TEXT NOT NULL,
    share_token_hash TEXT NOT NULL,
    tenant_id_hash TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    idempotency_key TEXT NOT NULL,
    FOREIGN KEY (pack_digest) REFERENCES pack_registry_objects (pack_digest)
);

CREATE UNIQUE INDEX pack_attribution_events_idempotency
    ON pack_attribution_events (idempotency_key);

CREATE TABLE pack_registry_config (
    config_id TEXT PRIMARY KEY DEFAULT 'default' CHECK (config_id = 'default'),
    public_registry_enabled BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO pack_registry_config (config_id, public_registry_enabled)
VALUES ('default', TRUE);

CREATE FUNCTION reject_pack_registry_object_mutation()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'pack registry objects are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pack_registry_objects_are_immutable
BEFORE UPDATE OR DELETE ON pack_registry_objects
FOR EACH ROW EXECUTE FUNCTION reject_pack_registry_object_mutation();

CREATE TRIGGER pack_registry_object_ontology_are_immutable
BEFORE UPDATE OR DELETE ON pack_registry_object_ontology
FOR EACH ROW EXECUTE FUNCTION reject_pack_registry_object_mutation();
