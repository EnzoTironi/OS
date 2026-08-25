use sqlx::PgPool;

/// Durable Standard Webhooks replay table. One key per webhook-id.
#[derive(Clone, Debug)]
pub struct PostgresIngressReplayStore {
    pool: PgPool,
}

impl PostgresIngressReplayStore {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// `true` when this id is already committed.
    pub async fn contains(&self, webhook_id: &str) -> Result<bool, sqlx::Error> {
        let found: Option<String> =
            sqlx::query_scalar("SELECT webhook_id FROM ingress_replay WHERE webhook_id = $1")
                .bind(webhook_id)
                .fetch_optional(&self.pool)
                .await?;
        Ok(found.is_some())
    }

    /// Returns `true` when this id was recorded, `false` on replay.
    pub async fn claim(&self, webhook_id: &str) -> Result<bool, sqlx::Error> {
        let inserted: Option<String> = sqlx::query_scalar(
            "INSERT INTO ingress_replay (webhook_id)
             VALUES ($1)
             ON CONFLICT (webhook_id) DO NOTHING
             RETURNING webhook_id",
        )
        .bind(webhook_id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(inserted.is_some())
    }
}
