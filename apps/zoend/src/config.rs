use std::{
    env::{self, VarError},
    error::Error,
    io::{Error as IoError, ErrorKind},
    path::PathBuf,
    time::Duration,
};

use zoen_core::WorldId;
use zoen_query::ObjectStoreConfig;

/// Auth mode selected at process boot from the environment boundary.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProcessAuth {
    SessionDoor { auth_database_url: String },
}

type EnvLookup<'a> = dyn Fn(&str) -> Result<Option<String>, VarError> + 'a;

/// Object-store settings from the S3 environment, if any S3 variable is set.
///
/// # Errors
///
/// Returns an error when S3 is partially configured, a required S3 variable is
/// missing, or `S3_ALLOW_HTTP` is not a boolean.
pub fn object_store_config() -> Result<Option<ObjectStoreConfig>, Box<dyn Error + Send + Sync>> {
    object_store_config_from(&|name| optional_env(name))
}

/// Session-door auth settings from the process environment.
///
/// # Errors
///
/// Returns an error when `ZOEN_AUTH_DATABASE_URL` is missing, empty, or not a
/// loopback URL.
pub fn process_auth() -> Result<ProcessAuth, Box<dyn Error + Send + Sync>> {
    process_auth_from(&|name| optional_env(name))
}

/// Cedar policy manifest path from the process environment.
///
/// # Errors
///
/// Returns an error when `ZOEN_CEDAR_POLICY_MANIFEST` is missing or empty.
pub fn cedar_manifest_path() -> Result<PathBuf, Box<dyn Error + Send + Sync>> {
    cedar_manifest_path_from(&|name| optional_env(name))
}

/// Better Auth door origin from `ZOEN_AUTH_BASE_URL`.
///
/// # Errors
///
/// Returns an error when the value is not an HTTP `127.0.0.1` origin with an
/// explicit port.
pub fn auth_base_url() -> Result<String, Box<dyn Error + Send + Sync>> {
    loopback_http_origin("ZOEN_AUTH_BASE_URL", "http://127.0.0.1:58704")
}

/// Eve origin from `ZOEN_EVE_BASE_URL`.
///
/// # Errors
///
/// Returns an error when the value is not an HTTP `127.0.0.1` origin with an
/// explicit port.
pub fn eve_base_url() -> Result<String, Box<dyn Error + Send + Sync>> {
    loopback_http_origin("ZOEN_EVE_BASE_URL", "http://127.0.0.1:3000")
}

/// Registrar health URL from `ZOEN_EFFECT_REGISTRATION_HEALTH_URL`.
///
/// # Errors
///
/// Returns an error when the environment value cannot be read.
pub fn effect_registration_health_url() -> Result<Option<String>, Box<dyn Error + Send + Sync>> {
    Ok(nonempty(optional_env(
        "ZOEN_EFFECT_REGISTRATION_HEALTH_URL",
    )?))
}

/// Tenant whose projection watermark `/ready` must observe.
///
/// # Errors
///
/// Returns an error when `ZOEN_TENANT_ID` is set but not a tenant identifier.
pub fn ready_tenant_id() -> Result<Option<WorldId>, Box<dyn Error + Send + Sync>> {
    nonempty(optional_env("ZOEN_TENANT_ID")?)
        .map(WorldId::parse)
        .transpose()
        .map_err(|error| config_error(&error.to_string()))
}

/// World whose active release and `PolicyCatalog` `/ready` must observe.
///
/// # Errors
///
/// Returns an error when `ZOEN_WORLD_ID` is set but not a World identifier.
pub fn ready_world_id() -> Result<Option<WorldId>, Box<dyn Error + Send + Sync>> {
    nonempty(optional_env("ZOEN_WORLD_ID")?)
        .map(WorldId::parse)
        .transpose()
        .map_err(|error| config_error(&error.to_string()))
}

/// Maximum age of a live projection watermark heartbeat.
///
/// # Errors
///
/// Returns an error when `ZOEN_PROJECTION_WATERMARK_MAX_AGE_MS` is not a
/// positive integer.
pub fn projection_watermark_max_age() -> Result<Duration, Box<dyn Error + Send + Sync>> {
    let Some(raw) = nonempty(optional_env("ZOEN_PROJECTION_WATERMARK_MAX_AGE_MS")?) else {
        return Ok(Duration::from_secs(30));
    };
    let millis = raw.parse::<u64>().map_err(|error| {
        config_error(&format!(
            "ZOEN_PROJECTION_WATERMARK_MAX_AGE_MS is invalid: {error}"
        ))
    })?;
    if millis == 0 {
        return Err(config_error(
            "ZOEN_PROJECTION_WATERMARK_MAX_AGE_MS must be greater than zero",
        ));
    }
    Ok(Duration::from_millis(millis))
}

/// Session-door auth settings from an environment lookup.
///
/// # Errors
///
/// Returns an error when `ZOEN_AUTH_DATABASE_URL` is missing, empty, not
/// readable, or not a loopback URL.
pub fn process_auth_from(
    lookup: &EnvLookup<'_>,
) -> Result<ProcessAuth, Box<dyn Error + Send + Sync>> {
    let auth_database_url = nonempty(lookup("ZOEN_AUTH_DATABASE_URL")?)
        .ok_or_else(|| config_error("ZOEN_AUTH_DATABASE_URL is required"))?;
    if !(auth_database_url.contains("127.0.0.1") || auth_database_url.contains("localhost")) {
        return Err(config_error(
            "ZOEN_AUTH_DATABASE_URL must point at a loopback host",
        ));
    }
    Ok(ProcessAuth::SessionDoor { auth_database_url })
}

/// Cedar policy manifest path from an environment lookup.
///
/// # Errors
///
/// Returns an error when `ZOEN_CEDAR_POLICY_MANIFEST` is missing, empty, or
/// not readable.
pub fn cedar_manifest_path_from(
    lookup: &EnvLookup<'_>,
) -> Result<PathBuf, Box<dyn Error + Send + Sync>> {
    nonempty(lookup("ZOEN_CEDAR_POLICY_MANIFEST")?)
        .map(PathBuf::from)
        .ok_or_else(|| config_error("ZOEN_CEDAR_POLICY_MANIFEST is required"))
}

fn object_store_config_from(
    lookup: &EnvLookup<'_>,
) -> Result<Option<ObjectStoreConfig>, Box<dyn Error + Send + Sync>> {
    let access_key_id = lookup("S3_ACCESS_KEY_ID")?;
    let allow_http = lookup("S3_ALLOW_HTTP")?;
    let bucket = lookup("S3_BUCKET")?;
    let endpoint = lookup("S3_ENDPOINT")?;
    let region = lookup("S3_REGION")?;
    let secret_access_key = lookup("S3_SECRET_ACCESS_KEY")?;
    if [
        &access_key_id,
        &allow_http,
        &bucket,
        &endpoint,
        &region,
        &secret_access_key,
    ]
    .iter()
    .all(|value| value.is_none())
    {
        return Ok(None);
    }
    Ok(Some(ObjectStoreConfig {
        access_key_id: required_env("S3_ACCESS_KEY_ID", access_key_id)?,
        allow_http: required_env("S3_ALLOW_HTTP", allow_http)?.parse()?,
        bucket: required_env("S3_BUCKET", bucket)?,
        endpoint: required_env("S3_ENDPOINT", endpoint)?,
        region: required_env("S3_REGION", region)?,
        secret_access_key: required_env("S3_SECRET_ACCESS_KEY", secret_access_key)?,
    }))
}

fn optional_env(name: &str) -> Result<Option<String>, VarError> {
    match env::var(name) {
        Ok(value) => Ok(Some(value)),
        Err(VarError::NotPresent) => Ok(None),
        Err(error) => Err(error),
    }
}

fn nonempty(value: Option<String>) -> Option<String> {
    value.and_then(|raw| {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_owned())
        }
    })
}

fn required_env(name: &str, value: Option<String>) -> Result<String, Box<dyn Error + Send + Sync>> {
    value.ok_or_else(|| {
        IoError::new(
            ErrorKind::InvalidInput,
            format!("{name} is required when S3 storage is configured"),
        )
        .into()
    })
}

fn loopback_http_origin(name: &str, default: &str) -> Result<String, Box<dyn Error + Send + Sync>> {
    let raw = match env::var(name) {
        Ok(value) => value,
        Err(VarError::NotPresent) => default.to_owned(),
        Err(error) => return Err(error.into()),
    };
    let origin = raw.trim().trim_end_matches('/');
    let parsed = reqwest::Url::parse(origin)
        .map_err(|error| config_error(&format!("{name} is invalid: {error}")))?;
    let host = parsed
        .host_str()
        .ok_or_else(|| config_error(&format!("{name} must include a host")))?;
    if parsed.scheme() != "http"
        || host != "127.0.0.1"
        || parsed.port().is_none()
        || parsed.path() != "/"
        || parsed.query().is_some()
        || parsed.fragment().is_some()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
    {
        return Err(config_error(&format!(
            "{name} must be an HTTP 127.0.0.1 origin with an explicit port"
        )));
    }
    Ok(origin.to_owned())
}

fn config_error(message: &str) -> Box<dyn Error + Send + Sync> {
    IoError::new(ErrorKind::InvalidInput, message.to_owned()).into()
}

#[cfg(test)]
mod tests {
    use std::{collections::HashMap, env::VarError};

    use super::cedar_manifest_path_from;

    fn lookup_from<'a>(
        map: &'a HashMap<&'a str, &'a str>,
    ) -> impl Fn(&str) -> Result<Option<String>, VarError> + 'a {
        move |name| Ok(map.get(name).map(|value| (*value).to_owned()))
    }

    #[test]
    fn cedar_manifest_path_is_required() {
        let env = HashMap::new();
        let error = cedar_manifest_path_from(&lookup_from(&env)).expect_err("missing cedar");
        assert!(
            error
                .to_string()
                .contains("ZOEN_CEDAR_POLICY_MANIFEST is required"),
            "{error}"
        );

        let env = HashMap::from([("ZOEN_CEDAR_POLICY_MANIFEST", "/tmp/policies.json")]);
        let path = cedar_manifest_path_from(&lookup_from(&env)).expect("path");
        assert_eq!(path, std::path::PathBuf::from("/tmp/policies.json"));
    }
}
