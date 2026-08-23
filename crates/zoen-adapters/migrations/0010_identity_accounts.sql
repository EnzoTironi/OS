-- Zoen-owned identity: accounts, bindings, memberships, invites.
-- Global account/binding rows; memberships and invites are tenant-scoped.

CREATE TABLE zoen_accounts (
    account_id TEXT PRIMARY KEY,
    status TEXT NOT NULL CHECK (status IN ('provisional', 'verified', 'merged_into')),
    merged_into_account_id TEXT REFERENCES zoen_accounts (account_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK (
        (status = 'merged_into' AND merged_into_account_id IS NOT NULL)
        OR (status <> 'merged_into' AND merged_into_account_id IS NULL)
    )
);

CREATE TABLE external_bindings (
    binding_id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES zoen_accounts (account_id),
    provider TEXT NOT NULL CHECK (provider IN ('web_oidc', 'whatsapp', 'telegram')),
    subject_key TEXT NOT NULL CHECK (char_length(subject_key) > 0 AND char_length(subject_key) <= 200),
    status TEXT NOT NULL CHECK (status IN ('provisional', 'verified', 'unbound')),
    verified_at TIMESTAMPTZ,
    unbound_at TIMESTAMPTZ,
    unbind_reason TEXT CHECK (
        unbind_reason IS NULL
        OR unbind_reason IN ('recycle', 'merge', 'admin', 'user_request')
    ),
    CHECK (
        (status = 'provisional' AND verified_at IS NULL AND unbound_at IS NULL AND unbind_reason IS NULL)
        OR (status = 'verified' AND verified_at IS NOT NULL AND unbound_at IS NULL AND unbind_reason IS NULL)
        OR (status = 'unbound' AND unbound_at IS NOT NULL AND unbind_reason IS NOT NULL)
    )
);

CREATE UNIQUE INDEX external_bindings_active_subject
    ON external_bindings (provider, subject_key)
    WHERE status IN ('provisional', 'verified');

CREATE INDEX external_bindings_account_id ON external_bindings (account_id);

CREATE TABLE personal_tenants (
    account_id TEXT PRIMARY KEY REFERENCES zoen_accounts (account_id),
    tenant_id TEXT NOT NULL UNIQUE
);

CREATE TABLE memberships (
    membership_id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES zoen_accounts (account_id),
    tenant_id TEXT NOT NULL,
    principal_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'revoked', 'left')),
    kind TEXT NOT NULL CHECK (kind IN ('personal', 'invite', 'enterprise_oidc')),
    invite_id TEXT,
    idp_issuer TEXT,
    idp_subject TEXT,
    delegation_template_id TEXT,
    workload_id TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    delegation_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    ended_at TIMESTAMPTZ,
    ended_reason TEXT,
    UNIQUE (account_id, tenant_id),
    CHECK (
        (kind = 'personal' AND invite_id IS NULL AND idp_issuer IS NULL AND idp_subject IS NULL)
        OR (kind = 'invite' AND invite_id IS NOT NULL AND idp_issuer IS NULL AND idp_subject IS NULL)
        OR (
            kind = 'enterprise_oidc'
            AND invite_id IS NULL
            AND idp_issuer IS NOT NULL
            AND idp_subject IS NOT NULL
        )
    ),
    CHECK (
        (status = 'active' AND ended_at IS NULL AND ended_reason IS NULL)
        OR (status IN ('revoked', 'left') AND ended_at IS NOT NULL)
    )
);

CREATE UNIQUE INDEX memberships_one_active_personal
    ON memberships (account_id)
    WHERE kind = 'personal' AND status = 'active';

CREATE TABLE invites (
    invite_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    principal_id TEXT NOT NULL,
    token_hash BYTEA NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    workload_id TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    delegation_json JSONB NOT NULL
);

-- Identity membership/invite rows are filtered in the store by tenant predicates.
-- FORCE RLS is omitted so token and membership-id lookups can resolve without a
-- prior tenant hint (invite accept, revoke by id).