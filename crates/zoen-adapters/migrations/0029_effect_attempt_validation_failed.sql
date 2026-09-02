-- EFFECT_ATTEMPT_REASON_VALIDATION_FAILED: a definitely_not_sent attempt may
-- carry the validation cause in provider_operation_id and the observed bytes
-- in response_digest (digest pinning rejects a deploy whose files drifted
-- after the commit approved them). Widen both effect_attempts constraints;
-- the new shapes are a superset of the old ones, so existing rows stay valid.
ALTER TABLE effect_attempts
DROP CONSTRAINT effect_attempts_reason_kind_check;

ALTER TABLE effect_attempts
ADD CONSTRAINT effect_attempts_reason_kind_check
CHECK (
    reason_kind IN (
        'credential_revoked',
        'timeout_before_send',
        'validation_failed',
        'provider_unavailable',
        'response_parse_error',
        'response_schema_error',
        'timeout_after_possible_delivery'
    )
);

ALTER TABLE effect_attempts
DROP CONSTRAINT effect_attempts_check;

ALTER TABLE effect_attempts
ADD CONSTRAINT effect_attempts_check
CHECK (
    (
        result_kind = 'definitely_not_sent'
        AND reason_kind IN ('credential_revoked', 'timeout_before_send')
        AND provider_operation_id IS NULL
        AND response_digest IS NULL
    )
    OR (
        result_kind = 'definitely_not_sent'
        AND reason_kind = 'validation_failed'
        AND provider_operation_id IS NOT NULL
        AND response_digest IS NOT NULL
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
        AND provider_operation_id IS NOT NULL
        AND response_digest IS NOT NULL
    )
);
