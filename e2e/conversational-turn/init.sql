CREATE ROLE zoen_app
    LOGIN
    PASSWORD 'zoen_app'
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    NOINHERIT;

GRANT CONNECT ON DATABASE zoen TO zoen_app;
GRANT ALL ON SCHEMA public TO zoen_app;

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
  payload JSONB NOT NULL
);

CREATE TABLE delivery_intents (
  id TEXT PRIMARY KEY,
  turn_attempt_id TEXT,
  record_id TEXT NOT NULL,
  stable_provider_delivery_id TEXT NOT NULL,
  delivery_group_id TEXT,
  sequence_index INT,
  payload JSONB NOT NULL
);

CREATE TABLE delivery_observations (
  id TEXT PRIMARY KEY,
  intent_id TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL
);

CREATE INDEX turn_attempts_conversation_key_idx
  ON turn_attempts (conversation_key, opened_at);
CREATE INDEX conversation_pending_unclaimed_idx
  ON conversation_pending (conversation_key)
  WHERE claimed_by_attempt_id IS NULL;

GRANT ALL ON TABLE interaction_records TO zoen_app;
GRANT ALL ON TABLE conversation_pending TO zoen_app;
GRANT ALL ON TABLE conversation_turns TO zoen_app;
GRANT ALL ON TABLE turn_attempts TO zoen_app;
GRANT ALL ON TABLE delivery_intents TO zoen_app;
GRANT ALL ON TABLE delivery_observations TO zoen_app;
