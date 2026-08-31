use std::time::Duration;

use reqwest::{Client, StatusCode, Url};
use serde::{Deserialize, Serialize};

use crate::effect_dispatcher::{
    DispatchAcceptance, DispatchScheduleCommand, DispatchScheduleError, DispatchScheduler,
};

const RESTATE_SEND_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Clone)]
pub struct RestateEffectScheduler {
    client: Client,
    ingress: Url,
    timeout: Duration,
}

impl RestateEffectScheduler {
    #[must_use]
    pub fn new(ingress: Url) -> Self {
        Self {
            client: Client::new(),
            ingress,
            timeout: RESTATE_SEND_TIMEOUT,
        }
    }
}

impl DispatchScheduler for RestateEffectScheduler {
    async fn schedule(
        &self,
        command: &DispatchScheduleCommand,
    ) -> Result<DispatchAcceptance, DispatchScheduleError> {
        let key = restate_effect_key(command);
        let mut url = self.ingress.clone();
        url.path_segments_mut()
            .map_err(|()| {
                DispatchScheduleError::InvalidResponse(
                    "Restate ingress URL cannot hold path segments".to_owned(),
                )
            })?
            .extend(["restate", "send", "ZoenEffect", &key, "execute"]);
        let response = self
            .client
            .post(url)
            .timeout(self.timeout)
            .header("idempotency-key", &key)
            .json(&RestateEffectInput {
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
        let accepted = serde_json::from_slice::<RestateAccepted>(&bytes)
            .map_err(|error| DispatchScheduleError::InvalidResponse(error.to_string()))?;
        if accepted.invocation_id.is_empty() {
            return Err(DispatchScheduleError::InvalidResponse(
                "invocation id is empty".to_owned(),
            ));
        }
        Ok(DispatchAcceptance {
            invocation_id: accepted.invocation_id,
        })
    }
}

#[must_use]
pub fn restate_effect_key(command: &DispatchScheduleCommand) -> String {
    format!(
        "{}:{}:{}",
        command.tenant_id.as_str(),
        command.effect_request_id.as_str(),
        command.knowledge_commit_sequence
    )
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RestateEffectInput<'a> {
    dispatch_version: u64,
    effect_request_id: &'a str,
    tenant_id: &'a str,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RestateAccepted {
    invocation_id: String,
}

#[cfg(test)]
mod tests {
    use std::time::{Duration, Instant};

    use zoen_core::{EffectRequestId, TenantId};

    use reqwest::{Client, Url};

    use super::{RestateEffectScheduler, restate_effect_key};
    use crate::effect_dispatcher::{
        DispatchScheduleCommand, DispatchScheduleError, DispatchScheduler,
    };

    fn with_timeout(ingress: Url, timeout: Duration) -> RestateEffectScheduler {
        RestateEffectScheduler {
            client: Client::new(),
            ingress,
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
            restate_effect_key(&command()),
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
