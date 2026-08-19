ALTER TABLE action_proposal_dependencies
ADD COLUMN role TEXT NOT NULL DEFAULT 'supporting',
ADD COLUMN source_id TEXT,
ADD COLUMN source_ref TEXT;

UPDATE action_proposal_dependencies AS dependency
SET source_id = claim.source_id,
    source_ref = claim.source_ref
FROM semantic_claims AS claim
WHERE claim.tenant_id = dependency.tenant_id
  AND claim.claim_id = dependency.claim_id;

ALTER TABLE action_proposal_dependencies
ALTER COLUMN role DROP DEFAULT,
ALTER COLUMN source_id SET NOT NULL,
ALTER COLUMN source_ref SET NOT NULL,
ADD CONSTRAINT action_proposal_dependencies_role_check
    CHECK (role IN ('supporting', 'rival', 'computation_dependency')),
ADD CONSTRAINT action_proposal_dependencies_claim_fk
    FOREIGN KEY (tenant_id, claim_id)
    REFERENCES semantic_claims (tenant_id, claim_id);

ALTER TABLE action_operations
ADD COLUMN state_basis_digest CHAR(64)
    CHECK (state_basis_digest IS NULL OR state_basis_digest ~ '^[0-9a-f]{64}$'),
ADD COLUMN observed_commit_sequence BIGINT
    CHECK (observed_commit_sequence IS NULL OR observed_commit_sequence > 0);

CREATE TABLE action_operation_dependencies (
    tenant_id TEXT NOT NULL,
    operation_id TEXT NOT NULL,
    ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
    claim_id TEXT NOT NULL,
    commit_sequence BIGINT NOT NULL CHECK (commit_sequence > 0),
    entity_id TEXT NOT NULL,
    relation_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (
        role IN ('supporting', 'rival', 'computation_dependency')
    ),
    source_digest CHAR(64) NOT NULL CHECK (source_digest ~ '^[0-9a-f]{64}$'),
    source_id TEXT NOT NULL,
    source_ref TEXT NOT NULL,
    PRIMARY KEY (tenant_id, operation_id, ordinal),
    UNIQUE (tenant_id, operation_id, claim_id, role),
    FOREIGN KEY (tenant_id, operation_id)
        REFERENCES action_operations (tenant_id, operation_id),
    FOREIGN KEY (tenant_id, claim_id)
        REFERENCES semantic_claims (tenant_id, claim_id)
);

CREATE TRIGGER action_operation_dependencies_are_immutable
BEFORE UPDATE OR DELETE ON action_operation_dependencies
FOR EACH ROW
EXECUTE FUNCTION reject_action_history_mutation();

ALTER TABLE action_operation_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_operation_dependencies FORCE ROW LEVEL SECURITY;
CREATE POLICY action_operation_dependencies_tenant_policy
ON action_operation_dependencies
USING (tenant_id = current_setting('zoen.tenant_id', true))
WITH CHECK (tenant_id = current_setting('zoen.tenant_id', true));
