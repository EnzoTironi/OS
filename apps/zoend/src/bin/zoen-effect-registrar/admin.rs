//! Restate admin client plus exact-deployment contract enforcement.
//!
//! Every deployment document is compared field-for-field with the running
//! binary's discovery contract (artifact metadata normalized out), so any
//! drift outside a governed rebuild refuses registration.

use std::{error::Error, fmt, time::Duration};

use serde_json::Value;

use super::effect_artifact::{
    ZOEN_EFFECT_ARTIFACT_METADATA_KEY, ZOEN_EFFECT_HANDLER_NAME, ZOEN_EFFECT_OWNER,
    ZOEN_EFFECT_OWNER_METADATA_KEY, ZOEN_EFFECT_SERVICE_NAME,
};

/// Placeholder standing in for the concrete revision during comparison.
const NORMALIZED_ARTIFACT: &str = "<artifact>";

/// Registration failure; the reconciler reports it and retries next tick.
#[derive(Debug)]
pub struct AdminError(pub String);

impl fmt::Display for AdminError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl Error for AdminError {}

/// Restate admin client.
#[derive(Clone, Debug)]
pub struct AdminClient {
    base_url: String,
    http: reqwest::Client,
}

impl AdminClient {
    /// Build the client for one admin origin.
    ///
    /// # Errors
    ///
    /// Returns [`AdminError`] when the HTTP client cannot be built.
    pub fn new(base_url: &str) -> Result<Self, AdminError> {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_millis(5000))
            .build()
            .map_err(|error| AdminError(error.to_string()))?;
        Ok(Self {
            base_url: base_url.trim_end_matches('/').to_owned(),
            http,
        })
    }

    /// Fetch the deployment list.
    ///
    /// # Errors
    ///
    /// Returns [`AdminError`] when the admin API is unavailable or malformed.
    pub async fn list_deployments(&self) -> Result<Value, AdminError> {
        self.request("GET", "/deployments", None).await
    }

    /// Fetch one deployment document.
    ///
    /// # Errors
    ///
    /// Returns [`AdminError`] when the admin API is unavailable or malformed.
    pub async fn load_deployment(&self, deployment_id: &str) -> Result<Value, AdminError> {
        self.request(
            "GET",
            &format!("/deployments/{}", url_encode(deployment_id)),
            None,
        )
        .await
    }

    /// Preview or create a deployment registration.
    ///
    /// # Errors
    ///
    /// Returns [`AdminError`] when the admin API is unavailable or malformed.
    pub async fn register_deployment(&self, body: &Value) -> Result<Value, AdminError> {
        self.request("POST", "/deployments", Some(body)).await
    }

    /// Preview a deployment replacement.
    ///
    /// # Errors
    ///
    /// Returns [`AdminError`] when the admin API is unavailable or malformed.
    pub async fn preview_replacement(
        &self,
        deployment_id: &str,
        uri: &str,
    ) -> Result<Value, AdminError> {
        let body = serde_json::json!({
            "dry_run": true,
            "overwrite": true,
            "uri": uri,
            "use_http_11": false,
        });
        self.request(
            "PATCH",
            &format!("/deployments/{}", url_encode(deployment_id)),
            Some(&body),
        )
        .await
    }

    async fn request(
        &self,
        method: &str,
        path: &str,
        body: Option<&Value>,
    ) -> Result<Value, AdminError> {
        let url = format!("{}{}", self.base_url, path);
        let builder = match method {
            "POST" => self.http.post(&url),
            "PATCH" => self.http.patch(&url),
            _ => self.http.get(&url),
        };
        let builder = match body {
            Some(document) => builder.json(document),
            None => builder,
        };
        let response = builder
            .send()
            .await
            .map_err(|error| AdminError(format!("Restate Admin {path} is unavailable: {error}")))?;
        if !response.status().is_success() {
            return Err(AdminError(format!(
                "Restate Admin {path} returned HTTP {}",
                response.status().as_u16()
            )));
        }
        response.json::<Value>().await.map_err(|error| {
            AdminError(format!(
                "Restate Admin {path} returned malformed JSON: {error}"
            ))
        })
    }
}

fn url_encode(value: &str) -> String {
    const HEX: &[u8; 16] = b"0123456789ABCDEF";
    let mut encoded = String::with_capacity(value.len());
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || b"-_.~".contains(&byte) {
            encoded.push(byte as char);
        } else {
            encoded.push('%');
            encoded.push(HEX[usize::from(byte >> 4)] as char);
            encoded.push(HEX[usize::from(byte & 0x0f)] as char);
        }
    }
    encoded
}

/// Deployment ids in the list exposing `ZoenEffect`.
#[must_use]
pub fn zoen_effect_deployments(document: &Value) -> Vec<&Value> {
    deployments(document)
        .iter()
        .filter(|deployment| {
            deployment_services(deployment).iter().any(|service| {
                service
                    .get("name")
                    .and_then(Value::as_str)
                    .is_some_and(|name| name == ZOEN_EFFECT_SERVICE_NAME)
            })
        })
        .copied()
        .collect()
}

/// Raw deployment documents in the list response.
pub fn deployments(document: &Value) -> Vec<&Value> {
    document
        .get("deployments")
        .and_then(Value::as_array)
        .map(|items| items.iter().collect())
        .unwrap_or_default()
}

fn deployment_services(deployment: &Value) -> Vec<&Value> {
    deployment
        .get("services")
        .and_then(Value::as_array)
        .map(|items| items.iter().collect())
        .unwrap_or_default()
}

/// Deployment document id.
#[must_use]
pub fn deployment_id(deployment: &Value) -> Option<&str> {
    deployment.get("id").and_then(Value::as_str)
}

/// Deployment document URI.
#[must_use]
pub fn deployment_uri(deployment: &Value) -> Option<&str> {
    deployment.get("uri").and_then(Value::as_str)
}

/// Require the stored shape owned by this build line.
///
/// # Errors
///
/// Returns [`AdminError`] when the deployment URI, transport settings,
/// owner, or service shape drift.
pub fn require_owned_shape(
    deployment: &Value,
    expected_uri: &str,
) -> Result<OwnedShape, AdminError> {
    require_stable_deployment(deployment, expected_uri)?;
    let artifact = require_deployment_metadata(deployment)?;
    let service = require_exact_services(deployment, &artifact)?;
    Ok(OwnedShape {
        artifact,
        contract: deployment_contract(deployment, &service),
    })
}

/// Validated deployment shape.
pub struct OwnedShape {
    /// Revision pinned in deployment metadata.
    pub artifact: String,
    /// Comparable contract with the revision normalized out.
    pub contract: Value,
}

/// Require the replacement preview to reference the persisted revision.
///
/// # Errors
///
/// Returns [`AdminError`] when the preview is inconsistent or the service
/// shape drifts.
pub fn require_replacement_preview(
    deployment: &Value,
    persisted_artifact: &str,
    current_revision: &str,
    expected_uri: &str,
) -> Result<Value, AdminError> {
    require_stable_deployment(deployment, expected_uri)?;
    let artifact = require_deployment_metadata(deployment)?;
    if artifact != persisted_artifact {
        return Err(AdminError(
            "deployment artifact metadata is inconsistent".to_owned(),
        ));
    }
    let service = require_exact_services(deployment, current_revision)?;
    Ok(deployment_contract(deployment, &service))
}

/// Require the deployed shape to match this image.
///
/// # Errors
///
/// Returns [`AdminError`] when the deployment is not exactly this revision.
pub fn require_exact_shape(
    deployment: &Value,
    current_revision: &str,
    expected_uri: &str,
) -> Result<Value, AdminError> {
    let shape = require_owned_shape(deployment, expected_uri)?;
    if shape.artifact != current_revision {
        return Err(AdminError(
            "deployment artifact metadata does not match this image".to_owned(),
        ));
    }
    Ok(shape.contract)
}

/// Require two contracts to be identical.
///
/// # Errors
///
/// Returns [`AdminError`] describing the failed stage on any drift.
pub fn require_same_contract(
    actual: &Value,
    expected: &Value,
    stage: &str,
) -> Result<(), AdminError> {
    if actual == expected {
        Ok(())
    } else {
        Err(AdminError(format!(
            "incompatible ZoenEffect contract during {stage}"
        )))
    }
}

/// Discovery contract for a create/preview response.
///
/// # Errors
///
/// Returns [`AdminError`] when the discovered shape drifts.
pub fn require_discovery_contract(
    discovery: &Value,
    current_revision: &str,
) -> Result<Value, AdminError> {
    let services = discovery
        .get("services")
        .and_then(Value::as_array)
        .ok_or_else(|| {
            AdminError("ZoenEffect deployment detail omitted its service shape".to_owned())
        })?;
    let service_refs: Vec<&Value> = services.iter().collect();
    let service = require_exact_service_list(&service_refs, current_revision)?;
    let max_protocol_version = discovery
        .get("max_protocol_version")
        .cloned()
        .unwrap_or(Value::Null);
    let min_protocol_version = discovery
        .get("min_protocol_version")
        .cloned()
        .unwrap_or(Value::Null);
    Ok(serde_json::json!({
        "max_protocol_version": max_protocol_version,
        "min_protocol_version": min_protocol_version,
        "services": [service_contract(&service)],
    }))
}

fn require_stable_deployment(deployment: &Value, expected_uri: &str) -> Result<(), AdminError> {
    if !deployment_uri_matches(deployment, expected_uri) {
        return Err(AdminError(
            "ZoenEffect deployment URI does not match the stable URI".to_owned(),
        ));
    }
    require_stable_transport(deployment)
}

/// Check a deployment URI against the stable registration URI.
#[must_use]
pub fn deployment_uri_matches(deployment: &Value, expected_uri: &str) -> bool {
    deployment_uri(deployment).is_some_and(|uri| canonical_uri(uri) == canonical_uri(expected_uri))
}

/// Require default transport settings on the deployment.
///
/// # Errors
///
/// Returns [`AdminError`] when headers or auth drift.
pub fn require_stable_transport(deployment: &Value) -> Result<(), AdminError> {
    let headers_empty = deployment.get("additional_headers").is_none_or(|headers| {
        headers.is_null() || headers.as_object().is_some_and(serde_json::Map::is_empty)
    });
    let auth_absent = deployment.get("auth").is_none_or(Value::is_null);
    if headers_empty && auth_absent {
        Ok(())
    } else {
        Err(AdminError(
            "ZoenEffect deployment transport settings do not match".to_owned(),
        ))
    }
}

fn require_deployment_metadata(deployment: &Value) -> Result<String, AdminError> {
    let metadata = deployment
        .get("metadata")
        .and_then(Value::as_object)
        .ok_or_else(|| AdminError("deployment metadata contains unmanaged entries".to_owned()))?;
    let mut actual_keys: Vec<&str> = metadata.keys().map(String::as_str).collect();
    actual_keys.sort_unstable();
    let mut expected_keys = [
        ZOEN_EFFECT_ARTIFACT_METADATA_KEY,
        ZOEN_EFFECT_OWNER_METADATA_KEY,
    ];
    expected_keys.sort_unstable();
    if actual_keys != expected_keys {
        return Err(AdminError(
            "deployment metadata contains unmanaged entries".to_owned(),
        ));
    }
    require_owned_metadata(metadata, "deployment")
}

fn require_owned_metadata(
    metadata: &serde_json::Map<String, Value>,
    subject: &str,
) -> Result<String, AdminError> {
    if metadata
        .get(ZOEN_EFFECT_OWNER_METADATA_KEY)
        .and_then(Value::as_str)
        != Some(ZOEN_EFFECT_OWNER)
    {
        return Err(AdminError(format!(
            "{subject} owner metadata does not match"
        )));
    }
    match metadata
        .get(ZOEN_EFFECT_ARTIFACT_METADATA_KEY)
        .and_then(Value::as_str)
    {
        Some(artifact) if !artifact.is_empty() => Ok(artifact.to_owned()),
        _ => Err(AdminError(format!(
            "{subject} artifact metadata is missing"
        ))),
    }
}

fn require_exact_services(
    deployment: &Value,
    expected_artifact: &str,
) -> Result<Value, AdminError> {
    let services = deployment
        .get("services")
        .and_then(Value::as_array)
        .ok_or_else(|| {
            AdminError("ZoenEffect deployment detail omitted its service shape".to_owned())
        })?;
    let service_refs: Vec<&Value> = services.iter().collect();
    require_exact_service_list(&service_refs, expected_artifact)
}

fn require_exact_service_list(
    services: &[&Value],
    expected_artifact: &str,
) -> Result<Value, AdminError> {
    if services.len() != 1 {
        return Err(AdminError(
            "effect deployment must expose exactly one service".to_owned(),
        ));
    }
    let Some(service) = services.first() else {
        return Err(AdminError(
            "effect deployment must expose exactly one service".to_owned(),
        ));
    };
    let object = service.as_object().ok_or_else(|| {
        AdminError("ZoenEffect deployment detail omitted its service shape".to_owned())
    })?;
    let name = object
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let ty = object.get("ty").and_then(Value::as_str).unwrap_or_default();
    if name != ZOEN_EFFECT_SERVICE_NAME || ty != "VirtualObject" {
        return Err(AdminError(
            "effect service name or type does not match".to_owned(),
        ));
    }
    let metadata = object
        .get("metadata")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    require_metadata(&metadata, "service", expected_artifact)?;
    let handlers = object
        .get("handlers")
        .and_then(Value::as_array)
        .ok_or_else(|| AdminError("ZoenEffect must expose exactly one handler".to_owned()))?;
    if handlers.len() != 1 {
        return Err(AdminError(
            "ZoenEffect must expose exactly one handler".to_owned(),
        ));
    }
    let Some(handler) = handlers.first() else {
        return Err(AdminError(
            "ZoenEffect must expose exactly one handler".to_owned(),
        ));
    };
    let handler_object = handler
        .as_object()
        .ok_or_else(|| AdminError("ZoenEffect execute handler shape does not match".to_owned()))?;
    let handler_name = handler_object
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let handler_ty = handler_object
        .get("ty")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let handler_public = handler_object
        .get("public")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    if handler_name != ZOEN_EFFECT_HANDLER_NAME || handler_ty != "Exclusive" || !handler_public {
        return Err(AdminError(
            "ZoenEffect execute handler shape does not match".to_owned(),
        ));
    }
    let handler_metadata = handler_object
        .get("metadata")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    require_metadata(&handler_metadata, "handler", expected_artifact)?;
    Ok((*service).clone())
}

fn require_metadata(
    metadata: &serde_json::Map<String, Value>,
    subject: &str,
    expected_artifact: &str,
) -> Result<(), AdminError> {
    let artifact = require_owned_metadata(metadata, subject)?;
    if artifact != expected_artifact {
        return Err(AdminError(format!(
            "{subject} artifact metadata is inconsistent"
        )));
    }
    Ok(())
}

/// Comparable deployment contract with volatile fields stripped.
#[must_use]
pub fn deployment_contract(deployment: &Value, service: &Value) -> Value {
    let mut contract = serde_json::Map::new();
    if let Some(object) = deployment.as_object() {
        for (key, value) in object {
            if !["created_at", "id", "info", "sdk_version", "services", "uri"]
                .contains(&key.as_str())
            {
                contract.insert(key.clone(), value.clone());
            }
        }
    }
    let metadata = deployment
        .get("metadata")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    contract.insert(
        "metadata".to_owned(),
        Value::Object(normalized_metadata(&metadata)),
    );
    contract.insert(
        "services".to_owned(),
        Value::Array(vec![service_contract(service)]),
    );
    Value::Object(contract)
}

fn service_contract(service: &Value) -> Value {
    let mut contract = serde_json::Map::new();
    if let Some(object) = service.as_object() {
        for (key, value) in object {
            if !["deployment_id", "handlers", "info", "metadata", "revision"]
                .contains(&key.as_str())
            {
                contract.insert(key.clone(), value.clone());
            }
        }
    }
    let metadata = service
        .get("metadata")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let handlers = service
        .get("handlers")
        .and_then(Value::as_array)
        .map(|items| items.iter().map(handler_contract).collect())
        .unwrap_or_default();
    contract.insert(
        "metadata".to_owned(),
        Value::Object(normalized_metadata(&metadata)),
    );
    contract.insert("handlers".to_owned(), Value::Array(handlers));
    Value::Object(contract)
}

fn handler_contract(handler: &Value) -> Value {
    let mut contract = serde_json::Map::new();
    if let Some(object) = handler.as_object() {
        for (key, value) in object {
            if key != "info" && key != "metadata" {
                contract.insert(key.clone(), value.clone());
            }
        }
    }
    let metadata = handler
        .get("metadata")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    contract.insert(
        "metadata".to_owned(),
        Value::Object(normalized_metadata(&metadata)),
    );
    Value::Object(contract)
}

fn normalized_metadata(
    metadata: &serde_json::Map<String, Value>,
) -> serde_json::Map<String, Value> {
    let mut normalized = metadata.clone();
    normalized.insert(
        ZOEN_EFFECT_ARTIFACT_METADATA_KEY.to_owned(),
        Value::from(NORMALIZED_ARTIFACT),
    );
    normalized
}

/// Canonicalize a Restate URI by stripping trailing slashes.
#[must_use]
pub fn canonical_uri(value: &str) -> String {
    match value.parse::<reqwest::Url>() {
        Ok(mut url) => {
            let path = url.path().trim_end_matches('/').to_owned();
            url.set_path(&path);
            let canonical = url.to_string();
            canonical.strip_suffix('/').unwrap_or(&canonical).to_owned()
        }
        Err(_) => value.trim_end_matches('/').to_owned(),
    }
}

/// Compare Restate addresses by host plus pathname.
#[must_use]
pub fn same_restate_address(left: &str, right: &str) -> bool {
    match (left.parse::<reqwest::Url>(), right.parse::<reqwest::Url>()) {
        (Ok(left_url), Ok(right_url)) => {
            restate_host(&left_url) == restate_host(&right_url)
                && left_url.path() == right_url.path()
        }
        _ => left == right,
    }
}

fn restate_host(url: &reqwest::Url) -> String {
    let host = url.host_str().unwrap_or_default().to_lowercase();
    match url.port_or_known_default() {
        Some(port) => format!("{host}:{port}"),
        None => host,
    }
}
