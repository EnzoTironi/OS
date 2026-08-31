use std::{env, error::Error, time::Duration};

use reqwest::Url;
use zoen_adapters::{PostgresAuthorityStore, PostgresEffectDispatcher, RestateEffectScheduler};
use zoen_core::TenantId;

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error + Send + Sync>> {
    let store = PostgresAuthorityStore::connect(&env::var("DATABASE_URL")?).await?;
    let scheduler = RestateEffectScheduler::new(env::var("RESTATE_INGRESS")?.parse::<Url>()?);
    let dispatcher = PostgresEffectDispatcher::new(store.pool(), scheduler);
    let tenant_id = TenantId::parse(env::var("ZOEN_TENANT_ID")?)?;
    let limit = env::var("ZOEN_EFFECT_DISPATCH_BATCH_SIZE")
        .unwrap_or_else(|_| "64".to_owned())
        .parse::<u32>()?;
    if env::var("ZOEN_EFFECT_DISPATCH_ONCE").as_deref() == Ok("true") {
        dispatcher.dispatch_once(&tenant_id, limit).await?;
        return Ok(());
    }
    let interval = Duration::from_millis(
        env::var("ZOEN_EFFECT_DISPATCH_INTERVAL_MS")
            .unwrap_or_else(|_| "250".to_owned())
            .parse::<u64>()?,
    );
    loop {
        dispatcher.dispatch_once(&tenant_id, limit).await?;
        tokio::select! {
            () = tokio::time::sleep(interval) => {}
            _ = tokio::signal::ctrl_c() => return Ok(()),
        }
    }
}
