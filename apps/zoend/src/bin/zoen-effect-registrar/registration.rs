//! Exact-registration reconciliation loop.
//!
//! Ports the reference lifecycle: credential marker, health gates, exclusive
//! stable-URI ownership, then create or governed replace with contract
//! preconditions before and after every write.

use serde_json::Value;

use super::{
    admin::{
        AdminClient, AdminError, deployment_id, deployment_uri, deployments,
        require_discovery_contract, require_exact_shape, require_owned_shape,
        require_replacement_preview, require_same_contract, same_restate_address,
        zoen_effect_deployments,
    },
    config::RegistrarConfig,
    probes::{ProbeError, Probes, parse_credential_ref},
};

/// Shared registration state served on `/status`.
#[derive(Clone, Debug)]
pub struct RegistrationState {
    /// Revision this registrar instance tracks.
    pub artifact: String,
    /// Current deployment id once verified.
    pub deployment_id: Option<String>,
    /// Whether traffic may flow.
    pub ready: bool,
    /// Human-readable state reason.
    pub reason: String,
    /// Last update timestamp (`YYYY-MM-DDTHH:MM:SS.mmmZ`).
    pub updated_at: String,
}

/// Reconciliation context.
pub struct Reconciler {
    admin: AdminClient,
    artifact_revision: String,
    config: RegistrarConfig,
    probes: Probes,
}

impl Reconciler {
    /// Build the reconciler from validated configuration.
    ///
    /// # Errors
    ///
    /// Returns [`ReconcileError`] when probe or admin clients cannot be built.
    pub fn new(config: &RegistrarConfig, artifact_revision: &str) -> Result<Self, ReconcileError> {
        Ok(Self {
            admin: AdminClient::new(&config.restate_admin_url).map_err(ReconcileError::Admin)?,
            artifact_revision: artifact_revision.to_owned(),
            config: config.clone(),
            probes: Probes::new().map_err(ReconcileError::Probe)?,
        })
    }

    /// Run one reconciliation tick, returning the admitting deployment id.
    ///
    /// # Errors
    ///
    /// Returns [`ReconcileError`] when any gate refuses admission.
    pub async fn reconcile(&self) -> Result<String, ReconcileError> {
        Probes::require_credential_marker(
            &self.config.worker_credential_ready_file,
            &self.config.tenant_id,
            &self.config.worker_workload_id,
            &self.config.worker_principal_id,
            &self.config.worker_actor_id,
            self.config.worker_credential_max_age_ms,
        )
        .map_err(ReconcileError::Probe)?;
        let zoend_live = format!("{}/live", self.config.zoend_url.trim_end_matches('/'));
        let admin_health = format!(
            "{}/health",
            self.config.restate_admin_url.trim_end_matches('/')
        );
        let credential_ref = parse_credential_ref(
            &self.config.connector_credential_refs,
            &self.config.tenant_id,
        )
        .map_err(ReconcileError::Probe)?;
        let health = self.probes.require_http_health(&zoend_live);
        let admin = self.probes.require_http_health(&admin_health);
        let connector = self.probes.require_connector_readiness(
            &self.config.connector_probe_url,
            &self.config.connector_caller_token,
            &credential_ref,
            &self.config.tenant_id,
        );
        let handler_health = self
            .probes
            .require_handler_health(&self.config.handler_health_url);
        let handler_artifact = self
            .probes
            .require_handler_artifact(&self.config.handler_identity_url, &self.artifact_revision);
        let (health, admin, connector, handler_health, handler_artifact) =
            tokio::join!(health, admin, connector, handler_health, handler_artifact);
        health.map_err(ReconcileError::Probe)?;
        admin.map_err(ReconcileError::Probe)?;
        connector.map_err(ReconcileError::Probe)?;
        handler_health.map_err(ReconcileError::Probe)?;
        handler_artifact.map_err(ReconcileError::Probe)?;

        let listed = self
            .admin
            .list_deployments()
            .await
            .map_err(ReconcileError::Admin)?;
        let matching = zoen_effect_deployments(&listed);
        if matching.len() > 1 {
            return Err(ReconcileError::Admin(AdminError(
                "multiple ZoenEffect deployments are registered".to_owned(),
            )));
        }
        if let Some(existing) = matching.first() {
            let id = deployment_id(existing).ok_or_else(|| {
                ReconcileError::Admin(AdminError(
                    "ZoenEffect deployment lookup was inconsistent".to_owned(),
                ))
            })?;
            self.require_exclusive_address(&listed, id)?;
            let deployment = self
                .admin
                .load_deployment(id)
                .await
                .map_err(ReconcileError::Admin)?;
            let shape = require_owned_shape(&deployment, &self.config.handler_registration_uri)
                .map_err(ReconcileError::Admin)?;
            if shape.artifact == self.artifact_revision {
                let preview = self.preview_replacement(id).await?;
                let current = require_replacement_preview(
                    &preview,
                    &shape.artifact,
                    &self.artifact_revision,
                    &self.config.handler_registration_uri,
                )
                .map_err(ReconcileError::Admin)?;
                require_same_contract(&shape.contract, &current, "steady-state preflight")
                    .map_err(ReconcileError::Admin)?;
                return Ok(id.to_owned());
            }
            return self
                .register_current(RegistrationMode::Replace {
                    artifact: shape.artifact,
                    contract: shape.contract,
                    deployment,
                    deployment_id: id.to_owned(),
                })
                .await;
        }

        if deployments(&listed).iter().any(|deployment| {
            deployment_uri(deployment)
                .is_some_and(|uri| same_restate_address(uri, &self.config.handler_registration_uri))
        }) {
            return Err(ReconcileError::Admin(AdminError(
                "the stable effect handler URI is occupied by an incompatible deployment"
                    .to_owned(),
            )));
        }
        self.register_current(RegistrationMode::Create).await
    }

    async fn register_current(&self, mode: RegistrationMode) -> Result<String, ReconcileError> {
        let registration = serde_json::json!({
            "breaking": false,
            "force": mode.is_replace(),
            "metadata": self.artifact_metadata(),
            "uri": self.config.handler_registration_uri,
        });
        let (expected_contract, expected_discovery) = match &mode {
            RegistrationMode::Replace {
                artifact,
                contract,
                deployment,
                deployment_id,
            } => {
                let preview = self.preview_replacement(deployment_id).await?;
                let preview_id = deployment_id_of(&preview)?;
                if preview_id != *deployment_id {
                    return Err(ReconcileError::Admin(AdminError(
                        "effect deployment preview changed deployment identity".to_owned(),
                    )));
                }
                let expected = require_replacement_preview(
                    &preview,
                    artifact,
                    &self.artifact_revision,
                    &self.config.handler_registration_uri,
                )
                .map_err(ReconcileError::Admin)?;
                let discovery = require_discovery_contract(&preview, &self.artifact_revision)
                    .map_err(ReconcileError::Admin)?;
                require_same_contract(contract, &expected, "replacement preflight")
                    .map_err(ReconcileError::Admin)?;
                let current = self
                    .admin
                    .load_deployment(deployment_id)
                    .await
                    .map_err(ReconcileError::Admin)?;
                let current_shape =
                    require_owned_shape(&current, &self.config.handler_registration_uri)
                        .map_err(ReconcileError::Admin)?;
                if current_shape.artifact != *artifact || current != *deployment {
                    return Err(ReconcileError::Admin(AdminError(
                        "effect deployment changed during replacement preflight".to_owned(),
                    )));
                }
                self.require_exclusive_address_now(deployment_id).await?;
                (expected, discovery)
            }
            RegistrationMode::Create => {
                let mut preview_body = registration.clone();
                preview_body["dry_run"] = Value::Bool(true);
                let preview = self
                    .admin
                    .register_deployment(&preview_body)
                    .await
                    .map_err(ReconcileError::Admin)?;
                let expected = require_discovery_contract(&preview, &self.artifact_revision)
                    .map_err(ReconcileError::Admin)?;
                (expected.clone(), expected)
            }
        };

        let mut create_body = registration.clone();
        create_body["dry_run"] = Value::Bool(false);
        let created = self
            .admin
            .register_deployment(&create_body)
            .await
            .map_err(ReconcileError::Admin)?;
        let created_contract = require_discovery_contract(&created, &self.artifact_revision)
            .map_err(ReconcileError::Admin)?;
        require_same_contract(
            &created_contract,
            &expected_discovery,
            "registration result",
        )
        .map_err(ReconcileError::Admin)?;
        let created_id = deployment_id_of(&created)?;
        if let RegistrationMode::Replace { deployment_id, .. } = &mode
            && created_id != *deployment_id
        {
            return Err(ReconcileError::Admin(AdminError(
                "effect deployment replacement changed deployment identity".to_owned(),
            )));
        }
        let expected_post = match &mode {
            RegistrationMode::Replace { .. } => Some(expected_contract.clone()),
            RegistrationMode::Create => None,
        };
        self.require_exact_deployment(&created_id, expected_post.as_ref())
            .await?;
        self.require_only_current(&created_id).await?;
        Ok(created_id)
    }

    async fn preview_replacement(&self, deployment_id: &str) -> Result<Value, ReconcileError> {
        let preview = self
            .admin
            .preview_replacement(deployment_id, &self.config.handler_registration_uri)
            .await
            .map_err(ReconcileError::Admin)?;
        let preview_id = deployment_id_of(&preview)?;
        if preview_id != deployment_id {
            return Err(ReconcileError::Admin(AdminError(
                "effect deployment preview changed deployment identity".to_owned(),
            )));
        }
        Ok(preview)
    }

    async fn require_exact_deployment(
        &self,
        deployment_id: &str,
        expected_contract: Option<&Value>,
    ) -> Result<(), ReconcileError> {
        let deployment = self
            .admin
            .load_deployment(deployment_id)
            .await
            .map_err(ReconcileError::Admin)?;
        let contract = require_exact_shape(
            &deployment,
            &self.artifact_revision,
            &self.config.handler_registration_uri,
        )
        .map_err(ReconcileError::Admin)?;
        if let Some(expected) = expected_contract {
            require_same_contract(&contract, expected, "replacement postcondition")
                .map_err(ReconcileError::Admin)?;
        }
        Ok(())
    }

    async fn require_only_current(&self, deployment_id: &str) -> Result<(), ReconcileError> {
        let listed = self
            .admin
            .list_deployments()
            .await
            .map_err(ReconcileError::Admin)?;
        self.require_exclusive_address(&listed, deployment_id)?;
        let matching = zoen_effect_deployments(&listed);
        let only = matching.first().filter(|_| matching.len() == 1);
        match only {
            Some(deployment)
                if deployment_id_of(deployment).ok().as_deref() == Some(deployment_id) =>
            {
                Ok(())
            }
            _ => Err(ReconcileError::Admin(AdminError(
                "ZoenEffect deployment replacement was not exclusive".to_owned(),
            ))),
        }
    }

    fn require_exclusive_address(
        &self,
        listed: &Value,
        deployment_id: &str,
    ) -> Result<(), ReconcileError> {
        let matches: Vec<&Value> = deployments(listed)
            .iter()
            .filter(|deployment| {
                deployment_uri(deployment).is_some_and(|uri| {
                    same_restate_address(uri, &self.config.handler_registration_uri)
                })
            })
            .copied()
            .collect();
        if matches.len() != 1
            || matches
                .first()
                .and_then(|deployment| deployment_id_of(deployment).ok())
                .as_deref()
                != Some(deployment_id)
        {
            return Err(ReconcileError::Admin(AdminError(
                "the stable effect handler address is not exclusive".to_owned(),
            )));
        }
        Ok(())
    }

    async fn require_exclusive_address_now(
        &self,
        deployment_id: &str,
    ) -> Result<(), ReconcileError> {
        let listed = self
            .admin
            .list_deployments()
            .await
            .map_err(ReconcileError::Admin)?;
        self.require_exclusive_address(&listed, deployment_id)
    }

    fn artifact_metadata(&self) -> Value {
        let artifact = super::effect_artifact::EffectHandlerArtifact {
            revision: self.artifact_revision.clone(),
        };
        let mut object = serde_json::Map::new();
        for (key, value) in super::effect_artifact::handler_metadata(&artifact) {
            object.insert(key, Value::from(value));
        }
        Value::Object(object)
    }
}

enum RegistrationMode {
    Create,
    Replace {
        artifact: String,
        contract: Value,
        deployment: Value,
        deployment_id: String,
    },
}

impl RegistrationMode {
    fn is_replace(&self) -> bool {
        matches!(self, Self::Replace { .. })
    }
}

fn deployment_id_of(document: &Value) -> Result<String, ReconcileError> {
    deployment_id(document).map(str::to_owned).ok_or_else(|| {
        ReconcileError::Admin(AdminError(
            "Restate Admin response omitted the deployment id".to_owned(),
        ))
    })
}

/// Current UTC time as `YYYY-MM-DDTHH:MM:SS.mmmZ`.
///
/// Matches the handler lease parser so registrar timestamps validate.
#[must_use]
pub fn now_utc_millis_iso() -> String {
    let millis = match std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH) {
        Ok(duration) => duration.as_millis(),
        Err(_) => 0,
    };
    format_millis_iso(millis)
}

fn format_millis_iso(millis: u128) -> String {
    const MILLIS_PER_DAY: u128 = 86_400_000;
    let days = millis / MILLIS_PER_DAY;
    let time = millis % MILLIS_PER_DAY;
    let hour = time / 3_600_000;
    let minute = (time % 3_600_000) / 60_000;
    let second = (time % 60_000) / 1000;
    let milli = time % 1000;
    let (year, month, day) = civil_from_days(days);
    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{milli:03}Z")
}

fn civil_from_days(days: u128) -> (u128, u128, u128) {
    let shifted = days + 719_468;
    let era = shifted / 146_097;
    let day_of_era = shifted % 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month = if month_prime < 10 {
        month_prime + 3
    } else {
        month_prime - 9
    };
    (if month <= 2 { year + 1 } else { year }, month, day)
}

/// Reconciliation failure surfaced on `/status`.
#[derive(Debug)]
pub enum ReconcileError {
    /// Restate admin or contract failure.
    Admin(AdminError),
    /// Readiness probe failure.
    Probe(ProbeError),
}

impl ReconcileError {
    /// Fail-closed status reason.
    #[must_use]
    pub fn reason(&self) -> String {
        let reason = match self {
            Self::Admin(error) => error.0.clone(),
            Self::Probe(error) => error.0.clone(),
        };
        if reason.is_empty() {
            "registration check failed".to_owned()
        } else {
            reason
        }
    }
}
