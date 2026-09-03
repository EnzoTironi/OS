//! Environment configuration for the effect registration reconciler.
//!
//! Same env surface, probe/health/identity/registration URIs, defaults, and
//! lease plus credential-marker behavior as the behavioral reference.

use std::{collections::BTreeMap, env, error::Error, fmt};

/// Canonical workload id for the effect worker credential.
pub const EFFECT_WORKER_WORKLOAD_ID: &str = "workload.effect-worker";

/// Validated registrar configuration.
#[derive(Clone, Debug)]
pub struct RegistrarConfig {
    /// Restate admin origin (path `/`).
    pub restate_admin_url: String,
    /// Bearer token the connector trusts.
    pub connector_caller_token: String,
    /// Raw tenant credential-reference document.
    pub connector_credential_refs: String,
    /// Connector readiness probe URL (path `/v1/effects/probe`).
    pub connector_probe_url: String,
    /// Handler health URL (path `/health`).
    pub handler_health_url: String,
    /// Handler identity URL (path `/zoen/artifact`).
    pub handler_identity_url: String,
    /// Stable Restate registration URI (path `/`).
    pub handler_registration_uri: String,
    /// Probe bind host (always `127.0.0.1`).
    pub registrar_host: String,
    /// Probe bind port.
    pub registrar_port: u16,
    /// Reconciliation interval.
    pub registration_interval_ms: u64,
    /// Worker actor id.
    pub worker_actor_id: String,
    /// Credential marker freshness window.
    pub worker_credential_max_age_ms: u64,
    /// Credential marker path.
    pub worker_credential_ready_file: String,
    /// Worker principal id.
    pub worker_principal_id: String,
    /// Worker workload id (always `workload.effect-worker`).
    pub worker_workload_id: String,
    /// Tenant id.
    pub tenant_id: String,
    /// zoend origin (path `/`).
    pub zoend_url: String,
}

/// Registrar configuration failure.
#[derive(Debug)]
pub struct RegistrarConfigError(pub String);

impl fmt::Display for RegistrarConfigError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl Error for RegistrarConfigError {}

/// Load the registrar configuration from the process environment.
///
/// # Errors
///
/// Returns [`RegistrarConfigError`] when any variable is missing or malformed.
pub fn load_config() -> Result<RegistrarConfig, RegistrarConfigError> {
    let environment = env::vars().collect::<BTreeMap<String, String>>();
    let node_env = environment
        .get("NODE_ENV")
        .map_or("production", String::as_str)
        .to_owned();
    if node_env != "production" && node_env != "test" {
        return Err(RegistrarConfigError(
            "NODE_ENV must be production or test".to_owned(),
        ));
    }
    let endpoints = parse_endpoints(&environment, node_env == "test")?;
    let worker = parse_worker(&environment)?;
    let (registrar_host, registrar_port) = listen_addr(
        environment
            .get("ZOEN_EFFECT_REGISTRAR_LISTEN_ADDR")
            .map_or("127.0.0.1:9082", String::as_str),
    )?;
    let registration_interval_ms = ranged_u64(
        &environment,
        "ZOEN_EFFECT_REGISTRATION_INTERVAL_MS",
        1000,
        100,
        60_000,
    )?;
    let tenant_id = required_min1(&environment, "ZOEN_TENANT_ID")?;
    Ok(RegistrarConfig {
        restate_admin_url: endpoints.restate_admin_url,
        connector_caller_token: endpoints.connector_caller_token,
        connector_credential_refs: endpoints.connector_credential_refs,
        connector_probe_url: endpoints.connector_probe_url,
        handler_health_url: endpoints.handler_health_url,
        handler_identity_url: endpoints.handler_identity_url,
        handler_registration_uri: endpoints.handler_registration_uri,
        registrar_host,
        registrar_port,
        registration_interval_ms,
        worker_actor_id: worker.actor_id,
        worker_credential_max_age_ms: worker.credential_max_age_ms,
        worker_credential_ready_file: worker.credential_ready_file,
        worker_principal_id: worker.principal_id,
        worker_workload_id: worker.workload_id,
        tenant_id,
        zoend_url: endpoints.zoend_url,
    })
}

struct EndpointConfig {
    restate_admin_url: String,
    connector_caller_token: String,
    connector_credential_refs: String,
    connector_probe_url: String,
    handler_health_url: String,
    handler_identity_url: String,
    handler_registration_uri: String,
    zoend_url: String,
}

fn parse_endpoints(
    environment: &BTreeMap<String, String>,
    test: bool,
) -> Result<EndpointConfig, RegistrarConfigError> {
    Ok(EndpointConfig {
        restate_admin_url: private_url(
            environment
                .get("RESTATE_ADMIN_URL")
                .map_or("http://127.0.0.1:9070", String::as_str),
            "RESTATE_ADMIN_URL",
            "/",
            false,
        )?,
        connector_caller_token: required_trimmed(environment, "ZOEN_CONNECTOR_CALLER_TOKEN")?,
        connector_credential_refs: required(environment, "ZOEN_CONNECTOR_CREDENTIAL_REFS")?,
        connector_probe_url: private_url(
            environment
                .get("ZOEN_EFFECT_CONNECTOR_PROBE_URL")
                .map_or("http://127.0.0.1:8081/v1/effects/probe", String::as_str),
            "ZOEN_EFFECT_CONNECTOR_PROBE_URL",
            "/v1/effects/probe",
            false,
        )?,
        handler_health_url: private_url(
            environment
                .get("ZOEN_EFFECT_HANDLER_HEALTH_URL")
                .map_or("http://127.0.0.1:9081/health", String::as_str),
            "ZOEN_EFFECT_HANDLER_HEALTH_URL",
            "/health",
            false,
        )?,
        handler_identity_url: private_url(
            environment
                .get("ZOEN_EFFECT_HANDLER_IDENTITY_URL")
                .map_or("http://127.0.0.1:9081/zoen/artifact", String::as_str),
            "ZOEN_EFFECT_HANDLER_IDENTITY_URL",
            "/zoen/artifact",
            false,
        )?,
        handler_registration_uri: private_url(
            environment
                .get("ZOEN_EFFECT_HANDLER_REGISTRATION_URI")
                .map_or("http://127.0.0.1:9081", String::as_str),
            "ZOEN_EFFECT_HANDLER_REGISTRATION_URI",
            "/",
            test,
        )?,
        zoend_url: private_url(
            environment
                .get("ZOEN_ZOEND")
                .map_or("http://127.0.0.1:58701", String::as_str),
            "ZOEN_ZOEND",
            "/",
            false,
        )?,
    })
}

struct WorkerConfig {
    actor_id: String,
    credential_max_age_ms: u64,
    credential_ready_file: String,
    principal_id: String,
    workload_id: String,
}

fn parse_worker(
    environment: &BTreeMap<String, String>,
) -> Result<WorkerConfig, RegistrarConfigError> {
    let workload_id = environment
        .get("ZOEN_EFFECT_WORKER_WORKLOAD_ID")
        .map_or(EFFECT_WORKER_WORKLOAD_ID, String::as_str)
        .to_owned();
    if workload_id != EFFECT_WORKER_WORKLOAD_ID {
        return Err(RegistrarConfigError(
            "ZOEN_EFFECT_WORKER_WORKLOAD_ID must be workload.effect-worker".to_owned(),
        ));
    }
    let credential_ready_file = environment
        .get("ZOEN_EFFECT_WORKER_CREDENTIAL_READY_FILE")
        .map_or("/run/zoen/effect-worker-credential.ready", String::as_str)
        .to_owned();
    if credential_ready_file.is_empty() {
        return Err(RegistrarConfigError(
            "ZOEN_EFFECT_WORKER_CREDENTIAL_READY_FILE is required".to_owned(),
        ));
    }
    Ok(WorkerConfig {
        actor_id: required_min1(environment, "ZOEN_EFFECT_WORKER_ACTOR_ID")?,
        credential_max_age_ms: ranged_u64(
            environment,
            "ZOEN_EFFECT_WORKER_CREDENTIAL_MAX_AGE_MS",
            15_000,
            1000,
            300_000,
        )?,
        credential_ready_file,
        principal_id: required_min1(environment, "ZOEN_EFFECT_WORKER_PRINCIPAL_ID")?,
        workload_id,
    })
}

fn required(
    environment: &BTreeMap<String, String>,
    name: &str,
) -> Result<String, RegistrarConfigError> {
    environment
        .get(name)
        .filter(|value| !value.is_empty())
        .cloned()
        .ok_or_else(|| RegistrarConfigError(format!("{name} is required")))
}

fn required_min1(
    environment: &BTreeMap<String, String>,
    name: &str,
) -> Result<String, RegistrarConfigError> {
    required(environment, name)
}

/// Check `^[A-Za-z][A-Za-z0-9._-]*$` for credential-reference documents.
#[must_use]
pub fn is_semantic_id(value: &str) -> bool {
    let mut characters = value.chars();
    match characters.next() {
        Some(first) if first.is_ascii_alphabetic() => (),
        _ => return false,
    }
    characters.all(|character| {
        character.is_ascii_alphanumeric()
            || character == '.'
            || character == '_'
            || character == '-'
    })
}

fn required_trimmed(
    environment: &BTreeMap<String, String>,
    name: &str,
) -> Result<String, RegistrarConfigError> {
    let value = required(environment, name)?;
    if value != value.trim() {
        return Err(RegistrarConfigError(format!("{name} is malformed")));
    }
    Ok(value)
}

fn ranged_u64(
    environment: &BTreeMap<String, String>,
    name: &str,
    default: u64,
    min: u64,
    max: u64,
) -> Result<u64, RegistrarConfigError> {
    match environment.get(name) {
        None => Ok(default),
        Some(raw) => {
            let value = raw
                .trim()
                .parse::<u64>()
                .map_err(|_| RegistrarConfigError(format!("{name} is malformed")))?;
            if value < min || value > max {
                return Err(RegistrarConfigError(format!("{name} is out of range")));
            }
            Ok(value)
        }
    }
}

fn private_url(
    value: &str,
    name: &str,
    expected_path: &str,
    allow_docker_test_host: bool,
) -> Result<String, RegistrarConfigError> {
    let fail = || {
        RegistrarConfigError(format!(
            "{name} must be a private HTTP URL with path {expected_path}"
        ))
    };
    let url = value.parse::<reqwest::Url>().map_err(|_| fail())?;
    let host = url.host_str().ok_or_else(fail)?;
    let loopback = matches!(host, "127.0.0.1" | "::1" | "localhost");
    let allowed = loopback || (allow_docker_test_host && host == "host.docker.internal");
    if url.scheme() != "http"
        || !allowed
        || !url.username().is_empty()
        || url.password().is_some()
        || url.path() != expected_path
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(fail());
    }
    Ok(value.to_owned())
}

fn listen_addr(value: &str) -> Result<(String, u16), RegistrarConfigError> {
    let malformed =
        || RegistrarConfigError("ZOEN_EFFECT_REGISTRAR_LISTEN_ADDR is malformed".to_owned());
    let port_text = value.strip_prefix("127.0.0.1:").ok_or_else(malformed)?;
    if port_text.len() > 5
        || port_text.is_empty()
        || !port_text.bytes().all(|byte| byte.is_ascii_digit())
        || port_text.starts_with('0')
    {
        return Err(malformed());
    }
    let port = port_text
        .parse::<u16>()
        .map_err(|_| malformed())
        .and_then(|port| {
            if port == 0 {
                Err(malformed())
            } else {
                Ok(port)
            }
        })?;
    Ok(("127.0.0.1".to_owned(), port))
}
