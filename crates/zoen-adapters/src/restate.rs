use reqwest::{Client, StatusCode, Url};
use serde::{Deserialize, Serialize};
use zoen_engine::{EffectScheduleCommand, EffectScheduleError, EffectScheduler, ScheduledEffect};

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

impl EffectScheduler for RestateEffectScheduler {
    async fn schedule(
        &self,
        command: &EffectScheduleCommand,
    ) -> Result<ScheduledEffect, EffectScheduleError> {
        let key = restate_effect_key(command);
        let mut url = self.ingress.clone();
        url.path_segments_mut()
            .map_err(|_| {
                EffectScheduleError::InvalidResponse(
                    "Restate ingress URL cannot hold path segments".to_owned(),
                )
            })?
            .extend(["restate", "send", "ZoenEffect", &key, "execute"]);
        let response = self
            .client
            .post(url)
            .header("idempotency-key", &key)
            .json(&RestateEffectInput {
                effect_request_id: command.effect_request_id.as_str(),
                tenant_id: command.tenant_id.as_str(),
            })
            .send()
            .await
            .map_err(|error| EffectScheduleError::Unavailable(error.to_string()))?;
        let status = response.status();
        let bytes = response
            .bytes()
            .await
            .map_err(|error| EffectScheduleError::InvalidResponse(error.to_string()))?;
        if status != StatusCode::ACCEPTED && status != StatusCode::OK {
            return Err(EffectScheduleError::Rejected(format!(
                "HTTP {status}: {}",
                String::from_utf8_lossy(&bytes)
            )));
        }
        let accepted = serde_json::from_slice::<RestateAccepted>(&bytes)
            .map_err(|error| EffectScheduleError::InvalidResponse(error.to_string()))?;
        if accepted.invocation_id.is_empty() {
            return Err(EffectScheduleError::InvalidResponse(
                "invocation id is empty".to_owned(),
            ));
        }
        Ok(ScheduledEffect {
            invocation_id: accepted.invocation_id,
        })
    }
}

pub fn restate_effect_key(command: &EffectScheduleCommand) -> String {
    format!(
        "{}:{}",
        command.tenant_id.as_str(),
        command.effect_request_id.as_str()
    )
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RestateEffectInput<'a> {
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
    use zoen_engine::EffectScheduleCommand;

    use super::restate_effect_key;

    #[test]
    fn key_contains_trusted_tenant_and_effect_identity() {
        let command = EffectScheduleCommand {
            effect_request_id: EffectRequestId::parse("effect.action.operation.1.0")
                .expect("effect request id"),
            tenant_id: TenantId::parse("tenant.a").expect("tenant id"),
        };

        assert_eq!(
            restate_effect_key(&command),
            "tenant.a:effect.action.operation.1.0"
        );
    }
}
