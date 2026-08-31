use std::{
    collections::BTreeMap,
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Postgres, Row, Transaction};
use zoen_core::{
    ActionId, ActivatedDefinitionRef, CapabilityGrant, DefinitionDigest, DefinitionId,
    DegradationDecl, EvolutionAckDigest, FirstSuccessContract, FirstSuccessContractId,
    FirstSuccessEval, FirstSuccessOutcome, GrantId, GrantStatus, InstallId, InstallPhase,
    InstallPhaseKind, InstallReceipt, IntegrationKind, IntegrationRequirement, Necessity,
    OntologyDependency, OntologyImpactLine, OntologyImpactStatus, PACK_FORMAT_V1, PackDigest,
    PackError, PackId, PackManifest, PackPresentation, PackUpdatePermissionDiff, PackVersion,
    PermissionImpactPreview, PreviewDigest, PublicKeyId, PublisherId, PublisherIdentity,
    RelationId, RequirementId, RequirementImpactLine, Sensitivity, SignatureEvidence, TenantId,
    TimestampMicros, required_grants_accepted,
};

use crate::set_tenant;

#[derive(Clone)]
pub struct PostgresPackStore {
    pool: PgPool,
}

impl PostgresPackStore {
    #[must_use]
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// # Errors
    ///
    /// Returns [`PackError`] when `PostgreSQL` is unavailable or the pack cannot be admitted.
    pub async fn verify_and_stage(
        &self,
        tenant_id: &TenantId,
        staged_by: &str,
        manifest_bytes: &[u8],
        expected_digest: Option<&PackDigest>,
        ontology_artifacts: &[(DefinitionId, DefinitionDigest, String)],
    ) -> Result<(PackDigest, PackManifest), PackError> {
        let (digest, mut manifest) = admit_pack(manifest_bytes, expected_digest)?;
        bind_pack_ontology(&mut manifest, ontology_artifacts)?;
        let mut transaction = self.pool.begin().await.map_err(store)?;
        set_tenant(&mut transaction, tenant_id)
            .await
            .map_err(|error| PackError::Store(error.to_string()))?;

        let existing = sqlx::query(
            "SELECT manifest_jcs FROM pack_artifacts
             WHERE tenant_id = $1 AND pack_digest = $2",
        )
        .bind(tenant_id.as_str())
        .bind(digest.as_str())
        .fetch_optional(&mut *transaction)
        .await
        .map_err(store)?;
        if let Some(row) = existing {
            let stored: String = row.try_get("manifest_jcs").map_err(store)?;
            let admitted = serde_jcs::to_string(&PackManifestDocument::from(&manifest))
                .map_err(|error| PackError::Store(error.to_string()))?;
            if stored != admitted {
                return Err(PackError::DigestMismatch);
            }
            transaction.commit().await.map_err(store)?;
            return Ok((digest, manifest));
        }

        let signature_json = manifest
            .signature
            .as_ref()
            .map_or(Value::Null, |signature| {
                serde_json::json!({
                    "algorithm": signature.algorithm,
                    "publicKeyId": signature.public_key_id.as_str(),
                    "signatureB64": signature.signature_b64,
                })
            });
        let lock_document = LockDocument {
            artifacts: manifest
                .ontology_dependencies
                .iter()
                .map(|dependency| LockArtifact {
                    definition_id: dependency.definition_id.as_str().to_owned(),
                    digest: dependency.digest.as_str().to_owned(),
                })
                .collect(),
        };
        let lock_jcs = serde_jcs::to_string(&lock_document)
            .map_err(|error| PackError::Store(error.to_string()))?;
        let manifest_jcs = serde_jcs::to_string(&PackManifestDocument::from(&manifest))
            .map_err(|error| PackError::Store(error.to_string()))?;

        sqlx::query(
            "INSERT INTO pack_artifacts (
                tenant_id, pack_digest, pack_id, pack_version, format_version,
                publisher_id, manifest_jcs, signature_json, lock_jcs, staged_by
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
        )
        .bind(tenant_id.as_str())
        .bind(digest.as_str())
        .bind(manifest.pack_id.as_str())
        .bind(manifest.version.as_str())
        .bind(PACK_FORMAT_V1)
        .bind(manifest.publisher.publisher_id.as_str())
        .bind(&manifest_jcs)
        .bind(signature_json)
        .bind(&lock_jcs)
        .bind(staged_by)
        .execute(&mut *transaction)
        .await
        .map_err(store)?;

        for dependency in &manifest.ontology_dependencies {
            sqlx::query(
                "INSERT INTO pack_ontology_artifacts (
                    tenant_id, pack_digest, definition_id, definition_digest, canonical_json
                 ) VALUES ($1, $2, $3, $4, $5)",
            )
            .bind(tenant_id.as_str())
            .bind(digest.as_str())
            .bind(dependency.definition_id.as_str())
            .bind(dependency.digest.as_str())
            .bind(&dependency.canonical_json)
            .execute(&mut *transaction)
            .await
            .map_err(store)?;
        }

        transaction.commit().await.map_err(store)?;
        Ok((digest, manifest))
    }

    /// # Errors
    ///
    /// Returns [`PackError`] when `PostgreSQL` is unavailable or the pack cannot be admitted.
    pub async fn load_manifest(
        &self,
        tenant_id: &TenantId,
        pack_digest: &PackDigest,
    ) -> Result<PackManifest, PackError> {
        let mut transaction = self.pool.begin().await.map_err(store)?;
        set_tenant(&mut transaction, tenant_id)
            .await
            .map_err(|error| PackError::Store(error.to_string()))?;
        let row = sqlx::query(
            "SELECT manifest_jcs FROM pack_artifacts
             WHERE tenant_id = $1 AND pack_digest = $2",
        )
        .bind(tenant_id.as_str())
        .bind(pack_digest.as_str())
        .fetch_optional(&mut *transaction)
        .await
        .map_err(store)?
        .ok_or(PackError::PackNotFound)?;
        let manifest_jcs: String = row.try_get("manifest_jcs").map_err(store)?;
        let (_, manifest) = admit_pack(manifest_jcs.as_bytes(), Some(pack_digest))?;
        let ontology_rows = sqlx::query(
            "SELECT definition_id, definition_digest, canonical_json
             FROM pack_ontology_artifacts
             WHERE tenant_id = $1 AND pack_digest = $2
             ORDER BY definition_id",
        )
        .bind(tenant_id.as_str())
        .bind(pack_digest.as_str())
        .fetch_all(&mut *transaction)
        .await
        .map_err(store)?;
        let mut by_id = BTreeMap::new();
        for row in ontology_rows {
            let definition_id =
                DefinitionId::parse(row.try_get::<String, _>("definition_id").map_err(store)?)?;
            let digest = DefinitionDigest::parse(
                row.try_get::<String, _>("definition_digest")
                    .map_err(store)?,
            )?;
            let canonical_json: String = row.try_get("canonical_json").map_err(store)?;
            by_id.insert(
                definition_id.as_str().to_owned(),
                OntologyDependency {
                    definition_id,
                    digest,
                    canonical_json,
                },
            );
        }
        let mut manifest = manifest;
        for dependency in &mut manifest.ontology_dependencies {
            if let Some(stored) = by_id.remove(dependency.definition_id.as_str()) {
                *dependency = stored;
            } else {
                return Err(PackError::MissingDependency(
                    dependency.definition_id.as_str().to_owned(),
                ));
            }
        }
        transaction.commit().await.map_err(store)?;
        Ok(manifest)
    }

    /// # Errors
    ///
    /// Returns [`PackError`] when `PostgreSQL` is unavailable or the pack cannot be admitted.
    pub async fn derive_preview(
        &self,
        tenant_id: &TenantId,
        pack_digest: &PackDigest,
    ) -> Result<(PermissionImpactPreview, PreviewDigest), PackError> {
        let manifest = self.load_manifest(tenant_id, pack_digest).await?;
        let mut transaction = self.pool.begin().await.map_err(store)?;
        set_tenant(&mut transaction, tenant_id)
            .await
            .map_err(|error| PackError::Store(error.to_string()))?;

        let mut ontology = Vec::new();
        for dependency in &manifest.ontology_dependencies {
            let active = sqlx::query(
                "SELECT digest FROM active_definition_revisions
                 WHERE tenant_id = $1 AND definition_id = $2",
            )
            .bind(tenant_id.as_str())
            .bind(dependency.definition_id.as_str())
            .fetch_optional(&mut *transaction)
            .await
            .map_err(store)?;
            let status = match active {
                None => OntologyImpactStatus::Missing,
                Some(row) => {
                    let digest: String = row.try_get("digest").map_err(store)?;
                    if digest == dependency.digest.as_str() {
                        OntologyImpactStatus::AlreadyActive
                    } else {
                        OntologyImpactStatus::CompatibleUpgrade
                    }
                }
            };
            ontology.push(OntologyImpactLine {
                definition_id: dependency.definition_id.clone(),
                digest: dependency.digest.clone(),
                status,
            });
        }
        transaction.commit().await.map_err(store)?;

        let requirements: Vec<_> = manifest
            .integration_requirements
            .iter()
            .map(requirement_impact_line)
            .collect();
        let writes: Vec<_> = requirements
            .iter()
            .filter(|line| line.kind == IntegrationKind::WriteEffect)
            .cloned()
            .collect();
        let reads: Vec<_> = requirements
            .iter()
            .filter(|line| line.kind == IntegrationKind::ReadSource)
            .cloned()
            .collect();
        if writes.is_empty()
            && manifest
                .integration_requirements
                .iter()
                .any(|requirement| requirement.kind == IntegrationKind::WriteEffect)
        {
            return Err(PackError::Store(
                "preview omitted write capability".to_owned(),
            ));
        }
        let preview = PermissionImpactPreview {
            pack_digest: pack_digest.clone(),
            ontology,
            requirements,
            actions_introduced: Vec::new(),
            writes,
            reads,
        };
        let digest = preview_digest(&preview)?;
        Ok((preview, digest))
    }

    /// # Errors
    ///
    /// Returns [`PackError`] when `PostgreSQL` is unavailable or the pack cannot be admitted.
    pub async fn install(
        &self,
        tenant_id: &TenantId,
        pack_digest: &PackDigest,
        preview_digest: &PreviewDigest,
        prior_install_id: Option<&InstallId>,
        decided_by: &str,
    ) -> Result<InstallReceipt, PackError> {
        let (_, expected_preview) = self.derive_preview(tenant_id, pack_digest).await?;
        if expected_preview.as_str() != preview_digest.as_str() {
            return Err(PackError::PreviewStale);
        }
        let manifest = self.load_manifest(tenant_id, pack_digest).await?;
        let install_id = InstallId::parse(format!("install.{}", hex_id()))?;
        let mut transaction = self.pool.begin().await.map_err(store)?;
        set_tenant(&mut transaction, tenant_id)
            .await
            .map_err(|error| PackError::Store(error.to_string()))?;

        sqlx::query(
            "INSERT INTO pack_install_receipts (
                tenant_id, install_id, pack_digest, pack_id, pack_version,
                preview_digest, phase, prior_install_id
             ) VALUES ($1, $2, $3, $4, $5, $6, 'installed', $7)",
        )
        .bind(tenant_id.as_str())
        .bind(install_id.as_str())
        .bind(pack_digest.as_str())
        .bind(manifest.pack_id.as_str())
        .bind(manifest.version.as_str())
        .bind(preview_digest.as_str())
        .bind(prior_install_id.map(InstallId::as_str))
        .execute(&mut *transaction)
        .await
        .map_err(store)?;

        let mut grants = Vec::new();
        for requirement in &manifest.integration_requirements {
            let grant_id =
                GrantId::parse(format!("grant.{}", requirement.requirement_id.as_str()))?;
            let (necessity, degrade_json): (&str, Option<Value>) = match &requirement.necessity {
                Necessity::Required => ("required", None),
                Necessity::Optional { degrade } => (
                    "optional",
                    Some(serde_json::json!({
                        "mode": degrade.mode,
                        "actionIds": degrade
                            .action_ids
                            .iter()
                            .map(ActionId::as_str)
                            .collect::<Vec<_>>(),
                    })),
                ),
            };
            sqlx::query(
                "INSERT INTO pack_capability_grants (
                    tenant_id, install_id, grant_id, requirement_id, necessity,
                    sensitivity, capability_kind, scope_json, degrade_json, status
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')",
            )
            .bind(tenant_id.as_str())
            .bind(install_id.as_str())
            .bind(grant_id.as_str())
            .bind(requirement.requirement_id.as_str())
            .bind(necessity)
            .bind(requirement.sensitivity.as_str())
            .bind(requirement.kind.as_str())
            .bind(serde_json::json!({ "scope": requirement.scope }))
            .bind(degrade_json)
            .execute(&mut *transaction)
            .await
            .map_err(store)?;
            grants.push(CapabilityGrant {
                grant_id,
                requirement_id: requirement.requirement_id.clone(),
                necessity: requirement.necessity.clone(),
                sensitivity: requirement.sensitivity,
                kind: requirement.kind,
                scope: requirement.scope.clone(),
                status: GrantStatus::Pending,
            });
        }

        transaction.commit().await.map_err(store)?;
        let _ = decided_by;
        Ok(InstallReceipt {
            install_id,
            tenant_id: tenant_id.clone(),
            pack_digest: pack_digest.clone(),
            pack_id: manifest.pack_id,
            pack_version: manifest.version,
            preview_digest: preview_digest.clone(),
            phase: InstallPhase::Installed,
            grants,
            prior_install_id: prior_install_id.cloned(),
        })
    }

    /// # Errors
    ///
    /// Returns [`PackError`] when `PostgreSQL` is unavailable or the pack cannot be admitted.
    pub async fn get_install(
        &self,
        tenant_id: &TenantId,
        install_id: &InstallId,
    ) -> Result<InstallReceipt, PackError> {
        let mut transaction = self.pool.begin().await.map_err(store)?;
        set_tenant(&mut transaction, tenant_id)
            .await
            .map_err(|error| PackError::Store(error.to_string()))?;
        let receipt = load_receipt(&mut transaction, tenant_id, install_id).await?;
        transaction.commit().await.map_err(store)?;
        Ok(receipt)
    }

    /// # Errors
    ///
    /// Returns [`PackError`] when `PostgreSQL` is unavailable or the pack cannot be admitted.
    pub async fn decide_grants(
        &self,
        tenant_id: &TenantId,
        install_id: &InstallId,
        decisions: &[(GrantId, bool)],
        decided_by: &str,
    ) -> Result<InstallReceipt, PackError> {
        let mut transaction = self.pool.begin().await.map_err(store)?;
        set_tenant(&mut transaction, tenant_id)
            .await
            .map_err(|error| PackError::Store(error.to_string()))?;
        let mut receipt = load_receipt(&mut transaction, tenant_id, install_id).await?;
        if !matches!(
            receipt.phase,
            InstallPhase::Installed | InstallPhase::GrantsResolved
        ) {
            return Err(PackError::InvalidPhaseTransition(
                "grants can only be decided before activation".to_owned(),
            ));
        }
        let now = now_micros();
        for (grant_id, accept) in decisions {
            let status = if *accept { "accepted" } else { "declined" };
            let updated = sqlx::query(
                "UPDATE pack_capability_grants
                 SET status = $1, decided_at = to_timestamp($2::double precision / 1000000.0),
                     decided_by = $3
                 WHERE tenant_id = $4 AND install_id = $5 AND grant_id = $6 AND status = 'pending'",
            )
            .bind(status)
            .bind(now.get())
            .bind(decided_by)
            .bind(tenant_id.as_str())
            .bind(install_id.as_str())
            .bind(grant_id.as_str())
            .execute(&mut *transaction)
            .await
            .map_err(store)?;
            if updated.rows_affected() == 0 {
                return Err(PackError::Store(format!(
                    "grant {} was not pending",
                    grant_id.as_str()
                )));
            }
        }
        receipt = load_receipt(&mut transaction, tenant_id, install_id).await?;
        for grant in &receipt.grants {
            if matches!(grant.necessity, Necessity::Required)
                && matches!(grant.status, GrantStatus::Declined { .. })
            {
                return Err(PackError::RequiredGrantDeclined(
                    grant.requirement_id.as_str().to_owned(),
                ));
            }
        }
        if required_grants_accepted(&receipt.grants) {
            sqlx::query(
                "UPDATE pack_install_receipts
                 SET phase = 'grants_resolved', updated_at = clock_timestamp()
                 WHERE tenant_id = $1 AND install_id = $2",
            )
            .bind(tenant_id.as_str())
            .bind(install_id.as_str())
            .execute(&mut *transaction)
            .await
            .map_err(store)?;
            receipt.phase = InstallPhase::GrantsResolved;
        }
        transaction.commit().await.map_err(store)?;
        Ok(receipt)
    }

    /// # Errors
    ///
    /// Returns [`PackError`] when `PostgreSQL` is unavailable or the pack cannot be admitted.
    pub async fn mark_activating(
        &self,
        tenant_id: &TenantId,
        install_id: &InstallId,
        evolution_ack_digest: &EvolutionAckDigest,
    ) -> Result<InstallReceipt, PackError> {
        let mut transaction = self.pool.begin().await.map_err(store)?;
        set_tenant(&mut transaction, tenant_id)
            .await
            .map_err(|error| PackError::Store(error.to_string()))?;
        let receipt = load_receipt(&mut transaction, tenant_id, install_id).await?;
        match receipt.phase {
            InstallPhase::GrantsResolved | InstallPhase::Activating => {}
            InstallPhase::Active { .. } => {
                transaction.commit().await.map_err(store)?;
                return Ok(receipt);
            }
            _ => {
                return Err(PackError::InvalidPhaseTransition(
                    "activate requires grants_resolved".to_owned(),
                ));
            }
        }
        if !required_grants_accepted(&receipt.grants) {
            return Err(PackError::GrantsUnresolved);
        }
        sqlx::query(
            "UPDATE pack_install_receipts
             SET phase = 'activating', evolution_ack_digest = $1, updated_at = clock_timestamp()
             WHERE tenant_id = $2 AND install_id = $3",
        )
        .bind(evolution_ack_digest.as_str())
        .bind(tenant_id.as_str())
        .bind(install_id.as_str())
        .execute(&mut *transaction)
        .await
        .map_err(store)?;
        transaction.commit().await.map_err(store)?;
        self.get_install(tenant_id, install_id).await
    }

    /// # Errors
    ///
    /// Returns [`PackError`] when `PostgreSQL` is unavailable or the pack cannot be admitted.
    pub async fn mark_active(
        &self,
        tenant_id: &TenantId,
        install_id: &InstallId,
        activated: Vec<ActivatedDefinitionRef>,
    ) -> Result<InstallReceipt, PackError> {
        let mut transaction = self.pool.begin().await.map_err(store)?;
        set_tenant(&mut transaction, tenant_id)
            .await
            .map_err(|error| PackError::Store(error.to_string()))?;
        let receipt = load_receipt(&mut transaction, tenant_id, install_id).await?;
        if matches!(receipt.phase, InstallPhase::Active { .. }) {
            transaction.commit().await.map_err(store)?;
            return Ok(receipt);
        }
        if !matches!(
            receipt.phase,
            InstallPhase::Activating | InstallPhase::GrantsResolved
        ) {
            return Err(PackError::InvalidPhaseTransition(
                "mark_active requires activating".to_owned(),
            ));
        }
        let refs = serde_json::json!(
            activated
                .iter()
                .map(|item| serde_json::json!({
                    "definitionId": item.definition_id.as_str(),
                    "digest": item.digest.as_str(),
                }))
                .collect::<Vec<_>>()
        );
        if let Some(prior) = &receipt.prior_install_id {
            sqlx::query(
                "UPDATE pack_install_receipts
                 SET phase = 'superseded', superseded_by = $1, updated_at = clock_timestamp()
                 WHERE tenant_id = $2 AND install_id = $3 AND phase = 'active'",
            )
            .bind(install_id.as_str())
            .bind(tenant_id.as_str())
            .bind(prior.as_str())
            .execute(&mut *transaction)
            .await
            .map_err(store)?;
        }
        sqlx::query(
            "UPDATE pack_install_receipts
             SET phase = 'active', activated_definition_refs = $1, updated_at = clock_timestamp()
             WHERE tenant_id = $2 AND install_id = $3",
        )
        .bind(refs)
        .bind(tenant_id.as_str())
        .bind(install_id.as_str())
        .execute(&mut *transaction)
        .await
        .map_err(store)?;
        transaction.commit().await.map_err(store)?;
        self.get_install(tenant_id, install_id).await
    }

    /// # Errors
    ///
    /// Returns [`PackError`] when `PostgreSQL` is unavailable or the pack cannot be admitted.
    pub async fn permission_diff(
        &self,
        tenant_id: &TenantId,
        from_digest: &PackDigest,
        to_digest: &PackDigest,
    ) -> Result<PackUpdatePermissionDiff, PackError> {
        let from = self.load_manifest(tenant_id, from_digest).await?;
        let to = self.load_manifest(tenant_id, to_digest).await?;
        let from_ids: BTreeMap<_, _> = from
            .integration_requirements
            .iter()
            .map(|requirement| (requirement.requirement_id.as_str().to_owned(), requirement))
            .collect();
        let mut added_sensitive = Vec::new();
        for requirement in &to.integration_requirements {
            if from_ids.contains_key(requirement.requirement_id.as_str()) {
                continue;
            }
            if requirement.sensitivity == Sensitivity::Sensitive
                || requirement.kind == IntegrationKind::WriteEffect
            {
                added_sensitive.push(requirement.requirement_id.clone());
            }
        }
        let reauthorization_required = !added_sensitive.is_empty();
        Ok(PackUpdatePermissionDiff {
            added_sensitive,
            reauthorization_required,
        })
    }

    /// # Errors
    ///
    /// Returns [`PackError`] when `PostgreSQL` is unavailable or the pack cannot be admitted.
    pub async fn evaluate_first_success(
        &self,
        tenant_id: &TenantId,
        install_id: &InstallId,
    ) -> Result<FirstSuccessEval, PackError> {
        let receipt = self.get_install(tenant_id, install_id).await?;
        if !matches!(receipt.phase, InstallPhase::Active { .. }) {
            return Ok(FirstSuccessEval::NotReady);
        }
        let manifest = self.load_manifest(tenant_id, &receipt.pack_digest).await?;
        let mut transaction = self.pool.begin().await.map_err(store)?;
        set_tenant(&mut transaction, tenant_id)
            .await
            .map_err(|error| PackError::Store(error.to_string()))?;
        let existing = sqlx::query(
            "SELECT outcome_ref, (extract(epoch from fired_at) * 1000000)::bigint AS fired_at
             FROM pack_first_success_events
             WHERE tenant_id = $1 AND install_id = $2 AND contract_id = $3",
        )
        .bind(tenant_id.as_str())
        .bind(install_id.as_str())
        .bind(manifest.first_success_contract.contract_id.as_str())
        .fetch_optional(&mut *transaction)
        .await
        .map_err(store)?;
        if let Some(row) = existing {
            let outcome_ref: String = row.try_get("outcome_ref").map_err(store)?;
            let fired_at = TimestampMicros::new(row.try_get::<i64, _>("fired_at").map_err(store)?);
            transaction.commit().await.map_err(store)?;
            return Ok(FirstSuccessEval::Matched {
                outcome_ref,
                fired_at,
            });
        }
        let matched = match &manifest.first_success_contract.outcome {
            FirstSuccessOutcome::ActionCommitted { action_id } => {
                let row = sqlx::query(
                    "SELECT operations.operation_id
                     FROM action_operations AS operations
                     INNER JOIN action_proposals AS proposals
                        ON proposals.tenant_id = operations.tenant_id
                       AND proposals.proposal_id = operations.proposal_id
                     WHERE operations.tenant_id = $1
                       AND proposals.action_id = $2
                     ORDER BY operations.commit_sequence DESC
                     LIMIT 1",
                )
                .bind(tenant_id.as_str())
                .bind(action_id.as_str())
                .fetch_optional(&mut *transaction)
                .await
                .map_err(store)?;
                row.map(|row| row.try_get::<String, _>("operation_id").map_err(store))
                    .transpose()?
            }
            FirstSuccessOutcome::EvidenceRecorded { relation_id } => {
                let row = sqlx::query(
                    "SELECT claim_id FROM semantic_claims
                     WHERE tenant_id = $1 AND relation_id = $2
                     ORDER BY commit_sequence DESC
                     LIMIT 1",
                )
                .bind(tenant_id.as_str())
                .bind(relation_id.as_str())
                .fetch_optional(&mut *transaction)
                .await
                .map_err(store)?;
                row.map(|row| row.try_get::<String, _>("claim_id").map_err(store))
                    .transpose()?
            }
        };
        let Some(outcome_ref) = matched else {
            transaction.commit().await.map_err(store)?;
            return Ok(FirstSuccessEval::NotMatched);
        };
        let now = now_micros();
        sqlx::query(
            "INSERT INTO pack_first_success_events (
                tenant_id, install_id, pack_digest, contract_id, outcome_ref, fired_at
             ) VALUES ($1, $2, $3, $4, $5, to_timestamp($6::double precision / 1000000.0))",
        )
        .bind(tenant_id.as_str())
        .bind(install_id.as_str())
        .bind(receipt.pack_digest.as_str())
        .bind(manifest.first_success_contract.contract_id.as_str())
        .bind(&outcome_ref)
        .bind(now.get())
        .execute(&mut *transaction)
        .await
        .map_err(store)?;
        transaction.commit().await.map_err(store)?;
        Ok(FirstSuccessEval::Matched {
            outcome_ref,
            fired_at: now,
        })
    }
}

fn requirement_impact_line(requirement: &IntegrationRequirement) -> RequirementImpactLine {
    RequirementImpactLine {
        requirement_id: requirement.requirement_id.clone(),
        kind: requirement.kind,
        sensitivity: requirement.sensitivity,
        necessity: requirement.necessity.as_str().to_owned(),
        scope: requirement.scope.clone(),
    }
}

/// # Errors
///
/// Returns [`PackError`] when `PostgreSQL` is unavailable or the pack cannot be admitted.
pub(crate) fn bind_pack_ontology(
    manifest: &mut PackManifest,
    ontology_artifacts: &[(DefinitionId, DefinitionDigest, String)],
) -> Result<(), PackError> {
    let mut artifacts = BTreeMap::new();
    for (definition_id, definition_digest, canonical_json) in ontology_artifacts {
        artifacts.insert(
            definition_id.as_str().to_owned(),
            (definition_digest.clone(), canonical_json.clone()),
        );
    }
    for dependency in &mut manifest.ontology_dependencies {
        let Some((artifact_digest, canonical_json)) =
            artifacts.remove(dependency.definition_id.as_str())
        else {
            return Err(PackError::MissingDependency(
                dependency.definition_id.as_str().to_owned(),
            ));
        };
        if artifact_digest.as_str() != dependency.digest.as_str() {
            return Err(PackError::DigestMismatch);
        }
        let actual = hex_sha256(canonical_json.as_bytes());
        if actual != dependency.digest.as_str() {
            return Err(PackError::DigestMismatch);
        }
        dependency.canonical_json = canonical_json;
    }
    if artifacts.is_empty() {
        Ok(())
    } else {
        Err(PackError::InvalidFormat(
            "unexpected ontology artifacts".to_owned(),
        ))
    }
}

/// Admit a pack manifest byte string.
///
/// # Errors
///
/// Returns [`PackError`] when the bytes are not canonical pack JSON or the
/// digest does not match.
pub fn admit_pack(
    bytes: &[u8],
    expected_digest: Option<&PackDigest>,
) -> Result<(PackDigest, PackManifest), PackError> {
    let raw: Value = serde_json::from_slice(bytes)
        .map_err(|error| PackError::InvalidFormat(error.to_string()))?;
    reject_secret_fields(&raw, "")?;
    let document: PackManifestDocument =
        serde_json::from_value(raw).map_err(|error| PackError::InvalidFormat(error.to_string()))?;
    let manifest = document.clone().into_manifest()?;
    let canonical = serde_jcs::to_vec(&document)
        .map_err(|error| PackError::InvalidFormat(error.to_string()))?;
    if canonical.as_slice() != bytes {
        let as_text = String::from_utf8_lossy(bytes);
        let canonical_text = String::from_utf8_lossy(&canonical);
        if as_text.as_ref() != canonical_text.as_ref() {
            return Err(PackError::NonCanonicalPack);
        }
    }
    let digest = PackDigest::parse(hex_sha256(&canonical))?;
    if let Some(expected) = expected_digest
        && expected.as_str() != digest.as_str()
    {
        return Err(PackError::DigestMismatch);
    }
    Ok((digest, manifest))
}

fn reject_secret_fields(value: &Value, path: &str) -> Result<(), PackError> {
    match value {
        Value::Object(map) => {
            for (key, child) in map {
                let key_lower = key.to_ascii_lowercase();
                if key_lower.contains("secret")
                    || key_lower.contains("password")
                    || key_lower.contains("token")
                    || key_lower == "apikey"
                    || key_lower == "api_key"
                {
                    return Err(PackError::SecretEmbedded(format!("{path}{key}")));
                }
                reject_secret_fields(child, &format!("{path}{key}."))?;
            }
        }
        Value::Array(items) => {
            for (index, child) in items.iter().enumerate() {
                reject_secret_fields(child, &format!("{path}{index}."))?;
            }
        }
        Value::String(text) => {
            if text.contains("://")
                && (text.contains('@') && (text.contains("password") || text.contains("token=")))
            {
                return Err(PackError::SecretEmbedded(path.to_owned()));
            }
        }
        _ => {}
    }
    Ok(())
}

fn preview_digest(preview: &PermissionImpactPreview) -> Result<PreviewDigest, PackError> {
    let document = PreviewDocument::from(preview);
    let bytes =
        serde_jcs::to_vec(&document).map_err(|error| PackError::Store(error.to_string()))?;
    PreviewDigest::parse(hex_sha256(&bytes)).map_err(PackError::from)
}

fn hex_sha256(bytes: &[u8]) -> String {
    zoen_core::encode_hex(Sha256::digest(bytes).as_ref())
}

fn hex_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    format!("{nanos:x}")
}

fn now_micros() -> TimestampMicros {
    TimestampMicros::new(crate::clock_micros())
}

fn store(error: impl std::fmt::Display) -> PackError {
    PackError::Store(error.to_string())
}

fn install_phase_from_row(row: &sqlx::postgres::PgRow) -> Result<InstallPhase, PackError> {
    let phase_text: String = row.try_get("phase").map_err(store)?;
    Ok(match InstallPhaseKind::parse(&phase_text)? {
        InstallPhaseKind::Installed => InstallPhase::Installed,
        InstallPhaseKind::GrantsResolved => InstallPhase::GrantsResolved,
        InstallPhaseKind::Activating => InstallPhase::Activating,
        InstallPhaseKind::Active => {
            let refs: Value = row
                .try_get("activated_definition_refs")
                .unwrap_or(Value::Array(Vec::new()));
            let activated = refs
                .as_array()
                .cloned()
                .unwrap_or_default()
                .into_iter()
                .map(|item| {
                    Ok(ActivatedDefinitionRef {
                        definition_id: DefinitionId::parse(
                            item.get("definitionId")
                                .and_then(Value::as_str)
                                .unwrap_or_default(),
                        )?,
                        digest: DefinitionDigest::parse(
                            item.get("digest")
                                .and_then(Value::as_str)
                                .unwrap_or_default(),
                        )?,
                    })
                })
                .collect::<Result<Vec<_>, PackError>>()?;
            InstallPhase::Active {
                activated,
                activated_at: TimestampMicros::new(
                    row.try_get::<i64, _>("updated_at").map_err(store)?,
                ),
            }
        }
        InstallPhaseKind::Failed => InstallPhase::Failed {
            reason: row
                .try_get::<Option<String>, _>("failure_reason")
                .map_err(store)?
                .unwrap_or_else(|| "failed".to_owned()),
        },
        InstallPhaseKind::Superseded => InstallPhase::Superseded {
            by: InstallId::parse(
                row.try_get::<Option<String>, _>("superseded_by")
                    .map_err(store)?
                    .unwrap_or_else(|| "install.unknown".to_owned()),
            )?,
        },
    })
}

async fn load_capability_grants(
    transaction: &mut Transaction<'_, Postgres>,
    tenant_id: &TenantId,
    install_id: &InstallId,
) -> Result<Vec<CapabilityGrant>, PackError> {
    let grant_rows = sqlx::query(
        "SELECT grant_id, requirement_id, necessity, sensitivity, capability_kind,
                scope_json, degrade_json, status, decided_by,
                (extract(epoch from decided_at) * 1000000)::bigint AS decided_at
         FROM pack_capability_grants
         WHERE tenant_id = $1 AND install_id = $2
         ORDER BY grant_id",
    )
    .bind(tenant_id.as_str())
    .bind(install_id.as_str())
    .fetch_all(&mut **transaction)
    .await
    .map_err(store)?;
    let mut grants = Vec::new();
    for grant_row in grant_rows {
        grants.push(capability_grant_from_row(&grant_row)?);
    }
    Ok(grants)
}

fn capability_grant_from_row(
    grant_row: &sqlx::postgres::PgRow,
) -> Result<CapabilityGrant, PackError> {
    let necessity_text: String = grant_row.try_get("necessity").map_err(store)?;
    let necessity = if necessity_text == "required" {
        Necessity::Required
    } else {
        let degrade: Value = grant_row.try_get("degrade_json").map_err(store)?;
        let mode = degrade
            .get("mode")
            .and_then(Value::as_str)
            .unwrap_or("hide_actions")
            .to_owned();
        let action_ids = degrade
            .get("actionIds")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter_map(|value| value.as_str().map(str::to_owned))
            .map(ActionId::parse)
            .collect::<Result<Vec<_>, _>>()?;
        Necessity::Optional {
            degrade: DegradationDecl { mode, action_ids },
        }
    };
    let status_text: String = grant_row.try_get("status").map_err(store)?;
    let decided_at = TimestampMicros::new(
        grant_row
            .try_get::<Option<i64>, _>("decided_at")
            .map_err(store)?
            .unwrap_or(0),
    );
    let decided_by = grant_row
        .try_get::<Option<String>, _>("decided_by")
        .map_err(store)?
        .unwrap_or_default();
    let status = match status_text.as_str() {
        "pending" => GrantStatus::Pending,
        "accepted" => GrantStatus::Accepted {
            at: decided_at,
            by: decided_by,
        },
        "declined" => GrantStatus::Declined {
            at: decided_at,
            by: decided_by,
        },
        other => return Err(PackError::Store(format!("invalid grant status {other}"))),
    };
    let scope_json: Value = grant_row.try_get("scope_json").map_err(store)?;
    Ok(CapabilityGrant {
        grant_id: GrantId::parse(grant_row.try_get::<String, _>("grant_id").map_err(store)?)?,
        requirement_id: RequirementId::parse(
            grant_row
                .try_get::<String, _>("requirement_id")
                .map_err(store)?,
        )?,
        necessity,
        sensitivity: Sensitivity::parse(
            &grant_row
                .try_get::<String, _>("sensitivity")
                .map_err(store)?,
        )?,
        kind: IntegrationKind::parse(
            &grant_row
                .try_get::<String, _>("capability_kind")
                .map_err(store)?,
        )?,
        scope: scope_json
            .get("scope")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned(),
        status,
    })
}

async fn load_receipt(
    transaction: &mut Transaction<'_, Postgres>,
    tenant_id: &TenantId,
    install_id: &InstallId,
) -> Result<InstallReceipt, PackError> {
    let row = sqlx::query(
        "SELECT pack_digest, pack_id, pack_version, preview_digest, phase,
                prior_install_id, activated_definition_refs, failure_reason, superseded_by,
                (extract(epoch from updated_at) * 1000000)::bigint AS updated_at
         FROM pack_install_receipts
         WHERE tenant_id = $1 AND install_id = $2",
    )
    .bind(tenant_id.as_str())
    .bind(install_id.as_str())
    .fetch_optional(&mut **transaction)
    .await
    .map_err(store)?
    .ok_or(PackError::InstallNotFound)?;

    let phase = install_phase_from_row(&row)?;
    let grants = load_capability_grants(transaction, tenant_id, install_id).await?;

    Ok(InstallReceipt {
        install_id: install_id.clone(),
        tenant_id: tenant_id.clone(),
        pack_digest: PackDigest::parse(row.try_get::<String, _>("pack_digest").map_err(store)?)?,
        pack_id: PackId::parse(row.try_get::<String, _>("pack_id").map_err(store)?)?,
        pack_version: PackVersion::parse(row.try_get::<String, _>("pack_version").map_err(store)?)?,
        preview_digest: PreviewDigest::parse(
            row.try_get::<String, _>("preview_digest").map_err(store)?,
        )?,
        phase,
        grants,
        prior_install_id: row
            .try_get::<Option<String>, _>("prior_install_id")
            .map_err(store)?
            .map(InstallId::parse)
            .transpose()?,
    })
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PackManifestDocument {
    format_version: String,
    pack_id: String,
    version: String,
    publisher: PublisherDocument,
    description: DescriptionDocument,
    ontology_dependencies: Vec<OntologyDocument>,
    integration_requirements: Vec<RequirementDocument>,
    first_success_contract: FirstSuccessDocument,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    signature: Option<SignatureDocument>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PublisherDocument {
    publisher_id: String,
    display_name: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DescriptionDocument {
    title: String,
    summary: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OntologyDocument {
    definition_id: String,
    digest: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    canonical_json: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RequirementDocument {
    requirement_id: String,
    kind: String,
    sensitivity: String,
    necessity: String,
    scope: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    degrade: Option<DegradeDocument>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DegradeDocument {
    mode: String,
    action_ids: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FirstSuccessDocument {
    contract_id: String,
    outcome: FirstSuccessOutcomeDocument,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum FirstSuccessOutcomeDocument {
    #[serde(rename_all = "camelCase")]
    ActionCommitted { action_id: String },
    #[serde(rename_all = "camelCase")]
    EvidenceRecorded { relation_id: String },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SignatureDocument {
    algorithm: String,
    public_key_id: String,
    signature_b64: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LockDocument {
    artifacts: Vec<LockArtifact>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LockArtifact {
    definition_id: String,
    digest: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PreviewDocument {
    pack_digest: String,
    ontology: Vec<OntologyPreviewDocument>,
    requirements: Vec<RequirementPreviewDocument>,
    writes: Vec<RequirementPreviewDocument>,
    reads: Vec<RequirementPreviewDocument>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct OntologyPreviewDocument {
    definition_id: String,
    digest: String,
    status: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RequirementPreviewDocument {
    requirement_id: String,
    kind: String,
    sensitivity: String,
    necessity: String,
    scope: String,
}

impl From<&PackManifest> for PackManifestDocument {
    fn from(manifest: &PackManifest) -> Self {
        Self {
            format_version: manifest.format_version.clone(),
            pack_id: manifest.pack_id.as_str().to_owned(),
            version: manifest.version.as_str().to_owned(),
            publisher: PublisherDocument {
                publisher_id: manifest.publisher.publisher_id.as_str().to_owned(),
                display_name: manifest.publisher.display_name.clone(),
            },
            description: DescriptionDocument {
                title: manifest.description.title.clone(),
                summary: manifest.description.summary.clone(),
            },
            ontology_dependencies: manifest
                .ontology_dependencies
                .iter()
                .map(|dependency| OntologyDocument {
                    definition_id: dependency.definition_id.as_str().to_owned(),
                    digest: dependency.digest.as_str().to_owned(),
                    canonical_json: String::new(),
                })
                .collect(),
            integration_requirements: manifest
                .integration_requirements
                .iter()
                .map(|requirement| RequirementDocument {
                    requirement_id: requirement.requirement_id.as_str().to_owned(),
                    kind: requirement.kind.as_str().to_owned(),
                    sensitivity: requirement.sensitivity.as_str().to_owned(),
                    necessity: requirement.necessity.as_str().to_owned(),
                    scope: requirement.scope.clone(),
                    degrade: match &requirement.necessity {
                        Necessity::Required => None,
                        Necessity::Optional { degrade } => Some(DegradeDocument {
                            mode: degrade.mode.clone(),
                            action_ids: degrade
                                .action_ids
                                .iter()
                                .map(|action| action.as_str().to_owned())
                                .collect(),
                        }),
                    },
                })
                .collect(),
            first_success_contract: FirstSuccessDocument {
                contract_id: manifest
                    .first_success_contract
                    .contract_id
                    .as_str()
                    .to_owned(),
                outcome: match &manifest.first_success_contract.outcome {
                    FirstSuccessOutcome::ActionCommitted { action_id } => {
                        FirstSuccessOutcomeDocument::ActionCommitted {
                            action_id: action_id.as_str().to_owned(),
                        }
                    }
                    FirstSuccessOutcome::EvidenceRecorded { relation_id } => {
                        FirstSuccessOutcomeDocument::EvidenceRecorded {
                            relation_id: relation_id.as_str().to_owned(),
                        }
                    }
                },
            },
            signature: manifest
                .signature
                .as_ref()
                .map(|signature| SignatureDocument {
                    algorithm: signature.algorithm.clone(),
                    public_key_id: signature.public_key_id.as_str().to_owned(),
                    signature_b64: signature.signature_b64.clone(),
                }),
        }
    }
}

impl PackManifestDocument {
    fn into_manifest(self) -> Result<PackManifest, PackError> {
        if self.format_version != PACK_FORMAT_V1 {
            return Err(PackError::InvalidFormat(self.format_version));
        }
        let mut requirements = Vec::new();
        for requirement in self.integration_requirements {
            let necessity = match requirement.necessity.as_str() {
                "required" => {
                    if requirement.degrade.is_some() {
                        return Err(PackError::InvalidFormat(
                            "required capability must not declare degrade".to_owned(),
                        ));
                    }
                    Necessity::Required
                }
                "optional" => {
                    let Some(degrade) = requirement.degrade else {
                        return Err(PackError::OptionalWithoutDegrade(
                            requirement.requirement_id.clone(),
                        ));
                    };
                    Necessity::Optional {
                        degrade: DegradationDecl {
                            mode: degrade.mode,
                            action_ids: degrade
                                .action_ids
                                .into_iter()
                                .map(ActionId::parse)
                                .collect::<Result<Vec<_>, _>>()?,
                        },
                    }
                }
                other => {
                    return Err(PackError::InvalidFormat(format!(
                        "invalid necessity {other}"
                    )));
                }
            };
            requirements.push(IntegrationRequirement {
                requirement_id: RequirementId::parse(requirement.requirement_id)?,
                kind: IntegrationKind::parse(&requirement.kind)?,
                sensitivity: Sensitivity::parse(&requirement.sensitivity)?,
                necessity,
                scope: requirement.scope,
            });
        }
        Ok(PackManifest {
            format_version: self.format_version,
            pack_id: PackId::parse(self.pack_id)?,
            version: PackVersion::parse(self.version)?,
            publisher: PublisherIdentity {
                publisher_id: PublisherId::parse(self.publisher.publisher_id)?,
                display_name: self.publisher.display_name,
            },
            description: PackPresentation {
                title: self.description.title,
                summary: self.description.summary,
            },
            ontology_dependencies: self
                .ontology_dependencies
                .into_iter()
                .map(|dependency| {
                    Ok(OntologyDependency {
                        definition_id: DefinitionId::parse(dependency.definition_id)?,
                        digest: DefinitionDigest::parse(dependency.digest)?,
                        canonical_json: dependency.canonical_json,
                    })
                })
                .collect::<Result<Vec<_>, PackError>>()?,
            integration_requirements: requirements,
            first_success_contract: FirstSuccessContract {
                contract_id: FirstSuccessContractId::parse(
                    self.first_success_contract.contract_id,
                )?,
                outcome: match self.first_success_contract.outcome {
                    FirstSuccessOutcomeDocument::ActionCommitted { action_id } => {
                        FirstSuccessOutcome::ActionCommitted {
                            action_id: ActionId::parse(action_id)?,
                        }
                    }
                    FirstSuccessOutcomeDocument::EvidenceRecorded { relation_id } => {
                        FirstSuccessOutcome::EvidenceRecorded {
                            relation_id: RelationId::parse(relation_id)?,
                        }
                    }
                },
            },
            signature: match self.signature {
                None => None,
                Some(signature) => Some(SignatureEvidence {
                    algorithm: signature.algorithm,
                    public_key_id: PublicKeyId::parse(signature.public_key_id)?,
                    signature_b64: signature.signature_b64,
                }),
            },
        })
    }
}

impl From<&PermissionImpactPreview> for PreviewDocument {
    fn from(preview: &PermissionImpactPreview) -> Self {
        Self {
            pack_digest: preview.pack_digest.as_str().to_owned(),
            ontology: preview
                .ontology
                .iter()
                .map(|line| OntologyPreviewDocument {
                    definition_id: line.definition_id.as_str().to_owned(),
                    digest: line.digest.as_str().to_owned(),
                    status: match &line.status {
                        OntologyImpactStatus::Missing => "missing".to_owned(),
                        OntologyImpactStatus::AlreadyActive => "already_active".to_owned(),
                        OntologyImpactStatus::CompatibleUpgrade => "compatible_upgrade".to_owned(),
                        OntologyImpactStatus::BreakingUpgrade { plan_digest } => {
                            format!("breaking_upgrade:{plan_digest}")
                        }
                    },
                })
                .collect(),
            requirements: preview
                .requirements
                .iter()
                .map(requirement_preview)
                .collect(),
            writes: preview.writes.iter().map(requirement_preview).collect(),
            reads: preview.reads.iter().map(requirement_preview).collect(),
        }
    }
}

fn requirement_preview(line: &RequirementImpactLine) -> RequirementPreviewDocument {
    RequirementPreviewDocument {
        requirement_id: line.requirement_id.as_str().to_owned(),
        kind: line.kind.as_str().to_owned(),
        sensitivity: line.sensitivity.as_str().to_owned(),
        necessity: line.necessity.clone(),
        scope: line.scope.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_latest_and_optional_without_degrade() {
        assert!(matches!(
            PackVersion::parse("latest"),
            Err(PackError::InvalidVersion(_))
        ));
        let bytes = br#"{"description":{"summary":"s","title":"t"},"firstSuccessContract":{"contractId":"fs.1","outcome":{"kind":"action_committed","actionId":"action.commit"}},"formatVersion":"zoen.pack.v1","integrationRequirements":[{"kind":"write_effect","necessity":"optional","requirementId":"req.write","scope":"procurement","sensitivity":"sensitive"}],"ontologyDependencies":[],"packId":"pack.sample","publisher":{"displayName":"Zoen","publisherId":"pub.zoen"},"version":"1.0.0"}"#;
        let error = admit_pack(bytes, None).expect_err("optional without degrade");
        assert!(
            matches!(error, PackError::OptionalWithoutDegrade(_)),
            "unexpected error: {error}"
        );
    }
}
