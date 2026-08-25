use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use zoen_adapters::PostgresIdentityStore;
use zoen_core::{
    ChannelProvider, ExternalSubject, IdentityError, VerifiedOidcSubject, ZoenAccountId,
};

use crate::auth::SessionRegistry;
use crate::ingress_hmac::constant_time_eq;

#[derive(Clone, Debug)]
pub enum IdentityAdminActor {
    Machine,
    Oidc(VerifiedOidcSubject),
}

pub fn authenticate_identity_admin(
    sessions: &SessionRegistry,
    admin_token: Option<&str>,
    authorization: Option<&str>,
) -> Option<IdentityAdminActor> {
    if machine_token_matches(admin_token, authorization) {
        return Some(IdentityAdminActor::Machine);
    }
    sessions
        .verify_bearer(authorization)
        .ok()
        .map(IdentityAdminActor::Oidc)
}

fn machine_token_matches(admin_token: Option<&str>, authorization: Option<&str>) -> bool {
    let Some(expected) = admin_token.map(str::trim).filter(|value| !value.is_empty()) else {
        return false;
    };
    let Some(provided) = authorization.and_then(|value| value.strip_prefix("Bearer ")) else {
        return false;
    };
    constant_time_eq(expected.as_bytes(), provided.as_bytes())
}

pub fn require_machine(actor: &IdentityAdminActor) -> Option<Response> {
    match actor {
        IdentityAdminActor::Machine => None,
        IdentityAdminActor::Oidc(_) => Some(forbidden()),
    }
}

pub async fn require_account(
    identity: &PostgresIdentityStore,
    actor: &IdentityAdminActor,
    account_id: &ZoenAccountId,
) -> Option<Response> {
    match actor {
        IdentityAdminActor::Machine => None,
        IdentityAdminActor::Oidc(verified) => {
            let subject =
                match ExternalSubject::new(ChannelProvider::WebOidc, verified.subject.clone()) {
                    Ok(subject) => subject,
                    Err(error) => return Some(identity_error_response(error)),
                };
            match identity.snapshot_for_verified_subject(&subject).await {
                Ok((_, snapshot)) if snapshot.account.id == *account_id => None,
                Ok(_) => Some(forbidden()),
                Err(error) => Some(identity_error_response(error)),
            }
        }
    }
}

pub fn forbidden() -> Response {
    (
        StatusCode::FORBIDDEN,
        Json(serde_json::json!({"error": "identity_admin_forbidden"})),
    )
        .into_response()
}

pub fn identity_error_response(error: IdentityError) -> Response {
    let status = match error {
        IdentityError::Unauthenticated => StatusCode::UNAUTHORIZED,
        IdentityError::SubjectUnbound => StatusCode::NOT_FOUND,
        IdentityError::AccountNotFound
        | IdentityError::BindingNotFound
        | IdentityError::InviteNotFound
        | IdentityError::MembershipNotFound => StatusCode::NOT_FOUND,
        IdentityError::AlreadyBound
        | IdentityError::AlreadyConsumed
        | IdentityError::InviteExpired
        | IdentityError::MembershipInactive
        | IdentityError::AccountMerged { .. }
        | IdentityError::InviteTenantMismatch
        | IdentityError::Conflict(_)
        | IdentityError::PersonalExists => StatusCode::CONFLICT,
        _ => StatusCode::BAD_REQUEST,
    };
    (
        status,
        Json(serde_json::json!({ "error": error.to_string() })),
    )
        .into_response()
}

#[cfg(test)]
mod tests {
    use super::{IdentityAdminActor, require_machine};

    #[test]
    fn oidc_actor_cannot_use_machine_only_routes() {
        let actor = IdentityAdminActor::Oidc(zoen_core::VerifiedOidcSubject {
            actor_id: None,
            audience: "zoend".to_owned(),
            delegation_hint: None,
            expires_at: zoen_core::TimestampMicros::new(1),
            issuer: "https://issuer.test".to_owned(),
            principal_hint: None,
            requested_tenant_hint: None,
            subject: "user-1".to_owned(),
            workload_hint: None,
        });
        assert!(require_machine(&actor).is_some());
        assert!(require_machine(&IdentityAdminActor::Machine).is_none());
    }
}
