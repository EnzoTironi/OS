//! Readiness probes gating exact registration.
//!
//! Credential marker, zoend/Restate health, connector readiness, and the
//! handler HTTP/2 health plus artifact identity probes.

use std::{error::Error, fmt, time::Duration};

use serde_json::Value;

use super::{
    config::is_semantic_id,
    effect_artifact::{ZOEN_EFFECT_HANDLER_NAME, ZOEN_EFFECT_OWNER, ZOEN_EFFECT_SERVICE_NAME},
};

/// Probe failure; the reconciler reports it and retries next tick.
#[derive(Debug)]
pub struct ProbeError(pub String);

impl fmt::Display for ProbeError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl Error for ProbeError {}

/// Probe clients shared across ticks.
#[derive(Clone)]
pub struct Probes {
    http: reqwest::Client,
    http2: reqwest::Client,
}

impl Probes {
    /// Build probe clients.
    ///
    /// # Errors
    ///
    /// Returns [`ProbeError`] when an HTTP client cannot be built.
    pub fn new() -> Result<Self, ProbeError> {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_millis(2000))
            .build()
            .map_err(|error| ProbeError(error.to_string()))?;
        let http2 = reqwest::Client::builder()
            .http2_prior_knowledge()
            .timeout(Duration::from_millis(2000))
            .build()
            .map_err(|error| ProbeError(error.to_string()))?;
        Ok(Self { http, http2 })
    }

    /// Require the worker credential marker to be current.
    ///
    /// # Errors
    ///
    /// Returns [`ProbeError`] when the marker cannot be read, has the wrong
    /// identity, or is stale.
    pub fn require_credential_marker(
        marker_path: &str,
        tenant_id: &str,
        workload_id: &str,
        principal_id: &str,
        actor_id: &str,
        max_age_ms: u64,
    ) -> Result<(), ProbeError> {
        let marker = read_marker(marker_path)?;
        if marker.tenant_id != tenant_id
            || marker.workload_id != workload_id
            || marker.principal_id != principal_id
            || marker.actor_id != actor_id
        {
            return Err(ProbeError(
                "effect worker credential marker identity does not match".to_owned(),
            ));
        }
        let checked_at = marker
            .checked_at_micros
            .parse::<i128>()
            .map_err(|_| ProbeError("effect worker credential marker cannot be read".to_owned()))?;
        let age = now_micros() - checked_at;
        if age < 0 || age > i128::from(max_age_ms) * 1000 {
            return Err(ProbeError(
                "effect worker credential validation is stale".to_owned(),
            ));
        }
        Ok(())
    }

    /// Require a plain HTTP health endpoint to answer 2xx.
    ///
    /// # Errors
    ///
    /// Returns [`ProbeError`] when the endpoint is unavailable or unhealthy.
    pub async fn require_http_health(&self, url: &str) -> Result<(), ProbeError> {
        let response = self
            .http
            .get(url)
            .timeout(Duration::from_millis(2000))
            .send()
            .await
            .map_err(|error| ProbeError(format!("health probe is unavailable: {error}")))?;
        if !response.status().is_success() {
            return Err(ProbeError(format!(
                "{} returned HTTP {}",
                path_of(url),
                response.status().as_u16()
            )));
        }
        Ok(())
    }

    /// Require the connector to answer the readiness probe with 204.
    ///
    /// # Errors
    ///
    /// Returns [`ProbeError`] when the connector is unavailable or refuses.
    pub async fn require_connector_readiness(
        &self,
        probe_url: &str,
        caller_token: &str,
        credential_ref: &str,
        tenant_id: &str,
    ) -> Result<(), ProbeError> {
        let response = self
            .http
            .post(probe_url)
            .header(
                reqwest::header::AUTHORIZATION,
                format!("Bearer {caller_token}"),
            )
            .json(&serde_json::json!({
                "credentialRef": credential_ref,
                "tenantId": tenant_id,
            }))
            .timeout(Duration::from_millis(2000))
            .send()
            .await
            .map_err(|error| {
                ProbeError(format!("effect connector probe is unavailable: {error}"))
            })?;
        if response.status().as_u16() != 204 {
            return Err(ProbeError(format!(
                "effect connector readiness returned HTTP {}",
                response.status().as_u16()
            )));
        }
        Ok(())
    }

    /// Require the handler health endpoint to answer 200/204 over HTTP/2.
    ///
    /// # Errors
    ///
    /// Returns [`ProbeError`] when the handler is unavailable or unhealthy.
    pub async fn require_handler_health(&self, url: &str) -> Result<(), ProbeError> {
        let response = self
            .http2
            .get(url)
            .timeout(Duration::from_millis(2000))
            .send()
            .await
            .map_err(|error| {
                if error.is_timeout() {
                    ProbeError("effect handler health probe timed out".to_owned())
                } else {
                    ProbeError(format!("effect handler health probe failed: {error}"))
                }
            })?;
        let status = response.status().as_u16();
        if status != 200 && status != 204 {
            return Err(ProbeError(format!(
                "effect handler health returned HTTP {status}"
            )));
        }
        Ok(())
    }

    /// Require the handler artifact identity to match this revision.
    ///
    /// # Errors
    ///
    /// Returns [`ProbeError`] when the identity is unavailable, malformed,
    /// or tracks a different revision.
    pub async fn require_handler_artifact(
        &self,
        url: &str,
        expected_revision: &str,
    ) -> Result<(), ProbeError> {
        let response = self
            .http2
            .get(url)
            .timeout(Duration::from_millis(2000))
            .send()
            .await
            .map_err(|error| {
                if error.is_timeout() {
                    ProbeError("effect handler artifact probe timed out".to_owned())
                } else {
                    ProbeError(format!("effect handler artifact probe failed: {error}"))
                }
            })?;
        let status = response.status().as_u16();
        if status != 200 {
            return Err(ProbeError(format!(
                "effect handler artifact probe returned HTTP {status}"
            )));
        }
        let body = response.bytes().await.map_err(|error| {
            ProbeError(format!(
                "effect handler artifact probe returned malformed JSON: {error}"
            ))
        })?;
        if body.len() > 4096 {
            return Err(ProbeError(
                "effect handler artifact probe is too large".to_owned(),
            ));
        }
        let document: Value = serde_json::from_slice(&body).map_err(|error| {
            ProbeError(format!(
                "effect handler artifact probe returned malformed JSON: {error}"
            ))
        })?;
        let identity = parse_identity(&document)?;
        if identity != expected_revision {
            return Err(ProbeError(
                "effect handler artifact does not match this image".to_owned(),
            ));
        }
        Ok(())
    }
}

struct RawMarker {
    actor_id: String,
    checked_at_micros: String,
    principal_id: String,
    tenant_id: String,
    workload_id: String,
}

fn read_marker(path: &str) -> Result<RawMarker, ProbeError> {
    use std::os::unix::fs::OpenOptionsExt;
    let cannot_read = || ProbeError("effect worker credential marker cannot be read".to_owned());
    if std::fs::symlink_metadata(path).is_ok_and(|metadata| metadata.file_type().is_symlink()) {
        return Err(cannot_read());
    }
    let file = std::fs::OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NOFOLLOW)
        .open(path)
        .map_err(|_| cannot_read())?;
    let metadata = file.metadata().map_err(|_| cannot_read())?;
    if !metadata.is_file() {
        return Err(ProbeError(
            "effect worker credential marker is not a mode-0600 regular file".to_owned(),
        ));
    }
    {
        use std::os::unix::fs::MetadataExt;
        if metadata.mode() % 0o1000 != 0o600 {
            return Err(ProbeError(
                "effect worker credential marker is not a mode-0600 regular file".to_owned(),
            ));
        }
    }
    let document: Value = serde_json::from_reader(file).map_err(|_| cannot_read())?;
    parse_marker(&document).map_err(|_| cannot_read())
}

fn parse_marker(document: &Value) -> Result<RawMarker, ProbeError> {
    let fail = || ProbeError("marker schema".to_owned());
    let object = document.as_object().ok_or_else(fail)?;
    if object.len() != 6 {
        return Err(fail());
    }
    let get = |key: &str| {
        object
            .get(key)
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .map(str::to_owned)
            .ok_or_else(fail)
    };
    let checked_at_micros = get("checkedAtMicros")?;
    if !checked_at_micros.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(fail());
    }
    let workload_id = get("workloadId")?;
    if workload_id != "workload.effect-worker" {
        return Err(fail());
    }
    get("credentialId")?;
    Ok(RawMarker {
        actor_id: get("actorId")?,
        checked_at_micros,
        principal_id: get("principalId")?,
        tenant_id: get("tenantId")?,
        workload_id,
    })
}

fn parse_identity(document: &Value) -> Result<String, ProbeError> {
    let malformed =
        || ProbeError("effect handler artifact probe returned a malformed identity".to_owned());
    let object = document.as_object().ok_or_else(malformed)?;
    if object.len() != 4 {
        return Err(malformed());
    }
    if object.get("handler").and_then(Value::as_str) != Some(ZOEN_EFFECT_HANDLER_NAME) {
        return Err(malformed());
    }
    if object.get("owner").and_then(Value::as_str) != Some(ZOEN_EFFECT_OWNER) {
        return Err(malformed());
    }
    if object.get("service").and_then(Value::as_str) != Some(ZOEN_EFFECT_SERVICE_NAME) {
        return Err(malformed());
    }
    object
        .get("artifact")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .ok_or_else(malformed)
}

/// Parse `ZOEN_CONNECTOR_CREDENTIAL_REFS` down to the tenant reference.
///
/// # Errors
///
/// Returns [`ProbeError`] with the reference error messages on any drift.
pub fn parse_credential_ref(value: &str, tenant_id: &str) -> Result<String, ProbeError> {
    let document: Value = serde_json::from_str(value)
        .map_err(|_| ProbeError("ZOEN_CONNECTOR_CREDENTIAL_REFS must be JSON".to_owned()))?;
    let object = document
        .as_object()
        .ok_or_else(|| ProbeError("ZOEN_CONNECTOR_CREDENTIAL_REFS is malformed".to_owned()))?;
    if !object
        .iter()
        .all(|(key, item)| is_semantic_id(key) && item.as_str().is_some_and(is_semantic_id))
    {
        return Err(ProbeError(
            "ZOEN_CONNECTOR_CREDENTIAL_REFS is malformed".to_owned(),
        ));
    }
    if object.len() != 1 || !object.contains_key(tenant_id) {
        return Err(ProbeError(
            "ZOEN_CONNECTOR_CREDENTIAL_REFS must contain only the configured tenant".to_owned(),
        ));
    }
    object
        .get(tenant_id)
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| {
            ProbeError(
                "ZOEN_CONNECTOR_CREDENTIAL_REFS must contain only the configured tenant".to_owned(),
            )
        })
}

fn path_of(url: &str) -> String {
    url.parse::<reqwest::Url>()
        .map_or_else(|_| url.to_owned(), |parsed| parsed.path().to_owned())
}

fn now_micros() -> i128 {
    match std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH) {
        Ok(duration) => i128::try_from(duration.as_millis()).unwrap_or(i128::MAX) * 1000,
        Err(_) => 0,
    }
}
