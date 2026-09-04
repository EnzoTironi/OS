-- W2-08 (after W2-06 sealed cursors): stable ObjectKey and temporal TypeAssignment.
-- TypeAssignment is NOT Membership.

CREATE TABLE world_object_keys (
    world_id TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    minted_at_micros BIGINT NOT NULL,
    minted_by TEXT NOT NULL,
    PRIMARY KEY (world_id, entity_id)
);

CREATE TABLE world_type_assignments (
    assignment_id TEXT PRIMARY KEY,
    world_id TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    object_type TEXT NOT NULL,
    valid_start_micros BIGINT NOT NULL,
    valid_end_micros BIGINT,
    evidence_ref TEXT NOT NULL,
    receipt_id TEXT NOT NULL UNIQUE REFERENCES world_kernel_receipts (receipt_id),
    assertion_digest TEXT NOT NULL CHECK (assertion_digest ~ '^[0-9a-f]{64}$'),
    assigned_at_micros BIGINT NOT NULL,
    FOREIGN KEY (world_id, entity_id)
        REFERENCES world_object_keys (world_id, entity_id),
    UNIQUE (assignment_id, world_id, entity_id, object_type),
    CONSTRAINT type_assignment_valid_interval CHECK (
        valid_end_micros IS NULL OR valid_end_micros > valid_start_micros
    )
);

CREATE INDEX world_type_assignments_by_object
    ON world_type_assignments (world_id, entity_id, object_type, valid_start_micros);

CREATE INDEX world_type_assignments_by_type_valid
    ON world_type_assignments (world_id, object_type, valid_start_micros);

CREATE TABLE world_typed_object_grants (
    type_assignment_id TEXT NOT NULL,
    world_id TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    object_type TEXT NOT NULL,
    principal_id TEXT NOT NULL,
    membership_id TEXT NOT NULL,
    PRIMARY KEY (type_assignment_id, principal_id, membership_id),
    FOREIGN KEY (type_assignment_id, world_id, entity_id, object_type)
        REFERENCES world_type_assignments (
            assignment_id, world_id, entity_id, object_type
        )
);

CREATE INDEX world_typed_object_grants_by_principal
    ON world_typed_object_grants (
        world_id, object_type, principal_id, membership_id, entity_id,
        type_assignment_id
    );

CREATE FUNCTION reject_object_key_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'ObjectKey and TypeAssignment history is immutable';
END;
$$;

CREATE TRIGGER world_object_keys_are_immutable
BEFORE UPDATE OR DELETE ON world_object_keys
FOR EACH ROW EXECUTE FUNCTION reject_object_key_mutation();

CREATE TRIGGER world_type_assignments_are_immutable
BEFORE UPDATE OR DELETE ON world_type_assignments
FOR EACH ROW EXECUTE FUNCTION reject_object_key_mutation();

CREATE TRIGGER world_typed_object_grants_are_immutable
BEFORE UPDATE OR DELETE ON world_typed_object_grants
FOR EACH ROW EXECUTE FUNCTION reject_object_key_mutation();

CREATE TRIGGER world_object_keys_cannot_be_truncated
BEFORE TRUNCATE ON world_object_keys
FOR EACH STATEMENT EXECUTE FUNCTION reject_object_key_mutation();

CREATE TRIGGER world_type_assignments_cannot_be_truncated
BEFORE TRUNCATE ON world_type_assignments
FOR EACH STATEMENT EXECUTE FUNCTION reject_object_key_mutation();

CREATE TRIGGER world_typed_object_grants_cannot_be_truncated
BEFORE TRUNCATE ON world_typed_object_grants
FOR EACH STATEMENT EXECUTE FUNCTION reject_object_key_mutation();
