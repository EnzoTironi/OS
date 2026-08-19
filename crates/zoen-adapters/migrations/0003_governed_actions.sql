ALTER TABLE authority_commits
DROP CONSTRAINT authority_commits_commit_kind_check;

ALTER TABLE authority_commits
ADD CONSTRAINT authority_commits_commit_kind_check
CHECK (commit_kind IN ('definition_publication', 'evidence', 'action'));

CREATE TABLE action_proposals (
    tenant_id TEXT NOT NULL,
    proposal_id TEXT NOT NULL,
    operation_id TEXT NOT NULL,
    intent_digest CHAR(64) NOT NULL CHECK (intent_digest ~ '^[0-9a-f]{64}$'),
    action_id TEXT NOT NULL,
    definition_id TEXT NOT NULL,
    definition_digest CHAR(64) NOT NULL CHECK (definition_digest ~ '^[0-9a-f]{64}$'),
    definition_revision BIGINT NOT NULL CHECK (definition_revision > 0),
    resource_id TEXT NOT NULL,
    proposed_at_micros BIGINT NOT NULL,
    expires_at_micros BIGINT NOT NULL,
    valid_at_micros BIGINT NOT NULL,
    proposed_actor_id TEXT NOT NULL,
    proposed_principal_id TEXT NOT NULL,
    proposed_workload_id TEXT NOT NULL,
    authority_kind TEXT NOT NULL CHECK (authority_kind IN ('ready', 'awaiting_approval')),
    policy_id TEXT NOT NULL,
    policy_digest CHAR(64) NOT NULL CHECK (policy_digest ~ '^[0-9a-f]{64}$'),
    policy_revision BIGINT NOT NULL CHECK (policy_revision > 0),
    determining_policies TEXT[] NOT NULL,
    state_basis_digest CHAR(64) NOT NULL CHECK (state_basis_digest ~ '^[0-9a-f]{64}$'),
    observed_commit_sequence BIGINT NOT NULL CHECK (observed_commit_sequence > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, proposal_id),
    UNIQUE (tenant_id, operation_id)
);

CREATE TABLE action_proposal_inputs (
    tenant_id TEXT NOT NULL,
    proposal_id TEXT NOT NULL,
    ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
    input_id TEXT NOT NULL,
    value_kind TEXT NOT NULL CHECK (value_kind IN ('bool', 'decimal', 'integer', 'quantity', 'text')),
    value_text TEXT NOT NULL,
    value_unit TEXT,
    PRIMARY KEY (tenant_id, proposal_id, ordinal),
    UNIQUE (tenant_id, proposal_id, input_id),
    FOREIGN KEY (tenant_id, proposal_id)
        REFERENCES action_proposals (tenant_id, proposal_id)
);

CREATE TABLE action_proposal_dependencies (
    tenant_id TEXT NOT NULL,
    proposal_id TEXT NOT NULL,
    ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
    claim_id TEXT NOT NULL,
    commit_sequence BIGINT NOT NULL CHECK (commit_sequence > 0),
    entity_id TEXT NOT NULL,
    relation_id TEXT NOT NULL,
    source_digest CHAR(64) NOT NULL CHECK (source_digest ~ '^[0-9a-f]{64}$'),
    PRIMARY KEY (tenant_id, proposal_id, ordinal),
    UNIQUE (tenant_id, proposal_id, claim_id),
    FOREIGN KEY (tenant_id, proposal_id)
        REFERENCES action_proposals (tenant_id, proposal_id)
);

CREATE TABLE action_proposal_grants (
    tenant_id TEXT NOT NULL,
    proposal_id TEXT NOT NULL,
    ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
    delegation_id TEXT NOT NULL,
    action_ids TEXT[] NOT NULL CHECK (cardinality(action_ids) > 0),
    resource_ids TEXT[] NOT NULL CHECK (cardinality(resource_ids) > 0),
    workload_ids TEXT[] NOT NULL CHECK (cardinality(workload_ids) > 0),
    not_before_micros BIGINT NOT NULL,
    expires_at_micros BIGINT NOT NULL,
    PRIMARY KEY (tenant_id, proposal_id, ordinal),
    FOREIGN KEY (tenant_id, proposal_id)
        REFERENCES action_proposals (tenant_id, proposal_id)
);

CREATE TABLE action_approvals (
    tenant_id TEXT NOT NULL,
    proposal_id TEXT NOT NULL,
    approval_id TEXT NOT NULL,
    approved_at_micros BIGINT NOT NULL,
    expires_at_micros BIGINT NOT NULL,
    approved_actor_id TEXT NOT NULL,
    approved_principal_id TEXT NOT NULL,
    approved_workload_id TEXT NOT NULL,
    policy_id TEXT NOT NULL,
    policy_digest CHAR(64) NOT NULL CHECK (policy_digest ~ '^[0-9a-f]{64}$'),
    policy_revision BIGINT NOT NULL CHECK (policy_revision > 0),
    determining_policies TEXT[] NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, proposal_id),
    UNIQUE (tenant_id, approval_id),
    FOREIGN KEY (tenant_id, proposal_id)
        REFERENCES action_proposals (tenant_id, proposal_id)
);

CREATE TABLE action_approval_grants (
    tenant_id TEXT NOT NULL,
    proposal_id TEXT NOT NULL,
    ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
    delegation_id TEXT NOT NULL,
    action_ids TEXT[] NOT NULL CHECK (cardinality(action_ids) > 0),
    resource_ids TEXT[] NOT NULL CHECK (cardinality(resource_ids) > 0),
    workload_ids TEXT[] NOT NULL CHECK (cardinality(workload_ids) > 0),
    not_before_micros BIGINT NOT NULL,
    expires_at_micros BIGINT NOT NULL,
    PRIMARY KEY (tenant_id, proposal_id, ordinal),
    FOREIGN KEY (tenant_id, proposal_id)
        REFERENCES action_approvals (tenant_id, proposal_id)
);

CREATE TABLE action_operations (
    tenant_id TEXT NOT NULL,
    operation_id TEXT NOT NULL,
    proposal_id TEXT NOT NULL,
    intent_digest CHAR(64) NOT NULL CHECK (intent_digest ~ '^[0-9a-f]{64}$'),
    commit_sequence BIGINT NOT NULL CHECK (commit_sequence > 0),
    committed_actor_id TEXT NOT NULL,
    committed_principal_id TEXT NOT NULL,
    committed_workload_id TEXT NOT NULL,
    policy_id TEXT NOT NULL,
    policy_digest CHAR(64) NOT NULL CHECK (policy_digest ~ '^[0-9a-f]{64}$'),
    policy_revision BIGINT NOT NULL CHECK (policy_revision > 0),
    determining_policies TEXT[] NOT NULL,
    committed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, operation_id),
    UNIQUE (tenant_id, proposal_id),
    UNIQUE (tenant_id, commit_sequence),
    FOREIGN KEY (tenant_id, proposal_id)
        REFERENCES action_proposals (tenant_id, proposal_id),
    FOREIGN KEY (tenant_id, commit_sequence)
        REFERENCES authority_commits (tenant_id, commit_sequence)
);

CREATE TABLE action_operation_records (
    tenant_id TEXT NOT NULL,
    operation_id TEXT NOT NULL,
    ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
    claim_id TEXT NOT NULL,
    PRIMARY KEY (tenant_id, operation_id, ordinal),
    UNIQUE (tenant_id, operation_id, claim_id),
    FOREIGN KEY (tenant_id, operation_id)
        REFERENCES action_operations (tenant_id, operation_id)
);

CREATE TABLE action_operation_grants (
    tenant_id TEXT NOT NULL,
    operation_id TEXT NOT NULL,
    ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
    delegation_id TEXT NOT NULL,
    action_ids TEXT[] NOT NULL CHECK (cardinality(action_ids) > 0),
    resource_ids TEXT[] NOT NULL CHECK (cardinality(resource_ids) > 0),
    workload_ids TEXT[] NOT NULL CHECK (cardinality(workload_ids) > 0),
    not_before_micros BIGINT NOT NULL,
    expires_at_micros BIGINT NOT NULL,
    PRIMARY KEY (tenant_id, operation_id, ordinal),
    FOREIGN KEY (tenant_id, operation_id)
        REFERENCES action_operations (tenant_id, operation_id)
);

CREATE FUNCTION reject_action_history_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Action proposals, approvals, and operations are immutable';
END;
$$;

CREATE TRIGGER action_proposals_are_immutable
BEFORE UPDATE OR DELETE ON action_proposals
FOR EACH ROW
EXECUTE FUNCTION reject_action_history_mutation();

CREATE TRIGGER action_approvals_are_immutable
BEFORE UPDATE OR DELETE ON action_approvals
FOR EACH ROW
EXECUTE FUNCTION reject_action_history_mutation();

CREATE TRIGGER action_operations_are_immutable
BEFORE UPDATE OR DELETE ON action_operations
FOR EACH ROW
EXECUTE FUNCTION reject_action_history_mutation();

CREATE TRIGGER action_proposal_inputs_are_immutable
BEFORE UPDATE OR DELETE ON action_proposal_inputs
FOR EACH ROW
EXECUTE FUNCTION reject_action_history_mutation();

CREATE TRIGGER action_proposal_dependencies_are_immutable
BEFORE UPDATE OR DELETE ON action_proposal_dependencies
FOR EACH ROW
EXECUTE FUNCTION reject_action_history_mutation();

CREATE TRIGGER action_proposal_grants_are_immutable
BEFORE UPDATE OR DELETE ON action_proposal_grants
FOR EACH ROW
EXECUTE FUNCTION reject_action_history_mutation();

CREATE TRIGGER action_approval_grants_are_immutable
BEFORE UPDATE OR DELETE ON action_approval_grants
FOR EACH ROW
EXECUTE FUNCTION reject_action_history_mutation();

CREATE TRIGGER action_operation_records_are_immutable
BEFORE UPDATE OR DELETE ON action_operation_records
FOR EACH ROW
EXECUTE FUNCTION reject_action_history_mutation();

CREATE TRIGGER action_operation_grants_are_immutable
BEFORE UPDATE OR DELETE ON action_operation_grants
FOR EACH ROW
EXECUTE FUNCTION reject_action_history_mutation();

DO $$
DECLARE
    table_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'action_proposals',
        'action_proposal_inputs',
        'action_proposal_dependencies',
        'action_proposal_grants',
        'action_approvals',
        'action_approval_grants',
        'action_operations',
        'action_operation_records',
        'action_operation_grants'
    ]
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
        EXECUTE format(
            'CREATE POLICY %I ON %I USING (tenant_id = current_setting(''zoen.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''zoen.tenant_id'', true))',
            table_name || '_tenant_policy',
            table_name
        );
    END LOOP;
END;
$$;
