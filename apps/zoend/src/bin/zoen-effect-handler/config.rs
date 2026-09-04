//! Environment configuration for the production `ZoenEffect` handler.
//!
//! Mirrors the behavioral reference: loopback-only URLs, a single tenant
//! credential reference, and an eagerly validated workload API key file.

use std::{collections::BTreeMap, env, error::Error, fmt, path::PathBuf};

/// Default handler bind host; production never leaves loopback.
pub const EFFECT_HANDLER_HOST: &str = "127.0.0.1";
/// Test-only bind host accepted when `NODE_ENV=test`.
pub const EFFECT_HANDLER_TEST_HOST: &str = "0.0.0.0";
/// Default handler bind port.
pub const EFFECT_HANDLER_DEFAULT_PORT: u16 = 9081;
/// Canonical workload id for the effect worker credential.
pub const EFFECT_WORKER_WORKLOAD_ID: &str = "workload.effect-worker";

/// Validated handler configuration.
#[derive(Clone, Debug)]
pub struct EffectHandlerConfig {
    /// Connector invocation settings.
    pub connector: ConnectorConfig,
    /// zoend `EffectService` settings.
    pub effect_service: EffectServiceConfig,
    /// Worker credential identity.
    pub identity: IdentityConfig,
    /// HTTP bind address.
    pub listen: ListenConfig,
    /// Registration lease settings.
    pub registration: RegistrationConfig,
}

/// Outbound HTTP connector settings.
#[derive(Clone, Debug)]
pub struct ConnectorConfig {
    /// Bearer token the connector trusts.
    pub caller_token: String,
    /// Tenant credential reference routed to the connector.
    pub credential_ref: String,
    /// Connector request timeout.
    pub request_timeout_ms: u64,
    /// Connector invocation URL (path `/v1/effects`).
    pub url: String,
}

/// zoend `EffectService` settings.
#[derive(Clone, Debug)]
pub struct EffectServiceConfig {
    /// RPC timeout per attempt.
    pub request_timeout_ms: u64,
    /// zoend origin (path `/`).
    pub zoend_url: String,
}

/// Worker credential identity.
#[derive(Clone, Debug)]
pub struct IdentityConfig {
    /// Actor the credential must authenticate as.
    pub actor_id: String,
    /// Mode-`0600` API key file.
    pub api_key_file: String,
    /// Principal the credential must authenticate as.
    pub principal_id: String,
    /// Tenant the worker serves.
    pub world_id: String,
    /// Always [`EFFECT_WORKER_WORKLOAD_ID`].
    pub workload_id: String,
}

/// HTTP bind address.
#[derive(Clone, Debug)]
pub struct ListenConfig {
    /// Bind host (loopback, or `0.0.0.0` under `NODE_ENV=test`).
    pub host: String,
    /// Bind port.
    pub port: u16,
}

/// Registration lease settings.
#[derive(Clone, Debug)]
pub struct RegistrationConfig {
    /// Maximum accepted lease age in milliseconds.
    pub lease_max_age_ms: u64,
    /// Registrar status URL (path `/status`).
    pub status_url: String,
}

/// Handler configuration or API key failure.
#[derive(Debug)]
pub struct ConfigError(pub String);

impl fmt::Display for ConfigError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl Error for ConfigError {}

/// Load the handler configuration from the process environment.
///
/// # Errors
///
/// Returns [`ConfigError`] when any variable is missing or malformed.
pub fn load_config() -> Result<EffectHandlerConfig, ConfigError> {
    load_config_from(&env::vars().collect::<BTreeMap<String, String>>())
}

fn load_config_from(
    environment: &BTreeMap<String, String>,
) -> Result<EffectHandlerConfig, ConfigError> {
    let node_env = environment
        .get("NODE_ENV")
        .map_or("production", String::as_str);
    if node_env != "production" && node_env != "test" {
        return Err(invalid("NODE_ENV must be production or test"));
    }
    let connector = parse_connector(environment)?;
    let listen = parse_listen(environment, node_env)?;
    let registration = parse_registration(environment)?;
    let world_id = semantic(environment, "ZOEN_TENANT_ID")?;
    let identity = parse_identity(environment, &world_id)?;
    let zoend_url = local_url(&required(environment, "ZOEN_ZOEND")?, "ZOEN_ZOEND", "/")?;
    let service_timeout_ms = ranged_u64(
        environment,
        "ZOEN_EFFECT_SERVICE_TIMEOUT_MS",
        5000,
        1,
        60_000,
    )?;
    let credential_ref = single_credential_ref(
        &required(environment, "ZOEN_CONNECTOR_CREDENTIAL_REFS")?,
        &world_id,
    )?;
    read_api_key(&identity.api_key_file)?;

    Ok(EffectHandlerConfig {
        connector: ConnectorConfig {
            caller_token: connector.caller_token,
            credential_ref,
            request_timeout_ms: connector.request_timeout_ms,
            url: connector.url,
        },
        effect_service: EffectServiceConfig {
            request_timeout_ms: service_timeout_ms,
            zoend_url,
        },
        identity: IdentityConfig {
            actor_id: identity.actor_id,
            api_key_file: identity.api_key_file,
            principal_id: identity.principal_id,
            world_id,
            workload_id: identity.workload_id,
        },
        listen,
        registration,
    })
}

struct PartialConnector {
    caller_token: String,
    request_timeout_ms: u64,
    url: String,
}

fn parse_connector(
    environment: &BTreeMap<String, String>,
) -> Result<PartialConnector, ConfigError> {
    Ok(PartialConnector {
        caller_token: required_trimmed(environment, "ZOEN_CONNECTOR_CALLER_TOKEN")?,
        request_timeout_ms: ranged_u64(
            environment,
            "ZOEN_EFFECT_CONNECTOR_TIMEOUT_MS",
            10_000,
            1,
            60_000,
        )?,
        url: local_url(
            &required(environment, "ZOEN_EFFECT_CONNECTOR_URL")?,
            "ZOEN_EFFECT_CONNECTOR_URL",
            "/v1/effects",
        )?,
    })
}

fn parse_listen(
    environment: &BTreeMap<String, String>,
    node_env: &str,
) -> Result<ListenConfig, ConfigError> {
    let host = environment
        .get("ZOEN_EFFECT_HANDLER_HOST")
        .map_or(EFFECT_HANDLER_HOST, String::as_str);
    if host != EFFECT_HANDLER_HOST && host != EFFECT_HANDLER_TEST_HOST {
        return Err(invalid(
            "ZOEN_EFFECT_HANDLER_HOST must be 127.0.0.1 or 0.0.0.0",
        ));
    }
    if node_env != "test" && host != EFFECT_HANDLER_HOST {
        return Err(invalid(
            "ZOEN_EFFECT_HANDLER_HOST must remain loopback outside tests",
        ));
    }
    Ok(ListenConfig {
        host: host.to_owned(),
        port: ranged_port(
            environment,
            "ZOEN_EFFECT_HANDLER_PORT",
            EFFECT_HANDLER_DEFAULT_PORT,
        )?,
    })
}

fn parse_registration(
    environment: &BTreeMap<String, String>,
) -> Result<RegistrationConfig, ConfigError> {
    Ok(RegistrationConfig {
        lease_max_age_ms: ranged_u64(
            environment,
            "ZOEN_EFFECT_REGISTRATION_LEASE_MAX_AGE_MS",
            5000,
            100,
            60_000,
        )?,
        status_url: local_url(
            environment
                .get("ZOEN_EFFECT_REGISTRATION_STATUS_URL")
                .map_or("http://127.0.0.1:9082/status", String::as_str),
            "ZOEN_EFFECT_REGISTRATION_STATUS_URL",
            "/status",
        )?,
    })
}

fn parse_identity(
    environment: &BTreeMap<String, String>,
    world_id: &str,
) -> Result<IdentityConfig, ConfigError> {
    let workload_id = environment
        .get("ZOEN_EFFECT_WORKER_WORKLOAD_ID")
        .map_or(EFFECT_WORKER_WORKLOAD_ID, String::as_str);
    if workload_id != EFFECT_WORKER_WORKLOAD_ID {
        return Err(invalid(
            "ZOEN_EFFECT_WORKER_WORKLOAD_ID must be workload.effect-worker",
        ));
    }
    Ok(IdentityConfig {
        actor_id: semantic(environment, "ZOEN_EFFECT_WORKER_ACTOR_ID")?,
        api_key_file: absolute_path(environment, "ZOEN_EFFECT_WORKER_API_KEY_FILE")?,
        principal_id: semantic(environment, "ZOEN_EFFECT_WORKER_PRINCIPAL_ID")?,
        world_id: world_id.to_owned(),
        workload_id: workload_id.to_owned(),
    })
}

/// Read and validate the workload API key file.
///
/// # Errors
///
/// Returns [`ConfigError`] when the file cannot be read, is not a
/// mode-`0600` regular file, or does not hold a `zoen_wl_` key.
pub fn read_api_key(file: &str) -> Result<String, ConfigError> {
    use std::os::unix::fs::{MetadataExt, OpenOptionsExt};
    let path = PathBuf::from(file);
    if std::fs::symlink_metadata(&path).is_ok_and(|metadata| metadata.file_type().is_symlink()) {
        return Err(ConfigError(
            "effect worker API key file cannot be read".to_owned(),
        ));
    }
    let opened = std::fs::OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NOFOLLOW)
        .open(&path)
        .map_err(|_| ConfigError("effect worker API key file cannot be read".to_owned()))?;
    let metadata = opened
        .metadata()
        .map_err(|_| ConfigError("effect worker API key file cannot be read".to_owned()))?;
    if !metadata.is_file() {
        return Err(ConfigError(
            "effect worker API key is not a regular file".to_owned(),
        ));
    }
    if metadata.mode() % 0o1000 != 0o600 {
        return Err(ConfigError(
            "effect worker API key file mode must be 0600".to_owned(),
        ));
    }
    let document = std::io::read_to_string(opened)
        .map_err(|_| ConfigError("effect worker API key file cannot be read".to_owned()))?;
    let candidate = document.strip_suffix('\n').unwrap_or(&document);
    if candidate.is_empty() || candidate != candidate.trim() || !is_api_key(candidate) {
        return Err(ConfigError(
            "effect worker API key file is malformed".to_owned(),
        ));
    }
    Ok(candidate.to_owned())
}

/// Check `zoen_wl_[A-Za-z0-9._-]+`.
#[must_use]
pub fn is_api_key(value: &str) -> bool {
    let Some(rest) = value.strip_prefix("zoen_wl_") else {
        return false;
    };
    !rest.is_empty()
        && rest.chars().all(|character| {
            character.is_ascii_alphanumeric()
                || character == '.'
                || character == '_'
                || character == '-'
        })
}

/// Check `^[A-Za-z][A-Za-z0-9._-]*$`.
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

fn invalid(message: &str) -> ConfigError {
    ConfigError(format!("invalid effect handler configuration: {message}"))
}

fn required(environment: &BTreeMap<String, String>, name: &str) -> Result<String, ConfigError> {
    environment
        .get(name)
        .filter(|value| !value.is_empty())
        .cloned()
        .ok_or_else(|| invalid(&format!("{name} is required")))
}

fn required_trimmed(
    environment: &BTreeMap<String, String>,
    name: &str,
) -> Result<String, ConfigError> {
    let value = required(environment, name)?;
    if value != value.trim() {
        return Err(invalid(&format!(
            "{name} must not have surrounding whitespace"
        )));
    }
    Ok(value)
}

fn semantic(environment: &BTreeMap<String, String>, name: &str) -> Result<String, ConfigError> {
    let value = required(environment, name)?;
    if is_semantic_id(&value) {
        Ok(value)
    } else {
        Err(invalid(&format!("{name} is malformed")))
    }
}

fn absolute_path(
    environment: &BTreeMap<String, String>,
    name: &str,
) -> Result<String, ConfigError> {
    let value = required(environment, name)?;
    if PathBuf::from(&value).is_absolute() {
        Ok(value)
    } else {
        Err(invalid(&format!("{name} must be absolute")))
    }
}

fn ranged_u64(
    environment: &BTreeMap<String, String>,
    name: &str,
    default: u64,
    min: u64,
    max: u64,
) -> Result<u64, ConfigError> {
    match environment.get(name) {
        None => Ok(default),
        Some(raw) => {
            let value = raw
                .trim()
                .parse::<u64>()
                .map_err(|_| invalid(&format!("{name} must be a number")))?;
            if value < min || value > max {
                return Err(invalid(&format!("{name} is out of range")));
            }
            Ok(value)
        }
    }
}

fn ranged_port(
    environment: &BTreeMap<String, String>,
    name: &str,
    default: u16,
) -> Result<u16, ConfigError> {
    match environment.get(name) {
        None => Ok(default),
        Some(raw) => {
            let value = raw
                .trim()
                .parse::<u64>()
                .map_err(|_| invalid(&format!("{name} must be a number")))?;
            if value < 1 || value > u64::from(u16::MAX) {
                return Err(invalid(&format!("{name} is out of range")));
            }
            u16::try_from(value).map_err(|_| invalid(&format!("{name} is out of range")))
        }
    }
}

fn local_url(value: &str, name: &str, expected_path: &str) -> Result<String, ConfigError> {
    let url = value
        .parse::<reqwest::Url>()
        .map_err(|_| invalid(&format!("{name} must be a loopback HTTP URL")))?;
    let loopback = matches!(url.host_str(), Some("127.0.0.1" | "::1" | "localhost"));
    if url.scheme() != "http"
        || !loopback
        || !url.username().is_empty()
        || url.password().is_some()
        || url.path() != expected_path
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(invalid(&format!(
            "{name} must be a loopback HTTP URL with path {expected_path}"
        )));
    }
    Ok(value.to_owned())
}

fn single_credential_ref(refs: &str, world_id: &str) -> Result<String, ConfigError> {
    let document: serde_json::Value = serde_json::from_str(refs)
        .map_err(|_| invalid("ZOEN_CONNECTOR_CREDENTIAL_REFS must be JSON"))?;
    let object = document
        .as_object()
        .ok_or_else(|| invalid("ZOEN_CONNECTOR_CREDENTIAL_REFS is malformed"))?;
    if !object
        .iter()
        .all(|(key, value)| is_semantic_id(key) && value.as_str().is_some_and(is_semantic_id))
    {
        return Err(invalid("ZOEN_CONNECTOR_CREDENTIAL_REFS is malformed"));
    }
    if object.len() != 1 || !object.contains_key(world_id) {
        return Err(invalid(
            "ZOEN_CONNECTOR_CREDENTIAL_REFS must contain only the configured tenant",
        ));
    }
    object
        .get(world_id)
        .and_then(serde_json::Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| invalid("ZOEN_CONNECTOR_CREDENTIAL_REFS omits the configured tenant"))
}
