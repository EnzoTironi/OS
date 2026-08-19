use std::env;
use std::error::Error;

use zoen_query::ObjectStoreConfig;

pub fn object_store_config() -> Result<ObjectStoreConfig, Box<dyn Error + Send + Sync>> {
    Ok(ObjectStoreConfig {
        access_key_id: env::var("S3_ACCESS_KEY_ID")?,
        allow_http: env::var("S3_ALLOW_HTTP")?.parse()?,
        bucket: env::var("S3_BUCKET")?,
        endpoint: env::var("S3_ENDPOINT")?,
        region: env::var("S3_REGION")?,
        secret_access_key: env::var("S3_SECRET_ACCESS_KEY")?,
    })
}
