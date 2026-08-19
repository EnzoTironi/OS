#![allow(refining_impl_trait)]

use std::env;
use std::error::Error;
use std::net::SocketAddr;
use std::sync::Arc;

use connectrpc::Router;
use zoen_adapters::PostgresAuthorityStore;
use zoen_engine::{DefinitionEngine, WorldEngine};
use zoen_query::QueryRuntime;
use zoend::config::object_store_config;

use crate::auth::SessionRegistry;
use crate::service::DefinitionServiceImpl;
use crate::world_service::WorldServiceImpl;

mod auth;
mod service;
mod world_service;

pub mod proto {
    connectrpc::include_generated!();
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error + Send + Sync>> {
    let database_url = env::var("DATABASE_URL")?;
    let sessions = SessionRegistry::from_json(&env::var("ZOEN_SESSION_TOKENS")?)?;
    let listen_address = env::var("ZOEN_LISTEN_ADDR")
        .unwrap_or_else(|_| "127.0.0.1:8080".to_owned())
        .parse::<SocketAddr>()?;
    let store = PostgresAuthorityStore::connect(&database_url).await?;
    let query = QueryRuntime::new(store.pool(), object_store_config()?);
    let definition_service =
        DefinitionServiceImpl::new(DefinitionEngine::new(store.clone()), sessions.clone());
    let world_service = WorldServiceImpl::new(WorldEngine::new(store), query, sessions);
    let application = Router::new()
        .add_service(Arc::new(definition_service))
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
