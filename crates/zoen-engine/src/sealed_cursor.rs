//! Server-keyed cursors for authorized object-set pagination.

use std::{
    collections::BTreeMap,
    fmt::{Debug, Formatter},
};

use hmac::{Hmac, KeyInit, Mac};
use serde::Serialize;
use sha2::Sha256;
use zoen_core::{
    BudgetClassId, CommitSequence, MembershipId, PolicyCatalogDigest, PrincipalId, ReleaseDigest,
    WorldId, encode_hex,
};

/// Default query budget id. The active release must publish this class before it can be used.
pub const DEFAULT_QUERY_BUDGET: &str = "budget.query.default";

/// Hard output-page ceiling. Release-owned compute limits are resolved separately.
pub const SERVER_PAGE_CEILING: u32 = 5;

const CURSOR_SCHEMA: &str = "zoen.sealed-cursor.v3";
const CURSOR_VERSION: &str = "v3";
const HMAC_SHA256_BYTES: usize = 32;
const MAX_CURSOR_POSITION_BYTES: usize = 512;
const MAX_CURSOR_TOKEN_BYTES: usize = 2_048;
const MIN_CURSOR_KEY_BYTES: usize = 32;

type HmacSha256 = Hmac<Sha256>;

macro_rules! cursor_digest {
    ($(#[$metadata:meta])* $name:ident, $label:literal) => {
        $(#[$metadata])*
        #[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
        pub struct $name(String);

        impl $name {
            /// Parse a lowercase SHA-256 digest.
            ///
            /// # Errors
            ///
            /// Returns [`SealedCursorError::Invalid`] when the digest is not 64 lowercase hex
            /// characters.
            pub fn parse(value: impl Into<String>) -> Result<Self, SealedCursorError> {
                let value = value.into();
                if is_lower_hex(&value, HMAC_SHA256_BYTES * 2) {
                    Ok(Self(value))
                } else {
                    Err(SealedCursorError::Invalid(format!(
                        "{} must be 64 lowercase hex characters",
                        $label
                    )))
                }
            }

            #[must_use]
            pub fn as_str(&self) -> &str {
                &self.0
            }

            #[must_use]
            pub fn from_sha256(bytes: [u8; HMAC_SHA256_BYTES]) -> Self {
                Self(encode_hex(&bytes))
            }
        }
    };
}

cursor_digest!(
    /// Digest of trusted caller authority supplied by the Membership authorization boundary.
    ///
    /// The World kernel derives this from the resolved Membership execution context before it
    /// issues an object cursor.
    TrustedAuthorityDigest,
    "trusted authority digest"
);

cursor_digest!(
    /// Digest of the server-authorized object-set plan bound into the cursor.
    AuthorizedObjectSetPlanDigest,
    "authorized object-set plan digest"
);

/// Stable public key identifier carried by a cursor during key rotation.
#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct CursorKeyId(String);

impl CursorKeyId {
    /// Parse a key id suitable for the cursor wire format.
    ///
    /// # Errors
    ///
    /// Returns [`SealedCursorError::Invalid`] when the id is empty, too long, or contains a
    /// character outside ASCII letters, digits, `.`, `_`, and `-`.
    pub fn parse(value: impl Into<String>) -> Result<Self, SealedCursorError> {
        let value = value.into();
        if value.is_empty()
            || value.len() > 64
            || !value
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
        {
            return Err(SealedCursorError::Invalid(
                "cursor key id is invalid".to_owned(),
            ));
        }
        Ok(Self(value))
    }

    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// One HMAC key. Debug output intentionally omits secret bytes.
#[derive(Clone)]
pub struct CursorSigningKey {
    id: CursorKeyId,
    secret: Vec<u8>,
}

impl CursorSigningKey {
    /// Construct a cursor signing key from server-owned secret bytes.
    ///
    /// # Errors
    ///
    /// Returns [`SealedCursorError::Invalid`] when fewer than 256 bits are supplied.
    pub fn new(id: CursorKeyId, secret: Vec<u8>) -> Result<Self, SealedCursorError> {
        if secret.len() < MIN_CURSOR_KEY_BYTES {
            return Err(SealedCursorError::Invalid(
                "cursor signing keys must contain at least 32 bytes".to_owned(),
            ));
        }
        Ok(Self { id, secret })
    }

    #[must_use]
    pub fn id(&self) -> &CursorKeyId {
        &self.id
    }
}

impl Debug for CursorSigningKey {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("CursorSigningKey")
            .field("id", &self.id)
            .field("secret", &"[REDACTED]")
            .finish()
    }
}

/// Active signing key plus retained verification keys for rotation.
#[derive(Clone)]
pub struct CursorKeyring {
    active_key_id: CursorKeyId,
    keys: BTreeMap<CursorKeyId, CursorSigningKey>,
}

impl CursorKeyring {
    /// Build a keyring. New cursors use `active_key_id`; retained keys verify older cursors.
    ///
    /// # Errors
    ///
    /// Returns [`SealedCursorError::Invalid`] for an empty keyring, duplicate ids, or a missing
    /// active key.
    pub fn new(
        active_key_id: CursorKeyId,
        keys: impl IntoIterator<Item = CursorSigningKey>,
    ) -> Result<Self, SealedCursorError> {
        let mut by_id = BTreeMap::new();
        for key in keys {
            let id = key.id.clone();
            if by_id.insert(id, key).is_some() {
                return Err(SealedCursorError::Invalid(
                    "cursor keyring contains a duplicate key id".to_owned(),
                ));
            }
        }
        if by_id.is_empty() {
            return Err(SealedCursorError::Invalid(
                "cursor keyring must not be empty".to_owned(),
            ));
        }
        if !by_id.contains_key(&active_key_id) {
            return Err(SealedCursorError::Invalid(
                "cursor active key is not present in the keyring".to_owned(),
            ));
        }
        Ok(Self {
            active_key_id,
            keys: by_id,
        })
    }

    fn active_key(&self) -> Result<&CursorSigningKey, SealedCursorError> {
        self.keys.get(&self.active_key_id).ok_or_else(|| {
            SealedCursorError::Invalid("cursor active key is unavailable".to_owned())
        })
    }

    fn verification_key(&self, id: &CursorKeyId) -> Option<&CursorSigningKey> {
        self.keys.get(id)
    }
}

impl Debug for CursorKeyring {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("CursorKeyring")
            .field("active_key_id", &self.active_key_id)
            .field("key_ids", &self.keys.keys().collect::<Vec<_>>())
            .finish()
    }
}

/// Canonical ascending order currently implemented by the narrow object query.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CursorSortOrder {
    ObjectIdAscending,
    IdentifierAssignmentIdAscending,
}

impl CursorSortOrder {
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::ObjectIdAscending => "object_id.asc",
            Self::IdentifierAssignmentIdAscending => "identifier_assignment_id.asc",
        }
    }
}

/// Claims authenticated by the cursor HMAC.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SealedCursorBasis {
    pub trusted_authority_digest: Option<TrustedAuthorityDigest>,
    pub authority_cut: Option<CommitSequence>,
    pub authorized_plan_digest: AuthorizedObjectSetPlanDigest,
    pub authority_principal: PrincipalId,
    pub membership: MembershipId,
    pub world: WorldId,
    pub object_type: String,
    pub selector_digest: String,
    pub context_digest: String,
    pub valid_at_micros: i64,
    pub release_digest: ReleaseDigest,
    pub policy_digest: PolicyCatalogDigest,
    pub budget_id: BudgetClassId,
    pub page_limit: u32,
    pub sort_order: CursorSortOrder,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SealedCursor {
    pub after_object_id: String,
    pub basis: SealedCursorBasis,
    pub expires_at_unix_seconds: u64,
    pub key_id: CursorKeyId,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SealedCursorError {
    Invalid(String),
    Mismatch(String),
    Expired(String),
}

impl std::fmt::Display for SealedCursorError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Invalid(message) | Self::Mismatch(message) | Self::Expired(message) => {
                formatter.write_str(message)
            }
        }
    }
}

impl std::error::Error for SealedCursorError {}

/// Server-owned cursor sealer with an active keyring and bounded lifetime.
#[derive(Clone, Debug)]
pub struct CursorSealer {
    keyring: CursorKeyring,
    ttl_seconds: u64,
}

impl CursorSealer {
    /// Construct a cursor sealer.
    ///
    /// # Errors
    ///
    /// Returns [`SealedCursorError::Invalid`] when `ttl_seconds` is zero.
    pub fn new(keyring: CursorKeyring, ttl_seconds: u64) -> Result<Self, SealedCursorError> {
        if ttl_seconds == 0 {
            return Err(SealedCursorError::Invalid(
                "cursor ttl must be positive".to_owned(),
            ));
        }
        Ok(Self {
            keyring,
            ttl_seconds,
        })
    }

    /// Seal the next-page cursor. Returns an empty token when `has_more` is false.
    ///
    /// # Errors
    ///
    /// Returns [`SealedCursorError::Invalid`] for an empty/oversized position, time overflow, or
    /// canonical serialization failure.
    pub fn seal_next(
        &self,
        basis: &SealedCursorBasis,
        after_object_id: &str,
        has_more: bool,
        issued_at_unix_seconds: u64,
    ) -> Result<String, SealedCursorError> {
        if !has_more {
            return Ok(String::new());
        }
        validate_position(after_object_id)?;
        let expires_at_unix_seconds = issued_at_unix_seconds
            .checked_add(self.ttl_seconds)
            .ok_or_else(|| SealedCursorError::Invalid("cursor expiry overflowed".to_owned()))?;
        let key = self.keyring.active_key()?;
        let payload = canonical_payload(basis, key.id(), after_object_id, expires_at_unix_seconds)?;
        let tag = sign(key, &payload)?;
        Ok(format!(
            "{CURSOR_VERSION}/{}/{expires_at_unix_seconds}/{}/{}",
            key.id().as_str(),
            encode_hex(after_object_id.as_bytes()),
            encode_hex(&tag),
        ))
    }

    /// Authenticate and bind a cursor to the server's expected authority/query basis.
    ///
    /// HMAC verification uses `RustCrypto`'s constant-time [`Mac::verify_slice`]. Expiration is
    /// checked only after authentication so forged tokens do not become an expiry oracle.
    ///
    /// # Errors
    ///
    /// Returns [`SealedCursorError::Invalid`] for malformed tokens,
    /// [`SealedCursorError::Mismatch`] for an unknown key or failed authentication, and
    /// [`SealedCursorError::Expired`] after an authentic cursor expires.
    pub fn bind(
        &self,
        token: &str,
        expected: &SealedCursorBasis,
        now_unix_seconds: u64,
    ) -> Result<SealedCursor, SealedCursorError> {
        if token.is_empty() || token.len() > MAX_CURSOR_TOKEN_BYTES {
            return Err(SealedCursorError::Invalid(
                "sealed cursor is malformed".to_owned(),
            ));
        }
        let parts: Vec<&str> = token.split('/').collect();
        let [version, key_id, expires_at, after_hex, tag_hex] = parts.as_slice() else {
            return Err(SealedCursorError::Invalid(
                "sealed cursor is malformed".to_owned(),
            ));
        };
        if *version != CURSOR_VERSION {
            return Err(SealedCursorError::Invalid(
                "sealed cursor is malformed".to_owned(),
            ));
        }
        let key_id = CursorKeyId::parse(*key_id)?;
        let expires_at_unix_seconds = expires_at
            .parse::<u64>()
            .map_err(|_| SealedCursorError::Invalid("sealed cursor is malformed".to_owned()))?;
        if expires_at_unix_seconds.to_string() != *expires_at {
            return Err(SealedCursorError::Invalid(
                "sealed cursor is malformed".to_owned(),
            ));
        }
        let after_object_id = String::from_utf8(hex_decode(after_hex)?).map_err(|_| {
            SealedCursorError::Invalid("sealed cursor position is invalid".to_owned())
        })?;
        validate_position(&after_object_id)?;
        let tag = hex_decode(tag_hex)?;
        if tag.len() != HMAC_SHA256_BYTES {
            return Err(SealedCursorError::Invalid(
                "sealed cursor is malformed".to_owned(),
            ));
        }
        let key = self
            .keyring
            .verification_key(&key_id)
            .ok_or_else(cursor_authentication_failed)?;
        let payload =
            canonical_payload(expected, &key_id, &after_object_id, expires_at_unix_seconds)?;
        verify(key, &payload, &tag)?;
        if now_unix_seconds >= expires_at_unix_seconds {
            return Err(SealedCursorError::Expired(
                "sealed cursor has expired".to_owned(),
            ));
        }
        Ok(SealedCursor {
            after_object_id,
            basis: expected.clone(),
            expires_at_unix_seconds,
            key_id,
        })
    }
}

/// Effective page limit: caller request clamped to the server output ceiling.
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CursorMacPayload<'a> {
    schema: &'static str,
    key_id: &'a str,
    expires_at_unix_seconds: u64,
    trusted_authority_digest: Option<&'a str>,
    authority_cut: Option<u64>,
    authorized_plan_digest: &'a str,
    authority_principal: &'a str,
    membership: &'a str,
    world: &'a str,
    object_type: &'a str,
    selector_digest: &'a str,
    context_digest: &'a str,
    valid_at_micros: i64,
    release_digest: &'a str,
    policy_digest: &'a str,
    budget_id: &'a str,
    page_limit: u32,
    sort_order: &'a str,
    after_object_id: &'a str,
}

fn canonical_payload(
    basis: &SealedCursorBasis,
    key_id: &CursorKeyId,
    after_object_id: &str,
    expires_at_unix_seconds: u64,
) -> Result<Vec<u8>, SealedCursorError> {
    serde_jcs::to_vec(&CursorMacPayload {
        schema: CURSOR_SCHEMA,
        key_id: key_id.as_str(),
        expires_at_unix_seconds,
        trusted_authority_digest: basis
            .trusted_authority_digest
            .as_ref()
            .map(TrustedAuthorityDigest::as_str),
        authority_cut: basis.authority_cut.map(CommitSequence::get),
        authorized_plan_digest: basis.authorized_plan_digest.as_str(),
        authority_principal: basis.authority_principal.as_str(),
        membership: basis.membership.as_str(),
        world: basis.world.as_str(),
        object_type: &basis.object_type,
        selector_digest: &basis.selector_digest,
        context_digest: &basis.context_digest,
        valid_at_micros: basis.valid_at_micros,
        release_digest: basis.release_digest.as_str(),
        policy_digest: basis.policy_digest.as_str(),
        budget_id: basis.budget_id.as_str(),
        page_limit: basis.page_limit,
        sort_order: basis.sort_order.as_str(),
        after_object_id,
    })
    .map_err(|error| {
        SealedCursorError::Invalid(format!("sealed cursor payload is invalid: {error}"))
    })
}

fn sign(
    key: &CursorSigningKey,
    payload: &[u8],
) -> Result<[u8; HMAC_SHA256_BYTES], SealedCursorError> {
    let mut mac = HmacSha256::new_from_slice(&key.secret).map_err(|_| {
        SealedCursorError::Invalid("cursor signing key could not initialize HMAC".to_owned())
    })?;
    mac.update(payload);
    Ok(mac.finalize().into_bytes().into())
}

fn verify(key: &CursorSigningKey, payload: &[u8], tag: &[u8]) -> Result<(), SealedCursorError> {
    let mut mac = HmacSha256::new_from_slice(&key.secret).map_err(|_| {
        SealedCursorError::Invalid("cursor signing key could not initialize HMAC".to_owned())
    })?;
    mac.update(payload);
    mac.verify_slice(tag)
        .map_err(|_| cursor_authentication_failed())
}

fn cursor_authentication_failed() -> SealedCursorError {
    SealedCursorError::Mismatch(
        "sealed cursor does not match authority, query, release, or budget".to_owned(),
    )
}

fn validate_position(value: &str) -> Result<(), SealedCursorError> {
    if value.is_empty() || value.len() > MAX_CURSOR_POSITION_BYTES {
        return Err(SealedCursorError::Invalid(
            "sealed cursor position is invalid".to_owned(),
        ));
    }
    Ok(())
}

fn is_lower_hex(value: &str, expected_len: usize) -> bool {
    value.len() == expected_len
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || matches!(byte, b'a'..=b'f'))
}

fn hex_decode(value: &str) -> Result<Vec<u8>, SealedCursorError> {
    if !value.len().is_multiple_of(2)
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || matches!(byte, b'a'..=b'f'))
    {
        return Err(SealedCursorError::Invalid(
            "sealed cursor is malformed".to_owned(),
        ));
    }
    (0..value.len())
        .step_by(2)
        .map(|index| {
            u8::from_str_radix(&value[index..index + 2], 16)
                .map_err(|_| SealedCursorError::Invalid("sealed cursor is malformed".to_owned()))
        })
        .collect()
}
