ALTER TABLE effect_requests NO FORCE ROW LEVEL SECURITY;

ALTER TABLE effect_requests
ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0
    CHECK (retry_count BETWEEN 0 AND 5),
ADD COLUMN next_eligible_at TIMESTAMPTZ;

UPDATE effect_requests
SET next_eligible_at = clock_timestamp()
WHERE knowledge_state = 'definitely_not_sent';

ALTER TABLE effect_requests
ADD CONSTRAINT effect_requests_retry_schedule_check
CHECK (
    (
        knowledge_state = 'definitely_not_sent'
        AND (
            (retry_count < 5 AND next_eligible_at IS NOT NULL)
            OR (retry_count = 5 AND next_eligible_at IS NULL)
        )
    )
    OR (
        knowledge_state = 'not_attempted'
        AND retry_count = 0
        AND next_eligible_at IS NULL
    )
    OR (
        knowledge_state NOT IN ('not_attempted', 'definitely_not_sent')
        AND next_eligible_at IS NULL
    )
);

CREATE INDEX effect_requests_retry_eligibility_idx
ON effect_requests (
    tenant_id,
    next_eligible_at,
    commit_sequence,
    effect_request_id
)
WHERE knowledge_state = 'definitely_not_sent'
  AND next_eligible_at IS NOT NULL;

ALTER TABLE effect_requests FORCE ROW LEVEL SECURITY;
