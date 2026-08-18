CREATE EXTENSION IF NOT EXISTS dblink;

CREATE OR REPLACE FUNCTION commit_semantic_operation(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $fn$
DECLARE
    v_namespace text := payload->>'namespace';
    v_operation_id text := payload->>'operation_id';
    v_intent_digest text := payload->>'intent_digest';
    v_expected_revision bigint := (payload->>'expected_revision')::bigint;
    v_result jsonb := payload->'result';
    v_records jsonb := payload->'records';
    v_effects jsonb := payload->'effect_requests';
    v_head_revision bigint;
    v_commit_revision bigint;
    v_record jsonb;
    v_effect jsonb;
    v_conn text := 'marker_' || replace(cast(pg_backend_pid() as text), '-', '');
    v_insert text;
BEGIN
    PERFORM pg_advisory_xact_lock(
        hashtext('semantic_operation'),
        hashtext(v_namespace || chr(31) || v_operation_id)
    );

    INSERT INTO semantic_head (namespace, revision)
    VALUES (v_namespace, 0)
    ON CONFLICT (namespace) DO NOTHING;

    SELECT revision INTO v_head_revision
    FROM semantic_head
    WHERE namespace = v_namespace
    FOR UPDATE;

    IF v_head_revision IS DISTINCT FROM v_expected_revision THEN
        RETURN jsonb_build_object('state', 'conflict');
    END IF;

    v_commit_revision := v_head_revision + 1;
    v_insert := format(
        'INSERT INTO semantic_operation (namespace, operation_id, intent_digest, result, commit_revision) VALUES (%L, %L, %L, %L::jsonb, %s)',
        v_namespace,
        v_operation_id,
        v_intent_digest,
        v_result::text,
        v_commit_revision
    );
    PERFORM dblink_connect(v_conn, 'dbname=' || current_database());
    PERFORM dblink_exec(v_conn, v_insert);
    PERFORM dblink_disconnect(v_conn);

    FOR v_record IN SELECT value FROM jsonb_array_elements(v_records)
    LOOP
        INSERT INTO semantic_record (
            namespace, operation_id, record_id, kind, payload, commit_revision
        ) VALUES (
            v_namespace,
            v_operation_id,
            v_record->>'record_id',
            v_record->>'kind',
            v_record->'payload',
            v_commit_revision
        );
    END LOOP;

    FOR v_effect IN SELECT value FROM jsonb_array_elements(v_effects)
    LOOP
        INSERT INTO effect_request (
            namespace,
            operation_id,
            request_id,
            effect_definition_ref,
            intent_digest,
            payload,
            commit_revision
        ) VALUES (
            v_namespace,
            v_operation_id,
            v_effect->>'request_id',
            v_effect->>'effect_definition_ref',
            v_effect->>'intent_digest',
            v_effect->'payload',
            v_commit_revision
        );
    END LOOP;

    UPDATE semantic_head
    SET revision = v_commit_revision
    WHERE namespace = v_namespace;

    RETURN jsonb_build_object(
        'state', 'committed',
        'namespace', v_namespace,
        'operation_id', v_operation_id,
        'commit_revision', v_commit_revision,
        'result', v_result
    );
END;
$fn$;
