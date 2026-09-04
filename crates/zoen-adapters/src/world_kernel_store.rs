//! Postgres-backed seven public verbs on the active `WorldRelease` catalog.

use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Postgres, Row, Transaction, postgres::PgRow};
use zoen_core::{
    ActionId, ActorId, BudgetClassId, CommitSequence, DefinitionDigest, DefinitionId,
    DefinitionReference, DefinitionRevisionNumber, MembershipId, PolicyEvaluation, PolicyEvidence,
    PrincipalId, PublicVerb, ReleaseDigest, ResourceId, TimestampMicros, TrustedExecutionContext,
    WORLD_KERNEL_AUTHORITY_DEFINITION, WORLD_KERNEL_AUTHORITY_DEFINITION_DIGEST,
    WORLD_KERNEL_AUTHORITY_RESOURCE, WorkloadId, WorldId, encode_hex,
};
use zoen_engine::{
    AuthorizedObjectSetPlanDigest, CursorSealer, CursorSortOrder, GovernedCatalogBasis,
    KernelAuthorizedObject, KernelDecision, KernelDecisionOutcome, KernelDiscoverResult,
    KernelError, KernelExecution, KernelExplanation, KernelPolicyDecision, KernelProposal,
    KernelQueryPage, KernelReceipt, KernelSurface, PolicyOperation, PolicyRequest,
    SealedCursorBasis, TrustedAuthorityDigest, directory_projection, effective_page_limit,
};

use crate::{
    PostgresIdentityStore, PostgresWorldReleaseStore, cedar::budget_classes_from_policy_catalog,
    clock_micros, ontology_catalog::require_loadable_ontology_catalog,
    release_cedar::require_loadable_policy_catalog, typed_object_store::PreparedTypeAssignment,
};

struct PendingKernelReceipt<'a> {
    proposal: &'a KernelProposal,
    receipt_id: String,
    explanation_jcs: String,
    type_assignment: Option<&'a PreparedTypeAssignment>,
}

#[derive(Clone)]
pub struct PostgresWorldKernel {
    identity: PostgresIdentityStore,
    cursor_sealer: Option<CursorSealer>,
    releases: PostgresWorldReleaseStore,
    pool: PgPool,
}

struct KernelAuthorization {
    action: ActionId,
    approved: bool,
    authorized_at: TimestampMicros,
    context: TrustedExecutionContext,
    delegation_jcs: String,
    membership: MembershipId,
    policy: PolicyEvidence,
    principal: PrincipalId,
    release_digest: ReleaseDigest,
    verb: PublicVerb,
    world: WorldId,
}

impl KernelAuthorization {
    fn validate_seal(&self) -> Result<(), KernelError> {
        let expected_delegation = delegation_jcs(&self.context)?;
        if self.action.as_str() != self.verb.action_id()
            || self.context.world_id().as_str() != self.world.as_str()
            || self.context.principal_id() != &self.principal
            || self.delegation_jcs != expected_delegation
            || self.approved != verb_has_approval(self.verb)
        {
            return Err(KernelError::Store(
                "kernel authorization seal is internally inconsistent".to_owned(),
            ));
        }
        Ok(())
    }

    fn bind_read(
        self,
        verb: PublicVerb,
        world: &WorldId,
        release_digest: &ReleaseDigest,
        principal: &PrincipalId,
        membership: &MembershipId,
    ) -> Result<TrustedAuthorityDigest, KernelError> {
        self.validate_seal()?;
        if self.verb != verb || self.world != *world || self.release_digest != *release_digest {
            return Err(KernelError::Conflict(
                "read authority does not match the claimed active WorldRelease".to_owned(),
            ));
        }
        if self.principal != *principal || self.membership != *membership {
            return Err(KernelError::Denied(
                "read authority does not match the caller".to_owned(),
            ));
        }
        let authority = serde_json::json!({
            "action": self.action.as_str(),
            "actor": self.context.actor_id().as_str(),
            "clearance": self.context.clearance().to_token_strings(),
            "delegation": self.delegation_jcs,
            "membership": self.membership.as_str(),
            "principal": self.principal.as_str(),
            "schema": "zoen.membership-authority.v1",
            "world": self.context.world_id().as_str(),
            "workload": self.context.workload_id().as_str(),
        });
        let canonical =
            serde_jcs::to_vec(&authority).map_err(|error| KernelError::Store(error.to_string()))?;
        Ok(TrustedAuthorityDigest::from_sha256(
            Sha256::digest(canonical).into(),
        ))
    }
}

impl PostgresWorldKernel {
    #[must_use]
    pub fn new(
        releases: PostgresWorldReleaseStore,
        pool: PgPool,
        cursor_sealer: Option<CursorSealer>,
    ) -> Self {
        Self {
            identity: PostgresIdentityStore::new(pool.clone()),
            cursor_sealer,
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
        let authority = self
            .authorize_verb(world, principal, membership, &basis, PublicVerb::Discover)
            .await?;
        authority.bind_read(
            PublicVerb::Discover,
            world,
            &basis.release_digest,
            principal,
            membership,
        )?;
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
        let authority = self
            .authorize_verb(world, principal, membership, &basis, PublicVerb::Query)
            .await?;
        authority.bind_read(
            PublicVerb::Query,
            world,
            &basis.release_digest,
            principal,
            membership,
        )?;
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
        let input_jcs = canonicalize_json(input_jcs, "proposal input")?;
        let basis = self.catalog_basis(world).await?;
        let authority = self
            .authorize_verb(world, principal, membership, &basis, PublicVerb::Propose)
            .await?;
        let preview_hash = preview_hash(&basis.release_digest, &input_jcs);
        let proposal =
            persist_proposal(&self.pool, authority, proposal_id, input_jcs, preview_hash).await?;
        Ok((proposal, surface))
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
        let decision = persist_decision(&self.pool, authority, proposal_id, outcome).await?;
        Ok((decision, surface))
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
        let prepared =
            Self::prepare_type_assignment_from_commit(&proposal.world, &proposal.input_jcs)?;
        let receipt_id = format!("receipt.kernel.{proposal_id}");
        let type_assignment = prepared
            .as_ref()
            .map(|assignment| assignment.explanation_value(&receipt_id))
            .transpose()?;
        let explanation_jcs = explanation_jcs(
            &proposal,
            &decision,
            &authority.principal,
            &authority.membership,
            &receipt_id,
            &authority.release_digest,
            type_assignment.as_ref(),
        )?;
        let receipt = persist_receipt(
            &self.pool,
            authority,
            PendingKernelReceipt {
                proposal: &proposal,
                receipt_id,
                explanation_jcs,
                type_assignment: prepared.as_ref(),
            },
        )
        .await?;
        Ok((receipt, surface))
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
        if proposal.release_digest != receipt.release_digest {
            return Err(KernelError::Conflict(
                "receipt release does not match its proposal".to_owned(),
            ));
        }
        let basis = self.catalog_basis(&proposal.world).await?;
        let authority = self
            .authorize_verb(
                &proposal.world,
                principal,
                membership,
                &basis,
                PublicVerb::Explain,
            )
            .await?;
        authority.bind_read(
            PublicVerb::Explain,
            &proposal.world,
            &receipt.release_digest,
            principal,
            membership,
        )?;
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
        if proposal.release_digest != receipt.release_digest {
            return Err(KernelError::Conflict(
                "receipt release does not match its proposal".to_owned(),
            ));
        }
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
        let execution_id = format!("execution.kernel.{receipt_id}");
        let execution = persist_execution(&self.pool, authority, receipt_id, execution_id).await?;
        Ok((execution, surface))
    }

    /// Authorize before discovery, page only the entitled set, and seal the cursor.
    ///
    /// # Errors
    ///
    /// Returns [`KernelError`] when policy denies, the cursor is invalid, the active release
    /// omits the server-selected budget, or the store fails.
    pub async fn query_objects(
        &self,
        world: &WorldId,
        principal: &PrincipalId,
        membership: &MembershipId,
        object_type: &str,
        page_token: &str,
        requested_limit: u32,
        surface: KernelSurface,
    ) -> Result<KernelQueryPage, KernelError> {
        let basis = self.catalog_basis(world).await?;
        let authority = self
            .authorize_verb(world, principal, membership, &basis, PublicVerb::Query)
            .await?;
        let trusted_authority_digest = authority.bind_read(
            PublicVerb::Query,
            world,
            &basis.release_digest,
            principal,
            membership,
        )?;
        let cursor_sealer = self.cursor_sealer.as_ref().ok_or_else(|| {
            KernelError::Denied("server cursor keyring is not configured".to_owned())
        })?;
        let seal_basis = self
            .sealed_query_basis(
                &basis,
                world,
                principal,
                membership,
                object_type,
                requested_limit,
                trusted_authority_digest,
            )
            .await?;
        let budget_id = seal_basis.budget_id.clone();
        let page_limit = seal_basis.page_limit;
        let after = if page_token.is_empty() {
            None
        } else {
            Some(
                cursor_sealer
                    .bind(page_token, &seal_basis, unix_seconds()?)
                    .map_err(|error| KernelError::Denied(error.to_string()))?
                    .after_object_id,
            )
        };
        // Authorize-before-discovery: load only granted object ids, never the full table.
        let authorized_count = self
            .count_authorized_objects(world, principal, membership, object_type)
            .await?;
        let authorized = self
            .load_authorized_objects(
                world,
                principal,
                membership,
                object_type,
                after.as_deref(),
                page_limit,
            )
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
            cursor_sealer
                .seal_next(&seal_basis, &last.object_id, true, unix_seconds()?)
                .map_err(|error| KernelError::Store(error.to_string()))?
        } else {
            String::new()
        };
        let page_digest = authorized_page_digest(&budget_id, &objects)?;
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
            budget_id: budget_id.as_str().to_owned(),
            page_limit,
            trusted_authority_digest: seal_basis.trusted_authority_digest,
            authority_cut: seal_basis.authority_cut,
            authorized_plan_digest: seal_basis.authorized_plan_digest,
            authorized_count,
            objects,
            next_cursor,
            page_digest,
            explanation_jcs,
        })
    }

    async fn sealed_query_basis(
        &self,
        catalog: &GovernedCatalogBasis,
        world: &WorldId,
        principal: &PrincipalId,
        membership: &MembershipId,
        object_type: &str,
        requested_limit: u32,
        trusted_authority_digest: TrustedAuthorityDigest,
    ) -> Result<SealedCursorBasis, KernelError> {
        let budget_id = self.resolve_query_budget(catalog).await?;
        let page_limit = effective_page_limit(requested_limit)
            .map_err(|error| KernelError::Denied(error.to_string()))?;
        let authority_cut: Option<CommitSequence> = None;
        let authorized_plan_digest = authorized_plan_digest(&NarrowAuthorizedPlan {
            schema: "zoen.authorized-object-set-plan.narrow.v1",
            entitlement_basis: "world+object_type+principal+membership grant",
            trusted_authority_digest: Some(trusted_authority_digest.as_str()),
            authority_cut: authority_cut.map(CommitSequence::get),
            authority_principal: principal.as_str(),
            membership: membership.as_str(),
            world: world.as_str(),
            object_type,
            release_digest: catalog.release_digest.as_str(),
            policy_digest: catalog.policy.as_str(),
            budget_id: budget_id.as_str(),
            page_limit,
            projection: &["object_id", "object_type", "fields_jcs"],
            sort_order: CursorSortOrder::ObjectIdAscending.as_str(),
        })?;
        Ok(SealedCursorBasis {
            trusted_authority_digest: Some(trusted_authority_digest),
            authority_cut,
            authorized_plan_digest,
            authority_principal: principal.clone(),
            membership: membership.clone(),
            world: world.clone(),
            object_type: object_type.to_owned(),
            release_digest: catalog.release_digest.clone(),
            policy_digest: catalog.policy.clone(),
            budget_id,
            page_limit,
            sort_order: CursorSortOrder::ObjectIdAscending,
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
        page_limit: u32,
    ) -> Result<Vec<KernelAuthorizedObject>, KernelError> {
        let sql_limit = i64::from(page_limit).saturating_add(1);
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
                 ORDER BY o.object_id ASC
                 LIMIT $6",
            )
            .bind(world.as_str())
            .bind(object_type)
            .bind(principal.as_str())
            .bind(membership.as_str())
            .bind(after_id)
            .bind(sql_limit)
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
                 ORDER BY o.object_id ASC
                 LIMIT $5",
            )
            .bind(world.as_str())
            .bind(object_type)
            .bind(principal.as_str())
            .bind(membership.as_str())
            .bind(sql_limit)
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

    async fn resolve_query_budget(
        &self,
        basis: &GovernedCatalogBasis,
    ) -> Result<BudgetClassId, KernelError> {
        let catalogs = self
            .releases
            .get_catalogs(&basis.release_digest)
            .await
            .map_err(map_release)?
            .ok_or_else(|| {
                KernelError::NotFound("active release catalogs were not found".to_owned())
            })?;
        let catalog = budget_classes_from_policy_catalog(catalogs.policy().bytes())
            .map_err(|error| KernelError::Denied(error.to_string()))?;
        let budget = catalog
            .selection_order()
            .into_iter()
            .next()
            .ok_or_else(|| {
                KernelError::Denied("active release does not publish a query budget".to_owned())
            })?;
        Ok(budget.id().clone())
    }

    pub(crate) async fn catalog_basis(
        &self,
        world: &WorldId,
    ) -> Result<GovernedCatalogBasis, KernelError> {
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
    ) -> Result<KernelAuthorization, KernelError> {
        let action = ActionId::parse(verb.action_id())
            .map_err(|error| KernelError::Store(error.to_string()))?;
        let resource = ResourceId::parse(WORLD_KERNEL_AUTHORITY_RESOURCE)
            .map_err(|error| KernelError::Store(error.to_string()))?;
        let authorized_at = TimestampMicros::new(clock_micros());
        let context = self
            .identity
            .resolve_membership_authority(
                membership,
                world,
                principal,
                &action,
                &resource,
                authorized_at,
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
        let approved = verb_has_approval(verb);
        match evaluator.evaluate_request(&PolicyRequest {
            action_id: &action,
            approved,
            classification: None,
            context: &context,
            definition: &definition,
            inputs: &[],
            operation: kernel_policy_operation(verb),
            projection: Some(&projection),
            resource_id: &resource,
            written_classification: None,
        }) {
            PolicyEvaluation::Permit(policy) => {
                let delegation_jcs = delegation_jcs(&context)?;
                let authorization = KernelAuthorization {
                    action,
                    approved,
                    authorized_at,
                    context,
                    delegation_jcs,
                    membership: membership.clone(),
                    policy,
                    principal: principal.clone(),
                    release_digest: basis.release_digest.clone(),
                    verb,
                    world: world.clone(),
                };
                authorization.validate_seal()?;
                Ok(authorization)
            }
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
}

async fn persist_proposal(
    pool: &PgPool,
    authorization: KernelAuthorization,
    proposal_id: &str,
    input_jcs: String,
    preview_hash: String,
) -> Result<KernelProposal, KernelError> {
    let policy_revision = policy_revision_i64(&authorization.policy)?;
    let mut transaction = begin_authorized_write(pool, &authorization).await?;
    let inserted = sqlx::query(
        "INSERT INTO world_kernel_proposals (
            proposal_id, world_id, release_digest, principal_id, membership_id,
            actor_id, workload_id, delegation_jcs, action_id, authorized_at_micros,
            approved, input_jcs, preview_hash, policy_id, policy_digest,
            policy_revision, determining_policies, proposed_at_micros
         ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17, $18
         )
         ON CONFLICT DO NOTHING",
    )
    .bind(proposal_id)
    .bind(authorization.world.as_str())
    .bind(authorization.release_digest.as_str())
    .bind(authorization.principal.as_str())
    .bind(authorization.membership.as_str())
    .bind(authorization.context.actor_id().as_str())
    .bind(authorization.context.workload_id().as_str())
    .bind(&authorization.delegation_jcs)
    .bind(authorization.action.as_str())
    .bind(authorization.authorized_at.get())
    .bind(authorization.approved)
    .bind(&input_jcs)
    .bind(&preview_hash)
    .bind(authorization.policy.revision.id.as_str())
    .bind(authorization.policy.revision.digest.as_str())
    .bind(policy_revision)
    .bind(&authorization.policy.determining_policies)
    .bind(authorization.authorized_at.get())
    .execute(&mut *transaction)
    .await
    .map_err(|error| KernelError::Store(error.to_string()))?;
    let row = if inserted.rows_affected() == 0 {
        match proposal_row_by_id_tx(&mut transaction, proposal_id).await? {
            Some(row) => row,
            None => {
                proposal_row_by_preview_tx(&mut transaction, &authorization.world, &preview_hash)
                    .await?
                    .ok_or_else(|| {
                        KernelError::Conflict("proposal conflict could not be reloaded".to_owned())
                    })?
            }
        }
    } else {
        proposal_row_by_id_tx(&mut transaction, proposal_id)
            .await?
            .ok_or_else(|| {
                KernelError::Conflict("inserted proposal could not be reloaded".to_owned())
            })?
    };
    let proposal = row_to_proposal(&row)?;
    if proposal.world != authorization.world
        || proposal.release_digest != authorization.release_digest
        || proposal.preview_hash != preview_hash
        || proposal.input_jcs != input_jcs
    {
        return Err(KernelError::Conflict(
            "proposal replay does not match original".to_owned(),
        ));
    }
    require_matching_authorization(&row, &authorization, "proposed_at_micros", "proposal")?;
    transaction
        .commit()
        .await
        .map_err(|error| KernelError::Store(error.to_string()))?;
    Ok(proposal)
}

async fn persist_decision(
    pool: &PgPool,
    authorization: KernelAuthorization,
    proposal_id: &str,
    outcome: KernelDecisionOutcome,
) -> Result<KernelDecision, KernelError> {
    let policy_revision = policy_revision_i64(&authorization.policy)?;
    let mut transaction = begin_authorized_write(pool, &authorization).await?;
    sqlx::query(
        "INSERT INTO world_kernel_decisions (
            proposal_id, principal_id, membership_id, actor_id, workload_id,
            delegation_jcs, action_id, authorized_at_micros, approved, outcome,
            policy_id, policy_digest, policy_revision, determining_policies,
            decided_at_micros
         ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15
         )
         ON CONFLICT DO NOTHING",
    )
    .bind(proposal_id)
    .bind(authorization.principal.as_str())
    .bind(authorization.membership.as_str())
    .bind(authorization.context.actor_id().as_str())
    .bind(authorization.context.workload_id().as_str())
    .bind(&authorization.delegation_jcs)
    .bind(authorization.action.as_str())
    .bind(authorization.authorized_at.get())
    .bind(authorization.approved)
    .bind(outcome.as_str())
    .bind(authorization.policy.revision.id.as_str())
    .bind(authorization.policy.revision.digest.as_str())
    .bind(policy_revision)
    .bind(&authorization.policy.determining_policies)
    .bind(authorization.authorized_at.get())
    .execute(&mut *transaction)
    .await
    .map_err(|error| KernelError::Store(error.to_string()))?;
    let row = decision_row_tx(&mut transaction, proposal_id)
        .await?
        .ok_or_else(|| {
            KernelError::Conflict("decision conflict could not be reloaded".to_owned())
        })?;
    let decision = row_to_decision(&row)?;
    if decision.outcome != outcome {
        return Err(KernelError::Conflict(
            "decision outcome does not match original".to_owned(),
        ));
    }
    require_matching_authorization(&row, &authorization, "decided_at_micros", "decision")?;
    transaction
        .commit()
        .await
        .map_err(|error| KernelError::Store(error.to_string()))?;
    Ok(decision)
}

async fn persist_receipt(
    pool: &PgPool,
    authorization: KernelAuthorization,
    pending: PendingKernelReceipt<'_>,
) -> Result<KernelReceipt, KernelError> {
    let policy_revision = policy_revision_i64(&authorization.policy)?;
    let mut transaction = begin_authorized_write(pool, &authorization).await?;
    let inserted = sqlx::query(
        "INSERT INTO world_kernel_receipts (
            proposal_id, receipt_id, release_digest, principal_id, membership_id,
            actor_id, workload_id, delegation_jcs, action_id, authorized_at_micros,
            approved, explanation_jcs, policy_id, policy_digest, policy_revision,
            determining_policies, committed_at_micros
         ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17
         )
         ON CONFLICT DO NOTHING",
    )
    .bind(&pending.proposal.proposal_id)
    .bind(&pending.receipt_id)
    .bind(authorization.release_digest.as_str())
    .bind(authorization.principal.as_str())
    .bind(authorization.membership.as_str())
    .bind(authorization.context.actor_id().as_str())
    .bind(authorization.context.workload_id().as_str())
    .bind(&authorization.delegation_jcs)
    .bind(authorization.action.as_str())
    .bind(authorization.authorized_at.get())
    .bind(authorization.approved)
    .bind(&pending.explanation_jcs)
    .bind(authorization.policy.revision.id.as_str())
    .bind(authorization.policy.revision.digest.as_str())
    .bind(policy_revision)
    .bind(&authorization.policy.determining_policies)
    .bind(authorization.authorized_at.get())
    .execute(&mut *transaction)
    .await
    .map_err(|error| KernelError::Store(error.to_string()))?;
    let row = receipt_row_tx(&mut transaction, &pending.proposal.proposal_id)
        .await?
        .ok_or_else(|| {
            KernelError::Conflict("receipt conflict could not be reloaded".to_owned())
        })?;
    let receipt = row_to_receipt(&row)?;
    if receipt.receipt_id != pending.receipt_id
        || receipt.release_digest != authorization.release_digest
        || receipt.explanation_jcs != pending.explanation_jcs
    {
        return Err(KernelError::Conflict(
            "commit replay does not match original".to_owned(),
        ));
    }
    require_matching_authorization(&row, &authorization, "committed_at_micros", "commit")?;
    if let Some(prepared) = pending.type_assignment {
        if inserted.rows_affected() == 0 {
            PostgresWorldKernel::validate_type_assignment_replay(
                &mut transaction,
                &receipt.receipt_id,
                prepared,
            )
            .await?;
        } else {
            let _ = PostgresWorldKernel::materialize_type_assignment_from_commit(
                &mut transaction,
                &receipt.receipt_id,
                &pending.proposal.principal,
                prepared,
            )
            .await?;
        }
    }
    transaction
        .commit()
        .await
        .map_err(|error| KernelError::Store(error.to_string()))?;
    Ok(receipt)
}

async fn persist_execution(
    pool: &PgPool,
    authorization: KernelAuthorization,
    receipt_id: &str,
    execution_id: String,
) -> Result<KernelExecution, KernelError> {
    let policy_revision = policy_revision_i64(&authorization.policy)?;
    let mut transaction = begin_authorized_write(pool, &authorization).await?;
    sqlx::query(
        "INSERT INTO world_kernel_executions (
            receipt_id, execution_id, release_digest, principal_id, membership_id,
            actor_id, workload_id, delegation_jcs, action_id, authorized_at_micros,
            approved, policy_id, policy_digest, policy_revision, determining_policies,
            executed_at_micros
         ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16
         )
         ON CONFLICT DO NOTHING",
    )
    .bind(receipt_id)
    .bind(&execution_id)
    .bind(authorization.release_digest.as_str())
    .bind(authorization.principal.as_str())
    .bind(authorization.membership.as_str())
    .bind(authorization.context.actor_id().as_str())
    .bind(authorization.context.workload_id().as_str())
    .bind(&authorization.delegation_jcs)
    .bind(authorization.action.as_str())
    .bind(authorization.authorized_at.get())
    .bind(authorization.approved)
    .bind(authorization.policy.revision.id.as_str())
    .bind(authorization.policy.revision.digest.as_str())
    .bind(policy_revision)
    .bind(&authorization.policy.determining_policies)
    .bind(authorization.authorized_at.get())
    .execute(&mut *transaction)
    .await
    .map_err(|error| KernelError::Store(error.to_string()))?;
    let row = execution_row_tx(&mut transaction, receipt_id)
        .await?
        .ok_or_else(|| {
            KernelError::Conflict("execution conflict could not be reloaded".to_owned())
        })?;
    let execution = row_to_execution(&row)?;
    if execution.execution_id != execution_id
        || execution.release_digest != authorization.release_digest
    {
        return Err(KernelError::Conflict(
            "execute replay does not match original".to_owned(),
        ));
    }
    require_matching_authorization(&row, &authorization, "executed_at_micros", "execute")?;
    transaction
        .commit()
        .await
        .map_err(|error| KernelError::Store(error.to_string()))?;
    Ok(execution)
}

async fn begin_authorized_write<'a>(
    pool: &'a PgPool,
    authorization: &KernelAuthorization,
) -> Result<Transaction<'a, Postgres>, KernelError> {
    let mut transaction = pool
        .begin()
        .await
        .map_err(|error| KernelError::Store(error.to_string()))?;
    lock_authorized_release(&mut transaction, authorization).await?;
    Ok(transaction)
}

async fn lock_authorized_release(
    transaction: &mut Transaction<'_, Postgres>,
    authorization: &KernelAuthorization,
) -> Result<(), KernelError> {
    authorization.validate_seal()?;
    let locked_world = sqlx::query_scalar::<_, String>(
        "SELECT world_id
         FROM world_release_activation_locks
         WHERE world_id = $1
         FOR SHARE",
    )
    .bind(authorization.world.as_str())
    .fetch_optional(&mut **transaction)
    .await
    .map_err(|error| KernelError::Store(error.to_string()))?
    .ok_or_else(|| {
        KernelError::Conflict("active WorldRelease authority lock was not found".to_owned())
    })?;
    if locked_world != authorization.world.as_str() {
        return Err(KernelError::Conflict(
            "WorldRelease authority lock belongs to another World".to_owned(),
        ));
    }
    let active_digest = sqlx::query_scalar::<_, String>(
        "SELECT digest FROM world_active_releases WHERE world_id = $1",
    )
    .bind(authorization.world.as_str())
    .fetch_optional(&mut **transaction)
    .await
    .map_err(|error| KernelError::Store(error.to_string()))?
    .ok_or_else(|| KernelError::Conflict("world has no active release".to_owned()))?;
    let active_digest = ReleaseDigest::parse(active_digest)
        .map_err(|error| KernelError::Store(error.to_string()))?;
    if active_digest != authorization.release_digest {
        return Err(KernelError::Conflict(
            "authorized WorldRelease is no longer active".to_owned(),
        ));
    }
    Ok(())
}

async fn proposal_row_by_id_tx(
    transaction: &mut Transaction<'_, Postgres>,
    proposal_id: &str,
) -> Result<Option<PgRow>, KernelError> {
    sqlx::query(
        "SELECT proposal_id, world_id, release_digest, principal_id, membership_id,
                actor_id, workload_id, delegation_jcs, action_id, authorized_at_micros,
                approved, input_jcs, preview_hash, policy_id, policy_digest,
                policy_revision, determining_policies, proposed_at_micros
         FROM world_kernel_proposals WHERE proposal_id = $1",
    )
    .bind(proposal_id)
    .fetch_optional(&mut **transaction)
    .await
    .map_err(|error| KernelError::Store(error.to_string()))
}

async fn proposal_row_by_preview_tx(
    transaction: &mut Transaction<'_, Postgres>,
    world: &WorldId,
    preview_hash: &str,
) -> Result<Option<PgRow>, KernelError> {
    sqlx::query(
        "SELECT proposal_id, world_id, release_digest, principal_id, membership_id,
                actor_id, workload_id, delegation_jcs, action_id, authorized_at_micros,
                approved, input_jcs, preview_hash, policy_id, policy_digest,
                policy_revision, determining_policies, proposed_at_micros
         FROM world_kernel_proposals
         WHERE world_id = $1 AND preview_hash = $2",
    )
    .bind(world.as_str())
    .bind(preview_hash)
    .fetch_optional(&mut **transaction)
    .await
    .map_err(|error| KernelError::Store(error.to_string()))
}

async fn decision_row_tx(
    transaction: &mut Transaction<'_, Postgres>,
    proposal_id: &str,
) -> Result<Option<PgRow>, KernelError> {
    sqlx::query(
        "SELECT proposal_id, principal_id, membership_id, actor_id, workload_id,
                delegation_jcs, action_id, authorized_at_micros, approved, outcome,
                policy_id, policy_digest, policy_revision, determining_policies,
                decided_at_micros
         FROM world_kernel_decisions WHERE proposal_id = $1",
    )
    .bind(proposal_id)
    .fetch_optional(&mut **transaction)
    .await
    .map_err(|error| KernelError::Store(error.to_string()))
}

async fn receipt_row_tx(
    transaction: &mut Transaction<'_, Postgres>,
    proposal_id: &str,
) -> Result<Option<PgRow>, KernelError> {
    sqlx::query(
        "SELECT proposal_id, receipt_id, release_digest, principal_id, membership_id,
                actor_id, workload_id, delegation_jcs, action_id, authorized_at_micros,
                approved, explanation_jcs, policy_id, policy_digest, policy_revision,
                determining_policies, committed_at_micros
         FROM world_kernel_receipts WHERE proposal_id = $1",
    )
    .bind(proposal_id)
    .fetch_optional(&mut **transaction)
    .await
    .map_err(|error| KernelError::Store(error.to_string()))
}

async fn execution_row_tx(
    transaction: &mut Transaction<'_, Postgres>,
    receipt_id: &str,
) -> Result<Option<PgRow>, KernelError> {
    sqlx::query(
        "SELECT receipt_id, execution_id, release_digest, principal_id, membership_id,
                actor_id, workload_id, delegation_jcs, action_id, authorized_at_micros,
                approved, policy_id, policy_digest, policy_revision, determining_policies,
                executed_at_micros
         FROM world_kernel_executions WHERE receipt_id = $1",
    )
    .bind(receipt_id)
    .fetch_optional(&mut **transaction)
    .await
    .map_err(|error| KernelError::Store(error.to_string()))
}

fn authorization_matches_row(
    row: &PgRow,
    authorization: &KernelAuthorization,
    event_timestamp_column: &'static str,
) -> Result<bool, KernelError> {
    authorization.validate_seal()?;
    let policy_revision = policy_revision_i64(&authorization.policy)?;
    let principal = row
        .try_get::<String, _>("principal_id")
        .map_err(|error| KernelError::Store(error.to_string()))?;
    let membership = row
        .try_get::<String, _>("membership_id")
        .map_err(|error| KernelError::Store(error.to_string()))?;
    let actor = row
        .try_get::<String, _>("actor_id")
        .map_err(|error| KernelError::Store(error.to_string()))?;
    let workload = row
        .try_get::<String, _>("workload_id")
        .map_err(|error| KernelError::Store(error.to_string()))?;
    let delegation_jcs = row
        .try_get::<String, _>("delegation_jcs")
        .map_err(|error| KernelError::Store(error.to_string()))?;
    let action = row
        .try_get::<String, _>("action_id")
        .map_err(|error| KernelError::Store(error.to_string()))?;
    let approved = row
        .try_get::<bool, _>("approved")
        .map_err(|error| KernelError::Store(error.to_string()))?;
    let policy_id = row
        .try_get::<String, _>("policy_id")
        .map_err(|error| KernelError::Store(error.to_string()))?;
    let policy_digest = row
        .try_get::<String, _>("policy_digest")
        .map_err(|error| KernelError::Store(error.to_string()))?;
    let recorded_policy_revision = row
        .try_get::<i64, _>("policy_revision")
        .map_err(|error| KernelError::Store(error.to_string()))?;
    let determining_policies = row
        .try_get::<Vec<String>, _>("determining_policies")
        .map_err(|error| KernelError::Store(error.to_string()))?;
    let authorized_at = row
        .try_get::<i64, _>("authorized_at_micros")
        .map_err(|error| KernelError::Store(error.to_string()))?;
    let event_at = row
        .try_get::<i64, _>(event_timestamp_column)
        .map_err(|error| KernelError::Store(error.to_string()))?;
    Ok(principal == authorization.principal.as_str()
        && membership == authorization.membership.as_str()
        && actor == authorization.context.actor_id().as_str()
        && workload == authorization.context.workload_id().as_str()
        && delegation_jcs == authorization.delegation_jcs
        && action == authorization.action.as_str()
        && approved == authorization.approved
        && policy_id == authorization.policy.revision.id.as_str()
        && policy_digest == authorization.policy.revision.digest.as_str()
        && recorded_policy_revision == policy_revision
        && determining_policies == authorization.policy.determining_policies
        && authorized_at == event_at)
}

fn require_matching_authorization(
    row: &PgRow,
    authorization: &KernelAuthorization,
    event_timestamp_column: &'static str,
    operation: &str,
) -> Result<(), KernelError> {
    if authorization_matches_row(row, authorization, event_timestamp_column)? {
        Ok(())
    } else {
        Err(KernelError::Denied(format!(
            "{operation} replay authority does not match original"
        )))
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

fn canonicalize_json(input: &str, label: &str) -> Result<String, KernelError> {
    let value = serde_json::from_str::<serde_json::Value>(input)
        .map_err(|error| KernelError::Conflict(format!("{label} is not valid JSON: {error}")))?;
    serde_jcs::to_string(&value)
        .map_err(|error| KernelError::Conflict(format!("{label} is not canonicalizable: {error}")))
}

fn delegation_jcs(context: &TrustedExecutionContext) -> Result<String, KernelError> {
    let grants = context
        .delegation()
        .grants()
        .iter()
        .map(|grant| {
            serde_json::json!({
                "actions": grant.actions().iter().map(ActionId::as_str).collect::<Vec<_>>(),
                "expiresAtMicros": grant.expires_at().get(),
                "id": grant.id().as_str(),
                "notBeforeMicros": grant.not_before().get(),
                "resources": grant.resources().iter().map(ResourceId::as_str).collect::<Vec<_>>(),
                "workloads": grant.workloads().iter().map(WorkloadId::as_str).collect::<Vec<_>>(),
            })
        })
        .collect::<Vec<_>>();
    serde_jcs::to_string(&serde_json::json!({
        "grants": grants,
        "schema": "zoen.delegation-snapshot.v1",
    }))
    .map_err(|error| KernelError::Store(error.to_string()))
}

fn preview_hash(release: &ReleaseDigest, input_jcs: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(release.as_str().as_bytes());
    hasher.update(b"\0");
    hasher.update(input_jcs.as_bytes());
    encode_hex(&hasher.finalize())
}

fn verb_has_approval(verb: PublicVerb) -> bool {
    matches!(
        verb,
        PublicVerb::Commit | PublicVerb::Explain | PublicVerb::Execute
    )
}

fn explanation_jcs(
    proposal: &KernelProposal,
    decision: &KernelDecision,
    committed_by: &PrincipalId,
    committed_membership: &MembershipId,
    receipt_id: &str,
    release: &ReleaseDigest,
    type_assignment: Option<&serde_json::Value>,
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
        "typeAssignment": type_assignment,
    }))
    .map_err(|error| KernelError::Store(error.to_string()))
}

fn map_release(error: impl std::fmt::Display) -> KernelError {
    KernelError::Store(error.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NarrowAuthorizedPlan<'a> {
    schema: &'static str,
    entitlement_basis: &'static str,
    trusted_authority_digest: Option<&'a str>,
    authority_cut: Option<u64>,
    authority_principal: &'a str,
    membership: &'a str,
    world: &'a str,
    object_type: &'a str,
    release_digest: &'a str,
    policy_digest: &'a str,
    budget_id: &'a str,
    page_limit: u32,
    projection: &'static [&'static str],
    sort_order: &'a str,
}

fn authorized_plan_digest(
    plan: &NarrowAuthorizedPlan<'_>,
) -> Result<AuthorizedObjectSetPlanDigest, KernelError> {
    let canonical =
        serde_jcs::to_vec(plan).map_err(|error| KernelError::Store(error.to_string()))?;
    Ok(AuthorizedObjectSetPlanDigest::from_sha256(
        Sha256::digest(canonical).into(),
    ))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AuthorizedPageDigestPayload<'a> {
    schema: &'static str,
    budget_id: &'a str,
    objects: Vec<AuthorizedPageObject<'a>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AuthorizedPageObject<'a> {
    object_id: &'a str,
    object_type: &'a str,
    fields_jcs: &'a str,
}

fn authorized_page_digest(
    budget_id: &BudgetClassId,
    objects: &[KernelAuthorizedObject],
) -> Result<String, KernelError> {
    let payload = AuthorizedPageDigestPayload {
        schema: "zoen.authorized-page.v1",
        budget_id: budget_id.as_str(),
        objects: objects
            .iter()
            .map(|object| AuthorizedPageObject {
                object_id: &object.object_id,
                object_type: &object.object_type,
                fields_jcs: &object.fields_jcs,
            })
            .collect(),
    };
    let canonical = serde_jcs::to_vec(&payload)
        .map_err(|error| KernelError::Store(format!("page digest is invalid: {error}")))?;
    Ok(encode_hex(Sha256::digest(canonical).as_slice()))
}

fn unix_seconds() -> Result<u64, KernelError> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .map_err(|error| KernelError::Store(format!("system clock precedes Unix epoch: {error}")))
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
