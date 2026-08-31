use crate::{
    ClaimId, CommitSequence, DefinitionDigest, DefinitionId, DefinitionImpactArea,
    DefinitionReference, EntityId, EvidenceDraft, EvolutionClassification, IntentDigest,
    MigrationRuleId, OperationId, RelationId,
};

#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub struct MigrationElement {
    pub element: crate::DefinitionElementKind,
    pub id: String,
}

#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub struct MigrationArtifactDependency {
    pub area: DefinitionImpactArea,
    pub id: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MigrationRuleKind {
    PreserveMeaning,
    Recompute,
    Supersede,
    Transform,
}

impl MigrationRuleKind {
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::PreserveMeaning => "preserve_meaning",
            Self::Recompute => "recompute",
            Self::Supersede => "supersede",
            Self::Transform => "transform",
        }
    }

    #[must_use]
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "preserve_meaning" => Some(Self::PreserveMeaning),
            "recompute" => Some(Self::Recompute),
            "supersede" => Some(Self::Supersede),
            "transform" => Some(Self::Transform),
            _ => None,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MigrationRule {
    pub id: MigrationRuleId,
    pub kind: MigrationRuleKind,
    pub sources: Vec<MigrationElement>,
    pub targets: Vec<MigrationElement>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MigrationDependency {
    pub claim_id: ClaimId,
    pub commit_sequence: CommitSequence,
    pub entity_id: EntityId,
    pub relation_id: RelationId,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MigrationPostcondition {
    pub minimum_record_count: u64,
    pub relation_id: RelationId,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MigrationRecipe {
    pub definition_id: DefinitionId,
    pub dependencies: Vec<MigrationDependency>,
    pub format_version: u32,
    pub from_digest: DefinitionDigest,
    pub operation_id: OperationId,
    pub postconditions: Vec<MigrationPostcondition>,
    pub rules: Vec<MigrationRule>,
    pub to_digest: DefinitionDigest,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MigrationObligationSource {
    pub kind: MigrationRuleKind,
    pub relation_id: RelationId,
    pub rule_id: MigrationRuleId,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MigrationPlan {
    pub affected_elements: Vec<MigrationElement>,
    pub artifact_dependencies: Vec<MigrationArtifactDependency>,
    pub assessment_digest: IntentDigest,
    pub classification: EvolutionClassification,
    pub dependencies: Vec<MigrationDependency>,
    pub format_version: u32,
    pub from: DefinitionReference,
    pub obligation_sources: Vec<MigrationObligationSource>,
    pub operation_id: OperationId,
    pub postconditions: Vec<MigrationPostcondition>,
    pub rules: Vec<MigrationRule>,
    pub to: DefinitionReference,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MigrationRecord {
    pub rule_id: MigrationRuleId,
    pub source_claim_ids: Vec<ClaimId>,
    pub target: EvidenceDraft,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MigrationLineage {
    pub kind: MigrationRuleKind,
    pub rule_id: MigrationRuleId,
    pub source_claim_ids: Vec<ClaimId>,
    pub target_claim_id: ClaimId,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MigrationOrigin {
    pub kind: MigrationRuleKind,
    pub operation_id: OperationId,
    pub rule_id: MigrationRuleId,
    pub source_claim_ids: Vec<ClaimId>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MigrationObligation {
    pub kind: MigrationRuleKind,
    pub relation_id: RelationId,
    pub rule_id: MigrationRuleId,
    pub source_claim_id: ClaimId,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MigrationStatus {
    InProgress,
    Prepared,
    Completed,
}

impl MigrationStatus {
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::InProgress => "in_progress",
            Self::Prepared => "prepared",
            Self::Completed => "completed",
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MigrationProgress {
    pub commit_sequence: CommitSequence,
    pub completed_batches: Vec<u32>,
    pub intent_digest: IntentDigest,
    pub lineage: Vec<MigrationLineage>,
    pub plan: MigrationPlan,
    pub remaining_obligations: Vec<MigrationObligation>,
    pub status: MigrationStatus,
    pub total_obligations: u64,
}
