CREATE OR REPLACE FUNCTION semantic_operation_status(
    p_namespace text,
    p_operation_id text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $fn$
BEGIN
    RETURN jsonb_build_object(
        'found', false,
        'namespace', p_namespace,
        'operation_id', p_operation_id
    );
END;
$fn$;
