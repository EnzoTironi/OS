CREATE TABLE onboard_tokens (
    token_id TEXT PRIMARY KEY,
    token_hash BYTEA NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
    provider TEXT NOT NULL CHECK (provider IN ('web_oidc', 'whatsapp', 'telegram')),
    subject_key TEXT NOT NULL CHECK (
        char_length(subject_key) > 0
        AND char_length(subject_key) <= 200
    ),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX onboard_tokens_subject ON onboard_tokens (provider, subject_key);
