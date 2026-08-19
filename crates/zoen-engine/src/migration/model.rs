use zoen_core::{
    ExecutionContext, IntentDigest, MigrationProgress, MigrationRuleId, MigrationRuleKind,
    PolicyEvidence, TimestampMicros,
};

use crate::AdmittedEvidence;

#[derive(Clone, Debug)]
pub struct AdmittedMigrationPlan {
    pub(super) canonical_plan: String,
    pub(super) context: ExecutionContext,
    pub(super) intent_digest: IntentDigest,
    pub(super) plan: zoen_core::MigrationPlan,
    pub(super) policy: PolicyEvidence,
    pub(super) prepared_at: TimestampMicros,
}

impl AdmittedMigrationPlan {
    pub fn canonical_plan(&self) -> &str {
        &self.canonical_plan
    }

    pub fn context(&self) -> &ExecutionContext {
        &self.context
    }

    pub fn intent_digest(&self) -> &IntentDigest {
        &self.intent_digest
    }

    pub fn plan(&self) -> &zoen_core::MigrationPlan {
        &self.plan
    }

    pub fn policy(&self) -> &PolicyEvidence {
        &self.policy
    }

    pub fn prepared_at(&self) -> TimestampMicros {
        self.prepared_at
    }
}

#[derive(Clone, Debug)]
pub struct AdmittedMigrationRecord {
    pub(super) evidence: AdmittedEvidence,
    pub(super) kind: MigrationRuleKind,
    pub(super) rule_id: MigrationRuleId,
    pub(super) source_claim_ids: Vec<zoen_core::ClaimId>,
}

impl AdmittedMigrationRecord {
    pub fn evidence(&self) -> &AdmittedEvidence {
        &self.evidence
    }

    pub fn kind(&self) -> MigrationRuleKind {
        self.kind
    }

    pub fn rule_id(&self) -> &MigrationRuleId {
        &self.rule_id
    }

    pub fn source_claim_ids(&self) -> &[zoen_core::ClaimId] {
        &self.source_claim_ids
    }
}

#[derive(Clone, Debug)]
pub struct AdmittedMigrationBatch {
    pub(super) batch_index: u32,
    pub(super) context: ExecutionContext,
    pub(super) intent_digest: IntentDigest,
    pub(super) migration: MigrationProgress,
    pub(super) policy: PolicyEvidence,
    pub(super) records: Vec<AdmittedMigrationRecord>,
}

impl AdmittedMigrationBatch {
    pub fn batch_index(&self) -> u32 {
        self.batch_index
    }

    pub fn context(&self) -> &ExecutionContext {
        &self.context
    }

    pub fn intent_digest(&self) -> &IntentDigest {
        &self.intent_digest
    }

    pub fn migration(&self) -> &MigrationProgress {
        &self.migration
    }

    pub fn policy(&self) -> &PolicyEvidence {
        &self.policy
    }

    pub fn records(&self) -> &[AdmittedMigrationRecord] {
        &self.records
    }
}
