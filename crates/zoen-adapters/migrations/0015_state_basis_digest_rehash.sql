-- Length-prefixed fields match zoen-engine hash_field (8-byte BE UTF-8 length + bytes).
-- sha256 is PostgreSQL 18 built-in.

CREATE FUNCTION zoen_tmp_state_basis_field(value TEXT)
RETURNS BYTEA
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
    SELECT decode(
        lpad(to_hex(octet_length(convert_to(value, 'UTF8'))::BIGINT), 16, '0'),
        'hex'
    ) || convert_to(value, 'UTF8');
$$;

CREATE FUNCTION zoen_tmp_state_basis_digest_current(deps BYTEA)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT encode(sha256(COALESCE(deps, ''::BYTEA)), 'hex');
$$;

CREATE FUNCTION zoen_tmp_proposal_deps_current(p_tenant TEXT, p_proposal TEXT)
RETURNS BYTEA
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    payload BYTEA := ''::BYTEA;
    dep RECORD;
BEGIN
    FOR dep IN
        SELECT
            claim_id,
            commit_sequence::TEXT AS commit_sequence,
            entity_id,
            relation_id,
            role,
            source_digest,
            source_id,
            source_ref
        FROM action_proposal_dependencies
        WHERE tenant_id = p_tenant
          AND proposal_id = p_proposal
        ORDER BY ordinal
    LOOP
        payload := payload
            || zoen_tmp_state_basis_field(dep.claim_id)
            || zoen_tmp_state_basis_field(dep.commit_sequence)
            || zoen_tmp_state_basis_field(dep.entity_id)
            || zoen_tmp_state_basis_field(dep.relation_id)
            || zoen_tmp_state_basis_field(dep.role)
            || zoen_tmp_state_basis_field(dep.source_digest)
            || zoen_tmp_state_basis_field(dep.source_id)
            || zoen_tmp_state_basis_field(dep.source_ref);
    END LOOP;
    RETURN payload;
END;
$$;

CREATE FUNCTION zoen_tmp_proposal_deps_legacy(p_tenant TEXT, p_proposal TEXT)
RETURNS BYTEA
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    payload BYTEA := ''::BYTEA;
    dep RECORD;
BEGIN
    FOR dep IN
        SELECT
            claim_id,
            commit_sequence::TEXT AS commit_sequence,
            entity_id,
            relation_id,
            source_digest
        FROM action_proposal_dependencies
        WHERE tenant_id = p_tenant
          AND proposal_id = p_proposal
        ORDER BY ordinal
    LOOP
        payload := payload
            || zoen_tmp_state_basis_field(dep.claim_id)
            || zoen_tmp_state_basis_field(dep.commit_sequence)
            || zoen_tmp_state_basis_field(dep.entity_id)
            || zoen_tmp_state_basis_field(dep.relation_id)
            || zoen_tmp_state_basis_field(dep.source_digest);
    END LOOP;
    RETURN payload;
END;
$$;

CREATE FUNCTION zoen_tmp_operation_deps_current(p_tenant TEXT, p_operation TEXT)
RETURNS BYTEA
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    payload BYTEA := ''::BYTEA;
    dep RECORD;
BEGIN
    FOR dep IN
        SELECT
            claim_id,
            commit_sequence::TEXT AS commit_sequence,
            entity_id,
            relation_id,
            role,
            source_digest,
            source_id,
            source_ref
        FROM action_operation_dependencies
        WHERE tenant_id = p_tenant
          AND operation_id = p_operation
        ORDER BY ordinal
    LOOP
        payload := payload
            || zoen_tmp_state_basis_field(dep.claim_id)
            || zoen_tmp_state_basis_field(dep.commit_sequence)
            || zoen_tmp_state_basis_field(dep.entity_id)
            || zoen_tmp_state_basis_field(dep.relation_id)
            || zoen_tmp_state_basis_field(dep.role)
            || zoen_tmp_state_basis_field(dep.source_digest)
            || zoen_tmp_state_basis_field(dep.source_id)
            || zoen_tmp_state_basis_field(dep.source_ref);
    END LOOP;
    RETURN payload;
END;
$$;

CREATE FUNCTION zoen_tmp_operation_deps_legacy(p_tenant TEXT, p_operation TEXT)
RETURNS BYTEA
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    payload BYTEA := ''::BYTEA;
    dep RECORD;
BEGIN
    FOR dep IN
        SELECT
            claim_id,
            commit_sequence::TEXT AS commit_sequence,
            entity_id,
            relation_id,
            source_digest
        FROM action_operation_dependencies
        WHERE tenant_id = p_tenant
          AND operation_id = p_operation
        ORDER BY ordinal
    LOOP
        payload := payload
            || zoen_tmp_state_basis_field(dep.claim_id)
            || zoen_tmp_state_basis_field(dep.commit_sequence)
            || zoen_tmp_state_basis_field(dep.entity_id)
            || zoen_tmp_state_basis_field(dep.relation_id)
            || zoen_tmp_state_basis_field(dep.source_digest);
    END LOOP;
    RETURN payload;
END;
$$;

ALTER TABLE action_proposals DISABLE TRIGGER action_proposals_are_immutable;
ALTER TABLE action_operations DISABLE TRIGGER action_operations_are_immutable;

ALTER TABLE action_proposals DISABLE ROW LEVEL SECURITY;
ALTER TABLE action_proposal_dependencies DISABLE ROW LEVEL SECURITY;
ALTER TABLE action_operations DISABLE ROW LEVEL SECURITY;
ALTER TABLE action_operation_dependencies DISABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    row RECORD;
    current_digest TEXT;
    legacy_digest TEXT;
    rewritten BIGINT := 0;
BEGIN
    FOR row IN
        SELECT tenant_id, proposal_id, state_basis_digest
        FROM action_proposals
    LOOP
        current_digest := zoen_tmp_state_basis_digest_current(
            zoen_tmp_proposal_deps_current(row.tenant_id, row.proposal_id)
        );
        IF row.state_basis_digest = current_digest THEN
            CONTINUE;
        END IF;
        legacy_digest := zoen_tmp_state_basis_digest_current(
            zoen_tmp_proposal_deps_legacy(row.tenant_id, row.proposal_id)
        );
        IF row.state_basis_digest <> legacy_digest THEN
            RAISE EXCEPTION
                'action_proposals %.% state_basis_digest matches neither current nor legacy hasher',
                row.tenant_id,
                row.proposal_id;
        END IF;
        UPDATE action_proposals
        SET state_basis_digest = current_digest
        WHERE tenant_id = row.tenant_id
          AND proposal_id = row.proposal_id;
        rewritten := rewritten + 1;
    END LOOP;

    FOR row IN
        SELECT tenant_id, operation_id, state_basis_digest
        FROM action_operations
        WHERE state_basis_digest IS NOT NULL
    LOOP
        current_digest := zoen_tmp_state_basis_digest_current(
            zoen_tmp_operation_deps_current(row.tenant_id, row.operation_id)
        );
        IF row.state_basis_digest = current_digest THEN
            CONTINUE;
        END IF;
        legacy_digest := zoen_tmp_state_basis_digest_current(
            zoen_tmp_operation_deps_legacy(row.tenant_id, row.operation_id)
        );
        IF row.state_basis_digest <> legacy_digest THEN
            RAISE EXCEPTION
                'action_operations %.% state_basis_digest matches neither current nor legacy hasher',
                row.tenant_id,
                row.operation_id;
        END IF;
        UPDATE action_operations
        SET state_basis_digest = current_digest
        WHERE tenant_id = row.tenant_id
          AND operation_id = row.operation_id;
        rewritten := rewritten + 1;
    END LOOP;

    RAISE NOTICE 'state_basis digest rehash rewrote % row(s)', rewritten;
END $$;

DO $$
DECLARE
    mismatch BIGINT;
BEGIN
    SELECT count(*) INTO mismatch
    FROM action_proposals AS proposal
    WHERE proposal.state_basis_digest
        <> zoen_tmp_state_basis_digest_current(
            zoen_tmp_proposal_deps_current(proposal.tenant_id, proposal.proposal_id)
        );
    IF mismatch <> 0 THEN
        RAISE EXCEPTION
            'state_basis rehash proof failed: % proposal digest(s) still off current hasher',
            mismatch;
    END IF;

    SELECT count(*) INTO mismatch
    FROM action_operations AS operation
    WHERE operation.state_basis_digest IS NOT NULL
      AND operation.state_basis_digest
        <> zoen_tmp_state_basis_digest_current(
            zoen_tmp_operation_deps_current(operation.tenant_id, operation.operation_id)
        );
    IF mismatch <> 0 THEN
        RAISE EXCEPTION
            'state_basis rehash proof failed: % operation digest(s) still off current hasher',
            mismatch;
    END IF;

    SELECT count(*) INTO mismatch
    FROM action_proposals AS proposal
    WHERE proposal.state_basis_digest
        = zoen_tmp_state_basis_digest_current(
            zoen_tmp_proposal_deps_legacy(proposal.tenant_id, proposal.proposal_id)
        )
      AND proposal.state_basis_digest
        <> zoen_tmp_state_basis_digest_current(
            zoen_tmp_proposal_deps_current(proposal.tenant_id, proposal.proposal_id)
        );
    IF mismatch <> 0 THEN
        RAISE EXCEPTION
            'state_basis rehash proof failed: % proposal digest(s) still legacy-only',
            mismatch;
    END IF;

    SELECT count(*) INTO mismatch
    FROM action_operations AS operation
    WHERE operation.state_basis_digest IS NOT NULL
      AND operation.state_basis_digest
        = zoen_tmp_state_basis_digest_current(
            zoen_tmp_operation_deps_legacy(operation.tenant_id, operation.operation_id)
        )
      AND operation.state_basis_digest
        <> zoen_tmp_state_basis_digest_current(
            zoen_tmp_operation_deps_current(operation.tenant_id, operation.operation_id)
        );
    IF mismatch <> 0 THEN
        RAISE EXCEPTION
            'state_basis rehash proof failed: % operation digest(s) still legacy-only',
            mismatch;
    END IF;
END $$;

ALTER TABLE action_operation_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_operation_dependencies FORCE ROW LEVEL SECURITY;
ALTER TABLE action_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_operations FORCE ROW LEVEL SECURITY;
ALTER TABLE action_proposal_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_proposal_dependencies FORCE ROW LEVEL SECURITY;
ALTER TABLE action_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_proposals FORCE ROW LEVEL SECURITY;

ALTER TABLE action_operations ENABLE TRIGGER action_operations_are_immutable;
ALTER TABLE action_proposals ENABLE TRIGGER action_proposals_are_immutable;

DROP FUNCTION zoen_tmp_operation_deps_legacy(TEXT, TEXT);
DROP FUNCTION zoen_tmp_operation_deps_current(TEXT, TEXT);
DROP FUNCTION zoen_tmp_proposal_deps_legacy(TEXT, TEXT);
DROP FUNCTION zoen_tmp_proposal_deps_current(TEXT, TEXT);
DROP FUNCTION zoen_tmp_state_basis_digest_current(BYTEA);
DROP FUNCTION zoen_tmp_state_basis_field(TEXT);
