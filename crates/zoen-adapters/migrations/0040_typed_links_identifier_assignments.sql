-- W2-09: attributable typed links and contextual external identifiers.
-- Cardinality is catalog meaning, never a database winner-selection constraint.

ALTER TABLE world_object_keys
    ADD CONSTRAINT world_object_keys_world_id_fkey
    FOREIGN KEY (world_id) REFERENCES worlds (world_id);

CREATE TABLE world_link_assertions (
    link_assertion_id TEXT PRIMARY KEY,
    world_id TEXT NOT NULL REFERENCES worlds (world_id),
    link_type TEXT NOT NULL,
    definition_digest CHAR(64) NOT NULL CHECK (definition_digest ~ '^[0-9a-f]{64}$'),
    source_entity_id TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_assignment_id TEXT NOT NULL,
    target_entity_id TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_assignment_id TEXT NOT NULL,
    valid_start_micros BIGINT NOT NULL,
    valid_end_micros BIGINT,
    evidence_ref TEXT NOT NULL,
    receipt_id TEXT NOT NULL UNIQUE REFERENCES world_kernel_receipts (receipt_id),
    release_digest CHAR(64) NOT NULL CHECK (release_digest ~ '^[0-9a-f]{64}$'),
    policy_digest CHAR(64) NOT NULL CHECK (policy_digest ~ '^[0-9a-f]{64}$'),
    assertion_digest CHAR(64) NOT NULL CHECK (assertion_digest ~ '^[0-9a-f]{64}$'),
    admitted_at_micros BIGINT NOT NULL,
    CONSTRAINT world_link_assertions_valid_interval CHECK (
        valid_end_micros IS NULL OR valid_end_micros > valid_start_micros
    ),
    FOREIGN KEY (world_id, source_entity_id)
        REFERENCES world_object_keys (world_id, entity_id),
    FOREIGN KEY (world_id, target_entity_id)
        REFERENCES world_object_keys (world_id, entity_id),
    FOREIGN KEY (source_assignment_id, world_id, source_entity_id, source_type)
        REFERENCES world_type_assignments (
            assignment_id, world_id, entity_id, object_type
        ),
    FOREIGN KEY (target_assignment_id, world_id, target_entity_id, target_type)
        REFERENCES world_type_assignments (
            assignment_id, world_id, entity_id, object_type
        )
);

CREATE INDEX world_link_assertions_by_source_valid
    ON world_link_assertions (
        world_id, source_entity_id, link_type, valid_start_micros, link_assertion_id
    );

CREATE INDEX world_link_assertions_by_target_valid
    ON world_link_assertions (
        world_id, target_entity_id, link_type, valid_start_micros, link_assertion_id
    );

CREATE TABLE world_identifier_assignments (
    identifier_assignment_id TEXT PRIMARY KEY,
    world_id TEXT NOT NULL REFERENCES worlds (world_id),
    entity_id TEXT NOT NULL,
    type_assignment_id TEXT NOT NULL,
    object_type TEXT NOT NULL,
    scheme TEXT NOT NULL,
    identifier_value TEXT NOT NULL CHECK (btrim(identifier_value) <> ''),
    venue_entity_id TEXT,
    mic TEXT CHECK (mic IS NULL OR btrim(mic) <> ''),
    currency TEXT CHECK (currency IS NULL OR btrim(currency) <> ''),
    share_class TEXT CHECK (share_class IS NULL OR btrim(share_class) <> ''),
    provider TEXT CHECK (provider IS NULL OR btrim(provider) <> ''),
    identifier_level TEXT CHECK (identifier_level IS NULL OR btrim(identifier_level) <> ''),
    context_digest CHAR(64) NOT NULL CHECK (context_digest ~ '^[0-9a-f]{64}$'),
    valid_start_micros BIGINT NOT NULL,
    valid_end_micros BIGINT,
    evidence_ref TEXT NOT NULL,
    receipt_id TEXT NOT NULL UNIQUE REFERENCES world_kernel_receipts (receipt_id),
    release_digest CHAR(64) NOT NULL CHECK (release_digest ~ '^[0-9a-f]{64}$'),
    policy_digest CHAR(64) NOT NULL CHECK (policy_digest ~ '^[0-9a-f]{64}$'),
    assertion_digest CHAR(64) NOT NULL CHECK (assertion_digest ~ '^[0-9a-f]{64}$'),
    admitted_at_micros BIGINT NOT NULL,
    CONSTRAINT world_identifier_assignments_context_required CHECK (
        venue_entity_id IS NOT NULL
        OR mic IS NOT NULL
        OR currency IS NOT NULL
        OR share_class IS NOT NULL
        OR provider IS NOT NULL
        OR identifier_level IS NOT NULL
    ),
    CONSTRAINT world_identifier_assignments_valid_interval CHECK (
        valid_end_micros IS NULL OR valid_end_micros > valid_start_micros
    ),
    FOREIGN KEY (world_id, entity_id)
        REFERENCES world_object_keys (world_id, entity_id),
    FOREIGN KEY (type_assignment_id, world_id, entity_id, object_type)
        REFERENCES world_type_assignments (
            assignment_id, world_id, entity_id, object_type
        ),
    FOREIGN KEY (world_id, venue_entity_id)
        REFERENCES world_object_keys (world_id, entity_id)
);

CREATE INDEX world_identifier_assignments_by_value_valid
    ON world_identifier_assignments (
        world_id, identifier_value, scheme, valid_start_micros,
        identifier_assignment_id
    );

CREATE INDEX world_identifier_assignments_by_object_valid
    ON world_identifier_assignments (
        world_id, entity_id, valid_start_micros, identifier_assignment_id
    );

CREATE FUNCTION require_typed_artifact_support_coverage()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    source_start BIGINT;
    source_end BIGINT;
    target_start BIGINT;
    target_end BIGINT;
BEGIN
    IF TG_TABLE_NAME = 'world_link_assertions' THEN
        SELECT valid_start_micros, valid_end_micros
        INTO source_start, source_end
        FROM world_type_assignments
        WHERE assignment_id = NEW.source_assignment_id
          AND world_id = NEW.world_id
          AND entity_id = NEW.source_entity_id
          AND object_type = NEW.source_type
        FOR SHARE;

        SELECT valid_start_micros, valid_end_micros
        INTO target_start, target_end
        FROM world_type_assignments
        WHERE assignment_id = NEW.target_assignment_id
          AND world_id = NEW.world_id
          AND entity_id = NEW.target_entity_id
          AND object_type = NEW.target_type
        FOR SHARE;

        IF source_start IS NULL OR target_start IS NULL
            OR source_start > NEW.valid_start_micros
            OR target_start > NEW.valid_start_micros
            OR (NEW.valid_end_micros IS NULL AND source_end IS NOT NULL)
            OR (NEW.valid_end_micros IS NULL AND target_end IS NOT NULL)
            OR (NEW.valid_end_micros IS NOT NULL
                AND source_end IS NOT NULL
                AND source_end < NEW.valid_end_micros)
            OR (NEW.valid_end_micros IS NOT NULL
                AND target_end IS NOT NULL
                AND target_end < NEW.valid_end_micros)
        THEN
            RAISE EXCEPTION 'typed link endpoint TypeAssignments must cover the complete link interval';
        END IF;
    ELSE
        SELECT valid_start_micros, valid_end_micros
        INTO source_start, source_end
        FROM world_type_assignments
        WHERE assignment_id = NEW.type_assignment_id
          AND world_id = NEW.world_id
          AND entity_id = NEW.entity_id
          AND object_type = NEW.object_type
        FOR SHARE;

        IF source_start IS NULL
            OR source_start > NEW.valid_start_micros
            OR (NEW.valid_end_micros IS NULL AND source_end IS NOT NULL)
            OR (NEW.valid_end_micros IS NOT NULL
                AND source_end IS NOT NULL
                AND source_end < NEW.valid_end_micros)
        THEN
            RAISE EXCEPTION 'IdentifierAssignment TypeAssignment must cover the complete identifier interval';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER world_link_assertions_require_type_coverage
BEFORE INSERT ON world_link_assertions
FOR EACH ROW EXECUTE FUNCTION require_typed_artifact_support_coverage();

CREATE TRIGGER world_identifier_assignments_require_type_coverage
BEFORE INSERT ON world_identifier_assignments
FOR EACH ROW EXECUTE FUNCTION require_typed_artifact_support_coverage();

CREATE FUNCTION reject_typed_artifact_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'typed link and IdentifierAssignment history is immutable';
END;
$$;

CREATE TRIGGER world_link_assertions_are_immutable
BEFORE UPDATE OR DELETE ON world_link_assertions
FOR EACH ROW EXECUTE FUNCTION reject_typed_artifact_mutation();

CREATE TRIGGER world_identifier_assignments_are_immutable
BEFORE UPDATE OR DELETE ON world_identifier_assignments
FOR EACH ROW EXECUTE FUNCTION reject_typed_artifact_mutation();

CREATE TRIGGER world_link_assertions_cannot_be_truncated
BEFORE TRUNCATE ON world_link_assertions
FOR EACH STATEMENT EXECUTE FUNCTION reject_typed_artifact_mutation();

CREATE TRIGGER world_identifier_assignments_cannot_be_truncated
BEFORE TRUNCATE ON world_identifier_assignments
FOR EACH STATEMENT EXECUTE FUNCTION reject_typed_artifact_mutation();
