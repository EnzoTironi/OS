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
    v_existing semantic_operation%ROWTYPE;
    v_head_revision bigint;
    v_commit_revision bigint;
    v_record jsonb;
    v_effect jsonb;
BEGIN
    PERFORM pg_advisory_xact_lock(
        hashtext('semantic_operation'),
        hashtext(v_namespace || chr(31) || v_operation_id)
    );

    SELECT * INTO v_existing
    FROM semantic_operation
    WHERE namespace = v_namespace
      AND operation_id = v_operation_id;
    IF FOUND THEN
        RETURN jsonb_build_object(
            'state', 'replayed',
            'namespace', v_existing.namespace,
            'operation_id', v_existing.operation_id,
            'commit_revision', v_existing.commit_revision,
            'result', v_existing.result
        );
    END IF;

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

    INSERT INTO semantic_operation (
        namespace, operation_id, intent_digest, result, commit_revision
    ) VALUES (
        v_namespace, v_operation_id, v_intent_digest, v_result, v_commit_revision
    );

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
