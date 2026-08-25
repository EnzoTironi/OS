-- Rebuildable operational SoR for conversational turns, delivery claims,
-- WhatsApp reply idempotency, and ingress replay. Not semantic authority.

CREATE TABLE interaction_records (
    id TEXT PRIMARY KEY,
    accepted_at TIMESTAMPTZ NOT NULL,
    payload JSONB NOT NULL
);

CREATE TABLE conversation_pending (
    conversation_key TEXT NOT NULL,
    interaction_id TEXT NOT NULL,
    accepted_at TIMESTAMPTZ NOT NULL,
    claimed_by_attempt_id TEXT,
    PRIMARY KEY (conversation_key, interaction_id)
);

CREATE TABLE conversation_turns (
    id TEXT PRIMARY KEY,
    conversation_key TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    interaction_ids JSONB NOT NULL,
    opened_at TIMESTAMPTZ NOT NULL,
    closed_at TIMESTAMPTZ,
    payload JSONB NOT NULL
);

CREATE TABLE turn_attempts (
    id TEXT PRIMARY KEY,
    turn_id TEXT NOT NULL,
    conversation_key TEXT NOT NULL,
    claimed_interaction_ids JSONB NOT NULL,
    carry_forward_interaction_ids JSONB NOT NULL,
    phase_kind TEXT NOT NULL,
    opened_at TIMESTAMPTZ NOT NULL,
    observed_commit_refs JSONB NOT NULL,
    payload JSONB NOT NULL,
    CONSTRAINT turn_attempts_phase_kind_chk CHECK (
        phase_kind IN (
            'debouncing',
            'claiming',
            'assembling_context',
            'reasoning',
            'rendering',
            'planning_delivery',
            'delivering',
            'completed',
            'superseded',
            'failed'
        )
    )
);

CREATE TABLE conversation_arms (
    conversation_key TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    reserved_attempt_id TEXT,
    armed_at TIMESTAMPTZ NOT NULL,
    debounce_ms INTEGER NOT NULL CHECK (debounce_ms >= 0)
);

CREATE TABLE delivery_intents (
    id TEXT PRIMARY KEY,
    turn_attempt_id TEXT,
    record_id TEXT NOT NULL,
    stable_provider_delivery_id TEXT NOT NULL,
    delivery_group_id TEXT,
    sequence_index INT,
    payload JSONB NOT NULL,
    CONSTRAINT delivery_intents_stable_id_uq UNIQUE (stable_provider_delivery_id)
);

CREATE TABLE delivery_observations (
    id TEXT PRIMARY KEY,
    intent_id TEXT NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL,
    payload JSONB NOT NULL
);

CREATE TABLE delivery_send_claims (
    stable_provider_delivery_id TEXT PRIMARY KEY,
    intent_id TEXT,
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE reply_ledger (
    idempotency_key TEXT PRIMARY KEY,
    disposition JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE ingress_replay (
    webhook_id TEXT PRIMARY KEY,
    seen_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX turn_attempts_conversation_key_idx
    ON turn_attempts (conversation_key, opened_at);

CREATE INDEX conversation_pending_unclaimed_idx
    ON conversation_pending (conversation_key)
    WHERE claimed_by_attempt_id IS NULL;

CREATE INDEX delivery_observations_intent_id_idx
    ON delivery_observations (intent_id, observed_at DESC);

CREATE INDEX conversation_turns_key_idx
    ON conversation_turns (conversation_key, opened_at);
