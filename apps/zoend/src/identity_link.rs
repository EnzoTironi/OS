use std::{sync::Arc, time::Duration};

use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{Html, IntoResponse, Response},
    routing::{get, post},
};
use serde::Deserialize;
use zoen_adapters::PostgresIdentityStore;
use zoen_core::{
    ChannelProvider, ExternalSubject, IdentityError, LinkIntentToken, OpaqueSessionToken,
};

use crate::{
    identity_admin_auth::{
        IdentityAdminActor, authenticate_identity_admin, forbidden, identity_error_response,
    },
    session::SessionExchange,
};

const DEFAULT_LINK_INTENT_TTL_SECONDS: u64 = 15 * 60;
const MAX_LINK_INTENT_TTL_SECONDS: u64 = 24 * 60 * 60;

#[derive(Clone)]
pub struct IdentityLinkState {
    pub admin_token: Option<String>,
    pub identity: PostgresIdentityStore,
    pub public_origin: String,
    pub sessions: SessionExchange,
}

pub fn router(state: IdentityLinkState) -> Router {
    Router::new()
        .route("/link", get(link_page))
        .route("/identity/link-intents", post(issue_link_intent))
        .route("/identity/link-intents/confirm", post(confirm_link_intent))
        .with_state(Arc::new(state))
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct IssueLinkIntentBody {
    provider: String,
    subject_key: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ConfirmLinkIntentBody {
    token: String,
}

async fn issue_link_intent(
    State(state): State<Arc<IdentityLinkState>>,
    headers: HeaderMap,
    Json(body): Json<IssueLinkIntentBody>,
) -> Response {
    let authorization = header_text(&headers, header::AUTHORIZATION);
    let Some(actor) =
        authenticate_identity_admin(&state.sessions, state.admin_token.as_deref(), authorization)
            .await
    else {
        return unauthorized();
    };
    if !matches!(actor, IdentityAdminActor::Machine) {
        return forbidden();
    }
    let provider = match ChannelProvider::parse(&body.provider) {
        Ok(provider) => provider,
        Err(error) => return identity_error_response(&error),
    };
    let subject = match ExternalSubject::new(provider, body.subject_key) {
        Ok(subject) => subject,
        Err(error) => return identity_error_response(&error),
    };
    if let Err(error) =
        subject.reject_if_whatsapp_door(std::env::var("ZOEN_WHATSAPP_DOOR_E164").ok().as_deref())
    {
        return identity_error_response(&error);
    }
    match state
        .identity
        .issue_link_intent(subject, link_intent_ttl())
        .await
    {
        Ok(intent) => (
            StatusCode::CREATED,
            Json(serde_json::json!({
                "bindingId": intent.binding_id.as_str(),
                "expiresAtMicros": intent.expires_at.get(),
                "href": format!("{}/link#token={}", state.public_origin, intent.token.as_str()),
                "intentId": intent.intent_id.as_str(),
                "token": intent.token.as_str(),
            })),
        )
            .into_response(),
        Err(error) => identity_error_response(&error),
    }
}

async fn confirm_link_intent(
    State(state): State<Arc<IdentityLinkState>>,
    headers: HeaderMap,
    Json(body): Json<ConfirmLinkIntentBody>,
) -> Response {
    if header_text(&headers, header::ORIGIN) != Some(state.public_origin.as_str()) {
        return (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({"error": "link_origin_forbidden"})),
        )
            .into_response();
    }
    if headers.contains_key(header::AUTHORIZATION) {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "link_authorization_forbidden"})),
        )
            .into_response();
    }
    let session_token = match better_auth_session_cookie(&headers) {
        Ok(token) => token,
        Err(error) => return identity_error_response(&error),
    };
    let session = match state.sessions.verify_door_token(&session_token).await {
        Ok(session) => session,
        Err(error) => return identity_error_response(&error),
    };
    let token = match LinkIntentToken::parse(body.token) {
        Ok(token) => token,
        Err(error) => return identity_error_response(&error),
    };
    match state.identity.confirm_link_intent(&token, &session).await {
        Ok(confirmed) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "bindingId": confirmed.binding_id.as_str(),
                "intentId": confirmed.intent_id.as_str(),
                "receiptId": confirmed.receipt_id.as_str(),
                "sourceAccountId": confirmed.source_account_id.as_str(),
                "sourceAccountPreserved": confirmed.source_preserved,
                "targetAccountId": confirmed.target_account_id.as_str(),
            })),
        )
            .into_response(),
        Err(error) => identity_error_response(&error),
    }
}

async fn link_page() -> Response {
    let mut response = Html(LINK_PAGE).into_response();
    let headers = response.headers_mut();
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    headers.insert(
        header::CONTENT_SECURITY_POLICY,
        HeaderValue::from_static(
            "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
        ),
    );
    response
}

fn header_text(headers: &HeaderMap, name: header::HeaderName) -> Option<&str> {
    headers.get(name)?.to_str().ok()
}

fn better_auth_session_cookie(headers: &HeaderMap) -> Result<OpaqueSessionToken, IdentityError> {
    let mut token: Option<&str> = None;
    for header_value in headers.get_all(header::COOKIE) {
        let raw = header_value
            .to_str()
            .map_err(|_| IdentityError::Unauthenticated)?;
        for pair in raw.split(';') {
            let Some((name, value)) = pair.trim().split_once('=') else {
                continue;
            };
            if name != "better-auth.session_token" && name != "__Secure-better-auth.session_token" {
                continue;
            }
            if token.replace(value).is_some() {
                return Err(IdentityError::Unauthenticated);
            }
        }
    }
    OpaqueSessionToken::parse(token.ok_or(IdentityError::Unauthenticated)?.to_owned())
}

fn link_intent_ttl() -> Duration {
    let configured = std::env::var("ZOEN_LINK_INTENT_TTL_SECONDS")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .filter(|seconds| *seconds > 0 && *seconds <= MAX_LINK_INTENT_TTL_SECONDS);
    let seconds = match configured {
        Some(seconds) => seconds,
        None => DEFAULT_LINK_INTENT_TTL_SECONDS,
    };
    Duration::from_secs(seconds)
}

fn unauthorized() -> Response {
    (
        StatusCode::UNAUTHORIZED,
        Json(serde_json::json!({"error": "unauthenticated"})),
    )
        .into_response()
}

const LINK_PAGE: &str = r#"<!doctype html>
<html lang="pt"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Zoen</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:26em;margin:3rem auto;padding:0 1rem}label{display:block;margin:.75rem 0}input{box-sizing:border-box;font:inherit;padding:.55rem;width:100%}button{font:inherit;padding:.55rem .9rem}[role=alert]{color:#b00020}</style>
<body><p><strong>Zoen</strong></p><p id="status">Conferindo este vínculo…</p>
<form id="signin" hidden><p>Entra para ligar esta conversa à sua conta.</p><label>Email <input name="email" type="email" autocomplete="username" required></label><label>Senha <input name="password" type="password" autocomplete="current-password" required></label><button type="submit">Entrar e confirmar</button></form>
<p id="error" role="alert" hidden></p><script>
const statusNode=document.getElementById("status");const errorNode=document.getElementById("error");const form=document.getElementById("signin");
const fragmentToken=new URLSearchParams(location.hash.slice(1)).get("token");if(fragmentToken){sessionStorage.setItem("zoen.link-token",fragmentToken);history.replaceState(null,"",location.pathname)}
const token=()=>sessionStorage.getItem("zoen.link-token");
function fail(message){statusNode.hidden=true;errorNode.textContent=message;errorNode.hidden=false}
async function confirmLink(){const value=token();if(!value){fail("Este link não vale mais.");return}const response=await fetch("/identity/link-intents/confirm",{method:"POST",credentials:"include",headers:{"content-type":"application/json"},body:JSON.stringify({token:value})});if(response.ok){sessionStorage.removeItem("zoen.link-token");form.hidden=true;errorNode.hidden=true;statusNode.hidden=false;statusNode.textContent="Pronto. Esta conversa agora reconhece você.";return}if(response.status===401){statusNode.textContent="Entra para confirmar.";form.hidden=false;return}fail(response.status===409?"Este link já foi usado ou expirou.":"Não deu para confirmar agora.")}
form.addEventListener("submit",async event=>{event.preventDefault();const body={email:form.email.value,password:form.password.value,callbackURL:"/link"};const response=await fetch("/api/auth/sign-in/email",{method:"POST",credentials:"include",headers:{"content-type":"application/json"},body:JSON.stringify(body)});if(!response.ok){fail("Email ou senha errados. Confere e tenta de novo.");return}form.hidden=true;await confirmLink()});
confirmLink().catch(()=>fail("Não deu para confirmar agora."));
</script></body></html>"#;
