use std::sync::Arc;

use object_store::ObjectStore;
use object_store::aws::AmazonS3Builder;

use crate::QueryError;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ObjectStoreConfig {
    pub access_key_id: String,
    pub allow_http: bool,
    pub bucket: String,
    pub endpoint: String,
    pub region: String,
    pub secret_access_key: String,
}

impl ObjectStoreConfig {
    pub(crate) fn build(&self) -> Result<Arc<dyn ObjectStore>, QueryError> {
        let store = AmazonS3Builder::new()
            .with_access_key_id(&self.access_key_id)
            .with_secret_access_key(&self.secret_access_key)
            .with_region(&self.region)
            .with_bucket_name(&self.bucket)
            .with_endpoint(&self.endpoint)
            .with_allow_http(self.allow_http)
            .build()
            .map_err(|error| QueryError::Unavailable(error.to_string()))?;
        Ok(Arc::new(store))
    }

    pub(crate) fn object_url(&self, key: &str) -> String {
        format!("s3://{}/{key}", self.bucket)
    }

    pub(crate) fn registration_url(&self) -> String {
        format!("s3://{}", self.bucket)
    }
}
