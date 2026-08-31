use std::{
    sync::Arc,
    time::{Duration, SystemTime},
};

use axum::{
    Json, Router,
    body::Bytes,
    extract::State,
    http::{HeaderMap, HeaderName, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use reqwest::Client;
use serde_json::json;
use zoen_adapters::PostgresIngressReplayStore;

use crate::ingress_hmac::{self, IngressAuthError, ReplayGate};

pub(crate) trait HopReplay: Clone + Send + Sync + 'static {
    fn contains(
        &self,
        webhook_id: &str,
    ) -> impl std::future::Future<Output = Result<bool, IngressAuthError>> + Send;
    fn claim(
        &self,
        webhook_id: &str,
    ) -> impl std::future::Future<Output = Result<bool, IngressAuthError>> + Send;
}

impl HopReplay for PostgresIngressReplayStore {
    async fn contains(&self, webhook_id: &str) -> Result<bool, IngressAuthError> {
        PostgresIngressReplayStore::contains(self, webhook_id)
            .await
            .map_err(|_| IngressAuthError::StoreFailure)
    }

    async fn claim(&self, webhook_id: &str) -> Result<bool, IngressAuthError> {
        PostgresIngressReplayStore::claim(self, webhook_id)
            .await
            .map_err(|_| IngressAuthError::StoreFailure)
    }
}

#[derive(Clone)]
pub struct IngressState<R> {
    pub gateway_url: Option<String>,
    pub client: Client,
    pub whatsapp_secret: Option<String>,
    pub replay: Arc<ReplayGate>,
    replay_store: R,
}

pub fn from_env(
    replay_store: PostgresIngressReplayStore,
) -> IngressState<PostgresIngressReplayStore> {
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
        replay_store,
        whatsapp_secret,
    }
}

pub(crate) fn router<R: HopReplay>(state: IngressState<R>) -> Router {
    Router::new()
        .route("/channels/whatsapp/advertise", get(whatsapp_advertise::<R>))
        .route("/channels/whatsapp/inbound", post(whatsapp_inbound::<R>))
        .route("/channels/telegram/advertise", get(telegram_advertise::<R>))
        .route("/channels/telegram/inbound", post(telegram_inbound::<R>))
        .with_state(Arc::new(state))
}

async fn whatsapp_advertise<R: HopReplay>(State(state): State<Arc<IngressState<R>>>) -> Response {
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

async fn whatsapp_inbound<R: HopReplay>(
    State(state): State<Arc<IngressState<R>>>,
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

async fn telegram_advertise<R: HopReplay>(State(state): State<Arc<IngressState<R>>>) -> Response {
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

async fn telegram_inbound<R: HopReplay>(
    State(state): State<Arc<IngressState<R>>>,
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

async fn proxy<R>(
    state: &IngressState<R>,
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
    use std::{
        collections::HashSet,
        sync::{Arc, Mutex},
        time::{SystemTime, UNIX_EPOCH},
    };

    use axum::{Json, Router, routing::post};
    use base64::{Engine as _, engine::general_purpose::STANDARD};
    use hmac::{Hmac, KeyInit, Mac};
    use reqwest::Client;
    use serde_json::{Value, json};
    use sha2::Sha256;
    use tokio::net::TcpListener;
    use zoen_adapters::ZOEND_INGRESS_REPLAY_NAMESPACE;

    use super::{HopReplay, IngressState, router};
    use crate::ingress_hmac::{IngressAuthError, ReplayGate};

    #[derive(Clone, Default)]
    struct MemoryIngressReplay {
        keys: Arc<Mutex<HashSet<String>>>,
    }

    impl MemoryIngressReplay {
        fn namespaced(webhook_id: &str) -> String {
            format!("{ZOEND_INGRESS_REPLAY_NAMESPACE}{webhook_id}")
        }

        fn persisted(&self, webhook_id: &str) -> bool {
            self.keys
                .lock()
                .expect("ingress replay lock")
                .contains(&Self::namespaced(webhook_id))
        }
    }

    impl HopReplay for MemoryIngressReplay {
        async fn contains(&self, webhook_id: &str) -> Result<bool, IngressAuthError> {
            Ok(self.persisted(webhook_id))
        }

        async fn claim(&self, webhook_id: &str) -> Result<bool, IngressAuthError> {
            Ok(self
                .keys
                .lock()
                .expect("ingress replay lock")
                .insert(Self::namespaced(webhook_id)))
        }
    }

    const SECRET: &str = "whsec_dGVzdC1zZWNyZXQtZml4dHVyZS0zMg==";
    const BODY: &[u8] = br#"{"body":"oi"}"#;

    fn sign_whatsapp_ingress(
        secret: &str,
        webhook_id: &str,
        timestamp_secs: i64,
        raw_body: &[u8],
    ) -> (String, String, String) {
        let stripped = secret.strip_prefix("whsec_").unwrap_or(secret);
        let key = STANDARD.decode(stripped).expect("secret");
        let timestamp = timestamp_secs.to_string();
        let mut mac = Hmac::<Sha256>::new_from_slice(&key).expect("hmac");
        mac.update(webhook_id.as_bytes());
        mac.update(b".");
        mac.update(timestamp.as_bytes());
        mac.update(b".");
        mac.update(raw_body);
        (
            webhook_id.to_owned(),
            timestamp,
            format!("v1,{}", STANDARD.encode(mac.finalize().into_bytes())),
        )
    }

    #[tokio::test]
    async fn inbound_http_probes_fail_closed_and_namespace_replay() {
        let replay = MemoryIngressReplay::default();
        let forwarded_ids = Arc::new(Mutex::new(Vec::<String>::new()));
        let gateway_url = spawn_ok_gateway(forwarded_ids.clone()).await;
        let inbound = spawn_inbound(IngressState {
            client: Client::new(),
            gateway_url: Some(gateway_url),
            replay: Arc::new(ReplayGate::new()),
            replay_store: replay.clone(),
            whatsapp_secret: Some(SECRET.to_owned()),
        })
        .await;

        let missing = post_inbound(
            &spawn_inbound(IngressState {
                client: Client::new(),
                gateway_url: None,
                replay: Arc::new(ReplayGate::new()),
                replay_store: MemoryIngressReplay::default(),
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
        let (id, timestamp, signature) = sign_whatsapp_ingress(SECRET, "msg_http", now, BODY);

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
        assert!(replay.persisted("msg_http"));
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

    #[tokio::test]
    async fn failed_proxy_does_not_claim_so_retry_can_succeed() {
        let replay = MemoryIngressReplay::default();
        let attempts = Arc::new(Mutex::new(0_u8));
        let gateway_url = spawn_failing_then_ok_gateway(attempts.clone()).await;
        let inbound = spawn_inbound(IngressState {
            client: Client::new(),
            gateway_url: Some(gateway_url),
            replay: Arc::new(ReplayGate::new()),
            replay_store: replay.clone(),
            whatsapp_secret: Some(SECRET.to_owned()),
        })
        .await;
        let now = i64::try_from(
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("time")
                .as_secs(),
        )
        .expect("secs");
        let (id, timestamp, signature) = sign_whatsapp_ingress(SECRET, "msg_retry", now, BODY);
        let signed = Some((id.as_str(), timestamp.as_str(), signature.as_str()));

        let failed = post_inbound(&inbound, signed, BODY).await;
        assert_eq!(failed.0, reqwest::StatusCode::BAD_GATEWAY);
        assert!(!replay.persisted("msg_retry"));

        let retried = post_inbound(&inbound, signed, BODY).await;
        assert_eq!(retried.0, reqwest::StatusCode::OK);
        assert!(replay.persisted("msg_retry"));
        assert_eq!(*attempts.lock().expect("attempts"), 2);
    }

    async fn spawn_inbound<R: HopReplay>(state: IngressState<R>) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind");
        let addr = listener.local_addr().expect("addr");
        tokio::spawn(async move {
            axum::serve(listener, router(state))
                .await
                .expect("serve inbound");
        });
        format!("http://{addr}")
    }

    async fn spawn_failing_then_ok_gateway(attempts: Arc<Mutex<u8>>) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind");
        let addr = listener.local_addr().expect("addr");
        let app = Router::new().route(
            "/inbound",
            post({
                let attempts = attempts.clone();
                move || {
                    let attempts = attempts.clone();
                    async move {
                        let mut count = attempts.lock().expect("attempts");
                        *count = count.saturating_add(1);
                        if *count == 1 {
                            (
                                axum::http::StatusCode::BAD_GATEWAY,
                                Json(json!({ "error": "upstream" })),
                            )
                        } else {
                            (axum::http::StatusCode::OK, Json(json!({ "ok": true })))
                        }
                    }
                }
            }),
        );
        tokio::spawn(async move {
            axum::serve(listener, app).await.expect("serve gateway");
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
