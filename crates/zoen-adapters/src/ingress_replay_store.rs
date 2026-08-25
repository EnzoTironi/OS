use sqlx::PgPool;

/// Durable Standard Webhooks replay table. Namespaced so hops do not collide.
#[derive(Clone, Debug)]
pub struct PostgresIngressReplayStore {
    pool: PgPool,
}

impl PostgresIngressReplayStore {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Returns `true` when this id was recorded, `false` on replay.
    pub async fn claim(&self, namespace: &str, webhook_id: &str) -> Result<bool, sqlx::Error> {
        let key = format!("{namespace}:{webhook_id}");
        let inserted: Option<String> = sqlx::query_scalar(
            "INSERT INTO ingress_replay (webhook_id)
             VALUES ($1)
             ON CONFLICT (webhook_id) DO NOTHING
             RETURNING webhook_id",
        )
        .bind(key)
        .fetch_optional(&self.pool)
        .await?;
        Ok(inserted.is_some())
    }
}
