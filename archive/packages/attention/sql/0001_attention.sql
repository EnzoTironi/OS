CREATE TABLE IF NOT EXISTS attention_items (
    tenant_id TEXT NOT NULL,
    attention_item_id TEXT NOT NULL,
    condition_identity_digest TEXT NOT NULL,
    definition_id TEXT NOT NULL,
    definition_version TEXT NOT NULL,
    subject_kind TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    semantic_cut_digest TEXT NOT NULL,
    material_fingerprint TEXT NOT NULL,
    lifecycle_kind TEXT NOT NULL,
    lifecycle_json JSONB NOT NULL,
    recipient_principal_id TEXT NOT NULL,
    recipient_scope TEXT NOT NULL,
    class_id TEXT NOT NULL,
    proposal_ref TEXT,
    proposal_state_basis_digest TEXT,
    sealed_disclosure_json JSONB NOT NULL,
    delivery_generation INT NOT NULL DEFAULT 0,
    last_preference_decision_json JSONB NOT NULL,
    last_delivery_observation_id TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (tenant_id, attention_item_id),
    UNIQUE (tenant_id, condition_identity_digest)
);

CREATE INDEX IF NOT EXISTS attention_items_recipient_idx
    ON attention_items (tenant_id, recipient_principal_id, updated_at);

ALTER TABLE attention_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE attention_items FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS attention_items_tenant_policy ON attention_items;
CREATE POLICY attention_items_tenant_policy ON attention_items
    USING (tenant_id = current_setting('zoen.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('zoen.tenant_id', true));

CREATE TABLE IF NOT EXISTS attention_delivery_evidence (
    tenant_id TEXT NOT NULL,
    attention_item_id TEXT NOT NULL,
    delivery_generation INT NOT NULL,
    delivery_intent_id TEXT NOT NULL,
    delivery_observation_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    outcome_kind TEXT NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (tenant_id, attention_item_id, delivery_generation)
);

ALTER TABLE attention_delivery_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE attention_delivery_evidence FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS attention_delivery_evidence_tenant_policy ON attention_delivery_evidence;
CREATE POLICY attention_delivery_evidence_tenant_policy ON attention_delivery_evidence
    USING (tenant_id = current_setting('zoen.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('zoen.tenant_id', true));

GRANT SELECT, INSERT, UPDATE ON attention_items TO zoen_app;
GRANT SELECT, INSERT, UPDATE ON attention_delivery_evidence TO zoen_app;
