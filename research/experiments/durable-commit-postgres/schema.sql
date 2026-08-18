DROP TRIGGER IF EXISTS semantic_record_append_only ON semantic_record;
DROP TRIGGER IF EXISTS effect_request_append_only ON effect_request;
DROP TRIGGER IF EXISTS semantic_operation_append_only ON semantic_operation;
DROP FUNCTION IF EXISTS reject_append_only_change();
DROP FUNCTION IF EXISTS commit_semantic_operation(jsonb);
DROP FUNCTION IF EXISTS semantic_operation_status(text, text);
DROP TABLE IF EXISTS effect_request;
DROP TABLE IF EXISTS semantic_record;
DROP TABLE IF EXISTS semantic_operation;
DROP TABLE IF EXISTS semantic_head;

CREATE TABLE semantic_head (
    namespace text PRIMARY KEY,
    revision bigint NOT NULL CHECK (revision >= 0)
);

CREATE TABLE semantic_operation (
    namespace text NOT NULL,
    operation_id text NOT NULL,
    intent_digest text NOT NULL,
    result jsonb NOT NULL,
    commit_revision bigint NOT NULL CHECK (commit_revision > 0),
    PRIMARY KEY (namespace, operation_id)
);

CREATE TABLE semantic_record (
    namespace text NOT NULL,
    operation_id text NOT NULL,
    record_id text NOT NULL,
    kind text NOT NULL,
    payload jsonb NOT NULL,
    commit_revision bigint NOT NULL CHECK (commit_revision > 0),
    PRIMARY KEY (namespace, record_id),
    FOREIGN KEY (namespace, operation_id)
        REFERENCES semantic_operation (namespace, operation_id)
);

CREATE TABLE effect_request (
    namespace text NOT NULL,
    operation_id text NOT NULL,
    request_id text NOT NULL,
    effect_definition_ref text NOT NULL,
    intent_digest text NOT NULL,
    payload jsonb NOT NULL,
    commit_revision bigint NOT NULL CHECK (commit_revision > 0),
    PRIMARY KEY (namespace, request_id),
    FOREIGN KEY (namespace, operation_id)
        REFERENCES semantic_operation (namespace, operation_id)
);

CREATE FUNCTION reject_append_only_change()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
    RAISE EXCEPTION 'append_only_violation'
        USING ERRCODE = '25006';
END;
$fn$;

CREATE TRIGGER semantic_operation_append_only
    BEFORE UPDATE OR DELETE ON semantic_operation
    FOR EACH ROW
    EXECUTE FUNCTION reject_append_only_change();

CREATE TRIGGER semantic_record_append_only
    BEFORE UPDATE OR DELETE ON semantic_record
    FOR EACH ROW
    EXECUTE FUNCTION reject_append_only_change();

CREATE TRIGGER effect_request_append_only
    BEFORE UPDATE OR DELETE ON effect_request
    FOR EACH ROW
    EXECUTE FUNCTION reject_append_only_change();
