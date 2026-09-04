-- Every state-changing public verb records the durable Membership authority
-- and the exact active-release Cedar evidence used for that decision.

ALTER TABLE world_kernel_proposals
    ADD COLUMN membership_id TEXT NOT NULL REFERENCES memberships (membership_id),
    ADD COLUMN actor_id TEXT NOT NULL,
    ADD COLUMN workload_id TEXT NOT NULL,
    ADD COLUMN action_id TEXT NOT NULL,
    ADD COLUMN policy_id TEXT NOT NULL,
    ADD COLUMN policy_digest TEXT NOT NULL CHECK (policy_digest ~ '^[0-9a-f]{64}$'),
    ADD COLUMN policy_revision BIGINT NOT NULL CHECK (policy_revision > 0),
    ADD COLUMN determining_policies TEXT[] NOT NULL CHECK (cardinality(determining_policies) > 0),
    ADD CONSTRAINT world_kernel_proposals_action
        CHECK (action_id = 'zoen.world.propose');

ALTER TABLE world_kernel_decisions
    ADD COLUMN membership_id TEXT NOT NULL REFERENCES memberships (membership_id),
    ADD COLUMN actor_id TEXT NOT NULL,
    ADD COLUMN workload_id TEXT NOT NULL,
    ADD COLUMN action_id TEXT NOT NULL,
    ADD COLUMN policy_id TEXT NOT NULL,
    ADD COLUMN policy_digest TEXT NOT NULL CHECK (policy_digest ~ '^[0-9a-f]{64}$'),
    ADD COLUMN policy_revision BIGINT NOT NULL CHECK (policy_revision > 0),
    ADD COLUMN determining_policies TEXT[] NOT NULL CHECK (cardinality(determining_policies) > 0),
    ADD CONSTRAINT world_kernel_decisions_action
        CHECK (action_id = 'zoen.world.decide');

ALTER TABLE world_kernel_receipts
    ADD COLUMN principal_id TEXT NOT NULL,
    ADD COLUMN membership_id TEXT NOT NULL REFERENCES memberships (membership_id),
    ADD COLUMN actor_id TEXT NOT NULL,
    ADD COLUMN workload_id TEXT NOT NULL,
    ADD COLUMN action_id TEXT NOT NULL,
    ADD COLUMN policy_id TEXT NOT NULL,
    ADD COLUMN policy_digest TEXT NOT NULL CHECK (policy_digest ~ '^[0-9a-f]{64}$'),
    ADD COLUMN policy_revision BIGINT NOT NULL CHECK (policy_revision > 0),
    ADD COLUMN determining_policies TEXT[] NOT NULL CHECK (cardinality(determining_policies) > 0),
    ADD CONSTRAINT world_kernel_receipts_action
        CHECK (action_id = 'zoen.world.commit');

ALTER TABLE world_kernel_executions
    ADD COLUMN principal_id TEXT NOT NULL,
    ADD COLUMN membership_id TEXT NOT NULL REFERENCES memberships (membership_id),
    ADD COLUMN actor_id TEXT NOT NULL,
    ADD COLUMN workload_id TEXT NOT NULL,
    ADD COLUMN action_id TEXT NOT NULL,
    ADD COLUMN policy_id TEXT NOT NULL,
    ADD COLUMN policy_digest TEXT NOT NULL CHECK (policy_digest ~ '^[0-9a-f]{64}$'),
    ADD COLUMN policy_revision BIGINT NOT NULL CHECK (policy_revision > 0),
    ADD COLUMN determining_policies TEXT[] NOT NULL CHECK (cardinality(determining_policies) > 0),
    ADD CONSTRAINT world_kernel_executions_action
        CHECK (action_id = 'zoen.world.execute');
