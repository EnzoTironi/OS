use std::collections::HashSet;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use axum::http::{HeaderMap, HeaderName, StatusCode};
use base64::Engine as _;
use base64::engine::general_purpose::STANDARD;
use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};
use sha2_hmac::Sha256 as HmacSha256Hash;

const MAX_SKEW_SECS: i64 = 5 * 60;

type HmacSha256 = Hmac<HmacSha256Hash>;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum IngressAuthError {
    MissingSecret,
    MissingHeaders,
    StaleTimestamp,
    BadSignature,
    Replay,
    StoreFailure,
}

impl IngressAuthError {
    pub fn status(self) -> StatusCode {
        match self {
            Self::MissingSecret | Self::StoreFailure => StatusCode::SERVICE_UNAVAILABLE,
            Self::MissingHeaders | Self::StaleTimestamp | Self::BadSignature | Self::Replay => {
                StatusCode::UNAUTHORIZED
            }
        }
    }

    pub fn reason(self) -> &'static str {
        match self {
            Self::MissingSecret => "whatsapp_ingress_secret_missing",
            Self::MissingHeaders => "whatsapp_ingress_headers_missing",
            Self::StaleTimestamp => "whatsapp_ingress_timestamp_stale",
            Self::BadSignature => "whatsapp_ingress_signature_invalid",
            Self::Replay => "whatsapp_ingress_replay",
            Self::StoreFailure => "whatsapp_ingress_replay_store",
        }
    }
}

/// Process-local in-flight lock. Durable commit lives in `ingress_replay`.
#[derive(Debug)]
pub struct ReplayGate {
    inflight: Mutex<HashSet<String>>,
}

impl ReplayGate {
    pub fn new() -> Self {
        Self {
            inflight: Mutex::new(HashSet::new()),
        }
    }

    pub fn begin(&self, webhook_id: &str) -> Result<(), IngressAuthError> {
        let mut guard = self.inflight.lock().expect("ingress replay lock");
        if !guard.insert(webhook_id.to_owned()) {
            return Err(IngressAuthError::Replay);
        }
        Ok(())
    }

    pub fn release(&self, webhook_id: &str) {
        self.inflight
            .lock()
            .expect("ingress replay lock")
            .remove(webhook_id);
    }
}

/// HMAC-only Standard Webhooks check. Replay is a store, not this function.
pub fn verify_whatsapp_ingress(
    secret: Option<&str>,
    headers: &HeaderMap,
    raw_body: &[u8],
    now: SystemTime,
) -> Result<String, IngressAuthError> {
    let Some(secret) = secret.map(str::trim).filter(|value| !value.is_empty()) else {
        return Err(IngressAuthError::MissingSecret);
    };
    let webhook_id = header(headers, "webhook-id").ok_or(IngressAuthError::MissingHeaders)?;
    let timestamp = header(headers, "webhook-timestamp").ok_or(IngressAuthError::MissingHeaders)?;
    let signature = header(headers, "webhook-signature").ok_or(IngressAuthError::MissingHeaders)?;
    let timestamp_secs: i64 = timestamp
        .parse()
        .map_err(|_| IngressAuthError::StaleTimestamp)?;
    let now_secs = now
        .duration_since(UNIX_EPOCH)
        .map(|duration| i64::try_from(duration.as_secs()).unwrap_or(i64::MAX))
        .unwrap_or(0);
    if now_secs.abs_diff(timestamp_secs) > MAX_SKEW_SECS.unsigned_abs() {
        return Err(IngressAuthError::StaleTimestamp);
    }
    let key = decode_whsec(secret).ok_or(IngressAuthError::BadSignature)?;
    let signed = signed_content(&webhook_id, &timestamp, raw_body);
    let expected = hmac_sha256(&key, &signed).ok_or(IngressAuthError::BadSignature)?;
    if !signature_matches(&signature, &expected) {
        return Err(IngressAuthError::BadSignature);
    }
    Ok(webhook_id)
}

fn signed_content(webhook_id: &str, timestamp: &str, raw_body: &[u8]) -> Vec<u8> {
    let mut signed = Vec::with_capacity(webhook_id.len() + timestamp.len() + raw_body.len() + 2);
    signed.extend_from_slice(webhook_id.as_bytes());
    signed.push(b'.');
    signed.extend_from_slice(timestamp.as_bytes());
    signed.push(b'.');
    signed.extend_from_slice(raw_body);
    signed
}

fn decode_whsec(secret: &str) -> Option<Vec<u8>> {
    let stripped = secret.strip_prefix("whsec_").unwrap_or(secret);
    let key = STANDARD.decode(stripped).ok()?;
    if key.is_empty() {
        return None;
    }
    Some(key)
}

fn hmac_sha256(key: &[u8], message: &[u8]) -> Option<[u8; 32]> {
    let mut mac = HmacSha256::new_from_slice(key).ok()?;
    mac.update(message);
    Some(mac.finalize().into_bytes().into())
}

fn signature_matches(header: &str, expected: &[u8; 32]) -> bool {
    let mut matched = false;
    for candidate in header.split(' ') {
        let Some(provided) = candidate.strip_prefix("v1,") else {
            continue;
        };
        let Ok(bytes) = STANDARD.decode(provided) else {
            continue;
        };
        if constant_time_eq(&bytes, expected) {
            matched = true;
        }
    }
    matched
}

pub fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    let left_hash = Sha256::digest(left);
    let right_hash = Sha256::digest(right);
    let mut diff = 0u8;
    for (a, b) in left_hash.iter().zip(right_hash.iter()) {
        diff |= a ^ b;
    }
    diff == 0 && left.len() == right.len()
}

fn header(headers: &HeaderMap, name: &'static str) -> Option<String> {
    let key = HeaderName::from_static(name);
    headers
        .get(&key)
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

#[cfg(test)]
mod tests {
    use std::time::{Duration, SystemTime, UNIX_EPOCH};

    use axum::http::{HeaderMap, HeaderValue};
    use base64::Engine as _;
    use base64::engine::general_purpose::STANDARD;

    use super::{
        IngressAuthError, ReplayGate, decode_whsec, hmac_sha256, signed_content,
        verify_whatsapp_ingress,
    };

    const SECRET: &str = "whsec_dGVzdC1zZWNyZXQtZml4dHVyZS0zMg==";

    fn sign_whatsapp_ingress(
        secret: &str,
        webhook_id: &str,
        timestamp_secs: i64,
        raw_body: &[u8],
    ) -> Result<(String, String, String), IngressAuthError> {
        let key = decode_whsec(secret).ok_or(IngressAuthError::BadSignature)?;
        let timestamp = timestamp_secs.to_string();
        let signed = signed_content(webhook_id, &timestamp, raw_body);
        let digest = hmac_sha256(&key, &signed).ok_or(IngressAuthError::BadSignature)?;
        Ok((
            webhook_id.to_owned(),
            timestamp,
            format!("v1,{}", STANDARD.encode(digest)),
        ))
    }

    fn headers(id: &str, timestamp: &str, signature: &str) -> HeaderMap {
        let mut map = HeaderMap::new();
        map.insert("webhook-id", HeaderValue::from_str(id).expect("id"));
        map.insert(
            "webhook-timestamp",
            HeaderValue::from_str(timestamp).expect("ts"),
        );
        map.insert(
            "webhook-signature",
            HeaderValue::from_str(signature).expect("sig"),
        );
        map
    }

    fn now_secs(secs: u64) -> SystemTime {
        UNIX_EPOCH + Duration::from_secs(secs)
    }

    #[test]
    fn missing_secret_is_unavailable() {
        let error =
            verify_whatsapp_ingress(None, &HeaderMap::new(), b"{}", now_secs(1_700_000_000))
                .expect_err("secret");
        assert_eq!(error, IngressAuthError::MissingSecret);
        assert_eq!(error.status(), axum::http::StatusCode::SERVICE_UNAVAILABLE);
    }

    #[test]
    fn valid_signature_is_pure_and_replay_is_the_gate() {
        let body = br#"{"body":"oi"}"#;
        let (id, timestamp, signature) =
            sign_whatsapp_ingress(SECRET, "msg_1", 1_700_000_000, body).expect("sign");
        let accepted = verify_whatsapp_ingress(
            Some(SECRET),
            &headers(&id, &timestamp, &signature),
            body,
            now_secs(1_700_000_000),
        )
        .expect("verify");
        assert_eq!(accepted, "msg_1");
        let again = verify_whatsapp_ingress(
            Some(SECRET),
            &headers(&id, &timestamp, &signature),
            body,
            now_secs(1_700_000_010),
        )
        .expect("hmac is pure");
        assert_eq!(again, "msg_1");

        let gate = ReplayGate::new();
        gate.begin("msg_1").expect("first inflight");
        assert_eq!(gate.begin("msg_1"), Err(IngressAuthError::Replay));
        gate.release("msg_1");
        gate.begin("msg_1").expect("released");
    }

    #[test]
    fn forged_and_stale_signatures_fail_closed() {
        let body = br#"{"body":"oi"}"#;
        let (id, timestamp, _signature) =
            sign_whatsapp_ingress(SECRET, "msg_2", 1_700_000_000, body).expect("sign");
        let forged = verify_whatsapp_ingress(
            Some(SECRET),
            &headers(
                &id,
                &timestamp,
                "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
            ),
            body,
            now_secs(1_700_000_000),
        )
        .expect_err("forged");
        assert_eq!(forged, IngressAuthError::BadSignature);

        let stale = verify_whatsapp_ingress(
            Some(SECRET),
            &headers(
                &id,
                "100",
                "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
            ),
            body,
            now_secs(1_700_000_000),
        )
        .expect_err("stale");
        assert_eq!(stale, IngressAuthError::StaleTimestamp);
    }
}
