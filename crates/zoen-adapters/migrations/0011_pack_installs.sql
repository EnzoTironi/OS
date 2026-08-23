-- Immutable pack artifacts, install receipts, and capability grant requests.
-- Install never writes Cedar permits or activates definitions.

CREATE TABLE pack_artifacts (
    tenant_id TEXT NOT NULL,
    pack_digest CHAR(64) NOT NULL CHECK (pack_digest ~ '^[0-9a-f]{64}$'),
    pack_id TEXT NOT NULL,
    pack_version TEXT NOT NULL CHECK (pack_version <> 'latest' AND char_length(pack_version) > 0),
    format_version TEXT NOT NULL CHECK (format_version = 'zoen.pack.v1'),
    publisher_id TEXT NOT NULL,
    manifest_jcs TEXT NOT NULL,
    signature_json JSONB,
    lock_jcs TEXT NOT NULL,
    staged_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    staged_by TEXT NOT NULL,
    PRIMARY KEY (tenant_id, pack_digest)
);

CREATE TABLE pack_ontology_artifacts (
    tenant_id TEXT NOT NULL,
    pack_digest CHAR(64) NOT NULL CHECK (pack_digest ~ '^[0-9a-f]{64}$'),
    definition_id TEXT NOT NULL,
    definition_digest CHAR(64) NOT NULL CHECK (definition_digest ~ '^[0-9a-f]{64}$'),
    canonical_json TEXT NOT NULL,
    PRIMARY KEY (tenant_id, pack_digest, definition_id),
    FOREIGN KEY (tenant_id, pack_digest)
        REFERENCES pack_artifacts (tenant_id, pack_digest)
);

CREATE TABLE pack_install_receipts (
    tenant_id TEXT NOT NULL,
    install_id TEXT NOT NULL,
    pack_digest CHAR(64) NOT NULL CHECK (pack_digest ~ '^[0-9a-f]{64}$'),
    pack_id TEXT NOT NULL,
    pack_version TEXT NOT NULL CHECK (pack_version <> 'latest'),
    preview_digest CHAR(64) NOT NULL CHECK (preview_digest ~ '^[0-9a-f]{64}$'),
    phase TEXT NOT NULL CHECK (phase IN (
        'installed',
        'grants_resolved',
        'activating',
        'active',
        'failed',
        'superseded'
    )),
    attribution_json JSONB,
    evolution_ack_digest CHAR(64) CHECK (
        evolution_ack_digest IS NULL OR evolution_ack_digest ~ '^[0-9a-f]{64}$'
    ),
    activated_definition_refs JSONB,
    prior_install_id TEXT,
    failure_reason TEXT,
    superseded_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, install_id),
    FOREIGN KEY (tenant_id, pack_digest)
        REFERENCES pack_artifacts (tenant_id, pack_digest)
);

CREATE UNIQUE INDEX pack_install_one_active
    ON pack_install_receipts (tenant_id, pack_id)
    WHERE phase = 'active';

CREATE TABLE pack_capability_grants (
    tenant_id TEXT NOT NULL,
    install_id TEXT NOT NULL,
    grant_id TEXT NOT NULL,
    requirement_id TEXT NOT NULL,
    necessity TEXT NOT NULL CHECK (necessity IN ('required', 'optional')),
    sensitivity TEXT NOT NULL CHECK (sensitivity IN ('sensitive', 'non_sensitive')),
    capability_kind TEXT NOT NULL,
    scope_json JSONB NOT NULL,
    degrade_json JSONB,
    status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined')),
    decided_at TIMESTAMPTZ,
    decided_by TEXT,
    PRIMARY KEY (tenant_id, install_id, grant_id),
    FOREIGN KEY (tenant_id, install_id)
        REFERENCES pack_install_receipts (tenant_id, install_id),
    CHECK (
        (status = 'pending' AND decided_at IS NULL AND decided_by IS NULL)
        OR (status IN ('accepted', 'declined') AND decided_at IS NOT NULL AND decided_by IS NOT NULL)
    ),
    CHECK (
        (necessity = 'required' AND degrade_json IS NULL)
        OR (necessity = 'optional' AND degrade_json IS NOT NULL)
    )
);

CREATE TABLE pack_first_success_events (
    tenant_id TEXT NOT NULL,
    install_id TEXT NOT NULL,
    pack_digest CHAR(64) NOT NULL CHECK (pack_digest ~ '^[0-9a-f]{64}$'),
    contract_id TEXT NOT NULL,
    outcome_ref TEXT NOT NULL,
    fired_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, install_id, contract_id),
    FOREIGN KEY (tenant_id, install_id)
        REFERENCES pack_install_receipts (tenant_id, install_id)
);

CREATE FUNCTION reject_pack_artifact_mutation()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'pack artifacts are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pack_artifacts_are_immutable
BEFORE UPDATE OR DELETE ON pack_artifacts
FOR EACH ROW EXECUTE FUNCTION reject_pack_artifact_mutation();

CREATE TRIGGER pack_ontology_artifacts_are_immutable
BEFORE UPDATE OR DELETE ON pack_ontology_artifacts
FOR EACH ROW EXECUTE FUNCTION reject_pack_artifact_mutation();

ALTER TABLE pack_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pack_artifacts FORCE ROW LEVEL SECURITY;
CREATE POLICY pack_artifacts_tenant_policy ON pack_artifacts
    USING (tenant_id = current_setting('zoen.tenant_id', true));

ALTER TABLE pack_ontology_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pack_ontology_artifacts FORCE ROW LEVEL SECURITY;
CREATE POLICY pack_ontology_artifacts_tenant_policy ON pack_ontology_artifacts
    USING (tenant_id = current_setting('zoen.tenant_id', true));

ALTER TABLE pack_install_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pack_install_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY pack_install_receipts_tenant_policy ON pack_install_receipts
    USING (tenant_id = current_setting('zoen.tenant_id', true));

ALTER TABLE pack_capability_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE pack_capability_grants FORCE ROW LEVEL SECURITY;
CREATE POLICY pack_capability_grants_tenant_policy ON pack_capability_grants
    USING (tenant_id = current_setting('zoen.tenant_id', true));

ALTER TABLE pack_first_success_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE pack_first_success_events FORCE ROW LEVEL SECURITY;
CREATE POLICY pack_first_success_events_tenant_policy ON pack_first_success_events
    USING (tenant_id = current_setting('zoen.tenant_id', true));
