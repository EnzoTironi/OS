-- Align identity storage to Account / ChannelBinding / Membership / World.
-- Pre-launch: replace dual tenant spelling in identity tables; authority
-- tables may keep SQL column tenant_id as boundary spelling for WorldId values.

CREATE TABLE worlds (
    world_id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('personal', 'shared')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE external_bindings RENAME TO channel_bindings;

ALTER TABLE channel_bindings
    RENAME CONSTRAINT external_bindings_pkey TO channel_bindings_pkey;
ALTER TABLE channel_bindings
    RENAME CONSTRAINT external_bindings_binding_id_not_null TO channel_bindings_binding_id_not_null;
ALTER TABLE channel_bindings
    RENAME CONSTRAINT external_bindings_account_id_fkey TO channel_bindings_account_id_fkey;
ALTER TABLE channel_bindings
    RENAME CONSTRAINT external_bindings_account_id_not_null TO channel_bindings_account_id_not_null;
ALTER TABLE channel_bindings
    RENAME CONSTRAINT external_bindings_provider_check TO channel_bindings_provider_check;
ALTER TABLE channel_bindings
    RENAME CONSTRAINT external_bindings_provider_not_null TO channel_bindings_provider_not_null;
ALTER TABLE channel_bindings
    RENAME CONSTRAINT external_bindings_subject_key_check TO channel_bindings_subject_key_check;
ALTER TABLE channel_bindings
    RENAME CONSTRAINT external_bindings_subject_key_not_null TO channel_bindings_subject_key_not_null;
ALTER TABLE channel_bindings
    RENAME CONSTRAINT external_bindings_status_check TO channel_bindings_status_check;
ALTER TABLE channel_bindings
    RENAME CONSTRAINT external_bindings_status_not_null TO channel_bindings_status_not_null;
ALTER TABLE channel_bindings
    RENAME CONSTRAINT external_bindings_unbind_reason_check TO channel_bindings_unbind_reason_check;
ALTER TABLE channel_bindings
    RENAME CONSTRAINT external_bindings_check TO channel_bindings_lifecycle_check;

ALTER TABLE channel_bindings
    DROP CONSTRAINT channel_bindings_provider_check;
ALTER TABLE channel_bindings
    ADD CONSTRAINT channel_bindings_provider_check
    CHECK (provider IN ('whatsapp', 'telegram', 'linq', 'auth_door'));

ALTER TABLE onboard_tokens
    DROP CONSTRAINT onboard_tokens_provider_check;
ALTER TABLE onboard_tokens
    ADD CONSTRAINT onboard_tokens_provider_check
    CHECK (provider IN ('whatsapp', 'telegram', 'linq', 'auth_door'));

ALTER INDEX IF EXISTS external_bindings_active_subject
    RENAME TO channel_bindings_active_subject;

ALTER INDEX IF EXISTS external_bindings_account_id
    RENAME TO channel_bindings_account_id;

ALTER TABLE memberships RENAME COLUMN tenant_id TO world_id;
ALTER TABLE memberships
    RENAME CONSTRAINT memberships_account_id_tenant_id_key
    TO memberships_account_id_world_id_key;
ALTER TABLE memberships
    RENAME CONSTRAINT memberships_tenant_id_not_null TO memberships_world_id_not_null;
ALTER TABLE memberships
    DROP CONSTRAINT memberships_kind_check;
ALTER TABLE memberships
    DROP CONSTRAINT memberships_check;
ALTER TABLE memberships
    DROP COLUMN idp_issuer,
    DROP COLUMN idp_subject;
ALTER TABLE memberships
    ADD CONSTRAINT memberships_kind_check
    CHECK (kind IN ('personal', 'invite'));
ALTER TABLE memberships
    ADD CONSTRAINT memberships_kind_source_check
    CHECK (
        (kind = 'personal' AND invite_id IS NULL)
        OR (kind = 'invite' AND invite_id IS NOT NULL)
    );
ALTER TABLE memberships
    RENAME CONSTRAINT memberships_check1 TO memberships_lifecycle_check;

ALTER TABLE invites RENAME COLUMN tenant_id TO world_id;
ALTER TABLE invites
    RENAME CONSTRAINT invites_tenant_id_not_null TO invites_world_id_not_null;

ALTER TABLE personal_tenants RENAME TO personal_worlds;
ALTER TABLE personal_worlds RENAME COLUMN tenant_id TO world_id;
ALTER TABLE personal_worlds
    RENAME CONSTRAINT personal_tenants_pkey TO personal_worlds_pkey;
ALTER TABLE personal_worlds
    RENAME CONSTRAINT personal_tenants_account_id_fkey TO personal_worlds_account_id_fkey;
ALTER TABLE personal_worlds
    RENAME CONSTRAINT personal_tenants_account_id_not_null TO personal_worlds_account_id_not_null;
ALTER TABLE personal_worlds
    RENAME CONSTRAINT personal_tenants_tenant_id_key TO personal_worlds_world_id_key;
ALTER TABLE personal_worlds
    RENAME CONSTRAINT personal_tenants_tenant_id_not_null TO personal_worlds_world_id_not_null;

INSERT INTO worlds (world_id, kind)
SELECT world_id, 'personal'
FROM personal_worlds
ON CONFLICT (world_id) DO NOTHING;

INSERT INTO worlds (world_id, kind)
SELECT DISTINCT world_id, 'shared'
FROM memberships
WHERE world_id NOT IN (SELECT world_id FROM worlds)
ON CONFLICT (world_id) DO NOTHING;

-- An unconsumed invite can be the first durable reference to a shared World.
-- Backfill it before adding the foreign key so an upgrade does not reject a
-- valid invite merely because no Membership has been accepted yet.
INSERT INTO worlds (world_id, kind)
SELECT DISTINCT world_id, 'shared'
FROM invites
WHERE world_id NOT IN (SELECT world_id FROM worlds)
ON CONFLICT (world_id) DO NOTHING;

ALTER TABLE personal_worlds
    ADD CONSTRAINT personal_worlds_world_id_fkey
    FOREIGN KEY (world_id) REFERENCES worlds (world_id);

ALTER TABLE memberships
    ADD CONSTRAINT memberships_world_id_fkey
    FOREIGN KEY (world_id) REFERENCES worlds (world_id);

ALTER TABLE invites
    ADD CONSTRAINT invites_world_id_fkey
    FOREIGN KEY (world_id) REFERENCES worlds (world_id);
