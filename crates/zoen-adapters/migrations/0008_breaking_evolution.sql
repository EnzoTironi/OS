ALTER TABLE authority_commits
DROP CONSTRAINT authority_commits_commit_kind_check;

ALTER TABLE authority_commits
ADD CONSTRAINT authority_commits_commit_kind_check
CHECK (
    commit_kind IN (
        'definition_publication',
        'evidence',
        'action',
        'effect_attempt',
        'effect_reconciliation',
        'definition_activation',
        'definition_migration_plan',
        'definition_migration_batch'
    )
);

ALTER TABLE semantic_claims
DROP CONSTRAINT semantic_claims_value_kind_check;

ALTER TABLE semantic_claims
ADD CONSTRAINT semantic_claims_value_kind_check
CHECK (value_kind IN ('bool', 'decimal', 'entity', 'integer', 'quantity', 'text'));

CREATE TABLE definition_migrations (
    tenant_id TEXT NOT NULL,
    operation_id TEXT NOT NULL,
    intent_digest CHAR(64) NOT NULL CHECK (intent_digest ~ '^[0-9a-f]{64}$'),
    canonical_plan TEXT NOT NULL,
    definition_id TEXT NOT NULL,
    from_revision BIGINT NOT NULL CHECK (from_revision > 0),
    from_digest CHAR(64) NOT NULL CHECK (from_digest ~ '^[0-9a-f]{64}$'),
    to_revision BIGINT NOT NULL CHECK (to_revision > 0),
    to_digest CHAR(64) NOT NULL CHECK (to_digest ~ '^[0-9a-f]{64}$'),
    classification TEXT NOT NULL CHECK (
        classification IN ('requires_migration', 'breaking')
    ),
    expected_batches INTEGER NOT NULL CHECK (expected_batches > 0),
    commit_sequence BIGINT NOT NULL CHECK (commit_sequence > 0),
    prepared_at_micros BIGINT NOT NULL,
    actor_id TEXT NOT NULL,
    principal_id TEXT NOT NULL,
    workload_id TEXT NOT NULL,
    policy_id TEXT NOT NULL,
    policy_revision BIGINT NOT NULL CHECK (policy_revision > 0),
    policy_digest CHAR(64) NOT NULL CHECK (policy_digest ~ '^[0-9a-f]{64}$'),
    determining_policies TEXT[] NOT NULL,
    PRIMARY KEY (tenant_id, operation_id),
    UNIQUE (tenant_id, commit_sequence),
    FOREIGN KEY (tenant_id, commit_sequence)
        REFERENCES authority_commits (tenant_id, commit_sequence),
    FOREIGN KEY (tenant_id, definition_id, from_digest, from_revision)
        REFERENCES definition_revisions (tenant_id, definition_id, digest, revision),
    FOREIGN KEY (tenant_id, definition_id, to_digest, to_revision)
        REFERENCES definition_revisions (tenant_id, definition_id, digest, revision)
);

CREATE TABLE definition_migration_batches (
    tenant_id TEXT NOT NULL,
    operation_id TEXT NOT NULL,
    batch_index INTEGER NOT NULL CHECK (batch_index >= 0),
    intent_digest CHAR(64) NOT NULL CHECK (intent_digest ~ '^[0-9a-f]{64}$'),
    commit_sequence BIGINT NOT NULL CHECK (commit_sequence > 0),
    record_count INTEGER NOT NULL CHECK (record_count >= 0),
    actor_id TEXT NOT NULL,
    principal_id TEXT NOT NULL,
    workload_id TEXT NOT NULL,
    policy_id TEXT NOT NULL,
    policy_revision BIGINT NOT NULL CHECK (policy_revision > 0),
    policy_digest CHAR(64) NOT NULL CHECK (policy_digest ~ '^[0-9a-f]{64}$'),
    determining_policies TEXT[] NOT NULL,
    PRIMARY KEY (tenant_id, operation_id, batch_index),
    UNIQUE (tenant_id, commit_sequence),
    FOREIGN KEY (tenant_id, operation_id)
        REFERENCES definition_migrations (tenant_id, operation_id),
    FOREIGN KEY (tenant_id, commit_sequence)
        REFERENCES authority_commits (tenant_id, commit_sequence)
);

CREATE TABLE definition_migration_records (
    tenant_id TEXT NOT NULL,
    operation_id TEXT NOT NULL,
    batch_index INTEGER NOT NULL CHECK (batch_index >= 0),
    target_claim_id TEXT NOT NULL,
    rule_id TEXT NOT NULL,
    rule_kind TEXT NOT NULL CHECK (
        rule_kind IN ('preserve_meaning', 'transform', 'supersede', 'recompute')
    ),
    PRIMARY KEY (tenant_id, operation_id, target_claim_id),
    FOREIGN KEY (tenant_id, operation_id, batch_index)
        REFERENCES definition_migration_batches (tenant_id, operation_id, batch_index),
    FOREIGN KEY (tenant_id, target_claim_id)
        REFERENCES semantic_claims (tenant_id, claim_id)
);

CREATE TABLE definition_migration_lineage (
    tenant_id TEXT NOT NULL,
    operation_id TEXT NOT NULL,
    target_claim_id TEXT NOT NULL,
    source_claim_id TEXT NOT NULL,
    PRIMARY KEY (tenant_id, operation_id, target_claim_id, source_claim_id),
    FOREIGN KEY (tenant_id, operation_id, target_claim_id)
        REFERENCES definition_migration_records (tenant_id, operation_id, target_claim_id),
    FOREIGN KEY (tenant_id, source_claim_id)
        REFERENCES semantic_claims (tenant_id, claim_id)
);

ALTER TABLE definition_activations
ADD COLUMN activation_kind TEXT NOT NULL DEFAULT 'activation'
CHECK (activation_kind IN ('activation', 'rollback')),
ADD COLUMN migration_operation_id TEXT,
ADD CONSTRAINT definition_activations_migration_fk
FOREIGN KEY (tenant_id, migration_operation_id)
REFERENCES definition_migrations (tenant_id, operation_id);

CREATE TRIGGER definition_migrations_are_immutable
BEFORE UPDATE OR DELETE ON definition_migrations
FOR EACH ROW
EXECUTE FUNCTION reject_definition_activation_mutation();

CREATE TRIGGER definition_migration_batches_are_immutable
BEFORE UPDATE OR DELETE ON definition_migration_batches
FOR EACH ROW
EXECUTE FUNCTION reject_definition_activation_mutation();

CREATE TRIGGER definition_migration_records_are_immutable
BEFORE UPDATE OR DELETE ON definition_migration_records
FOR EACH ROW
EXECUTE FUNCTION reject_definition_activation_mutation();

CREATE TRIGGER definition_migration_lineage_is_immutable
BEFORE UPDATE OR DELETE ON definition_migration_lineage
FOR EACH ROW
EXECUTE FUNCTION reject_definition_activation_mutation();

ALTER TABLE definition_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE definition_migrations FORCE ROW LEVEL SECURITY;
CREATE POLICY definition_migrations_tenant_policy ON definition_migrations
    USING (tenant_id = current_setting('zoen.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('zoen.tenant_id', true));

ALTER TABLE definition_migration_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE definition_migration_batches FORCE ROW LEVEL SECURITY;
CREATE POLICY definition_migration_batches_tenant_policy ON definition_migration_batches
    USING (tenant_id = current_setting('zoen.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('zoen.tenant_id', true));

ALTER TABLE definition_migration_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE definition_migration_records FORCE ROW LEVEL SECURITY;
CREATE POLICY definition_migration_records_tenant_policy ON definition_migration_records
    USING (tenant_id = current_setting('zoen.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('zoen.tenant_id', true));

ALTER TABLE definition_migration_lineage ENABLE ROW LEVEL SECURITY;
ALTER TABLE definition_migration_lineage FORCE ROW LEVEL SECURITY;
CREATE POLICY definition_migration_lineage_tenant_policy ON definition_migration_lineage
    USING (tenant_id = current_setting('zoen.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('zoen.tenant_id', true));
