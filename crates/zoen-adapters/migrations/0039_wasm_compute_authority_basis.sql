ALTER TABLE wasm_executions
ADD COLUMN invocation_digest CHAR(64) NOT NULL,
ADD COLUMN membership_id TEXT NOT NULL REFERENCES memberships (membership_id),
ADD COLUMN compute_basis_digest CHAR(64) NOT NULL,
ADD COLUMN compute_basis_jcs TEXT NOT NULL
    CHECK (compute_basis_jcs <> ''),
ADD COLUMN release_digest CHAR(64) NOT NULL,
ADD COLUMN policy_catalog_digest CHAR(64) NOT NULL,
ADD COLUMN budget_class_id TEXT NOT NULL,
ADD COLUMN budget_resource_id TEXT NOT NULL,
ADD COLUMN execute_action_id TEXT NOT NULL
    CHECK (execute_action_id = 'zoen.world.execute'),
ADD COLUMN compute_operation TEXT NOT NULL
    CHECK (compute_operation = 'execute'),
ADD COLUMN compute_approved BOOLEAN NOT NULL
    CHECK (compute_approved),
ADD COLUMN authorized_at_micros BIGINT NOT NULL,
ADD COLUMN compute_policy_id TEXT NOT NULL,
ADD COLUMN compute_policy_digest CHAR(64) NOT NULL,
ADD COLUMN compute_policy_revision BIGINT NOT NULL
    CHECK (compute_policy_revision > 0),
ADD COLUMN compute_determining_policies TEXT[] NOT NULL
    CHECK (cardinality(compute_determining_policies) > 0),
ADD CONSTRAINT wasm_execution_authority_digests_are_sha256
    CHECK (
        (
            invocation_digest::TEXT
            || compute_basis_digest::TEXT
            || release_digest::TEXT
            || policy_catalog_digest::TEXT
            || compute_policy_digest::TEXT
        ) ~ '^([0-9a-f]{64}){5}$'
    );

CREATE OR REPLACE FUNCTION restrict_wasm_execution_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE'
        OR OLD.status <> 'running'
        OR NEW.status <> 'completed'
        OR OLD.tenant_id <> NEW.tenant_id
        OR OLD.execution_id <> NEW.execution_id
        OR OLD.request_digest <> NEW.request_digest
        OR OLD.invocation_digest <> NEW.invocation_digest
        OR OLD.component_digest <> NEW.component_digest
        OR OLD.component_interface <> NEW.component_interface
        OR OLD.capability_manifest_digest <> NEW.capability_manifest_digest
        OR OLD.capability_manifest <> NEW.capability_manifest
        OR OLD.capability_ids <> NEW.capability_ids
        OR OLD.input_digest <> NEW.input_digest
        OR OLD.fuel_limit <> NEW.fuel_limit
        OR OLD.memory_limit_bytes <> NEW.memory_limit_bytes
        OR OLD.table_element_limit <> NEW.table_element_limit
        OR OLD.instance_limit <> NEW.instance_limit
        OR OLD.table_limit <> NEW.table_limit
        OR OLD.memory_limit <> NEW.memory_limit
        OR OLD.deadline_millis <> NEW.deadline_millis
        OR OLD.started_actor_id <> NEW.started_actor_id
        OR OLD.started_principal_id <> NEW.started_principal_id
        OR OLD.started_workload_id <> NEW.started_workload_id
        OR OLD.membership_id <> NEW.membership_id
        OR OLD.compute_basis_digest <> NEW.compute_basis_digest
        OR OLD.compute_basis_jcs <> NEW.compute_basis_jcs
        OR OLD.release_digest <> NEW.release_digest
        OR OLD.policy_catalog_digest <> NEW.policy_catalog_digest
        OR OLD.budget_class_id <> NEW.budget_class_id
        OR OLD.budget_resource_id <> NEW.budget_resource_id
        OR OLD.execute_action_id <> NEW.execute_action_id
        OR OLD.compute_operation <> NEW.compute_operation
        OR OLD.compute_approved <> NEW.compute_approved
        OR OLD.authorized_at_micros <> NEW.authorized_at_micros
        OR OLD.compute_policy_id <> NEW.compute_policy_id
        OR OLD.compute_policy_digest <> NEW.compute_policy_digest
        OR OLD.compute_policy_revision <> NEW.compute_policy_revision
        OR OLD.compute_determining_policies <> NEW.compute_determining_policies
        OR OLD.started_at <> NEW.started_at
    THEN
        RAISE EXCEPTION 'Wasm execution identity and completed outcomes are immutable';
    END IF;
    RETURN NEW;
END;
$$;
