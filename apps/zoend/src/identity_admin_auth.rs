use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use sha2::{Digest, Sha256};
use zoen_adapters::PostgresIdentityStore;
use zoen_core::{
    AccountId, ChannelProvider, ExternalSubject, IdentityError, VerifiedSessionEvidence,
};

use crate::session::SessionExchange;

#[derive(Clone, Debug)]
pub enum IdentityAdminActor {
    Machine,
    Door(VerifiedSessionEvidence),
}

pub async fn authenticate_identity_admin(
    sessions: &SessionExchange,
    admin_token: Option<&str>,
    authorization: Option<&str>,
) -> Option<IdentityAdminActor> {
    if machine_token_matches(admin_token, authorization) {
        return Some(IdentityAdminActor::Machine);
    }
    sessions
        .verify_door(authorization)
        .await
        .ok()
        .map(IdentityAdminActor::Door)
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

fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    let left_hash = Sha256::digest(left);
    let right_hash = Sha256::digest(right);
    let mut diff = 0u8;
    for (a, b) in left_hash.iter().zip(right_hash.iter()) {
        diff |= a ^ b;
    }
    diff == 0 && left.len() == right.len()
}

pub fn require_machine(actor: &IdentityAdminActor) -> Option<Response> {
    match actor {
        IdentityAdminActor::Machine => None,
        IdentityAdminActor::Door(_) => Some(forbidden()),
    }
}

pub async fn require_account(
    identity: &PostgresIdentityStore,
    actor: &IdentityAdminActor,
    account_id: &AccountId,
) -> Option<Response> {
    match actor {
        IdentityAdminActor::Machine => None,
        IdentityAdminActor::Door(evidence) => {
            let subject = match ExternalSubject::new(
                ChannelProvider::AuthDoor,
                evidence.door_user_key.clone(),
            ) {
                Ok(subject) => subject,
                Err(error) => return Some(identity_error_response(&error)),
            };
            match identity.snapshot_for_verified_subject(&subject).await {
                Ok((_, snapshot)) if snapshot.account.id == *account_id => None,
                Ok(_) => Some(forbidden()),
                Err(error) => Some(identity_error_response(&error)),
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

pub fn identity_error_response(error: &IdentityError) -> Response {
    let status = match error {
        IdentityError::Unauthenticated | IdentityError::InvalidSessionToken => {
            StatusCode::UNAUTHORIZED
        }
        IdentityError::SubjectUnbound
        | IdentityError::MembershipNotFound
        | IdentityError::MembershipInactive => StatusCode::FORBIDDEN,
        IdentityError::AccountNotFound
        | IdentityError::BindingNotFound
        | IdentityError::InviteNotFound => StatusCode::NOT_FOUND,
        IdentityError::AlreadyBound
        | IdentityError::AlreadyConsumed
        | IdentityError::InviteExpired
        | IdentityError::AccountMerged { .. }
        | IdentityError::InviteWorldMismatch
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
