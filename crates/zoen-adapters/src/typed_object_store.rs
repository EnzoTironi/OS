//! Commit-only materialization for stable `ObjectKey` and temporal `TypeAssignment` state.

use std::collections::BTreeSet;

use serde::Deserialize;
use sha2::{Digest, Sha256};
use sqlx::{Postgres, Row, Transaction};
use zoen_core::{
    EvidenceRef, MembershipId, ObjectKey, PrincipalId, TimestampMicros, TypeAssignment,
    TypeAssignmentAssertion, TypeAssignmentId, TypeId, ValidTime, WorldId, encode_hex,
    type_assignment_assertion_digest,
};
use zoen_engine::KernelError;

use crate::{PostgresWorldKernel, clock_micros};

const TYPE_ASSIGNMENT_DRAFT_SCHEMA: &str = "zoen.type-assignment-draft.v1";

#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
struct PreparedTypedGrant {
    principal: PrincipalId,
    membership: MembershipId,
    object_type: TypeId,
}

#[derive(Clone, Debug)]
pub(crate) struct PreparedTypeAssignment {
    id: TypeAssignmentId,
    assertion: TypeAssignmentAssertion,
    valid_start_micros: i64,
    valid_end_micros: Option<i64>,
    grants: Vec<PreparedTypedGrant>,
}

impl PreparedTypeAssignment {
    fn admitted_assignment(&self, receipt_id: &str) -> Result<TypeAssignment, KernelError> {
        Ok(TypeAssignment {
            id: self.id.clone(),
            assertion: self.assertion.clone(),
            evidence: evidence_ref_for_receipt(receipt_id)?,
        })
    }

    pub(crate) fn explanation_value(
        &self,
        receipt_id: &str,
    ) -> Result<serde_json::Value, KernelError> {
        let assignment = self.admitted_assignment(receipt_id)?;
        Ok(serde_json::json!({
            "assignmentId": assignment.id.as_str(),
            "evidenceRef": assignment.evidence.as_str(),
            "kind": "typeAssignment",
            "objectKey": {
                "entity": assignment.assertion.object.entity.as_str(),
                "world": assignment.assertion.object.world.as_str(),
            },
            "objectType": assignment.assertion.object_type.as_str(),
            "validEndMicros": self.valid_end_micros,
            "validStartMicros": self.valid_start_micros,
        }))
    }
}

impl PostgresWorldKernel {
    /// Parse and validate a type-assignment draft before Commit opens a transaction.
    ///
    /// Non-draft proposal inputs are ignored by this materializer.
    ///
    /// # Errors
    ///
    /// Returns [`KernelError`] when a typed draft is malformed or crosses Worlds.
    pub(crate) fn prepare_type_assignment_from_commit(
        world: &WorldId,
        input_jcs: &str,
    ) -> Result<Option<PreparedTypeAssignment>, KernelError> {
        parse_type_assignment_draft(input_jcs)?
            .map(|payload| prepare_type_assignment(world, payload))
            .transpose()
    }

    /// Materialize `ObjectKey`, `TypeAssignment`, and grants inside the receipt transaction.
    ///
    /// # Errors
    ///
    /// Returns [`KernelError`] when immutable state conflicts or storage fails.
    pub(crate) async fn materialize_type_assignment_from_commit(
        transaction: &mut Transaction<'_, Postgres>,
        receipt_id: &str,
        minted_by: &PrincipalId,
        prepared: &PreparedTypeAssignment,
    ) -> Result<TypeAssignment, KernelError> {
        persist_type_assignment(transaction, receipt_id, minted_by, prepared).await
    }

    /// Verify replay state without repairing any missing committed artifact.
    ///
    /// # Errors
    ///
    /// Returns [`KernelError`] unless `ObjectKey`, `TypeAssignment`, receipt link, and exact grants
    /// already match the original Commit.
    pub(crate) async fn validate_type_assignment_replay(
        transaction: &mut Transaction<'_, Postgres>,
        receipt_id: &str,
        prepared: &PreparedTypeAssignment,
    ) -> Result<(), KernelError> {
        require_object_key_exists(transaction, prepared).await?;
        require_type_assignment_matches(transaction, receipt_id, prepared).await?;
        require_grants_match(transaction, prepared).await
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct TypeAssignmentDraftPayload {
    schema: String,
    object_key: ObjectKeyPayload,
    type_assignment: TypeAssignmentPayload,
    #[serde(default)]
    grants: Vec<TypedGrantPayload>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ObjectKeyPayload {
    world: String,
    entity: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct TypeAssignmentPayload {
    assignment_id: String,
    object_type: String,
    valid_start_micros: i64,
    valid_end_micros: Option<i64>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct TypedGrantPayload {
    principal_id: String,
    membership_id: String,
    object_type: String,
}

fn parse_type_assignment_draft(
    input_jcs: &str,
) -> Result<Option<TypeAssignmentDraftPayload>, KernelError> {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(input_jcs) else {
        return Ok(None);
    };
    if value.get("schema").and_then(serde_json::Value::as_str) != Some(TYPE_ASSIGNMENT_DRAFT_SCHEMA)
    {
        return Ok(None);
    }
    if value.get("evidenceRef").is_some()
        || value.get("typeMembership").is_some()
        || value
            .get("typeAssignment")
            .and_then(|assignment| assignment.get("membership"))
            .is_some()
    {
        return Err(KernelError::Conflict(
            "a TypeAssignment draft cannot supply final evidence or call type evidence Membership"
                .to_owned(),
        ));
    }
    serde_json::from_value::<TypeAssignmentDraftPayload>(value)
        .map(Some)
        .map_err(|error| KernelError::Conflict(format!("invalid TypeAssignment draft: {error}")))
}

fn prepare_type_assignment(
    world: &WorldId,
    payload: TypeAssignmentDraftPayload,
) -> Result<PreparedTypeAssignment, KernelError> {
    if payload.schema != TYPE_ASSIGNMENT_DRAFT_SCHEMA {
        return Err(KernelError::Conflict(
            "unexpected TypeAssignment draft schema".to_owned(),
        ));
    }
    if payload.object_key.world != world.as_str() {
        return Err(KernelError::Conflict(
            "TypeAssignment ObjectKey world does not match proposal world".to_owned(),
        ));
    }
    let object = ObjectKey::parse(&payload.object_key.world, &payload.object_key.entity)
        .map_err(|error| KernelError::Conflict(error.to_string()))?;
    let object_type = TypeId::parse(&payload.type_assignment.object_type)
        .map_err(|error| KernelError::Conflict(error.to_string()))?;
    let valid_time = valid_time_from_bounds(
        payload.type_assignment.valid_start_micros,
        payload.type_assignment.valid_end_micros,
    )?;
    let grants = prepare_grants(payload.grants, &object_type)?;
    Ok(PreparedTypeAssignment {
        id: TypeAssignmentId::parse(&payload.type_assignment.assignment_id)
            .map_err(|error| KernelError::Conflict(error.to_string()))?,
        assertion: TypeAssignmentAssertion {
            object,
            object_type,
            valid_time,
        },
        valid_start_micros: payload.type_assignment.valid_start_micros,
        valid_end_micros: payload.type_assignment.valid_end_micros,
        grants,
    })
}

fn prepare_grants(
    grants: Vec<TypedGrantPayload>,
    expected_type: &TypeId,
) -> Result<Vec<PreparedTypedGrant>, KernelError> {
    let mut prepared = Vec::with_capacity(grants.len());
    let mut unique = BTreeSet::new();
    for grant in grants {
        let item = PreparedTypedGrant {
            principal: PrincipalId::parse(grant.principal_id)
                .map_err(|error| KernelError::Conflict(error.to_string()))?,
            membership: MembershipId::parse(grant.membership_id)
                .map_err(|error| KernelError::Conflict(error.to_string()))?,
            object_type: TypeId::parse(grant.object_type)
                .map_err(|error| KernelError::Conflict(error.to_string()))?,
        };
        if item.object_type != *expected_type {
            return Err(KernelError::Conflict(
                "typed grant must name the assigned object type".to_owned(),
            ));
        }
        if !unique.insert(item.clone()) {
            return Err(KernelError::Conflict(
                "TypeAssignment draft contains a duplicate grant".to_owned(),
            ));
        }
        prepared.push(item);
    }
    prepared.sort();
    Ok(prepared)
}

fn valid_time_from_bounds(start: i64, end: Option<i64>) -> Result<ValidTime, KernelError> {
    ValidTime::interval(
        TimestampMicros::new(start),
        TimestampMicros::new(end.unwrap_or(i64::MAX)),
    )
    .map_err(|error| KernelError::Conflict(error.to_string()))
}

fn evidence_ref_for_receipt(receipt_id: &str) -> Result<EvidenceRef, KernelError> {
    let digest = encode_hex(Sha256::digest(receipt_id.as_bytes()).as_ref());
    EvidenceRef::parse(format!("evidence.{digest}"))
        .map_err(|error| KernelError::Store(error.to_string()))
}

async fn persist_type_assignment(
    transaction: &mut Transaction<'_, Postgres>,
    receipt_id: &str,
    minted_by: &PrincipalId,
    prepared: &PreparedTypeAssignment,
) -> Result<TypeAssignment, KernelError> {
    let assignment = prepared.admitted_assignment(receipt_id)?;
    let now = clock_micros();
    sqlx::query(
        "INSERT INTO world_object_keys (
            world_id, entity_id, minted_at_micros, minted_by
         ) VALUES ($1, $2, $3, $4)
         ON CONFLICT (world_id, entity_id) DO NOTHING",
    )
    .bind(assignment.assertion.object.world.as_str())
    .bind(assignment.assertion.object.entity.as_str())
    .bind(now)
    .bind(minted_by.as_str())
    .execute(&mut **transaction)
    .await
    .map_err(|error| KernelError::Store(error.to_string()))?;

    let assertion_digest = type_assignment_assertion_digest(&assignment.assertion);
    sqlx::query(
        "INSERT INTO world_type_assignments (
            assignment_id, world_id, entity_id, object_type,
            valid_start_micros, valid_end_micros, evidence_ref, receipt_id,
            assertion_digest, assigned_at_micros
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (assignment_id) DO NOTHING",
    )
    .bind(assignment.id.as_str())
    .bind(assignment.assertion.object.world.as_str())
    .bind(assignment.assertion.object.entity.as_str())
    .bind(assignment.assertion.object_type.as_str())
    .bind(prepared.valid_start_micros)
    .bind(prepared.valid_end_micros)
    .bind(assignment.evidence.as_str())
    .bind(receipt_id)
    .bind(&assertion_digest)
    .bind(now)
    .execute(&mut **transaction)
    .await
    .map_err(|error| KernelError::Store(error.to_string()))?;
    require_type_assignment_matches(transaction, receipt_id, prepared).await?;

    for grant in &prepared.grants {
        sqlx::query(
            "INSERT INTO world_typed_object_grants (
                type_assignment_id, world_id, entity_id, object_type,
                principal_id, membership_id
             ) VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT DO NOTHING",
        )
        .bind(assignment.id.as_str())
        .bind(assignment.assertion.object.world.as_str())
        .bind(assignment.assertion.object.entity.as_str())
        .bind(grant.object_type.as_str())
        .bind(grant.principal.as_str())
        .bind(grant.membership.as_str())
        .execute(&mut **transaction)
        .await
        .map_err(|error| KernelError::Store(error.to_string()))?;
    }
    require_grants_match(transaction, prepared).await?;
    Ok(assignment)
}

async fn require_object_key_exists(
    transaction: &mut Transaction<'_, Postgres>,
    prepared: &PreparedTypeAssignment,
) -> Result<(), KernelError> {
    let exists = sqlx::query_scalar::<_, bool>(
        "SELECT true FROM world_object_keys
         WHERE world_id = $1 AND entity_id = $2
         FOR SHARE",
    )
    .bind(prepared.assertion.object.world.as_str())
    .bind(prepared.assertion.object.entity.as_str())
    .fetch_optional(&mut **transaction)
    .await
    .map_err(|error| KernelError::Store(error.to_string()))?;
    if exists.is_none() {
        return Err(KernelError::Conflict(
            "committed TypeAssignment is missing its ObjectKey".to_owned(),
        ));
    }
    Ok(())
}

async fn require_type_assignment_matches(
    transaction: &mut Transaction<'_, Postgres>,
    receipt_id: &str,
    prepared: &PreparedTypeAssignment,
) -> Result<(), KernelError> {
    let expected = prepared.admitted_assignment(receipt_id)?;
    let row = sqlx::query(
        "SELECT world_id, entity_id, object_type, valid_start_micros,
                valid_end_micros, evidence_ref, receipt_id, assertion_digest
         FROM world_type_assignments WHERE assignment_id = $1 FOR SHARE",
    )
    .bind(expected.id.as_str())
    .fetch_optional(&mut **transaction)
    .await
    .map_err(|error| KernelError::Store(error.to_string()))?
    .ok_or_else(|| KernelError::Conflict("TypeAssignment was not materialized".to_owned()))?;
    let matches = row
        .try_get::<String, _>("world_id")
        .map_err(|error| KernelError::Store(error.to_string()))?
        == expected.assertion.object.world.as_str()
        && row
            .try_get::<String, _>("entity_id")
            .map_err(|error| KernelError::Store(error.to_string()))?
            == expected.assertion.object.entity.as_str()
        && row
            .try_get::<String, _>("object_type")
            .map_err(|error| KernelError::Store(error.to_string()))?
            == expected.assertion.object_type.as_str()
        && row
            .try_get::<i64, _>("valid_start_micros")
            .map_err(|error| KernelError::Store(error.to_string()))?
            == prepared.valid_start_micros
        && row
            .try_get::<Option<i64>, _>("valid_end_micros")
            .map_err(|error| KernelError::Store(error.to_string()))?
            == prepared.valid_end_micros
        && row
            .try_get::<String, _>("evidence_ref")
            .map_err(|error| KernelError::Store(error.to_string()))?
            == expected.evidence.as_str()
        && row
            .try_get::<String, _>("receipt_id")
            .map_err(|error| KernelError::Store(error.to_string()))?
            == receipt_id
        && row
            .try_get::<String, _>("assertion_digest")
            .map_err(|error| KernelError::Store(error.to_string()))?
            == type_assignment_assertion_digest(&expected.assertion);
    if !matches {
        return Err(KernelError::Conflict(
            "TypeAssignment replay does not match immutable state".to_owned(),
        ));
    }
    Ok(())
}

async fn require_grants_match(
    transaction: &mut Transaction<'_, Postgres>,
    prepared: &PreparedTypeAssignment,
) -> Result<(), KernelError> {
    let rows = sqlx::query(
        "SELECT principal_id, membership_id, object_type
         FROM world_typed_object_grants
         WHERE type_assignment_id = $1
           AND world_id = $2
           AND entity_id = $3
         ORDER BY principal_id, membership_id, object_type",
    )
    .bind(prepared.id.as_str())
    .bind(prepared.assertion.object.world.as_str())
    .bind(prepared.assertion.object.entity.as_str())
    .fetch_all(&mut **transaction)
    .await
    .map_err(|error| KernelError::Store(error.to_string()))?;
    let observed = rows
        .iter()
        .map(|row| {
            Ok((
                row.try_get::<String, _>("principal_id")
                    .map_err(|error| KernelError::Store(error.to_string()))?,
                row.try_get::<String, _>("membership_id")
                    .map_err(|error| KernelError::Store(error.to_string()))?,
                row.try_get::<String, _>("object_type")
                    .map_err(|error| KernelError::Store(error.to_string()))?,
            ))
        })
        .collect::<Result<BTreeSet<_>, KernelError>>()?;
    let expected = prepared
        .grants
        .iter()
        .map(|grant| {
            (
                grant.principal.as_str().to_owned(),
                grant.membership.as_str().to_owned(),
                grant.object_type.as_str().to_owned(),
            )
        })
        .collect::<BTreeSet<_>>();
    if observed != expected {
        return Err(KernelError::Conflict(
            "TypeAssignment replay grants do not match immutable state".to_owned(),
        ));
    }
    Ok(())
}
