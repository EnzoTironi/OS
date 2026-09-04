//! Governed Commit materialization for typed links and contextual identifiers.

use serde::Deserialize;
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Postgres, Row, Transaction, postgres::PgRow};
use zoen_core::{
    EvidenceRef, IdentifierAssertion, IdentifierAssignment, IdentifierAssignmentId,
    IdentifierContext, IdentifierScheme, LinkAssertion, LinkAssertionId, ObjectKey, PrincipalId,
    ReleaseDigest, TimestampMicros, TypeAssignmentId, TypeId, TypedArtifactError, TypedLink,
    TypedLinkDefinition, ValidTime, WorldId, encode_hex, identifier_assertion_digest,
    link_assertion_digest, typed_link_definition_digest,
};
use zoen_engine::KernelError;

use crate::{PostgresWorldKernel, clock_micros, typed_object_store::PreparedTypeAssignment};

const LINK_ASSERTION_DRAFT_SCHEMA: &str = "zoen.link-assertion-draft.v1";
const IDENTIFIER_ASSIGNMENT_DRAFT_SCHEMA: &str = "zoen.identifier-assignment-draft.v1";

#[derive(Clone, Debug)]
pub(crate) enum PreparedTypedArtifact {
    TypeAssignment(PreparedTypeAssignment),
    Link(PreparedTypedLink),
    Identifier(PreparedIdentifierAssignment),
}

#[derive(Clone, Debug)]
pub(crate) struct PreparedTypedLink {
    id: LinkAssertionId,
    assertion: LinkAssertion,
    source_assignment: TypeAssignmentId,
    target_assignment: TypeAssignmentId,
    definition: TypedLinkDefinition,
    definition_digest: String,
    valid_start_micros: i64,
    valid_end_micros: Option<i64>,
}

#[derive(Clone, Debug)]
pub(crate) struct PreparedIdentifierAssignment {
    id: IdentifierAssignmentId,
    assertion: IdentifierAssertion,
    type_assignment: TypeAssignmentId,
    object_type: TypeId,
    valid_start_micros: i64,
    valid_end_micros: Option<i64>,
    context_digest: String,
}

impl PreparedTypedArtifact {
    pub(crate) fn explanation_value(
        &self,
        receipt_id: &str,
    ) -> Result<serde_json::Value, KernelError> {
        match self {
            Self::TypeAssignment(prepared) => prepared.explanation_value(receipt_id),
            Self::Link(prepared) => prepared.explanation_value(receipt_id),
            Self::Identifier(prepared) => prepared.explanation_value(receipt_id),
        }
    }
}

impl PreparedTypedLink {
    fn admitted_link(&self, receipt_id: &str) -> Result<TypedLink, KernelError> {
        Ok(TypedLink {
            id: self.id.clone(),
            assertion: self.assertion.clone(),
            source_assignment: self.source_assignment.clone(),
            target_assignment: self.target_assignment.clone(),
            evidence: evidence_ref_for_receipt(receipt_id)?,
        })
    }

    fn explanation_value(&self, receipt_id: &str) -> Result<serde_json::Value, KernelError> {
        let link = self.admitted_link(receipt_id)?;
        Ok(serde_json::json!({
            "evidenceRef": link.evidence.as_str(),
            "kind": "typedLink",
            "linkAssertionId": link.id.as_str(),
            "linkType": link.assertion.link_type.as_str(),
            "definitionDigest": self.definition_digest,
            "source": {
                "objectKey": object_key_json(&link.assertion.source),
                "objectType": self.definition.source_type.as_str(),
                "typeAssignmentId": link.source_assignment.as_str(),
            },
            "target": {
                "objectKey": object_key_json(&link.assertion.target),
                "objectType": self.definition.target_type.as_str(),
                "typeAssignmentId": link.target_assignment.as_str(),
            },
            "validEndMicros": self.valid_end_micros,
            "validStartMicros": self.valid_start_micros,
        }))
    }
}

impl PreparedIdentifierAssignment {
    fn admitted_assignment(&self, receipt_id: &str) -> Result<IdentifierAssignment, KernelError> {
        Ok(IdentifierAssignment {
            id: self.id.clone(),
            assertion: self.assertion.clone(),
            type_assignment: self.type_assignment.clone(),
            evidence: evidence_ref_for_receipt(receipt_id)?,
        })
    }

    fn explanation_value(&self, receipt_id: &str) -> Result<serde_json::Value, KernelError> {
        let assignment = self.admitted_assignment(receipt_id)?;
        Ok(serde_json::json!({
            "context": context_json(&assignment.assertion.context),
            "contextDigest": self.context_digest,
            "evidenceRef": assignment.evidence.as_str(),
            "identifierAssignmentId": assignment.id.as_str(),
            "kind": "identifierAssignment",
            "objectKey": object_key_json(&assignment.assertion.object),
            "objectType": self.object_type.as_str(),
            "scheme": assignment.assertion.scheme.as_str(),
            "typeAssignmentId": assignment.type_assignment.as_str(),
            "validEndMicros": self.valid_end_micros,
            "validStartMicros": self.valid_start_micros,
            "value": assignment.assertion.value,
        }))
    }
}

impl PostgresWorldKernel {
    /// Parse a proposal draft into one governed artifact before opening the Commit transaction.
    ///
    /// # Errors
    ///
    /// Returns [`KernelError`] for malformed drafts, catalog mismatches, unsupported endpoint
    /// assignments, or cross-World references.
    pub(crate) async fn prepare_typed_artifact_from_commit(
        pool: &PgPool,
        world: &WorldId,
        input_jcs: &str,
        link_definitions: &[TypedLinkDefinition],
    ) -> Result<Option<PreparedTypedArtifact>, KernelError> {
        if let Some(type_assignment) = Self::prepare_type_assignment_from_commit(world, input_jcs)?
        {
            return Ok(Some(PreparedTypedArtifact::TypeAssignment(type_assignment)));
        }
        let Ok(value) = serde_json::from_str::<serde_json::Value>(input_jcs) else {
            return Ok(None);
        };
        match value.get("schema").and_then(serde_json::Value::as_str) {
            Some(LINK_ASSERTION_DRAFT_SCHEMA) => {
                reject_server_owned_fields(&value)?;
                let payload =
                    serde_json::from_value::<TypedLinkDraftPayload>(value).map_err(|error| {
                        KernelError::Conflict(format!("invalid typed link draft: {error}"))
                    })?;
                prepare_typed_link(pool, world, payload, link_definitions)
                    .await
                    .map(PreparedTypedArtifact::Link)
                    .map(Some)
            }
            Some(IDENTIFIER_ASSIGNMENT_DRAFT_SCHEMA) => {
                reject_server_owned_fields(&value)?;
                let payload = serde_json::from_value::<IdentifierAssignmentDraftPayload>(value)
                    .map_err(|error| {
                        KernelError::Conflict(format!(
                            "invalid IdentifierAssignment draft: {error}"
                        ))
                    })?;
                prepare_identifier_assignment(pool, world, payload)
                    .await
                    .map(PreparedTypedArtifact::Identifier)
                    .map(Some)
            }
            _ => Ok(None),
        }
    }

    /// Materialize one prepared artifact inside the immutable receipt transaction.
    ///
    /// # Errors
    ///
    /// Returns [`KernelError`] when support, immutable replay state, or storage disagrees.
    pub(crate) async fn materialize_typed_artifact_from_commit(
        transaction: &mut Transaction<'_, Postgres>,
        receipt_id: &str,
        minted_by: &PrincipalId,
        release: &ReleaseDigest,
        policy_digest: &str,
        prepared: &PreparedTypedArtifact,
    ) -> Result<(), KernelError> {
        match prepared {
            PreparedTypedArtifact::TypeAssignment(prepared) => {
                let _ = Self::materialize_type_assignment_from_commit(
                    transaction,
                    receipt_id,
                    minted_by,
                    prepared,
                )
                .await?;
                Ok(())
            }
            PreparedTypedArtifact::Link(prepared) => {
                persist_typed_link(transaction, receipt_id, release, policy_digest, prepared).await
            }
            PreparedTypedArtifact::Identifier(prepared) => {
                persist_identifier_assignment(
                    transaction,
                    receipt_id,
                    release,
                    policy_digest,
                    prepared,
                )
                .await
            }
        }
    }

    /// Verify replay without repairing a missing typed artifact.
    ///
    /// # Errors
    ///
    /// Returns [`KernelError`] unless immutable state exactly matches the original Commit.
    pub(crate) async fn validate_typed_artifact_replay(
        transaction: &mut Transaction<'_, Postgres>,
        receipt_id: &str,
        release: &ReleaseDigest,
        policy_digest: &str,
        prepared: &PreparedTypedArtifact,
    ) -> Result<(), KernelError> {
        match prepared {
            PreparedTypedArtifact::TypeAssignment(prepared) => {
                Self::validate_type_assignment_replay(transaction, receipt_id, prepared).await
            }
            PreparedTypedArtifact::Link(prepared) => {
                require_typed_link_matches(
                    transaction,
                    receipt_id,
                    release,
                    policy_digest,
                    prepared,
                )
                .await
            }
            PreparedTypedArtifact::Identifier(prepared) => {
                require_identifier_assignment_matches(
                    transaction,
                    receipt_id,
                    release,
                    policy_digest,
                    prepared,
                )
                .await
            }
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct TypedLinkDraftPayload {
    schema: String,
    link_assertion: LinkAssertionPayload,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LinkAssertionPayload {
    link_assertion_id: String,
    link_type: String,
    source: ObjectKeyPayload,
    target: ObjectKeyPayload,
    source_type_assignment_id: String,
    target_type_assignment_id: String,
    valid_start_micros: i64,
    valid_end_micros: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct IdentifierAssignmentDraftPayload {
    schema: String,
    identifier_assignment: IdentifierAssignmentPayload,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct IdentifierAssignmentPayload {
    identifier_assignment_id: String,
    object_key: ObjectKeyPayload,
    type_assignment_id: String,
    scheme: String,
    value: String,
    context: IdentifierContextPayload,
    valid_start_micros: i64,
    valid_end_micros: Option<i64>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ObjectKeyPayload {
    world: String,
    entity: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct IdentifierContextPayload {
    venue: Option<ObjectKeyPayload>,
    mic: Option<String>,
    currency: Option<String>,
    share_class: Option<String>,
    provider: Option<String>,
    identifier_level: Option<String>,
}

async fn prepare_typed_link(
    pool: &PgPool,
    world: &WorldId,
    payload: TypedLinkDraftPayload,
    definitions: &[TypedLinkDefinition],
) -> Result<PreparedTypedLink, KernelError> {
    if payload.schema != LINK_ASSERTION_DRAFT_SCHEMA {
        return Err(KernelError::Conflict(
            "unexpected typed link draft schema".to_owned(),
        ));
    }
    let link_type =
        zoen_core::LinkTypeId::parse(&payload.link_assertion.link_type).map_err(conflict)?;
    let definition = definitions
        .iter()
        .find(|definition| definition.id == link_type)
        .cloned()
        .ok_or_else(|| {
            KernelError::Conflict("typed link is not defined by the active release".to_owned())
        })?;
    if definition.required_evidence_schema != LINK_ASSERTION_DRAFT_SCHEMA {
        return Err(KernelError::Conflict(
            "typed link definition requires another evidence shape".to_owned(),
        ));
    }
    let source = parse_object_key(world, payload.link_assertion.source)?;
    let target = parse_object_key(world, payload.link_assertion.target)?;
    let valid_time = valid_time_from_bounds(
        payload.link_assertion.valid_start_micros,
        payload.link_assertion.valid_end_micros,
    )?;
    let source_assignment =
        TypeAssignmentId::parse(&payload.link_assertion.source_type_assignment_id)
            .map_err(conflict)?;
    let target_assignment =
        TypeAssignmentId::parse(&payload.link_assertion.target_type_assignment_id)
            .map_err(conflict)?;
    require_supporting_assignment(
        pool,
        &source_assignment,
        &source,
        &definition.source_type,
        &valid_time,
        "source",
    )
    .await?;
    require_supporting_assignment(
        pool,
        &target_assignment,
        &target,
        &definition.target_type,
        &valid_time,
        "target",
    )
    .await?;
    let assertion = LinkAssertion::new(link_type, source, target, valid_time)
        .map_err(|error| KernelError::Conflict(error.to_string()))?;
    Ok(PreparedTypedLink {
        id: LinkAssertionId::parse(payload.link_assertion.link_assertion_id).map_err(conflict)?,
        assertion,
        source_assignment,
        target_assignment,
        definition_digest: typed_link_definition_digest(&definition),
        definition,
        valid_start_micros: payload.link_assertion.valid_start_micros,
        valid_end_micros: payload.link_assertion.valid_end_micros,
    })
}

async fn prepare_identifier_assignment(
    pool: &PgPool,
    world: &WorldId,
    payload: IdentifierAssignmentDraftPayload,
) -> Result<PreparedIdentifierAssignment, KernelError> {
    if payload.schema != IDENTIFIER_ASSIGNMENT_DRAFT_SCHEMA {
        return Err(KernelError::Conflict(
            "unexpected IdentifierAssignment draft schema".to_owned(),
        ));
    }
    let object = parse_object_key(world, payload.identifier_assignment.object_key)?;
    let valid_time = valid_time_from_bounds(
        payload.identifier_assignment.valid_start_micros,
        payload.identifier_assignment.valid_end_micros,
    )?;
    let type_assignment =
        TypeAssignmentId::parse(&payload.identifier_assignment.type_assignment_id)
            .map_err(conflict)?;
    let object_type =
        load_supporting_assignment_type(pool, &type_assignment, &object, &valid_time, "identifier")
            .await?;
    let context = prepare_identifier_context(world, payload.identifier_assignment.context)?;
    let value = payload.identifier_assignment.value.trim().to_owned();
    if value.is_empty() {
        return Err(KernelError::Conflict(
            TypedArtifactError::EmptyIdentifierValue.to_string(),
        ));
    }
    let assertion = IdentifierAssertion {
        object,
        scheme: IdentifierScheme::parse(payload.identifier_assignment.scheme).map_err(conflict)?,
        value,
        context,
        valid_time,
    };
    let context_digest = identifier_context_digest(&assertion.context);
    Ok(PreparedIdentifierAssignment {
        id: IdentifierAssignmentId::parse(payload.identifier_assignment.identifier_assignment_id)
            .map_err(conflict)?,
        assertion,
        type_assignment,
        object_type,
        valid_start_micros: payload.identifier_assignment.valid_start_micros,
        valid_end_micros: payload.identifier_assignment.valid_end_micros,
        context_digest,
    })
}

fn reject_server_owned_fields(value: &serde_json::Value) -> Result<(), KernelError> {
    const SERVER_OWNED: [&str; 10] = [
        "assertionDigest",
        "contextDigest",
        "definitionDigest",
        "evidenceRef",
        "objectType",
        "policyDigest",
        "receiptId",
        "releaseDigest",
        "sourceType",
        "targetType",
    ];
    fn contains_server_owned(value: &serde_json::Value) -> Option<&str> {
        match value {
            serde_json::Value::Object(map) => {
                for field in SERVER_OWNED {
                    if map.contains_key(field) {
                        return Some(field);
                    }
                }
                map.values().find_map(contains_server_owned)
            }
            serde_json::Value::Array(values) => values.iter().find_map(contains_server_owned),
            _ => None,
        }
    }
    if let Some(field) = contains_server_owned(value) {
        return Err(KernelError::Conflict(format!(
            "typed draft cannot supply server-owned field {field}"
        )));
    }
    Ok(())
}

fn parse_object_key(world: &WorldId, payload: ObjectKeyPayload) -> Result<ObjectKey, KernelError> {
    if payload.world != world.as_str() {
        return Err(KernelError::Conflict(
            "typed artifact ObjectKey crosses the proposal World".to_owned(),
        ));
    }
    ObjectKey::parse(payload.world, payload.entity).map_err(conflict)
}

fn prepare_identifier_context(
    world: &WorldId,
    payload: IdentifierContextPayload,
) -> Result<IdentifierContext, KernelError> {
    let context = IdentifierContext {
        venue: payload
            .venue
            .map(|venue| parse_object_key(world, venue))
            .transpose()?,
        mic: normalized_optional(payload.mic, true),
        currency: normalized_optional(payload.currency, true),
        share_class: normalized_optional(payload.share_class, false),
        provider: normalized_optional(payload.provider, false).map(|value| value.to_lowercase()),
        identifier_level: normalized_optional(payload.identifier_level, false)
            .map(|value| value.to_lowercase()),
    };
    if !context.has_dimension() {
        return Err(KernelError::Conflict(
            TypedArtifactError::MissingIdentifierContext.to_string(),
        ));
    }
    Ok(context)
}

fn normalized_optional(value: Option<String>, uppercase: bool) -> Option<String> {
    value.and_then(|value| {
        let value = value.trim();
        if value.is_empty() {
            None
        } else if uppercase {
            Some(value.to_uppercase())
        } else {
            Some(value.to_owned())
        }
    })
}

fn valid_time_from_bounds(start: i64, end: Option<i64>) -> Result<ValidTime, KernelError> {
    ValidTime::interval(
        TimestampMicros::new(start),
        TimestampMicros::new(end.unwrap_or(i64::MAX)),
    )
    .map_err(|error| KernelError::Conflict(error.to_string()))
}

async fn require_supporting_assignment(
    pool: &PgPool,
    assignment: &TypeAssignmentId,
    object: &ObjectKey,
    expected_type: &TypeId,
    required_time: &ValidTime,
    side: &str,
) -> Result<(), KernelError> {
    let observed = load_supporting_assignment(pool, assignment).await?;
    if observed.world != object.world
        || observed.entity != object.entity.as_str()
        || observed.object_type != *expected_type
    {
        return Err(KernelError::Conflict(format!(
            "typed link {side} TypeAssignment does not support the catalog endpoint"
        )));
    }
    if !observed.valid_time.covers(required_time) {
        return Err(KernelError::Conflict(format!(
            "typed link {side} TypeAssignment does not cover the complete link interval"
        )));
    }
    Ok(())
}

async fn load_supporting_assignment_type(
    pool: &PgPool,
    assignment: &TypeAssignmentId,
    object: &ObjectKey,
    required_time: &ValidTime,
    label: &str,
) -> Result<TypeId, KernelError> {
    let observed = load_supporting_assignment(pool, assignment).await?;
    if observed.world != object.world || observed.entity != object.entity.as_str() {
        return Err(KernelError::Conflict(format!(
            "{label} TypeAssignment does not support the assigned ObjectKey"
        )));
    }
    if !observed.valid_time.covers(required_time) {
        return Err(KernelError::Conflict(format!(
            "{label} TypeAssignment does not cover the complete assignment interval"
        )));
    }
    Ok(observed.object_type)
}

struct SupportingAssignment {
    world: WorldId,
    entity: String,
    object_type: TypeId,
    valid_time: ValidTime,
}

async fn load_supporting_assignment(
    pool: &PgPool,
    assignment: &TypeAssignmentId,
) -> Result<SupportingAssignment, KernelError> {
    let row = sqlx::query(
        "SELECT world_id, entity_id, object_type, valid_start_micros, valid_end_micros
         FROM world_type_assignments WHERE assignment_id = $1",
    )
    .bind(assignment.as_str())
    .fetch_optional(pool)
    .await
    .map_err(store)?
    .ok_or_else(|| KernelError::Conflict("supporting TypeAssignment was not found".to_owned()))?;
    let start = row.try_get::<i64, _>("valid_start_micros").map_err(store)?;
    let end = row
        .try_get::<Option<i64>, _>("valid_end_micros")
        .map_err(store)?;
    Ok(SupportingAssignment {
        world: WorldId::parse(row.try_get::<String, _>("world_id").map_err(store)?)
            .map_err(store)?,
        entity: row.try_get("entity_id").map_err(store)?,
        object_type: TypeId::parse(row.try_get::<String, _>("object_type").map_err(store)?)
            .map_err(store)?,
        valid_time: valid_time_from_bounds(start, end)?,
    })
}

async fn persist_typed_link(
    transaction: &mut Transaction<'_, Postgres>,
    receipt_id: &str,
    release: &ReleaseDigest,
    policy_digest: &str,
    prepared: &PreparedTypedLink,
) -> Result<(), KernelError> {
    let evidence = evidence_ref_for_receipt(receipt_id)?;
    sqlx::query(
        "INSERT INTO world_link_assertions (
            link_assertion_id, world_id, link_type, definition_digest,
            source_entity_id, source_type, source_assignment_id,
            target_entity_id, target_type, target_assignment_id,
            valid_start_micros, valid_end_micros, evidence_ref, receipt_id,
            release_digest, policy_digest, assertion_digest, admitted_at_micros
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         ON CONFLICT DO NOTHING",
    )
    .bind(prepared.id.as_str())
    .bind(prepared.assertion.source.world.as_str())
    .bind(prepared.assertion.link_type.as_str())
    .bind(&prepared.definition_digest)
    .bind(prepared.assertion.source.entity.as_str())
    .bind(prepared.definition.source_type.as_str())
    .bind(prepared.source_assignment.as_str())
    .bind(prepared.assertion.target.entity.as_str())
    .bind(prepared.definition.target_type.as_str())
    .bind(prepared.target_assignment.as_str())
    .bind(prepared.valid_start_micros)
    .bind(prepared.valid_end_micros)
    .bind(evidence.as_str())
    .bind(receipt_id)
    .bind(release.as_str())
    .bind(policy_digest)
    .bind(link_assertion_digest(&prepared.assertion))
    .bind(clock_micros())
    .execute(&mut **transaction)
    .await
    .map_err(store)?;
    require_typed_link_matches(transaction, receipt_id, release, policy_digest, prepared).await
}

async fn persist_identifier_assignment(
    transaction: &mut Transaction<'_, Postgres>,
    receipt_id: &str,
    release: &ReleaseDigest,
    policy_digest: &str,
    prepared: &PreparedIdentifierAssignment,
) -> Result<(), KernelError> {
    let evidence = evidence_ref_for_receipt(receipt_id)?;
    let context = &prepared.assertion.context;
    sqlx::query(
        "INSERT INTO world_identifier_assignments (
            identifier_assignment_id, world_id, entity_id, type_assignment_id,
            object_type, scheme, identifier_value, venue_entity_id, mic, currency,
            share_class, provider, identifier_level, context_digest,
            valid_start_micros, valid_end_micros, evidence_ref, receipt_id,
            release_digest, policy_digest, assertion_digest, admitted_at_micros
         ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22
         ) ON CONFLICT DO NOTHING",
    )
    .bind(prepared.id.as_str())
    .bind(prepared.assertion.object.world.as_str())
    .bind(prepared.assertion.object.entity.as_str())
    .bind(prepared.type_assignment.as_str())
    .bind(prepared.object_type.as_str())
    .bind(prepared.assertion.scheme.as_str())
    .bind(&prepared.assertion.value)
    .bind(context.venue.as_ref().map(|venue| venue.entity.as_str()))
    .bind(context.mic.as_deref())
    .bind(context.currency.as_deref())
    .bind(context.share_class.as_deref())
    .bind(context.provider.as_deref())
    .bind(context.identifier_level.as_deref())
    .bind(&prepared.context_digest)
    .bind(prepared.valid_start_micros)
    .bind(prepared.valid_end_micros)
    .bind(evidence.as_str())
    .bind(receipt_id)
    .bind(release.as_str())
    .bind(policy_digest)
    .bind(identifier_assertion_digest(&prepared.assertion))
    .bind(clock_micros())
    .execute(&mut **transaction)
    .await
    .map_err(store)?;
    require_identifier_assignment_matches(transaction, receipt_id, release, policy_digest, prepared)
        .await
}

async fn require_typed_link_matches(
    transaction: &mut Transaction<'_, Postgres>,
    receipt_id: &str,
    release: &ReleaseDigest,
    policy_digest: &str,
    prepared: &PreparedTypedLink,
) -> Result<(), KernelError> {
    let row =
        sqlx::query("SELECT * FROM world_link_assertions WHERE link_assertion_id = $1 FOR SHARE")
            .bind(prepared.id.as_str())
            .fetch_optional(&mut **transaction)
            .await
            .map_err(store)?
            .ok_or_else(|| KernelError::Conflict("typed link was not materialized".to_owned()))?;
    let evidence = evidence_ref_for_receipt(receipt_id)?;
    let matches = text(&row, "world_id")? == prepared.assertion.source.world.as_str()
        && text(&row, "link_type")? == prepared.assertion.link_type.as_str()
        && text(&row, "definition_digest")? == prepared.definition_digest
        && text(&row, "source_entity_id")? == prepared.assertion.source.entity.as_str()
        && text(&row, "source_type")? == prepared.definition.source_type.as_str()
        && text(&row, "source_assignment_id")? == prepared.source_assignment.as_str()
        && text(&row, "target_entity_id")? == prepared.assertion.target.entity.as_str()
        && text(&row, "target_type")? == prepared.definition.target_type.as_str()
        && text(&row, "target_assignment_id")? == prepared.target_assignment.as_str()
        && integer(&row, "valid_start_micros")? == prepared.valid_start_micros
        && optional_integer(&row, "valid_end_micros")? == prepared.valid_end_micros
        && text(&row, "evidence_ref")? == evidence.as_str()
        && text(&row, "receipt_id")? == receipt_id
        && text(&row, "release_digest")? == release.as_str()
        && text(&row, "policy_digest")? == policy_digest
        && text(&row, "assertion_digest")? == link_assertion_digest(&prepared.assertion);
    if !matches {
        return Err(KernelError::Conflict(
            "typed link replay does not match immutable state".to_owned(),
        ));
    }
    Ok(())
}

async fn require_identifier_assignment_matches(
    transaction: &mut Transaction<'_, Postgres>,
    receipt_id: &str,
    release: &ReleaseDigest,
    policy_digest: &str,
    prepared: &PreparedIdentifierAssignment,
) -> Result<(), KernelError> {
    let row = sqlx::query(
        "SELECT * FROM world_identifier_assignments WHERE identifier_assignment_id = $1 FOR SHARE",
    )
    .bind(prepared.id.as_str())
    .fetch_optional(&mut **transaction)
    .await
    .map_err(store)?
    .ok_or_else(|| KernelError::Conflict("IdentifierAssignment was not materialized".to_owned()))?;
    let assertion = &prepared.assertion;
    let context = &assertion.context;
    let evidence = evidence_ref_for_receipt(receipt_id)?;
    let matches = text(&row, "world_id")? == assertion.object.world.as_str()
        && text(&row, "entity_id")? == assertion.object.entity.as_str()
        && text(&row, "type_assignment_id")? == prepared.type_assignment.as_str()
        && text(&row, "object_type")? == prepared.object_type.as_str()
        && text(&row, "scheme")? == assertion.scheme.as_str()
        && text(&row, "identifier_value")? == assertion.value
        && optional_text(&row, "venue_entity_id")?
            == context
                .venue
                .as_ref()
                .map(|venue| venue.entity.as_str().to_owned())
        && optional_text(&row, "mic")? == context.mic
        && optional_text(&row, "currency")? == context.currency
        && optional_text(&row, "share_class")? == context.share_class
        && optional_text(&row, "provider")? == context.provider
        && optional_text(&row, "identifier_level")? == context.identifier_level
        && text(&row, "context_digest")? == prepared.context_digest
        && integer(&row, "valid_start_micros")? == prepared.valid_start_micros
        && optional_integer(&row, "valid_end_micros")? == prepared.valid_end_micros
        && text(&row, "evidence_ref")? == evidence.as_str()
        && text(&row, "receipt_id")? == receipt_id
        && text(&row, "release_digest")? == release.as_str()
        && text(&row, "policy_digest")? == policy_digest
        && text(&row, "assertion_digest")? == identifier_assertion_digest(assertion);
    if !matches {
        return Err(KernelError::Conflict(
            "IdentifierAssignment replay does not match immutable state".to_owned(),
        ));
    }
    Ok(())
}

fn evidence_ref_for_receipt(receipt_id: &str) -> Result<EvidenceRef, KernelError> {
    let digest = encode_hex(Sha256::digest(receipt_id.as_bytes()).as_ref());
    EvidenceRef::parse(format!("evidence.{digest}"))
        .map_err(|error| KernelError::Store(error.to_string()))
}

fn identifier_context_digest(context: &IdentifierContext) -> String {
    let mut hasher = Sha256::new();
    hash_context_field(&mut hasher, "zoen.identifier-context.v1");
    hash_context_field(
        &mut hasher,
        context
            .venue
            .as_ref()
            .map_or("", |venue| venue.entity.as_str()),
    );
    hash_context_field(&mut hasher, context.mic.as_deref().unwrap_or(""));
    hash_context_field(&mut hasher, context.currency.as_deref().unwrap_or(""));
    hash_context_field(&mut hasher, context.share_class.as_deref().unwrap_or(""));
    hash_context_field(&mut hasher, context.provider.as_deref().unwrap_or(""));
    hash_context_field(
        &mut hasher,
        context.identifier_level.as_deref().unwrap_or(""),
    );
    encode_hex(hasher.finalize().as_ref())
}

fn hash_context_field(hasher: &mut Sha256, value: &str) {
    hasher.update(value.len().to_be_bytes());
    hasher.update(value.as_bytes());
}

fn context_json(context: &IdentifierContext) -> serde_json::Value {
    serde_json::json!({
        "currency": context.currency,
        "identifierLevel": context.identifier_level,
        "mic": context.mic,
        "provider": context.provider,
        "shareClass": context.share_class,
        "venue": context.venue.as_ref().map(object_key_json),
    })
}

fn object_key_json(key: &ObjectKey) -> serde_json::Value {
    serde_json::json!({"entity": key.entity.as_str(), "world": key.world.as_str()})
}

fn text(row: &PgRow, column: &str) -> Result<String, KernelError> {
    row.try_get(column).map_err(store)
}

fn optional_text(row: &PgRow, column: &str) -> Result<Option<String>, KernelError> {
    row.try_get(column).map_err(store)
}

fn integer(row: &PgRow, column: &str) -> Result<i64, KernelError> {
    row.try_get(column).map_err(store)
}

fn optional_integer(row: &PgRow, column: &str) -> Result<Option<i64>, KernelError> {
    row.try_get(column).map_err(store)
}

fn conflict(error: impl std::fmt::Display) -> KernelError {
    KernelError::Conflict(error.to_string())
}

fn store(error: impl std::fmt::Display) -> KernelError {
    KernelError::Store(error.to_string())
}
