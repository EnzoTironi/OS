#[cfg(test)]
use std::collections::HashSet;
use std::sync::Arc;
#[cfg(test)]
use std::sync::Mutex;
use std::time::{Duration, SystemTime};

use axum::Json;
use axum::Router;
use axum::body::Bytes;
use axum::extract::State;
use axum::http::{HeaderMap, HeaderName, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use reqwest::Client;
use serde_json::json;
use zoen_adapters::PostgresIngressReplayStore;
#[cfg(test)]
use zoen_adapters::ZOEND_INGRESS_REPLAY_NAMESPACE;

use crate::ingress_hmac::{self, IngressAuthError, ReplayGate};

#[derive(Clone)]
enum HopReplayStore {
    Postgres(PostgresIngressReplayStore),
    #[cfg(test)]
    Memory(MemoryIngressReplay),
}

#[cfg(test)]
#[derive(Clone, Default)]
struct MemoryIngressReplay {
    keys: Arc<Mutex<HashSet<String>>>,
}

impl HopReplayStore {
    async fn contains(&self, webhook_id: &str) -> Result<bool, IngressAuthError> {
        match self {
            Self::Postgres(store) => store
                .contains(webhook_id)
                .await
                .map_err(|_| IngressAuthError::StoreFailure),
            #[cfg(test)]
            Self::Memory(store) => Ok(store.contains(webhook_id)),
        }
    }

    async fn claim(&self, webhook_id: &str) -> Result<bool, IngressAuthError> {
        match self {
            Self::Postgres(store) => store
                .claim(webhook_id)
                .await
                .map_err(|_| IngressAuthError::StoreFailure),
            #[cfg(test)]
            Self::Memory(store) => Ok(store.claim(webhook_id)),
        }
    }
}

#[cfg(test)]
impl MemoryIngressReplay {
    fn namespaced(webhook_id: &str) -> String {
        format!("{ZOEND_INGRESS_REPLAY_NAMESPACE}{webhook_id}")
    }

    fn contains(&self, webhook_id: &str) -> bool {
        self.keys
            .lock()
            .expect("ingress replay lock")
            .contains(&Self::namespaced(webhook_id))
    }

    fn claim(&self, webhook_id: &str) -> bool {
        self.keys
            .lock()
            .expect("ingress replay lock")
            .insert(Self::namespaced(webhook_id))
    }
}

#[derive(Clone)]
pub struct IngressState {
    pub gateway_url: Option<String>,
    pub client: Client,
    pub whatsapp_secret: Option<String>,
    pub replay: Arc<ReplayGate>,
    replay_store: HopReplayStore,
}

pub fn from_env(replay_store: PostgresIngressReplayStore) -> IngressState {
    let gateway_url = std::env::var("ZOEN_MESSAGING_GATEWAY_URL")
        .ok()
        .map(|value| value.trim().trim_end_matches('/').to_owned())
        .filter(|value| !value.is_empty());
    let whatsapp_secret = std::env::var("ZOEN_WHATSAPP_INGRESS_SECRET")
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty());
    IngressState {
        client: Client::new(),
        gateway_url,
        replay: Arc::new(ReplayGate::new()),
        replay_store: HopReplayStore::Postgres(replay_store),
        whatsapp_secret,
    }
}

pub fn router(state: IngressState) -> Router {
    Router::new()
        .route("/channels/whatsapp/advertise", get(whatsapp_advertise))
        .route("/channels/whatsapp/inbound", post(whatsapp_inbound))
        .route("/channels/telegram/advertise", get(telegram_advertise))
        .route("/channels/telegram/inbound", post(telegram_inbound))
        .with_state(Arc::new(state))
}

async fn whatsapp_advertise(State(state): State<Arc<IngressState>>) -> Response {
    proxy(
        &state,
        reqwest::Method::GET,
        "/advertise",
        None,
        None,
        None,
        "whatsapp_not_advertised",
    )
    .await
}

async fn whatsapp_inbound(
    State(state): State<Arc<IngressState>>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let webhook_id = match ingress_hmac::verify_whatsapp_ingress(
        state.whatsapp_secret.as_deref(),
        &headers,
        &body,
        SystemTime::now(),
    ) {
        Ok(webhook_id) => webhook_id,
        Err(error) => return ingress_denied(error),
    };
    if let Err(error) = state.replay.begin(&webhook_id) {
        return ingress_denied(error);
    }
    match state.replay_store.contains(&webhook_id).await {
        Ok(true) => {
            state.replay.release(&webhook_id);
            return ingress_denied(IngressAuthError::Replay);
        }
        Ok(false) => {}
        Err(error) => {
            state.replay.release(&webhook_id);
            return ingress_denied(error);
        }
    }
    let response = proxy(
        &state,
        reqwest::Method::POST,
        "/inbound",
        Some(body),
        None,
        Some(&headers),
        "whatsapp_not_advertised",
    )
    .await;
    let succeeded = response.status().is_success();
    if succeeded {
        match state.replay_store.claim(&webhook_id).await {
            Ok(_) => {}
            Err(error) => {
                state.replay.release(&webhook_id);
                return ingress_denied(error);
            }
        }
    }
    state.replay.release(&webhook_id);
    response
}

async fn telegram_advertise(State(state): State<Arc<IngressState>>) -> Response {
    proxy(
        &state,
        reqwest::Method::GET,
        "/advertise",
        None,
        None,
        None,
        "telegram_not_advertised",
    )
    .await
}

async fn telegram_inbound(
    State(state): State<Arc<IngressState>>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let secret = headers
        .get("x-telegram-bot-api-secret-token")
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);
    proxy(
        &state,
        reqwest::Method::POST,
        "/inbound",
        Some(body),
        secret.as_deref(),
        None,
        "telegram_not_advertised",
    )
    .await
}

async fn proxy(
    state: &IngressState,
    method: reqwest::Method,
    path: &str,
    body: Option<Bytes>,
    secret_token: Option<&str>,
    inbound_headers: Option<&HeaderMap>,
    missing_error: &'static str,
) -> Response {
    let Some(base) = state.gateway_url.as_deref() else {
        return unavailable(missing_error, "messaging_gateway_url_missing");
    };
    let url = format!("{base}{path}");
    let mut request = state
        .client
        .request(method, url)
        .timeout(Duration::from_secs(15));
    if let Some(payload) = body {
        request = request
            .header("content-type", "application/json")
            .body(payload);
    }
    if let Some(secret) = secret_token {
        request = request.header("x-telegram-bot-api-secret-token", secret);
    }
    if let Some(headers) = inbound_headers {
        for name in ["webhook-id", "webhook-timestamp", "webhook-signature"] {
            if let Some(value) = headers.get(HeaderName::from_static(name)) {
                if let Ok(header) = HeaderValue::from_bytes(value.as_bytes()) {
                    request = request.header(name, header);
                }
            }
        }
    }
    match request.send().await {
        Ok(upstream) => {
            let status =
                StatusCode::from_u16(upstream.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
            let bytes = upstream.bytes().await.unwrap_or_default();
            Response::builder()
                .status(status)
                .header("content-type", "application/json")
                .body(axum::body::Body::from(bytes))
                .unwrap_or_else(|_| StatusCode::BAD_GATEWAY.into_response())
        }
        Err(_) => unavailable(missing_error, "messaging_gateway_unreachable"),
    }
}

fn ingress_denied(error: IngressAuthError) -> Response {
    (
        error.status(),
        Json(json!({
            "error": "whatsapp_ingress_denied",
            "reason": error.reason()
        })),
    )
        .into_response()
}

fn unavailable(error: &'static str, reason: &'static str) -> Response {
    (
        StatusCode::SERVICE_UNAVAILABLE,
        Json(json!({
            "error": error,
            "reason": reason
        })),
    )
        .into_response()
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};
    use std::time::{SystemTime, UNIX_EPOCH};

    use axum::Json;
    use axum::Router;
    use axum::routing::post;
    use reqwest::Client;
    use serde_json::{Value, json};
    use tokio::net::TcpListener;
    use zoen_adapters::ZOEND_INGRESS_REPLAY_NAMESPACE;

    use super::{HopReplayStore, IngressState, MemoryIngressReplay, router};
    use crate::ingress_hmac::{ReplayGate, sign_whatsapp_ingress};

    const SECRET: &str = "whsec_dGVzdC1zZWNyZXQtZml4dHVyZS0zMg==";
    const BODY: &[u8] = br#"{"body":"oi"}"#;

    #[tokio::test]
    async fn inbound_http_probes_fail_closed_and_namespace_replay() {
        let replay = MemoryIngressReplay::default();
        let forwarded_ids = Arc::new(Mutex::new(Vec::<String>::new()));
        let gateway_url = spawn_ok_gateway(forwarded_ids.clone()).await;
        let inbound = spawn_inbound(IngressState {
            client: Client::new(),
            gateway_url: Some(gateway_url),
            replay: Arc::new(ReplayGate::new()),
            replay_store: HopReplayStore::Memory(replay.clone()),
            whatsapp_secret: Some(SECRET.to_owned()),
        })
        .await;

        let missing = post_inbound(
            &spawn_inbound(IngressState {
                client: Client::new(),
                gateway_url: None,
                replay: Arc::new(ReplayGate::new()),
                replay_store: HopReplayStore::Memory(MemoryIngressReplay::default()),
                whatsapp_secret: None,
            })
            .await,
            None,
            BODY,
        )
        .await;
        assert_eq!(missing.0, reqwest::StatusCode::SERVICE_UNAVAILABLE);
        assert_eq!(missing.1["reason"], "whatsapp_ingress_secret_missing");

        let now = i64::try_from(
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("time")
                .as_secs(),
        )
        .expect("secs");
        let (id, timestamp, signature) =
            sign_whatsapp_ingress(SECRET, "msg_http", now, BODY).expect("sign");

        let forged = post_inbound(
            &inbound,
            Some((
                id.as_str(),
                timestamp.as_str(),
                "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
            )),
            BODY,
        )
        .await;
        assert_eq!(forged.0, reqwest::StatusCode::UNAUTHORIZED);
        assert_eq!(forged.1["reason"], "whatsapp_ingress_signature_invalid");

        let stale = post_inbound(
            &inbound,
            Some((id.as_str(), "100", signature.as_str())),
            BODY,
        )
        .await;
        assert_eq!(stale.0, reqwest::StatusCode::UNAUTHORIZED);
        assert_eq!(stale.1["reason"], "whatsapp_ingress_timestamp_stale");

        let accepted = post_inbound(
            &inbound,
            Some((id.as_str(), timestamp.as_str(), signature.as_str())),
            BODY,
        )
        .await;
        assert_eq!(accepted.0, reqwest::StatusCode::OK);
        assert_eq!(accepted.1["ok"], true);
        assert_eq!(forwarded_ids.lock().expect("ids").as_slice(), ["msg_http"]);
        assert!(replay.contains("msg_http"));
        assert!(!replay.keys.lock().expect("keys").contains("msg_http"));
        assert!(
            replay
                .keys
                .lock()
                .expect("keys")
                .contains(&format!("{ZOEND_INGRESS_REPLAY_NAMESPACE}msg_http"))
        );

        let replayed = post_inbound(
            &inbound,
            Some((id.as_str(), timestamp.as_str(), signature.as_str())),
            BODY,
        )
        .await;
        assert_eq!(replayed.0, reqwest::StatusCode::UNAUTHORIZED);
        assert_eq!(replayed.1["reason"], "whatsapp_ingress_replay");
    }

    async fn spawn_inbound(state: IngressState) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind");
        let addr = listener.local_addr().expect("addr");
        tokio::spawn(async move {
            axum::serve(listener, router(state))
                .await
                .expect("serve inbound");
        });
        format!("http://{addr}")
    }

    async fn spawn_ok_gateway(forwarded_ids: Arc<Mutex<Vec<String>>>) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind");
        let addr = listener.local_addr().expect("addr");
        let app = Router::new().route(
            "/inbound",
            post({
                let forwarded_ids = forwarded_ids.clone();
                move |headers: axum::http::HeaderMap| {
                    let forwarded_ids = forwarded_ids.clone();
                    async move {
                        if let Some(id) = headers
                            .get("webhook-id")
                            .and_then(|value| value.to_str().ok())
                        {
                            forwarded_ids.lock().expect("ids").push(id.to_owned());
                        }
                        Json(json!({ "ok": true }))
                    }
                }
            }),
        );
        tokio::spawn(async move {
            axum::serve(listener, app).await.expect("serve gateway");
        });
        format!("http://{addr}")
    }

    async fn post_inbound(
        base: &str,
        signed: Option<(&str, &str, &str)>,
        body: &[u8],
    ) -> (reqwest::StatusCode, Value) {
        let mut request = Client::new()
            .post(format!("{base}/channels/whatsapp/inbound"))
            .header("content-type", "application/json")
            .body(body.to_vec());
        if let Some((id, timestamp, signature)) = signed {
            request = request
                .header("webhook-id", id)
                .header("webhook-timestamp", timestamp)
                .header("webhook-signature", signature);
        }
        let response = request.send().await.expect("post");
        let status = response.status();
        let value = response.json::<Value>().await.expect("json");
        (status, value)
    }
}
