use std::{
    collections::BTreeSet,
    fs::File,
    io::Read,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Postgres, Row, Transaction, postgres::PgRow};
use zoen_core::{
    AccountMergePlan, AccountStatus, ActionId, ActorId, BindingStatus, ChannelProvider, Clearance,
    DelegationChain, DelegationGrant, DelegationId, ExternalBinding, ExternalBindingId,
    ExternalSubject, IdentityError, Invite, InviteId, InviteToken, Membership, MembershipId,
    MembershipKind, MembershipStatus, PrincipalId, ResourceId, RevocationReason, TenantId,
    TimestampMicros, TrustedExecutionContext, UnbindReason, WORLD_INVITE_ACTION, WORLD_READ_ACTION,
    WORLD_RESERVE_ACTION, WORLD_SHARE_ACTION, WorkloadId, ZoenAccount, ZoenAccountId,
    trusted_context_from_membership,
};

#[derive(Clone)]
pub struct PostgresIdentityStore {
    pool: PgPool,
}

impl PostgresIdentityStore {
    #[must_use]
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// # Errors
    ///
    /// Returns [`IdentityError`] when `PostgreSQL` is unavailable, a unique constraint conflicts, or a stored row cannot be parsed.
    pub async fn ensure_provisional(
        &self,
        subject: ExternalSubject,
    ) -> Result<ZoenAccount, IdentityError> {
        let mut transaction = self.pool.begin().await.map_err(unavailable)?;
        if let Some(existing) = active_binding_for_subject(&mut transaction, &subject).await? {
            let account = load_account(&mut transaction, &existing.account_id).await?;
            transaction.commit().await.map_err(unavailable)?;
            return Ok(account);
        }
        let now = now_micros();
        let account_id = new_account_id();
        sqlx::query(
            "INSERT INTO zoen_accounts (account_id, status, created_at)
             VALUES ($1, 'provisional', to_timestamp($2::double precision / 1000000.0))",
        )
        .bind(account_id.as_str())
        .bind(now.get())
        .execute(&mut *transaction)
        .await
        .map_err(unavailable)?;
        let binding_id = new_binding_id();
        sqlx::query(
            "INSERT INTO external_bindings (
                binding_id, account_id, provider, subject_key, status
             ) VALUES ($1, $2, $3, $4, 'provisional')",
        )
        .bind(binding_id.as_str())
        .bind(account_id.as_str())
        .bind(subject.provider.as_str())
        .bind(&subject.subject_key)
        .execute(&mut *transaction)
        .await
        .map_err(map_unique_subject)?;
        let account = ZoenAccount {
            id: account_id,
            status: AccountStatus::Provisional,
            created_at: now,
        };
        transaction.commit().await.map_err(unavailable)?;
        Ok(account)
    }

    /// # Errors
    ///
    /// Returns [`IdentityError`] when `PostgreSQL` is unavailable, a unique constraint conflicts, or a stored row cannot be parsed.
    pub async fn verify_binding(
        &self,
        account: ZoenAccountId,
    ) -> Result<ExternalBinding, IdentityError> {
        let mut transaction = self.pool.begin().await.map_err(unavailable)?;
        let account_row = load_account(&mut transaction, &account).await?;
        reject_merged(&account_row)?;
        let binding = sqlx::query(
            "SELECT binding_id, account_id, provider, subject_key, status, verified_at,
                    unbound_at, unbind_reason
             FROM external_bindings
             WHERE account_id = $1 AND status = 'provisional'
             ORDER BY binding_id
             LIMIT 1
             FOR UPDATE",
        )
        .bind(account.as_str())
        .fetch_optional(&mut *transaction)
        .await
        .map_err(unavailable)?
        .ok_or(IdentityError::BindingNotFound)?;
        let now = now_micros();
        let binding_id = row_text(&binding, "binding_id")?;
        sqlx::query(
            "UPDATE external_bindings
             SET status = 'verified',
                 verified_at = to_timestamp($2::double precision / 1000000.0)
             WHERE binding_id = $1",
        )
        .bind(&binding_id)
        .bind(now.get())
        .execute(&mut *transaction)
        .await
        .map_err(unavailable)?;
        if matches!(account_row.status, AccountStatus::Provisional) {
            sqlx::query("UPDATE zoen_accounts SET status = 'verified' WHERE account_id = $1")
                .bind(account.as_str())
                .execute(&mut *transaction)
                .await
                .map_err(unavailable)?;
        }
        let verified = load_binding(
            &mut transaction,
            &ExternalBindingId::parse(binding_id)
                .map_err(|_| IdentityError::Conflict("invalid binding id".to_owned()))?,
        )
        .await?;
        transaction.commit().await.map_err(unavailable)?;
        Ok(verified)
    }

    /// # Errors
    ///
    /// Returns [`IdentityError`] when `PostgreSQL` is unavailable, a unique constraint conflicts, or a stored row cannot be parsed.
    pub async fn bind_verified_subject(
        &self,
        account: ZoenAccountId,
        subject: ExternalSubject,
    ) -> Result<ExternalBinding, IdentityError> {
        let mut transaction = self.pool.begin().await.map_err(unavailable)?;
        let account_row = load_account(&mut transaction, &account).await?;
        reject_merged(&account_row)?;
        if active_binding_for_subject(&mut transaction, &subject)
            .await?
            .is_some()
        {
            return Err(IdentityError::AlreadyBound);
        }
        let now = now_micros();
        let binding_id = new_binding_id();
        sqlx::query(
            "INSERT INTO external_bindings (
                binding_id, account_id, provider, subject_key, status, verified_at
             ) VALUES ($1, $2, $3, $4, 'verified', to_timestamp($5::double precision / 1000000.0))",
        )
        .bind(binding_id.as_str())
        .bind(account.as_str())
        .bind(subject.provider.as_str())
        .bind(&subject.subject_key)
        .bind(now.get())
        .execute(&mut *transaction)
        .await
        .map_err(map_unique_subject)?;
        if matches!(account_row.status, AccountStatus::Provisional) {
            sqlx::query("UPDATE zoen_accounts SET status = 'verified' WHERE account_id = $1")
                .bind(account.as_str())
                .execute(&mut *transaction)
                .await
                .map_err(unavailable)?;
        }
        let binding = ExternalBinding {
            id: binding_id,
            account_id: account,
            subject,
            status: BindingStatus::Verified,
            verified_at: Some(now),
        };
        transaction.commit().await.map_err(unavailable)?;
        Ok(binding)
    }

    /// # Errors
    ///
    /// Returns [`IdentityError`] when `PostgreSQL` is unavailable, a unique constraint conflicts, or a stored row cannot be parsed.
    pub async fn unbind(
        &self,
        binding: ExternalBindingId,
        reason: UnbindReason,
    ) -> Result<(), IdentityError> {
        let mut transaction = self.pool.begin().await.map_err(unavailable)?;
        let existing = load_binding(&mut transaction, &binding).await?;
        if matches!(existing.status, BindingStatus::Unbound { .. }) {
            transaction.commit().await.map_err(unavailable)?;
            return Ok(());
        }
        let now = now_micros();
        sqlx::query(
            "UPDATE external_bindings
             SET status = 'unbound',
                 unbound_at = to_timestamp($2::double precision / 1000000.0),
                 unbind_reason = $3
             WHERE binding_id = $1",
        )
        .bind(binding.as_str())
        .bind(now.get())
        .bind(reason.as_str())
        .execute(&mut *transaction)
        .await
        .map_err(unavailable)?;
        transaction.commit().await.map_err(unavailable)?;
        Ok(())
    }

    /// # Errors
    ///
    /// Returns [`IdentityError`] when `PostgreSQL` is unavailable, a unique constraint conflicts, or a stored row cannot be parsed.
    pub async fn ensure_personal_workspace(
        &self,
        account: ZoenAccountId,
    ) -> Result<Membership, IdentityError> {
        let mut transaction = self.pool.begin().await.map_err(unavailable)?;
        let account_row = load_account(&mut transaction, &account).await?;
        reject_merged(&account_row)?;
        if let Some(tenant_id) = sqlx::query_scalar::<_, String>(
            "SELECT tenant_id FROM personal_tenants WHERE account_id = $1",
        )
        .bind(account.as_str())
        .fetch_optional(&mut *transaction)
        .await
        .map_err(unavailable)?
        {
            let tenant = TenantId::parse(tenant_id)
                .map_err(|_| IdentityError::Conflict("invalid personal tenant".to_owned()))?;
            let membership = load_active_membership(&mut transaction, &account, &tenant).await?;
            transaction.commit().await.map_err(unavailable)?;
            return Ok(membership);
        }
        let tenant_id = new_tenant_id();
        let principal_id = new_principal_id();
        let membership_id = new_membership_id();
        let actor_id = ActorId::parse(new_id_value("actor"))
            .map_err(|_| IdentityError::Conflict("invalid actor id".to_owned()))?;
        let workload_id = WorkloadId::parse("workload.personal")
            .map_err(|_| IdentityError::Conflict("invalid workload".to_owned()))?;
        let delegation = personal_delegation(&workload_id)?;
        let clearance = Clearance::personal_owner();
        sqlx::query("INSERT INTO personal_tenants (account_id, tenant_id) VALUES ($1, $2)")
            .bind(account.as_str())
            .bind(tenant_id.as_str())
            .execute(&mut *transaction)
            .await
            .map_err(unavailable)?;
        insert_membership(
            &mut transaction,
            InsertMembership {
                id: &membership_id,
                account_id: &account,
                tenant_id: &tenant_id,
                principal_id: &principal_id,
                kind: MembershipKind::Personal,
                workload_id: &workload_id,
                actor_id: &actor_id,
                delegation: &delegation,
                clearance: &clearance,
            },
        )
        .await?;
        let membership = Membership {
            id: membership_id,
            account_id: account,
            tenant_id,
            principal_id,
            status: MembershipStatus::Active,
            kind: MembershipKind::Personal,
            delegation_template_id: None,
            workload_id,
            actor_id,
            delegation,
            clearance,
        };
        transaction.commit().await.map_err(unavailable)?;
        Ok(membership)
    }

    /// # Errors
    ///
    /// Returns [`IdentityError`] when `PostgreSQL` is unavailable, a unique constraint conflicts, or a stored row cannot be parsed.
    pub async fn create_invite(&self, input: CreateInvite<'_>) -> Result<Invite, IdentityError> {
        let mut transaction = self.pool.begin().await.map_err(unavailable)?;
        let invite_id = new_invite_id();
        let token_hash = hash_token(input.token);
        sqlx::query(
            "INSERT INTO invites (
                invite_id, tenant_id, principal_id, token_hash, expires_at,
                workload_id, actor_id, delegation_json, clearance_json
             ) VALUES (
                $1, $2, $3, $4, to_timestamp($5::double precision / 1000000.0),
                $6, $7, $8, $9
             )",
        )
        .bind(invite_id.as_str())
        .bind(input.tenant_id.as_str())
        .bind(input.principal_id.as_str())
        .bind(token_hash.as_slice())
        .bind(input.expires_at.get())
        .bind(input.workload_id.as_str())
        .bind(input.actor_id.as_str())
        .bind(
            serde_json::to_value(DelegationWire::from(&input.delegation))
                .map_err(|error| IdentityError::Conflict(format!("delegation encode: {error}")))?,
        )
        .bind(clearance_json(&input.clearance)?)
        .execute(&mut *transaction)
        .await
        .map_err(unavailable)?;
        let invite = Invite {
            id: invite_id,
            tenant_id: input.tenant_id,
            principal_id: input.principal_id,
            token_hash,
            expires_at: input.expires_at,
            consumed_at: None,
            workload_id: input.workload_id,
            actor_id: input.actor_id,
            delegation: input.delegation,
            clearance: input.clearance,
        };
        transaction.commit().await.map_err(unavailable)?;
        Ok(invite)
    }

    /// # Errors
    ///
    /// Returns [`IdentityError`] when `PostgreSQL` is unavailable, a unique constraint conflicts, or a stored row cannot be parsed.
    pub async fn accept_invite(
        &self,
        account: ZoenAccountId,
        token: InviteToken,
    ) -> Result<Membership, IdentityError> {
        let token_hash = hash_token(&token);
        let mut transaction = self.pool.begin().await.map_err(unavailable)?;
        let account_row = load_account(&mut transaction, &account).await?;
        reject_merged(&account_row)?;
        let invite_row = sqlx::query(
            "SELECT invite_id, tenant_id, principal_id, token_hash, expires_at, consumed_at,
                    workload_id, actor_id, delegation_json, clearance_json
             FROM invites
             WHERE token_hash = $1
             FOR UPDATE",
        )
        .bind(token_hash.as_slice())
        .fetch_optional(&mut *transaction)
        .await
        .map_err(unavailable)?
        .ok_or(IdentityError::InviteNotFound)?;
        let tenant_id = TenantId::parse(row_text(&invite_row, "tenant_id")?)
            .map_err(|_| IdentityError::Conflict("invalid invite tenant".to_owned()))?;
        let consumed: bool =
            sqlx::query_scalar("SELECT consumed_at IS NOT NULL FROM invites WHERE invite_id = $1")
                .bind(row_text(&invite_row, "invite_id")?)
                .fetch_one(&mut *transaction)
                .await
                .map_err(unavailable)?;
        if consumed {
            return Err(IdentityError::AlreadyConsumed);
        }
        let expired: bool = sqlx::query_scalar(
            "SELECT expires_at <= clock_timestamp() FROM invites WHERE invite_id = $1",
        )
        .bind(row_text(&invite_row, "invite_id")?)
        .fetch_one(&mut *transaction)
        .await
        .map_err(unavailable)?;
        if expired {
            return Err(IdentityError::InviteExpired);
        }
        let invite_id = InviteId::parse(row_text(&invite_row, "invite_id")?)
            .map_err(|_| IdentityError::Conflict("invalid invite id".to_owned()))?;
        let principal_id = PrincipalId::parse(row_text(&invite_row, "principal_id")?)
            .map_err(|_| IdentityError::Conflict("invalid invite principal".to_owned()))?;
        let workload_id = WorkloadId::parse(row_text(&invite_row, "workload_id")?)
            .map_err(|_| IdentityError::Conflict("invalid invite workload".to_owned()))?;
        let actor_id = ActorId::parse(row_text(&invite_row, "actor_id")?)
            .map_err(|_| IdentityError::Conflict("invalid invite actor".to_owned()))?;
        let delegation =
            decode_delegation(invite_row.try_get("delegation_json").map_err(unavailable)?)?;
        let clearance =
            clearance_from_json(invite_row.try_get("clearance_json").map_err(unavailable)?)?;
        let now = now_micros();
        sqlx::query(
            "UPDATE invites
             SET consumed_at = to_timestamp($2::double precision / 1000000.0)
             WHERE invite_id = $1",
        )
        .bind(invite_id.as_str())
        .bind(now.get())
        .execute(&mut *transaction)
        .await
        .map_err(unavailable)?;
        let membership_id = new_membership_id();
        insert_membership(
            &mut transaction,
            InsertMembership {
                id: &membership_id,
                account_id: &account,
                tenant_id: &tenant_id,
                principal_id: &principal_id,
                kind: MembershipKind::Invite {
                    invite_id: invite_id.clone(),
                },
                workload_id: &workload_id,
                actor_id: &actor_id,
                delegation: &delegation,
                clearance: &clearance,
            },
        )
        .await?;
        let membership = Membership {
            id: membership_id,
            account_id: account,
            tenant_id,
            principal_id,
            status: MembershipStatus::Active,
            kind: MembershipKind::Invite { invite_id },
            delegation_template_id: None,
            workload_id,
            actor_id,
            delegation,
            clearance,
        };
        transaction.commit().await.map_err(unavailable)?;
        Ok(membership)
    }

    /// # Errors
    ///
    /// Returns [`IdentityError`] when `PostgreSQL` is unavailable, a unique constraint conflicts, or a stored row cannot be parsed.
    pub async fn stamp_world_invite(
        &self,
        input: WorldInvite,
    ) -> Result<Membership, IdentityError> {
        let token = input.token.clone();
        match self
            .accept_invite(input.account_id.clone(), token.clone())
            .await
        {
            Ok(membership) => return Ok(membership),
            Err(IdentityError::AlreadyConsumed) => {
                return self
                    .active_membership(&input.account_id, &input.tenant_id)
                    .await;
            }
            Err(IdentityError::InviteNotFound) => {}
            Err(error) => return Err(error),
        }
        self.create_invite(CreateInvite {
            actor_id: input.actor_id,
            clearance: Clearance::world_floor(),
            delegation: input.delegation,
            expires_at: input.expires_at,
            principal_id: input.principal_id,
            tenant_id: input.tenant_id.clone(),
            token: &token,
            workload_id: input.workload_id,
        })
        .await?;
        match self.accept_invite(input.account_id.clone(), token).await {
            Ok(membership) => Ok(membership),
            Err(IdentityError::AlreadyConsumed) => {
                self.active_membership(&input.account_id, &input.tenant_id)
                    .await
            }
            Err(error) => Err(error),
        }
    }

    /// # Errors
    ///
    /// Returns [`IdentityError`] when `PostgreSQL` is unavailable, a unique constraint conflicts, or a stored row cannot be parsed.
    pub async fn active_membership(
        &self,
        account: &ZoenAccountId,
        tenant: &TenantId,
    ) -> Result<Membership, IdentityError> {
        let mut transaction = self.pool.begin().await.map_err(unavailable)?;
        let membership = load_active_membership(&mut transaction, account, tenant).await?;
        transaction.commit().await.map_err(unavailable)?;
        Ok(membership)
    }

    /// # Errors
    ///
    /// Returns [`IdentityError`] when `PostgreSQL` is unavailable, a unique constraint conflicts, or a stored row cannot be parsed.
    pub async fn revoke_membership(
        &self,
        id: MembershipId,
        reason: RevocationReason,
    ) -> Result<(), IdentityError> {
        self.end_membership(id, "revoked", Some(reason.as_str()))
            .await
    }

    /// # Errors
    ///
    /// Returns [`IdentityError`] when `PostgreSQL` is unavailable, a unique constraint conflicts, or a stored row cannot be parsed.
    pub async fn leave_membership(&self, id: MembershipId) -> Result<(), IdentityError> {
        self.end_membership(id, "left", None).await
    }

    async fn end_membership(
        &self,
        id: MembershipId,
        status: &str,
        reason: Option<&str>,
    ) -> Result<(), IdentityError> {
        let mut transaction = self.pool.begin().await.map_err(unavailable)?;
        let tenant: String = sqlx::query_scalar(
            "SELECT tenant_id FROM memberships WHERE membership_id = $1 FOR UPDATE",
        )
        .bind(id.as_str())
        .fetch_optional(&mut *transaction)
        .await
        .map_err(unavailable)?
        .ok_or(IdentityError::MembershipNotFound)?;
        let _tenant_id = TenantId::parse(tenant)
            .map_err(|_| IdentityError::Conflict("invalid membership tenant".to_owned()))?;
        let now = now_micros();
        let updated = sqlx::query(
            "UPDATE memberships
             SET status = $2,
                 ended_at = to_timestamp($3::double precision / 1000000.0),
                 ended_reason = $4
             WHERE membership_id = $1 AND status = 'active'",
        )
        .bind(id.as_str())
        .bind(status)
        .bind(now.get())
        .bind(reason)
        .execute(&mut *transaction)
        .await
        .map_err(unavailable)?
        .rows_affected();
        if updated == 0 {
            return Err(IdentityError::MembershipInactive);
        }
        transaction.commit().await.map_err(unavailable)?;
        Ok(())
    }

    /// # Errors
    ///
    /// Returns [`IdentityError`] when `PostgreSQL` is unavailable, a unique constraint conflicts, or a stored row cannot be parsed.
    pub async fn plan_merge(
        &self,
        survivor: ZoenAccountId,
        absorbed: ZoenAccountId,
    ) -> Result<AccountMergePlan, IdentityError> {
        let mut transaction = self.pool.begin().await.map_err(unavailable)?;
        let survivor_row = load_account(&mut transaction, &survivor).await?;
        let absorbed_row = load_account(&mut transaction, &absorbed).await?;
        reject_merged(&survivor_row)?;
        reject_merged(&absorbed_row)?;
        if survivor == absorbed {
            return Err(IdentityError::Conflict(
                "cannot merge an account into itself".to_owned(),
            ));
        }
        let bindings = sqlx::query_scalar::<_, String>(
            "SELECT binding_id FROM external_bindings
             WHERE account_id = $1 AND status IN ('provisional', 'verified')
             ORDER BY binding_id",
        )
        .bind(absorbed.as_str())
        .fetch_all(&mut *transaction)
        .await
        .map_err(unavailable)?;
        let move_bindings = bindings
            .into_iter()
            .map(|id| {
                ExternalBindingId::parse(id)
                    .map_err(|_| IdentityError::Conflict("invalid binding id".to_owned()))
            })
            .collect::<Result<Vec<_>, _>>()?;
        transaction.commit().await.map_err(unavailable)?;
        Ok(AccountMergePlan {
            survivor,
            absorbed,
            move_bindings,
        })
    }

    /// # Errors
    ///
    /// Returns [`IdentityError`] when `PostgreSQL` is unavailable, a unique constraint conflicts, or a stored row cannot be parsed.
    pub async fn commit_merge(&self, plan: AccountMergePlan) -> Result<(), IdentityError> {
        let mut transaction = self.pool.begin().await.map_err(unavailable)?;
        let survivor_row = load_account(&mut transaction, &plan.survivor).await?;
        let absorbed_row = load_account(&mut transaction, &plan.absorbed).await?;
        reject_merged(&survivor_row)?;
        reject_merged(&absorbed_row)?;
        for binding_id in &plan.move_bindings {
            let updated = sqlx::query(
                "UPDATE external_bindings
                 SET account_id = $2
                 WHERE binding_id = $1
                   AND account_id = $3
                   AND status IN ('provisional', 'verified')",
            )
            .bind(binding_id.as_str())
            .bind(plan.survivor.as_str())
            .bind(plan.absorbed.as_str())
            .execute(&mut *transaction)
            .await
            .map_err(unavailable)?
            .rows_affected();
            if updated != 1 {
                return Err(IdentityError::Conflict(format!(
                    "binding {binding_id} not movable"
                )));
            }
        }
        sqlx::query(
            "UPDATE zoen_accounts
             SET status = 'merged_into', merged_into_account_id = $2
             WHERE account_id = $1",
        )
        .bind(plan.absorbed.as_str())
        .bind(plan.survivor.as_str())
        .execute(&mut *transaction)
        .await
        .map_err(unavailable)?;
        // Memberships and personal tenants intentionally stay on absorbed.
        transaction.commit().await.map_err(unavailable)?;
        Ok(())
    }

    /// # Errors
    ///
    /// Returns [`IdentityError`] when `PostgreSQL` is unavailable, a unique constraint conflicts, or a stored row cannot be parsed.
    pub async fn binding_for_subject(
        &self,
        subject: &ExternalSubject,
    ) -> Result<Option<ExternalBinding>, IdentityError> {
        let mut transaction = self.pool.begin().await.map_err(unavailable)?;
        let binding = active_binding_for_subject(&mut transaction, subject).await?;
        transaction.commit().await.map_err(unavailable)?;
        Ok(binding)
    }

    /// # Errors
    ///
    /// Returns [`IdentityError`] when `PostgreSQL` is unavailable, a unique constraint conflicts, or a stored row cannot be parsed.
    pub async fn snapshot_for_verified_subject(
        &self,
        subject: &ExternalSubject,
    ) -> Result<(ExternalBinding, AccountSnapshot), IdentityError> {
        let binding = self
            .binding_for_subject(subject)
            .await?
            .ok_or(IdentityError::SubjectUnbound)?;
        if !matches!(binding.status, BindingStatus::Verified) {
            return Err(IdentityError::SubjectUnbound);
        }
        let snapshot = self.snapshot_account(&binding.account_id).await?;
        if let AccountStatus::MergedInto { survivor } = &snapshot.account.status {
            return Err(IdentityError::AccountMerged {
                survivor: survivor.clone(),
            });
        }
        Ok((binding, snapshot))
    }

    /// # Errors
    ///
    /// Returns [`IdentityError`] when `PostgreSQL` is unavailable, a unique constraint conflicts, or a stored row cannot be parsed.
    pub async fn resolve_for_subject(
        &self,
        subject: &ExternalSubject,
        tenant: &TenantId,
    ) -> Result<(Membership, TrustedExecutionContext), IdentityError> {
        let mut transaction = self.pool.begin().await.map_err(unavailable)?;
        let binding = active_binding_for_subject(&mut transaction, subject)
            .await?
            .ok_or(IdentityError::SubjectUnbound)?;
        if !matches!(binding.status, BindingStatus::Verified) {
            return Err(IdentityError::SubjectUnbound);
        }
        let account = load_account(&mut transaction, &binding.account_id).await?;
        if let AccountStatus::MergedInto { survivor } = account.status {
            return Err(IdentityError::AccountMerged { survivor });
        }
        let membership =
            load_active_membership(&mut transaction, &binding.account_id, tenant).await?;
        let context = trusted_context_from_membership(&membership)?;
        transaction.commit().await.map_err(unavailable)?;
        Ok((membership, context))
    }

    /// # Errors
    ///
    /// Returns [`IdentityError`] when `PostgreSQL` is unavailable, a unique constraint conflicts, or a stored row cannot be parsed.
    pub async fn get_binding(
        &self,
        id: &ExternalBindingId,
    ) -> Result<ExternalBinding, IdentityError> {
        let mut transaction = self.pool.begin().await.map_err(unavailable)?;
        let binding = load_binding(&mut transaction, id).await?;
        transaction.commit().await.map_err(unavailable)?;
        Ok(binding)
    }

    /// # Errors
    ///
    /// Returns [`IdentityError`] when `PostgreSQL` is unavailable, a unique constraint conflicts, or a stored row cannot be parsed.
    pub async fn get_membership(&self, id: &MembershipId) -> Result<Membership, IdentityError> {
        let mut transaction = self.pool.begin().await.map_err(unavailable)?;
        let tenant: String =
            sqlx::query_scalar("SELECT tenant_id FROM memberships WHERE membership_id = $1")
                .bind(id.as_str())
                .fetch_optional(&mut *transaction)
                .await
                .map_err(unavailable)?
                .ok_or(IdentityError::MembershipNotFound)?;
        let _tenant_id = TenantId::parse(tenant)
            .map_err(|_| IdentityError::Conflict("invalid membership tenant".to_owned()))?;
        let row = sqlx::query(
            "SELECT membership_id, account_id, tenant_id, principal_id, status, kind,
                    invite_id, idp_issuer, idp_subject, delegation_template_id,
                    workload_id, actor_id, delegation_json, ended_at, ended_reason,
                    clearance_json
             FROM memberships WHERE membership_id = $1",
        )
        .bind(id.as_str())
        .fetch_one(&mut *transaction)
        .await
        .map_err(unavailable)?;
        let membership = row_to_membership(&row)?;
        transaction.commit().await.map_err(unavailable)?;
        Ok(membership)
    }

    /// # Errors
    ///
    /// Returns [`IdentityError`] when `PostgreSQL` is unavailable, a unique constraint conflicts, or a stored row cannot be parsed.
    pub async fn snapshot_account(
        &self,
        account: &ZoenAccountId,
    ) -> Result<AccountSnapshot, IdentityError> {
        let mut transaction = self.pool.begin().await.map_err(unavailable)?;
        let account_row = load_account(&mut transaction, account).await?;
        let bindings = sqlx::query(
            "SELECT binding_id, account_id, provider, subject_key, status, verified_at,
                    unbound_at, unbind_reason
             FROM external_bindings WHERE account_id = $1 ORDER BY binding_id",
        )
        .bind(account.as_str())
        .fetch_all(&mut *transaction)
        .await
        .map_err(unavailable)?;
        let bindings = bindings
            .iter()
            .map(row_to_binding)
            .collect::<Result<Vec<_>, _>>()?;
        let membership_rows = sqlx::query(
            "SELECT membership_id, account_id, tenant_id, principal_id, status, kind,
                    invite_id, idp_issuer, idp_subject, delegation_template_id,
                    workload_id, actor_id, delegation_json, ended_at, ended_reason,
                    clearance_json
             FROM memberships WHERE account_id = $1 ORDER BY membership_id",
        )
        .bind(account.as_str())
        .fetch_all(&mut *transaction)
        .await
        .map_err(unavailable)?;
        let memberships = membership_rows
            .iter()
            .map(row_to_membership)
            .collect::<Result<Vec<_>, _>>()?;
        let personal_tenant = sqlx::query_scalar::<_, String>(
            "SELECT tenant_id FROM personal_tenants WHERE account_id = $1",
        )
        .bind(account.as_str())
        .fetch_optional(&mut *transaction)
        .await
        .map_err(unavailable)?;
        transaction.commit().await.map_err(unavailable)?;
        Ok(AccountSnapshot {
            account: account_row,
            bindings,
            memberships,
            personal_tenant,
        })
    }

    /// # Errors
    ///
    /// Returns [`IdentityError`] when `PostgreSQL` is unavailable, a unique constraint conflicts, or a stored row cannot be parsed.
    pub async fn mint_onboard_token(
        &self,
        subject: ExternalSubject,
        ttl: Duration,
    ) -> Result<MintedOnboardToken, IdentityError> {
        let raw = random_onboard_token()?;
        let token_hash = hash_onboard_token(&raw);
        let token_id = new_id_value("onboard");
        let now = now_micros();
        let expires_at = TimestampMicros::new(
            now.get()
                .saturating_add(i64::try_from(ttl.as_micros()).unwrap_or(i64::MAX)),
        );
        sqlx::query(
            "INSERT INTO onboard_tokens (
                token_id, token_hash, provider, subject_key, expires_at
             ) VALUES ($1, $2, $3, $4, to_timestamp($5::double precision / 1000000.0))",
        )
        .bind(&token_id)
        .bind(token_hash.as_slice())
        .bind(subject.provider.as_str())
        .bind(&subject.subject_key)
        .bind(expires_at.get())
        .execute(&self.pool)
        .await
        .map_err(unavailable)?;
        Ok(MintedOnboardToken {
            expires_at,
            subject,
            token: raw,
        })
    }

    /// # Errors
    ///
    /// Returns [`IdentityError`] when `PostgreSQL` is unavailable, a unique constraint conflicts, or a stored row cannot be parsed.
    pub async fn lookup_onboard_token(
        &self,
        token: &str,
    ) -> Result<OnboardTokenRow, IdentityError> {
        let token_hash = hash_onboard_token(token);
        let row = sqlx::query(
            "SELECT provider, subject_key,
                    consumed_at IS NOT NULL AS consumed,
                    expires_at <= clock_timestamp() AS expired
             FROM onboard_tokens WHERE token_hash = $1",
        )
        .bind(token_hash.as_slice())
        .fetch_optional(&self.pool)
        .await
        .map_err(unavailable)?
        .ok_or(IdentityError::InviteNotFound)?;
        let provider = ChannelProvider::parse(&row_text(&row, "provider")?)
            .map_err(|_| IdentityError::InvalidProvider)?;
        let subject_key = row_text(&row, "subject_key")?;
        let subject = ExternalSubject::new(provider, subject_key)?;
        Ok(OnboardTokenRow {
            consumed: row.try_get("consumed").map_err(unavailable)?,
            expired: row.try_get("expired").map_err(unavailable)?,
            subject,
        })
    }

    /// # Errors
    ///
    /// Returns [`IdentityError`] when `PostgreSQL` is unavailable, a unique constraint conflicts, or a stored row cannot be parsed.
    pub async fn consume_onboard_token(&self, token: &str) -> Result<(), IdentityError> {
        let token_hash = hash_onboard_token(token);
        let now = now_micros();
        let result = sqlx::query(
            "UPDATE onboard_tokens
             SET consumed_at = to_timestamp($2::double precision / 1000000.0)
             WHERE token_hash = $1 AND consumed_at IS NULL",
        )
        .bind(token_hash.as_slice())
        .bind(now.get())
        .execute(&self.pool)
        .await
        .map_err(unavailable)?;
        if result.rows_affected() == 0 {
            return Err(IdentityError::AlreadyConsumed);
        }
        Ok(())
    }

    /// # Errors
    ///
    /// Returns [`IdentityError`] when `PostgreSQL` is unavailable, a unique constraint conflicts, or a stored row cannot be parsed.
    pub async fn admit_whatsapp(
        &self,
        subject: ExternalSubject,
    ) -> Result<AccountSnapshot, IdentityError> {
        if subject.provider != ChannelProvider::WhatsApp {
            return Err(IdentityError::InvalidProvider);
        }
        if self.subject_has_verified_personal(&subject).await? {
            let (_, snapshot) = self.snapshot_for_verified_subject(&subject).await?;
            return Ok(snapshot);
        }
        match self.complete_onboard(subject.clone()).await {
            Ok(_) | Err(IdentityError::AlreadyConsumed) => {
                let (_, snapshot) = self.snapshot_for_verified_subject(&subject).await?;
                Ok(snapshot)
            }
            Err(error) => Err(error),
        }
    }

    /// # Errors
    ///
    /// Returns [`IdentityError`] when `PostgreSQL` is unavailable, a unique constraint conflicts, or a stored row cannot be parsed.
    pub async fn complete_onboard(
        &self,
        subject: ExternalSubject,
    ) -> Result<CompleteOnboard, IdentityError> {
        if self.subject_has_verified_personal(&subject).await? {
            return Err(IdentityError::AlreadyConsumed);
        }
        let account = self.ensure_provisional(subject.clone()).await?;
        let snapshot = self.snapshot_account(&account.id).await?;
        let verified = snapshot.bindings.iter().any(|binding| {
            binding.subject == subject && matches!(binding.status, BindingStatus::Verified)
        });
        if !verified {
            self.verify_binding(account.id.clone()).await?;
        }
        let personal = snapshot.memberships.iter().any(|membership| {
            matches!(membership.kind, MembershipKind::Personal)
                && matches!(membership.status, MembershipStatus::Active)
        });
        let membership = if personal {
            snapshot
                .memberships
                .into_iter()
                .find(|membership| {
                    matches!(membership.kind, MembershipKind::Personal)
                        && matches!(membership.status, MembershipStatus::Active)
                })
                .ok_or(IdentityError::MembershipNotFound)?
        } else {
            self.ensure_personal_workspace(account.id.clone()).await?
        };
        Ok(CompleteOnboard {
            account: membership.account_id.clone(),
            membership: membership.id.clone(),
            principal: membership.principal_id.clone(),
            tenant: membership.tenant_id.clone(),
        })
    }

    async fn subject_has_verified_personal(
        &self,
        subject: &ExternalSubject,
    ) -> Result<bool, IdentityError> {
        match self.snapshot_for_verified_subject(subject).await {
            Ok((_, snapshot)) => Ok(snapshot.memberships.iter().any(|membership| {
                matches!(membership.kind, MembershipKind::Personal)
                    && matches!(membership.status, MembershipStatus::Active)
            })),
            Err(IdentityError::SubjectUnbound) => Ok(false),
            Err(error) => Err(error),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AccountSnapshot {
    pub account: ZoenAccount,
    pub bindings: Vec<ExternalBinding>,
    pub memberships: Vec<Membership>,
    pub personal_tenant: Option<String>,
}

pub struct MintedOnboardToken {
    pub expires_at: TimestampMicros,
    pub subject: ExternalSubject,
    pub token: String,
}

pub struct OnboardTokenRow {
    pub consumed: bool,
    pub expired: bool,
    pub subject: ExternalSubject,
}

pub struct CompleteOnboard {
    pub account: ZoenAccountId,
    pub membership: MembershipId,
    pub principal: PrincipalId,
    pub tenant: TenantId,
}

pub struct CreateInvite<'a> {
    pub actor_id: ActorId,
    pub clearance: Clearance,
    pub delegation: DelegationChain,
    pub expires_at: TimestampMicros,
    pub principal_id: PrincipalId,
    pub tenant_id: TenantId,
    pub token: &'a InviteToken,
    pub workload_id: WorkloadId,
}

pub struct WorldInvite {
    pub account_id: ZoenAccountId,
    pub actor_id: ActorId,
    pub delegation: DelegationChain,
    pub expires_at: TimestampMicros,
    pub principal_id: PrincipalId,
    pub tenant_id: TenantId,
    pub token: InviteToken,
    pub workload_id: WorkloadId,
}

struct InsertMembership<'a> {
    id: &'a MembershipId,
    account_id: &'a ZoenAccountId,
    tenant_id: &'a TenantId,
    principal_id: &'a PrincipalId,
    kind: MembershipKind,
    workload_id: &'a WorkloadId,
    actor_id: &'a ActorId,
    delegation: &'a DelegationChain,
    clearance: &'a Clearance,
}

async fn insert_membership(
    transaction: &mut Transaction<'_, Postgres>,
    input: InsertMembership<'_>,
) -> Result<(), IdentityError> {
    let (kind, invite_id) = match &input.kind {
        MembershipKind::Personal => ("personal", None),
        MembershipKind::Invite { invite_id } => ("invite", Some(invite_id.as_str())),
    };
    sqlx::query(
        "INSERT INTO memberships (
            membership_id, account_id, tenant_id, principal_id, status, kind,
            invite_id, idp_issuer, idp_subject, workload_id, actor_id, delegation_json,
            clearance_json
         ) VALUES ($1,$2,$3,$4,'active',$5,$6,$7,$8,$9,$10,$11,$12)",
    )
    .bind(input.id.as_str())
    .bind(input.account_id.as_str())
    .bind(input.tenant_id.as_str())
    .bind(input.principal_id.as_str())
    .bind(kind)
    .bind(invite_id)
    .bind(None::<&str>)
    .bind(None::<&str>)
    .bind(input.workload_id.as_str())
    .bind(input.actor_id.as_str())
    .bind(
        serde_json::to_value(DelegationWire::from(input.delegation))
            .map_err(|error| IdentityError::Conflict(format!("delegation encode: {error}")))?,
    )
    .bind(clearance_json(input.clearance)?)
    .execute(&mut **transaction)
    .await
    .map_err(unavailable)?;
    Ok(())
}

async fn active_binding_for_subject(
    transaction: &mut Transaction<'_, Postgres>,
    subject: &ExternalSubject,
) -> Result<Option<ExternalBinding>, IdentityError> {
    let row = sqlx::query(
        "SELECT binding_id, account_id, provider, subject_key, status, verified_at,
                unbound_at, unbind_reason
         FROM external_bindings
         WHERE provider = $1 AND subject_key = $2 AND status IN ('provisional', 'verified')
         FOR UPDATE",
    )
    .bind(subject.provider.as_str())
    .bind(&subject.subject_key)
    .fetch_optional(&mut **transaction)
    .await
    .map_err(unavailable)?;
    row.map(|row| row_to_binding(&row)).transpose()
}

async fn load_binding(
    transaction: &mut Transaction<'_, Postgres>,
    id: &ExternalBindingId,
) -> Result<ExternalBinding, IdentityError> {
    let row = sqlx::query(
        "SELECT binding_id, account_id, provider, subject_key, status, verified_at,
                unbound_at, unbind_reason
         FROM external_bindings WHERE binding_id = $1 FOR UPDATE",
    )
    .bind(id.as_str())
    .fetch_optional(&mut **transaction)
    .await
    .map_err(unavailable)?
    .ok_or(IdentityError::BindingNotFound)?;
    row_to_binding(&row)
}

async fn load_account(
    transaction: &mut Transaction<'_, Postgres>,
    id: &ZoenAccountId,
) -> Result<ZoenAccount, IdentityError> {
    let row = sqlx::query(
        "SELECT account_id, status, merged_into_account_id,
                (EXTRACT(EPOCH FROM created_at) * 1000000)::bigint AS created_at_micros
         FROM zoen_accounts WHERE account_id = $1 FOR UPDATE",
    )
    .bind(id.as_str())
    .fetch_optional(&mut **transaction)
    .await
    .map_err(unavailable)?
    .ok_or(IdentityError::AccountNotFound)?;
    let status = match row_text(&row, "status")?.as_str() {
        "provisional" => AccountStatus::Provisional,
        "verified" => AccountStatus::Verified,
        "merged_into" => AccountStatus::MergedInto {
            survivor: ZoenAccountId::parse(row_text(&row, "merged_into_account_id")?)
                .map_err(|_| IdentityError::Conflict("invalid survivor".to_owned()))?,
        },
        other => {
            return Err(IdentityError::Conflict(format!(
                "unknown account status {other}"
            )));
        }
    };
    Ok(ZoenAccount {
        id: ZoenAccountId::parse(row_text(&row, "account_id")?)
            .map_err(|_| IdentityError::Conflict("invalid account id".to_owned()))?,
        status,
        created_at: TimestampMicros::new(row.try_get("created_at_micros").map_err(unavailable)?),
    })
}

async fn load_active_membership(
    transaction: &mut Transaction<'_, Postgres>,
    account: &ZoenAccountId,
    tenant: &TenantId,
) -> Result<Membership, IdentityError> {
    let row = sqlx::query(
        "SELECT membership_id, account_id, tenant_id, principal_id, status, kind,
                invite_id, idp_issuer, idp_subject, delegation_template_id,
                workload_id, actor_id, delegation_json, ended_at, ended_reason,
                clearance_json
         FROM memberships
         WHERE account_id = $1 AND tenant_id = $2 AND status = 'active'
         FOR SHARE",
    )
    .bind(account.as_str())
    .bind(tenant.as_str())
    .fetch_optional(&mut **transaction)
    .await
    .map_err(unavailable)?
    .ok_or(IdentityError::MembershipNotFound)?;
    row_to_membership(&row)
}

fn row_to_binding(row: &PgRow) -> Result<ExternalBinding, IdentityError> {
    let status = match row_text(row, "status")?.as_str() {
        "provisional" => BindingStatus::Provisional,
        "verified" => BindingStatus::Verified,
        "unbound" => BindingStatus::Unbound {
            unbound_at: TimestampMicros::new(0),
            reason: UnbindReason::parse(
                &row.try_get::<Option<String>, _>("unbind_reason")
                    .map_err(unavailable)?
                    .unwrap_or_default(),
            )
            .unwrap_or(UnbindReason::Admin),
        },
        other => {
            return Err(IdentityError::Conflict(format!(
                "unknown binding status {other}"
            )));
        }
    };
    let verified_at = if matches!(status, BindingStatus::Verified) {
        Some(TimestampMicros::new(0))
    } else {
        None
    };
    Ok(ExternalBinding {
        id: ExternalBindingId::parse(row_text(row, "binding_id")?)
            .map_err(|_| IdentityError::Conflict("invalid binding id".to_owned()))?,
        account_id: ZoenAccountId::parse(row_text(row, "account_id")?)
            .map_err(|_| IdentityError::Conflict("invalid account id".to_owned()))?,
        subject: ExternalSubject::new(
            ChannelProvider::parse(&row_text(row, "provider")?)?,
            row_text(row, "subject_key")?,
        )?,
        status,
        verified_at,
    })
}

fn row_to_membership(row: &PgRow) -> Result<Membership, IdentityError> {
    let status = match row_text(row, "status")?.as_str() {
        "active" => MembershipStatus::Active,
        "revoked" => MembershipStatus::Revoked {
            at: TimestampMicros::new(0),
            reason: RevocationReason::Admin,
        },
        "left" => MembershipStatus::Left {
            at: TimestampMicros::new(0),
        },
        other => {
            return Err(IdentityError::Conflict(format!(
                "unknown membership status {other}"
            )));
        }
    };
    let kind = match row_text(row, "kind")?.as_str() {
        "personal" => MembershipKind::Personal,
        "invite" => MembershipKind::Invite {
            invite_id: InviteId::parse(row_text(row, "invite_id")?)
                .map_err(|_| IdentityError::Conflict("invalid invite id".to_owned()))?,
        },
        other => {
            return Err(IdentityError::Conflict(format!(
                "unknown membership kind {other}"
            )));
        }
    };
    Ok(Membership {
        id: MembershipId::parse(row_text(row, "membership_id")?)
            .map_err(|_| IdentityError::Conflict("invalid membership id".to_owned()))?,
        account_id: ZoenAccountId::parse(row_text(row, "account_id")?)
            .map_err(|_| IdentityError::Conflict("invalid account id".to_owned()))?,
        tenant_id: TenantId::parse(row_text(row, "tenant_id")?)
            .map_err(|_| IdentityError::Conflict("invalid tenant id".to_owned()))?,
        principal_id: PrincipalId::parse(row_text(row, "principal_id")?)
            .map_err(|_| IdentityError::Conflict("invalid principal id".to_owned()))?,
        status,
        kind,
        delegation_template_id: None,
        workload_id: WorkloadId::parse(row_text(row, "workload_id")?)
            .map_err(|_| IdentityError::Conflict("invalid workload".to_owned()))?,
        actor_id: ActorId::parse(row_text(row, "actor_id")?)
            .map_err(|_| IdentityError::Conflict("invalid actor".to_owned()))?,
        delegation: decode_delegation(row.try_get("delegation_json").map_err(unavailable)?)?,
        clearance: clearance_from_json(row.try_get("clearance_json").map_err(unavailable)?)?,
    })
}

fn reject_merged(account: &ZoenAccount) -> Result<(), IdentityError> {
    match &account.status {
        AccountStatus::MergedInto { survivor } => Err(IdentityError::AccountMerged {
            survivor: survivor.clone(),
        }),
        AccountStatus::Provisional | AccountStatus::Verified => Ok(()),
    }
}

fn personal_delegation(workload_id: &WorkloadId) -> Result<DelegationChain, IdentityError> {
    let grant = DelegationGrant::new(
        DelegationId::parse("delegation.personal")
            .map_err(|_| IdentityError::Conflict("invalid delegation".to_owned()))?,
        BTreeSet::from([
            ActionId::parse("zoen.definition.publish")
                .map_err(|_| IdentityError::Conflict("invalid action".to_owned()))?,
            ActionId::parse("zoen.definition.activate")
                .map_err(|_| IdentityError::Conflict("invalid action".to_owned()))?,
            ActionId::parse("personal.writeMemory")
                .map_err(|_| IdentityError::Conflict("invalid action".to_owned()))?,
            ActionId::parse("personal.createReminder")
                .map_err(|_| IdentityError::Conflict("invalid action".to_owned()))?,
            ActionId::parse(WORLD_INVITE_ACTION)
                .map_err(|_| IdentityError::Conflict("invalid action".to_owned()))?,
            ActionId::parse(WORLD_SHARE_ACTION)
                .map_err(|_| IdentityError::Conflict("invalid action".to_owned()))?,
            ActionId::parse(WORLD_RESERVE_ACTION)
                .map_err(|_| IdentityError::Conflict("invalid action".to_owned()))?,
        ]),
        BTreeSet::from([
            ResourceId::parse("zoen.personal.workspace")
                .map_err(|_| IdentityError::Conflict("invalid resource".to_owned()))?,
            ResourceId::parse("personal.memory")
                .map_err(|_| IdentityError::Conflict("invalid resource".to_owned()))?,
            ResourceId::parse("personal.note")
                .map_err(|_| IdentityError::Conflict("invalid resource".to_owned()))?,
            ResourceId::parse("personal.reminder")
                .map_err(|_| IdentityError::Conflict("invalid resource".to_owned()))?,
        ]),
        BTreeSet::from([workload_id.clone()]),
        TimestampMicros::new(0),
        TimestampMicros::new(4_102_444_800_000_000),
    )
    .map_err(|error| IdentityError::Conflict(error.to_string()))?;
    DelegationChain::new(vec![grant]).map_err(|error| IdentityError::Conflict(error.to_string()))
}

/// # Errors
///
/// Returns [`IdentityError`] when `PostgreSQL` is unavailable, a unique constraint conflicts, or a stored row cannot be parsed.
pub fn dest_invitee_delegation(
    workload_id: &WorkloadId,
    resource_id: &ResourceId,
) -> Result<DelegationChain, IdentityError> {
    let grant = DelegationGrant::new(
        DelegationId::parse("delegation.invite")
            .map_err(|_| IdentityError::Conflict("invalid delegation".to_owned()))?,
        BTreeSet::from([ActionId::parse(WORLD_READ_ACTION)
            .map_err(|_| IdentityError::Conflict("invalid action".to_owned()))?]),
        BTreeSet::from([resource_id.clone()]),
        BTreeSet::from([workload_id.clone()]),
        TimestampMicros::new(0),
        TimestampMicros::new(4_102_444_800_000_000),
    )
    .map_err(|error| IdentityError::Conflict(error.to_string()))?;
    DelegationChain::new(vec![grant]).map_err(|error| IdentityError::Conflict(error.to_string()))
}

fn hash_token(token: &InviteToken) -> [u8; 32] {
    hash_onboard_token(token.as_str())
}

fn hash_onboard_token(token: &str) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hasher.finalize().into()
}

fn random_onboard_token() -> Result<String, IdentityError> {
    let mut bytes = [0u8; 32];
    File::open("/dev/urandom")
        .and_then(|mut file| file.read_exact(&mut bytes))
        .map_err(|error| IdentityError::Unavailable(error.to_string()))?;
    Ok(URL_SAFE_NO_PAD.encode(bytes))
}

fn new_id_value(prefix: &str) -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_nanos());
    format!("{prefix}.{nanos:x}")
}

fn new_account_id() -> ZoenAccountId {
    ZoenAccountId::parse(new_id_value("account")).expect("generated account id")
}
fn new_binding_id() -> ExternalBindingId {
    ExternalBindingId::parse(new_id_value("binding")).expect("generated binding id")
}
fn new_membership_id() -> MembershipId {
    MembershipId::parse(new_id_value("membership")).expect("generated membership id")
}
fn new_invite_id() -> InviteId {
    InviteId::parse(new_id_value("invite")).expect("generated invite id")
}
fn new_tenant_id() -> TenantId {
    TenantId::parse(new_id_value("tenant")).expect("generated tenant id")
}
fn new_principal_id() -> PrincipalId {
    PrincipalId::parse(new_id_value("principal")).expect("generated principal id")
}

fn now_micros() -> TimestampMicros {
    TimestampMicros::new(crate::clock_micros())
}

fn unavailable(error: impl std::fmt::Display) -> IdentityError {
    IdentityError::Unavailable(error.to_string())
}

fn map_unique_subject(error: sqlx::Error) -> IdentityError {
    match &error {
        sqlx::Error::Database(database)
            if database.constraint() == Some("external_bindings_active_subject") =>
        {
            IdentityError::AlreadyBound
        }
        _ => unavailable(error),
    }
}

fn row_text(row: &PgRow, column: &str) -> Result<String, IdentityError> {
    row.try_get(column).map_err(unavailable)
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct DelegationWire {
    grants: Vec<DelegationGrantWire>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct DelegationGrantWire {
    action_ids: Vec<String>,
    delegation_id: String,
    expires_at: i64,
    not_before: i64,
    resource_ids: Vec<String>,
    workload_ids: Vec<String>,
}

impl From<&DelegationChain> for DelegationWire {
    fn from(value: &DelegationChain) -> Self {
        Self {
            grants: value
                .grants()
                .iter()
                .map(|grant| DelegationGrantWire {
                    action_ids: grant
                        .actions()
                        .iter()
                        .map(std::string::ToString::to_string)
                        .collect(),
                    delegation_id: grant.id().to_string(),
                    expires_at: grant.expires_at().get() / 1_000_000,
                    not_before: grant.not_before().get() / 1_000_000,
                    resource_ids: grant
                        .resources()
                        .iter()
                        .map(std::string::ToString::to_string)
                        .collect(),
                    workload_ids: grant
                        .workloads()
                        .iter()
                        .map(std::string::ToString::to_string)
                        .collect(),
                })
                .collect(),
        }
    }
}

fn clearance_json(clearance: &Clearance) -> Result<serde_json::Value, IdentityError> {
    serde_json::to_value(clearance.to_token_strings())
        .map_err(|error| IdentityError::Conflict(format!("clearance encode: {error}")))
}

fn clearance_from_json(value: serde_json::Value) -> Result<Clearance, IdentityError> {
    let tokens: Vec<String> = serde_json::from_value(value)
        .map_err(|error| IdentityError::Conflict(format!("clearance decode: {error}")))?;
    Clearance::from_token_strings(tokens)
}

fn decode_delegation(value: serde_json::Value) -> Result<DelegationChain, IdentityError> {
    let wire: DelegationWire = serde_json::from_value(value)
        .map_err(|error| IdentityError::Conflict(format!("delegation decode: {error}")))?;
    let grants =
        wire.grants
            .into_iter()
            .map(|grant| {
                let actions = grant
                    .action_ids
                    .into_iter()
                    .map(ActionId::parse)
                    .collect::<Result<BTreeSet<_>, _>>()
                    .map_err(|error| IdentityError::Conflict(error.to_string()))?;
                let resources = grant
                    .resource_ids
                    .into_iter()
                    .map(ResourceId::parse)
                    .collect::<Result<BTreeSet<_>, _>>()
                    .map_err(|error| IdentityError::Conflict(error.to_string()))?;
                let workloads = grant
                    .workload_ids
                    .into_iter()
                    .map(WorkloadId::parse)
                    .collect::<Result<BTreeSet<_>, _>>()
                    .map_err(|error| IdentityError::Conflict(error.to_string()))?;
                DelegationGrant::new(
                    DelegationId::parse(grant.delegation_id)
                        .map_err(|error| IdentityError::Conflict(error.to_string()))?,
                    actions,
                    resources,
                    workloads,
                    TimestampMicros::new(grant.not_before.checked_mul(1_000_000).ok_or_else(
                        || IdentityError::Conflict("not_before overflow".to_owned()),
                    )?),
                    TimestampMicros::new(grant.expires_at.checked_mul(1_000_000).ok_or_else(
                        || IdentityError::Conflict("expires_at overflow".to_owned()),
                    )?),
                )
                .map_err(|error| IdentityError::Conflict(error.to_string()))
            })
            .collect::<Result<Vec<_>, _>>()?;
    DelegationChain::new(grants).map_err(|error| IdentityError::Conflict(error.to_string()))
}
