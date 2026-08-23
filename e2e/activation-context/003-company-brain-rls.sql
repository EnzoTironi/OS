BEGIN;
SET LOCAL ROLE zoen_app;

ALTER TABLE company_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_sources FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_sources_tenant_isolation ON company_sources;
CREATE POLICY company_sources_tenant_isolation ON company_sources
    USING (tenant_id = COALESCE(nullif(current_setting('zoen.tenant_id', true), ''), tenant_id))
    WITH CHECK (tenant_id = COALESCE(nullif(current_setting('zoen.tenant_id', true), ''), tenant_id));

ALTER TABLE company_surface_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_surface_sessions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_surface_sessions_tenant_isolation ON company_surface_sessions;
CREATE POLICY company_surface_sessions_tenant_isolation ON company_surface_sessions
    USING (tenant_id = COALESCE(nullif(current_setting('zoen.tenant_id', true), ''), tenant_id))
    WITH CHECK (tenant_id = COALESCE(nullif(current_setting('zoen.tenant_id', true), ''), tenant_id));

COMMIT;
