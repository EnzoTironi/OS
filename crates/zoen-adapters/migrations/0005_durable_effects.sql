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
        'effect_reconciliation'
    )
);

CREATE TABLE effect_requests (
    tenant_id TEXT NOT NULL,
    effect_request_id TEXT NOT NULL,
    operation_id TEXT NOT NULL,
    commit_sequence BIGINT NOT NULL CHECK (commit_sequence > 0),
    external_operation_id TEXT NOT NULL,
    intent_digest CHAR(64) NOT NULL CHECK (intent_digest ~ '^[0-9a-f]{64}$'),
    request_digest CHAR(64) NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
    payload BYTEA NOT NULL,
    knowledge_state TEXT NOT NULL CHECK (
        knowledge_state IN (
            'not_attempted',
            'definitely_not_sent',
            'unknown',
            'accepted_pending',
            'confirmed',
            'confirmed_no_effect',
            'contradicted'
        )
    ),
    last_commit_sequence BIGINT NOT NULL CHECK (last_commit_sequence > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, effect_request_id),
    UNIQUE (tenant_id, external_operation_id),
    UNIQUE (
        tenant_id,
        effect_request_id,
        external_operation_id
    ),
    UNIQUE (
        tenant_id,
        effect_request_id,
        external_operation_id,
        request_digest
    ),
    FOREIGN KEY (tenant_id, operation_id)
        REFERENCES action_operations (tenant_id, operation_id),
    FOREIGN KEY (tenant_id, commit_sequence)
        REFERENCES authority_commits (tenant_id, commit_sequence),
    FOREIGN KEY (tenant_id, last_commit_sequence)
        REFERENCES authority_commits (tenant_id, commit_sequence)
);

CREATE TABLE effect_attempts (
    tenant_id TEXT NOT NULL,
    effect_request_id TEXT NOT NULL,
    attempt_id TEXT NOT NULL,
    commit_sequence BIGINT NOT NULL CHECK (commit_sequence > 0),
    external_operation_id TEXT NOT NULL,
    observed_at_micros BIGINT NOT NULL,
    request_digest CHAR(64) NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
    result_kind TEXT NOT NULL CHECK (
        result_kind IN (
            'definitely_not_sent',
            'unknown',
            'accepted_pending',
            'confirmed',
            'confirmed_no_effect'
        )
    ),
    reason_kind TEXT CHECK (
        reason_kind IN (
            'credential_revoked',
            'timeout_before_send',
            'provider_unavailable',
            'response_parse_error',
            'response_schema_error',
            'timeout_after_possible_delivery'
        )
    ),
    response_digest CHAR(64) CHECK (
        response_digest IS NULL OR response_digest ~ '^[0-9a-f]{64}$'
    ),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, effect_request_id, attempt_id),
    FOREIGN KEY (
        tenant_id,
        effect_request_id,
        external_operation_id,
        request_digest
    )
        REFERENCES effect_requests (
            tenant_id,
            effect_request_id,
            external_operation_id,
            request_digest
        ),
    FOREIGN KEY (tenant_id, commit_sequence)
        REFERENCES authority_commits (tenant_id, commit_sequence),
    CHECK (
        (
            result_kind = 'definitely_not_sent'
            AND reason_kind IN ('credential_revoked', 'timeout_before_send')
            AND response_digest IS NULL
        )
        OR (
            result_kind = 'unknown'
            AND reason_kind IN (
                'provider_unavailable',
                'response_parse_error',
                'response_schema_error',
                'timeout_after_possible_delivery'
            )
        )
        OR (
            result_kind IN ('accepted_pending', 'confirmed', 'confirmed_no_effect')
            AND reason_kind IS NULL
            AND response_digest IS NOT NULL
        )
    )
);

CREATE TABLE effect_evidence (
    tenant_id TEXT NOT NULL,
    effect_request_id TEXT NOT NULL,
    evidence_id TEXT NOT NULL,
    commit_sequence BIGINT NOT NULL CHECK (commit_sequence > 0),
    evidence_digest CHAR(64) NOT NULL CHECK (evidence_digest ~ '^[0-9a-f]{64}$'),
    external_operation_id TEXT NOT NULL,
    observed_at_micros BIGINT NOT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('confirmed', 'no_effect')),
    source_id TEXT NOT NULL,
    source_ref TEXT NOT NULL CHECK (source_ref <> ''),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, effect_request_id, evidence_id),
    UNIQUE (tenant_id, effect_request_id, evidence_digest),
    FOREIGN KEY (
        tenant_id,
        effect_request_id,
        external_operation_id
    )
        REFERENCES effect_requests (
            tenant_id,
            effect_request_id,
            external_operation_id
        ),
    FOREIGN KEY (tenant_id, commit_sequence)
        REFERENCES authority_commits (tenant_id, commit_sequence)
);

CREATE TABLE effect_reconciliations (
    tenant_id TEXT NOT NULL,
    effect_request_id TEXT NOT NULL,
    evidence_id TEXT NOT NULL,
    commit_sequence BIGINT NOT NULL CHECK (commit_sequence > 0),
    previous_state TEXT NOT NULL,
    resulting_state TEXT NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, effect_request_id, evidence_id),
    FOREIGN KEY (tenant_id, effect_request_id, evidence_id)
        REFERENCES effect_evidence (tenant_id, effect_request_id, evidence_id),
    FOREIGN KEY (tenant_id, commit_sequence)
        REFERENCES authority_commits (tenant_id, commit_sequence)
);

CREATE TABLE effect_dispatch_attempts (
    tenant_id TEXT NOT NULL,
    effect_request_id TEXT NOT NULL,
    attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
    outcome TEXT NOT NULL CHECK (
        outcome IN ('accepted', 'restate_unavailable', 'rejected', 'invalid_response')
    ),
    restate_invocation_id TEXT,
    error_message TEXT,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, effect_request_id, attempt_number),
    FOREIGN KEY (tenant_id, effect_request_id)
        REFERENCES effect_requests (tenant_id, effect_request_id),
    CHECK (
        (
            outcome = 'accepted'
            AND restate_invocation_id IS NOT NULL
            AND error_message IS NULL
        )
        OR (
            outcome <> 'accepted'
            AND restate_invocation_id IS NULL
            AND error_message IS NOT NULL
        )
    )
);

CREATE TABLE effect_dispatches (
    tenant_id TEXT NOT NULL,
    effect_request_id TEXT NOT NULL,
    restate_invocation_id TEXT NOT NULL,
    dispatched_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, effect_request_id),
    FOREIGN KEY (tenant_id, effect_request_id)
        REFERENCES effect_requests (tenant_id, effect_request_id)
);

CREATE FUNCTION reject_effect_history_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'effect attempts, evidence, reconciliation, and dispatch history are immutable';
END;
$$;

CREATE TRIGGER effect_attempts_are_immutable
BEFORE UPDATE OR DELETE ON effect_attempts
FOR EACH ROW
EXECUTE FUNCTION reject_effect_history_mutation();

CREATE TRIGGER effect_evidence_is_immutable
BEFORE UPDATE OR DELETE ON effect_evidence
FOR EACH ROW
EXECUTE FUNCTION reject_effect_history_mutation();

CREATE TRIGGER effect_reconciliations_are_immutable
BEFORE UPDATE OR DELETE ON effect_reconciliations
FOR EACH ROW
EXECUTE FUNCTION reject_effect_history_mutation();

CREATE TRIGGER effect_dispatch_attempts_are_immutable
BEFORE UPDATE OR DELETE ON effect_dispatch_attempts
FOR EACH ROW
EXECUTE FUNCTION reject_effect_history_mutation();

CREATE TRIGGER effect_dispatches_are_immutable
BEFORE UPDATE OR DELETE ON effect_dispatches
FOR EACH ROW
EXECUTE FUNCTION reject_effect_history_mutation();

DO $$
DECLARE
    table_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'effect_requests',
        'effect_attempts',
        'effect_evidence',
        'effect_reconciliations',
        'effect_dispatch_attempts',
        'effect_dispatches'
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
