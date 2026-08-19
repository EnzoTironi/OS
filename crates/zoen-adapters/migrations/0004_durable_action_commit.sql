ALTER TABLE projection_outbox
ADD COLUMN effect_request_id TEXT;

CREATE UNIQUE INDEX projection_outbox_effect_request_id_unique
ON projection_outbox (tenant_id, effect_request_id)
WHERE effect_request_id IS NOT NULL;
