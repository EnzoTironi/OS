//! Release-scoped Cedar authority: active PolicyCatalog wins over boot manifest.

use std::{
    collections::BTreeMap,
    sync::{Arc, RwLock},
};

use zoen_core::{PolicyEvaluation, ReleaseDigest, WorldId};
use zoen_engine::{PolicyEvaluator, PolicyRequest};

use crate::{CedarConfigError, CedarPolicyEvaluator, PostgresWorldReleaseStore};

/// Evaluates governed verbs from the World's active `PolicyCatalog`.
///
/// Boot-manifest Cedar (`ZOEN_CEDAR_POLICY_MANIFEST`) applies only while the World
/// has no active release (bootstrap). After activation, evaluation uses catalog
/// bytes bound by that release's `ReleaseDigest` and fails closed when the
/// catalog lacks a loadable Cedar bundle — never falling back to the boot file.
pub struct ReleaseCedarEvaluator {
    boot: Arc<CedarPolicyEvaluator>,
    cache: RwLock<BTreeMap<String, Arc<CedarPolicyEvaluator>>>,
    store: PostgresWorldReleaseStore,
}

impl ReleaseCedarEvaluator {
    #[must_use]
    pub fn new(boot: CedarPolicyEvaluator, store: PostgresWorldReleaseStore) -> Self {
        Self {
            boot: Arc::new(boot),
            cache: RwLock::new(BTreeMap::new()),
            store,
        }
    }

    #[must_use]
    pub fn boot(&self) -> &CedarPolicyEvaluator {
        &self.boot
    }

    /// Load and compile Cedar from the active release for `world`.
    ///
    /// # Errors
    ///
    /// Returns an error when the World has no active release, catalogs are
    /// missing, or the PolicyCatalog cannot compile as Cedar.
    pub async fn evaluator_for_active_world(
        &self,
        world: &WorldId,
    ) -> Result<(ReleaseDigest, Arc<CedarPolicyEvaluator>), String> {
        let digest = self
            .store
            .get_active(world)
            .await
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "world has no active release".to_owned())?;
        let evaluator = self.evaluator_for_release(&digest).await?;
        Ok((digest, evaluator))
    }

    async fn evaluator_for_release(
        &self,
        digest: &ReleaseDigest,
    ) -> Result<Arc<CedarPolicyEvaluator>, String> {
        if let Some(cached) = self
            .cache
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .get(digest.as_str())
            .cloned()
        {
            return Ok(cached);
        }
        let catalogs = self
            .store
            .get_catalogs(digest)
            .await
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "active release catalogs were not found".to_owned())?;
        let compiled = CedarPolicyEvaluator::from_policy_catalog_bytes(catalogs.policy().bytes())
            .map_err(|error| error.to_string())?;
        if compiled.is_empty() {
            return Err("active release PolicyCatalog has no Cedar policies".to_owned());
        }
        let compiled = Arc::new(compiled);
        self.cache
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .insert(digest.as_str().to_owned(), compiled.clone());
        Ok(compiled)
    }
}

impl PolicyEvaluator for ReleaseCedarEvaluator {
    fn evaluate(
        &self,
        request: &PolicyRequest<'_>,
    ) -> impl std::future::Future<Output = PolicyEvaluation> + Send {
        async move {
            let Ok(world) = WorldId::parse(request.context.tenant_id().as_str()) else {
                return self.boot.evaluate(request).await;
            };
            match self.store.get_active(&world).await {
                Ok(None) => self.boot.evaluate(request).await,
                Ok(Some(digest)) => match self.evaluator_for_release(&digest).await {
                    Ok(evaluator) => evaluator.evaluate_request(request),
                    Err(message) => PolicyEvaluation::EvaluationError {
                        message: format!(
                            "active-release Cedar unavailable for {}: {message}",
                            digest.as_str()
                        ),
                        revision: None,
                    },
                },
                Err(error) => PolicyEvaluation::EvaluationError {
                    message: format!("active-release Cedar lookup failed: {error}"),
                    revision: None,
                },
            }
        }
    }
}

/// Validate PolicyCatalog candidate bytes before publish.
///
/// # Errors
///
/// Returns [`CedarConfigError`] when bytes are not a loadable §8.4 Cedar catalog.
pub fn require_loadable_policy_catalog(
    bytes: &[u8],
) -> Result<CedarPolicyEvaluator, CedarConfigError> {
    let evaluator = CedarPolicyEvaluator::from_policy_catalog_bytes(bytes)?;
    if evaluator.is_empty() {
        return Err(CedarConfigError::Invalid(
            "authorization.policies must contain at least one Cedar policy".to_owned(),
        ));
    }
    Ok(evaluator)
}
