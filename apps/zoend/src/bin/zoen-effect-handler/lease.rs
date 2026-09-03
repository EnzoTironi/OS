//! Exact-registration lease guard for the production handler.
//!
//! Every journaled step revalidates the registrar lease before touching
//! downstream systems, so a superseded build stops instead of double-driving
//! effects.

use std::{error::Error, fmt, time::Duration};

use super::config::RegistrationConfig;

/// Lease validation failure; always retried by the journaled step.
#[derive(Debug)]
pub struct LeaseError(pub String);

impl fmt::Display for LeaseError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl Error for LeaseError {}

/// Registrar lease guard.
#[derive(Clone, Debug)]
pub struct RegistrationLease {
    http: reqwest::Client,
    max_age_ms: u64,
    status_url: String,
    timeout: Duration,
}

impl RegistrationLease {
    /// Build the lease guard from validated configuration.
    ///
    /// # Errors
    ///
    /// Returns [`LeaseError`] when the HTTP client cannot be built.
    pub fn new(config: &RegistrationConfig) -> Result<Self, LeaseError> {
        let timeout = Duration::from_millis(config.lease_max_age_ms);
        let http = reqwest::Client::builder()
            .timeout(timeout)
            .build()
            .map_err(|error| LeaseError(error.to_string()))?;
        Ok(Self {
            http,
            max_age_ms: config.lease_max_age_ms,
            status_url: config.status_url.clone(),
            timeout,
        })
    }

    /// Require a fresh exact registration for this artifact revision.
    ///
    /// # Errors
    ///
    /// Returns [`LeaseError`] when the registrar is unavailable, not ready,
    /// tracks a different revision, or the lease is stale.
    pub async fn require_current(&self, expected_artifact: &str) -> Result<String, LeaseError> {
        let response = self
            .http
            .get(&self.status_url)
            .timeout(self.timeout)
            .send()
            .await
            .map_err(|error| {
                LeaseError(format!("exact effect registration is unavailable: {error}"))
            })?;
        if !response.status().is_success() {
            return Err(LeaseError(format!(
                "exact effect registration returned HTTP {}",
                response.status().as_u16()
            )));
        }
        let document: serde_json::Value = response.json().await.map_err(|error| {
            LeaseError(format!(
                "exact effect registration returned malformed JSON: {error}"
            ))
        })?;
        let status = parse_status(&document)?;
        if status.artifact != expected_artifact {
            return Err(LeaseError(
                "effect registration artifact does not match this image".to_owned(),
            ));
        }
        let updated_at_millis = parse_updated_at(&status.updated_at);
        let now_millis = current_millis();
        let stale = match updated_at_millis {
            None => true,
            Some(updated) => {
                now_millis < updated || now_millis.saturating_sub(updated) > self.max_age_ms
            }
        };
        if stale {
            return Err(LeaseError(
                "exact effect registration lease is stale".to_owned(),
            ));
        }
        Ok(status.deployment_id)
    }
}

struct LeaseStatus {
    artifact: String,
    deployment_id: String,
    updated_at: String,
}

fn parse_status(document: &serde_json::Value) -> Result<LeaseStatus, LeaseError> {
    let not_ready = || LeaseError("exact effect registration is not ready".to_owned());
    let object = document.as_object().ok_or_else(not_ready)?;
    if object.len() != 5 {
        return Err(not_ready());
    }
    if object.get("ready") != Some(&serde_json::Value::Bool(true)) {
        return Err(not_ready());
    }
    if object.get("reason") != Some(&serde_json::Value::from("exact registration verified")) {
        return Err(not_ready());
    }
    let artifact = object
        .get("artifact")
        .and_then(serde_json::Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(not_ready)?;
    let deployment_id = object
        .get("deploymentId")
        .and_then(serde_json::Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(not_ready)?;
    let updated_at = object
        .get("updatedAt")
        .and_then(serde_json::Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(not_ready)?;
    Ok(LeaseStatus {
        artifact: artifact.to_owned(),
        deployment_id: deployment_id.to_owned(),
        updated_at: updated_at.to_owned(),
    })
}

/// Parse `YYYY-MM-DDTHH:MM:SS.mmmZ` to epoch milliseconds.
fn parse_updated_at(value: &str) -> Option<u64> {
    let (date, time_z) = value.split_once('T')?;
    let time = time_z.strip_suffix('Z')?;
    let mut date_parts = date.split('-');
    let year: u64 = date_parts.next()?.parse().ok()?;
    let month: u64 = date_parts.next()?.parse().ok()?;
    let day: u64 = date_parts.next()?.parse().ok()?;
    if date_parts.next().is_some() {
        return None;
    }
    let (clock, millis_str) = time.split_once('.')?;
    if millis_str.len() != 3 {
        return None;
    }
    let millis: u64 = millis_str.parse().ok()?;
    let mut clock_parts = clock.split(':');
    let hour: u64 = clock_parts.next()?.parse().ok()?;
    let minute: u64 = clock_parts.next()?.parse().ok()?;
    let second: u64 = clock_parts.next()?.parse().ok()?;
    if clock_parts.next().is_some() {
        return None;
    }
    if month == 0
        || month > 12
        || day == 0
        || day > 31
        || hour > 23
        || minute > 59
        || second > 60
        || millis > 999
    {
        return None;
    }
    let days = days_since_epoch(year, month, day)?;
    Some(days * 86_400_000 + hour * 3_600_000 + minute * 60_000 + second * 1000 + millis)
}

fn days_since_epoch(year: u64, month: u64, day: u64) -> Option<u64> {
    if year < 1970 || month == 0 || month > 12 || day == 0 {
        return None;
    }
    let mut days: u64 = 0;
    for yearly in 1970..year {
        days += if is_leap(yearly) { 366 } else { 365 };
    }
    let month_days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    for monthly in 1..month {
        days += month_days.get(usize::try_from(monthly - 1).ok()?)?;
        if monthly == 2 && is_leap(year) {
            days += 1;
        }
    }
    days.checked_add(day - 1)
}

fn is_leap(year: u64) -> bool {
    (year.is_multiple_of(4) && !year.is_multiple_of(100)) || year.is_multiple_of(400)
}

fn current_millis() -> u64 {
    match std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH) {
        Ok(duration) => u64::try_from(duration.as_millis()).unwrap_or(u64::MAX),
        Err(_) => 0,
    }
}
