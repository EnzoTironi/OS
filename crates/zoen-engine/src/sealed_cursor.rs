//! Opaque sealed cursors bound to authority, query, release, and budget.

use sha2::{Digest, Sha256};
use zoen_core::encode_hex;

/// Server-owned default query budget id (W2-07 owns `BudgetClass` catalogs).
pub const DEFAULT_QUERY_BUDGET: &str = "budget.query.default";

/// Hard ceiling callers cannot raise for sealed clinic/object pages.
pub const SERVER_PAGE_CEILING: u32 = 5;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SealedCursorBasis {
    pub authority_principal: String,
    pub membership: String,
    pub world: String,
    pub object_type: String,
    pub release_digest: String,
    pub policy_digest: String,
    pub budget_id: String,
    pub page_limit: u32,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SealedCursor {
    pub after_object_id: String,
    pub basis: SealedCursorBasis,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SealedCursorError {
    Invalid(String),
    Mismatch(String),
}

impl std::fmt::Display for SealedCursorError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Invalid(message) | Self::Mismatch(message) => formatter.write_str(message),
        }
    }
}

impl std::error::Error for SealedCursorError {}

/// Seal the next-page cursor. Empty when `has_more` is false.
///
/// # Errors
///
/// Returns [`SealedCursorError::Invalid`] when more pages remain but the position is empty.
pub fn seal_next(
    basis: &SealedCursorBasis,
    after_object_id: &str,
    has_more: bool,
) -> Result<String, SealedCursorError> {
    if !has_more {
        return Ok(String::new());
    }
    if after_object_id.is_empty() {
        return Err(SealedCursorError::Invalid(
            "sealed cursor position is required when more pages remain".to_owned(),
        ));
    }
    let mac = mac_for(basis, after_object_id);
    Ok(format!(
        "v2/{mac}/{}",
        encode_hex(after_object_id.as_bytes())
    ))
}

/// Bind an opaque cursor to the caller's current authority/query/release/budget.
///
/// # Errors
///
/// Returns [`SealedCursorError::Invalid`] for a malformed token and
/// [`SealedCursorError::Mismatch`] when the MAC does not match the expected basis.
pub fn bind(token: &str, expected: &SealedCursorBasis) -> Result<SealedCursor, SealedCursorError> {
    if token.is_empty() {
        return Err(SealedCursorError::Invalid(
            "sealed cursor token is empty".to_owned(),
        ));
    }
    let parts: Vec<&str> = token.split('/').collect();
    let [version, mac, after_hex] = parts.as_slice() else {
        return Err(SealedCursorError::Invalid(
            "sealed cursor is malformed".to_owned(),
        ));
    };
    if *version != "v2" || mac.len() != 64 {
        return Err(SealedCursorError::Invalid(
            "sealed cursor is malformed".to_owned(),
        ));
    }
    let after_object_id = String::from_utf8(hex_decode(after_hex)?)
        .map_err(|_| SealedCursorError::Invalid("sealed cursor position is invalid".to_owned()))?;
    let expected_mac = mac_for(expected, &after_object_id);
    if *mac != expected_mac {
        return Err(SealedCursorError::Mismatch(
            "sealed cursor does not match authority, query, release, or budget".to_owned(),
        ));
    }
    Ok(SealedCursor {
        after_object_id,
        basis: expected.clone(),
    })
}

/// Effective page limit: caller request clamped to the server budget ceiling.
///
/// # Errors
///
/// Returns [`SealedCursorError::Invalid`] when the requested limit is zero.
pub fn effective_page_limit(requested: u32) -> Result<u32, SealedCursorError> {
    if requested == 0 {
        return Err(SealedCursorError::Invalid(
            "page limit must be positive".to_owned(),
        ));
    }
    Ok(requested.min(SERVER_PAGE_CEILING))
}

/// Reject caller attempts to raise the server budget class.
///
/// # Errors
///
/// Returns [`SealedCursorError::Mismatch`] when the caller names a budget other than the default.
pub fn resolve_budget_id(requested: Option<&str>) -> Result<&'static str, SealedCursorError> {
    match requested {
        None | Some("" | DEFAULT_QUERY_BUDGET) => Ok(DEFAULT_QUERY_BUDGET),
        Some(other) => Err(SealedCursorError::Mismatch(format!(
            "caller cannot raise budget above {DEFAULT_QUERY_BUDGET}; got {other}"
        ))),
    }
}

fn mac_for(basis: &SealedCursorBasis, after_object_id: &str) -> String {
    let mut hasher = Sha256::new();
    hash_field(&mut hasher, "zoen.sealed-cursor.v2");
    hash_field(&mut hasher, &basis.authority_principal);
    hash_field(&mut hasher, &basis.membership);
    hash_field(&mut hasher, &basis.world);
    hash_field(&mut hasher, &basis.object_type);
    hash_field(&mut hasher, &basis.release_digest);
    hash_field(&mut hasher, &basis.policy_digest);
    hash_field(&mut hasher, &basis.budget_id);
    hash_field(&mut hasher, &basis.page_limit.to_string());
    hash_field(&mut hasher, after_object_id);
    encode_hex(hasher.finalize().as_slice())
}

fn hash_field(hasher: &mut Sha256, value: &str) {
    hasher.update(value.len().to_be_bytes());
    hasher.update(value.as_bytes());
}

fn hex_decode(value: &str) -> Result<Vec<u8>, SealedCursorError> {
    if !value.len().is_multiple_of(2) {
        return Err(SealedCursorError::Invalid(
            "sealed cursor position is invalid".to_owned(),
        ));
    }
    (0..value.len())
        .step_by(2)
        .map(|index| {
            u8::from_str_radix(&value[index..index + 2], 16).map_err(|_| {
                SealedCursorError::Invalid("sealed cursor position is invalid".to_owned())
            })
        })
        .collect()
}
