//! Production `ZoenEffect` Restate handler binary.
//!
//! Serves the exclusive `ZoenEffect::execute` virtual object plus the baked
//! artifact identity document on one cleartext HTTP/2 port.

#[path = "effect_artifact.rs"]
mod effect_artifact;

#[path = "zoen-effect-handler/config.rs"]
mod config;
#[path = "zoen-effect-handler/connector.rs"]
mod connector;
#[path = "zoen-effect-handler/effect_service.rs"]
mod effect_service;
#[path = "zoen-effect-handler/lease.rs"]
mod lease;
#[path = "zoen-effect-handler/server.rs"]
mod server;
#[path = "zoen-effect-handler/service.rs"]
mod service;

use std::error::Error;

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error + Send + Sync>> {
    let config = config::load_config().map_err(|error| {
        eprintln!("effect handler configuration is invalid: {error}");
        error
    })?;
    let artifact_path = effect_artifact::artifact_path(
        std::env::var("ZOEN_EFFECT_HANDLER_ARTIFACT_FILE")
            .ok()
            .as_deref(),
    )
    .map_err(|error| {
        eprintln!("{error}");
        error
    })?;
    let artifact = effect_artifact::load_artifact(&artifact_path).map_err(|error| {
        eprintln!("{error}");
        error
    })?;
    let effect_service = effect_service::EffectServiceClient::new(&config).map_err(|error| {
        eprintln!("effect handler failed to start: {error}");
        error
    })?;
    let connector = connector::ConnectorClient::new(&config.connector, &config.identity.tenant_id)
        .map_err(|error| {
            eprintln!("effect handler failed to start: {error}");
            error
        })?;
    let lease = lease::RegistrationLease::new(&config.registration).map_err(|error| {
        eprintln!("effect handler failed to start: {error}");
        error
    })?;
    let handler = service::ZoenEffect::new(
        config.identity.tenant_id.clone(),
        artifact.revision.clone(),
        connector,
        effect_service,
        lease,
    );
    server::serve(&config, &artifact, handler).await?;
    Ok(())
}
