use std::{env, error::Error, time::Duration};

use reqwest::{Client, Url};
use tokio::time::Instant;
use zoen_adapters::{
    EffectDispatchOutcome, EffectDispatchResult, PostgresAuthorityStore, PostgresEffectDispatcher,
    RestateEffectScheduler,
};
use zoen_core::WorldId;

const DEFAULT_DISPATCH_INTERVAL_MS: u64 = 250;
const DEFAULT_GATE_BACKOFF_MIN_MS: u64 = 250;
const DEFAULT_GATE_BACKOFF_MAX_MS: u64 = 5_000;
const DEFAULT_GATE_TIMEOUT_MS: u64 = 30_000;

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error + Send + Sync>> {
    let store = PostgresAuthorityStore::connect(&env::var("DATABASE_URL")?).await?;
    let restate_ingress = env::var("RESTATE_INGRESS")?.parse::<Url>()?;
    require_loopback_http_url(&restate_ingress, "RESTATE_INGRESS", "/")?;
    let scheduler = RestateEffectScheduler::new(restate_ingress);
    let dispatcher = PostgresEffectDispatcher::new(store.pool(), scheduler);
    let world_id = WorldId::parse(env::var("ZOEN_TENANT_ID")?)?;
    let limit = env::var("ZOEN_EFFECT_DISPATCH_BATCH_SIZE")
        .unwrap_or_else(|_| "64".to_owned())
        .parse::<u32>()?;
    let gate = RegistrationGate::from_env()?;
    let mut shutdown = Shutdown::new()?;
    if env::var("ZOEN_EFFECT_DISPATCH_ONCE").as_deref() == Ok("true") {
        return dispatch_once_when_registered(&dispatcher, &world_id, limit, &gate, &mut shutdown)
            .await;
    }
    let interval = duration_from_env(
        "ZOEN_EFFECT_DISPATCH_INTERVAL_MS",
        DEFAULT_DISPATCH_INTERVAL_MS,
    )?;
    let mut backoff = Backoff::new(gate.backoff_min, gate.backoff_max);
    loop {
        let registered = tokio::select! {
            registered = gate.is_ready() => registered,
            signal = shutdown.wait() => {
                signal?;
                return Ok(());
            }
        };
        if !registered {
            if sleep_or_shutdown(backoff.next_delay(), &mut shutdown).await? {
                return Ok(());
            }
            continue;
        }

        let results = tokio::select! {
            results = dispatcher.dispatch_once(&world_id, limit) => results?,
            signal = shutdown.wait() => {
                signal?;
                return Ok(());
            }
        };
        if let Some(failure) = scheduler_failure(&results) {
            eprintln!(
                "effect dispatcher lost Restate admission after {:?} for {}; re-entering registration gate",
                failure.outcome, failure.effect_request_id
            );
            if sleep_or_shutdown(backoff.next_delay(), &mut shutdown).await? {
                return Ok(());
            }
            continue;
        }

        backoff.reset();
        if sleep_or_shutdown(interval, &mut shutdown).await? {
            return Ok(());
        }
    }
}

async fn dispatch_once_when_registered(
    dispatcher: &PostgresEffectDispatcher<RestateEffectScheduler>,
    world_id: &WorldId,
    limit: u32,
    gate: &RegistrationGate,
    shutdown: &mut Shutdown,
) -> Result<(), Box<dyn Error + Send + Sync>> {
    let started = Instant::now();
    let deadline = started
        .checked_add(gate.wait_timeout)
        .ok_or("registration gate timeout exceeds the supported duration")?;
    let mut backoff = Backoff::new(gate.backoff_min, gate.backoff_max);
    loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Err(gate_timeout_error(gate.wait_timeout));
        }
        let registered = tokio::select! {
            result = tokio::time::timeout(remaining, gate.is_ready()) => {
                match result {
                    Ok(registered) => registered,
                    Err(_) => return Err(gate_timeout_error(gate.wait_timeout)),
                }
            }
            signal = shutdown.wait() => {
                signal?;
                return Ok(());
            }
        };
        if registered {
            break;
        }

        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Err(gate_timeout_error(gate.wait_timeout));
        }
        let delay = backoff.next_delay().min(remaining);
        if sleep_or_shutdown(delay, shutdown).await? {
            return Ok(());
        }
    }

    let results = tokio::select! {
        results = dispatcher.dispatch_once(world_id, limit) => results?,
        signal = shutdown.wait() => {
            signal?;
            return Ok(());
        }
    };
    if let Some(failure) = scheduler_failure(&results) {
        return Err(format!(
            "Restate scheduling {:?} for {} after registration admission",
            failure.outcome, failure.effect_request_id
        )
        .into());
    }
    Ok(())
}

fn scheduler_failure(results: &[EffectDispatchResult]) -> Option<&EffectDispatchResult> {
    results
        .iter()
        .find(|result| result.outcome != EffectDispatchOutcome::Accepted)
}

fn gate_timeout_error(timeout: Duration) -> Box<dyn Error + Send + Sync> {
    format!(
        "effect registration did not become ready within {}ms",
        timeout.as_millis()
    )
    .into()
}

async fn sleep_or_shutdown(
    delay: Duration,
    shutdown: &mut Shutdown,
) -> Result<bool, std::io::Error> {
    tokio::select! {
        () = tokio::time::sleep(delay) => Ok(false),
        signal = shutdown.wait() => {
            signal?;
            Ok(true)
        }
    }
}

struct Shutdown {
    #[cfg(unix)]
    terminate: tokio::signal::unix::Signal,
}

impl Shutdown {
    fn new() -> Result<Self, std::io::Error> {
        #[cfg(unix)]
        {
            Ok(Self {
                terminate: tokio::signal::unix::signal(
                    tokio::signal::unix::SignalKind::terminate(),
                )?,
            })
        }
        #[cfg(not(unix))]
        {
            Ok(Self {})
        }
    }

    async fn wait(&mut self) -> Result<(), std::io::Error> {
        #[cfg(unix)]
        {
            tokio::select! {
                signal = tokio::signal::ctrl_c() => signal,
                _ = self.terminate.recv() => Ok(()),
            }
        }
        #[cfg(not(unix))]
        {
            tokio::signal::ctrl_c().await
        }
    }
}

struct RegistrationGate {
    backoff_max: Duration,
    backoff_min: Duration,
    client: Client,
    health_url: Url,
    wait_timeout: Duration,
}

impl RegistrationGate {
    fn from_env() -> Result<Self, Box<dyn Error + Send + Sync>> {
        let health_url = env::var("ZOEN_EFFECT_REGISTRATION_HEALTH_URL")?.parse::<Url>()?;
        require_loopback_http_url(
            &health_url,
            "ZOEN_EFFECT_REGISTRATION_HEALTH_URL",
            "/health",
        )?;
        let backoff_min = duration_from_env(
            "ZOEN_EFFECT_DISPATCH_GATE_BACKOFF_MIN_MS",
            DEFAULT_GATE_BACKOFF_MIN_MS,
        )?;
        let backoff_max = duration_from_env(
            "ZOEN_EFFECT_DISPATCH_GATE_BACKOFF_MAX_MS",
            DEFAULT_GATE_BACKOFF_MAX_MS,
        )?;
        if backoff_min > backoff_max {
            return Err(
                "ZOEN_EFFECT_DISPATCH_GATE_BACKOFF_MIN_MS must not exceed ZOEN_EFFECT_DISPATCH_GATE_BACKOFF_MAX_MS"
                    .into(),
            );
        }
        let wait_timeout = duration_from_env(
            "ZOEN_EFFECT_DISPATCH_GATE_TIMEOUT_MS",
            DEFAULT_GATE_TIMEOUT_MS,
        )?;
        let client = Client::builder()
            .timeout(backoff_max.min(wait_timeout))
            .build()?;
        Ok(Self {
            backoff_max,
            backoff_min,
            client,
            health_url,
            wait_timeout,
        })
    }

    async fn is_ready(&self) -> bool {
        self.client
            .get(self.health_url.clone())
            .send()
            .await
            .is_ok_and(|response| response.status().is_success())
    }
}

fn require_loopback_http_url(
    url: &Url,
    name: &str,
    expected_path: &str,
) -> Result<(), Box<dyn Error + Send + Sync>> {
    let loopback_host = matches!(url.host_str(), Some("127.0.0.1" | "::1" | "localhost"));
    if url.scheme() != "http"
        || !loopback_host
        || !url.username().is_empty()
        || url.password().is_some()
        || url.path() != expected_path
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(format!("{name} must be a loopback HTTP URL with path {expected_path}").into());
    }
    Ok(())
}

struct Backoff {
    current: Duration,
    initial: Duration,
    maximum: Duration,
}

impl Backoff {
    fn new(initial: Duration, maximum: Duration) -> Self {
        Self {
            current: initial,
            initial,
            maximum,
        }
    }

    fn next_delay(&mut self) -> Duration {
        let delay = self.current;
        self.current = self.current.saturating_mul(2).min(self.maximum);
        delay
    }

    fn reset(&mut self) {
        self.current = self.initial;
    }
}

fn duration_from_env(
    name: &str,
    default_millis: u64,
) -> Result<Duration, Box<dyn Error + Send + Sync>> {
    let millis = env::var(name)
        .unwrap_or_else(|_| default_millis.to_string())
        .parse::<u64>()?;
    if millis == 0 {
        return Err(format!("{name} must be greater than zero").into());
    }
    Ok(Duration::from_millis(millis))
}
