//! Effect registration reconciler binary.
//!
//! Owns the stable Restate URI: it admits exactly one `ZoenEffect`
//! deployment per artifact revision and reports the lease on 9082.

#[path = "effect_artifact.rs"]
mod effect_artifact;

#[path = "zoen-effect-registrar/admin.rs"]
mod admin;
#[path = "zoen-effect-registrar/config.rs"]
mod config;
#[path = "zoen-effect-registrar/probe_server.rs"]
mod probe_server;
#[path = "zoen-effect-registrar/probes.rs"]
mod probes;
#[path = "zoen-effect-registrar/registration.rs"]
mod registration;

use std::{
    error::Error,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};

use registration::{Reconciler, RegistrationState, now_utc_millis_iso};

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error + Send + Sync>> {
    let config = config::load_config().map_err(|error| {
        eprintln!("effect registrar configuration is invalid: {error}");
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
    let reconciler = Reconciler::new(&config, &artifact.revision).map_err(|error| {
        eprintln!("effect registrar failed to start: {}", error.reason());
        Box::<dyn Error + Send + Sync>::from(error.reason())
    })?;

    let state = Arc::new(Mutex::new(RegistrationState {
        artifact: artifact.revision.clone(),
        deployment_id: None,
        ready: false,
        reason: "registration has not been checked".to_owned(),
        updated_at: now_utc_millis_iso(),
    }));
    let listener = tokio::net::TcpListener::bind(format!(
        "{}:{}",
        config.registrar_host, config.registrar_port
    ))
    .await
    .map_err(|error| {
        eprintln!("effect registrar probe failed to bind: {error}");
        error
    })?;
    println!(
        "effect registrar probe listening on {}:{}",
        config.registrar_host, config.registrar_port
    );
    let stopping = Arc::new(AtomicBool::new(false));
    install_shutdown_handlers(Arc::clone(&stopping));

    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
    let probe = probe_server::router(Arc::clone(&state));
    let probe_task = tokio::spawn(async move {
        axum::serve(listener, probe)
            .with_graceful_shutdown(async {
                let _ = shutdown_rx.await;
            })
            .await
    });

    run_registration_loop(&reconciler, &state, &stopping, &config).await;

    let _ = shutdown_tx.send(());
    match probe_task.await {
        Ok(Ok(())) => Ok(()),
        Ok(Err(error)) => {
            eprintln!("effect registrar probe failed: {error}");
            Err(error.into())
        }
        Err(error) => {
            eprintln!("effect registrar probe task failed: {error}");
            Err(error.into())
        }
    }
}

async fn run_registration_loop(
    reconciler: &Reconciler,
    state: &probe_server::SharedState,
    stopping: &AtomicBool,
    config: &config::RegistrarConfig,
) {
    loop {
        match reconciler.reconcile().await {
            Ok(deployment_id) => {
                update_state(
                    state,
                    true,
                    "exact registration verified",
                    Some(deployment_id),
                );
            }
            Err(error) => {
                update_state(state, false, &error.reason(), None);
            }
        }
        if stopping.load(Ordering::SeqCst) {
            break;
        }
        tokio::select! {
            () = tokio::time::sleep(Duration::from_millis(config.registration_interval_ms)) => {}
            () = wait_for_shutdown(stopping) => {
                break;
            }
        }
    }
}

async fn wait_for_shutdown(stopping: &AtomicBool) {
    while !stopping.load(Ordering::SeqCst) {
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
}

fn update_state(
    state: &probe_server::SharedState,
    ready: bool,
    reason: &str,
    deployment_id: Option<String>,
) {
    let changed = state.lock().is_ok_and(|guard| {
        guard.ready != ready || guard.reason != reason || guard.deployment_id != deployment_id
    });
    if changed {
        println!(
            "effect registration state: {}: {reason}",
            if ready { "ready" } else { "blocked" }
        );
    }
    if let Ok(mut guard) = state.lock() {
        guard.ready = ready;
        reason.clone_into(&mut guard.reason);
        guard.deployment_id = deployment_id;
        guard.updated_at = now_utc_millis_iso();
    }
}

fn install_shutdown_handlers(stopping: Arc<AtomicBool>) {
    let interrupt = Arc::clone(&stopping);
    tokio::spawn(async move {
        let _ = tokio::signal::ctrl_c().await;
        interrupt.store(true, Ordering::SeqCst);
    });
    tokio::spawn(async move {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut signal) => {
                signal.recv().await;
                stopping.store(true, Ordering::SeqCst);
            }
            Err(_) => std::future::pending::<()>().await,
        }
    });
}
