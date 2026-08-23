CREATE TABLE IF NOT EXISTS activation_observations (
    event_id TEXT NOT NULL,
    contract_id TEXT NOT NULL,
    declared_contract_id TEXT,
    status TEXT NOT NULL CHECK (status IN ('matched', 'not_matched', 'not_ready', 'abandoned')),
    observed_at_micros BIGINT NOT NULL,
    tenant_id TEXT NOT NULL,
    account_id TEXT,
    session_id TEXT NOT NULL,
    product_id TEXT,
    build_id TEXT NOT NULL,
    outcome_ref TEXT,
    reason_category TEXT,
    exported BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (tenant_id, event_id),
    CONSTRAINT activation_observations_no_message CHECK (
        outcome_ref IS NULL OR length(outcome_ref) < 512
    )
);

CREATE INDEX IF NOT EXISTS activation_observations_session_idx
    ON activation_observations (tenant_id, session_id, observed_at_micros);

CREATE INDEX IF NOT EXISTS activation_observations_pending_export_idx
    ON activation_observations (tenant_id, exported, observed_at_micros)
    WHERE exported = false;

ALTER TABLE activation_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE activation_observations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS activation_observations_tenant_policy ON activation_observations;
CREATE POLICY activation_observations_tenant_policy ON activation_observations
    USING (tenant_id = current_setting('zoen.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('zoen.tenant_id', true));

CREATE TABLE IF NOT EXISTS activation_friction (
    friction_id TEXT PRIMARY KEY,
    contract_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    elapsed_micros BIGINT NOT NULL,
    category TEXT NOT NULL,
    user_visible_message_code TEXT NOT NULL,
    recovery_path TEXT NOT NULL,
    manual_help_needed BOOLEAN NOT NULL,
    build_id TEXT NOT NULL,
    recorded_at_micros BIGINT NOT NULL,
    tenant_id TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS activation_friction_session_idx
    ON activation_friction (tenant_id, session_id, recorded_at_micros);

ALTER TABLE activation_friction ENABLE ROW LEVEL SECURITY;
ALTER TABLE activation_friction FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS activation_friction_tenant_policy ON activation_friction;
CREATE POLICY activation_friction_tenant_policy ON activation_friction
    USING (tenant_id = current_setting('zoen.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('zoen.tenant_id', true));

GRANT SELECT, INSERT, UPDATE ON activation_observations TO zoen_app;
GRANT SELECT, INSERT ON activation_friction TO zoen_app;
