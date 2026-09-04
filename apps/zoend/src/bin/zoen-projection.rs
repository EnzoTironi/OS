use std::{env, error::Error, time::Duration};

use serde_json::json;
use zoen_adapters::PostgresAuthorityStore;
use zoen_core::WorldId;
use zoen_query::{ProjectionMode, ProjectionOutcome, ProjectionRunOptions, ProjectionWorker};
use zoend::config::object_store_config;

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error + Send + Sync>> {
    let arguments = env::args().skip(1).collect::<Vec<_>>();
    if matches!(arguments.as_slice(), [command] if command == "--help" || command == "-h") {
        print_help();
        return Ok(());
    }
    tokio::select! {
        result = run(arguments) => result,
        result = shutdown_signal() => result,
    }
}

async fn run(arguments: Vec<String>) -> Result<(), Box<dyn Error + Send + Sync>> {
    reject_ambient_authority_credentials()?;
    let worker_url = projection_worker_url(env::var("ZOEN_PROJECTION_DATABASE_URL"))?;
    eprintln!("zoen-projection: worker pool from ZOEN_PROJECTION_DATABASE_URL");
    let store = PostgresAuthorityStore::connect_pool(&worker_url).await?;
    store.require_projection_role_boundary().await?;
    let object_store = object_store_config()?.ok_or("S3 storage is required for projection")?;
    let worker = ProjectionWorker::new(store.pool(), &object_store)?;
    match arguments.as_slice() {
        [] => run_continuously(&worker, projection_tenant()?).await,
        [command, tenant] if command == "--once" => {
            let outcome = worker
                .run_once(&WorldId::parse(tenant)?, ProjectionRunOptions::default())
                .await?;
            print_outcome(&outcome);
            Ok(())
        }
        [command, tenant] if command == "--rebuild" => {
            let outcome = worker
                .run_once(
                    &WorldId::parse(tenant)?,
                    ProjectionRunOptions {
                        mode: ProjectionMode::Rebuild,
                    },
                )
                .await?;
            print_outcome(&outcome);
            Ok(())
        }
        _ => Err("usage: zoen-projection [--once|--rebuild <tenant>]".into()),
    }
}

async fn run_continuously(
    worker: &ProjectionWorker,
    tenant: WorldId,
) -> Result<(), Box<dyn Error + Send + Sync>> {
    let interval = env::var("ZOEN_PROJECTION_INTERVAL_MS")
        .unwrap_or_else(|_| "5000".to_owned())
        .parse::<u64>()?;
    if interval == 0 {
        return Err("ZOEN_PROJECTION_INTERVAL_MS must be greater than zero".into());
    }
    loop {
        match worker
            .run_once(&tenant, ProjectionRunOptions::default())
            .await
        {
            Ok(outcome) if outcome.wrote_manifest => print_outcome(&outcome),
            Ok(_) => {}
            Err(error) => eprintln!("projection failed for {tenant}: {error}"),
        }
        tokio::time::sleep(Duration::from_millis(interval)).await;
    }
}

fn projection_worker_url(
    configured: Result<String, env::VarError>,
) -> Result<String, Box<dyn Error + Send + Sync>> {
    let url = match configured {
        Err(env::VarError::NotPresent) => {
            return Err("ZOEN_PROJECTION_DATABASE_URL is required".into());
        }
        Err(error) => return Err(error.into()),
        Ok(url) if url.is_empty() => {
            return Err("ZOEN_PROJECTION_DATABASE_URL is set but empty".into());
        }
        Ok(url) => url,
    };
    let parsed = reqwest::Url::parse(&url)
        .map_err(|error| format!("ZOEN_PROJECTION_DATABASE_URL is invalid: {error}"))?;
    if !matches!(parsed.scheme(), "postgres" | "postgresql") {
        return Err("ZOEN_PROJECTION_DATABASE_URL must use postgres or postgresql".into());
    }
    if parsed.username().is_empty()
        || parsed.password().is_none_or(str::is_empty)
        || parsed.host_str().is_none()
        || parsed.path().trim_matches('/').is_empty()
    {
        return Err(
            "ZOEN_PROJECTION_DATABASE_URL must include an explicit user, non-empty password, host, and database"
                .into(),
        );
    }
    Ok(url)
}

fn reject_ambient_authority_credentials() -> Result<(), Box<dyn Error + Send + Sync>> {
    for variable in [
        "DATABASE_URL",
        "ZOEN_APP_PASSWORD",
        "ZOEN_AUTH_DATABASE_URL",
        "POSTGRES_PASSWORD",
        "PGAPPNAME",
        "PGDATABASE",
        "PGHOST",
        "PGHOSTADDR",
        "PGPASSWORD",
        "PGPASSFILE",
        "PGPORT",
        "PGSERVICE",
        "PGSERVICEFILE",
        "PGSSLCERT",
        "PGSSLKEY",
        "PGSSLMODE",
        "PGSSLROOTCERT",
        "PGUSER",
        "PGOPTIONS",
    ] {
        if env::var_os(variable).is_some() {
            return Err(format!("{variable} must not be present in zoen-projection").into());
        }
    }
    Ok(())
}

fn projection_tenant() -> Result<WorldId, Box<dyn Error + Send + Sync>> {
    Ok(WorldId::parse(&env::var("ZOEN_TENANT_ID")?)?)
}

async fn shutdown_signal() -> Result<(), Box<dyn Error + Send + Sync>> {
    let mut terminate = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())?;
    tokio::select! {
        result = tokio::signal::ctrl_c() => {
            result?;
            Ok(())
        }
        received = terminate.recv() => match received {
            Some(()) => Ok(()),
            None => Err(std::io::Error::other("SIGTERM listener closed").into()),
        }
    }
}

fn print_outcome(outcome: &ProjectionOutcome) {
    println!(
        "{}",
        json!({
            "manifestDigest": outcome.manifest_digest,
            "manifestObjectKey": outcome.manifest_object_key,
            "parquetDigest": outcome.parquet_digest,
            "parquetObjectKey": outcome.parquet_object_key,
            "projectedRows": outcome.projected_rows,
            "throughCommit": outcome.through_commit,
            "wroteManifest": outcome.wrote_manifest,
        })
    );
}

fn print_help() {
    println!(
        "Usage:
  zoen-projection
  zoen-projection --once <tenant>
  zoen-projection --rebuild <tenant>

The default command continuously projects the canonical ZOEN_TENANT_ID.

ZOEN_PROJECTION_DATABASE_URL is the only accepted database connection source.
It must belong to the exact least-privilege zoen_projection role. Generic
authority URLs/passwords and libpq credential, service, or option overrides are
rejected when present.

Examples:
  ZOEN_TENANT_ID=tenant.a zoen-projection
  zoen-projection --once tenant.a
  zoen-projection --rebuild tenant.a"
    );
}
