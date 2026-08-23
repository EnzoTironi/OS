-- WorkloadCredential SoR (sibling of Membership; never a Membership).
-- Secrets store hash + key_id only. ExternalSignal is idempotent on (tenant, durable_event_id).

CREATE TABLE workload_credentials (
    credential_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    principal_id TEXT NOT NULL,
    workload_id TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'revoked', 'expired')),
    allowed_ingress_json JSONB NOT NULL,
    rate_budget_json JSONB NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    audience_class TEXT,
    secret_id TEXT NOT NULL,
    jwt_issuer TEXT,
    jwt_subject TEXT,
    delegation_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    rotated_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    revocation_reason TEXT CHECK (
        revocation_reason IS NULL
        OR revocation_reason IN ('admin', 'security', 'rotation', 'compromise')
    ),
    CHECK (
        (status = 'active' AND revoked_at IS NULL AND revocation_reason IS NULL)
        OR (status = 'revoked' AND revoked_at IS NOT NULL AND revocation_reason IS NOT NULL)
        OR (status = 'expired' AND revoked_at IS NULL AND revocation_reason IS NULL)
    )
);

CREATE UNIQUE INDEX workload_credentials_jwt_subject
    ON workload_credentials (jwt_issuer, jwt_subject)
    WHERE jwt_issuer IS NOT NULL AND jwt_subject IS NOT NULL AND status = 'active';

CREATE INDEX workload_credentials_tenant
    ON workload_credentials (tenant_id, status);

CREATE TABLE workload_secrets (
    secret_id TEXT PRIMARY KEY,
    credential_id TEXT NOT NULL REFERENCES workload_credentials (credential_id),
    secret_hash BYTEA NOT NULL UNIQUE CHECK (octet_length(secret_hash) = 32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    rotated_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ
);

CREATE INDEX workload_secrets_credential
    ON workload_secrets (credential_id);

CREATE TABLE external_signals (
    signal_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    durable_event_id TEXT NOT NULL,
    source_class TEXT NOT NULL,
    source_external_id TEXT NOT NULL,
    audience_class TEXT,
    payload_digest_ref TEXT NOT NULL,
    source_digest_ref TEXT NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    workload_credential_id TEXT NOT NULL REFERENCES workload_credentials (credential_id),
    workload_id TEXT NOT NULL,
    principal_id TEXT NOT NULL,
    trust_disposition TEXT NOT NULL CHECK (
        trust_disposition IN ('attention_candidate', 'evidence_candidate', 'untrusted_raw')
    ),
    UNIQUE (tenant_id, durable_event_id)
);

CREATE INDEX external_signals_credential
    ON external_signals (workload_credential_id);

CREATE TABLE workload_accept_budget (
    credential_id TEXT NOT NULL,
    window_minute TIMESTAMPTZ NOT NULL,
    accept_count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (credential_id, window_minute)
);
