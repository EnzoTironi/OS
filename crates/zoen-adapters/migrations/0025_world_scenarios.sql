ALTER TABLE authority_commits
DROP CONSTRAINT authority_commits_commit_kind_check;

ALTER TABLE authority_commits
ADD CONSTRAINT authority_commits_commit_kind_check
CHECK (
    commit_kind IN (
        'definition_publication',
        'evidence',
        'action',
        'scenario',
        'effect_attempt',
        'effect_reconciliation',
        'definition_activation',
        'definition_migration_plan',
        'definition_migration_batch'
    )
);

ALTER TABLE action_operations
DROP CONSTRAINT action_operations_tenant_id_commit_sequence_key;

ALTER TABLE action_proposals
ADD COLUMN scenario_id TEXT NULL;

CREATE TABLE world_scenarios (
    tenant_id TEXT NOT NULL,
    scenario_id TEXT NOT NULL,
    base_commit_sequence BIGINT NOT NULL CHECK (base_commit_sequence > 0),
    status TEXT NOT NULL CHECK (status IN ('open', 'applied', 'discarded')),
    created_principal_id TEXT NOT NULL,
    applied_commit_sequence BIGINT,
    PRIMARY KEY (tenant_id, scenario_id)
);

CREATE UNIQUE INDEX world_scenarios_open_name
ON world_scenarios (tenant_id, scenario_id)
WHERE status = 'open';

CREATE TABLE world_scenario_proposals (
    tenant_id TEXT NOT NULL,
    scenario_id TEXT NOT NULL,
    ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
    proposal_id TEXT NOT NULL,
    PRIMARY KEY (tenant_id, scenario_id, ordinal),
    UNIQUE (tenant_id, proposal_id),
    FOREIGN KEY (tenant_id, scenario_id)
        REFERENCES world_scenarios (tenant_id, scenario_id),
    FOREIGN KEY (tenant_id, proposal_id)
        REFERENCES action_proposals (tenant_id, proposal_id)
);

CREATE TABLE overlay_claims (
    tenant_id TEXT NOT NULL,
    scenario_id TEXT NOT NULL,
    claim_id TEXT NOT NULL,
    definition_id TEXT NOT NULL,
    definition_digest CHAR(64) NOT NULL CHECK (definition_digest ~ '^[0-9a-f]{64}$'),
    definition_revision BIGINT NOT NULL CHECK (definition_revision > 0),
    entity_id TEXT NOT NULL,
    relation_id TEXT NOT NULL,
    value_kind TEXT NOT NULL
        CHECK (value_kind IN ('bool', 'decimal', 'integer', 'quantity', 'text')),
    value_text TEXT NOT NULL,
    value_unit TEXT,
    valid_time_kind TEXT NOT NULL CHECK (valid_time_kind IN ('instant', 'interval')),
    valid_from_micros BIGINT NOT NULL,
    valid_to_micros BIGINT,
    source_id TEXT NOT NULL,
    source_digest CHAR(64) NOT NULL CHECK (source_digest ~ '^[0-9a-f]{64}$'),
    source_ref TEXT NOT NULL CHECK (source_ref <> ''),
    overlay_seq BIGINT NOT NULL CHECK (overlay_seq > 0),
    proposal_id TEXT NOT NULL,
    observed_at_micros BIGINT,
    ingested_at_micros BIGINT,
    PRIMARY KEY (tenant_id, scenario_id, claim_id),
    FOREIGN KEY (tenant_id, scenario_id)
        REFERENCES world_scenarios (tenant_id, scenario_id),
    FOREIGN KEY (tenant_id, proposal_id)
        REFERENCES action_proposals (tenant_id, proposal_id),
    CHECK (
        (value_kind = 'quantity' AND value_unit IS NOT NULL)
        OR (value_kind <> 'quantity' AND value_unit IS NULL)
    ),
    CHECK (
        (valid_time_kind = 'instant' AND valid_to_micros IS NULL)
        OR (
            valid_time_kind = 'interval'
            AND valid_to_micros IS NOT NULL
            AND valid_from_micros < valid_to_micros
        )
    )
);

CREATE INDEX overlay_claims_query_index
ON overlay_claims (
    tenant_id,
    scenario_id,
    definition_id,
    definition_digest,
    relation_id,
    valid_from_micros
);

ALTER TABLE world_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE world_scenarios FORCE ROW LEVEL SECURITY;
CREATE POLICY world_scenarios_tenant_policy ON world_scenarios
    USING (tenant_id = current_setting('zoen.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('zoen.tenant_id', true));

ALTER TABLE world_scenario_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE world_scenario_proposals FORCE ROW LEVEL SECURITY;
CREATE POLICY world_scenario_proposals_tenant_policy ON world_scenario_proposals
    USING (tenant_id = current_setting('zoen.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('zoen.tenant_id', true));

ALTER TABLE overlay_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE overlay_claims FORCE ROW LEVEL SECURITY;
CREATE POLICY overlay_claims_tenant_policy ON overlay_claims
    USING (tenant_id = current_setting('zoen.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('zoen.tenant_id', true));
