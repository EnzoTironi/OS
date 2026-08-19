ALTER TABLE authority_commits
DROP CONSTRAINT authority_commits_commit_kind_check;

ALTER TABLE authority_commits
ADD CONSTRAINT authority_commits_commit_kind_check
CHECK (
    commit_kind IN (
        'definition_publication',
        'evidence',
        'action',
        'effect_attempt',
        'effect_reconciliation',
        'definition_activation'
    )
);

CREATE TABLE definition_activations (
    tenant_id TEXT NOT NULL,
    definition_id TEXT NOT NULL,
    revision BIGINT NOT NULL CHECK (revision > 0),
    digest CHAR(64) NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
    previous_revision BIGINT CHECK (previous_revision > 0),
    previous_digest CHAR(64) CHECK (previous_digest ~ '^[0-9a-f]{64}$'),
    commit_sequence BIGINT NOT NULL CHECK (commit_sequence > 0),
    activated_at_micros BIGINT NOT NULL,
    actor_id TEXT NOT NULL,
    principal_id TEXT NOT NULL,
    workload_id TEXT NOT NULL,
    policy_id TEXT NOT NULL,
    policy_revision BIGINT NOT NULL CHECK (policy_revision > 0),
    policy_digest CHAR(64) NOT NULL CHECK (policy_digest ~ '^[0-9a-f]{64}$'),
    determining_policies TEXT[] NOT NULL,
    classification TEXT CHECK (
        classification IN ('compatible', 'requires_migration', 'breaking', 'forbidden')
    ),
    PRIMARY KEY (tenant_id, definition_id, commit_sequence),
    UNIQUE (tenant_id, commit_sequence),
    UNIQUE (tenant_id, definition_id, digest, revision, commit_sequence),
    CHECK ((previous_revision IS NULL) = (previous_digest IS NULL)),
    FOREIGN KEY (tenant_id, commit_sequence)
        REFERENCES authority_commits (tenant_id, commit_sequence),
    FOREIGN KEY (tenant_id, definition_id, digest, revision)
        REFERENCES definition_revisions (tenant_id, definition_id, digest, revision),
    FOREIGN KEY (tenant_id, definition_id, previous_digest, previous_revision)
        REFERENCES definition_revisions (tenant_id, definition_id, digest, revision)
);

CREATE TABLE definition_activation_grants (
    tenant_id TEXT NOT NULL,
    commit_sequence BIGINT NOT NULL CHECK (commit_sequence > 0),
    ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
    delegation_id TEXT NOT NULL,
    action_ids TEXT[] NOT NULL CHECK (cardinality(action_ids) > 0),
    resource_ids TEXT[] NOT NULL CHECK (cardinality(resource_ids) > 0),
    workload_ids TEXT[] NOT NULL CHECK (cardinality(workload_ids) > 0),
    not_before_micros BIGINT NOT NULL,
    expires_at_micros BIGINT NOT NULL,
    PRIMARY KEY (tenant_id, commit_sequence, ordinal),
    FOREIGN KEY (tenant_id, commit_sequence)
        REFERENCES definition_activations (tenant_id, commit_sequence)
);

CREATE TABLE active_definition_revisions (
    tenant_id TEXT NOT NULL,
    definition_id TEXT NOT NULL,
    revision BIGINT NOT NULL CHECK (revision > 0),
    digest CHAR(64) NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
    activation_commit_sequence BIGINT NOT NULL CHECK (activation_commit_sequence > 0),
    PRIMARY KEY (tenant_id, definition_id),
    UNIQUE (tenant_id, activation_commit_sequence),
    FOREIGN KEY (tenant_id, definition_id, digest, revision)
        REFERENCES definition_revisions (tenant_id, definition_id, digest, revision),
    FOREIGN KEY (
        tenant_id,
        definition_id,
        digest,
        revision,
        activation_commit_sequence
    ) REFERENCES definition_activations (
        tenant_id,
        definition_id,
        digest,
        revision,
        commit_sequence
    )
);

CREATE FUNCTION reject_definition_activation_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'definition activation history is immutable';
END;
$$;

CREATE TRIGGER definition_activations_are_immutable
BEFORE UPDATE OR DELETE ON definition_activations
FOR EACH ROW
EXECUTE FUNCTION reject_definition_activation_mutation();

CREATE TRIGGER definition_activation_grants_are_immutable
BEFORE UPDATE OR DELETE ON definition_activation_grants
FOR EACH ROW
EXECUTE FUNCTION reject_definition_activation_mutation();

ALTER TABLE definition_activations ENABLE ROW LEVEL SECURITY;
ALTER TABLE definition_activations FORCE ROW LEVEL SECURITY;
CREATE POLICY definition_activations_tenant_policy ON definition_activations
    USING (tenant_id = current_setting('zoen.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('zoen.tenant_id', true));

ALTER TABLE definition_activation_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE definition_activation_grants FORCE ROW LEVEL SECURITY;
CREATE POLICY definition_activation_grants_tenant_policy ON definition_activation_grants
    USING (tenant_id = current_setting('zoen.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('zoen.tenant_id', true));

ALTER TABLE active_definition_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_definition_revisions FORCE ROW LEVEL SECURITY;
CREATE POLICY active_definition_revisions_tenant_policy ON active_definition_revisions
    USING (tenant_id = current_setting('zoen.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('zoen.tenant_id', true));
