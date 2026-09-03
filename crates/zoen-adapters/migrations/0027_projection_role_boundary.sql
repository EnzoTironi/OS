-- Exact effective capabilities for the supervised projection worker.
-- Migration 0021 is historical. PostgresAuthorityStore::connect replays this
-- idempotent desired state after migrations so a role created later converges.
-- Do not edit this migration after application. A later allowlist change adds a
-- new full-state migration and repoints runtime reconciliation to that file.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_roles
        WHERE rolname = 'zoen_projection'
    ) THEN
        RETURN;
    END IF;

    REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM zoen_projection;
    REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM zoen_projection;

    ALTER DEFAULT PRIVILEGES FOR ROLE zoen_app IN SCHEMA public
        REVOKE ALL PRIVILEGES ON TABLES FROM zoen_projection;
    ALTER DEFAULT PRIVILEGES FOR ROLE zoen_app IN SCHEMA public
        REVOKE ALL PRIVILEGES ON SEQUENCES FROM zoen_projection;
    GRANT SELECT ON TABLE
        public.authority_heads,
        public.authority_commits,
        public.projection_outbox,
        public.semantic_claims,
        public.projection_manifests,
        public.projection_watermarks
        TO zoen_projection;

    GRANT INSERT (
        tenant_id,
        projection_id,
        manifest_digest,
        build_id,
        from_commit,
        through_commit,
        manifest_object_key,
        parquet_object_key,
        parquet_digest
    ) ON TABLE public.projection_manifests TO zoen_projection;

    GRANT INSERT (
        tenant_id,
        projection_id,
        through_commit,
        manifest_digest
    ) ON TABLE public.projection_watermarks TO zoen_projection;

    GRANT UPDATE (
        through_commit,
        manifest_digest,
        updated_at
    ) ON TABLE public.projection_watermarks TO zoen_projection;
END
$$;
