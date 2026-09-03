//! Shared loader for the baked effect-handler artifact manifest.
//!
//! The production image writes `effect-handler-artifact.json` next to the
//! Rust binaries with `zoen write-build-artifact`. Both the Restate handler
//! and the registrar read the same file at startup so a build never serves
//! traffic or registers Restate deployments for a different revision.

use std::{
    error::Error,
    fmt,
    fs::OpenOptions,
    os::unix::fs::{MetadataExt, OpenOptionsExt},
    path::{Path, PathBuf},
};

/// Restate service name for the production effect handler.
pub const ZOEN_EFFECT_SERVICE_NAME: &str = "ZoenEffect";
/// Exclusive handler name on [`ZOEN_EFFECT_SERVICE_NAME`].
pub const ZOEN_EFFECT_HANDLER_NAME: &str = "execute";
/// Discovery metadata key carrying the kernel owner.
pub const ZOEN_EFFECT_OWNER_METADATA_KEY: &str = "zoen.owner";
/// Discovery metadata key carrying the baked artifact revision.
pub const ZOEN_EFFECT_ARTIFACT_METADATA_KEY: &str = "zoen.artifact";
/// Kernel owner recorded in Restate deployment metadata.
pub const ZOEN_EFFECT_OWNER: &str = "ontology";
/// Manifest filename written by `zoen write-build-artifact`.
pub const EFFECT_HANDLER_ARTIFACT_FILENAME: &str = "effect-handler-artifact.json";
/// Largest accepted revision length: one leading alphanumeric plus up to 127
/// body characters, mirroring the build script contract.
const MAX_REVISION_LEN: usize = 128;

/// Baked effect-handler artifact revision.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EffectHandlerArtifact {
    /// Immutable revision baked into the image under test.
    pub revision: String,
}

/// Failure to load or validate the artifact manifest.
#[derive(Debug)]
pub struct ArtifactError(String);

impl fmt::Display for ArtifactError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl Error for ArtifactError {}

/// Validate an artifact revision without touching the filesystem.
///
/// # Errors
///
/// Returns [`ArtifactError`] when the revision does not match
/// `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`.
pub fn validate_revision(revision: &str) -> Result<(), ArtifactError> {
    if is_valid_revision(revision) {
        Ok(())
    } else {
        Err(ArtifactError(
            "effect handler artifact revision is malformed".to_owned(),
        ))
    }
}

/// Check the revision against `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`.
#[must_use]
pub fn is_valid_revision(revision: &str) -> bool {
    if revision.is_empty() || revision.len() > MAX_REVISION_LEN {
        return false;
    }
    let mut characters = revision.chars();
    match characters.next() {
        Some(first) if first.is_ascii_alphanumeric() => (),
        _ => return false,
    }
    characters.all(|character| {
        character.is_ascii_alphanumeric()
            || character == '.'
            || character == '_'
            || character == '-'
    })
}

/// Resolve the manifest path: explicit override or the binary directory.
///
/// # Errors
///
/// Returns [`ArtifactError`] when no explicit path is configured and the
/// current executable path cannot be determined.
pub fn artifact_path(explicit: Option<&str>) -> Result<PathBuf, ArtifactError> {
    if let Some(path) = explicit.filter(|path| !path.is_empty()) {
        return Ok(PathBuf::from(path));
    }
    let exe = std::env::current_exe().map_err(|error| {
        ArtifactError(format!(
            "effect handler artifact manifest cannot be located: {error}"
        ))
    })?;
    let directory = exe.parent().ok_or_else(|| {
        ArtifactError("effect handler artifact manifest cannot be located".to_owned())
    })?;
    Ok(directory.join(EFFECT_HANDLER_ARTIFACT_FILENAME))
}

/// Load and validate the manifest, refusing symlinks and wrong modes.
///
/// # Errors
///
/// Returns [`ArtifactError`] when the manifest cannot be read, is not a
/// mode-`0444` regular file, or does not contain `{revision, schemaVersion: 1}`.
pub fn load_artifact(path: &Path) -> Result<EffectHandlerArtifact, ArtifactError> {
    if is_symlink(path) {
        return Err(ArtifactError(
            "effect handler artifact manifest cannot be read".to_owned(),
        ));
    }
    let file = OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NOFOLLOW)
        .open(path)
        .map_err(|_| ArtifactError("effect handler artifact manifest cannot be read".to_owned()))?;
    let metadata = file
        .metadata()
        .map_err(|_| ArtifactError("effect handler artifact manifest cannot be read".to_owned()))?;
    if !metadata.is_file() {
        return Err(ArtifactError(
            "effect handler artifact manifest is not a regular file".to_owned(),
        ));
    }
    if metadata.mode() % 0o1000 != 0o444 {
        return Err(ArtifactError(
            "effect handler artifact manifest mode must be 0444".to_owned(),
        ));
    }
    let document: serde_json::Value = serde_json::from_reader(file)
        .map_err(|_| ArtifactError("effect handler artifact manifest is malformed".to_owned()))?;
    parse_manifest(&document)
}

fn parse_manifest(document: &serde_json::Value) -> Result<EffectHandlerArtifact, ArtifactError> {
    let malformed = || ArtifactError("effect handler artifact manifest is malformed".to_owned());
    let object = document.as_object().ok_or_else(malformed)?;
    if object.len() != 2
        || !object.contains_key("schemaVersion")
        || !object.contains_key("revision")
    {
        return Err(malformed());
    }
    if object.get("schemaVersion") != Some(&serde_json::Value::from(1)) {
        return Err(malformed());
    }
    let revision = object
        .get("revision")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(malformed)?;
    validate_revision(revision)?;
    Ok(EffectHandlerArtifact {
        revision: revision.to_owned(),
    })
}

/// Discovery metadata pinning this binary to its baked revision.
#[must_use]
pub fn handler_metadata(artifact: &EffectHandlerArtifact) -> Vec<(String, String)> {
    vec![
        (
            ZOEN_EFFECT_ARTIFACT_METADATA_KEY.to_owned(),
            artifact.revision.clone(),
        ),
        (
            ZOEN_EFFECT_OWNER_METADATA_KEY.to_owned(),
            ZOEN_EFFECT_OWNER.to_owned(),
        ),
    ]
}

fn is_symlink(path: &Path) -> bool {
    std::fs::symlink_metadata(path).is_ok_and(|metadata| metadata.file_type().is_symlink())
}
