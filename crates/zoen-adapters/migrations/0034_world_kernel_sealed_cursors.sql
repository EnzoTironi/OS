-- W2-06: authorize-before-discovery object grants and sealed cursor plant store.

CREATE TABLE world_kernel_objects (
    world_id TEXT NOT NULL,
    object_type TEXT NOT NULL,
    object_id TEXT NOT NULL,
    fields_jcs TEXT NOT NULL,
    planted_at_micros BIGINT NOT NULL,
    PRIMARY KEY (world_id, object_type, object_id)
);

CREATE TABLE world_kernel_object_grants (
    world_id TEXT NOT NULL,
    object_type TEXT NOT NULL,
    object_id TEXT NOT NULL,
    principal_id TEXT NOT NULL,
    membership_id TEXT NOT NULL,
    PRIMARY KEY (world_id, object_type, object_id, principal_id, membership_id),
    FOREIGN KEY (world_id, object_type, object_id)
        REFERENCES world_kernel_objects (world_id, object_type, object_id)
);

CREATE INDEX world_kernel_object_grants_by_principal
    ON world_kernel_object_grants (world_id, object_type, principal_id, membership_id, object_id);

CREATE FUNCTION reject_world_kernel_object_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'world kernel object grants are immutable';
END;
$$;

CREATE TRIGGER world_kernel_objects_are_immutable
BEFORE UPDATE OR DELETE ON world_kernel_objects
FOR EACH ROW
EXECUTE FUNCTION reject_world_kernel_object_mutation();

CREATE TRIGGER world_kernel_object_grants_are_immutable
BEFORE UPDATE OR DELETE ON world_kernel_object_grants
FOR EACH ROW
EXECUTE FUNCTION reject_world_kernel_object_mutation();

CREATE TRIGGER world_kernel_objects_cannot_be_truncated
BEFORE TRUNCATE ON world_kernel_objects
FOR EACH STATEMENT
EXECUTE FUNCTION reject_world_kernel_object_mutation();

CREATE TRIGGER world_kernel_object_grants_cannot_be_truncated
BEFORE TRUNCATE ON world_kernel_object_grants
FOR EACH STATEMENT
EXECUTE FUNCTION reject_world_kernel_object_mutation();
