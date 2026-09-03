ALTER TABLE effect_requests NO FORCE ROW LEVEL SECURITY;

ALTER TABLE effect_requests
ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0
    CHECK (retry_count BETWEEN 0 AND 5),
ADD COLUMN next_eligible_at TIMESTAMPTZ;

DO $$
DECLARE
    sent_state TEXT := 'definitely_not_sent';
BEGIN
    EXECUTE format(
        'UPDATE effect_requests SET next_eligible_at = clock_timestamp() WHERE knowledge_state = %L',
        sent_state
    );
    EXECUTE format(
        'ALTER TABLE effect_requests ADD CONSTRAINT effect_requests_retry_schedule_check CHECK ((knowledge_state = %L AND ((retry_count < 5 AND next_eligible_at IS NOT NULL) OR (retry_count = 5 AND next_eligible_at IS NULL))) OR (knowledge_state = ''not_attempted'' AND retry_count = 0 AND next_eligible_at IS NULL) OR (knowledge_state NOT IN (''not_attempted'', %L) AND next_eligible_at IS NULL))',
        sent_state,
        sent_state
    );
    EXECUTE format(
        'CREATE INDEX effect_requests_retry_eligibility_idx ON effect_requests (tenant_id, next_eligible_at, commit_sequence, effect_request_id) WHERE knowledge_state = %L AND next_eligible_at IS NOT NULL',
        sent_state
    );
END
$$;

ALTER TABLE effect_requests FORCE ROW LEVEL SECURITY;
