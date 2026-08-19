#![allow(refining_impl_trait)]

use std::env;
use std::error::Error;
use std::net::SocketAddr;
use std::sync::Arc;

use connectrpc::Router;
use zoen_adapters::{CedarPolicyEvaluator, PostgresAuthorityStore};
use zoen_core::WorkloadId;
use zoen_engine::{
    ActionEngine, DefinitionEngine, EffectEngine, HistoryEngine, WorldEngine,
};
use zoen_query::QueryRuntime;
use zoend::config::object_store_config;

use crate::action_service::ActionServiceImpl;
use crate::auth::SessionRegistry;
use crate::effect_service::EffectServiceImpl;
use crate::history_service::HistoryServiceImpl;
use crate::service::DefinitionServiceImpl;
use crate::world_service::WorldServiceImpl;

mod action_service;
mod auth;
mod effect_service;
mod history_service;
mod service;
mod world_service;

pub mod proto {
    connectrpc::include_generated!();
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error + Send + Sync>> {
    let database_url = env::var("DATABASE_URL")?;
    let sessions = match env::var("ZOEN_OIDC_ISSUER") {
        Ok(issuer) => SessionRegistry::from_oidc(issuer, env::var("ZOEN_OIDC_AUDIENCE")?).await?,
        Err(env::VarError::NotPresent) => {
            SessionRegistry::from_json(&env::var("ZOEN_SESSION_TOKENS")?)?
        }
        Err(error) => return Err(error.into()),
    };
    let policy = match env::var("ZOEN_CEDAR_POLICY_MANIFEST") {
        Ok(path) => CedarPolicyEvaluator::from_path(path)?,
        Err(env::VarError::NotPresent) => CedarPolicyEvaluator::from_json(r#"{"policies":[]}"#)?,
        Err(error) => return Err(error.into()),
    };
    let listen_address = env::var("ZOEN_LISTEN_ADDR")
        .unwrap_or_else(|_| "127.0.0.1:8080".to_owned())
        .parse::<SocketAddr>()?;
    let store = PostgresAuthorityStore::connect(&database_url).await?;
    let query = QueryRuntime::new(store.pool(), object_store_config()?);
    let action_service = ActionServiceImpl::new(
        ActionEngine::new(store.clone(), query.clone(), policy),
        sessions.clone(),
    );
    let definition_service =
        DefinitionServiceImpl::new(DefinitionEngine::new(store.clone()), sessions.clone());
    let effect_worker_workload = WorkloadId::parse(
        env::var("ZOEN_EFFECT_WORKER_WORKLOAD_ID")
            .unwrap_or_else(|_| "workload.effect-worker".to_owned()),
    )?;
    let effect_reconciler_workload = WorkloadId::parse(
        env::var("ZOEN_EFFECT_RECONCILER_WORKLOAD_ID")
            .unwrap_or_else(|_| "workload.effect-reconciler".to_owned()),
    )?;
    let effect_service = EffectServiceImpl::new(
        EffectEngine::new(
            store.clone(),
            effect_worker_workload,
            effect_reconciler_workload,
        ),
        sessions.clone(),
    );
    let history_service =
        HistoryServiceImpl::new(HistoryEngine::new(store.clone()), sessions.clone());
    let world_service = WorldServiceImpl::new(WorldEngine::new(store), query, sessions);
    let application = Router::new()
        .add_service(Arc::new(action_service))
        .add_service(Arc::new(definition_service))
        .add_service(Arc::new(effect_service))
        .add_service(Arc::new(history_service))
        .add_service(Arc::new(world_service))
        .into_axum_router();
    let listener = tokio::net::TcpListener::bind(listen_address).await?;

    axum::serve(listener, application)
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
}
