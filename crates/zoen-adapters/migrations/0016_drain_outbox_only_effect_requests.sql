ALTER TABLE projection_outbox NO FORCE ROW LEVEL SECURITY;
ALTER TABLE action_operations NO FORCE ROW LEVEL SECURITY;
ALTER TABLE effect_requests NO FORCE ROW LEVEL SECURITY;

INSERT INTO effect_requests (
    tenant_id,
    effect_request_id,
    operation_id,
    commit_sequence,
    idempotency_key,
    intent_digest,
    request_digest,
    payload,
    knowledge_state,
    last_commit_sequence
)
SELECT
    outbox.tenant_id,
    outbox.effect_request_id,
    operation.operation_id,
    outbox.commit_sequence,
    'idempotency.' || outbox.tenant_id || '.' || outbox.effect_request_id,
    operation.intent_digest,
    md5(convert_to(outbox.payload::text, 'UTF8'))
        || md5(convert_to(outbox.payload::text || ':legacy-drain', 'UTF8')),
    convert_to(outbox.payload::text, 'UTF8'),
    'not_attempted',
    outbox.commit_sequence
FROM projection_outbox AS outbox
JOIN action_operations AS operation
  ON operation.tenant_id = outbox.tenant_id
 AND operation.commit_sequence = outbox.commit_sequence
LEFT JOIN effect_requests AS request
  ON request.tenant_id = outbox.tenant_id
 AND request.effect_request_id = outbox.effect_request_id
WHERE outbox.effect_request_id IS NOT NULL
  AND request.effect_request_id IS NULL
ORDER BY outbox.commit_sequence, outbox.ordinal
ON CONFLICT (tenant_id, effect_request_id) DO NOTHING;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM projection_outbox AS outbox
        JOIN action_operations AS operation
          ON operation.tenant_id = outbox.tenant_id
         AND operation.commit_sequence = outbox.commit_sequence
        LEFT JOIN effect_requests AS request
          ON request.tenant_id = outbox.tenant_id
         AND request.effect_request_id = outbox.effect_request_id
        WHERE outbox.effect_request_id IS NOT NULL
          AND request.effect_request_id IS NULL
    ) THEN
        RAISE EXCEPTION 'outbox-only effect rows remain after backfill';
    END IF;
END
$$;

ALTER TABLE projection_outbox FORCE ROW LEVEL SECURITY;
ALTER TABLE action_operations FORCE ROW LEVEL SECURITY;
ALTER TABLE effect_requests FORCE ROW LEVEL SECURITY;
