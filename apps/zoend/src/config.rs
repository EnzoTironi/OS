use std::env::{self, VarError};
use std::error::Error;
use std::io::{Error as IoError, ErrorKind};

use zoen_query::ObjectStoreConfig;

pub fn object_store_config() -> Result<Option<ObjectStoreConfig>, Box<dyn Error + Send + Sync>> {
    let access_key_id = optional_env("S3_ACCESS_KEY_ID")?;
    let allow_http = optional_env("S3_ALLOW_HTTP")?;
    let bucket = optional_env("S3_BUCKET")?;
    let endpoint = optional_env("S3_ENDPOINT")?;
    let region = optional_env("S3_REGION")?;
    let secret_access_key = optional_env("S3_SECRET_ACCESS_KEY")?;
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

fn required_env(name: &str, value: Option<String>) -> Result<String, Box<dyn Error + Send + Sync>> {
    value.ok_or_else(|| {
        IoError::new(
            ErrorKind::InvalidInput,
            format!("{name} is required when S3 storage is configured"),
        )
        .into()
    })
}
