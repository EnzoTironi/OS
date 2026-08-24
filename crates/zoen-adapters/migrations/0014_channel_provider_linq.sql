ALTER TABLE external_bindings
DROP CONSTRAINT external_bindings_provider_check;

ALTER TABLE external_bindings
ADD CONSTRAINT external_bindings_provider_check
CHECK (provider IN ('web_oidc', 'whatsapp', 'telegram', 'linq'));
