use std::time::{SystemTime, UNIX_EPOCH};

use sqlx::postgres::PgRow;
use sqlx::{PgPool, Row};
use zoen_core::{
    AudienceClass, DigestRef, DurableEventId, ExternalSignal, ExternalSignalDraft,
    ExternalSignalId, IdentityError, IngressAllowance, PrincipalId, SignalSourceIdentity,
    SignalTrustDisposition, SourceClass, TenantId, TimestampMicros, TrustedExecutionContext,
    WorkloadCredential, WorkloadCredentialId, WorkloadId,
};

#[derive(Clone)]
pub struct PostgresExternalSignalStore {
    pool: PgPool,
}

impl PostgresExternalSignalStore {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Idempotent on (tenant_id, durable_event_id). Replay returns prior row.
    pub async fn accept(
        &self,
        tec: &TrustedExecutionContext,
        credential: &WorkloadCredential,
        draft: ExternalSignalDraft,
    ) -> Result<(ExternalSignal, bool), IdentityError> {
        if tec.tenant_id() != &credential.tenant_id {
            return Err(IdentityError::Conflict(
                "TEC tenant does not match credential".to_owned(),
            ));
        }
        let allowed = credential.allowed_ingress.iter().any(|ingress| {
            matches!(
                ingress,
                IngressAllowance::ApiEvent { source_class }
                    if source_class.as_str() == draft.source.class.as_str()
            )
        });
        if !allowed {
            return Err(IdentityError::IngressNotAllowed);
        }

        let mut transaction = self.pool.begin().await.map_err(unavailable)?;
        let existing = sqlx::query(
            "SELECT signal_id, tenant_id, durable_event_id, source_class, source_external_id,
                    audience_class, payload_digest_ref, source_digest_ref,
                    (EXTRACT(EPOCH FROM received_at) * 1000000)::bigint AS received_at_micros,
                    workload_credential_id, workload_id, principal_id, trust_disposition
             FROM external_signals
             WHERE tenant_id = $1 AND durable_event_id = $2
             FOR UPDATE",
        )
        .bind(credential.tenant_id.as_str())
        .bind(draft.durable_event_id.as_str())
        .fetch_optional(&mut *transaction)
        .await
        .map_err(unavailable)?;
        if let Some(row) = existing {
            let signal = row_to_signal(&row)?;
            transaction.commit().await.map_err(unavailable)?;
            return Ok((signal, true));
        }

        let now = now_micros();
        let signal_id = new_signal_id();
        sqlx::query(
            "INSERT INTO external_signals (
                signal_id, tenant_id, durable_event_id, source_class, source_external_id,
                audience_class, payload_digest_ref, source_digest_ref, received_at,
                workload_credential_id, workload_id, principal_id, trust_disposition
             ) VALUES (
                $1, $2, $3, $4, $5,
                $6, $7, $8, to_timestamp($9::double precision / 1000000.0),
                $10, $11, $12, $13
             )",
        )
        .bind(signal_id.as_str())
        .bind(credential.tenant_id.as_str())
        .bind(draft.durable_event_id.as_str())
        .bind(draft.source.class.as_str())
        .bind(&draft.source.external_id)
        .bind(
            draft
                .source
                .audience_class
                .as_ref()
                .map(AudienceClass::as_str),
        )
        .bind(draft.payload_digest_ref.as_str())
        .bind(draft.source_digest_ref.as_str())
        .bind(now.get())
        .bind(credential.id.as_str())
        .bind(credential.workload_id.as_str())
        .bind(credential.principal_id.as_str())
        .bind(draft.trust_disposition.as_str())
        .execute(&mut *transaction)
        .await
        .map_err(unavailable)?;

        let signal = ExternalSignal {
            id: signal_id,
            durable_event_id: draft.durable_event_id,
            source: draft.source,
            payload_digest_ref: draft.payload_digest_ref,
            source_digest_ref: draft.source_digest_ref,
            received_at: now,
            workload_credential_id: credential.id.clone(),
            tenant_id: credential.tenant_id.clone(),
            workload_id: credential.workload_id.clone(),
            principal_id: credential.principal_id.clone(),
            trust_disposition: draft.trust_disposition,
        };
        transaction.commit().await.map_err(unavailable)?;
        Ok((signal, false))
    }
}

fn row_to_signal(row: &PgRow) -> Result<ExternalSignal, IdentityError> {
    let audience = match row.try_get::<Option<String>, _>("audience_class") {
        Ok(Some(value)) => Some(AudienceClass::parse(value)?),
        Ok(None) => None,
        Err(error) => return Err(unavailable(error)),
    };
    Ok(ExternalSignal {
        id: ExternalSignalId::parse(row_text(row, "signal_id")?)
            .map_err(|_| IdentityError::Conflict("invalid signal id".to_owned()))?,
        durable_event_id: DurableEventId::parse(row_text(row, "durable_event_id")?)
            .map_err(|_| IdentityError::Conflict("invalid durable event id".to_owned()))?,
        source: SignalSourceIdentity {
            class: SourceClass::parse(row_text(row, "source_class")?)?,
            external_id: row_text(row, "source_external_id")?,
            audience_class: audience,
        },
        payload_digest_ref: DigestRef::parse(row_text(row, "payload_digest_ref")?)
            .map_err(|error| IdentityError::Conflict(error.to_string()))?,
        source_digest_ref: DigestRef::parse(row_text(row, "source_digest_ref")?)
            .map_err(|error| IdentityError::Conflict(error.to_string()))?,
        received_at: TimestampMicros::new(row.try_get("received_at_micros").map_err(unavailable)?),
        workload_credential_id: WorkloadCredentialId::parse(row_text(
            row,
            "workload_credential_id",
        )?)
        .map_err(|_| IdentityError::Conflict("invalid credential id".to_owned()))?,
        tenant_id: TenantId::parse(row_text(row, "tenant_id")?)
            .map_err(|_| IdentityError::Conflict("invalid tenant".to_owned()))?,
        workload_id: WorkloadId::parse(row_text(row, "workload_id")?)
            .map_err(|_| IdentityError::Conflict("invalid workload".to_owned()))?,
        principal_id: PrincipalId::parse(row_text(row, "principal_id")?)
            .map_err(|_| IdentityError::Conflict("invalid principal".to_owned()))?,
        trust_disposition: SignalTrustDisposition::parse(&row_text(row, "trust_disposition")?)
            .map_err(|error| IdentityError::Conflict(error.to_string()))?,
    })
}

fn new_signal_id() -> ExternalSignalId {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    ExternalSignalId::parse(format!("wlsig.{nanos:x}")).expect("generated signal id")
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
