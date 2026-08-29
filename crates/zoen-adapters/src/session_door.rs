use sqlx::postgres::PgPoolOptions;
use sqlx::{PgPool, Row};
use zoen_core::{
    IdentityError, OpaqueSessionToken, SessionId, TimestampMicros, VerifiedSessionEvidence,
};

#[derive(Clone)]
pub struct SessionDoor {
    pool: PgPool,
}

impl SessionDoor {
    pub async fn connect(database_url: &str) -> Result<Self, IdentityError> {
        let pool = PgPoolOptions::new()
            .max_connections(5)
            .connect(database_url)
            .await
            .map_err(|error| IdentityError::Unavailable(error.to_string()))?;
        Ok(Self { pool })
    }

    pub async fn verify(
        &self,
        token: &OpaqueSessionToken,
    ) -> Result<VerifiedSessionEvidence, IdentityError> {
        let decoded = percent_decode(token.as_str());
        let unsigned = match decoded.rsplit_once('.') {
            Some((value, _)) if !value.is_empty() => value,
            _ => decoded.as_str(),
        };
        let row = sqlx::query(
            r#"SELECT s.id AS session_id, u.id AS user_id,
                      (EXTRACT(EPOCH FROM s."expiresAt") * 1000000)::bigint AS expires_at_micros
               FROM session s
               INNER JOIN "user" u ON u.id = s."userId"
               WHERE (s.token = $1 OR s.token = $2)
                 AND s."expiresAt" > NOW()
               LIMIT 1"#,
        )
        .bind(unsigned)
        .bind(decoded.as_str())
        .fetch_optional(&self.pool)
        .await
        .map_err(|error| IdentityError::Unavailable(error.to_string()))?
        .ok_or(IdentityError::Unauthenticated)?;
        let user_id: String = row
            .try_get("user_id")
            .map_err(|error| IdentityError::Unavailable(error.to_string()))?;
        let session_id: String = row
            .try_get("session_id")
            .map_err(|error| IdentityError::Unavailable(error.to_string()))?;
        let expires_at: i64 = row
            .try_get("expires_at_micros")
            .map_err(|error| IdentityError::Unavailable(error.to_string()))?;
        if user_id.is_empty() {
            return Err(IdentityError::Unauthenticated);
        }
        Ok(VerifiedSessionEvidence {
            door_user_key: user_id,
            expires_at: TimestampMicros::new(expires_at),
            session_id: SessionId::parse(session_id)?,
        })
    }
}

fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hi = from_hex(bytes[i + 1]);
            let lo = from_hex(bytes[i + 2]);
            if let (Some(hi), Some(lo)) = (hi, lo) {
                out.push((hi << 4) | lo);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8(out).unwrap_or_else(|_| value.to_owned())
}

fn from_hex(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}
