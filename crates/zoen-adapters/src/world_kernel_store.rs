//! Postgres-backed seven public verbs on the active `WorldRelease` catalog.

use sha2::{Digest, Sha256};
use sqlx::{PgPool, Row, postgres::PgRow};
use zoen_core::{
    ActionId, ActorId, DefinitionDigest, DefinitionId, DefinitionReference,
    DefinitionRevisionNumber, MembershipId, PolicyEvaluation, PolicyEvidence, PrincipalId,
    PublicVerb, ReleaseDigest, ResourceId, TenantId, TimestampMicros, TrustedExecutionContext,
    WORLD_KERNEL_AUTHORITY_DEFINITION, WORLD_KERNEL_AUTHORITY_DEFINITION_DIGEST,
    WORLD_KERNEL_AUTHORITY_RESOURCE, WorkloadId, WorldId, encode_hex,
};
use zoen_engine::{
    DEFAULT_QUERY_BUDGET, GovernedCatalogBasis, KernelAuthorizedObject, KernelDecision,
    KernelDecisionOutcome, KernelDiscoverResult, KernelError, KernelExecution, KernelExplanation,
    KernelPolicyDecision, KernelProposal, KernelQueryPage, KernelReceipt, KernelSurface,
    PolicyOperation, PolicyRequest, SealedCursorBasis, bind_sealed_cursor, directory_projection,
    effective_page_limit, resolve_budget_id, seal_next,
};

use crate::{
    PostgresIdentityStore, PostgresWorldReleaseStore, clock_micros,
    ontology_catalog::require_loadable_ontology_catalog,
    release_cedar::require_loadable_policy_catalog,
};

#[derive(Clone)]
pub struct PostgresWorldKernel {
    identity: PostgresIdentityStore,
    releases: PostgresWorldReleaseStore,
    pool: PgPool,
}

struct AuthorizedVerb {
    context: TrustedExecutionContext,
    policy: PolicyEvidence,
}

impl PostgresWorldKernel {
    #[must_use]
    pub fn new(releases: PostgresWorldReleaseStore, pool: PgPool) -> Self {
        Self {
            identity: PostgresIdentityStore::new(pool.clone()),
            releases,
            pool,
        }
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
        membership: &MembershipId,
        surface: KernelSurface,
    ) -> Result<KernelDiscoverResult, KernelError> {
        let basis = self.catalog_basis(world).await?;
        self.authorize_verb(world, principal, membership, &basis, PublicVerb::Discover)
            .await?;
        Ok(KernelDiscoverResult {
            basis,
            surface,
            decision: KernelPolicyDecision::Permit,
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
        membership: &MembershipId,
        surface: KernelSurface,
    ) -> Result<KernelDiscoverResult, KernelError> {
        let basis = self.catalog_basis(world).await?;
        self.authorize_verb(world, principal, membership, &basis, PublicVerb::Query)
            .await?;
        Ok(KernelDiscoverResult {
            basis,
            surface,
            decision: KernelPolicyDecision::Permit,
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
        membership: &MembershipId,
        proposal_id: &str,
        input_jcs: &str,
        surface: KernelSurface,
    ) -> Result<(KernelProposal, KernelSurface), KernelError> {
        let _ = surface;
        let basis = self.catalog_basis(world).await?;
        let authority = self
            .authorize_verb(world, principal, membership, &basis, PublicVerb::Propose)
            .await?;
        let preview_hash = preview_hash(&basis.release_digest, input_jcs);
        let proposed_at = clock_micros();
        let policy_revision = policy_revision_i64(&authority.policy)?;
        let inserted = sqlx::query(
            "INSERT INTO world_kernel_proposals (
                proposal_id, world_id, release_digest, principal_id, membership_id,
                actor_id, workload_id, action_id, input_jcs, preview_hash,
                policy_id, policy_digest, policy_revision, determining_policies,
                proposed_at_micros
             ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                $11, $12, $13, $14, $15
             )
             ON CONFLICT (world_id, preview_hash) DO NOTHING",
        )
        .bind(proposal_id)
        .bind(world.as_str())
        .bind(basis.release_digest.as_str())
        .bind(principal.as_str())
        .bind(membership.as_str())
        .bind(authority.context.actor_id().as_str())
        .bind(authority.context.workload_id().as_str())
        .bind(PublicVerb::Propose.action_id())
        .bind(input_jcs)
        .bind(&preview_hash)
        .bind(authority.policy.revision.id.as_str())
        .bind(authority.policy.revision.digest.as_str())
        .bind(policy_revision)
        .bind(&authority.policy.determining_policies)
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
            if existing.principal != *principal || existing.membership != *membership {
                return Err(KernelError::Denied(
                    "proposal replay authority does not match original".to_owned(),
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
                membership: membership.clone(),
                actor: authority.context.actor_id().clone(),
                workload: authority.context.workload_id().clone(),
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
        membership: &MembershipId,
        outcome: KernelDecisionOutcome,
        surface: KernelSurface,
    ) -> Result<(KernelDecision, KernelSurface), KernelError> {
        let _ = surface;
        let proposal = self.get_proposal(proposal_id).await?.ok_or_else(|| {
            KernelError::NotFound(format!("proposal {proposal_id} was not found"))
        })?;
        let basis = self.catalog_basis(&proposal.world).await?;
        if basis.release_digest != proposal.release_digest {
            return Err(KernelError::Conflict(
                "proposal release is not the active WorldRelease".to_owned(),
            ));
        }
        let authority = self
            .authorize_verb(
                &proposal.world,
                principal,
                membership,
                &basis,
                PublicVerb::Decide,
            )
            .await?;
        if let Some(existing) = self.get_decision(proposal_id).await? {
            if existing.principal != *principal || existing.membership != *membership {
                return Err(KernelError::Denied(
                    "decision replay authority does not match original".to_owned(),
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
        let policy_revision = policy_revision_i64(&authority.policy)?;
        sqlx::query(
            "INSERT INTO world_kernel_decisions (
                proposal_id, principal_id, membership_id, actor_id, workload_id,
                action_id, outcome, policy_id, policy_digest, policy_revision,
                determining_policies, decided_at_micros
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)",
        )
        .bind(proposal_id)
        .bind(principal.as_str())
        .bind(membership.as_str())
        .bind(authority.context.actor_id().as_str())
        .bind(authority.context.workload_id().as_str())
        .bind(PublicVerb::Decide.action_id())
        .bind(outcome.as_str())
        .bind(authority.policy.revision.id.as_str())
        .bind(authority.policy.revision.digest.as_str())
        .bind(policy_revision)
        .bind(&authority.policy.determining_policies)
        .bind(decided_at)
        .execute(&self.pool)
        .await
        .map_err(|error| KernelError::Store(error.to_string()))?;
        Ok((
            KernelDecision {
                proposal_id: proposal_id.to_owned(),
                principal: principal.clone(),
                membership: membership.clone(),
                actor: authority.context.actor_id().clone(),
                workload: authority.context.workload_id().clone(),
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
        membership: &MembershipId,
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
        let authority = self
            .authorize_verb(
                &proposal.world,
                principal,
                membership,
                &basis,
                PublicVerb::Commit,
            )
            .await?;
        if let Some(existing) = self.get_receipt(proposal_id).await? {
            if existing.principal != *principal || existing.membership != *membership {
                return Err(KernelError::Denied(
                    "commit replay authority does not match original".to_owned(),
                ));
            }
            return Ok((existing, surface));
        }
        let committed_at = clock_micros();
        let receipt_id = format!("receipt.kernel.{proposal_id}");
        let explanation_jcs = explanation_jcs(
            &proposal,
            &decision,
            principal,
            membership,
            &receipt_id,
            &basis.release_digest,
        )?;
        let policy_revision = policy_revision_i64(&authority.policy)?;
        sqlx::query(
            "INSERT INTO world_kernel_receipts (
                proposal_id, receipt_id, release_digest, principal_id, membership_id,
                actor_id, workload_id, action_id, explanation_jcs, policy_id,
                policy_digest, policy_revision, determining_policies, committed_at_micros
             ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
             )",
        )
        .bind(proposal_id)
        .bind(&receipt_id)
        .bind(basis.release_digest.as_str())
        .bind(principal.as_str())
        .bind(membership.as_str())
        .bind(authority.context.actor_id().as_str())
        .bind(authority.context.workload_id().as_str())
        .bind(PublicVerb::Commit.action_id())
        .bind(&explanation_jcs)
        .bind(authority.policy.revision.id.as_str())
        .bind(authority.policy.revision.digest.as_str())
        .bind(policy_revision)
        .bind(&authority.policy.determining_policies)
        .bind(committed_at)
        .execute(&self.pool)
        .await
        .map_err(|error| KernelError::Store(error.to_string()))?;
        Ok((
            KernelReceipt {
                proposal_id: proposal_id.to_owned(),
                receipt_id,
                release_digest: basis.release_digest,
                principal: principal.clone(),
                membership: membership.clone(),
                actor: authority.context.actor_id().clone(),
                workload: authority.context.workload_id().clone(),
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
        membership: &MembershipId,
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
        self.authorize_verb(
            &proposal.world,
            principal,
            membership,
            &basis,
            PublicVerb::Explain,
        )
        .await?;
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
        membership: &MembershipId,
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
        let authority = self
            .authorize_verb(
                &proposal.world,
                principal,
                membership,
                &basis,
                PublicVerb::Execute,
            )
            .await?;
        if let Some(existing) = self.get_execution(receipt_id).await? {
            if existing.principal != *principal || existing.membership != *membership {
                return Err(KernelError::Denied(
                    "execute replay authority does not match original".to_owned(),
                ));
            }
            return Ok((existing, surface));
        }
        let executed_at = clock_micros();
        let execution_id = format!("execution.kernel.{receipt_id}");
        let policy_revision = policy_revision_i64(&authority.policy)?;
        sqlx::query(
            "INSERT INTO world_kernel_executions (
                receipt_id, execution_id, release_digest, principal_id, membership_id,
                actor_id, workload_id, action_id, policy_id, policy_digest,
                policy_revision, determining_policies, executed_at_micros
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)",
        )
        .bind(receipt_id)
        .bind(&execution_id)
        .bind(basis.release_digest.as_str())
        .bind(principal.as_str())
        .bind(membership.as_str())
        .bind(authority.context.actor_id().as_str())
        .bind(authority.context.workload_id().as_str())
        .bind(PublicVerb::Execute.action_id())
        .bind(authority.policy.revision.id.as_str())
        .bind(authority.policy.revision.digest.as_str())
        .bind(policy_revision)
        .bind(&authority.policy.determining_policies)
        .bind(executed_at)
        .execute(&self.pool)
        .await
        .map_err(|error| KernelError::Store(error.to_string()))?;
        Ok((
            KernelExecution {
                receipt_id: receipt_id.to_owned(),
                execution_id,
                release_digest: basis.release_digest,
                principal: principal.clone(),
                membership: membership.clone(),
                actor: authority.context.actor_id().clone(),
                workload: authority.context.workload_id().clone(),
            },
            surface,
        ))
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
        membership: &MembershipId,
        object_type: &str,
        page_token: &str,
        requested_limit: u32,
        requested_budget: Option<&str>,
        surface: KernelSurface,
    ) -> Result<KernelQueryPage, KernelError> {
        let basis = self.catalog_basis(world).await?;
        self.authorize_verb(world, principal, membership, &basis, PublicVerb::Query)
            .await?;
        let budget_id = resolve_budget_id(requested_budget)
            .map_err(|error| KernelError::Denied(error.to_string()))?
            .to_owned();
        let page_limit = effective_page_limit(requested_limit)
            .map_err(|error| KernelError::Denied(error.to_string()))?;
        let seal_basis = SealedCursorBasis {
            authority_principal: principal.as_str().to_owned(),
            membership: membership.as_str().to_owned(),
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
        let page: Vec<_> = authorized
            .into_iter()
            .take(page_end.saturating_add(1))
            .collect();
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
        let explanation_jcs = serde_jcs::to_string(&serde_json::json!({
            "authorizedCount": authorized_count,
            "budgetId": budget_id.as_str(),
            "decision": "permit",
            "membership": membership.as_str(),
            "objectType": object_type,
            "policyDigest": basis.policy.as_str(),
            "principal": principal.as_str(),
            "releaseDigest": basis.release_digest.as_str(),
            "scannedUnauthorized": false,
        }))
        .map_err(|error| KernelError::Store(error.to_string()))?;
        Ok(KernelQueryPage {
            basis,
            surface,
            decision: KernelPolicyDecision::Permit,
            membership: membership.clone(),
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

    async fn count_authorized_objects(
        &self,
        world: &WorldId,
        principal: &PrincipalId,
        membership: &MembershipId,
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
        .bind(membership.as_str())
        .fetch_one(&self.pool)
        .await
        .map_err(|error| KernelError::Store(error.to_string()))?;
        u32::try_from(count).map_err(|_| KernelError::Store("authorized count overflow".to_owned()))
    }

    async fn load_authorized_objects(
        &self,
        world: &WorldId,
        principal: &PrincipalId,
        membership: &MembershipId,
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
            .bind(membership.as_str())
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
            .bind(membership.as_str())
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
        membership: &MembershipId,
        basis: &GovernedCatalogBasis,
        verb: PublicVerb,
    ) -> Result<AuthorizedVerb, KernelError> {
        let action = ActionId::parse(verb.action_id())
            .map_err(|error| KernelError::Store(error.to_string()))?;
        let resource = ResourceId::parse(WORLD_KERNEL_AUTHORITY_RESOURCE)
            .map_err(|error| KernelError::Store(error.to_string()))?;
        let tenant = TenantId::parse(world.as_str())
            .map_err(|error| KernelError::Store(error.to_string()))?;
        let context = self
            .identity
            .resolve_membership_authority(
                membership,
                &tenant,
                principal,
                &action,
                &resource,
                TimestampMicros::new(clock_micros()),
            )
            .await
            .map_err(|_| {
                KernelError::Denied(format!(
                    "{} denied: Membership does not authorize {} in this World",
                    verb.as_str(),
                    verb.action_id(),
                ))
            })?;
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
        let definition = DefinitionReference {
            definition_id: DefinitionId::parse(WORLD_KERNEL_AUTHORITY_DEFINITION)
                .map_err(|error| KernelError::Store(error.to_string()))?,
            digest: DefinitionDigest::parse(WORLD_KERNEL_AUTHORITY_DEFINITION_DIGEST)
                .map_err(|error| KernelError::Store(error.to_string()))?,
            revision: DefinitionRevisionNumber::new(1).ok_or_else(|| {
                KernelError::Store("definition revision must be positive".to_owned())
            })?,
        };
        let projection = directory_projection(&context, &resource).map_err(KernelError::Store)?;
        match evaluator.evaluate_request(&PolicyRequest {
            action_id: &action,
            approved: false,
            classification: None,
            context: &context,
            definition: &definition,
            inputs: &[],
            operation: kernel_policy_operation(verb),
            projection: Some(&projection),
            resource_id: &resource,
            written_classification: None,
        }) {
            PolicyEvaluation::Permit(policy) => Ok(AuthorizedVerb { context, policy }),
            PolicyEvaluation::Deny(_) => Err(KernelError::Denied(format!(
                "{} denied by active-release policy",
                verb.as_str(),
            ))),
            PolicyEvaluation::EvaluationError { message, .. } => Err(KernelError::Denied(format!(
                "{} policy evaluation failed: {message}",
                verb.as_str()
            ))),
        }
    }

    async fn get_proposal(&self, proposal_id: &str) -> Result<Option<KernelProposal>, KernelError> {
        let row = sqlx::query(
            "SELECT proposal_id, world_id, release_digest, principal_id, membership_id,
                    actor_id, workload_id, input_jcs, preview_hash
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
            "SELECT proposal_id, world_id, release_digest, principal_id, membership_id,
                    actor_id, workload_id, input_jcs, preview_hash
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
            "SELECT proposal_id, principal_id, membership_id, actor_id, workload_id, outcome
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
            "SELECT proposal_id, receipt_id, release_digest, principal_id, membership_id,
                    actor_id, workload_id, explanation_jcs
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
            "SELECT proposal_id, receipt_id, release_digest, principal_id, membership_id,
                    actor_id, workload_id, explanation_jcs
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
            "SELECT receipt_id, execution_id, release_digest, principal_id, membership_id,
                    actor_id, workload_id
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
        membership: MembershipId::parse(
            row.try_get::<String, _>("membership_id")
                .map_err(|error| KernelError::Store(error.to_string()))?,
        )
        .map_err(|error| KernelError::Store(error.to_string()))?,
        actor: ActorId::parse(
            row.try_get::<String, _>("actor_id")
                .map_err(|error| KernelError::Store(error.to_string()))?,
        )
        .map_err(|error| KernelError::Store(error.to_string()))?,
        workload: WorkloadId::parse(
            row.try_get::<String, _>("workload_id")
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
        membership: MembershipId::parse(
            row.try_get::<String, _>("membership_id")
                .map_err(|error| KernelError::Store(error.to_string()))?,
        )
        .map_err(|error| KernelError::Store(error.to_string()))?,
        actor: ActorId::parse(
            row.try_get::<String, _>("actor_id")
                .map_err(|error| KernelError::Store(error.to_string()))?,
        )
        .map_err(|error| KernelError::Store(error.to_string()))?,
        workload: WorkloadId::parse(
            row.try_get::<String, _>("workload_id")
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
        principal: PrincipalId::parse(
            row.try_get::<String, _>("principal_id")
                .map_err(|error| KernelError::Store(error.to_string()))?,
        )
        .map_err(|error| KernelError::Store(error.to_string()))?,
        membership: MembershipId::parse(
            row.try_get::<String, _>("membership_id")
                .map_err(|error| KernelError::Store(error.to_string()))?,
        )
        .map_err(|error| KernelError::Store(error.to_string()))?,
        actor: ActorId::parse(
            row.try_get::<String, _>("actor_id")
                .map_err(|error| KernelError::Store(error.to_string()))?,
        )
        .map_err(|error| KernelError::Store(error.to_string()))?,
        workload: WorkloadId::parse(
            row.try_get::<String, _>("workload_id")
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
        principal: PrincipalId::parse(
            row.try_get::<String, _>("principal_id")
                .map_err(|error| KernelError::Store(error.to_string()))?,
        )
        .map_err(|error| KernelError::Store(error.to_string()))?,
        membership: MembershipId::parse(
            row.try_get::<String, _>("membership_id")
                .map_err(|error| KernelError::Store(error.to_string()))?,
        )
        .map_err(|error| KernelError::Store(error.to_string()))?,
        actor: ActorId::parse(
            row.try_get::<String, _>("actor_id")
                .map_err(|error| KernelError::Store(error.to_string()))?,
        )
        .map_err(|error| KernelError::Store(error.to_string()))?,
        workload: WorkloadId::parse(
            row.try_get::<String, _>("workload_id")
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
    committed_by: &PrincipalId,
    committed_membership: &MembershipId,
    receipt_id: &str,
    release: &ReleaseDigest,
) -> Result<String, KernelError> {
    serde_jcs::to_string(&serde_json::json!({
        "commit": {
            "membership": committed_membership.as_str(),
            "principal": committed_by.as_str(),
        },
        "decision": {
            "membership": decision.membership.as_str(),
            "outcome": decision.outcome.as_str(),
            "principal": decision.principal.as_str(),
        },
        "proposal": {
            "membership": proposal.membership.as_str(),
            "principal": proposal.principal.as_str(),
            "proposalId": proposal.proposal_id.as_str(),
        },
        "receiptId": receipt_id,
        "releaseDigest": release.as_str(),
        "schema": "zoen.kernel-explanation.v2",
    }))
    .map_err(|error| KernelError::Store(error.to_string()))
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

fn kernel_policy_operation(verb: PublicVerb) -> PolicyOperation {
    match verb {
        PublicVerb::Discover => PolicyOperation::Discover,
        PublicVerb::Query => PolicyOperation::Query,
        PublicVerb::Propose => PolicyOperation::Propose,
        PublicVerb::Decide => PolicyOperation::Decide,
        PublicVerb::Commit => PolicyOperation::Commit,
        PublicVerb::Explain => PolicyOperation::Explain,
        PublicVerb::Execute => PolicyOperation::Execute,
    }
}

fn policy_revision_i64(policy: &PolicyEvidence) -> Result<i64, KernelError> {
    i64::try_from(policy.revision.revision.get())
        .map_err(|_| KernelError::Store("policy revision exceeds PostgreSQL bigint".to_owned()))
}
