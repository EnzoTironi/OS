CREATE TABLE wasm_components (
    tenant_id TEXT NOT NULL,
    component_digest CHAR(64) NOT NULL CHECK (component_digest ~ '^[0-9a-f]{64}$'),
    component_interface TEXT NOT NULL,
    component_bytes BYTEA NOT NULL CHECK (octet_length(component_bytes) > 0),
    published_actor_id TEXT NOT NULL,
    published_principal_id TEXT NOT NULL,
    published_workload_id TEXT NOT NULL,
    published_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, component_digest)
);

CREATE TABLE wasm_executions (
    tenant_id TEXT NOT NULL,
    execution_id TEXT NOT NULL,
    request_digest CHAR(64) NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
    component_digest CHAR(64) NOT NULL CHECK (component_digest ~ '^[0-9a-f]{64}$'),
    component_interface TEXT NOT NULL,
    capability_manifest_digest CHAR(64) NOT NULL
        CHECK (capability_manifest_digest ~ '^[0-9a-f]{64}$'),
    capability_manifest JSONB NOT NULL,
    capability_ids TEXT[] NOT NULL,
    input_digest CHAR(64) NOT NULL CHECK (input_digest ~ '^[0-9a-f]{64}$'),
    fuel_limit BIGINT NOT NULL CHECK (fuel_limit > 0),
    memory_limit_bytes BIGINT NOT NULL CHECK (memory_limit_bytes > 0),
    table_element_limit BIGINT NOT NULL CHECK (table_element_limit > 0),
    instance_limit BIGINT NOT NULL CHECK (instance_limit > 0),
    table_limit BIGINT NOT NULL CHECK (table_limit > 0),
    memory_limit BIGINT NOT NULL CHECK (memory_limit > 0),
    deadline_millis BIGINT NOT NULL CHECK (deadline_millis > 0),
    started_actor_id TEXT NOT NULL,
    started_principal_id TEXT NOT NULL,
    started_workload_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('running', 'completed')),
    outcome_kind TEXT,
    result_json JSONB,
    result_digest CHAR(64) CHECK (result_digest ~ '^[0-9a-f]{64}$'),
    started_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    completed_at TIMESTAMPTZ,
    PRIMARY KEY (tenant_id, execution_id),
    FOREIGN KEY (tenant_id, component_digest)
        REFERENCES wasm_components (tenant_id, component_digest),
    CHECK (
        (status = 'running'
            AND outcome_kind IS NULL
            AND result_json IS NULL
            AND result_digest IS NULL
            AND completed_at IS NULL)
        OR
        (status = 'completed'
            AND outcome_kind IS NOT NULL
            AND result_json IS NOT NULL
            AND completed_at IS NOT NULL)
    )
);

ALTER TABLE action_proposals
ADD COLUMN execution_id TEXT,
ADD COLUMN component_digest CHAR(64)
    CHECK (component_digest ~ '^[0-9a-f]{64}$'),
ADD COLUMN component_interface TEXT,
ADD COLUMN capability_manifest_digest CHAR(64)
    CHECK (capability_manifest_digest ~ '^[0-9a-f]{64}$'),
ADD COLUMN capability_ids TEXT[],
ADD CONSTRAINT action_proposal_component_evidence_complete CHECK (
    (execution_id IS NULL
        AND component_digest IS NULL
        AND component_interface IS NULL
        AND capability_manifest_digest IS NULL
        AND capability_ids IS NULL)
    OR
    (execution_id IS NOT NULL
        AND component_digest IS NOT NULL
        AND component_interface IS NOT NULL
        AND capability_manifest_digest IS NOT NULL
        AND capability_ids IS NOT NULL)
),
ADD CONSTRAINT action_proposal_wasm_execution_fk
    FOREIGN KEY (tenant_id, execution_id)
    REFERENCES wasm_executions (tenant_id, execution_id);

CREATE FUNCTION reject_wasm_component_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'published Wasm components are immutable';
END;
$$;

CREATE TRIGGER wasm_components_are_immutable
BEFORE UPDATE OR DELETE ON wasm_components
FOR EACH ROW
EXECUTE FUNCTION reject_wasm_component_mutation();

CREATE FUNCTION restrict_wasm_execution_mutation()
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
        OR OLD.started_at <> NEW.started_at
    THEN
        RAISE EXCEPTION 'Wasm execution identity and completed outcomes are immutable';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER wasm_executions_have_one_completion
BEFORE UPDATE OR DELETE ON wasm_executions
FOR EACH ROW
EXECUTE FUNCTION restrict_wasm_execution_mutation();

ALTER TABLE wasm_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE wasm_components FORCE ROW LEVEL SECURITY;
CREATE POLICY wasm_components_tenant_policy ON wasm_components
    USING (tenant_id = current_setting('zoen.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('zoen.tenant_id', true));

ALTER TABLE wasm_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE wasm_executions FORCE ROW LEVEL SECURITY;
CREATE POLICY wasm_executions_tenant_policy ON wasm_executions
    USING (tenant_id = current_setting('zoen.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('zoen.tenant_id', true));
