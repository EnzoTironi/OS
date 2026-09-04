//! `ObjectKey` mint, temporal `TypeAssignment` commit, typed query, `FIN-01` resolve.

use sqlx::Row;
use zoen_core::{
    EntityId, EvidenceRef, ObjectKey, PrincipalId, TimestampMicros, TypeAssignment,
    TypeAssignmentAssertion, TypeAssignmentId, TypeId, TypedObjectRef, ValidTime, WorldId,
    principal_may_activate, principal_may_publish, type_assignment_assertion_digest,
};
use zoen_engine::{
    KernelError, KernelIdentityCandidate, KernelIdentityResolve, KernelMintObject,
    KernelTypedObject, KernelTypedObjectPage,
};

use crate::{PostgresWorldKernel, clock_micros};

/// Inputs for planting an identifier assignment.
pub struct PlantIdentifierInput<'a> {
    pub assignment_id: &'a str,
    pub entity_id: &'a str,
    pub type_assignment_id: &'a str,
    pub scheme: &'a str,
    pub value: &'a str,
    pub venue: Option<&'a str>,
    pub currency: Option<&'a str>,
    pub identifier_level: &'a str,
    pub evidence_ref: &'a str,
    pub valid_start_micros: i64,
    pub valid_end_micros: Option<i64>,
}

/// Inputs for planting a temporal `TypeAssignment`.
pub struct PlantTypeAssignmentInput<'a> {
    pub assignment_id: &'a str,
    pub entity_id: &'a str,
    pub object_type: &'a str,
    pub evidence_ref: &'a str,
    pub valid_start_micros: i64,
    pub valid_end_micros: Option<i64>,
    pub grants: &'a [zoen_engine::KernelTypedGrant],
}

impl PostgresWorldKernel {
    /// Mint a stable private `ObjectKey`. Builder/owner only.
    ///
    /// # Errors
    ///
    /// Returns [`KernelError`] when the principal cannot mint or the key exists.
    pub async fn mint_object_key(
        &self,
        world: &WorldId,
        principal: &PrincipalId,
        mint: &KernelMintObject,
    ) -> Result<ObjectKey, KernelError> {
        if !(principal_may_publish(principal) || principal_may_activate(principal)) {
            return Err(KernelError::Denied(
                "only builder or owner may mint ObjectKey".to_owned(),
            ));
        }
        let _ = self.catalog_basis(world).await?;
        let entity = EntityId::parse(&mint.entity_id)
            .map_err(|error| KernelError::Store(error.to_string()))?;
        let key = ObjectKey::new(world.clone(), entity);
        let minted_at = clock_micros();
        let inserted = sqlx::query(
            "INSERT INTO world_object_keys (
                world_id, entity_id, minted_at_micros, minted_by
             ) VALUES ($1, $2, $3, $4)
             ON CONFLICT (world_id, entity_id) DO NOTHING",
        )
        .bind(world.as_str())
        .bind(key.entity.as_str())
        .bind(minted_at)
        .bind(principal.as_str())
        .execute(self.pool())
        .await
        .map_err(|error| KernelError::Store(error.to_string()))?;
        if inserted.rows_affected() == 0 {
            // Idempotent mint of the same key is allowed.
            return Ok(key);
        }
        for grant in &mint.grants {
            sqlx::query(
                "INSERT INTO world_typed_object_grants (
                    world_id, entity_id, object_type, principal_id, membership_id
                 ) VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT DO NOTHING",
            )
            .bind(world.as_str())
            .bind(key.entity.as_str())
            .bind(&grant.object_type)
            .bind(&grant.principal_id)
            .bind(&grant.membership_id)
            .execute(self.pool())
            .await
            .map_err(|error| KernelError::Store(error.to_string()))?;
        }
        Ok(key)
    }

    /// Grant discovery entitlement for an identifier scheme (`FIN-01` denial/recovery).
    ///
    /// # Errors
    ///
    /// Returns [`KernelError`] when the principal cannot grant or the store fails.
    pub async fn grant_discovery(
        &self,
        world: &WorldId,
        principal: &PrincipalId,
        membership_id: &str,
        subject_principal: &str,
        scheme: &str,
    ) -> Result<(), KernelError> {
        if !principal_may_activate(principal) {
            return Err(KernelError::Denied(
                "only the World owner may grant discovery entitlement".to_owned(),
            ));
        }
        let _ = self.catalog_basis(world).await?;
        sqlx::query(
            "INSERT INTO world_discovery_entitlements (
                world_id, principal_id, membership_id, scheme
             ) VALUES ($1, $2, $3, $4)
             ON CONFLICT DO NOTHING",
        )
        .bind(world.as_str())
        .bind(subject_principal)
        .bind(membership_id)
        .bind(scheme)
        .execute(self.pool())
        .await
        .map_err(|error| KernelError::Store(error.to_string()))?;
        Ok(())
    }

    /// Plant an identifier assignment bound to an existing `TypeAssignment` (`FIN-01` fixture).
    ///
    /// # Errors
    ///
    /// Returns [`KernelError`] when the principal cannot plant or references are missing.
    pub async fn plant_identifier(
        &self,
        world: &WorldId,
        principal: &PrincipalId,
        input: &PlantIdentifierInput<'_>,
    ) -> Result<(), KernelError> {
        if !(principal_may_publish(principal) || principal_may_activate(principal)) {
            return Err(KernelError::Denied(
                "only builder or owner may plant identifier assignments".to_owned(),
            ));
        }
        let _ = self.catalog_basis(world).await?;
        let assigned_at = clock_micros();
        sqlx::query(
            "INSERT INTO world_identifier_assignments (
                assignment_id, world_id, entity_id, scheme, value, venue, currency,
                identifier_level, valid_start_micros, valid_end_micros, evidence_ref,
                type_assignment_id, assigned_at_micros
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
        )
        .bind(input.assignment_id)
        .bind(world.as_str())
        .bind(input.entity_id)
        .bind(input.scheme)
        .bind(input.value)
        .bind(input.venue)
        .bind(input.currency)
        .bind(input.identifier_level)
        .bind(input.valid_start_micros)
        .bind(input.valid_end_micros)
        .bind(input.evidence_ref)
        .bind(input.type_assignment_id)
        .bind(assigned_at)
        .execute(self.pool())
        .await
        .map_err(|error| KernelError::Store(error.to_string()))?;
        Ok(())
    }

    /// Materialize a temporal `TypeAssignment` after Commit (typed knowledge path).
    ///
    /// # Errors
    ///
    /// Returns [`KernelError`] when JSON is malformed or the ObjectKey is missing.
    pub async fn materialize_type_assignment_from_commit(
        &self,
        world: &WorldId,
        receipt_id: &str,
        input_jcs: &str,
    ) -> Result<Option<TypeAssignment>, KernelError> {
        let Some(payload) = parse_typed_knowledge(input_jcs)? else {
            return Ok(None);
        };
        if payload.world != world.as_str() {
            return Err(KernelError::Conflict(
                "TypeAssignment ObjectKey world does not match proposal world".to_owned(),
            ));
        }
        let object = ObjectKey::parse(&payload.world, &payload.entity)
            .map_err(|error| KernelError::Store(error.to_string()))?;
        let object_type = TypeId::parse(&payload.object_type)
            .map_err(|error| KernelError::Store(error.to_string()))?;
        let valid_time = match payload.valid_end_micros {
            Some(end) => ValidTime::interval(
                TimestampMicros::new(payload.valid_start_micros),
                TimestampMicros::new(end),
            )
            .map_err(|error| KernelError::Store(error.to_string()))?,
            None => ValidTime::interval(
                TimestampMicros::new(payload.valid_start_micros),
                TimestampMicros::new(i64::MAX),
            )
            .map_err(|error| KernelError::Store(error.to_string()))?,
        };
        let assertion = TypeAssignmentAssertion {
            object: object.clone(),
            object_type: object_type.clone(),
            valid_time,
        };
        let assignment_id = payload.assignment_id;
        let evidence = EvidenceRef::parse(&payload.evidence_ref)
            .map_err(|error| KernelError::Store(error.to_string()))?;
        let digest = type_assignment_assertion_digest(&assertion);
        let assigned_at = clock_micros();
        let end_bind = payload.valid_end_micros;
        sqlx::query(
            "INSERT INTO world_type_assignments (
                assignment_id, world_id, entity_id, object_type,
                valid_start_micros, valid_end_micros, evidence_ref, receipt_id,
                assertion_digest, assigned_at_micros
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
             ON CONFLICT (assignment_id) DO NOTHING",
        )
        .bind(&assignment_id)
        .bind(object.world.as_str())
        .bind(object.entity.as_str())
        .bind(object_type.as_str())
        .bind(payload.valid_start_micros)
        .bind(end_bind)
        .bind(evidence.as_str())
        .bind(receipt_id)
        .bind(&digest)
        .bind(assigned_at)
        .execute(self.pool())
        .await
        .map_err(|error| KernelError::Store(error.to_string()))?;
        for grant in &payload.grants {
            sqlx::query(
                "INSERT INTO world_typed_object_grants (
                    world_id, entity_id, object_type, principal_id, membership_id
                 ) VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT DO NOTHING",
            )
            .bind(object.world.as_str())
            .bind(object.entity.as_str())
            .bind(object_type.as_str())
            .bind(&grant.principal_id)
            .bind(&grant.membership_id)
            .execute(self.pool())
            .await
            .map_err(|error| KernelError::Store(error.to_string()))?;
        }
        Ok(Some(TypeAssignment {
            id: TypeAssignmentId::parse(&assignment_id)
                .map_err(|error| KernelError::Store(error.to_string()))?,
            assertion,
            evidence,
        }))
    }

    /// Query typed objects that have a verified `TypeAssignment` covering `valid_at`.
    ///
    /// Authorize-before-discovery: only granted `ObjectKey` values are visible.
    ///
    /// # Errors
    ///
    /// Returns [`KernelError`] when policy denies or the store fails.
    pub async fn query_typed_objects(
        &self,
        world: &WorldId,
        principal: &PrincipalId,
        membership: &str,
        object_type: &str,
        valid_at_micros: i64,
    ) -> Result<KernelTypedObjectPage, KernelError> {
        let _ = self.catalog_basis(world).await?;
        let is_world_authority =
            principal_may_publish(principal) || principal_may_activate(principal);
        if !is_world_authority
            && !principal_has_typed_grant(self, world, principal, membership, object_type).await?
        {
            return Err(KernelError::Denied(
                "typed query denied: no TypeAssignment grant for this Membership".to_owned(),
            ));
        }
        let rows = if is_world_authority {
            sqlx::query(
                "SELECT ta.assignment_id, ta.world_id, ta.entity_id, ta.object_type,
                        ta.evidence_ref, ta.valid_start_micros, ta.valid_end_micros
                 FROM world_type_assignments ta
                 WHERE ta.world_id = $1
                   AND ta.object_type = $2
                   AND ta.valid_start_micros <= $3
                   AND (ta.valid_end_micros IS NULL OR ta.valid_end_micros > $3)
                 ORDER BY ta.entity_id ASC",
            )
            .bind(world.as_str())
            .bind(object_type)
            .bind(valid_at_micros)
            .fetch_all(self.pool())
            .await
            .map_err(|error| KernelError::Store(error.to_string()))?
        } else {
            sqlx::query(
                "SELECT ta.assignment_id, ta.world_id, ta.entity_id, ta.object_type,
                        ta.evidence_ref, ta.valid_start_micros, ta.valid_end_micros
                 FROM world_type_assignments ta
                 INNER JOIN world_typed_object_grants g
                    ON g.world_id = ta.world_id
                   AND g.entity_id = ta.entity_id
                   AND g.object_type = ta.object_type
                 WHERE ta.world_id = $1
                   AND ta.object_type = $2
                   AND g.principal_id = $3
                   AND g.membership_id = $4
                   AND ta.valid_start_micros <= $5
                   AND (ta.valid_end_micros IS NULL OR ta.valid_end_micros > $5)
                 ORDER BY ta.entity_id ASC",
            )
            .bind(world.as_str())
            .bind(object_type)
            .bind(principal.as_str())
            .bind(membership)
            .bind(valid_at_micros)
            .fetch_all(self.pool())
            .await
            .map_err(|error| KernelError::Store(error.to_string()))?
        };

        let objects = rows
            .iter()
            .map(|row| row_to_typed_object(row, object_type, valid_at_micros))
            .collect::<Result<Vec<_>, _>>()?;
        let authorized_count = objects.len() as u64;
        Ok(KernelTypedObjectPage {
            world: world.as_str().to_owned(),
            object_type: object_type.to_owned(),
            valid_at_micros,
            objects,
            authorized_count,
        })
    }

    /// `FIN-01`: resolve an identifier to typed candidates without selecting the first match.
    ///
    /// # Errors
    ///
    /// Returns [`KernelError`] when discovery is denied or the store fails.
    pub async fn resolve_identifier(
        &self,
        world: &WorldId,
        principal: &PrincipalId,
        membership: &str,
        scheme: &str,
        query: &str,
        valid_at_micros: i64,
    ) -> Result<KernelIdentityResolve, KernelError> {
        let _ = self.catalog_basis(world).await?;
        let entitled = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*)::bigint FROM world_discovery_entitlements
             WHERE world_id = $1 AND principal_id = $2 AND membership_id = $3 AND scheme = $4",
        )
        .bind(world.as_str())
        .bind(principal.as_str())
        .bind(membership)
        .bind(scheme)
        .fetch_one(self.pool())
        .await
        .map_err(|error| KernelError::Store(error.to_string()))?;
        if entitled == 0 && !(principal_may_publish(principal) || principal_may_activate(principal))
        {
            // Denial: no candidate, count, or distinguishing error.
            return Err(KernelError::Denied("discovery denied".to_owned()));
        }
        let rows = sqlx::query(
            "SELECT i.assignment_id AS identifier_assignment_id,
                    i.world_id, i.entity_id, i.scheme, i.value, i.venue, i.currency,
                    i.identifier_level, i.evidence_ref AS id_evidence,
                    i.valid_start_micros, i.valid_end_micros,
                    t.assignment_id AS type_assignment_id, t.object_type
             FROM world_identifier_assignments i
             INNER JOIN world_type_assignments t
                ON t.assignment_id = i.type_assignment_id
             WHERE i.world_id = $1
               AND i.scheme = $2
               AND lower(i.value) = lower($3)
               AND i.valid_start_micros <= $4
               AND (i.valid_end_micros IS NULL OR i.valid_end_micros > $4)
               AND t.valid_start_micros <= $4
               AND (t.valid_end_micros IS NULL OR t.valid_end_micros > $4)
             ORDER BY i.venue NULLS LAST, i.entity_id ASC",
        )
        .bind(world.as_str())
        .bind(scheme)
        .bind(query)
        .bind(valid_at_micros)
        .fetch_all(self.pool())
        .await
        .map_err(|error| KernelError::Store(error.to_string()))?;

        let candidates = rows
            .iter()
            .map(row_to_identity_candidate)
            .collect::<Result<Vec<_>, _>>()?;
        Ok(KernelIdentityResolve {
            query: query.to_owned(),
            fin01_artifact: fin01_artifact(query, scheme, &candidates),
            candidates,
            selected: None,
        })
    }

    /// Builder/owner plants a temporal `TypeAssignment` (clinic fixture path).
    ///
    /// # Errors
    ///
    /// Returns [`KernelError`] when the principal cannot plant or the ObjectKey is missing.
    pub async fn plant_type_assignment(
        &self,
        world: &WorldId,
        principal: &PrincipalId,
        input: &PlantTypeAssignmentInput<'_>,
    ) -> Result<TypeAssignment, KernelError> {
        if !(principal_may_publish(principal) || principal_may_activate(principal)) {
            return Err(KernelError::Denied(
                "only builder or owner may plant TypeAssignment".to_owned(),
            ));
        }
        let _ = self.catalog_basis(world).await?;
        let object = ObjectKey::parse(world.as_str(), input.entity_id)
            .map_err(|error| KernelError::Store(error.to_string()))?;
        let object_type_id = TypeId::parse(input.object_type)
            .map_err(|error| KernelError::Store(error.to_string()))?;
        let valid_time = match input.valid_end_micros {
            Some(end) => ValidTime::interval(
                TimestampMicros::new(input.valid_start_micros),
                TimestampMicros::new(end),
            )
            .map_err(|error| KernelError::Store(error.to_string()))?,
            None => ValidTime::interval(
                TimestampMicros::new(input.valid_start_micros),
                TimestampMicros::new(i64::MAX),
            )
            .map_err(|error| KernelError::Store(error.to_string()))?,
        };
        let assertion = TypeAssignmentAssertion {
            object: object.clone(),
            object_type: object_type_id.clone(),
            valid_time,
        };
        let evidence = EvidenceRef::parse(input.evidence_ref)
            .map_err(|error| KernelError::Store(error.to_string()))?;
        let digest = type_assignment_assertion_digest(&assertion);
        let assigned_at = clock_micros();
        sqlx::query(
            "INSERT INTO world_type_assignments (
                assignment_id, world_id, entity_id, object_type,
                valid_start_micros, valid_end_micros, evidence_ref, receipt_id,
                assertion_digest, assigned_at_micros
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,$8,$9)
             ON CONFLICT (assignment_id) DO NOTHING",
        )
        .bind(input.assignment_id)
        .bind(object.world.as_str())
        .bind(object.entity.as_str())
        .bind(object_type_id.as_str())
        .bind(input.valid_start_micros)
        .bind(input.valid_end_micros)
        .bind(evidence.as_str())
        .bind(&digest)
        .bind(assigned_at)
        .execute(self.pool())
        .await
        .map_err(|error| KernelError::Store(error.to_string()))?;
        for grant in input.grants {
            sqlx::query(
                "INSERT INTO world_typed_object_grants (
                    world_id, entity_id, object_type, principal_id, membership_id
                 ) VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT DO NOTHING",
            )
            .bind(object.world.as_str())
            .bind(object.entity.as_str())
            .bind(object_type_id.as_str())
            .bind(&grant.principal_id)
            .bind(&grant.membership_id)
            .execute(self.pool())
            .await
            .map_err(|error| KernelError::Store(error.to_string()))?;
        }
        Ok(TypeAssignment {
            id: TypeAssignmentId::parse(input.assignment_id)
                .map_err(|error| KernelError::Store(error.to_string()))?,
            assertion,
            evidence,
        })
    }

    /// Load a `TypeAssignment` by id for explain/query proof.
    ///
    /// # Errors
    ///
    /// Returns [`KernelError`] when the row is missing or malformed.
    pub async fn get_type_assignment(
        &self,
        assignment_id: &str,
    ) -> Result<Option<TypeAssignment>, KernelError> {
        let row = sqlx::query(
            "SELECT assignment_id, world_id, entity_id, object_type,
                    valid_start_micros, valid_end_micros, evidence_ref
             FROM world_type_assignments WHERE assignment_id = $1",
        )
        .bind(assignment_id)
        .fetch_optional(self.pool())
        .await
        .map_err(|error| KernelError::Store(error.to_string()))?;
        let Some(row) = row else {
            return Ok(None);
        };
        let valid_start = row
            .try_get::<i64, _>("valid_start_micros")
            .map_err(|error| KernelError::Store(error.to_string()))?;
        let valid_end = row
            .try_get::<Option<i64>, _>("valid_end_micros")
            .map_err(|error| KernelError::Store(error.to_string()))?;
        Ok(Some(TypeAssignment {
            id: TypeAssignmentId::parse(
                row.try_get::<String, _>("assignment_id")
                    .map_err(|error| KernelError::Store(error.to_string()))?,
            )
            .map_err(|error| KernelError::Store(error.to_string()))?,
            assertion: TypeAssignmentAssertion {
                object: ObjectKey::parse(
                    row.try_get::<String, _>("world_id")
                        .map_err(|error| KernelError::Store(error.to_string()))?,
                    row.try_get::<String, _>("entity_id")
                        .map_err(|error| KernelError::Store(error.to_string()))?,
                )
                .map_err(|error| KernelError::Store(error.to_string()))?,
                object_type: TypeId::parse(
                    row.try_get::<String, _>("object_type")
                        .map_err(|error| KernelError::Store(error.to_string()))?,
                )
                .map_err(|error| KernelError::Store(error.to_string()))?,
                valid_time: match valid_end {
                    Some(end) => ValidTime::interval(
                        TimestampMicros::new(valid_start),
                        TimestampMicros::new(end),
                    )
                    .map_err(|error| KernelError::Store(error.to_string()))?,
                    None => ValidTime::interval(
                        TimestampMicros::new(valid_start),
                        TimestampMicros::new(i64::MAX),
                    )
                    .map_err(|error| KernelError::Store(error.to_string()))?,
                },
            },
            evidence: EvidenceRef::parse(
                row.try_get::<String, _>("evidence_ref")
                    .map_err(|error| KernelError::Store(error.to_string()))?,
            )
            .map_err(|error| KernelError::Store(error.to_string()))?,
        }))
    }
}

#[derive(Clone, Debug)]
struct TypedKnowledgePayload {
    world: String,
    entity: String,
    object_type: String,
    assignment_id: String,
    evidence_ref: String,
    valid_start_micros: i64,
    valid_end_micros: Option<i64>,
    grants: Vec<TypedGrantPayload>,
}

#[derive(Clone, Debug)]
struct TypedGrantPayload {
    principal_id: String,
    membership_id: String,
}

fn valid_time_from_bounds(start: i64, end: Option<i64>) -> Result<ValidTime, KernelError> {
    match end {
        Some(end) => ValidTime::interval(TimestampMicros::new(start), TimestampMicros::new(end))
            .map_err(|error| KernelError::Store(error.to_string())),
        None => ValidTime::interval(TimestampMicros::new(start), TimestampMicros::new(i64::MAX))
            .map_err(|error| KernelError::Store(error.to_string())),
    }
}

fn row_to_typed_object(
    row: &sqlx::postgres::PgRow,
    object_type: &str,
    valid_at_micros: i64,
) -> Result<KernelTypedObject, KernelError> {
    let type_id = row
        .try_get::<String, _>("object_type")
        .map_err(|error| KernelError::Store(error.to_string()))?;
    let assignment_id = row
        .try_get::<String, _>("assignment_id")
        .map_err(|error| KernelError::Store(error.to_string()))?;
    let entity = row
        .try_get::<String, _>("entity_id")
        .map_err(|error| KernelError::Store(error.to_string()))?;
    let world_id = row
        .try_get::<String, _>("world_id")
        .map_err(|error| KernelError::Store(error.to_string()))?;
    let evidence_ref = row
        .try_get::<String, _>("evidence_ref")
        .map_err(|error| KernelError::Store(error.to_string()))?;
    let valid_start_micros = row
        .try_get::<i64, _>("valid_start_micros")
        .map_err(|error| KernelError::Store(error.to_string()))?;
    let valid_end_micros = row
        .try_get::<Option<i64>, _>("valid_end_micros")
        .map_err(|error| KernelError::Store(error.to_string()))?;
    if type_id != object_type {
        return Err(KernelError::Conflict(
            "TypeAssignment does not support requested type".to_owned(),
        ));
    }
    let assignment = TypeAssignment {
        id: TypeAssignmentId::parse(&assignment_id)
            .map_err(|error| KernelError::Store(error.to_string()))?,
        assertion: TypeAssignmentAssertion {
            object: ObjectKey::parse(&world_id, &entity)
                .map_err(|error| KernelError::Store(error.to_string()))?,
            object_type: TypeId::parse(&type_id)
                .map_err(|error| KernelError::Store(error.to_string()))?,
            valid_time: valid_time_from_bounds(valid_start_micros, valid_end_micros)?,
        },
        evidence: EvidenceRef::parse(&evidence_ref)
            .map_err(|error| KernelError::Store(error.to_string()))?,
    };
    let typed = TypedObjectRef::verified(
        &assignment,
        &TypeId::parse(object_type).map_err(|error| KernelError::Store(error.to_string()))?,
        TimestampMicros::new(valid_at_micros),
    )
    .map_err(|error| KernelError::Denied(error.to_string()))?;
    Ok(KernelTypedObject {
        key_world: typed.key.world.as_str().to_owned(),
        key_entity: typed.key.entity.as_str().to_owned(),
        type_id: typed.type_id.as_str().to_owned(),
        assignment_id: typed.assignment.as_str().to_owned(),
        evidence_ref,
        valid_start_micros,
        valid_end_micros,
    })
}

fn row_to_identity_candidate(
    row: &sqlx::postgres::PgRow,
) -> Result<KernelIdentityCandidate, KernelError> {
    Ok(KernelIdentityCandidate {
        world: row
            .try_get::<String, _>("world_id")
            .map_err(|error| KernelError::Store(error.to_string()))?,
        entity: row
            .try_get::<String, _>("entity_id")
            .map_err(|error| KernelError::Store(error.to_string()))?,
        type_id: row
            .try_get::<String, _>("object_type")
            .map_err(|error| KernelError::Store(error.to_string()))?,
        assignment_id: row
            .try_get::<String, _>("type_assignment_id")
            .map_err(|error| KernelError::Store(error.to_string()))?,
        venue: row
            .try_get::<Option<String>, _>("venue")
            .map_err(|error| KernelError::Store(error.to_string()))?,
        currency: row
            .try_get::<Option<String>, _>("currency")
            .map_err(|error| KernelError::Store(error.to_string()))?,
        identifier_level: row
            .try_get::<String, _>("identifier_level")
            .map_err(|error| KernelError::Store(error.to_string()))?,
        identifier_scheme: row
            .try_get::<String, _>("scheme")
            .map_err(|error| KernelError::Store(error.to_string()))?,
        identifier_value: row
            .try_get::<String, _>("value")
            .map_err(|error| KernelError::Store(error.to_string()))?,
        evidence_ref: row
            .try_get::<String, _>("id_evidence")
            .map_err(|error| KernelError::Store(error.to_string()))?,
        valid_start_micros: row
            .try_get::<i64, _>("valid_start_micros")
            .map_err(|error| KernelError::Store(error.to_string()))?,
        valid_end_micros: row
            .try_get::<Option<i64>, _>("valid_end_micros")
            .map_err(|error| KernelError::Store(error.to_string()))?,
    })
}

fn fin01_artifact(query: &str, scheme: &str, candidates: &[KernelIdentityCandidate]) -> String {
    format!(
        "{{\"gate\":\"FIN-01\",\"query\":{},\"scheme\":{},\"candidateCount\":{},\"selected\":null,\"silentFirstMatch\":false,\"candidates\":[{}]}}",
        json_escape(query),
        json_escape(scheme),
        candidates.len(),
        candidates
            .iter()
            .map(|c| {
                format!(
                    "{{\"objectKey\":{{\"world\":{},\"entity\":{}}},\"typeId\":{},\"assignmentId\":{},\"venue\":{},\"currency\":{},\"identifierLevel\":{},\"evidenceRef\":{},\"validStartMicros\":{},\"validEndMicros\":{}}}",
                    json_escape(&c.world),
                    json_escape(&c.entity),
                    json_escape(&c.type_id),
                    json_escape(&c.assignment_id),
                    opt_json(c.venue.as_deref()),
                    opt_json(c.currency.as_deref()),
                    json_escape(&c.identifier_level),
                    json_escape(&c.evidence_ref),
                    c.valid_start_micros,
                    match c.valid_end_micros {
                        Some(v) => v.to_string(),
                        None => "null".to_owned(),
                    }
                )
            })
            .collect::<Vec<_>>()
            .join(",")
    )
}

fn parse_typed_knowledge(input_jcs: &str) -> Result<Option<TypedKnowledgePayload>, KernelError> {
    let value: serde_json::Value = serde_json::from_str(input_jcs)
        .map_err(|error| KernelError::Store(format!("proposal input is not JSON: {error}")))?;
    let schema = value.get("schema").and_then(|v| v.as_str()).unwrap_or("");
    if schema != "zoen.typed-knowledge.v1" {
        return Ok(None);
    }
    let object = value
        .get("objectKey")
        .ok_or_else(|| KernelError::Store("typed knowledge missing objectKey".to_owned()))?;
    let type_assignment = value
        .get("typeAssignment")
        .ok_or_else(|| KernelError::Store("typed knowledge missing typeAssignment".to_owned()))?;
    // Hard lock: refuse the Membership label for type evidence.
    if type_assignment.get("membership").is_some()
        || value.get("typeMembership").is_some()
        || schema.contains("membership")
    {
        return Err(KernelError::Conflict(
            "TypeAssignment must not be called Membership".to_owned(),
        ));
    }
    let mut grants = Vec::new();
    if let Some(items) = value.get("grants").and_then(|v| v.as_array()) {
        for item in items {
            grants.push(TypedGrantPayload {
                principal_id: item
                    .get("principalId")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| KernelError::Store("grant.principalId required".to_owned()))?
                    .to_owned(),
                membership_id: item
                    .get("membershipId")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| KernelError::Store("grant.membershipId required".to_owned()))?
                    .to_owned(),
            });
        }
    }
    Ok(Some(TypedKnowledgePayload {
        world: object
            .get("world")
            .and_then(|v| v.as_str())
            .ok_or_else(|| KernelError::Store("objectKey.world required".to_owned()))?
            .to_owned(),
        entity: object
            .get("entity")
            .and_then(|v| v.as_str())
            .ok_or_else(|| KernelError::Store("objectKey.entity required".to_owned()))?
            .to_owned(),
        object_type: type_assignment
            .get("objectType")
            .and_then(|v| v.as_str())
            .ok_or_else(|| KernelError::Store("typeAssignment.objectType required".to_owned()))?
            .to_owned(),
        assignment_id: type_assignment
            .get("assignmentId")
            .and_then(|v| v.as_str())
            .ok_or_else(|| KernelError::Store("typeAssignment.assignmentId required".to_owned()))?
            .to_owned(),
        evidence_ref: value
            .get("evidenceRef")
            .and_then(|v| v.as_str())
            .ok_or_else(|| KernelError::Store("evidenceRef required".to_owned()))?
            .to_owned(),
        valid_start_micros: type_assignment
            .get("validStartMicros")
            .and_then(serde_json::Value::as_i64)
            .ok_or_else(|| {
                KernelError::Store("typeAssignment.validStartMicros required".to_owned())
            })?,
        valid_end_micros: type_assignment
            .get("validEndMicros")
            .and_then(|v| {
                if v.is_null() {
                    Some(None)
                } else {
                    v.as_i64().map(Some)
                }
            })
            .unwrap_or(None),
        grants,
    }))
}

async fn principal_has_typed_grant(
    kernel: &PostgresWorldKernel,
    world: &WorldId,
    principal: &PrincipalId,
    membership: &str,
    object_type: &str,
) -> Result<bool, KernelError> {
    let count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*)::bigint FROM world_typed_object_grants
         WHERE world_id = $1 AND principal_id = $2 AND membership_id = $3 AND object_type = $4",
    )
    .bind(world.as_str())
    .bind(principal.as_str())
    .bind(membership)
    .bind(object_type)
    .fetch_one(kernel.pool())
    .await
    .map_err(|error| KernelError::Store(error.to_string()))?;
    Ok(count > 0)
}

fn json_escape(value: &str) -> String {
    let escaped = value.replace('\\', "\\\\").replace('"', "\\\"");
    format!("\"{escaped}\"")
}

fn opt_json(value: Option<&str>) -> String {
    value.map_or_else(|| "null".to_owned(), json_escape)
}
