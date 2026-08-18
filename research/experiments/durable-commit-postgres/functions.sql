CREATE OR REPLACE FUNCTION commit_semantic_operation(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $fn$
DECLARE
    v_namespace text;
    v_operation_id text;
    v_intent_digest text;
    v_expected_revision bigint;
    v_result jsonb;
    v_records jsonb;
    v_effects jsonb;
    v_existing semantic_operation%ROWTYPE;
    v_head_revision bigint;
    v_commit_revision bigint;
    v_record jsonb;
    v_effect jsonb;
    v_record_ids text[];
    v_effect_ids text[];
    v_digest_re constant text := '^sha256:[0-9a-f]{64}$';
BEGIN
    IF payload IS NULL OR jsonb_typeof(payload) <> 'object' THEN
        RAISE EXCEPTION 'malformed_payload:root'
            USING ERRCODE = '22023';
    END IF;

    IF jsonb_typeof(payload->'protocol_version') <> 'number'
       OR (payload->>'protocol_version') NOT IN ('1', '1.0') THEN
        RAISE EXCEPTION 'malformed_payload:protocol_version'
            USING ERRCODE = '22023';
    END IF;

    v_namespace := payload->>'namespace';
    v_operation_id := payload->>'operation_id';
    v_intent_digest := payload->>'intent_digest';
    v_result := payload->'result';
    v_records := payload->'records';
    v_effects := payload->'effect_requests';

    IF v_namespace IS NULL OR v_namespace = ''
       OR v_operation_id IS NULL OR v_operation_id = ''
       OR v_intent_digest IS NULL
       OR jsonb_typeof(payload->'expected_revision') <> 'number'
       OR v_result IS NULL OR jsonb_typeof(v_result) <> 'object'
       OR v_records IS NULL OR jsonb_typeof(v_records) <> 'array'
       OR v_effects IS NULL OR jsonb_typeof(v_effects) <> 'array' THEN
        RAISE EXCEPTION 'malformed_payload:required'
            USING ERRCODE = '22023';
    END IF;

    IF (payload->>'expected_revision') ~ '\.' THEN
        RAISE EXCEPTION 'malformed_payload:expected_revision'
            USING ERRCODE = '22023';
    END IF;
    v_expected_revision := (payload->>'expected_revision')::bigint;
    IF v_expected_revision < 0 THEN
        RAISE EXCEPTION 'malformed_payload:expected_revision'
            USING ERRCODE = '22023';
    END IF;

    IF v_intent_digest !~ v_digest_re THEN
        RAISE EXCEPTION 'malformed_payload:intent_digest'
            USING ERRCODE = '22023';
    END IF;

    v_record_ids := ARRAY[]::text[];
    FOR v_record IN SELECT value FROM jsonb_array_elements(v_records)
    LOOP
        IF jsonb_typeof(v_record) <> 'object'
           OR coalesce(v_record->>'record_id', '') = ''
           OR coalesce(v_record->>'kind', '') = ''
           OR v_record->'payload' IS NULL
           OR jsonb_typeof(v_record->'payload') <> 'object' THEN
            RAISE EXCEPTION 'malformed_payload:record'
                USING ERRCODE = '22023';
        END IF;
        IF v_record->>'record_id' = ANY (v_record_ids) THEN
            RAISE EXCEPTION 'duplicate_record_id'
                USING ERRCODE = '22023';
        END IF;
        v_record_ids := array_append(v_record_ids, v_record->>'record_id');
    END LOOP;

    v_effect_ids := ARRAY[]::text[];
    FOR v_effect IN SELECT value FROM jsonb_array_elements(v_effects)
    LOOP
        IF jsonb_typeof(v_effect) <> 'object'
           OR coalesce(v_effect->>'request_id', '') = ''
           OR coalesce(v_effect->>'effect_definition_ref', '') = ''
           OR coalesce(v_effect->>'intent_digest', '') = ''
           OR v_effect->'payload' IS NULL
           OR jsonb_typeof(v_effect->'payload') <> 'object' THEN
            RAISE EXCEPTION 'malformed_payload:effect_request'
                USING ERRCODE = '22023';
        END IF;
        IF v_effect->>'intent_digest' !~ v_digest_re THEN
            RAISE EXCEPTION 'malformed_payload:effect_intent_digest'
                USING ERRCODE = '22023';
        END IF;
        IF v_effect->>'request_id' = ANY (v_effect_ids) THEN
            RAISE EXCEPTION 'duplicate_effect_id'
                USING ERRCODE = '22023';
        END IF;
        v_effect_ids := array_append(v_effect_ids, v_effect->>'request_id');
    END LOOP;

    PERFORM pg_advisory_xact_lock(
        hashtext('semantic_operation'),
        hashtext(v_namespace || chr(31) || v_operation_id)
    );

    SELECT * INTO v_existing
    FROM semantic_operation
    WHERE namespace = v_namespace
      AND operation_id = v_operation_id;

    IF FOUND THEN
        IF v_existing.intent_digest = v_intent_digest THEN
            RETURN jsonb_build_object(
                'state', 'replayed',
                'namespace', v_existing.namespace,
                'operation_id', v_existing.operation_id,
                'commit_revision', v_existing.commit_revision,
                'result', v_existing.result,
                'record_ids', (
                    SELECT coalesce(jsonb_agg(record_id ORDER BY record_id), '[]'::jsonb)
                    FROM semantic_record
                    WHERE namespace = v_existing.namespace
                      AND operation_id = v_existing.operation_id
                ),
                'effect_request_ids', (
                    SELECT coalesce(jsonb_agg(request_id ORDER BY request_id), '[]'::jsonb)
                    FROM effect_request
                    WHERE namespace = v_existing.namespace
                      AND operation_id = v_existing.operation_id
                )
            );
        END IF;
        RETURN jsonb_build_object(
            'state', 'intent_mismatch',
            'namespace', v_namespace,
            'operation_id', v_operation_id
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
        RETURN jsonb_build_object(
            'state', 'conflict',
            'namespace', v_namespace,
            'operation_id', v_operation_id
        );
    END IF;

    v_commit_revision := v_head_revision + 1;

    INSERT INTO semantic_operation (
        namespace,
        operation_id,
        intent_digest,
        result,
        commit_revision
    ) VALUES (
        v_namespace,
        v_operation_id,
        v_intent_digest,
        v_result,
        v_commit_revision
    );

    FOR v_record IN SELECT value FROM jsonb_array_elements(v_records)
    LOOP
        INSERT INTO semantic_record (
            namespace,
            operation_id,
            record_id,
            kind,
            payload,
            commit_revision
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
        'result', v_result,
        'record_ids', to_jsonb(v_record_ids),
        'effect_request_ids', to_jsonb(v_effect_ids)
    );
END;
$fn$;

CREATE OR REPLACE FUNCTION semantic_operation_status(
    p_namespace text,
    p_operation_id text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $fn$
DECLARE
    v_existing semantic_operation%ROWTYPE;
BEGIN
    IF p_namespace IS NULL OR p_namespace = ''
       OR p_operation_id IS NULL OR p_operation_id = '' THEN
        RAISE EXCEPTION 'malformed_payload:status_identity'
            USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_existing
    FROM semantic_operation
    WHERE namespace = p_namespace
      AND operation_id = p_operation_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'found', false,
            'namespace', p_namespace,
            'operation_id', p_operation_id
        );
    END IF;

    RETURN jsonb_build_object(
        'found', true,
        'state', 'committed',
        'namespace', v_existing.namespace,
        'operation_id', v_existing.operation_id,
        'intent_digest', v_existing.intent_digest,
        'commit_revision', v_existing.commit_revision,
        'result', v_existing.result,
        'record_ids', (
            SELECT coalesce(jsonb_agg(record_id ORDER BY record_id), '[]'::jsonb)
            FROM semantic_record
            WHERE namespace = v_existing.namespace
              AND operation_id = v_existing.operation_id
        ),
        'effect_request_ids', (
            SELECT coalesce(jsonb_agg(request_id ORDER BY request_id), '[]'::jsonb)
            FROM effect_request
            WHERE namespace = v_existing.namespace
              AND operation_id = v_existing.operation_id
        )
    );
END;
$fn$;
