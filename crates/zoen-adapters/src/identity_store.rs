use std::{collections::BTreeSet, fs::File, io::Read, time::Duration};

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Postgres, Row, Transaction, postgres::PgRow};
use zoen_core::{
    Account, AccountId, AccountStatus, ActionId, ActorId, BindingStatus, ChannelBinding,
    ChannelBindingId, ChannelProvider, Clearance, DelegationChain, DelegationGrant, DelegationId,
    ExternalSubject, IdentityError, Invite, InviteId, InviteToken, LinkIntentId, LinkIntentToken,
    LinkReceiptId, Membership, MembershipId, MembershipKind, MembershipStatus, PrincipalId,
    PublicVerb, ResourceId, RevocationReason, TimestampMicros, TrustedExecutionContext,
    UnbindReason, VerifiedSessionEvidence, WORKLOAD_CREDENTIALS_RESOURCE,
    WORKLOAD_MANAGE_CREDENTIALS_ACTION, WORLD_INVITE_ACTION, WORLD_KERNEL_AUTHORITY_RESOURCE,
    WORLD_READ_ACTION, WORLD_RELEASE_ACTIVATE_ACTION, WORLD_RELEASE_AUTHORITY_RESOURCE,
    WORLD_RELEASE_DECIDE_ACTION, WORLD_RELEASE_PREVIEW_ACTION, WORLD_RELEASE_PUBLISH_ACTION,
    WORLD_RESERVE_ACTION, WORLD_SHARE_ACTION, WorkloadId, WorldId, encode_hex,
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
    ) -> Result<Account, IdentityError> {
        let mut transaction = self.pool.begin().await.map_err(unavailable)?;
        if let Some(existing) = active_binding_for_subject(&mut transaction, &subject).await? {
            let account = load_account(&mut transaction, &existing.account_id).await?;
            transaction.commit().await.map_err(unavailable)?;
            return Ok(account);
        }
        let now = now_micros();
        let account_id = new_account_id()?;
        sqlx::query(
            "INSERT INTO zoen_accounts (account_id, status, created_at)
             VALUES ($1, 'provisional', to_timestamp($2::double precision / 1000000.0))",
        )
        .bind(account_id.as_str())
        .bind(now.get())
        .execute(&mut *transaction)
        .await
        .map_err(unavailable)?;
        let binding_id = new_binding_id()?;
        sqlx::query(
            "INSERT INTO channel_bindings (
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
        let account = Account {
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
        account: AccountId,
    ) -> Result<ChannelBinding, IdentityError> {
        let mut transaction = self.pool.begin().await.map_err(unavailable)?;
        let account_row = load_account(&mut transaction, &account).await?;
        reject_merged(&account_row)?;
        let binding = sqlx::query(
            "SELECT binding_id, account_id, provider, subject_key, status, verified_at,
                    unbound_at, unbind_reason
             FROM channel_bindings
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
            "UPDATE channel_bindings
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
            &ChannelBindingId::parse(binding_id)
                .map_err(|_| IdentityError::Conflict("invalid binding id".to_owned()))?,
        )
        .await?;
        transaction.commit().await.map_err(unavailable)?;
        Ok(verified)
    }

    /// # Errors
    ///
    /// Returns [`IdentityError`] when `PostgreSQL` is unavailable, a unique constraint conflicts, or a stored row cannot be parsed.
    pub async fn unbind(
        &self,
        binding: ChannelBindingId,
        reason: UnbindReason,
        authority: UnbindAuthority,
    ) -> Result<(), IdentityError> {
        let mut transaction = self.pool.begin().await.map_err(unavailable)?;
        let existing = load_binding(&mut transaction, &binding).await?;
        if let UnbindAuthority::Account(expected_account) = &authority
            && existing.account_id != *expected_account
        {
            return Err(IdentityError::Conflict(
                "binding owner changed before unbind".to_owned(),
            ));
        }
        if matches!(existing.status, BindingStatus::Unbound { .. }) {
            transaction.commit().await.map_err(unavailable)?;
            return Ok(());
        }
        let now = now_micros();
        sqlx::query(
            "UPDATE channel_bindings
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
        account: AccountId,
    ) -> Result<Membership, IdentityError> {
        let mut transaction = self.pool.begin().await.map_err(unavailable)?;
        let account_row = load_account(&mut transaction, &account).await?;
        reject_merged(&account_row)?;
        if let Some(world_id) = sqlx::query_scalar::<_, String>(
            "SELECT world_id FROM personal_worlds WHERE account_id = $1",
        )
        .bind(account.as_str())
        .fetch_optional(&mut *transaction)
        .await
        .map_err(unavailable)?
        {
            let world = WorldId::parse(world_id)
                .map_err(|_| IdentityError::Conflict("invalid personal world".to_owned()))?;
            let membership = load_active_membership(&mut transaction, &account, &world).await?;
            transaction.commit().await.map_err(unavailable)?;
            return Ok(membership);
        }
        let world_id = new_world_id()?;
        let principal_id = new_principal_id()?;
        let membership_id = new_membership_id()?;
        let actor_id = ActorId::parse(new_id_value("actor")?)
            .map_err(|_| IdentityError::Conflict("invalid actor id".to_owned()))?;
        let workload_id = WorkloadId::parse("workload.personal")
            .map_err(|_| IdentityError::Conflict("invalid workload".to_owned()))?;
        let delegation = personal_delegation(&workload_id)?;
        let clearance = Clearance::personal_owner();
        sqlx::query("INSERT INTO worlds (world_id, kind) VALUES ($1, 'personal')")
            .bind(world_id.as_str())
            .execute(&mut *transaction)
            .await
            .map_err(unavailable)?;
        sqlx::query("INSERT INTO personal_worlds (account_id, world_id) VALUES ($1, $2)")
            .bind(account.as_str())
            .bind(world_id.as_str())
            .execute(&mut *transaction)
            .await
            .map_err(unavailable)?;
        insert_membership(
            &mut transaction,
            InsertMembership {
                id: &membership_id,
                account_id: &account,
                world_id: &world_id,
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
            world_id,
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

    /// Resolve `Account` → `ChannelBinding` → `Membership` → `World` → active release.
    ///
    /// # Errors
    ///
    /// Returns [`IdentityError`] when the subject is unbound, the membership is
    /// missing or inactive, or the store is unavailable.
    pub async fn resolve_bound_ingress(
        &self,
        subject: &ExternalSubject,
        world: &WorldId,
    ) -> Result<BoundIngress, IdentityError> {
        let mut transaction = self.pool.begin().await.map_err(unavailable)?;
        let binding = active_binding_for_subject(&mut transaction, subject)
            .await?
            .ok_or(IdentityError::SubjectUnbound)?;
        if !matches!(binding.status, BindingStatus::Verified) {
            return Err(IdentityError::SubjectUnbound);
        }
        let account = load_account(&mut transaction, &binding.account_id).await?;
        reject_merged(&account)?;
        let membership = load_active_membership(&mut transaction, &account.id, world).await?;
        let active_release_digest = load_world_and_active_release(&mut transaction, world).await?;
        transaction.commit().await.map_err(unavailable)?;
        Ok(BoundIngress {
            account,
            binding,
            membership,
            world_id: world.clone(),
            active_release_digest,
        })
    }

    /// # Errors
    ///
    /// Returns [`IdentityError`] when `PostgreSQL` is unavailable, a unique constraint conflicts, or a stored row cannot be parsed.
    pub async fn create_invite(&self, input: CreateInvite<'_>) -> Result<Invite, IdentityError> {
        let mut transaction = self.pool.begin().await.map_err(unavailable)?;
        let invite_id = new_invite_id()?;
        let token_hash = hash_token(input.token);
        ensure_world_row(&mut transaction, &input.world_id, "shared").await?;
        sqlx::query(
            "INSERT INTO invites (
                invite_id, world_id, principal_id, token_hash, expires_at,
                workload_id, actor_id, delegation_json, clearance_json
             ) VALUES (
                $1, $2, $3, $4, to_timestamp($5::double precision / 1000000.0),
                $6, $7, $8, $9
             )",
        )
        .bind(invite_id.as_str())
        .bind(input.world_id.as_str())
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
            world_id: input.world_id,
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
        account: AccountId,
        token: InviteToken,
    ) -> Result<Membership, IdentityError> {
        let token_hash = hash_token(&token);
        let mut transaction = self.pool.begin().await.map_err(unavailable)?;
        let account_row = load_account(&mut transaction, &account).await?;
        reject_merged(&account_row)?;
        let invite_row = sqlx::query(
            "SELECT invite_id, world_id, principal_id, token_hash, expires_at, consumed_at,
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
        let world_id = WorldId::parse(row_text(&invite_row, "world_id")?)
            .map_err(|_| IdentityError::Conflict("invalid invite world".to_owned()))?;
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
        let membership_id = new_membership_id()?;
        insert_membership(
            &mut transaction,
            InsertMembership {
                id: &membership_id,
                account_id: &account,
                world_id: &world_id,
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
            world_id,
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
                    .active_membership(&input.account_id, &input.world_id)
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
            world_id: input.world_id.clone(),
            token: &token,
            workload_id: input.workload_id,
        })
        .await?;
        match self.accept_invite(input.account_id.clone(), token).await {
            Ok(membership) => Ok(membership),
            Err(IdentityError::AlreadyConsumed) => {
                self.active_membership(&input.account_id, &input.world_id)
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
        account: &AccountId,
        world: &WorldId,
    ) -> Result<Membership, IdentityError> {
        let mut transaction = self.pool.begin().await.map_err(unavailable)?;
        let membership = load_active_membership(&mut transaction, account, world).await?;
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
        let world_key: String = sqlx::query_scalar(
            "SELECT world_id FROM memberships WHERE membership_id = $1 FOR UPDATE",
        )
        .bind(id.as_str())
        .fetch_optional(&mut *transaction)
        .await
        .map_err(unavailable)?
        .ok_or(IdentityError::MembershipNotFound)?;
        let _world = WorldId::parse(world_key)
            .map_err(|_| IdentityError::Conflict("invalid membership world".to_owned()))?;
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
    pub async fn issue_link_intent(
        &self,
        subject: ExternalSubject,
        ttl: Duration,
    ) -> Result<MintedLinkIntent, IdentityError> {
        if subject.provider == ChannelProvider::AuthDoor {
            return Err(IdentityError::InvalidProvider);
        }
        match self.ensure_provisional(subject.clone()).await {
            Ok(_) | Err(IdentityError::AlreadyBound) => {}
            Err(error) => return Err(error),
        }

        let raw = random_link_intent_token()?;
        let token = LinkIntentToken::parse(raw)?;
        let token_hash = hash_link_intent_token(&token);
        let intent_id = new_link_intent_id()?;
        let now = now_micros();
        let expires_at = TimestampMicros::new(now.get().saturating_add(duration_micros(ttl)?));
        let mut transaction = self.pool.begin().await.map_err(unavailable)?;
        let binding = active_binding_for_subject(&mut transaction, &subject)
            .await?
            .ok_or(IdentityError::BindingNotFound)?;

        sqlx::query(
            "UPDATE channel_link_intents
             SET invalidated_at = clock_timestamp()
             WHERE binding_id = $1
               AND consumed_at IS NULL
               AND invalidated_at IS NULL
               AND expires_at <= clock_timestamp()",
        )
        .bind(binding.id.as_str())
        .execute(&mut *transaction)
        .await
        .map_err(unavailable)?;
        let pending = sqlx::query_scalar::<_, bool>(
            "SELECT true
             FROM channel_link_intents
             WHERE binding_id = $1
               AND consumed_at IS NULL
               AND invalidated_at IS NULL
             FOR UPDATE",
        )
        .bind(binding.id.as_str())
        .fetch_optional(&mut *transaction)
        .await
        .map_err(unavailable)?
        .is_some();
        if pending {
            return Err(IdentityError::Conflict(
                "link intent already pending for binding".to_owned(),
            ));
        }
        sqlx::query(
            "INSERT INTO channel_link_intents (
                intent_id, token_hash, binding_id, expires_at
             ) VALUES ($1, $2, $3, to_timestamp($4::double precision / 1000000.0))",
        )
        .bind(intent_id.as_str())
        .bind(token_hash.as_slice())
        .bind(binding.id.as_str())
        .bind(expires_at.get())
        .execute(&mut *transaction)
        .await
        .map_err(unavailable)?;
        transaction.commit().await.map_err(unavailable)?;
        Ok(MintedLinkIntent {
            binding_id: binding.id,
            expires_at,
            intent_id,
            token,
        })
    }

    /// Confirm one channel-possession `LinkIntent` against a verified Better Auth
    /// session. The exact binding moves; Membership and World rows never do.
    ///
    /// # Errors
    ///
    /// Returns [`IdentityError`] when the token is invalid, expired, consumed,
    /// or the binding/session account cannot be changed atomically.
    pub async fn confirm_link_intent(
        &self,
        token: &LinkIntentToken,
        session: &VerifiedSessionEvidence,
    ) -> Result<ConfirmedLinkIntent, IdentityError> {
        let mut transaction = self.pool.begin().await.map_err(unavailable)?;
        let intent = lock_link_intent(&mut transaction, token).await?;

        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
            .bind(&session.door_user_key)
            .execute(&mut *transaction)
            .await
            .map_err(unavailable)?;
        let door_subject =
            ExternalSubject::new(ChannelProvider::AuthDoor, session.door_user_key.clone())?;
        let target_account_id =
            ensure_verified_door_account(&mut transaction, &door_subject).await?;
        let now = now_micros();
        let source_preserved =
            move_link_intent_binding(&mut transaction, &intent, &target_account_id, now).await?;
        let receipt_id =
            record_link_confirmation(&mut transaction, &intent, &target_account_id, session, now)
                .await?;
        transaction.commit().await.map_err(unavailable)?;
        Ok(ConfirmedLinkIntent {
            binding_id: intent.binding,
            intent_id: intent.intent,
            receipt_id,
            source_account_id: intent.source_account,
            source_preserved,
            target_account_id,
        })
    }

    /// # Errors
    ///
    /// Returns [`IdentityError`] when `PostgreSQL` is unavailable, a unique constraint conflicts, or a stored row cannot be parsed.
    pub async fn binding_for_subject(
        &self,
        subject: &ExternalSubject,
    ) -> Result<Option<ChannelBinding>, IdentityError> {
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
    ) -> Result<(ChannelBinding, AccountSnapshot), IdentityError> {
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
        world: &WorldId,
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
            load_active_membership(&mut transaction, &binding.account_id, world).await?;
        let context = trusted_context_from_membership(&membership)?;
        transaction.commit().await.map_err(unavailable)?;
        Ok((membership, context))
    }

    /// # Errors
    ///
    /// Returns [`IdentityError`] when `PostgreSQL` is unavailable, a unique constraint conflicts, or a stored row cannot be parsed.
    pub async fn get_binding(
        &self,
        id: &ChannelBindingId,
    ) -> Result<ChannelBinding, IdentityError> {
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
        let world_key: String =
            sqlx::query_scalar("SELECT world_id FROM memberships WHERE membership_id = $1")
                .bind(id.as_str())
                .fetch_optional(&mut *transaction)
                .await
                .map_err(unavailable)?
                .ok_or(IdentityError::MembershipNotFound)?;
        let _world = WorldId::parse(world_key)
            .map_err(|_| IdentityError::Conflict("invalid membership world".to_owned()))?;
        let row = sqlx::query(
            "SELECT membership_id, account_id, world_id, principal_id, status, kind,
                    invite_id, delegation_template_id,
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

    /// Resolve one durable Membership authority cut.
    ///
    /// The caller-supplied principal and World are only selectors: the stored
    /// active Membership remains authoritative, and its terminal delegation
    /// grant must cover the requested Action, resource, workload, and time.
    ///
    /// # Errors
    ///
    /// Returns [`IdentityError::MembershipNotFound`] when the Membership does
    /// not bind the requested principal/World, [`IdentityError::MembershipInactive`]
    /// when it has ended, or [`IdentityError::IngressNotAllowed`] when its
    /// delegation does not cover the requested operation.
    pub async fn resolve_membership_authority(
        &self,
        id: &MembershipId,
        world_id: &WorldId,
        principal_id: &PrincipalId,
        action_id: &ActionId,
        resource_id: &ResourceId,
        at: TimestampMicros,
    ) -> Result<TrustedExecutionContext, IdentityError> {
        let (_, context) = self
            .load_membership_authority(id, world_id, principal_id, action_id, resource_id, at)
            .await?;
        Ok(context)
    }

    /// Lock and re-resolve the live Membership/delegation cut inside a caller transaction.
    ///
    /// # Errors
    ///
    /// Returns [`IdentityError`] when the Membership is inactive, no longer matches the
    /// principal/World, or its current delegation no longer permits the operation.
    pub(crate) async fn lock_membership_authority(
        transaction: &mut Transaction<'_, Postgres>,
        id: &MembershipId,
        world_id: &WorldId,
        principal_id: &PrincipalId,
        action_id: &ActionId,
        resource_id: &ResourceId,
        at: TimestampMicros,
    ) -> Result<TrustedExecutionContext, IdentityError> {
        let row = sqlx::query(
            "SELECT membership_id, account_id, world_id, principal_id, status, kind,
                    invite_id, delegation_template_id,
                    workload_id, actor_id, delegation_json, ended_at, ended_reason,
                    clearance_json
             FROM memberships WHERE membership_id = $1 FOR SHARE",
        )
        .bind(id.as_str())
        .fetch_optional(&mut **transaction)
        .await
        .map_err(unavailable)?
        .ok_or(IdentityError::MembershipNotFound)?;
        let membership = row_to_membership(&row)?;
        if membership.world_id != *world_id || membership.principal_id != *principal_id {
            return Err(IdentityError::MembershipNotFound);
        }
        let context = trusted_context_from_membership(&membership)?;
        if !context
            .delegation()
            .permits(action_id, resource_id, context.workload_id(), at)
        {
            return Err(IdentityError::IngressNotAllowed);
        }
        Ok(context)
    }

    async fn load_membership_authority(
        &self,
        id: &MembershipId,
        world_id: &WorldId,
        principal_id: &PrincipalId,
        action_id: &ActionId,
        resource_id: &ResourceId,
        at: TimestampMicros,
    ) -> Result<(Membership, TrustedExecutionContext), IdentityError> {
        let membership = self.get_membership(id).await?;
        if membership.world_id != *world_id || membership.principal_id != *principal_id {
            return Err(IdentityError::MembershipNotFound);
        }
        let context = trusted_context_from_membership(&membership)?;
        if !context
            .delegation()
            .permits(action_id, resource_id, context.workload_id(), at)
        {
            return Err(IdentityError::IngressNotAllowed);
        }
        Ok((membership, context))
    }

    /// # Errors
    ///
    /// Returns [`IdentityError`] when `PostgreSQL` is unavailable, a unique constraint conflicts, or a stored row cannot be parsed.
    pub async fn snapshot_account(
        &self,
        account: &AccountId,
    ) -> Result<AccountSnapshot, IdentityError> {
        let mut transaction = self.pool.begin().await.map_err(unavailable)?;
        let account_row = load_account(&mut transaction, account).await?;
        let bindings = sqlx::query(
            "SELECT binding_id, account_id, provider, subject_key, status, verified_at,
                    unbound_at, unbind_reason
             FROM channel_bindings WHERE account_id = $1 ORDER BY binding_id",
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
            "SELECT membership_id, account_id, world_id, principal_id, status, kind,
                    invite_id, delegation_template_id,
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
        let personal_world = sqlx::query_scalar::<_, String>(
            "SELECT world_id FROM personal_worlds WHERE account_id = $1",
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
            personal_world,
        })
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BoundIngress {
    pub account: Account,
    pub binding: ChannelBinding,
    pub membership: Membership,
    pub world_id: WorldId,
    pub active_release_digest: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AccountSnapshot {
    pub account: Account,
    pub bindings: Vec<ChannelBinding>,
    pub memberships: Vec<Membership>,
    pub personal_world: Option<String>,
}

pub struct MintedLinkIntent {
    pub binding_id: ChannelBindingId,
    pub expires_at: TimestampMicros,
    pub intent_id: LinkIntentId,
    pub token: LinkIntentToken,
}

pub struct ConfirmedLinkIntent {
    pub binding_id: ChannelBindingId,
    pub intent_id: LinkIntentId,
    pub receipt_id: LinkReceiptId,
    pub source_account_id: AccountId,
    pub source_preserved: bool,
    pub target_account_id: AccountId,
}

pub enum UnbindAuthority {
    Account(AccountId),
    MachineOverride,
}

struct LockedLinkIntent {
    binding: ChannelBindingId,
    intent: LinkIntentId,
    source_account: AccountId,
}

pub struct CreateInvite<'a> {
    pub actor_id: ActorId,
    pub clearance: Clearance,
    pub delegation: DelegationChain,
    pub expires_at: TimestampMicros,
    pub principal_id: PrincipalId,
    pub world_id: WorldId,
    pub token: &'a InviteToken,
    pub workload_id: WorkloadId,
}

pub struct WorldInvite {
    pub account_id: AccountId,
    pub actor_id: ActorId,
    pub delegation: DelegationChain,
    pub expires_at: TimestampMicros,
    pub principal_id: PrincipalId,
    pub world_id: WorldId,
    pub token: InviteToken,
    pub workload_id: WorkloadId,
}

struct InsertMembership<'a> {
    id: &'a MembershipId,
    account_id: &'a AccountId,
    world_id: &'a WorldId,
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
            membership_id, account_id, world_id, principal_id, status, kind,
            invite_id, workload_id, actor_id, delegation_json, clearance_json
         ) VALUES ($1,$2,$3,$4,'active',$5,$6,$7,$8,$9,$10)",
    )
    .bind(input.id.as_str())
    .bind(input.account_id.as_str())
    .bind(input.world_id.as_str())
    .bind(input.principal_id.as_str())
    .bind(kind)
    .bind(invite_id)
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

async fn lock_link_intent(
    transaction: &mut Transaction<'_, Postgres>,
    token: &LinkIntentToken,
) -> Result<LockedLinkIntent, IdentityError> {
    let token_hash = hash_link_intent_token(token);
    let row = sqlx::query(
        "SELECT intent.intent_id, intent.binding_id,
                intent.consumed_at IS NOT NULL AS consumed,
                intent.invalidated_at IS NOT NULL AS invalidated,
                intent.expires_at <= clock_timestamp() AS expired,
                binding.account_id AS source_account_id,
                binding.provider
         FROM channel_link_intents AS intent
         JOIN channel_bindings AS binding USING (binding_id)
         WHERE intent.token_hash = $1
         FOR UPDATE OF intent, binding",
    )
    .bind(token_hash.as_slice())
    .fetch_optional(&mut **transaction)
    .await
    .map_err(unavailable)?
    .ok_or(IdentityError::LinkIntentNotFound)?;
    if row.try_get::<bool, _>("consumed").map_err(unavailable)? {
        return Err(IdentityError::LinkIntentConsumed);
    }
    if row.try_get::<bool, _>("invalidated").map_err(unavailable)? {
        return Err(IdentityError::LinkIntentInvalidated);
    }
    if row.try_get::<bool, _>("expired").map_err(unavailable)? {
        return Err(IdentityError::LinkIntentExpired);
    }
    if ChannelProvider::parse(&row_text(&row, "provider")?)? == ChannelProvider::AuthDoor {
        return Err(IdentityError::InvalidProvider);
    }
    Ok(LockedLinkIntent {
        binding: ChannelBindingId::parse(row_text(&row, "binding_id")?)
            .map_err(|_| IdentityError::Conflict("invalid binding id".to_owned()))?,
        intent: LinkIntentId::parse(row_text(&row, "intent_id")?)
            .map_err(|_| IdentityError::Conflict("invalid link intent id".to_owned()))?,
        source_account: AccountId::parse(row_text(&row, "source_account_id")?)
            .map_err(|_| IdentityError::Conflict("invalid source account".to_owned()))?,
    })
}

async fn move_link_intent_binding(
    transaction: &mut Transaction<'_, Postgres>,
    intent: &LockedLinkIntent,
    target_account_id: &AccountId,
    now: TimestampMicros,
) -> Result<bool, IdentityError> {
    let source = load_account(transaction, &intent.source_account).await?;
    reject_merged(&source)?;
    let moved = sqlx::query(
        "UPDATE channel_bindings
         SET account_id = $2,
             status = 'verified',
             verified_at = COALESCE(verified_at, to_timestamp($3::double precision / 1000000.0)),
             unbound_at = NULL,
             unbind_reason = NULL
         WHERE binding_id = $1
           AND account_id = $4
           AND provider <> 'auth_door'
           AND status IN ('provisional', 'verified')",
    )
    .bind(intent.binding.as_str())
    .bind(target_account_id.as_str())
    .bind(now.get())
    .bind(intent.source_account.as_str())
    .execute(&mut **transaction)
    .await
    .map_err(unavailable)?
    .rows_affected();
    if moved != 1 {
        return Err(IdentityError::Conflict(
            "link intent binding changed before confirmation".to_owned(),
        ));
    }
    if intent.source_account == *target_account_id {
        return Ok(true);
    }
    let has_other_state = sqlx::query_scalar::<_, bool>(
        "SELECT
            EXISTS (
                SELECT 1 FROM channel_bindings
                WHERE account_id = $1
                  AND status IN ('provisional', 'verified')
            )
            OR EXISTS (SELECT 1 FROM memberships WHERE account_id = $1)
            OR EXISTS (SELECT 1 FROM personal_worlds WHERE account_id = $1)",
    )
    .bind(intent.source_account.as_str())
    .fetch_one(&mut **transaction)
    .await
    .map_err(unavailable)?;
    if !has_other_state {
        sqlx::query(
            "UPDATE zoen_accounts
             SET status = 'merged_into', merged_into_account_id = $2
             WHERE account_id = $1",
        )
        .bind(intent.source_account.as_str())
        .bind(target_account_id.as_str())
        .execute(&mut **transaction)
        .await
        .map_err(unavailable)?;
    }
    Ok(has_other_state)
}

async fn record_link_confirmation(
    transaction: &mut Transaction<'_, Postgres>,
    intent: &LockedLinkIntent,
    target_account_id: &AccountId,
    session: &VerifiedSessionEvidence,
    now: TimestampMicros,
) -> Result<LinkReceiptId, IdentityError> {
    let receipt_id = new_link_receipt_id()?;
    sqlx::query(
        "INSERT INTO channel_link_receipts (
            receipt_id, intent_id, binding_id, source_account_id,
            target_account_id, door_session_id, confirmed_at
         ) VALUES (
            $1, $2, $3, $4, $5, $6,
            to_timestamp($7::double precision / 1000000.0)
         )",
    )
    .bind(receipt_id.as_str())
    .bind(intent.intent.as_str())
    .bind(intent.binding.as_str())
    .bind(intent.source_account.as_str())
    .bind(target_account_id.as_str())
    .bind(session.session_id.as_str())
    .bind(now.get())
    .execute(&mut **transaction)
    .await
    .map_err(unavailable)?;
    let consumed = sqlx::query(
        "UPDATE channel_link_intents
         SET consumed_at = to_timestamp($2::double precision / 1000000.0)
         WHERE intent_id = $1
           AND consumed_at IS NULL
           AND invalidated_at IS NULL",
    )
    .bind(intent.intent.as_str())
    .bind(now.get())
    .execute(&mut **transaction)
    .await
    .map_err(unavailable)?
    .rows_affected();
    if consumed != 1 {
        return Err(IdentityError::Conflict(
            "link intent changed before consumption".to_owned(),
        ));
    }
    Ok(receipt_id)
}

async fn active_binding_for_subject(
    transaction: &mut Transaction<'_, Postgres>,
    subject: &ExternalSubject,
) -> Result<Option<ChannelBinding>, IdentityError> {
    let row = sqlx::query(
        "SELECT binding_id, account_id, provider, subject_key, status, verified_at,
                unbound_at, unbind_reason
         FROM channel_bindings
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

async fn ensure_verified_door_account(
    transaction: &mut Transaction<'_, Postgres>,
    subject: &ExternalSubject,
) -> Result<AccountId, IdentityError> {
    if subject.provider != ChannelProvider::AuthDoor {
        return Err(IdentityError::InvalidProvider);
    }
    let now = now_micros();
    if let Some(binding) = active_binding_for_subject(transaction, subject).await? {
        let account = load_account(transaction, &binding.account_id).await?;
        reject_merged(&account)?;
        if matches!(binding.status, BindingStatus::Provisional) {
            sqlx::query(
                "UPDATE channel_bindings
                 SET status = 'verified',
                     verified_at = to_timestamp($2::double precision / 1000000.0)
                 WHERE binding_id = $1 AND status = 'provisional'",
            )
            .bind(binding.id.as_str())
            .bind(now.get())
            .execute(&mut **transaction)
            .await
            .map_err(unavailable)?;
        }
        if matches!(account.status, AccountStatus::Provisional) {
            sqlx::query("UPDATE zoen_accounts SET status = 'verified' WHERE account_id = $1")
                .bind(account.id.as_str())
                .execute(&mut **transaction)
                .await
                .map_err(unavailable)?;
        }
        return Ok(account.id);
    }

    let account_id = new_account_id()?;
    let binding_id = new_binding_id()?;
    sqlx::query(
        "INSERT INTO zoen_accounts (account_id, status, created_at)
         VALUES ($1, 'verified', to_timestamp($2::double precision / 1000000.0))",
    )
    .bind(account_id.as_str())
    .bind(now.get())
    .execute(&mut **transaction)
    .await
    .map_err(unavailable)?;
    sqlx::query(
        "INSERT INTO channel_bindings (
            binding_id, account_id, provider, subject_key, status, verified_at
         ) VALUES (
            $1, $2, 'auth_door', $3, 'verified',
            to_timestamp($4::double precision / 1000000.0)
         )",
    )
    .bind(binding_id.as_str())
    .bind(account_id.as_str())
    .bind(&subject.subject_key)
    .bind(now.get())
    .execute(&mut **transaction)
    .await
    .map_err(map_unique_subject)?;
    Ok(account_id)
}

async fn load_binding(
    transaction: &mut Transaction<'_, Postgres>,
    id: &ChannelBindingId,
) -> Result<ChannelBinding, IdentityError> {
    let row = sqlx::query(
        "SELECT binding_id, account_id, provider, subject_key, status, verified_at,
                unbound_at, unbind_reason
         FROM channel_bindings WHERE binding_id = $1 FOR UPDATE",
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
    id: &AccountId,
) -> Result<Account, IdentityError> {
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
            survivor: AccountId::parse(row_text(&row, "merged_into_account_id")?)
                .map_err(|_| IdentityError::Conflict("invalid survivor".to_owned()))?,
        },
        other => {
            return Err(IdentityError::Conflict(format!(
                "unknown account status {other}"
            )));
        }
    };
    Ok(Account {
        id: AccountId::parse(row_text(&row, "account_id")?)
            .map_err(|_| IdentityError::Conflict("invalid account id".to_owned()))?,
        status,
        created_at: TimestampMicros::new(row.try_get("created_at_micros").map_err(unavailable)?),
    })
}

async fn load_active_membership(
    transaction: &mut Transaction<'_, Postgres>,
    account: &AccountId,
    world: &WorldId,
) -> Result<Membership, IdentityError> {
    let row = sqlx::query(
        "SELECT membership_id, account_id, world_id, principal_id, status, kind,
                invite_id, delegation_template_id,
                workload_id, actor_id, delegation_json, ended_at, ended_reason,
                clearance_json
         FROM memberships
         WHERE account_id = $1 AND world_id = $2 AND status = 'active'
         FOR SHARE",
    )
    .bind(account.as_str())
    .bind(world.as_str())
    .fetch_optional(&mut **transaction)
    .await
    .map_err(unavailable)?
    .ok_or(IdentityError::MembershipNotFound)?;
    row_to_membership(&row)
}

fn row_to_binding(row: &PgRow) -> Result<ChannelBinding, IdentityError> {
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
    Ok(ChannelBinding {
        id: ChannelBindingId::parse(row_text(row, "binding_id")?)
            .map_err(|_| IdentityError::Conflict("invalid binding id".to_owned()))?,
        account_id: AccountId::parse(row_text(row, "account_id")?)
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
        account_id: AccountId::parse(row_text(row, "account_id")?)
            .map_err(|_| IdentityError::Conflict("invalid account id".to_owned()))?,
        world_id: WorldId::parse(row_text(row, "world_id")?)
            .map_err(|_| IdentityError::Conflict("invalid world id".to_owned()))?,
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

fn reject_merged(account: &Account) -> Result<(), IdentityError> {
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
            ActionId::parse(WORKLOAD_MANAGE_CREDENTIALS_ACTION)
                .map_err(|_| IdentityError::Conflict("invalid action".to_owned()))?,
            ActionId::parse(WORLD_RELEASE_PUBLISH_ACTION)
                .map_err(|_| IdentityError::Conflict("invalid action".to_owned()))?,
            ActionId::parse(WORLD_RELEASE_PREVIEW_ACTION)
                .map_err(|_| IdentityError::Conflict("invalid action".to_owned()))?,
            ActionId::parse(WORLD_RELEASE_DECIDE_ACTION)
                .map_err(|_| IdentityError::Conflict("invalid action".to_owned()))?,
            ActionId::parse(WORLD_RELEASE_ACTIVATE_ACTION)
                .map_err(|_| IdentityError::Conflict("invalid action".to_owned()))?,
            ActionId::parse(PublicVerb::Discover.action_id())
                .map_err(|_| IdentityError::Conflict("invalid action".to_owned()))?,
            ActionId::parse(PublicVerb::Query.action_id())
                .map_err(|_| IdentityError::Conflict("invalid action".to_owned()))?,
            ActionId::parse(PublicVerb::Propose.action_id())
                .map_err(|_| IdentityError::Conflict("invalid action".to_owned()))?,
            ActionId::parse(PublicVerb::Decide.action_id())
                .map_err(|_| IdentityError::Conflict("invalid action".to_owned()))?,
            ActionId::parse(PublicVerb::Commit.action_id())
                .map_err(|_| IdentityError::Conflict("invalid action".to_owned()))?,
            ActionId::parse(PublicVerb::Explain.action_id())
                .map_err(|_| IdentityError::Conflict("invalid action".to_owned()))?,
            ActionId::parse(PublicVerb::Execute.action_id())
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
            ResourceId::parse(WORKLOAD_CREDENTIALS_RESOURCE)
                .map_err(|_| IdentityError::Conflict("invalid resource".to_owned()))?,
            ResourceId::parse(WORLD_RELEASE_AUTHORITY_RESOURCE)
                .map_err(|_| IdentityError::Conflict("invalid resource".to_owned()))?,
            ResourceId::parse(WORLD_KERNEL_AUTHORITY_RESOURCE)
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
    hash_bytes(token.as_str())
}

fn hash_link_intent_token(token: &LinkIntentToken) -> [u8; 32] {
    hash_bytes(token.as_str())
}

fn hash_bytes(token: &str) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hasher.finalize().into()
}

fn random_link_intent_token() -> Result<String, IdentityError> {
    let mut bytes = [0u8; 32];
    File::open("/dev/urandom")
        .and_then(|mut file| file.read_exact(&mut bytes))
        .map_err(|error| IdentityError::Unavailable(error.to_string()))?;
    Ok(format!("zli.{}", URL_SAFE_NO_PAD.encode(bytes)))
}

fn new_id_value(prefix: &str) -> Result<String, IdentityError> {
    let mut entropy = [0_u8; 16];
    File::open("/dev/urandom")
        .and_then(|mut file| file.read_exact(&mut entropy))
        .map_err(|error| IdentityError::Unavailable(error.to_string()))?;
    Ok(format!("{prefix}.{}", encode_hex(&entropy)))
}

fn new_account_id() -> Result<AccountId, IdentityError> {
    AccountId::parse(new_id_value("account")?)
        .map_err(|error| IdentityError::Conflict(error.to_string()))
}
fn new_binding_id() -> Result<ChannelBindingId, IdentityError> {
    ChannelBindingId::parse(new_id_value("binding")?)
        .map_err(|error| IdentityError::Conflict(error.to_string()))
}

fn new_link_intent_id() -> Result<LinkIntentId, IdentityError> {
    LinkIntentId::parse(new_id_value("link-intent")?)
        .map_err(|error| IdentityError::Conflict(error.to_string()))
}

fn new_link_receipt_id() -> Result<LinkReceiptId, IdentityError> {
    LinkReceiptId::parse(new_id_value("link-receipt")?)
        .map_err(|error| IdentityError::Conflict(error.to_string()))
}

async fn load_world_and_active_release(
    transaction: &mut Transaction<'_, Postgres>,
    world: &WorldId,
) -> Result<Option<String>, IdentityError> {
    let world_exists: Option<String> =
        sqlx::query_scalar("SELECT world_id FROM worlds WHERE world_id = $1")
            .bind(world.as_str())
            .fetch_optional(&mut **transaction)
            .await
            .map_err(unavailable)?;
    if world_exists.is_none() {
        return Err(IdentityError::Conflict("world not found".to_owned()));
    }
    sqlx::query_scalar("SELECT digest FROM world_active_releases WHERE world_id = $1")
        .bind(world.as_str())
        .fetch_optional(&mut **transaction)
        .await
        .map_err(unavailable)
}

async fn ensure_world_row(
    transaction: &mut Transaction<'_, Postgres>,
    world_id: &WorldId,
    kind: &str,
) -> Result<(), IdentityError> {
    sqlx::query(
        "INSERT INTO worlds (world_id, kind) VALUES ($1, $2)
         ON CONFLICT (world_id) DO NOTHING",
    )
    .bind(world_id.as_str())
    .bind(kind)
    .execute(&mut **transaction)
    .await
    .map_err(unavailable)?;
    Ok(())
}
fn new_membership_id() -> Result<MembershipId, IdentityError> {
    MembershipId::parse(new_id_value("membership")?)
        .map_err(|error| IdentityError::Conflict(error.to_string()))
}
fn new_invite_id() -> Result<InviteId, IdentityError> {
    InviteId::parse(new_id_value("invite")?)
        .map_err(|error| IdentityError::Conflict(error.to_string()))
}
fn new_world_id() -> Result<WorldId, IdentityError> {
    WorldId::parse(new_id_value("world")?)
        .map_err(|error| IdentityError::Conflict(error.to_string()))
}
fn new_principal_id() -> Result<PrincipalId, IdentityError> {
    PrincipalId::parse(new_id_value("principal")?)
        .map_err(|error| IdentityError::Conflict(error.to_string()))
}

fn now_micros() -> TimestampMicros {
    TimestampMicros::new(crate::clock_micros())
}

fn duration_micros(duration: Duration) -> Result<i64, IdentityError> {
    i64::try_from(duration.as_micros())
        .map_err(|_| IdentityError::Conflict("link intent TTL is too large".to_owned()))
}

fn unavailable(error: impl std::fmt::Display) -> IdentityError {
    IdentityError::Unavailable(error.to_string())
}

fn map_unique_subject(error: sqlx::Error) -> IdentityError {
    match &error {
        sqlx::Error::Database(database)
            if database.constraint() == Some("channel_bindings_active_subject") =>
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
