use std::env;
use std::error::Error;
use std::time::Duration;

use serde_json::json;
use zoen_adapters::PostgresAuthorityStore;
use zoen_core::TenantId;
use zoen_query::{ProjectionMode, ProjectionOutcome, ProjectionRunOptions, ProjectionWorker};
use zoend::config::object_store_config;

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error + Send + Sync>> {
    let arguments = env::args().skip(1).collect::<Vec<_>>();
    if matches!(arguments.as_slice(), [command] if command == "--help" || command == "-h") {
        print_help();
        return Ok(());
    }
    let database_url = env::var("DATABASE_URL")?;
    let store = PostgresAuthorityStore::connect(&database_url).await?;
    let object_store = object_store_config()?.ok_or("S3 storage is required for projection")?;
    let worker = ProjectionWorker::new(store.pool(), &object_store)?;
    match arguments.as_slice() {
        [] => run_continuously(&worker, projection_tenants()?).await,
        [command, tenant] if command == "--once" => {
            let outcome = worker
                .run_once(&TenantId::parse(tenant)?, ProjectionRunOptions::default())
                .await?;
            print_outcome(&outcome);
            Ok(())
        }
        [command, tenant] if command == "--rebuild" => {
            let outcome = worker
                .run_once(
                    &TenantId::parse(tenant)?,
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
    tenants: Vec<TenantId>,
) -> Result<(), Box<dyn Error + Send + Sync>> {
    let interval = env::var("ZOEN_PROJECTION_INTERVAL_MS")
        .unwrap_or_else(|_| "1000".to_owned())
        .parse::<u64>()?;
    loop {
        for tenant in &tenants {
            match worker
                .run_once(tenant, ProjectionRunOptions::default())
                .await
            {
                Ok(outcome) if outcome.wrote_manifest => print_outcome(&outcome),
                Ok(_) => {}
                Err(error) => eprintln!("projection failed for {tenant}: {error}"),
            }
        }
        tokio::select! {
            () = tokio::time::sleep(Duration::from_millis(interval)) => {}
            _ = tokio::signal::ctrl_c() => return Ok(()),
        }
    }
}

fn projection_tenants() -> Result<Vec<TenantId>, Box<dyn Error + Send + Sync>> {
    let tenants = env::var("ZOEN_PROJECTION_TENANTS")?
        .split(',')
        .map(TenantId::parse)
        .collect::<Result<Vec<_>, _>>()?;
    if tenants.is_empty() {
        Err("ZOEN_PROJECTION_TENANTS must contain at least one tenant".into())
    } else {
        Ok(tenants)
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

The default command polls tenants from ZOEN_PROJECTION_TENANTS.

Examples:
  ZOEN_PROJECTION_TENANTS=tenant.a zoen-projection
  zoen-projection --once tenant.a
  zoen-projection --rebuild tenant.a"
    );
}
