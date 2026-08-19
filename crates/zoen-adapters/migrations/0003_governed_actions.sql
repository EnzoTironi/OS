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
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, proposal_id),
    UNIQUE (tenant_id, operation_id)
);

CREATE TABLE action_approvals (
    tenant_id TEXT NOT NULL,
    proposal_id TEXT NOT NULL,
    approval_id TEXT NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, proposal_id),
    UNIQUE (tenant_id, approval_id),
    FOREIGN KEY (tenant_id, proposal_id)
        REFERENCES action_proposals (tenant_id, proposal_id)
);

CREATE TABLE action_operations (
    tenant_id TEXT NOT NULL,
    operation_id TEXT NOT NULL,
    proposal_id TEXT NOT NULL,
    intent_digest CHAR(64) NOT NULL CHECK (intent_digest ~ '^[0-9a-f]{64}$'),
    commit_sequence BIGINT NOT NULL CHECK (commit_sequence > 0),
    receipt JSONB NOT NULL,
    committed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, operation_id),
    UNIQUE (tenant_id, proposal_id),
    UNIQUE (tenant_id, commit_sequence),
    FOREIGN KEY (tenant_id, proposal_id)
        REFERENCES action_proposals (tenant_id, proposal_id),
    FOREIGN KEY (tenant_id, commit_sequence)
        REFERENCES authority_commits (tenant_id, commit_sequence)
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

ALTER TABLE action_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_proposals FORCE ROW LEVEL SECURITY;
CREATE POLICY action_proposals_tenant_policy ON action_proposals
    USING (tenant_id = current_setting('zoen.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('zoen.tenant_id', true));

ALTER TABLE action_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_approvals FORCE ROW LEVEL SECURITY;
CREATE POLICY action_approvals_tenant_policy ON action_approvals
    USING (tenant_id = current_setting('zoen.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('zoen.tenant_id', true));

ALTER TABLE action_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_operations FORCE ROW LEVEL SECURITY;
CREATE POLICY action_operations_tenant_policy ON action_operations
    USING (tenant_id = current_setting('zoen.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('zoen.tenant_id', true));
