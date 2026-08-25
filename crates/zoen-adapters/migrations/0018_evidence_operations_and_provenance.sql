ALTER TABLE semantic_claims
ADD COLUMN observed_at_micros BIGINT,
ADD COLUMN ingested_at_micros BIGINT;

UPDATE semantic_claims
SET ingested_at_micros = (EXTRACT(EPOCH FROM recorded_at) * 1000000)::bigint
WHERE ingested_at_micros IS NULL;

ALTER TABLE semantic_claims
ALTER COLUMN ingested_at_micros SET NOT NULL;

CREATE TABLE evidence_operations (
    tenant_id TEXT NOT NULL,
    operation_id TEXT NOT NULL,
    intent_digest CHAR(64) NOT NULL CHECK (intent_digest ~ '^[0-9a-f]{64}$'),
    commit_sequence BIGINT NOT NULL CHECK (commit_sequence > 0),
    recorded_count INTEGER NOT NULL CHECK (recorded_count > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, operation_id),
    FOREIGN KEY (tenant_id, commit_sequence)
        REFERENCES authority_commits (tenant_id, commit_sequence)
);

CREATE TABLE evidence_operation_records (
    tenant_id TEXT NOT NULL,
    operation_id TEXT NOT NULL,
    ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
    claim_id TEXT NOT NULL,
    PRIMARY KEY (tenant_id, operation_id, ordinal),
    UNIQUE (tenant_id, operation_id, claim_id),
    FOREIGN KEY (tenant_id, operation_id)
        REFERENCES evidence_operations (tenant_id, operation_id),
    FOREIGN KEY (tenant_id, claim_id)
        REFERENCES semantic_claims (tenant_id, claim_id)
);

CREATE FUNCTION reject_evidence_operation_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'evidence operations are immutable';
END;
$$;

CREATE TRIGGER evidence_operations_are_immutable
BEFORE UPDATE OR DELETE ON evidence_operations
FOR EACH ROW
EXECUTE FUNCTION reject_evidence_operation_mutation();

CREATE TRIGGER evidence_operation_records_are_immutable
BEFORE UPDATE OR DELETE ON evidence_operation_records
FOR EACH ROW
EXECUTE FUNCTION reject_evidence_operation_mutation();

DO $$
DECLARE
    table_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'evidence_operations',
        'evidence_operation_records'
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
