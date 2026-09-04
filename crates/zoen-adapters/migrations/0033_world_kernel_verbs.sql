-- W2-05: seven public verbs on one governed catalog (proposal → decide → commit → explain → execute).

CREATE TABLE world_kernel_proposals (
    proposal_id TEXT PRIMARY KEY,
    world_id TEXT NOT NULL,
    release_digest TEXT NOT NULL REFERENCES world_releases (digest),
    principal_id TEXT NOT NULL,
    input_jcs TEXT NOT NULL,
    preview_hash TEXT NOT NULL CHECK (preview_hash ~ '^[0-9a-f]{64}$'),
    proposed_at_micros BIGINT NOT NULL,
    UNIQUE (world_id, preview_hash)
);

CREATE INDEX world_kernel_proposals_by_world
    ON world_kernel_proposals (world_id, proposed_at_micros DESC);

CREATE TABLE world_kernel_decisions (
    proposal_id TEXT PRIMARY KEY
        REFERENCES world_kernel_proposals (proposal_id),
    principal_id TEXT NOT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('approve', 'reject')),
    decided_at_micros BIGINT NOT NULL
);

CREATE TABLE world_kernel_receipts (
    proposal_id TEXT PRIMARY KEY
        REFERENCES world_kernel_proposals (proposal_id),
    receipt_id TEXT NOT NULL UNIQUE,
    release_digest TEXT NOT NULL REFERENCES world_releases (digest),
    explanation_jcs TEXT NOT NULL,
    committed_at_micros BIGINT NOT NULL
);

CREATE TABLE world_kernel_executions (
    receipt_id TEXT PRIMARY KEY
        REFERENCES world_kernel_receipts (receipt_id),
    execution_id TEXT NOT NULL UNIQUE,
    release_digest TEXT NOT NULL REFERENCES world_releases (digest),
    executed_at_micros BIGINT NOT NULL
);

CREATE FUNCTION reject_world_kernel_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'world kernel verb history is immutable';
END;
$$;

CREATE TRIGGER world_kernel_proposals_are_immutable
BEFORE UPDATE OR DELETE ON world_kernel_proposals
FOR EACH ROW
EXECUTE FUNCTION reject_world_kernel_mutation();

CREATE TRIGGER world_kernel_decisions_are_immutable
BEFORE UPDATE OR DELETE ON world_kernel_decisions
FOR EACH ROW
EXECUTE FUNCTION reject_world_kernel_mutation();

CREATE TRIGGER world_kernel_receipts_are_immutable
BEFORE UPDATE OR DELETE ON world_kernel_receipts
FOR EACH ROW
EXECUTE FUNCTION reject_world_kernel_mutation();

CREATE TRIGGER world_kernel_executions_are_immutable
BEFORE UPDATE OR DELETE ON world_kernel_executions
FOR EACH ROW
EXECUTE FUNCTION reject_world_kernel_mutation();

CREATE TRIGGER world_kernel_proposals_cannot_be_truncated
BEFORE TRUNCATE ON world_kernel_proposals
FOR EACH STATEMENT
EXECUTE FUNCTION reject_world_kernel_mutation();

CREATE TRIGGER world_kernel_decisions_cannot_be_truncated
BEFORE TRUNCATE ON world_kernel_decisions
FOR EACH STATEMENT
EXECUTE FUNCTION reject_world_kernel_mutation();

CREATE TRIGGER world_kernel_receipts_cannot_be_truncated
BEFORE TRUNCATE ON world_kernel_receipts
FOR EACH STATEMENT
EXECUTE FUNCTION reject_world_kernel_mutation();

CREATE TRIGGER world_kernel_executions_cannot_be_truncated
BEFORE TRUNCATE ON world_kernel_executions
FOR EACH STATEMENT
EXECUTE FUNCTION reject_world_kernel_mutation();
