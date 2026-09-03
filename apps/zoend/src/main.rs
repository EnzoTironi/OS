#![allow(refining_impl_trait)]

use std::{
    collections::{BTreeMap, BTreeSet},
    env,
    error::Error,
    net::SocketAddr,
    sync::{Arc, Mutex},
};

use axum::{
    Router as HttpRouter,
    extract::State,
    http::{StatusCode, header},
    response::IntoResponse,
    routing::get,
};
use clap::Parser;
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
use zoend::{
    config::{self, ProcessAuth, object_store_config},
    integrity::{self, StateClassification},
    session::SessionExchange,
};

use crate::{
    action_service::ActionServiceImpl, computation_service::ComputationServiceImpl,
    effect_service::EffectServiceImpl, history_service::HistoryServiceImpl,
    identity_admin::IdentityAdminState, pack_admin::PackAdminState,
    pack_registry::PackRegistryState, service::DefinitionServiceImpl,
    workload_ingress_service::WorkloadIngressState, world_service::WorldServiceImpl,
};

mod action_service;
mod cli;
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

mod proto {
    pub use zoen_proto::*;
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error + Send + Sync>> {
    let cli = cli::Cli::parse();
    if cli.skill {
        return cli::print_skill();
    }
    match cli.command {
        None => cli::print_root_help(),
        Some(cli::Command::Serve) => match serve().await {
            Ok(()) => Ok(()),
            Err(error) => {
                eprintln!("Error: {error}");
                std::process::exit(1);
            }
        },
        Some(command) => cli::run(command).await,
    }
}

async fn serve() -> Result<(), Box<dyn Error + Send + Sync>> {
    let boot = boot_runtime().await?;
    let application = build_application(boot)?;
    let listener = tokio::net::TcpListener::bind(application.listen_address).await?;
    axum::serve(listener, application.router)
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}

struct BootRuntime {
    classification: Arc<StateClassification>,
    credentials: PostgresWorkloadCredentialStore,
    identity: PostgresIdentityStore,
    listen_address: SocketAddr,
    policy: Arc<CedarPolicyEvaluator>,
    query: QueryRuntime,
    require_reference: bool,
    sessions: SessionExchange,
    store: PostgresAuthorityStore,
}

struct Application {
    listen_address: SocketAddr,
    router: HttpRouter,
}

struct OntologyServices {
    action: ActionServiceImpl,
    computation: ComputationServiceImpl,
    definition: DefinitionServiceImpl,
    effect: EffectServiceImpl,
    history: HistoryServiceImpl,
    read: ReadEngine<QueryRuntime, Arc<CedarPolicyEvaluator>>,
    world: WorldServiceImpl,
}

async fn boot_runtime() -> Result<BootRuntime, Box<dyn Error + Send + Sync>> {
    let database_url = required_database_url()?;
    let ProcessAuth::SessionDoor { auth_database_url } = config::process_auth()?;
    let policy = Arc::new(CedarPolicyEvaluator::from_path(
        config::cedar_manifest_path()?,
    )?);
    let listen_address = listen_address()?;
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
    );
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
    Ok(BootRuntime {
        classification,
        credentials,
        identity,
        listen_address,
        policy,
        query,
        require_reference,
        sessions,
        store,
    })
}

fn build_application(boot: BootRuntime) -> Result<Application, Box<dyn Error + Send + Sync>> {
    let listen_address = boot.listen_address;
    let services = build_engines(&boot)?;
    let router = build_routers(boot, services)?;
    Ok(Application {
        listen_address,
        router,
    })
}

fn build_engines(boot: &BootRuntime) -> Result<OntologyServices, Box<dyn Error + Send + Sync>> {
    let read = ReadEngine::new(boot.query.clone(), boot.policy.clone());
    let action = ActionServiceImpl::new(
        ActionEngine::new(boot.store.clone(), boot.query.clone(), boot.policy.clone()),
        boot.sessions.clone(),
    );
    let computation = ComputationServiceImpl::new(
        boot.store.clone(),
        boot.query.clone(),
        boot.policy.clone(),
        boot.sessions.clone(),
    )?;
    let definition = DefinitionServiceImpl::new(
        DefinitionEngine::new(boot.store.clone(), boot.policy.clone()),
        boot.sessions.clone(),
    );
    let effect_worker_workload = WorkloadId::parse(
        env::var("ZOEN_EFFECT_WORKER_WORKLOAD_ID")
            .unwrap_or_else(|_| "workload.effect-worker".to_owned()),
    )?;
    let effect_reconciler_workload = WorkloadId::parse(
        env::var("ZOEN_EFFECT_RECONCILER_WORKLOAD_ID")
            .unwrap_or_else(|_| "workload.effect-reconciler".to_owned()),
    )?;
    let human_executor_workloads =
        parse_workload_set(&env::var("ZOEN_HUMAN_EXECUTOR_WORKLOAD_IDS").unwrap_or_default())?;
    let effect = EffectServiceImpl::new(
        EffectEngine::new(
            boot.store.clone(),
            effect_worker_workload,
            effect_reconciler_workload,
        )
        .with_allowed_executor_workloads(human_executor_workloads),
        boot.sessions.clone(),
    );
    let history = HistoryServiceImpl::new(
        HistoryEngine::new(boot.store.clone()),
        read.clone(),
        boot.sessions.clone(),
    );
    let world = WorldServiceImpl::new(
        WorldEngine::new(boot.store.clone()),
        read.clone(),
        ScenarioEngine::new(
            boot.store.clone(),
            ActionEngine::new(boot.store.clone(), boot.query.clone(), boot.policy.clone()),
        ),
        boot.sessions.clone(),
    );
    Ok(OntologyServices {
        action,
        computation,
        definition,
        effect,
        history,
        read,
        world,
    })
}

fn build_routers(
    boot: BootRuntime,
    services: OntologyServices,
) -> Result<HttpRouter, Box<dyn Error + Send + Sync>> {
    let identity_admin_token = env::var("ZOEN_IDENTITY_ADMIN_TOKEN")
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty());
    let pack_routes = pack_admin::router(PackAdminState {
        packs: PostgresPackStore::new(boot.store.pool()),
        definitions: DefinitionEngine::new(boot.store.clone(), boot.policy.clone()),
        sessions: boot.sessions.clone(),
    });
    let pack_registry_routes = pack_registry::router(PackRegistryState {
        registry: PostgresPackRegistryStore::new(boot.store.pool()),
        sessions: boot.sessions.clone(),
    });
    let identity_routes = identity_admin::router(IdentityAdminState {
        admin_token: identity_admin_token.clone(),
        identity: boot.identity.clone(),
        sessions: boot.sessions.clone(),
    });
    let conversation_routes =
        conversation_stage::router(conversation_stage::ConversationStageState {
            admin_token: identity_admin_token,
            identity: boot.identity.clone(),
            read: services.read,
            sessions: boot.sessions.clone(),
            stages: Arc::new(Mutex::new(BTreeMap::new())),
        });
    let onboard_routes = onboard::router(boot.identity);
    let messaging_routes = messaging_ingress::router(messaging_ingress::from_env(
        PostgresIngressReplayStore::new(boot.store.pool()),
    ));
    let workload_routes = workload_ingress_service::router(WorkloadIngressState {
        credentials: boot.credentials,
        signals: PostgresExternalSignalStore::new(boot.store.pool()),
        sessions: boot.sessions.clone(),
    });
    let rpc = Router::new()
        .add_service(Arc::new(services.action))
        .add_service(Arc::new(services.computation))
        .add_service(Arc::new(services.definition))
        .add_service(Arc::new(services.effect))
        .add_service(Arc::new(services.history))
        .add_service(Arc::new(services.world))
        .into_axum_router();
    let ready_routes = HttpRouter::new()
        .route("/ready", get(ready))
        .with_state(ReadyState {
            classification: boot.classification,
            require_reference: boot.require_reference,
            store: boot.store,
        });
    Ok(HttpRouter::new()
        .route("/metrics", get(metrics))
        .merge(ready_routes)
        .merge(door_proxy::router()?)
        .merge(eve_proxy::router())
        .merge(identity_routes)
        .merge(conversation_routes)
        .merge(onboard_routes)
        .merge(messaging_routes)
        .merge(workload_routes)
        .merge(pack_routes)
        .merge(pack_registry_routes)
        .merge(rpc))
}

fn required_database_url() -> Result<String, Box<dyn Error + Send + Sync>> {
    match env::var("DATABASE_URL") {
        Ok(value) if !value.trim().is_empty() => Ok(value),
        Ok(_) | Err(env::VarError::NotPresent) => Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "DATABASE_URL is required",
        )
        .into()),
        Err(error) => Err(error.into()),
    }
}

fn listen_address() -> Result<SocketAddr, Box<dyn Error + Send + Sync>> {
    Ok(env::var("ZOEN_LISTEN_ADDR")
        .unwrap_or_else(|_| "127.0.0.1:8080".to_owned())
        .parse()?)
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

fn parse_workload_set(value: &str) -> Result<BTreeSet<WorkloadId>, Box<dyn Error + Send + Sync>> {
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
