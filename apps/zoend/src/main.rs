#![allow(refining_impl_trait)]

use std::env;
use std::error::Error;
use std::net::SocketAddr;
use std::sync::Arc;

use connectrpc::Router;
use zoen_adapters::PostgresAuthorityStore;
use zoen_engine::DefinitionEngine;

use crate::auth::SessionRegistry;
use crate::service::DefinitionServiceImpl;

mod auth;
mod canonical;
mod service;

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
    let service = DefinitionServiceImpl::new(DefinitionEngine::new(store), sessions);
    let application = Router::new()
        .add_service(Arc::new(service))
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
