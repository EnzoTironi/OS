use std::time::Duration;

use reqwest::{Client, StatusCode, Url};
use serde::{Deserialize, Serialize};

use crate::effect_dispatcher::{
    DispatchAcceptance, DispatchScheduleCommand, DispatchScheduleError, DispatchScheduler,
};

const SCHEDULER_SEND_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Clone)]
pub struct RivetEffectScheduler {
    client: Client,
    ingest: Url,
    timeout: Duration,
}

impl RivetEffectScheduler {
    #[must_use]
    pub fn new(ingest: Url) -> Self {
        Self {
            client: Client::new(),
            ingest,
            timeout: SCHEDULER_SEND_TIMEOUT,
        }
    }
}

impl DispatchScheduler for RivetEffectScheduler {
    async fn schedule(
        &self,
        command: &DispatchScheduleCommand,
    ) -> Result<DispatchAcceptance, DispatchScheduleError> {
        let key = rivet_effect_key(command);
        let mut url = self.ingest.clone();
        url.path_segments_mut()
            .map_err(|()| {
                DispatchScheduleError::InvalidResponse(
                    "Rivet ingest URL cannot hold path segments".to_owned(),
                )
            })?
            .extend(["schedule"]);
        let response = self
            .client
            .post(url)
            .timeout(self.timeout)
            .header("idempotency-key", &key)
            .json(&RivetEffectInput {
                dispatch_version: command.knowledge_commit_sequence,
                effect_request_id: command.effect_request_id.as_str(),
                tenant_id: command.tenant_id.as_str(),
            })
            .send()
            .await
            .map_err(|error| DispatchScheduleError::Unavailable(error.to_string()))?;
        let status = response.status();
        let bytes = response
            .bytes()
            .await
            .map_err(|error| DispatchScheduleError::InvalidResponse(error.to_string()))?;
        if status != StatusCode::ACCEPTED && status != StatusCode::OK {
            return Err(DispatchScheduleError::Rejected(format!(
                "HTTP {status}: {}",
                String::from_utf8_lossy(&bytes)
            )));
        }
        let accepted = serde_json::from_slice::<RivetAccepted>(&bytes)
            .map_err(|error| DispatchScheduleError::InvalidResponse(error.to_string()))?;
        if accepted.actor_key.is_empty() {
            return Err(DispatchScheduleError::InvalidResponse(
                "actor key is empty".to_owned(),
            ));
        }
        Ok(DispatchAcceptance {
            invocation_id: accepted.actor_key,
        })
    }
}

#[must_use]
pub fn rivet_effect_key(command: &DispatchScheduleCommand) -> String {
    format!(
        "{}:{}:{}",
        command.tenant_id.as_str(),
        command.effect_request_id.as_str(),
        command.knowledge_commit_sequence
    )
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RivetEffectInput<'a> {
    dispatch_version: u64,
    effect_request_id: &'a str,
    tenant_id: &'a str,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RivetAccepted {
    actor_key: String,
}

#[cfg(test)]
mod tests {
    use std::time::{Duration, Instant};

    use zoen_core::{EffectRequestId, TenantId};

    use reqwest::{Client, Url};

    use super::{RivetEffectScheduler, rivet_effect_key};
    use crate::effect_dispatcher::{
        DispatchScheduleCommand, DispatchScheduleError, DispatchScheduler,
    };

    fn with_timeout(ingest: Url, timeout: Duration) -> RivetEffectScheduler {
        RivetEffectScheduler {
            client: Client::new(),
            ingest,
            timeout,
        }
    }

    fn command() -> DispatchScheduleCommand {
        DispatchScheduleCommand {
            effect_request_id: EffectRequestId::parse("effect.action.operation.1.0")
                .expect("effect request id"),
            knowledge_commit_sequence: 12,
            tenant_id: TenantId::parse("tenant.a").expect("tenant id"),
        }
    }

    #[test]
    fn key_contains_trusted_tenant_and_effect_identity() {
        assert_eq!(
            rivet_effect_key(&command()),
            "tenant.a:effect.action.operation.1.0:12"
        );
    }

    #[tokio::test]
    async fn hung_send_is_unavailable_before_the_lock_would_stall() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("listener");
        let addr = listener.local_addr().expect("addr");
        let _hold = std::thread::spawn(move || {
            let _accepted = listener.accept();
            std::thread::sleep(Duration::from_secs(30));
        });
        let scheduler = with_timeout(
            format!("http://{addr}").parse().expect("url"),
            Duration::from_millis(200),
        );
        let started = Instant::now();
        let result = scheduler.schedule(&command()).await;
        assert!(started.elapsed() < Duration::from_secs(2));
        assert!(matches!(result, Err(DispatchScheduleError::Unavailable(_))));
    }
}
