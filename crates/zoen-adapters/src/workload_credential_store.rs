use std::collections::BTreeSet;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::postgres::PgRow;
use sqlx::{PgPool, Postgres, Row, Transaction};
use zoen_core::{
    ActionId, ActorId, AudienceClass, Clearance, DelegationChain, DelegationGrant, DelegationId,
    IdentityError, IngressAllowance, PrincipalId, ProjectedCapabilityKind, RateBudgetPolicy,
    ResourceId, ServerAllowId, SourceClass, TenantId, TimestampMicros, TrustedExecutionContext,
    VerifiedWorkloadEvidence, WorkloadCredential, WorkloadCredentialId,
    WorkloadCredentialLookupKey, WorkloadCredentialStatus, WorkloadId, WorkloadRevocationReason,
    WorkloadSecretId, trusted_context_from_workload_credential,
};

#[derive(Clone)]
pub struct PostgresWorkloadCredentialStore {
    pool: PgPool,
}

#[derive(Clone, Debug)]
pub struct IssueWorkloadCredential {
    pub tenant_id: TenantId,
    pub workload_id: WorkloadId,
    pub principal_id: PrincipalId,
    pub actor_id: ActorId,
    pub delegation: DelegationChain,
    pub allowed_ingress: Vec<IngressAllowance>,
    pub rate_budget: RateBudgetPolicy,
    pub expires_at: TimestampMicros,
    pub audience_class: Option<AudienceClass>,
    pub jwt_issuer: Option<String>,
    pub jwt_subject: Option<String>,
    pub clearance: Clearance,
}

#[derive(Clone, Debug)]
pub struct IssuedWorkloadCredential {
    pub credential: WorkloadCredential,
    pub api_key_once: String,
}

const CREDENTIAL_SELECT: &str = "credential_id, tenant_id, principal_id, workload_id, actor_id, status,
                allowed_ingress_json, rate_budget_json,
                (EXTRACT(EPOCH FROM expires_at) * 1000000)::bigint AS expires_at_micros,
                audience_class, secret_id, delegation_json, clearance_json,
                (EXTRACT(EPOCH FROM created_at) * 1000000)::bigint AS created_at_micros,
                CASE WHEN rotated_at IS NULL THEN NULL
                     ELSE (EXTRACT(EPOCH FROM rotated_at) * 1000000)::bigint END AS rotated_at_micros,
                CASE WHEN revoked_at IS NULL THEN NULL
                     ELSE (EXTRACT(EPOCH FROM revoked_at) * 1000000)::bigint END AS revoked_at_micros,
                revocation_reason";

impl PostgresWorkloadCredentialStore {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn issue(
        &self,
        cmd: IssueWorkloadCredential,
    ) -> Result<IssuedWorkloadCredential, IdentityError> {
        let mut transaction = self.pool.begin().await.map_err(unavailable)?;
        let now = now_micros();
        let credential_id = new_credential_id();
        let secret_id = new_secret_id();
        let api_key_once = format!("zoen_wl_{}", new_id_value("key"));
        let secret_hash = hash_secret(&api_key_once);
        let allowed_ingress_json = serde_json::to_value(IngressWire::from(&cmd.allowed_ingress))
            .map_err(|error| IdentityError::Conflict(format!("ingress encode: {error}")))?;
        let rate_budget_json = serde_json::to_value(RateBudgetWire::from(&cmd.rate_budget))
            .map_err(|error| IdentityError::Conflict(format!("rate budget encode: {error}")))?;
        let delegation_json = serde_json::to_value(DelegationWire::from(&cmd.delegation))
            .map_err(|error| IdentityError::Conflict(format!("delegation encode: {error}")))?;

        sqlx::query(
            "INSERT INTO workload_credentials (
                credential_id, tenant_id, principal_id, workload_id, actor_id,
                status, allowed_ingress_json, rate_budget_json, expires_at,
                audience_class, secret_id, jwt_issuer, jwt_subject, delegation_json,
                clearance_json, created_at
             ) VALUES (
                $1, $2, $3, $4, $5,
                'active', $6, $7, to_timestamp($8::double precision / 1000000.0),
                $9, $10, $11, $12, $13, $14, to_timestamp($15::double precision / 1000000.0)
             )",
        )
        .bind(credential_id.as_str())
        .bind(cmd.tenant_id.as_str())
        .bind(cmd.principal_id.as_str())
        .bind(cmd.workload_id.as_str())
        .bind(cmd.actor_id.as_str())
        .bind(allowed_ingress_json)
        .bind(rate_budget_json)
        .bind(cmd.expires_at.get())
        .bind(cmd.audience_class.as_ref().map(AudienceClass::as_str))
        .bind(secret_id.as_str())
        .bind(cmd.jwt_issuer.as_deref())
        .bind(cmd.jwt_subject.as_deref())
        .bind(delegation_json)
        .bind(
            serde_json::to_value(cmd.clearance.to_token_strings())
                .map_err(|error| IdentityError::Conflict(format!("clearance encode: {error}")))?,
        )
        .bind(now.get())
        .execute(&mut *transaction)
        .await
        .map_err(unavailable)?;

        sqlx::query(
            "INSERT INTO workload_secrets (secret_id, credential_id, secret_hash, created_at)
             VALUES ($1, $2, $3, to_timestamp($4::double precision / 1000000.0))",
        )
        .bind(secret_id.as_str())
        .bind(credential_id.as_str())
        .bind(secret_hash.as_slice())
        .bind(now.get())
        .execute(&mut *transaction)
        .await
        .map_err(unavailable)?;

        let credential = WorkloadCredential {
            id: credential_id,
            tenant_id: cmd.tenant_id,
            principal_id: cmd.principal_id,
            workload_id: cmd.workload_id,
            actor_id: cmd.actor_id,
            delegation: cmd.delegation,
            status: WorkloadCredentialStatus::Active,
            allowed_ingress: cmd.allowed_ingress,
            rate_budget: cmd.rate_budget,
            expires_at: cmd.expires_at,
            audience_class: cmd.audience_class,
            secret_id,
            created_at: now,
            rotated_at: None,
            clearance: cmd.clearance,
        };
        transaction.commit().await.map_err(unavailable)?;
        Ok(IssuedWorkloadCredential {
            credential,
            api_key_once,
        })
    }

    pub async fn rotate_secret(
        &self,
        id: &WorkloadCredentialId,
    ) -> Result<IssuedWorkloadCredential, IdentityError> {
        let mut transaction = self.pool.begin().await.map_err(unavailable)?;
        let mut credential = load_credential(&mut transaction, id).await?;
        let now = now_micros();
        if !matches!(credential.status, WorkloadCredentialStatus::Active) {
            return Err(IdentityError::WorkloadCredentialInactive);
        }
        if credential.expires_at.get() <= now.get() {
            return Err(IdentityError::WorkloadCredentialExpired);
        }
        sqlx::query(
            "UPDATE workload_secrets
             SET revoked_at = to_timestamp($2::double precision / 1000000.0)
             WHERE credential_id = $1 AND revoked_at IS NULL",
        )
        .bind(id.as_str())
        .bind(now.get())
        .execute(&mut *transaction)
        .await
        .map_err(unavailable)?;
        let secret_id = new_secret_id();
        let api_key_once = format!("zoen_wl_{}", new_id_value("key"));
        let secret_hash = hash_secret(&api_key_once);
        sqlx::query(
            "INSERT INTO workload_secrets (secret_id, credential_id, secret_hash, created_at)
             VALUES ($1, $2, $3, to_timestamp($4::double precision / 1000000.0))",
        )
        .bind(secret_id.as_str())
        .bind(id.as_str())
        .bind(secret_hash.as_slice())
        .bind(now.get())
        .execute(&mut *transaction)
        .await
        .map_err(unavailable)?;
        sqlx::query(
            "UPDATE workload_credentials
             SET secret_id = $2,
                 rotated_at = to_timestamp($3::double precision / 1000000.0)
             WHERE credential_id = $1",
        )
        .bind(id.as_str())
        .bind(secret_id.as_str())
        .bind(now.get())
        .execute(&mut *transaction)
        .await
        .map_err(unavailable)?;
        credential.secret_id = secret_id;
        credential.rotated_at = Some(now);
        transaction.commit().await.map_err(unavailable)?;
        Ok(IssuedWorkloadCredential {
            credential,
            api_key_once,
        })
    }

    pub async fn revoke(
        &self,
        id: &WorkloadCredentialId,
        reason: WorkloadRevocationReason,
    ) -> Result<WorkloadCredential, IdentityError> {
        let mut transaction = self.pool.begin().await.map_err(unavailable)?;
        let mut credential = load_credential(&mut transaction, id).await?;
        let now = now_micros();
        sqlx::query(
            "UPDATE workload_credentials
             SET status = 'revoked',
                 revoked_at = to_timestamp($2::double precision / 1000000.0),
                 revocation_reason = $3
             WHERE credential_id = $1",
        )
        .bind(id.as_str())
        .bind(now.get())
        .bind(reason.as_str())
        .execute(&mut *transaction)
        .await
        .map_err(unavailable)?;
        sqlx::query(
            "UPDATE workload_secrets
             SET revoked_at = to_timestamp($2::double precision / 1000000.0)
             WHERE credential_id = $1 AND revoked_at IS NULL",
        )
        .bind(id.as_str())
        .bind(now.get())
        .execute(&mut *transaction)
        .await
        .map_err(unavailable)?;
        credential.status = WorkloadCredentialStatus::Revoked { at: now, reason };
        transaction.commit().await.map_err(unavailable)?;
        Ok(credential)
    }

    pub async fn resolve_from_evidence(
        &self,
        evidence: VerifiedWorkloadEvidence,
    ) -> Result<(WorkloadCredential, TrustedExecutionContext), IdentityError> {
        let mut transaction = self.pool.begin().await.map_err(unavailable)?;
        let credential = match evidence.credential_lookup_key {
            WorkloadCredentialLookupKey::SecretId(secret_id) => {
                load_credential_by_secret(&mut transaction, &secret_id).await?
            }
            WorkloadCredentialLookupKey::JwtSubject { issuer, subject } => {
                load_credential_by_jwt(&mut transaction, &issuer, &subject).await?
            }
        };
        let now = now_micros();
        let tec = trusted_context_from_workload_credential(&credential, now)?;
        let _ = evidence.evidence_kind;
        transaction.commit().await.map_err(unavailable)?;
        Ok((credential, tec))
    }

    pub async fn resolve_api_key(
        &self,
        api_key: &str,
    ) -> Result<(WorkloadCredential, TrustedExecutionContext), IdentityError> {
        let secret_hash = hash_secret(api_key);
        let mut transaction = self.pool.begin().await.map_err(unavailable)?;
        let row = sqlx::query(
            "SELECT secret_id, credential_id
             FROM workload_secrets
             WHERE secret_hash = $1 AND revoked_at IS NULL
             FOR UPDATE",
        )
        .bind(secret_hash.as_slice())
        .fetch_optional(&mut *transaction)
        .await
        .map_err(unavailable)?
        .ok_or(IdentityError::Unauthenticated)?;
        let credential_id = WorkloadCredentialId::parse(row_text(&row, "credential_id")?)
            .map_err(|_| IdentityError::Conflict("invalid credential id".to_owned()))?;
        let credential = load_credential(&mut transaction, &credential_id).await?;
        let now = now_micros();
        let tec = trusted_context_from_workload_credential(&credential, now)?;
        transaction.commit().await.map_err(unavailable)?;
        Ok((credential, tec))
    }

    pub async fn get(
        &self,
        id: &WorkloadCredentialId,
    ) -> Result<WorkloadCredential, IdentityError> {
        let mut transaction = self.pool.begin().await.map_err(unavailable)?;
        let credential = load_credential(&mut transaction, id).await?;
        transaction.commit().await.map_err(unavailable)?;
        Ok(credential)
    }

    pub async fn consume_accept_budget(
        &self,
        credential: &WorkloadCredential,
    ) -> Result<(), IdentityError> {
        let mut transaction = self.pool.begin().await.map_err(unavailable)?;
        let row = sqlx::query(
            "INSERT INTO workload_accept_budget (credential_id, window_minute, accept_count)
             VALUES (
                $1,
                date_trunc('minute', clock_timestamp()),
                1
             )
             ON CONFLICT (credential_id, window_minute)
             DO UPDATE SET accept_count = workload_accept_budget.accept_count + 1
             RETURNING accept_count",
        )
        .bind(credential.id.as_str())
        .fetch_one(&mut *transaction)
        .await
        .map_err(unavailable)?;
        let count: i32 = row.try_get("accept_count").map_err(unavailable)?;
        if count as u32 > credential.rate_budget.max_accepts_per_minute {
            return Err(IdentityError::RateBudgetExceeded);
        }
        transaction.commit().await.map_err(unavailable)?;
        Ok(())
    }
}

async fn load_credential(
    transaction: &mut Transaction<'_, Postgres>,
    id: &WorkloadCredentialId,
) -> Result<WorkloadCredential, IdentityError> {
    let sql = format!(
        "SELECT {CREDENTIAL_SELECT}
         FROM workload_credentials
         WHERE credential_id = $1
         FOR UPDATE"
    );
    let row = sqlx::query(&sql)
        .bind(id.as_str())
        .fetch_optional(&mut **transaction)
        .await
        .map_err(unavailable)?
        .ok_or(IdentityError::WorkloadCredentialNotFound)?;
    row_to_credential(&row)
}

async fn load_credential_by_secret(
    transaction: &mut Transaction<'_, Postgres>,
    secret_id: &WorkloadSecretId,
) -> Result<WorkloadCredential, IdentityError> {
    let row = sqlx::query(
        "SELECT c.credential_id, c.tenant_id, c.principal_id, c.workload_id, c.actor_id, c.status,
                c.allowed_ingress_json, c.rate_budget_json,
                (EXTRACT(EPOCH FROM c.expires_at) * 1000000)::bigint AS expires_at_micros,
                c.audience_class, c.secret_id, c.delegation_json,
                (EXTRACT(EPOCH FROM c.created_at) * 1000000)::bigint AS created_at_micros,
                CASE WHEN c.rotated_at IS NULL THEN NULL
                     ELSE (EXTRACT(EPOCH FROM c.rotated_at) * 1000000)::bigint END AS rotated_at_micros,
                CASE WHEN c.revoked_at IS NULL THEN NULL
                     ELSE (EXTRACT(EPOCH FROM c.revoked_at) * 1000000)::bigint END AS revoked_at_micros,
                c.revocation_reason
         FROM workload_secrets s
         JOIN workload_credentials c ON c.credential_id = s.credential_id
         WHERE s.secret_id = $1 AND s.revoked_at IS NULL
         FOR UPDATE OF c",
    )
        .bind(secret_id.as_str())
        .fetch_optional(&mut **transaction)
        .await
        .map_err(unavailable)?
        .ok_or(IdentityError::WorkloadCredentialNotFound)?;
    row_to_credential(&row)
}

async fn load_credential_by_jwt(
    transaction: &mut Transaction<'_, Postgres>,
    issuer: &str,
    subject: &str,
) -> Result<WorkloadCredential, IdentityError> {
    let sql = format!(
        "SELECT {CREDENTIAL_SELECT}
         FROM workload_credentials
         WHERE jwt_issuer = $1 AND jwt_subject = $2 AND status = 'active'
         FOR UPDATE"
    );
    let row = sqlx::query(&sql)
        .bind(issuer)
        .bind(subject)
        .fetch_optional(&mut **transaction)
        .await
        .map_err(unavailable)?
        .ok_or(IdentityError::WorkloadCredentialNotFound)?;
    row_to_credential(&row)
}

fn row_to_credential(row: &PgRow) -> Result<WorkloadCredential, IdentityError> {
    let status = match row_text(row, "status")?.as_str() {
        "active" => WorkloadCredentialStatus::Active,
        "revoked" => {
            let at = TimestampMicros::new(row_i64(row, "revoked_at_micros")?);
            let reason = WorkloadRevocationReason::parse(&row_text(row, "revocation_reason")?)?;
            WorkloadCredentialStatus::Revoked { at, reason }
        }
        "expired" => WorkloadCredentialStatus::Expired {
            at: TimestampMicros::new(row_i64(row, "expires_at_micros")?),
        },
        other => {
            return Err(IdentityError::Conflict(format!(
                "unknown credential status: {other}"
            )));
        }
    };
    let audience = match row.try_get::<Option<String>, _>("audience_class") {
        Ok(Some(value)) => Some(AudienceClass::parse(value)?),
        Ok(None) => None,
        Err(error) => return Err(unavailable(error)),
    };
    let rotated_at = match row.try_get::<Option<i64>, _>("rotated_at_micros") {
        Ok(Some(value)) => Some(TimestampMicros::new(value)),
        Ok(None) => None,
        Err(error) => return Err(unavailable(error)),
    };
    Ok(WorkloadCredential {
        id: WorkloadCredentialId::parse(row_text(row, "credential_id")?)
            .map_err(|_| IdentityError::Conflict("invalid credential id".to_owned()))?,
        tenant_id: TenantId::parse(row_text(row, "tenant_id")?)
            .map_err(|_| IdentityError::Conflict("invalid tenant".to_owned()))?,
        principal_id: PrincipalId::parse(row_text(row, "principal_id")?)
            .map_err(|_| IdentityError::Conflict("invalid principal".to_owned()))?,
        workload_id: WorkloadId::parse(row_text(row, "workload_id")?)
            .map_err(|_| IdentityError::Conflict("invalid workload".to_owned()))?,
        actor_id: ActorId::parse(row_text(row, "actor_id")?)
            .map_err(|_| IdentityError::Conflict("invalid actor".to_owned()))?,
        delegation: decode_delegation(row.try_get("delegation_json").map_err(unavailable)?)?,
        status,
        allowed_ingress: decode_ingress(row.try_get("allowed_ingress_json").map_err(unavailable)?)?,
        rate_budget: decode_rate_budget(row.try_get("rate_budget_json").map_err(unavailable)?)?,
        expires_at: TimestampMicros::new(row_i64(row, "expires_at_micros")?),
        audience_class: audience,
        secret_id: WorkloadSecretId::parse(row_text(row, "secret_id")?)
            .map_err(|_| IdentityError::Conflict("invalid secret id".to_owned()))?,
        created_at: TimestampMicros::new(row_i64(row, "created_at_micros")?),
        rotated_at,
        clearance: {
            let tokens: Vec<String> =
                serde_json::from_value(row.try_get("clearance_json").map_err(unavailable)?)
                    .map_err(|error| {
                        IdentityError::Conflict(format!("clearance decode: {error}"))
                    })?;
            Clearance::from_token_strings(tokens)?
        },
    })
}

fn hash_secret(secret: &str) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(secret.as_bytes());
    hasher.finalize().into()
}

fn new_id_value(prefix: &str) -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    format!("{prefix}.{nanos:x}")
}

fn new_credential_id() -> WorkloadCredentialId {
    WorkloadCredentialId::parse(new_id_value("wlcred")).expect("generated credential id")
}

fn new_secret_id() -> WorkloadSecretId {
    WorkloadSecretId::parse(new_id_value("wlsecret")).expect("generated secret id")
}

fn now_micros() -> TimestampMicros {
    let micros = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_micros() as i64)
        .unwrap_or(0);
    TimestampMicros::new(micros)
}

fn unavailable(error: impl std::fmt::Display) -> IdentityError {
    IdentityError::Unavailable(error.to_string())
}

fn row_text(row: &PgRow, column: &str) -> Result<String, IdentityError> {
    row.try_get(column).map_err(unavailable)
}

fn row_i64(row: &PgRow, column: &str) -> Result<i64, IdentityError> {
    row.try_get(column).map_err(unavailable)
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct RateBudgetWire {
    max_accepts_per_minute: u32,
    max_commits_per_hour: u32,
}

impl From<&RateBudgetPolicy> for RateBudgetWire {
    fn from(value: &RateBudgetPolicy) -> Self {
        Self {
            max_accepts_per_minute: value.max_accepts_per_minute,
            max_commits_per_hour: value.max_commits_per_hour,
        }
    }
}

fn decode_rate_budget(value: serde_json::Value) -> Result<RateBudgetPolicy, IdentityError> {
    let wire: RateBudgetWire = serde_json::from_value(value)
        .map_err(|error| IdentityError::Conflict(format!("rate budget decode: {error}")))?;
    Ok(RateBudgetPolicy {
        max_accepts_per_minute: wire.max_accepts_per_minute,
        max_commits_per_hour: wire.max_commits_per_hour,
    })
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum IngressWireItem {
    ApiEvent { source_class: String },
    McpOutbound { capability_kinds: Vec<String> },
    McpInboundRead { server_allowlist: Vec<String> },
}

#[derive(Clone, Debug, Deserialize, Serialize)]
struct IngressWire {
    items: Vec<IngressWireItem>,
}

impl From<&Vec<IngressAllowance>> for IngressWire {
    fn from(value: &Vec<IngressAllowance>) -> Self {
        Self {
            items: value
                .iter()
                .map(|item| match item {
                    IngressAllowance::ApiEvent { source_class } => IngressWireItem::ApiEvent {
                        source_class: source_class.as_str().to_owned(),
                    },
                    IngressAllowance::OutboundProjected { capability_kinds } => {
                        IngressWireItem::McpOutbound {
                            capability_kinds: capability_kinds
                                .iter()
                                .map(|kind| kind.as_str().to_owned())
                                .collect(),
                        }
                    }
                    IngressAllowance::InboundServerAllow { server_allowlist } => {
                        IngressWireItem::McpInboundRead {
                            server_allowlist: server_allowlist
                                .iter()
                                .map(|id| id.as_str().to_owned())
                                .collect(),
                        }
                    }
                })
                .collect(),
        }
    }
}

fn decode_ingress(value: serde_json::Value) -> Result<Vec<IngressAllowance>, IdentityError> {
    let wire: IngressWire = serde_json::from_value(value)
        .map_err(|error| IdentityError::Conflict(format!("ingress decode: {error}")))?;
    wire.items
        .into_iter()
        .map(|item| match item {
            IngressWireItem::ApiEvent { source_class } => Ok(IngressAllowance::ApiEvent {
                source_class: SourceClass::parse(source_class)?,
            }),
            IngressWireItem::McpOutbound { capability_kinds } => {
                Ok(IngressAllowance::OutboundProjected {
                    capability_kinds: capability_kinds
                        .into_iter()
                        .map(|kind| ProjectedCapabilityKind::parse(&kind))
                        .collect::<Result<Vec<_>, _>>()?,
                })
            }
            IngressWireItem::McpInboundRead { server_allowlist } => {
                Ok(IngressAllowance::InboundServerAllow {
                    server_allowlist: server_allowlist
                        .into_iter()
                        .map(ServerAllowId::parse)
                        .collect::<Result<Vec<_>, _>>()?,
                })
            }
        })
        .collect()
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
                    action_ids: grant.actions().iter().map(|id| id.to_string()).collect(),
                    delegation_id: grant.id().to_string(),
                    expires_at: grant.expires_at().get() / 1_000_000,
                    not_before: grant.not_before().get() / 1_000_000,
                    resource_ids: grant.resources().iter().map(|id| id.to_string()).collect(),
                    workload_ids: grant.workloads().iter().map(|id| id.to_string()).collect(),
                })
                .collect(),
        }
    }
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
