use sha2::{Digest, Sha256};
use zoen_core::{
    EvidenceClaim, EvidenceDraft, ExactValue, IntentDigest, TimestampMicros, ValidTime, WorldId,
};

use crate::StoreError;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvidenceOperation {
    pub claims: Vec<EvidenceClaim>,
    pub intent_digest: IntentDigest,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum EvidenceWritePlan {
    Admit,
    Replay(Vec<EvidenceClaim>),
}

pub(crate) fn stamp_ingested_at(draft: &mut EvidenceDraft, ingested_at: TimestampMicros) {
    draft.provenance.ingested_at = Some(ingested_at);
}

pub(crate) fn evidence_intent_digest(
    world_id: &WorldId,
    drafts: &[EvidenceDraft],
) -> Result<IntentDigest, String> {
    let mut hasher = Sha256::new();
    hash_field(&mut hasher, world_id.as_str());
    hash_field(&mut hasher, &drafts.len().to_string());
    for draft in drafts {
        hash_draft(&mut hasher, draft);
    }
    IntentDigest::parse(zoen_core::encode_hex(hasher.finalize().as_ref()))
        .map_err(|error| error.to_string())
}

pub(crate) fn evidence_write_plan(
    existing: Option<&EvidenceOperation>,
    intent_digest: &IntentDigest,
) -> Result<EvidenceWritePlan, StoreError> {
    match existing {
        None => Ok(EvidenceWritePlan::Admit),
        Some(operation) if operation.intent_digest == *intent_digest => {
            Ok(EvidenceWritePlan::Replay(operation.claims.clone()))
        }
        Some(_) => Err(StoreError::OperationMismatch),
    }
}

fn hash_draft(hasher: &mut Sha256, draft: &EvidenceDraft) {
    hash_field(hasher, draft.claim_id.as_str());
    hash_field(hasher, draft.definition.definition_id.as_str());
    hash_field(hasher, draft.definition.digest.as_str());
    hash_field(hasher, &draft.definition.revision.get().to_string());
    hash_field(hasher, draft.entity_id.as_str());
    hash_field(hasher, draft.relation_id.as_str());
    hash_field(hasher, &value_key(&draft.value));
    hash_valid_time(hasher, &draft.valid_time);
    hash_field(hasher, draft.provenance.source_id.as_str());
    hash_field(hasher, draft.provenance.source_digest.as_str());
    hash_field(hasher, &draft.provenance.source_ref);
    hash_optional_time(hasher, draft.provenance.observed_at);
}

fn hash_valid_time(hasher: &mut Sha256, valid_time: &ValidTime) {
    match valid_time {
        ValidTime::Instant(at) => {
            hash_field(hasher, "instant");
            hash_field(hasher, &at.get().to_string());
        }
        ValidTime::Interval { start, end } => {
            hash_field(hasher, "interval");
            hash_field(hasher, &start.get().to_string());
            hash_field(hasher, &end.get().to_string());
        }
    }
}

fn hash_optional_time(hasher: &mut Sha256, value: Option<TimestampMicros>) {
    match value {
        Some(at) => hash_field(hasher, &at.get().to_string()),
        None => hash_field(hasher, ""),
    }
}

fn value_key(value: &ExactValue) -> String {
    match value {
        ExactValue::Bool(value) => format!("bool:{value}"),
        ExactValue::Decimal(value) => format!("decimal:{}", value.as_str()),
        ExactValue::Entity(value) => format!("entity:{}", value.as_str()),
        ExactValue::Integer(value) => format!("integer:{}", value.as_str()),
        ExactValue::Quantity { amount, unit } => {
            format!("quantity:{}:{}", amount.as_str(), unit.as_str())
        }
        ExactValue::Text(value) => format!("text:{value}"),
    }
}

fn hash_field(hasher: &mut Sha256, value: &str) {
    hasher.update(value.len().to_be_bytes());
    hasher.update(value.as_bytes());
}

#[cfg(test)]
mod tests {
    use zoen_core::{
        ClaimId, CommitSequence, DefinitionDigest, DefinitionId, DefinitionReference,
        DefinitionRevisionNumber, EntityId, EvidenceClaim, EvidenceDigest, EvidenceDraft,
        EvidenceProvenance, ExactInteger, ExactValue, RelationId, SourceId, TimestampMicros,
        ValidTime, WorldId,
    };

    use super::{
        EvidenceOperation, EvidenceWritePlan, evidence_intent_digest, evidence_write_plan,
        stamp_ingested_at,
    };
    use crate::StoreError;

    const ZERO_DIGEST: &str = "0000000000000000000000000000000000000000000000000000000000000000";

    #[test]
    fn ingested_at_is_server_stamped() {
        let mut draft = sample_draft();
        draft.provenance.ingested_at = Some(TimestampMicros::new(1));
        stamp_ingested_at(&mut draft, TimestampMicros::new(99));
        assert_eq!(draft.provenance.ingested_at, Some(TimestampMicros::new(99)));
    }

    #[test]
    fn record_evidence_replays_same_operation_intent() {
        let draft = sample_draft();
        let intent =
            evidence_intent_digest(&tenant(), std::slice::from_ref(&draft)).expect("digest");
        let claim = EvidenceClaim {
            commit_sequence: CommitSequence::new(7).expect("commit"),
            draft,
        };
        let existing = EvidenceOperation {
            claims: vec![claim.clone()],
            intent_digest: intent.clone(),
        };
        match evidence_write_plan(Some(&existing), &intent).expect("replay") {
            EvidenceWritePlan::Replay(replayed) => {
                assert_eq!(replayed[0].draft.claim_id, claim.draft.claim_id);
                assert_eq!(replayed[0].commit_sequence, claim.commit_sequence);
            }
            EvidenceWritePlan::Admit => panic!("same intent must replay"),
        }
    }

    #[test]
    fn record_evidence_rejects_operation_intent_mismatch() {
        let original = sample_draft();
        let intent =
            evidence_intent_digest(&tenant(), std::slice::from_ref(&original)).expect("digest");
        let existing = EvidenceOperation {
            claims: vec![EvidenceClaim {
                commit_sequence: CommitSequence::new(7).expect("commit"),
                draft: original,
            }],
            intent_digest: intent,
        };
        let mut other = sample_draft();
        other.value = ExactValue::Integer(ExactInteger::parse("21").expect("integer"));
        let other_intent =
            evidence_intent_digest(&tenant(), std::slice::from_ref(&other)).expect("digest");
        let error = evidence_write_plan(Some(&existing), &other_intent)
            .expect_err("different intent is a typed mismatch");
        assert_eq!(error, StoreError::OperationMismatch);
    }

    #[test]
    fn evidence_intent_digest_ignores_ingested_at() {
        let mut first = sample_draft();
        first.provenance.ingested_at = Some(TimestampMicros::new(1));
        let mut second = first.clone();
        second.provenance.ingested_at = Some(TimestampMicros::new(99));
        assert_eq!(
            evidence_intent_digest(&tenant(), std::slice::from_ref(&first)).expect("first"),
            evidence_intent_digest(&tenant(), std::slice::from_ref(&second)).expect("second")
        );
        assert!(first.same_intent(&second));
    }

    fn tenant() -> WorldId {
        WorldId::parse("tenant.test").expect("tenant")
    }

    fn sample_draft() -> EvidenceDraft {
        EvidenceDraft {
            claim_id: ClaimId::parse("claim.world.available").expect("claim"),
            definition: DefinitionReference {
                definition_id: DefinitionId::parse("world.definition").expect("definition"),
                digest: DefinitionDigest::parse(ZERO_DIGEST).expect("digest"),
                revision: DefinitionRevisionNumber::new(1).expect("revision"),
            },
            entity_id: EntityId::parse("inventory.item.1").expect("entity"),
            provenance: EvidenceProvenance {
                ingested_at: None,
                observed_at: None,
                source_digest: EvidenceDigest::parse(ZERO_DIGEST).expect("source digest"),
                source_id: SourceId::parse("source.world").expect("source"),
                source_ref: "world fixture".to_owned(),
            },
            relation_id: RelationId::parse("inventory.available").expect("relation"),
            valid_time: ValidTime::instant(TimestampMicros::new(1)),
            value: ExactValue::Integer(ExactInteger::parse("20").expect("integer")),
        }
    }
}
