use sqlx::PgPool;

/// Hop prefix for zoend's durable Standard Webhooks replay rows.
///
/// HMAC still signs the raw `webhook-id`. This prefix is persist-only so the
/// proxy hop and the gateway can share `ingress_replay` without colliding.
pub const ZOEND_INGRESS_REPLAY_NAMESPACE: &str = "zoend:";

/// Durable Standard Webhooks replay table. One namespaced key per webhook-id.
#[derive(Clone, Debug)]
pub struct PostgresIngressReplayStore {
    pool: PgPool,
}

impl PostgresIngressReplayStore {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// `true` when this id is already committed at the zoend hop.
    pub async fn contains(&self, webhook_id: &str) -> Result<bool, sqlx::Error> {
        let key = namespaced_webhook_id(webhook_id);
        let found: Option<String> =
            sqlx::query_scalar("SELECT webhook_id FROM ingress_replay WHERE webhook_id = $1")
                .bind(&key)
                .fetch_optional(&self.pool)
                .await?;
        Ok(found.is_some())
    }

    /// Returns `true` when this id was recorded, `false` on replay.
    pub async fn claim(&self, webhook_id: &str) -> Result<bool, sqlx::Error> {
        let key = namespaced_webhook_id(webhook_id);
        let inserted: Option<String> = sqlx::query_scalar(
            "INSERT INTO ingress_replay (webhook_id)
             VALUES ($1)
             ON CONFLICT (webhook_id) DO NOTHING
             RETURNING webhook_id",
        )
        .bind(&key)
        .fetch_optional(&self.pool)
        .await?;
        Ok(inserted.is_some())
    }
}

fn namespaced_webhook_id(webhook_id: &str) -> String {
    format!("{ZOEND_INGRESS_REPLAY_NAMESPACE}{webhook_id}")
}

#[cfg(test)]
mod tests {
    use super::{ZOEND_INGRESS_REPLAY_NAMESPACE, namespaced_webhook_id};

    #[test]
    fn persist_key_is_unconditionally_prefixed() {
        assert_eq!(namespaced_webhook_id("msg_1"), "zoend:msg_1");
        assert_eq!(namespaced_webhook_id("zoend:msg_1"), "zoend:zoend:msg_1");
        assert_ne!(namespaced_webhook_id("shared"), "gateway:shared");
        assert_eq!(ZOEND_INGRESS_REPLAY_NAMESPACE, "zoend:");
    }
}
