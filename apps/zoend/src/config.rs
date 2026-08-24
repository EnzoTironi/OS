use std::env::{self, VarError};
use std::error::Error;
use std::io::{Error as IoError, ErrorKind};
use std::path::PathBuf;

use zoen_query::ObjectStoreConfig;

/// Auth mode selected at process boot from the environment boundary.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProcessAuth {
    Oidc { issuer: String, audience: String },
}

type EnvLookup<'a> = dyn Fn(&str) -> Result<Option<String>, VarError> + 'a;

pub fn object_store_config() -> Result<Option<ObjectStoreConfig>, Box<dyn Error + Send + Sync>> {
    object_store_config_from(&|name| optional_env(name))
}

pub fn process_auth() -> Result<ProcessAuth, Box<dyn Error + Send + Sync>> {
    process_auth_from(&|name| optional_env(name))
}

pub fn cedar_manifest_path() -> Result<PathBuf, Box<dyn Error + Send + Sync>> {
    cedar_manifest_path_from(&|name| optional_env(name))
}

pub fn process_auth_from(
    lookup: &EnvLookup<'_>,
) -> Result<ProcessAuth, Box<dyn Error + Send + Sync>> {
    let issuer = nonempty(lookup("ZOEN_OIDC_ISSUER")?)
        .ok_or_else(|| config_error("ZOEN_OIDC_ISSUER is required"))?;
    let audience = nonempty(lookup("ZOEN_OIDC_AUDIENCE")?).ok_or_else(|| {
        config_error("ZOEN_OIDC_AUDIENCE is required when ZOEN_OIDC_ISSUER is set")
    })?;
    Ok(ProcessAuth::Oidc { issuer, audience })
}

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

fn config_error(message: &str) -> Box<dyn Error + Send + Sync> {
    IoError::new(ErrorKind::InvalidInput, message.to_owned()).into()
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::env::VarError;

    use super::{ProcessAuth, cedar_manifest_path_from, process_auth_from};

    fn lookup_from<'a>(
        map: &'a HashMap<&'a str, &'a str>,
    ) -> impl Fn(&str) -> Result<Option<String>, VarError> + 'a {
        move |name| Ok(map.get(name).map(|value| (*value).to_owned()))
    }

    #[test]
    fn process_auth_requires_oidc_issuer() {
        let env = HashMap::new();
        let error = process_auth_from(&lookup_from(&env)).expect_err("missing auth");
        assert!(
            error.to_string().contains("ZOEN_OIDC_ISSUER is required"),
            "{error}"
        );
    }

    #[test]
    fn process_auth_parses_oidc() {
        let env = HashMap::from([
            ("ZOEN_OIDC_ISSUER", "https://issuer.example/realms/zoen"),
            ("ZOEN_OIDC_AUDIENCE", "zoend"),
        ]);
        let auth = process_auth_from(&lookup_from(&env)).expect("oidc");
        assert_eq!(
            auth,
            ProcessAuth::Oidc {
                issuer: "https://issuer.example/realms/zoen".to_owned(),
                audience: "zoend".to_owned(),
            }
        );
    }

    #[test]
    fn process_auth_oidc_requires_audience() {
        let env = HashMap::from([("ZOEN_OIDC_ISSUER", "https://issuer.example/realms/zoen")]);
        let error = process_auth_from(&lookup_from(&env)).expect_err("missing audience");
        assert!(
            error
                .to_string()
                .contains("ZOEN_OIDC_AUDIENCE is required when ZOEN_OIDC_ISSUER is set"),
            "{error}"
        );
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
