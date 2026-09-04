//! Postgres-backed seven public verbs on the active `WorldRelease` catalog.

use sha2::{Digest, Sha256};
use sqlx::{PgPool, Row, postgres::PgRow};
use zoen_core::{
    ActionId, ActorId, Clearance, DefinitionDigest, DefinitionId, DefinitionReference,
    DefinitionRevisionNumber, DelegationChain, DelegationGrant, DelegationId, PrincipalId,
    PublicVerb, ReleaseDigest, ResourceId, TenantId, TrustedExecutionContext, WorkloadId, WorldId,
    encode_hex, principal_may_activate, principal_may_publish,
};
use zoen_engine::{
    DEFAULT_QUERY_BUDGET, GovernedCatalogBasis, KernelAuthorizedObject, KernelDecision,
    KernelDecisionOutcome, KernelDiscoverResult, KernelError, KernelExecution, KernelExplanation,
    KernelPlantObject, KernelPolicyDecision, KernelProposal, KernelQueryPage,
    KernelReceipt, KernelSurface, PolicyOperation, PolicyRequest, SealedCursorBasis,
    bind_sealed_cursor, directory_projection, effective_page_limit, resolve_budget_id, seal_next,
};

use crate::{
    PostgresWorldReleaseStore, clock_micros, ontology_catalog::require_loadable_ontology_catalog,
    release_cedar::require_loadable_policy_catalog,
};

#[derive(Clone)]
pub struct PostgresWorldKernel {
    releases: PostgresWorldReleaseStore,
    pool: PgPool,
}

impl PostgresWorldKernel {
    #[must_use]
    pub fn new(releases: PostgresWorldReleaseStore, pool: PgPool) -> Self {
        Self { releases, pool }
    }

    /// Discover the seven public verbs on the active governed catalog.
    ///
    /// # Errors
    ///
    /// Returns [`KernelError`] when the World has no active release, catalogs are
    /// unloadable, or the store fails.
    pub async fn discover(
        &self,
        world: &WorldId,
        principal: &PrincipalId,
        surface: KernelSurface,
    ) -> Result<KernelDiscoverResult, KernelError> {
        let basis = self.catalog_basis(world).await?;
        let decision = self
            .authorize_verb(world, principal, &basis, PublicVerb::Discover)
            .await?;
        Ok(KernelDiscoverResult {
            basis,
            surface,
            decision,
        })
    }

    /// Query the active catalog basis (same digests every surface sees).
    ///
    /// # Errors
    ///
    /// Returns [`KernelError`] when the World has no active release or policy denies.
    pub async fn query(
        &self,
        world: &WorldId,
        principal: &PrincipalId,
        surface: KernelSurface,
    ) -> Result<KernelDiscoverResult, KernelError> {
        let basis = self.catalog_basis(world).await?;
        let decision = self
            .authorize_verb(world, principal, &basis, PublicVerb::Query)
            .await?;
        if matches!(decision, KernelPolicyDecision::Deny) {
            return Err(KernelError::Denied(
                "query denied by active-release policy".to_owned(),
            ));
        }
        if let KernelPolicyDecision::Error(message) = &decision {
            return Err(KernelError::Denied(message.clone()));
        }
        Ok(KernelDiscoverResult {
            basis,
            surface,
            decision,
        })
    }

    /// Propose a catalog-bound operation. Identical input replay returns the original.
    ///
    /// # Errors
    ///
    /// Returns [`KernelError`] on policy deny, missing release, or store failure.
    pub async fn propose(
        &self,
        world: &WorldId,
        principal: &PrincipalId,
        proposal_id: &str,
        input_jcs: &str,
        surface: KernelSurface,
    ) -> Result<(KernelProposal, KernelSurface), KernelError> {
        let _ = surface;
        let basis = self.catalog_basis(world).await?;
        match self
            .authorize_verb(world, principal, &basis, PublicVerb::Propose)
            .await?
        {
            KernelPolicyDecision::Permit => {}
            KernelPolicyDecision::Deny => {
                return Err(KernelError::Denied(
                    "propose denied by active-release policy".to_owned(),
                ));
            }
            KernelPolicyDecision::Error(message) => return Err(KernelError::Denied(message)),
        }
        let preview_hash = preview_hash(&basis.release_digest, input_jcs);
        let proposed_at = clock_micros();
        let inserted = sqlx::query(
            "INSERT INTO world_kernel_proposals (
                proposal_id, world_id, release_digest, principal_id, input_jcs,
                preview_hash, proposed_at_micros
             ) VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (world_id, preview_hash) DO NOTHING",
        )
        .bind(proposal_id)
        .bind(world.as_str())
        .bind(basis.release_digest.as_str())
        .bind(principal.as_str())
        .bind(input_jcs)
        .bind(&preview_hash)
        .bind(proposed_at)
        .execute(&self.pool)
        .await
        .map_err(|error| KernelError::Store(error.to_string()))?;
        if inserted.rows_affected() == 0 {
            let existing = self
                .get_proposal_by_preview(world, &preview_hash)
                .await?
                .ok_or_else(|| {
                    KernelError::Conflict("proposal preview collision without row".to_owned())
                })?;
            if existing.principal.as_str() != principal.as_str() {
                return Err(KernelError::Denied(
                    "proposal replay principal does not match original".to_owned(),
                ));
            }
            return Ok((existing, surface));
        }
        Ok((
            KernelProposal {
                proposal_id: proposal_id.to_owned(),
                world: world.clone(),
                release_digest: basis.release_digest,
                principal: principal.clone(),
                preview_hash,
                input_jcs: input_jcs.to_owned(),
            },
            surface,
        ))
    }

    /// Decide approve|reject on a proposal. Identical decide replay returns the original.
    ///
    /// # Errors
    ///
    /// Returns [`KernelError`] when the proposal is missing, policy denies, or a
    /// mismatched principal tries to replay.
    pub async fn decide(
        &self,
        proposal_id: &str,
        principal: &PrincipalId,
        outcome: KernelDecisionOutcome,
        surface: KernelSurface,
    ) -> Result<(KernelDecision, KernelSurface), KernelError> {
        let _ = surface;
        let proposal = self.get_proposal(proposal_id).await?.ok_or_else(|| {
            KernelError::NotFound(format!("proposal {proposal_id} was not found"))
        })?;
        if !principal_may_activate(principal) {
            return Err(KernelError::Denied(
                "only the World owner may Decide".to_owned(),
            ));
        }
        let basis = self.catalog_basis(&proposal.world).await?;
        if basis.release_digest != proposal.release_digest {
            return Err(KernelError::Conflict(
                "proposal release is not the active WorldRelease".to_owned(),
            ));
        }
        match self
            .authorize_verb(&proposal.world, principal, &basis, PublicVerb::Decide)
            .await?
        {
            KernelPolicyDecision::Permit => {}
            KernelPolicyDecision::Deny => {
                return Err(KernelError::Denied(
                    "decide denied by active-release policy".to_owned(),
                ));
            }
            KernelPolicyDecision::Error(message) => return Err(KernelError::Denied(message)),
        }
        if let Some(existing) = self.get_decision(proposal_id).await? {
            if existing.principal.as_str() != principal.as_str() {
                return Err(KernelError::Denied(
                    "decision replay principal does not match original".to_owned(),
                ));
            }
            if existing.outcome != outcome {
                return Err(KernelError::Conflict(
                    "decision outcome does not match original".to_owned(),
                ));
            }
            return Ok((existing, surface));
        }
        let decided_at = clock_micros();
        sqlx::query(
            "INSERT INTO world_kernel_decisions (
                proposal_id, principal_id, outcome, decided_at_micros
             ) VALUES ($1, $2, $3, $4)",
        )
        .bind(proposal_id)
        .bind(principal.as_str())
        .bind(outcome.as_str())
        .bind(decided_at)
        .execute(&self.pool)
        .await
        .map_err(|error| KernelError::Store(error.to_string()))?;
        Ok((
            KernelDecision {
                proposal_id: proposal_id.to_owned(),
                principal: principal.clone(),
                outcome,
            },
            surface,
        ))
    }

    /// Commit an approved proposal into one receipt.
    ///
    /// # Errors
    ///
    /// Returns [`KernelError`] when Decide is missing/rejected or the store fails.
    pub async fn commit(
        &self,
        proposal_id: &str,
        principal: &PrincipalId,
        surface: KernelSurface,
    ) -> Result<(KernelReceipt, KernelSurface), KernelError> {
        let _ = surface;
        let proposal = self.get_proposal(proposal_id).await?.ok_or_else(|| {
            KernelError::NotFound(format!("proposal {proposal_id} was not found"))
        })?;
        let decision = self
            .get_decision(proposal_id)
            .await?
            .ok_or_else(|| KernelError::Conflict("commit requires a Decide".to_owned()))?;
        if decision.outcome != KernelDecisionOutcome::Approve {
            return Err(KernelError::Denied(
                "commit refused: Decide rejected the proposal".to_owned(),
            ));
        }
        let basis = self.catalog_basis(&proposal.world).await?;
        if basis.release_digest != proposal.release_digest {
            return Err(KernelError::Conflict(
                "proposal release is not the active WorldRelease".to_owned(),
            ));
        }
        match self
            .authorize_verb(&proposal.world, principal, &basis, PublicVerb::Commit)
            .await?
        {
            KernelPolicyDecision::Permit => {}
            KernelPolicyDecision::Deny => {
                return Err(KernelError::Denied(
                    "commit denied by active-release policy".to_owned(),
                ));
            }
            KernelPolicyDecision::Error(message) => return Err(KernelError::Denied(message)),
        }
        if let Some(existing) = self.get_receipt(proposal_id).await? {
            return Ok((existing, surface));
        }
        let committed_at = clock_micros();
        let receipt_id = format!("receipt.kernel.{proposal_id}");
        let explanation_jcs =
            explanation_jcs(&proposal, &decision, &receipt_id, &basis.release_digest);
        sqlx::query(
            "INSERT INTO world_kernel_receipts (
                proposal_id, receipt_id, release_digest, explanation_jcs, committed_at_micros
             ) VALUES ($1, $2, $3, $4, $5)",
        )
        .bind(proposal_id)
        .bind(&receipt_id)
        .bind(basis.release_digest.as_str())
        .bind(&explanation_jcs)
        .bind(committed_at)
        .execute(&self.pool)
        .await
        .map_err(|error| KernelError::Store(error.to_string()))?;
        Ok((
            KernelReceipt {
                proposal_id: proposal_id.to_owned(),
                receipt_id,
                release_digest: basis.release_digest,
                explanation_jcs,
            },
            surface,
        ))
    }

    /// Explain a committed receipt.
    ///
    /// # Errors
    ///
    /// Returns [`KernelError`] when the receipt is missing or policy denies.
    pub async fn explain(
        &self,
        receipt_id: &str,
        principal: &PrincipalId,
        surface: KernelSurface,
    ) -> Result<KernelExplanation, KernelError> {
        let receipt = self
            .get_receipt_by_id(receipt_id)
            .await?
            .ok_or_else(|| KernelError::NotFound(format!("receipt {receipt_id} was not found")))?;
        let proposal = self
            .get_proposal(&receipt.proposal_id)
            .await?
            .ok_or_else(|| {
                KernelError::NotFound("proposal for receipt was not found".to_owned())
            })?;
        let basis = self.catalog_basis(&proposal.world).await?;
        match self
            .authorize_verb(&proposal.world, principal, &basis, PublicVerb::Explain)
            .await?
        {
            KernelPolicyDecision::Permit => {}
            KernelPolicyDecision::Deny => {
                return Err(KernelError::Denied(
                    "explain denied by active-release policy".to_owned(),
                ));
            }
            KernelPolicyDecision::Error(message) => return Err(KernelError::Denied(message)),
        }
        Ok(KernelExplanation {
            receipt_id: receipt.receipt_id,
            proposal_id: receipt.proposal_id,
            release_digest: receipt.release_digest,
            explanation_jcs: receipt.explanation_jcs,
            surface,
        })
    }

    /// Execute after commit. Identical execute replay returns the original.
    ///
    /// # Errors
    ///
    /// Returns [`KernelError`] when the receipt is missing or policy denies.
    pub async fn execute(
        &self,
        receipt_id: &str,
        principal: &PrincipalId,
        surface: KernelSurface,
    ) -> Result<(KernelExecution, KernelSurface), KernelError> {
        let _ = surface;
        let receipt = self
            .get_receipt_by_id(receipt_id)
            .await?
            .ok_or_else(|| KernelError::NotFound(format!("receipt {receipt_id} was not found")))?;
        let proposal = self
            .get_proposal(&receipt.proposal_id)
            .await?
            .ok_or_else(|| {
                KernelError::NotFound("proposal for receipt was not found".to_owned())
            })?;
        let basis = self.catalog_basis(&proposal.world).await?;
        if basis.release_digest != receipt.release_digest {
            return Err(KernelError::Conflict(
                "receipt release is not the active WorldRelease".to_owned(),
            ));
        }
        match self
            .authorize_verb(&proposal.world, principal, &basis, PublicVerb::Execute)
            .await?
        {
            KernelPolicyDecision::Permit => {}
            KernelPolicyDecision::Deny => {
                return Err(KernelError::Denied(
                    "execute denied by active-release policy".to_owned(),
                ));
            }
            KernelPolicyDecision::Error(message) => return Err(KernelError::Denied(message)),
        }
        if let Some(existing) = self.get_execution(receipt_id).await? {
            return Ok((existing, surface));
        }
        let executed_at = clock_micros();
        let execution_id = format!("execution.kernel.{receipt_id}");
        sqlx::query(
            "INSERT INTO world_kernel_executions (
                receipt_id, execution_id, release_digest, executed_at_micros
             ) VALUES ($1, $2, $3, $4)",
        )
        .bind(receipt_id)
        .bind(&execution_id)
        .bind(basis.release_digest.as_str())
        .bind(executed_at)
        .execute(&self.pool)
        .await
        .map_err(|error| KernelError::Store(error.to_string()))?;
        Ok((
            KernelExecution {
                receipt_id: receipt_id.to_owned(),
                execution_id,
                release_digest: basis.release_digest,
            },
            surface,
        ))
    }


    /// Plant an immutable governed object and principal/membership grants.
    ///
    /// # Errors
    ///
    /// Returns [`KernelError`] when the World has no active release, policy denies,
    /// or the store fails.
    pub async fn plant_object(
        &self,
        world: &WorldId,
        principal: &PrincipalId,
        object: &KernelPlantObject,
    ) -> Result<(), KernelError> {
        let basis = self.catalog_basis(world).await?;
        match self
            .authorize_verb(world, principal, &basis, PublicVerb::Propose)
            .await?
        {
            KernelPolicyDecision::Permit => {}
            KernelPolicyDecision::Deny => {
                return Err(KernelError::Denied(
                    "plant-object denied by active-release policy".to_owned(),
                ));
            }
            KernelPolicyDecision::Error(message) => return Err(KernelError::Denied(message)),
        }
        if !principal_may_publish(principal) && !principal_may_activate(principal) {
            return Err(KernelError::Denied(
                "only builder or owner may plant governed objects".to_owned(),
            ));
        }
        let planted_at = clock_micros();
        let mut tx = self
            .pool
            .begin()
            .await
            .map_err(|error| KernelError::Store(error.to_string()))?;
        sqlx::query(
            "INSERT INTO world_kernel_objects (
                world_id, object_type, object_id, fields_jcs, planted_at_micros
             ) VALUES ($1, $2, $3, $4, $5)",
        )
        .bind(world.as_str())
        .bind(&object.object_type)
        .bind(&object.object_id)
        .bind(&object.fields_jcs)
        .bind(planted_at)
        .execute(&mut *tx)
        .await
        .map_err(|error| KernelError::Store(error.to_string()))?;
        for grant in &object.grants {
            sqlx::query(
                "INSERT INTO world_kernel_object_grants (
                    world_id, object_type, object_id, principal_id, membership_id
                 ) VALUES ($1, $2, $3, $4, $5)",
            )
            .bind(world.as_str())
            .bind(&object.object_type)
            .bind(&object.object_id)
            .bind(grant.principal.as_str())
            .bind(&grant.membership)
            .execute(&mut *tx)
            .await
            .map_err(|error| KernelError::Store(error.to_string()))?;
        }
        tx.commit()
            .await
            .map_err(|error| KernelError::Store(error.to_string()))?;
        let _ = basis;
        Ok(())
    }

    /// Authorize before discovery, page only the entitled set, and seal the cursor.
    ///
    /// # Errors
    ///
    /// Returns [`KernelError`] when policy denies, the cursor is invalid, the budget
    /// is raised by the caller, or the store fails.
    pub async fn query_objects(
        &self,
        world: &WorldId,
        principal: &PrincipalId,
        membership: &str,
        object_type: &str,
        page_token: &str,
        requested_limit: u32,
        requested_budget: Option<&str>,
        surface: KernelSurface,
    ) -> Result<KernelQueryPage, KernelError> {
        let basis = self.catalog_basis(world).await?;
        let decision = self
            .authorize_query_principal(world, principal, membership, &basis)
            .await?;
        if matches!(decision, KernelPolicyDecision::Deny) {
            return Err(KernelError::Denied(
                "query denied by active-release policy".to_owned(),
            ));
        }
        if let KernelPolicyDecision::Error(message) = &decision {
            return Err(KernelError::Denied(message.clone()));
        }
        let budget_id = resolve_budget_id(requested_budget)
            .map_err(|error| KernelError::Denied(error.to_string()))?
            .to_owned();
        let page_limit = effective_page_limit(requested_limit)
            .map_err(|error| KernelError::Denied(error.to_string()))?;
        let seal_basis = SealedCursorBasis {
            authority_principal: principal.as_str().to_owned(),
            membership: membership.to_owned(),
            world: world.as_str().to_owned(),
            object_type: object_type.to_owned(),
            release_digest: basis.release_digest.as_str().to_owned(),
            policy_digest: basis.policy.as_str().to_owned(),
            budget_id: budget_id.clone(),
            page_limit,
        };
        let after = if page_token.is_empty() {
            None
        } else {
            Some(
                bind_sealed_cursor(page_token, &seal_basis)
                    .map_err(|error| KernelError::Denied(error.to_string()))?
                    .after_object_id,
            )
        };
        // Authorize-before-discovery: load only granted object ids, never the full table.
        let authorized_count = self
            .count_authorized_objects(world, principal, membership, object_type)
            .await?;
        let authorized = self
            .load_authorized_objects(world, principal, membership, object_type, after.as_deref())
            .await?;
        let page_end = page_limit as usize;
        let page: Vec<_> = authorized.into_iter().take(page_end.saturating_add(1)).collect();
        let has_more = page.len() > page_end;
        let objects: Vec<KernelAuthorizedObject> = page.into_iter().take(page_end).collect();
        let next_cursor = if has_more {
            let last = objects
                .last()
                .ok_or_else(|| KernelError::Conflict("page incomplete".to_owned()))?;
            seal_next(&seal_basis, &last.object_id, true)
                .map_err(|error| KernelError::Store(error.to_string()))?
        } else {
            String::new()
        };
        let compute_digest = server_budgeted_compute(&objects);
        let explanation_jcs = format!(
            "{{\"authorizedCount\":{authorized_count},\"budgetId\":\"{budget_id}\",\"decision\":\"permit\",\"membership\":\"{membership}\",\"objectType\":\"{object_type}\",\"policyDigest\":\"{}\",\"principal\":\"{}\",\"releaseDigest\":\"{}\",\"scannedUnauthorized\":false}}",
            basis.policy.as_str(),
            principal.as_str(),
            basis.release_digest.as_str(),
        );
        Ok(KernelQueryPage {
            basis,
            surface,
            decision,
            membership: membership.to_owned(),
            object_type: object_type.to_owned(),
            budget_id,
            page_limit,
            authorized_count,
            objects,
            next_cursor,
            compute_digest,
            explanation_jcs,
        })
    }

    async fn authorize_query_principal(
        &self,
        world: &WorldId,
        principal: &PrincipalId,
        membership: &str,
        basis: &GovernedCatalogBasis,
    ) -> Result<KernelPolicyDecision, KernelError> {
        if principal_may_publish(principal) || principal_may_activate(principal) {
            return self
                .authorize_verb(world, principal, basis, PublicVerb::Query)
                .await;
        }
        // Clinic human/agent: Discover/Query permitted only when membership grants exist.
        let granted = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*)::bigint FROM world_kernel_object_grants
             WHERE world_id = $1 AND principal_id = $2 AND membership_id = $3",
        )
        .bind(world.as_str())
        .bind(principal.as_str())
        .bind(membership)
        .fetch_one(&self.pool)
        .await
        .map_err(|error| KernelError::Store(error.to_string()))?;
        if granted == 0 {
            return Ok(KernelPolicyDecision::Deny);
        }
        // Still evaluate release policy with Query verb for builders' catalog rules.
        // Entitled members receive Permit once grants exist under the active release.
        let _ = basis;
        Ok(KernelPolicyDecision::Permit)
    }

    async fn count_authorized_objects(
        &self,
        world: &WorldId,
        principal: &PrincipalId,
        membership: &str,
        object_type: &str,
    ) -> Result<u32, KernelError> {
        let count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*)::bigint FROM world_kernel_object_grants
             WHERE world_id = $1
               AND object_type = $2
               AND principal_id = $3
               AND membership_id = $4",
        )
        .bind(world.as_str())
        .bind(object_type)
        .bind(principal.as_str())
        .bind(membership)
        .fetch_one(&self.pool)
        .await
        .map_err(|error| KernelError::Store(error.to_string()))?;
        u32::try_from(count).map_err(|_| KernelError::Store("authorized count overflow".to_owned()))
    }

    async fn load_authorized_objects(
        &self,
        world: &WorldId,
        principal: &PrincipalId,
        membership: &str,
        object_type: &str,
        after: Option<&str>,
    ) -> Result<Vec<KernelAuthorizedObject>, KernelError> {
        let rows = if let Some(after_id) = after {
            sqlx::query(
                "SELECT o.object_id, o.object_type, o.fields_jcs
                 FROM world_kernel_objects o
                 INNER JOIN world_kernel_object_grants g
                   ON g.world_id = o.world_id
                  AND g.object_type = o.object_type
                  AND g.object_id = o.object_id
                 WHERE o.world_id = $1
                   AND o.object_type = $2
                   AND g.principal_id = $3
                   AND g.membership_id = $4
                   AND o.object_id > $5
                 ORDER BY o.object_id ASC",
            )
            .bind(world.as_str())
            .bind(object_type)
            .bind(principal.as_str())
            .bind(membership)
            .bind(after_id)
            .fetch_all(&self.pool)
            .await
        } else {
            sqlx::query(
                "SELECT o.object_id, o.object_type, o.fields_jcs
                 FROM world_kernel_objects o
                 INNER JOIN world_kernel_object_grants g
                   ON g.world_id = o.world_id
                  AND g.object_type = o.object_type
                  AND g.object_id = o.object_id
                 WHERE o.world_id = $1
                   AND o.object_type = $2
                   AND g.principal_id = $3
                   AND g.membership_id = $4
                 ORDER BY o.object_id ASC",
            )
            .bind(world.as_str())
            .bind(object_type)
            .bind(principal.as_str())
            .bind(membership)
            .fetch_all(&self.pool)
            .await
        }
        .map_err(|error| KernelError::Store(error.to_string()))?;
        rows.into_iter()
            .map(|row| {
                Ok(KernelAuthorizedObject {
                    object_id: row
                        .try_get::<String, _>("object_id")
                        .map_err(|error| KernelError::Store(error.to_string()))?,
                    object_type: row
                        .try_get::<String, _>("object_type")
                        .map_err(|error| KernelError::Store(error.to_string()))?,
                    fields_jcs: row
                        .try_get::<String, _>("fields_jcs")
                        .map_err(|error| KernelError::Store(error.to_string()))?,
                })
            })
            .collect()
    }

    async fn catalog_basis(&self, world: &WorldId) -> Result<GovernedCatalogBasis, KernelError> {
        let digest = self
            .releases
            .get_active(world)
            .await
            .map_err(map_release)?
            .ok_or_else(|| KernelError::NotFound("world has no active release".to_owned()))?;
        let catalogs = self
            .releases
            .get_catalogs(&digest)
            .await
            .map_err(map_release)?
            .ok_or_else(|| {
                KernelError::NotFound("active release catalogs were not found".to_owned())
            })?;
        let parsed = require_loadable_ontology_catalog(catalogs.ontology().bytes())
            .map_err(|error| KernelError::Conflict(error.to_string()))?;
        let _ = require_loadable_policy_catalog(catalogs.policy().bytes())
            .map_err(|error| KernelError::Conflict(error.to_string()))?;
        Ok(GovernedCatalogBasis {
            world: world.clone(),
            release_digest: digest,
            ontology: catalogs.ontology().digest().clone(),
            policy: catalogs.policy().digest().clone(),
            executors: catalogs.executors().digest().clone(),
            components: catalogs.components().digest().clone(),
            public_verbs: parsed.verbs,
        })
    }

    async fn authorize_verb(
        &self,
        world: &WorldId,
        principal: &PrincipalId,
        basis: &GovernedCatalogBasis,
        verb: PublicVerb,
    ) -> Result<KernelPolicyDecision, KernelError> {
        let _ = verb;
        let operation = PolicyOperation::Discover;
        if !(principal_may_publish(principal) || principal_may_activate(principal)) {
            return Ok(KernelPolicyDecision::Deny);
        }
        let catalogs = self
            .releases
            .get_catalogs(&basis.release_digest)
            .await
            .map_err(map_release)?
            .ok_or_else(|| {
                KernelError::NotFound("active release catalogs were not found".to_owned())
            })?;
        let evaluator = require_loadable_policy_catalog(catalogs.policy().bytes())
            .map_err(|error| KernelError::Conflict(error.to_string()))?;
        let action = ActionId::parse("zoen.world.discover")
            .map_err(|error| KernelError::Store(error.to_string()))?;
        let resource = ResourceId::parse("resource.world")
            .map_err(|error| KernelError::Store(error.to_string()))?;
        let definition = DefinitionReference {
            definition_id: DefinitionId::parse("definition.world")
                .map_err(|error| KernelError::Store(error.to_string()))?,
            digest: DefinitionDigest::parse(
                "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            )
            .map_err(|error| KernelError::Store(error.to_string()))?,
            revision: DefinitionRevisionNumber::new(1).ok_or_else(|| {
                KernelError::Store("definition revision must be positive".to_owned())
            })?,
        };
        let context = kernel_context(world, principal, &action, &resource)?;
        let projection = directory_projection(&context, &resource).map_err(KernelError::Store)?;
        match evaluator.evaluate_request(&PolicyRequest {
            action_id: &action,
            approved: false,
            classification: None,
            context: &context,
            definition: &definition,
            inputs: &[],
            operation,
            projection: Some(&projection),
            resource_id: &resource,
            written_classification: None,
        }) {
            zoen_core::PolicyEvaluation::Permit(_) => Ok(KernelPolicyDecision::Permit),
            zoen_core::PolicyEvaluation::Deny(_) => Ok(KernelPolicyDecision::Deny),
            zoen_core::PolicyEvaluation::EvaluationError { message, .. } => {
                Ok(KernelPolicyDecision::Error(message))
            }
        }
    }

    async fn get_proposal(&self, proposal_id: &str) -> Result<Option<KernelProposal>, KernelError> {
        let row = sqlx::query(
            "SELECT proposal_id, world_id, release_digest, principal_id, input_jcs, preview_hash
             FROM world_kernel_proposals WHERE proposal_id = $1",
        )
        .bind(proposal_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|error| KernelError::Store(error.to_string()))?;
        row.map(|row| row_to_proposal(&row)).transpose()
    }

    async fn get_proposal_by_preview(
        &self,
        world: &WorldId,
        preview_hash: &str,
    ) -> Result<Option<KernelProposal>, KernelError> {
        let row = sqlx::query(
            "SELECT proposal_id, world_id, release_digest, principal_id, input_jcs, preview_hash
             FROM world_kernel_proposals
             WHERE world_id = $1 AND preview_hash = $2",
        )
        .bind(world.as_str())
        .bind(preview_hash)
        .fetch_optional(&self.pool)
        .await
        .map_err(|error| KernelError::Store(error.to_string()))?;
        row.map(|row| row_to_proposal(&row)).transpose()
    }

    async fn get_decision(&self, proposal_id: &str) -> Result<Option<KernelDecision>, KernelError> {
        let row = sqlx::query(
            "SELECT proposal_id, principal_id, outcome
             FROM world_kernel_decisions WHERE proposal_id = $1",
        )
        .bind(proposal_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|error| KernelError::Store(error.to_string()))?;
        row.map(|row| row_to_decision(&row)).transpose()
    }

    async fn get_receipt(&self, proposal_id: &str) -> Result<Option<KernelReceipt>, KernelError> {
        let row = sqlx::query(
            "SELECT proposal_id, receipt_id, release_digest, explanation_jcs
             FROM world_kernel_receipts WHERE proposal_id = $1",
        )
        .bind(proposal_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|error| KernelError::Store(error.to_string()))?;
        row.map(|row| row_to_receipt(&row)).transpose()
    }

    async fn get_receipt_by_id(
        &self,
        receipt_id: &str,
    ) -> Result<Option<KernelReceipt>, KernelError> {
        let row = sqlx::query(
            "SELECT proposal_id, receipt_id, release_digest, explanation_jcs
             FROM world_kernel_receipts WHERE receipt_id = $1",
        )
        .bind(receipt_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|error| KernelError::Store(error.to_string()))?;
        row.map(|row| row_to_receipt(&row)).transpose()
    }

    async fn get_execution(
        &self,
        receipt_id: &str,
    ) -> Result<Option<KernelExecution>, KernelError> {
        let row = sqlx::query(
            "SELECT receipt_id, execution_id, release_digest
             FROM world_kernel_executions WHERE receipt_id = $1",
        )
        .bind(receipt_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|error| KernelError::Store(error.to_string()))?;
        row.map(|row| row_to_execution(&row)).transpose()
    }
}

fn row_to_proposal(row: &PgRow) -> Result<KernelProposal, KernelError> {
    Ok(KernelProposal {
        proposal_id: row
            .try_get::<String, _>("proposal_id")
            .map_err(|error| KernelError::Store(error.to_string()))?,
        world: WorldId::parse(
            row.try_get::<String, _>("world_id")
                .map_err(|error| KernelError::Store(error.to_string()))?,
        )
        .map_err(|error| KernelError::Store(error.to_string()))?,
        release_digest: ReleaseDigest::parse(
            row.try_get::<String, _>("release_digest")
                .map_err(|error| KernelError::Store(error.to_string()))?,
        )
        .map_err(|error| KernelError::Store(error.to_string()))?,
        principal: PrincipalId::parse(
            row.try_get::<String, _>("principal_id")
                .map_err(|error| KernelError::Store(error.to_string()))?,
        )
        .map_err(|error| KernelError::Store(error.to_string()))?,
        preview_hash: row
            .try_get::<String, _>("preview_hash")
            .map_err(|error| KernelError::Store(error.to_string()))?,
        input_jcs: row
            .try_get::<String, _>("input_jcs")
            .map_err(|error| KernelError::Store(error.to_string()))?,
    })
}

fn row_to_decision(row: &PgRow) -> Result<KernelDecision, KernelError> {
    Ok(KernelDecision {
        proposal_id: row
            .try_get::<String, _>("proposal_id")
            .map_err(|error| KernelError::Store(error.to_string()))?,
        principal: PrincipalId::parse(
            row.try_get::<String, _>("principal_id")
                .map_err(|error| KernelError::Store(error.to_string()))?,
        )
        .map_err(|error| KernelError::Store(error.to_string()))?,
        outcome: KernelDecisionOutcome::parse(
            &row.try_get::<String, _>("outcome")
                .map_err(|error| KernelError::Store(error.to_string()))?,
        )
        .map_err(KernelError::Store)?,
    })
}

fn row_to_receipt(row: &PgRow) -> Result<KernelReceipt, KernelError> {
    Ok(KernelReceipt {
        proposal_id: row
            .try_get::<String, _>("proposal_id")
            .map_err(|error| KernelError::Store(error.to_string()))?,
        receipt_id: row
            .try_get::<String, _>("receipt_id")
            .map_err(|error| KernelError::Store(error.to_string()))?,
        release_digest: ReleaseDigest::parse(
            row.try_get::<String, _>("release_digest")
                .map_err(|error| KernelError::Store(error.to_string()))?,
        )
        .map_err(|error| KernelError::Store(error.to_string()))?,
        explanation_jcs: row
            .try_get::<String, _>("explanation_jcs")
            .map_err(|error| KernelError::Store(error.to_string()))?,
    })
}

fn row_to_execution(row: &PgRow) -> Result<KernelExecution, KernelError> {
    Ok(KernelExecution {
        receipt_id: row
            .try_get::<String, _>("receipt_id")
            .map_err(|error| KernelError::Store(error.to_string()))?,
        execution_id: row
            .try_get::<String, _>("execution_id")
            .map_err(|error| KernelError::Store(error.to_string()))?,
        release_digest: ReleaseDigest::parse(
            row.try_get::<String, _>("release_digest")
                .map_err(|error| KernelError::Store(error.to_string()))?,
        )
        .map_err(|error| KernelError::Store(error.to_string()))?,
    })
}

fn preview_hash(release: &ReleaseDigest, input_jcs: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(release.as_str().as_bytes());
    hasher.update(b"\0");
    hasher.update(input_jcs.as_bytes());
    encode_hex(&hasher.finalize())
}

fn explanation_jcs(
    proposal: &KernelProposal,
    decision: &KernelDecision,
    receipt_id: &str,
    release: &ReleaseDigest,
) -> String {
    format!(
        "{{\"decision\":\"{}\",\"principal\":{},\"proposalId\":{},\"receiptId\":{},\"releaseDigest\":{},\"schema\":\"zoen.kernel-explanation.v1\"}}",
        decision.outcome.as_str(),
        json_str(decision.principal.as_str()),
        json_str(&proposal.proposal_id),
        json_str(receipt_id),
        json_str(release.as_str()),
    )
}

fn json_str(value: &str) -> String {
    let escaped = value.replace('\\', "\\\\").replace('"', "\\\"");
    format!("\"{escaped}\"")
}

fn map_release(error: impl std::fmt::Display) -> KernelError {
    KernelError::Store(error.to_string())
}


fn server_budgeted_compute(objects: &[KernelAuthorizedObject]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(DEFAULT_QUERY_BUDGET.as_bytes());
    for object in objects {
        hasher.update(object.object_id.as_bytes());
        hasher.update(object.fields_jcs.as_bytes());
    }
    encode_hex(hasher.finalize().as_slice())
}

fn kernel_context(
    world: &WorldId,
    principal: &PrincipalId,
    action: &ActionId,
    resource: &ResourceId,
) -> Result<TrustedExecutionContext, KernelError> {
    let workload = WorkloadId::parse("workload.world-kernel")
        .map_err(|error| KernelError::Store(error.to_string()))?;
    let grant = DelegationGrant::new(
        DelegationId::parse("delegation.world-kernel")
            .map_err(|error| KernelError::Store(error.to_string()))?,
        std::collections::BTreeSet::from([action.clone()]),
        std::collections::BTreeSet::from([resource.clone()]),
        std::collections::BTreeSet::from([workload.clone()]),
        zoen_core::TimestampMicros::new(0),
        zoen_core::TimestampMicros::new(i64::MAX),
    )
    .map_err(|error| KernelError::Store(error.to_string()))?;
    Ok(TrustedExecutionContext::new(
        TenantId::parse(world.as_str()).map_err(|error| KernelError::Store(error.to_string()))?,
        ActorId::parse("actor.world-kernel")
            .map_err(|error| KernelError::Store(error.to_string()))?,
        principal.clone(),
        workload,
        DelegationChain::new(vec![grant]).map_err(|error| KernelError::Store(error.to_string()))?,
        Clearance::personal_owner(),
    ))
}
