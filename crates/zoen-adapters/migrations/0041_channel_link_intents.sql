-- Channel possession starts a one-time LinkIntent. A real Better Auth session
-- confirms it. Only token digests are durable; the fragment token stays in the
-- browser and never reaches a GET request.

CREATE TABLE channel_link_intents (
    intent_id TEXT PRIMARY KEY,
    token_hash BYTEA NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
    binding_id TEXT NOT NULL REFERENCES channel_bindings (binding_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    invalidated_at TIMESTAMPTZ,
    CONSTRAINT channel_link_intents_lifecycle_check CHECK (
        expires_at > created_at
        AND NOT (consumed_at IS NOT NULL AND invalidated_at IS NOT NULL)
    )
);

CREATE UNIQUE INDEX channel_link_intents_one_pending_per_binding
    ON channel_link_intents (binding_id)
    WHERE consumed_at IS NULL AND invalidated_at IS NULL;

CREATE TABLE channel_link_receipts (
    receipt_id TEXT PRIMARY KEY,
    intent_id TEXT NOT NULL UNIQUE REFERENCES channel_link_intents (intent_id),
    binding_id TEXT NOT NULL REFERENCES channel_bindings (binding_id),
    source_account_id TEXT NOT NULL REFERENCES zoen_accounts (account_id),
    target_account_id TEXT NOT NULL REFERENCES zoen_accounts (account_id),
    door_session_id TEXT NOT NULL CHECK (
        char_length(door_session_id) > 0 AND char_length(door_session_id) <= 200
    ),
    confirmed_at TIMESTAMPTZ NOT NULL
);

CREATE FUNCTION protect_channel_link_intent() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' OR TG_OP = 'TRUNCATE' THEN
        RAISE EXCEPTION 'channel LinkIntent rows are immutable';
    END IF;
    IF OLD.intent_id IS DISTINCT FROM NEW.intent_id
       OR OLD.token_hash IS DISTINCT FROM NEW.token_hash
       OR OLD.binding_id IS DISTINCT FROM NEW.binding_id
       OR OLD.created_at IS DISTINCT FROM NEW.created_at
       OR OLD.expires_at IS DISTINCT FROM NEW.expires_at THEN
        RAISE EXCEPTION 'channel LinkIntent identity is immutable';
    END IF;
    IF OLD.consumed_at IS NOT NULL OR OLD.invalidated_at IS NOT NULL THEN
        RAISE EXCEPTION 'completed channel LinkIntent rows are immutable';
    END IF;
    IF (NEW.consumed_at IS NULL) = (NEW.invalidated_at IS NULL) THEN
        RAISE EXCEPTION 'channel LinkIntent must make one terminal transition';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER channel_link_intents_immutable
BEFORE UPDATE OR DELETE ON channel_link_intents
FOR EACH ROW EXECUTE FUNCTION protect_channel_link_intent();

CREATE TRIGGER channel_link_intents_cannot_be_truncated
BEFORE TRUNCATE ON channel_link_intents
FOR EACH STATEMENT EXECUTE FUNCTION protect_channel_link_intent();

CREATE FUNCTION reject_channel_link_receipt_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'channel LinkIntent receipts are immutable';
END;
$$;

CREATE TRIGGER channel_link_receipts_immutable
BEFORE UPDATE OR DELETE ON channel_link_receipts
FOR EACH ROW EXECUTE FUNCTION reject_channel_link_receipt_mutation();

CREATE TRIGGER channel_link_receipts_cannot_be_truncated
BEFORE TRUNCATE ON channel_link_receipts
FOR EACH STATEMENT EXECUTE FUNCTION reject_channel_link_receipt_mutation();

DROP TABLE onboard_tokens;
