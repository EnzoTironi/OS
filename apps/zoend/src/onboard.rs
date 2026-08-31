use std::sync::Arc;

use axum::{
    Router,
    extract::{Path, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use zoen_adapters::PostgresIdentityStore;
use zoen_core::IdentityError;

use crate::identity_admin_auth::identity_error_response;

pub fn router(identity: PostgresIdentityStore) -> Router {
    Router::new()
        .route("/onboard/{token}", get(get_onboard))
        .route("/onboard/{token}/confirm", post(confirm_onboard))
        .with_state(Arc::new(identity))
}

async fn get_onboard(
    State(identity): State<Arc<PostgresIdentityStore>>,
    Path(token): Path<String>,
) -> Response {
    match identity.lookup_onboard_token(&token).await {
        Ok(row) if row.consumed || row.expired => onboard_missing(),
        Ok(_) => onboard_page(&token),
        Err(IdentityError::InviteNotFound) => onboard_missing(),
        Err(error) => identity_error_response(&error),
    }
}

async fn confirm_onboard(
    State(identity): State<Arc<PostgresIdentityStore>>,
    Path(token): Path<String>,
) -> Response {
    let row = match identity.lookup_onboard_token(&token).await {
        Ok(row) => row,
        Err(IdentityError::InviteNotFound) => return onboard_missing(),
        Err(error) => return identity_error_response(&error),
    };
    if row.consumed {
        return identity_error_response(&IdentityError::AlreadyConsumed);
    }
    if row.expired {
        return identity_error_response(&IdentityError::InviteExpired);
    }
    match identity.complete_onboard(row.subject).await {
        Ok(_) => {
            let _ = identity.consume_onboard_token(&token).await;
            confirmed_page()
        }
        Err(IdentityError::AlreadyConsumed) => {
            let _ = identity.consume_onboard_token(&token).await;
            identity_error_response(&IdentityError::AlreadyConsumed)
        }
        Err(error) => identity_error_response(&error),
    }
}

fn onboard_page(token: &str) -> Response {
    let safe = html_attr(token);
    html(
        StatusCode::OK,
        format!(
            "<!doctype html><html lang=\"pt\"><meta charset=\"utf-8\"><title>Zoen</title><body>\
<p>Confirmar sua conta e continuar.</p>\
<form method=\"post\" action=\"/onboard/{safe}/confirm\">\
<button type=\"submit\">Continuar</button>\
</form></body></html>"
        ),
    )
}

fn confirmed_page() -> Response {
    html(
        StatusCode::OK,
        "<!doctype html><html lang=\"pt\"><meta charset=\"utf-8\"><title>Zoen</title><body>\
<p>Pronto. Volta pra conversa — WhatsApp, Telegram, ou o terminal.</p>\
</body></html>"
            .to_owned(),
    )
}

fn onboard_missing() -> Response {
    html(
        StatusCode::NOT_FOUND,
        "<!doctype html><html lang=\"pt\"><meta charset=\"utf-8\"><title>Zoen</title><body>\
<p>Este convite não vale mais.</p>\
</body></html>"
            .to_owned(),
    )
}

fn html(status: StatusCode, body: String) -> Response {
    let mut headers = HeaderMap::new();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("text/html; charset=utf-8"),
    );
    (status, headers, body).into_response()
}

fn html_attr(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}
