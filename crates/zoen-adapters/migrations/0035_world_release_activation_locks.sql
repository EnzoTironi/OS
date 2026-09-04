-- A World's active-pointer row does not exist before its first activation.
-- Keep one stable row per World so competing first candidates can lock before
-- either reads or writes the pointer.

CREATE TABLE world_release_activation_locks (
    world_id TEXT PRIMARY KEY
);

-- Keep the exact Membership authority cut that admitted each release verb.
-- The release/preview/decision/pointer tables describe governed state; this
-- immutable ledger explains who was admitted, through which delegation, and
-- which candidate policy produced the Permit that changed that state.

CREATE TABLE world_release_authorizations (
    operation TEXT NOT NULL CHECK (
        operation IN ('publish', 'preview', 'decide', 'activate')
    ),
    target_digest TEXT NOT NULL CHECK (target_digest ~ '^[0-9a-f]{64}$'),
    world_id TEXT NOT NULL,
    release_digest TEXT NOT NULL REFERENCES world_releases (digest),
    preview_digest TEXT REFERENCES world_release_previews (preview_digest),
    authorized_at_micros BIGINT NOT NULL,
    membership_id TEXT NOT NULL REFERENCES memberships (membership_id),
    principal_id TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    workload_id TEXT NOT NULL,
    action_id TEXT NOT NULL,
    delegation_json JSONB NOT NULL,
    policy_id TEXT NOT NULL,
    policy_revision BIGINT NOT NULL CHECK (policy_revision > 0),
    policy_digest TEXT NOT NULL CHECK (policy_digest ~ '^[0-9a-f]{64}$'),
    determining_policies TEXT[] NOT NULL CHECK (cardinality(determining_policies) > 0),
    PRIMARY KEY (operation, target_digest, membership_id),
    CONSTRAINT world_release_authorization_target CHECK (
        (
            operation = 'publish'
            AND preview_digest IS NULL
            AND target_digest = release_digest
        )
        OR (
            operation IN ('preview', 'decide', 'activate')
            AND preview_digest IS NOT NULL
            AND target_digest = preview_digest
        )
    ),
    CONSTRAINT world_release_authorization_action CHECK (
        (operation = 'publish' AND action_id = 'zoen.world.release.publish')
        OR (operation = 'preview' AND action_id = 'zoen.world.release.preview')
        OR (operation = 'decide' AND action_id = 'zoen.world.release.decide')
        OR (operation = 'activate' AND action_id = 'zoen.world.release.activate')
    )
);

CREATE INDEX world_release_authorizations_by_release
    ON world_release_authorizations (world_id, release_digest, operation);

CREATE FUNCTION reject_world_release_authorization_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'world release authority history is immutable';
END;
$$;

CREATE TRIGGER world_release_authorizations_are_immutable
BEFORE UPDATE OR DELETE ON world_release_authorizations
FOR EACH ROW
EXECUTE FUNCTION reject_world_release_authorization_mutation();

CREATE TRIGGER world_release_authorizations_cannot_be_truncated
BEFORE TRUNCATE ON world_release_authorizations
FOR EACH STATEMENT
EXECUTE FUNCTION reject_world_release_authorization_mutation();
