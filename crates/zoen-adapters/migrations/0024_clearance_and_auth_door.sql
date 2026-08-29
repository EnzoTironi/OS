ALTER TABLE external_bindings
DROP CONSTRAINT external_bindings_provider_check;

ALTER TABLE external_bindings
ADD CONSTRAINT external_bindings_provider_check
CHECK (provider IN ('web_oidc', 'whatsapp', 'telegram', 'linq', 'auth_door'));

ALTER TABLE onboard_tokens
DROP CONSTRAINT onboard_tokens_provider_check;

ALTER TABLE onboard_tokens
ADD CONSTRAINT onboard_tokens_provider_check
CHECK (provider IN ('web_oidc', 'whatsapp', 'telegram', 'linq', 'auth_door'));

ALTER TABLE memberships
ADD COLUMN clearance_json JSONB NOT NULL DEFAULT '["zoen.world.floor"]'::jsonb;

ALTER TABLE invites
ADD COLUMN clearance_json JSONB NOT NULL DEFAULT '["zoen.world.floor"]'::jsonb;

ALTER TABLE workload_credentials
ADD COLUMN clearance_json JSONB NOT NULL DEFAULT '["zoen.world.floor"]'::jsonb;

ALTER TABLE memberships
ADD CONSTRAINT memberships_clearance_json_nonempty
CHECK (jsonb_typeof(clearance_json) = 'array' AND jsonb_array_length(clearance_json) > 0);

ALTER TABLE invites
ADD CONSTRAINT invites_clearance_json_nonempty
CHECK (jsonb_typeof(clearance_json) = 'array' AND jsonb_array_length(clearance_json) > 0);

ALTER TABLE workload_credentials
ADD CONSTRAINT workload_credentials_clearance_json_nonempty
CHECK (jsonb_typeof(clearance_json) = 'array' AND jsonb_array_length(clearance_json) > 0);
