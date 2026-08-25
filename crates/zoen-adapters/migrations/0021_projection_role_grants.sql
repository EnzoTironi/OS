-- Least-privilege grants for zoen_projection when that role exists.
-- Role creation is cluster init or the Helm projection-role Job.
-- zoen_app owns the tables and can GRANT; it cannot CREATE ROLE.
-- PostgresAuthorityStore::connect re-runs this file after migrate so a
-- role created after sqlx records 0021 still receives the grants.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zoen_projection') THEN
        RETURN;
    END IF;

    GRANT SELECT ON ALL TABLES IN SCHEMA public TO zoen_projection;
    GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO zoen_projection;
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public
        FROM zoen_projection;
    GRANT INSERT, UPDATE ON TABLE projection_manifests, projection_watermarks
        TO zoen_projection;

    ALTER DEFAULT PRIVILEGES FOR ROLE zoen_app IN SCHEMA public
        GRANT SELECT ON TABLES TO zoen_projection;
    ALTER DEFAULT PRIVILEGES FOR ROLE zoen_app IN SCHEMA public
        GRANT SELECT ON SEQUENCES TO zoen_projection;
END
$$;
