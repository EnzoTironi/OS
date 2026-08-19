use reqwest::{Client, StatusCode, Url};
use serde::{Deserialize, Serialize};

use crate::effect_dispatcher::{
    DispatchAcceptance, DispatchScheduleCommand, DispatchScheduleError, DispatchScheduler,
};

#[derive(Clone)]
pub struct RestateEffectScheduler {
    client: Client,
    ingress: Url,
}

impl RestateEffectScheduler {
    pub fn new(ingress: Url) -> Self {
        Self {
            client: Client::new(),
            ingress,
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
            .map_err(|_| {
                DispatchScheduleError::InvalidResponse(
                    "Restate ingress URL cannot hold path segments".to_owned(),
                )
            })?
            .extend(["restate", "send", "ZoenEffect", &key, "execute"]);
        let response = self
            .client
            .post(url)
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
    use zoen_core::{EffectRequestId, TenantId};

    use super::restate_effect_key;
    use crate::effect_dispatcher::DispatchScheduleCommand;

    #[test]
    fn key_contains_trusted_tenant_and_effect_identity() {
        let command = DispatchScheduleCommand {
            effect_request_id: EffectRequestId::parse("effect.action.operation.1.0")
                .expect("effect request id"),
            knowledge_commit_sequence: 12,
            tenant_id: TenantId::parse("tenant.a").expect("tenant id"),
        };

        assert_eq!(
            restate_effect_key(&command),
            "tenant.a:effect.action.operation.1.0:12"
        );
    }
}
