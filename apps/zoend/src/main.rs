#![allow(refining_impl_trait)]

use std::collections::{BTreeMap, BTreeSet};
use std::env;
use std::error::Error;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};

use axum::Router as HttpRouter;
use axum::extract::State;
use axum::http::{StatusCode, header};
use axum::response::IntoResponse;
use axum::routing::get;
use connectrpc::Router;
use zoen_adapters::{
    CedarPolicyEvaluator, PostgresAuthorityStore, PostgresExternalSignalStore,
    PostgresIdentityStore, PostgresIngressReplayStore, PostgresPackRegistryStore,
    PostgresPackStore, PostgresWorkloadCredentialStore, SessionDoor,
};
use zoen_core::{MachineToken, WorkloadId};
use zoen_engine::{
    ActionEngine, DefinitionEngine, EffectEngine, HistoryEngine, ReadEngine, ScenarioEngine,
    WorldEngine,
};
use zoen_query::QueryRuntime;
use zoend::config::{self, ProcessAuth, object_store_config};
use zoend::integrity::{self, StateClassification};
use zoend::session::SessionExchange;

use crate::action_service::ActionServiceImpl;
use crate::computation_service::ComputationServiceImpl;
use crate::effect_service::EffectServiceImpl;
use crate::history_service::HistoryServiceImpl;
use crate::identity_admin::IdentityAdminState;
use crate::pack_admin::PackAdminState;
use crate::pack_registry::PackRegistryState;
use crate::service::DefinitionServiceImpl;
use crate::workload_ingress_service::WorkloadIngressState;
use crate::world_service::WorldServiceImpl;

mod action_service;
mod conversation_stage;
mod session {
    pub use zoend::session::*;
}
mod computation_service;
mod door_proxy;
mod effect_service;
mod eve_proxy;
mod history_service;
mod identity_admin;
mod identity_admin_auth;
mod ingress_hmac;
mod messaging_ingress;
mod onboard;
mod pack_admin;
mod pack_registry;
mod service;
mod workload_ingress_service;
mod world_service;

pub mod proto {
    connectrpc::include_generated!();
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error + Send + Sync>> {
    let database_url = env::var("DATABASE_URL")?;
    let ProcessAuth::SessionDoor { auth_database_url } = config::process_auth()?;
    let policy = Arc::new(CedarPolicyEvaluator::from_path(
        config::cedar_manifest_path()?,
    )?);
    let listen_address = env::var("ZOEN_LISTEN_ADDR")
        .unwrap_or_else(|_| "127.0.0.1:8080".to_owned())
        .parse::<SocketAddr>()?;
    let store = PostgresAuthorityStore::connect(&database_url).await?;
    let identity = PostgresIdentityStore::new(store.pool());
    let credentials = PostgresWorkloadCredentialStore::new(store.pool());
    let machine = env::var("ZOEN_IDENTITY_ADMIN_TOKEN")
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
        .and_then(|value| MachineToken::parse(value).ok());
    let sessions = SessionExchange::from_door(
        SessionDoor::connect(&auth_database_url).await?,
        identity.clone(),
        credentials.clone(),
        machine,
    )?;
    let classification = Arc::new(integrity::load_classification()?);
    let require_reference = integrity::require_reference_tables();
    store
        .verify_integrity(
            &classification.authority.postgres_tables,
            &classification.authority.reference_tables,
            require_reference,
        )
        .await?;
    let query = QueryRuntime::new(store.pool(), object_store_config()?);
    let read = ReadEngine::new(query.clone(), policy.clone());
    let action_service = ActionServiceImpl::new(
        ActionEngine::new(store.clone(), query.clone(), policy.clone()),
        sessions.clone(),
    );
    let computation_service = ComputationServiceImpl::new(
        store.clone(),
        query.clone(),
        policy.clone(),
        sessions.clone(),
    )?;
    let definition_service = DefinitionServiceImpl::new(
        DefinitionEngine::new(store.clone(), policy.clone()),
        sessions.clone(),
    );
    let pack_routes = pack_admin::router(PackAdminState {
        packs: PostgresPackStore::new(store.pool()),
        definitions: DefinitionEngine::new(store.clone(), policy.clone()),
        sessions: sessions.clone(),
    });
    let pack_registry_routes = pack_registry::router(PackRegistryState {
        registry: PostgresPackRegistryStore::new(store.pool()),
        sessions: sessions.clone(),
    });
    let effect_worker_workload = WorkloadId::parse(
        env::var("ZOEN_EFFECT_WORKER_WORKLOAD_ID")
            .unwrap_or_else(|_| "workload.effect-worker".to_owned()),
    )?;
    let effect_reconciler_workload = WorkloadId::parse(
        env::var("ZOEN_EFFECT_RECONCILER_WORKLOAD_ID")
            .unwrap_or_else(|_| "workload.effect-reconciler".to_owned()),
    )?;
    let human_executor_workloads =
        parse_workload_set(env::var("ZOEN_HUMAN_EXECUTOR_WORKLOAD_IDS").unwrap_or_default())?;
    let effect_service = EffectServiceImpl::new(
        EffectEngine::new(
            store.clone(),
            effect_worker_workload,
            effect_reconciler_workload,
        )
        .with_allowed_executor_workloads(human_executor_workloads),
        sessions.clone(),
    );
    let history_service = HistoryServiceImpl::new(
        HistoryEngine::new(store.clone()),
        read.clone(),
        sessions.clone(),
    );
    let world_service = WorldServiceImpl::new(
        WorldEngine::new(store.clone()),
        read.clone(),
        ScenarioEngine::new(
            store.clone(),
            ActionEngine::new(store.clone(), query.clone(), policy.clone()),
        ),
        sessions.clone(),
    );
    let identity_admin_token = env::var("ZOEN_IDENTITY_ADMIN_TOKEN")
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty());
    let identity_routes = identity_admin::router(IdentityAdminState {
        admin_token: identity_admin_token.clone(),
        identity: identity.clone(),
        sessions: sessions.clone(),
    });
    let conversation_routes =
        conversation_stage::router(conversation_stage::ConversationStageState {
            admin_token: identity_admin_token,
            identity: identity.clone(),
            read: read.clone(),
            sessions: sessions.clone(),
            stages: Arc::new(Mutex::new(BTreeMap::new())),
        });
    let onboard_routes = onboard::router(identity);
    let messaging_routes = messaging_ingress::router(messaging_ingress::from_env(
        PostgresIngressReplayStore::new(store.pool()),
    ));
    let workload_routes = workload_ingress_service::router(WorkloadIngressState {
        credentials,
        signals: PostgresExternalSignalStore::new(store.pool()),
        sessions: sessions.clone(),
    });
    let rpc = Router::new()
        .add_service(Arc::new(action_service))
        .add_service(Arc::new(computation_service))
        .add_service(Arc::new(definition_service))
        .add_service(Arc::new(effect_service))
        .add_service(Arc::new(history_service))
        .add_service(Arc::new(world_service))
        .into_axum_router();
    let ready_routes = HttpRouter::new()
        .route("/ready", get(ready))
        .with_state(ReadyState {
            classification,
            require_reference,
            store,
        });
    let application = HttpRouter::new()
        .route("/metrics", get(metrics))
        .merge(ready_routes)
        .merge(door_proxy::router())
        .merge(eve_proxy::router())
        .merge(identity_routes)
        .merge(conversation_routes)
        .merge(onboard_routes)
        .merge(messaging_routes)
        .merge(workload_routes)
        .merge(pack_routes)
        .merge(pack_registry_routes)
        .merge(rpc);
    let listener = tokio::net::TcpListener::bind(listen_address).await?;

    axum::serve(listener, application)
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}

#[derive(Clone)]
struct ReadyState {
    classification: Arc<StateClassification>,
    require_reference: bool,
    store: PostgresAuthorityStore,
}

async fn metrics() -> impl IntoResponse {
    (
        [(
            header::CONTENT_TYPE,
            "text/plain; version=0.0.4; charset=utf-8",
        )],
        zoen_engine::metrics::prometheus_text(),
    )
}

async fn ready(State(state): State<ReadyState>) -> impl IntoResponse {
    match state
        .store
        .verify_integrity(
            &state.classification.authority.postgres_tables,
            &state.classification.authority.reference_tables,
            state.require_reference,
        )
        .await
    {
        Ok(()) => (StatusCode::OK, "ready\n".to_owned()),
        Err(error) => (StatusCode::SERVICE_UNAVAILABLE, format!("{error}\n")),
    }
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    let terminate = async {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut signal) => {
                signal.recv().await;
            }
            Err(_) => std::future::pending::<()>().await,
        }
    };
    tokio::select! {
        () = ctrl_c => {}
        () = terminate => {}
    }
}

fn parse_workload_set(value: String) -> Result<BTreeSet<WorkloadId>, Box<dyn Error + Send + Sync>> {
    let mut workloads = BTreeSet::new();
    for part in value.split(',') {
        let trimmed = part.trim();
        if trimmed.is_empty() {
            continue;
        }
        workloads.insert(WorkloadId::parse(trimmed)?);
    }
    Ok(workloads)
}
