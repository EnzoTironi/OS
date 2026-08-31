use zoen_core::{
    ExecutionContext, IntentDigest, MigrationProgress, MigrationRuleId, MigrationRuleKind,
    PolicyEvidence, TimestampMicros,
};

use crate::AdmittedEvidence;

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum MigrationBatchPreflight {
    Mismatch,
    Ready,
    Replayed(Box<MigrationProgress>),
}

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
    #[must_use]
    pub fn canonical_plan(&self) -> &str {
        &self.canonical_plan
    }

    #[must_use]
    pub fn context(&self) -> &ExecutionContext {
        &self.context
    }

    #[must_use]
    pub fn intent_digest(&self) -> &IntentDigest {
        &self.intent_digest
    }

    #[must_use]
    pub fn plan(&self) -> &zoen_core::MigrationPlan {
        &self.plan
    }

    #[must_use]
    pub fn policy(&self) -> &PolicyEvidence {
        &self.policy
    }

    #[must_use]
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
    #[must_use]
    pub fn evidence(&self) -> &AdmittedEvidence {
        &self.evidence
    }

    #[must_use]
    pub fn kind(&self) -> MigrationRuleKind {
        self.kind
    }

    #[must_use]
    pub fn rule_id(&self) -> &MigrationRuleId {
        &self.rule_id
    }

    #[must_use]
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
    #[must_use]
    pub fn batch_index(&self) -> u32 {
        self.batch_index
    }

    #[must_use]
    pub fn context(&self) -> &ExecutionContext {
        &self.context
    }

    #[must_use]
    pub fn intent_digest(&self) -> &IntentDigest {
        &self.intent_digest
    }

    #[must_use]
    pub fn migration(&self) -> &MigrationProgress {
        &self.migration
    }

    #[must_use]
    pub fn policy(&self) -> &PolicyEvidence {
        &self.policy
    }

    #[must_use]
    pub fn records(&self) -> &[AdmittedMigrationRecord] {
        &self.records
    }
}
