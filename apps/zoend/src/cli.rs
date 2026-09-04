use std::{
    env,
    error::Error,
    fs,
    io::{self, Read, Write},
    net::IpAddr,
    os::unix::fs::{MetadataExt, OpenOptionsExt, PermissionsExt},
    path::{Path, PathBuf},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use base64::Engine;
use clap::{CommandFactory, Parser, Subcommand};
use reqwest::header::{
    AUTHORIZATION, CONTENT_TYPE, HeaderMap, HeaderName, HeaderValue, SET_COOKIE,
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const AUTH_CLIENT_ID: &str = "zoen";
const DEVICE_POLL_FAILURE_LIMIT: u8 = 3;
const DEVICE_SLOW_DOWN_SECS: u64 = 5;
const MAX_WORKLOAD_API_KEY_FILE_BYTES: u64 = 52;
const MAX_WORKLOAD_RESPONSE_BYTES: usize = 16 * 1024;
const WORKLOAD_SECRET_BYTES: usize = 32;
const WORKLOAD_SECRET_ENCODED_LENGTH: usize = 43;
const ROOT_AFTER_HELP: &str = "\
No args is help. Start the daemon with zoen serve.

Environment:
  ZOEN_BEARER             Better Auth session override (login is stored in ~/.zoen)
  ZOEN_PASSWORD           email login password (prefer over --password)
  ZOEN_TENANT             tenant id
  ZOEN_ZOEND              zoend origin
  ZOEN_DEFINITION_DIGEST  active definition digest
  ZOEN_DEFINITION_ID      active definition id
  ZOEN_DEFINITION_REVISION  revision for the digest (optional; resolved via GetRevision when empty)
  ZOEN_VALID_AT           as-of timestamp for query and propose
  ZOEN_ISOLATE            set to 1 to deny live side effects
  ZOEN_SOURCE_API_KEY     REST --auth apikey secret (prefer over --api-key)
  ZOEN_SOURCE_CLIENT_SECRET  oauth2 client secret (prefer over --client-secret)
  ZOEN_SOURCE_TOKEN       google stand-in bearer (prefer over --token)

Examples:
  zoen --skill
  zoen schema action.propose
  zoen serve
  zoen auth login --device
  zoen auth login --email you@example.com --password-stdin
  zoen world query --type inventory.Item
  zoen action propose --idempotency-key p --action-id inventory.replenish --resource-id inventory.item.1 --quantity 1 --expires-at 2030-01-01T00:00:00Z --dry-run
";

const SKILL_TEXT: &str = "\
# Zoen CLI skill

Discovery: `zoen --help`, `zoen --skill`, or `zoen schema <command>`.
No bare zoen for discovery beyond the one-shot root help print.

Rules:
- Prefer flags over prompts.
- JSON on stdout. Errors and teaching go to stderr.
- Use `--dry-run` before commit, apply, activate, sync, or connect.
- Set `ZOEN_ISOLATE=1` to deny live side effects.
- Secrets via env or stdin (`ZOEN_PASSWORD`, `ZOEN_SOURCE_*`, `--password-stdin`). Prefer `--device` for auth. Do not put `--password` on argv.
- Publish with `zoen definition publish --file -` to read stdin.

Env: ZOEN_BEARER, ZOEN_TENANT, ZOEN_ZOEND, ZOEN_DEFINITION_ID, ZOEN_DEFINITION_DIGEST, ZOEN_VALID_AT, ZOEN_ISOLATE, ZOEN_PASSWORD, ZOEN_SOURCE_API_KEY, ZOEN_SOURCE_CLIENT_SECRET, ZOEN_SOURCE_TOKEN.

Commands: serve, world, definition, source, action, history, auth.
Schema example: `zoen schema action.propose`
";

/// Ontology CLI parser. No args prints help; `serve` starts the daemon.
#[derive(Parser)]
#[command(
    name = "zoen",
    about = "Zoen ontology CLI and daemon",
    version,
    after_help = ROOT_AFTER_HELP
)]
pub struct Cli {
    /// Print agent skill dest (flags, JSON, dry-run, isolate)
    #[arg(long = "skill")]
    pub skill: bool,
    #[command(subcommand)]
    pub command: Option<Command>,
}

/// Print root `--help` when the binary is invoked with no args.
///
/// # Errors
///
/// Returns an error when help text cannot be written.
pub fn print_root_help() -> Result<(), Box<dyn Error + Send + Sync>> {
    let mut cmd = Cli::command();
    cmd.print_help()?;
    println!();
    Ok(())
}

/// Print the agent skill dest from the binary.
///
/// # Errors
///
/// Returns an error when stdout cannot be written.
pub fn print_skill() -> Result<(), Box<dyn Error + Send + Sync>> {
    io::stdout().write_all(SKILL_TEXT.as_bytes())?;
    Ok(())
}

struct SchemaEntry {
    command: &'static str,
    required_flags: &'static [&'static str],
    examples: &'static [&'static str],
    stdout_json: &'static str,
}

const SCHEMA_REGISTRY: &[SchemaEntry] = &[
    SchemaEntry {
        command: "serve",
        required_flags: &[],
        examples: &["zoen serve"],
        stdout_json: r#"{"format":"daemon"}"#,
    },
    SchemaEntry {
        command: "world.query",
        required_flags: &["--type"],
        examples: &[
            "zoen world query --type inventory.Item",
            "zoen world query --type inventory.Item --limit 20 --page-token <nextPageToken>",
        ],
        stdout_json: r#"{"format":"json","fields":["items","nextPageToken"]}"#,
    },
    SchemaEntry {
        command: "world.scenario.create",
        required_flags: &["--idempotency-key|--name"],
        examples: &[
            "zoen world scenario create --idempotency-key draft",
            "zoen world scenario create --name draft",
        ],
        stdout_json: r#"{"format":"json","fields":["name","scenarioId"]}"#,
    },
    SchemaEntry {
        command: "world.scenario.apply",
        required_flags: &["--name"],
        examples: &[
            "zoen world scenario apply --name draft --dry-run",
            "zoen world scenario apply --name draft",
        ],
        stdout_json: r#"{"format":"json","dryRun":{"dryRun":true},"live":{"applied":true}}"#,
    },
    SchemaEntry {
        command: "world.scenario.discard",
        required_flags: &["--name"],
        examples: &[
            "zoen world scenario discard --name draft --dry-run",
            "zoen world scenario discard --name draft",
        ],
        stdout_json: r#"{"format":"json","dryRun":{"dryRun":true},"live":{"discarded":true}}"#,
    },
    SchemaEntry {
        command: "world.release.construct",
        required_flags: &["--file"],
        examples: &["zoen world release construct --file content.json"],
        stdout_json: r#"{"format":"json","fields":["digest","schema","world","ontology","policy","executors","components"]}"#,
    },
    SchemaEntry {
        command: "world.release.publish",
        required_flags: &[
            "--file",
            "--principal",
            "--policy-id",
            "--policy-digest",
            "--policy-revision",
            "--determining-policy",
        ],
        examples: &[
            "zoen world release publish --file content.json --principal principal.owner --policy-id policy.world --policy-digest <digest> --policy-revision 1 --determining-policy policy.world",
        ],
        stdout_json: r#"{"format":"json","fields":["digest","publication"]}"#,
    },
    SchemaEntry {
        command: "world.release.preview",
        required_flags: &["--world", "--digest", "--principal"],
        examples: &[
            "zoen world release preview --world world.alpha --digest <digest> --principal principal.owner",
        ],
        stdout_json: r#"{"format":"json","fields":["previewDigest","digest","world","currentActive","replay"]}"#,
    },
    SchemaEntry {
        command: "world.release.decide",
        required_flags: &["--preview-digest", "--principal", "--decision"],
        examples: &[
            "zoen world release decide --preview-digest <digest> --principal principal.owner --decision approve",
        ],
        stdout_json: r#"{"format":"json","fields":["previewDigest","decision","digest","world","replay"]}"#,
    },
    SchemaEntry {
        command: "world.release.activate",
        required_flags: &["--world", "--digest", "--preview-digest", "--principal"],
        examples: &[
            "zoen world release activate --world world.alpha --digest <digest> --preview-digest <preview> --principal principal.owner",
        ],
        stdout_json: r#"{"format":"json","fields":["activated","digest","previousDigest","world","replay"]}"#,
    },
    SchemaEntry {
        command: "world.release.get",
        required_flags: &["--digest"],
        examples: &["zoen world release get --digest <digest>"],
        stdout_json: r#"{"format":"json","fields":["digest","world","publication","catalogs"]}"#,
    },
    SchemaEntry {
        command: "world.release.active",
        required_flags: &["--world"],
        examples: &["zoen world release active --world world.alpha"],
        stdout_json: r#"{"format":"json","fields":["digest","active"]}"#,
    },
    SchemaEntry {
        command: "world.release.catalogs",
        required_flags: &["--digest"],
        examples: &["zoen world release catalogs --digest <digest> --world world.alpha"],
        stdout_json: r#"{"format":"json","fields":["digest","world","catalogs"]}"#,
    },
    SchemaEntry {
        command: "world.release.authorize",
        required_flags: &[
            "--world",
            "--principal",
            "--action-id",
            "--definition-digest",
            "--resource-id",
        ],
        examples: &[
            "zoen world release authorize --world world.alpha --principal principal.owner --action-id zoen.world.discover --definition-digest <digest> --resource-id resource.world --operation discover",
        ],
        stdout_json: r#"{"format":"json","fields":["authority","decision","digest","policyCatalogDigest","world"]}"#,
    },
    SchemaEntry {
        command: "definition.publish",
        required_flags: &["--file"],
        examples: &[
            "zoen definition publish --file definition.canonical.json",
            "zoen definition publish --file -",
        ],
        stdout_json: r#"{"format":"json","fields":["definitionId","digest"]}"#,
    },
    SchemaEntry {
        command: "definition.activate",
        required_flags: &["--definition-id", "--digest"],
        examples: &[
            "zoen definition activate --definition-id inventory.definition --digest <digest> --dry-run",
            "zoen definition activate --definition-id inventory.definition --digest <digest>",
        ],
        stdout_json: r#"{"format":"json","dryRun":{"dryRun":true,"definitionId":"...","digest":"..."},"live":{"definitionId":"...","digest":"..."}}"#,
    },
    SchemaEntry {
        command: "source.connect.rest",
        required_flags: &["--base", "--idempotency-key|--id"],
        examples: &[
            "zoen source connect rest --idempotency-key rest --base https://api.example.com",
            "zoen source connect rest --id rest --base https://api.example.com --dry-run",
        ],
        stdout_json: r#"{"format":"json","fields":["id","kind","baseUrl"]}"#,
    },
    SchemaEntry {
        command: "source.connect.oauth2",
        required_flags: &["--token-url", "--client-id", "--idempotency-key|--id"],
        examples: &[
            "ZOEN_SOURCE_CLIENT_SECRET=... zoen source connect oauth2 --idempotency-key oauth2 --token-url https://auth.example.com/token --client-id client",
            "zoen source connect oauth2 --idempotency-key oauth2 --token-url https://auth.example.com/token --client-id client --client-secret-stdin",
        ],
        stdout_json: r#"{"format":"json","fields":["id","kind"]}"#,
    },
    SchemaEntry {
        command: "source.connect.google",
        required_flags: &["--profile", "--idempotency-key|--id"],
        examples: &[
            "zoen source connect google --idempotency-key work --profile work --base https://www.googleapis.com",
            "ZOEN_SOURCE_TOKEN=... zoen source connect google --idempotency-key work --profile work --base https://stand-in.example",
        ],
        stdout_json: r#"{"format":"json","fields":["id","kind","profile"]}"#,
    },
    SchemaEntry {
        command: "source.connect.mcp",
        required_flags: &["--url", "--idempotency-key|--id"],
        examples: &["zoen source connect mcp --idempotency-key mcp --url https://mcp.example.com"],
        stdout_json: r#"{"format":"json","fields":["id","kind","url"]}"#,
    },
    SchemaEntry {
        command: "source.introduce",
        required_flags: &[],
        examples: &["zoen source introduce rest --path /pedidos"],
        stdout_json: r#"{"format":"json","fields":["id","introduced"]}"#,
    },
    SchemaEntry {
        command: "source.sync",
        required_flags: &[],
        examples: &["zoen source sync rest", "zoen source sync rest --dry-run"],
        stdout_json: r#"{"format":"json","dryRun":{"dryRun":true},"live":{"synced":true}}"#,
    },
    SchemaEntry {
        command: "action.propose",
        required_flags: &[
            "--idempotency-key|--proposal-id",
            "--action-id",
            "--resource-id",
            "--expires-at",
            "--quantity|--input|--input-file",
        ],
        examples: &[
            "zoen action propose --idempotency-key p --action-id inventory.replenish --resource-id inventory.item.1 --quantity 1 --expires-at 2030-01-01T00:00:00Z --unit each --dry-run",
            "zoen action propose --idempotency-key p --action-id world.stamp --resource-id world.note.1 --input text=hello --expires-at 2030-01-01T00:00:00Z",
            "zoen action propose --idempotency-key p --action-id world.stamp --resource-id world.note.1 --input-file - --expires-at 2030-01-01T00:00:00Z",
        ],
        stdout_json: r#"{"format":"json","dryRun":{"dryRun":true,"propose":{"actionId":"...","resourceId":"...","expiresAt":"..."}},"live":{"decision":"...","previewHash":"...","proposal":"..."}}"#,
    },
    SchemaEntry {
        command: "action.commit",
        required_flags: &["--proposal-id", "--operation-id", "--preview-hash"],
        examples: &[
            "zoen action commit --proposal-id p --operation-id p --preview-hash <hash> --dry-run",
            "zoen action commit --proposal-id p --operation-id p --preview-hash <hash>",
        ],
        stdout_json: r#"{"format":"json","dryRun":{"commit":{"proposalId":"...","operationId":"...","previewHash":"..."},"dryRun":true},"live":{"claimIds":[],"receipt":"...","status":"..."}}"#,
    },
    SchemaEntry {
        command: "action.discover",
        required_flags: &["--resource-id"],
        examples: &["zoen action discover --resource-id inventory.item.1"],
        stdout_json: r#"{"format":"json","fields":["actions"]}"#,
    },
    SchemaEntry {
        command: "history.explain",
        required_flags: &["--claim-id|--operation-id|--proposal-id|--effect-request-id"],
        examples: &[
            "zoen history explain --claim-id claim.x",
            "zoen history explain --operation-id operation.x",
        ],
        stdout_json: r#"{"format":"json","fields":["explanation"]}"#,
    },
    SchemaEntry {
        command: "auth.login",
        required_flags: &["--device|--email"],
        examples: &[
            "zoen auth login --device",
            "zoen auth login --email you@example.com --password-stdin",
        ],
        stdout_json: r#"{"format":"json","fields":["loggedIn"]}"#,
    },
    SchemaEntry {
        command: "write-build-artifact",
        required_flags: &["<revision>", "<dir>"],
        examples: &["zoen write-build-artifact <revision> <dir>"],
        stdout_json: r#"{"format":"artifact","fields":["revision","path"]}"#,
    },
];

fn schema_json(entry: &SchemaEntry) -> Value {
    let stdout: Value = serde_json::from_str(entry.stdout_json).unwrap_or(Value::Null);
    json!({
        "command": entry.command,
        "requiredFlags": entry.required_flags,
        "examples": entry.examples,
        "stdout": stdout,
    })
}

fn lookup_schema(command: &str) -> CommandResult {
    let key = command.trim();
    if let Some(entry) = SCHEMA_REGISTRY.iter().find(|entry| entry.command == key) {
        return ok(&schema_json(entry));
    }
    let known = SCHEMA_REGISTRY
        .iter()
        .map(|entry| entry.command)
        .collect::<Vec<_>>()
        .join(", ");
    fail(
        2,
        &format!("unknown schema command `{key}`\n  known: {known}\n  zoen schema action.propose"),
    )
}

fn write_build_artifact(revision: &str, dir: &Path) -> CommandResult {
    match write_artifact_manifest(revision, dir) {
        Ok(path) => {
            let mut stdout = json!({
                "format": "artifact",
                "path": path.display().to_string(),
                "revision": revision,
            })
            .to_string();
            stdout.push('\n');
            CommandResult {
                exit_code: 0,
                stdout,
                stderr: String::new(),
            }
        }
        Err(message) => fail(
            2,
            &format!("{message}\n  zoen write-build-artifact <immutable-revision> <dir>"),
        ),
    }
}

fn write_artifact_manifest(revision: &str, dir: &Path) -> Result<PathBuf, String> {
    const FILENAME: &str = "effect-handler-artifact.json";
    if !is_artifact_revision(revision) {
        return Err("effect handler artifact revision is malformed".to_owned());
    }
    if !dir.is_absolute() || has_nul(dir) {
        return Err("effect handler artifact directory must be absolute".to_owned());
    }
    let root = dir.to_path_buf();
    let destination = root.join(FILENAME);
    if destination.parent().is_none_or(|parent| parent != root) {
        return Err("effect handler artifact path escapes its directory".to_owned());
    }
    let temporary = root.join(format!("{FILENAME}.{}.tmp", std::process::id()));
    if temporary.parent().is_none_or(|parent| parent != root) {
        return Err("effect handler artifact path escapes its directory".to_owned());
    }
    if let Err(error) = fs::create_dir_all(&root) {
        return Err(format!(
            "effect handler artifact directory cannot be created: {error}"
        ));
    }
    let document = format!("{{\"revision\":\"{revision}\",\"schemaVersion\":1}}\n");
    if let Err(error) = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o444)
        .open(&temporary)
        .and_then(|mut file| {
            use std::io::Write;
            file.write_all(document.as_bytes())
        })
    {
        return Err(format!(
            "effect handler artifact cannot be written: {error}"
        ));
    }
    if let Err(error) = fs::rename(&temporary, &destination) {
        let _ = fs::remove_file(&temporary);
        return Err(format!(
            "effect handler artifact cannot be published: {error}"
        ));
    }
    let mut permissions = match fs::metadata(&destination) {
        Ok(metadata) => metadata.permissions(),
        Err(error) => {
            return Err(format!(
                "effect handler artifact cannot be published: {error}"
            ));
        }
    };
    permissions.set_mode(0o444);
    if let Err(error) = fs::set_permissions(&destination, permissions) {
        return Err(format!(
            "effect handler artifact cannot be published: {error}"
        ));
    }
    Ok(destination)
}

fn is_artifact_revision(revision: &str) -> bool {
    if revision.is_empty() || revision.len() > 128 {
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

#[cfg(unix)]
fn has_nul(path: &Path) -> bool {
    use std::os::unix::ffi::OsStrExt;
    path.as_os_str().as_bytes().contains(&0)
}

#[cfg(not(unix))]
fn has_nul(_path: &Path) -> bool {
    false
}

/// Ontology commands the `zoen` binary accepts.
#[derive(Subcommand)]
pub enum Command {
    /// Dump machine-readable schema JSON for one command
    #[command(after_help = "Examples:\n  zoen schema action.propose\n  zoen schema world.query")]
    Schema {
        /// Dotted command path such as `action.propose`
        command: String,
    },
    /// Start the Connect API daemon
    #[command(after_help = "Examples:\n  zoen serve")]
    Serve,
    /// Query the world and manage scenarios
    #[command(after_help = "Examples:\n  zoen world query --type inventory.Item")]
    World {
        #[command(subcommand)]
        command: WorldCommand,
    },
    /// Publish and activate canonical JSON definitions
    #[command(after_help = "Examples:\n  zoen definition publish --file definition.canonical.json")]
    Definition {
        #[command(subcommand)]
        command: DefinitionCommand,
    },
    /// Connect, introduce, and sync external sources
    #[command(
        after_help = "Examples:\n  zoen source connect rest --idempotency-key rest --base https://api.example.com"
    )]
    Source {
        #[command(subcommand)]
        command: SourceCommand,
    },
    /// Discover, propose, and commit governed Actions
    #[command(after_help = "Examples:\n  zoen action discover --resource-id inventory.item.1")]
    Action {
        #[command(subcommand)]
        command: ActionCommand,
    },
    /// Explain committed history
    #[command(after_help = "Examples:\n  zoen history explain --claim-id claim.x")]
    History {
        #[command(subcommand)]
        command: HistoryCommand,
    },
    /// Sign in at the Better Auth door
    #[command(
        after_help = "Examples:\n  zoen auth login --device\n  zoen auth login --email you@example.com --password-stdin"
    )]
    Auth {
        #[command(subcommand)]
        command: AuthCommand,
    },
    /// Write the baked effect-handler artifact manifest for a revision
    #[command(after_help = "Examples:\n  zoen write-build-artifact <revision> <dir>")]
    WriteBuildArtifact {
        /// Immutable artifact revision baked into the image
        revision: String,
        /// Directory receiving effect-handler-artifact.json
        dir: PathBuf,
    },
}

#[derive(Subcommand)]
pub enum WorldCommand {
    /// Query semantic objects at a knowledge cut
    #[command(
        after_help = "Examples:\n  zoen world query --type inventory.Item\n  zoen world query --type inventory.Item --limit 20\n  zoen world query --type inventory.Item --limit 20 --page-token <nextPageToken>"
    )]
    Query {
        #[arg(long = "type")]
        type_id: String,
        #[arg(long, default_value_t = 10)]
        limit: u32,
        #[arg(long = "page-token", default_value = "")]
        page_token: String,
        #[arg(long = "fields", value_delimiter = ',', num_args = 0..)]
        fields: Option<Vec<String>>,
        #[arg(long = "scenario", default_value = "")]
        scenario: String,
    },
    /// Create, apply, or discard a named scenario
    #[command(after_help = "Examples:\n  zoen world scenario create --idempotency-key draft")]
    Scenario {
        #[command(subcommand)]
        command: ScenarioCommand,
    },
    /// Construct, publish, and activate a `WorldRelease`
    #[command(after_help = "Examples:\n  zoen world release construct --file content.json")]
    Release {
        #[command(subcommand)]
        command: ReleaseCommand,
    },
}

#[derive(Subcommand)]
pub enum ReleaseCommand {
    /// Derive `ReleaseDigest` from private content. Does not accept `--digest`
    #[command(
        after_help = "Examples:\n  zoen world release construct --file content.json\n  zoen world release construct --file -"
    )]
    Construct {
        #[arg(long)]
        file: PathBuf,
    },
    /// Store content and separate publication metadata
    #[command(
        after_help = "Examples:\n  zoen world release publish --file content.json --principal principal.owner --policy-id policy.world --policy-digest <digest> --policy-revision 1 --determining-policy policy.world"
    )]
    Publish {
        #[arg(long)]
        file: PathBuf,
        #[arg(long)]
        principal: String,
        #[arg(long = "policy-id")]
        policy_id: String,
        #[arg(long = "policy-digest")]
        policy_digest: String,
        #[arg(long = "policy-revision")]
        policy_revision: u64,
        #[arg(long = "determining-policy", num_args = 0..)]
        determining_policy: Vec<String>,
    },
    /// Derive a deterministic activation preview for a published candidate
    #[command(
        after_help = "Examples:\n  zoen world release preview --world world.alpha --digest <digest> --principal principal.owner"
    )]
    Preview {
        #[arg(long)]
        world: String,
        #[arg(long)]
        digest: String,
        #[arg(long)]
        principal: String,
    },
    /// Record an owner Decide over one activation preview
    #[command(
        after_help = "Examples:\n  zoen world release decide --preview-digest <digest> --principal principal.owner --decision approve"
    )]
    Decide {
        #[arg(long = "preview-digest")]
        preview_digest: String,
        #[arg(long)]
        principal: String,
        #[arg(long)]
        decision: String,
    },
    /// Atomically replace the active release pointer after an approving Decide
    #[command(
        after_help = "Examples:\n  zoen world release activate --world world.alpha --digest <digest> --preview-digest <preview> --principal principal.owner"
    )]
    Activate {
        #[arg(long)]
        world: String,
        #[arg(long)]
        digest: String,
        #[arg(long = "preview-digest")]
        preview_digest: String,
        #[arg(long)]
        principal: String,
    },
    /// Fetch a release by derived digest
    #[command(after_help = "Examples:\n  zoen world release get --digest <digest>")]
    Get {
        #[arg(long)]
        digest: String,
    },
    /// Show the active release for a World
    #[command(after_help = "Examples:\n  zoen world release active --world world.alpha")]
    Active {
        #[arg(long)]
        world: String,
    },
    /// Fetch the four catalog blobs bound by a release digest
    #[command(
        after_help = "Examples:\n  zoen world release catalogs --digest <digest>\n  zoen world release catalogs --digest <digest> --world world.alpha"
    )]
    Catalogs {
        #[arg(long)]
        digest: String,
        #[arg(long)]
        world: Option<String>,
    },
    /// Authorize a governed verb using active-release `PolicyCatalog` Cedar
    #[command(
        after_help = "Examples:\n  zoen world release authorize --world world.alpha --principal principal.owner --action-id zoen.world.discover --definition-digest <digest> --resource-id resource.world --operation discover"
    )]
    Authorize {
        #[arg(long)]
        world: String,
        #[arg(long)]
        principal: String,
        #[arg(long = "action-id")]
        action_id: String,
        #[arg(long = "definition-digest")]
        definition_digest: String,
        #[arg(long = "definition-id", default_value = "definition.world")]
        definition_id: String,
        #[arg(long = "resource-id")]
        resource_id: String,
        #[arg(long, default_value = "discover")]
        operation: String,
    },
}

#[derive(Subcommand)]
pub enum ScenarioCommand {
    /// Create a named scenario
    #[command(
        after_help = "Examples:\n  zoen world scenario create --idempotency-key draft\n  zoen world scenario create --name draft"
    )]
    Create {
        #[arg(long, default_value = "")]
        name: String,
        #[arg(long = "idempotency-key", default_value = "")]
        idempotency_key: String,
    },
    /// Apply a named scenario
    #[command(
        after_help = "Examples:\n  zoen world scenario apply --name draft --dry-run\n  zoen world scenario apply --name draft"
    )]
    Apply {
        #[arg(long)]
        name: String,
        #[arg(long)]
        dry_run: bool,
    },
    /// Discard a named scenario
    #[command(
        after_help = "Examples:\n  zoen world scenario discard --name draft --dry-run\n  zoen world scenario discard --name draft"
    )]
    Discard {
        #[arg(long)]
        name: String,
        #[arg(long)]
        dry_run: bool,
    },
}

#[derive(Subcommand)]
pub enum DefinitionCommand {
    /// Publish canonical JSON. `--file -` reads stdin
    #[command(
        after_help = "Examples:\n  zoen definition publish --file definition.canonical.json\n  zoen definition publish --file -"
    )]
    Publish {
        #[arg(long)]
        file: PathBuf,
    },
    /// Activate a published definition digest
    #[command(
        after_help = "Examples:\n  zoen definition activate --definition-id inventory.definition --digest <digest> --dry-run\n  zoen definition activate --definition-id inventory.definition --digest <digest>"
    )]
    Activate {
        #[arg(long = "definition-id")]
        definition_id: String,
        #[arg(long)]
        digest: String,
        #[arg(long)]
        dry_run: bool,
    },
}

#[derive(Subcommand)]
pub enum SourceCommand {
    /// Store a source connection
    #[command(
        after_help = "Examples:\n  zoen source connect rest --idempotency-key rest --base https://api.example.com"
    )]
    Connect {
        #[command(subcommand)]
        command: ConnectCommand,
    },
    /// Introduce a folder, path, or query on a connected source
    #[command(after_help = "Examples:\n  zoen source introduce rest --path /pedidos")]
    Introduce {
        id: String,
        #[arg(long)]
        folder: Option<String>,
        #[arg(long)]
        path: Option<String>,
        #[arg(long)]
        query: Option<String>,
        #[arg(long)]
        dry_run: bool,
    },
    /// Fetch an introduced source and map quantity
    #[command(after_help = "Examples:\n  zoen source sync rest\n  zoen source sync rest --dry-run")]
    Sync {
        id: String,
        #[arg(long)]
        dry_run: bool,
    },
}

#[derive(Subcommand)]
pub enum ConnectCommand {
    /// Connect a REST source
    #[command(
        after_help = "Examples:\n  zoen source connect rest --idempotency-key rest --base https://api.example.com\n  zoen source connect rest --id rest --base https://api.example.com"
    )]
    Rest {
        #[arg(long, default_value = "rest")]
        id: String,
        #[arg(long = "idempotency-key", default_value = "")]
        idempotency_key: String,
        #[arg(long = "base")]
        base_url: String,
        #[arg(long)]
        auth: Option<String>,
        #[arg(long = "api-key")]
        api_key: Option<String>,
        #[arg(long)]
        dry_run: bool,
    },
    /// Connect an `OAuth2` client-credentials source
    #[command(
        after_help = "Secret resolution: --client-secret, else ZOEN_SOURCE_CLIENT_SECRET, else stdin with --client-secret-stdin.\nPrefer ZOEN_SOURCE_CLIENT_SECRET or --client-secret-stdin so the secret is not on argv.\n\nExamples:\n  ZOEN_SOURCE_CLIENT_SECRET=... zoen source connect oauth2 --idempotency-key oauth2 --token-url https://auth.example.com/token --client-id client\n  zoen source connect oauth2 --idempotency-key oauth2 --token-url https://auth.example.com/token --client-id client --client-secret-stdin"
    )]
    Oauth2 {
        #[arg(long, default_value = "oauth2")]
        id: String,
        #[arg(long = "idempotency-key", default_value = "")]
        idempotency_key: String,
        #[arg(long = "token-url")]
        token_url: String,
        #[arg(long = "client-id")]
        client_id: String,
        #[arg(long = "client-secret")]
        client_secret: Option<String>,
        #[arg(long = "client-secret-stdin")]
        client_secret_stdin: bool,
        #[arg(long = "base")]
        base_url: Option<String>,
        #[arg(long)]
        dry_run: bool,
    },
    /// Connect a Google Drive stand-in. Door tokens are not ingest authority
    #[command(
        after_help = "Token resolution: --token, else ZOEN_SOURCE_TOKEN, else stdin with --token-stdin.\nPrefer ZOEN_SOURCE_TOKEN or --token-stdin so the secret is not on argv. --use-door is not ingest authority.\n\nExamples:\n  zoen source connect google --idempotency-key work --profile work --base https://www.googleapis.com\n  ZOEN_SOURCE_TOKEN=... zoen source connect google --idempotency-key work --profile work --base https://stand-in.example"
    )]
    Google {
        #[arg(long)]
        profile: String,
        #[arg(long, default_value = "")]
        id: String,
        #[arg(long = "idempotency-key", default_value = "")]
        idempotency_key: String,
        #[arg(long = "base")]
        base_url: Option<String>,
        #[arg(long = "use-door")]
        use_door: bool,
        #[arg(long)]
        token: Option<String>,
        #[arg(long = "token-stdin")]
        token_stdin: bool,
        #[arg(long)]
        dry_run: bool,
    },
    /// Connect an MCP source
    #[command(
        after_help = "Examples:\n  zoen source connect mcp --idempotency-key mcp --url https://mcp.example.com"
    )]
    Mcp {
        #[arg(long)]
        url: String,
        #[arg(long, default_value = "mcp")]
        id: String,
        #[arg(long = "idempotency-key", default_value = "")]
        idempotency_key: String,
        #[arg(long)]
        dry_run: bool,
    },
}

#[derive(Subcommand)]
pub enum ActionCommand {
    /// Propose an Action. `--quantity` is dest quantity. `--input` is text. `--input-file` is JSON
    #[command(
        after_help = "Examples:\n  zoen action propose --idempotency-key p --action-id inventory.replenish --resource-id inventory.item.1 --quantity 1 --expires-at 2030-01-01T00:00:00Z --unit each --dry-run\n  zoen action propose --idempotency-key p --action-id world.stamp --resource-id world.note.1 --input text=hello --expires-at 2030-01-01T00:00:00Z\n  zoen action propose --idempotency-key p --action-id world.stamp --resource-id world.note.1 --input-file - --expires-at 2030-01-01T00:00:00Z"
    )]
    Propose {
        #[arg(long = "proposal-id", default_value = "")]
        proposal_id: String,
        #[arg(long = "idempotency-key", default_value = "")]
        idempotency_key: String,
        #[arg(long = "action-id")]
        action_id: String,
        #[arg(long = "resource-id")]
        resource_id: String,
        #[arg(long = "operation-id")]
        operation_id: Option<String>,
        #[arg(long)]
        quantity: Option<String>,
        #[arg(long, default_value = "each")]
        unit: String,
        #[arg(long = "scenario", default_value = "")]
        scenario: String,
        #[arg(long = "input", value_name = "KEY=VALUE")]
        inputs: Vec<String>,
        #[arg(long = "input-file", value_name = "PATH")]
        input_file: Option<PathBuf>,
        #[arg(long = "expires-at")]
        expires_at: Option<String>,
        #[arg(long)]
        dry_run: bool,
    },
    /// Commit a proposed Action
    #[command(
        after_help = "Examples:\n  zoen action commit --proposal-id p --operation-id p --preview-hash <hash> --dry-run\n  zoen action commit --proposal-id p --operation-id p --preview-hash <hash>"
    )]
    Commit {
        #[arg(long = "proposal-id")]
        proposal_id: String,
        #[arg(long = "operation-id")]
        operation_id: String,
        #[arg(long = "preview-hash")]
        preview_hash: String,
        #[arg(long)]
        dry_run: bool,
    },
    /// List Actions on the active definition
    #[command(after_help = "Examples:\n  zoen action discover --resource-id inventory.item.1")]
    Discover {
        #[arg(long = "resource-id")]
        resource_id: String,
    },
}

#[derive(Subcommand)]
pub enum HistoryCommand {
    /// Explain an operation, claim, proposal, or effect
    #[command(
        after_help = "Examples:\n  zoen history explain --claim-id claim.x\n  zoen history explain --operation-id operation.x\n  zoen history explain --proposal-id proposal.x\n  zoen history explain --effect-request-id effect.x"
    )]
    Explain {
        #[arg(long = "operation-id")]
        operation_id: Option<String>,
        #[arg(long = "claim-id")]
        claim_id: Option<String>,
        #[arg(long = "effect-request-id")]
        effect_request_id: Option<String>,
        #[arg(long = "proposal-id")]
        proposal_id: Option<String>,
    },
}

#[derive(Subcommand)]
pub enum AuthCommand {
    /// Sign in at Better Auth
    #[command(
        after_help = "Password resolution: --password, else ZOEN_PASSWORD, else stdin with --password-stdin.\nPrefer ZOEN_PASSWORD or --password-stdin so the secret is not on argv. A successful login is stored in ~/.zoen/credentials.json.\n\nExamples:\n  zoen auth login --device\n  zoen auth login --email you@example.com --password-stdin\n  ZOEN_PASSWORD=... zoen auth login --email you@example.com"
    )]
    Login {
        #[arg(long)]
        email: Option<String>,
        #[arg(long)]
        password: Option<String>,
        #[arg(long = "password-stdin")]
        password_stdin: bool,
        #[arg(long)]
        device: bool,
    },
}

struct RuntimeEnv {
    zoend: String,
    bearer: String,
    tenant: String,
    source_home: PathBuf,
    definition_id: String,
    definition_digest: String,
    definition_revision: String,
    valid_at: String,
    principal_id: String,
    actor_id: String,
    workload_id: String,
    isolate: bool,
}

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct UserCredential {
    zoend: String,
    session_token: String,
}

struct CommandResult {
    exit_code: u8,
    stdout: String,
    stderr: String,
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SourceAuthApiKey {
    header: String,
    value: String,
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SourceAuthOauth2 {
    access_token: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    token_url: Option<String>,
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum SourceAuth {
    None,
    #[serde(rename = "apikey")]
    ApiKey(SourceAuthApiKey),
    Oauth2(SourceAuthOauth2),
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct Introduced {
    #[serde(skip_serializing_if = "Option::is_none")]
    folder: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    folder_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    query: Option<String>,
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SourceInstance {
    id: String,
    kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    profile: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    oauth_app: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    base_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    url: Option<String>,
    auth: SourceAuth,
    #[serde(skip_serializing_if = "Option::is_none")]
    introduced: Option<Introduced>,
    #[serde(skip_serializing_if = "Option::is_none")]
    cursor: Option<String>,
}

struct SourceFetch {
    bytes: Vec<u8>,
    quantity: Option<String>,
    cursor: Option<String>,
    durable_event_id: String,
    resource_id: String,
    operation_id: String,
}

/// Run an ontology command against a running zoend.
///
/// # Errors
///
/// Returns an error when stdout or stderr cannot be written.
pub async fn run(command: Command) -> Result<(), Box<dyn Error + Send + Sync>> {
    let result = match dispatch(command).await {
        Ok(result) => result,
        Err(error) => command_error(&error.to_string()),
    };
    io::stdout().write_all(result.stdout.as_bytes())?;
    io::stderr().write_all(result.stderr.as_bytes())?;
    if result.exit_code == 0 {
        Ok(())
    } else {
        std::process::exit(i32::from(result.exit_code));
    }
}

async fn dispatch(command: Command) -> Result<CommandResult, Box<dyn Error + Send + Sync>> {
    match command {
        Command::Schema { command } => Ok(lookup_schema(&command)),
        Command::Serve => unreachable!("serve is handled in main"),
        Command::Auth {
            command:
                AuthCommand::Login {
                    email,
                    password,
                    password_stdin,
                    device,
                },
        } => run_auth_login(email, password, password_stdin, device).await,
        Command::World {
            command: WorldCommand::Release { command },
        } => {
            let result = crate::world_release_cli::run(command).await?;
            Ok(map_release_result(&result))
        }
        Command::World { command } => run_world(&parse_env()?, command).await,
        Command::Definition { command } => run_definition(&parse_env()?, command).await,
        Command::Source { command } => run_source(&parse_env()?, command).await,
        Command::Action { command } => run_action(&parse_env()?, command).await,
        Command::History { command } => run_history(&parse_env()?, command).await,
        Command::WriteBuildArtifact { revision, dir } => Ok(write_build_artifact(&revision, &dir)),
    }
}

async fn run_world(
    env: &RuntimeEnv,
    command: WorldCommand,
) -> Result<CommandResult, Box<dyn Error + Send + Sync>> {
    match command {
        WorldCommand::Release { .. } => {
            unreachable!("world release is dispatched without parse_env")
        }
        WorldCommand::Query {
            type_id,
            limit,
            page_token,
            fields,
            scenario,
        } => {
            world_query(
                env,
                &type_id,
                limit,
                &page_token,
                fields.as_deref(),
                &scenario,
            )
            .await
        }
        WorldCommand::Scenario { command } => match command {
            ScenarioCommand::Create {
                name,
                idempotency_key,
            } => {
                let Some(name) = dest_create_key(&idempotency_key, &name) else {
                    return Ok(fail(
                        2,
                        "zoen world scenario create requires --idempotency-key or --name\n  zoen world scenario create --idempotency-key draft",
                    ));
                };
                scenario_rpc(env, "/zoen.world.v1.WorldService/CreateScenario", &name).await
            }
            ScenarioCommand::Apply { name, dry_run } => {
                if env.isolate && !dry_run {
                    return Ok(fail(1, "isolate cannot apply"));
                }
                if dry_run {
                    return Ok(ok(&json!({
                        "apply": {
                            "scenarioId": name,
                            "tenantId": env.tenant,
                        },
                        "dryRun": true,
                    })));
                }
                scenario_rpc(env, "/zoen.world.v1.WorldService/ApplyScenario", &name).await
            }
            ScenarioCommand::Discard { name, dry_run } => {
                if env.isolate && !dry_run {
                    return Ok(fail(1, "isolate cannot discard"));
                }
                if dry_run {
                    return Ok(ok(&json!({
                        "discard": {
                            "scenarioId": name,
                            "tenantId": env.tenant,
                        },
                        "dryRun": true,
                    })));
                }
                scenario_rpc(env, "/zoen.world.v1.WorldService/DiscardScenario", &name).await
            }
        },
    }
}

async fn run_definition(
    env: &RuntimeEnv,
    command: DefinitionCommand,
) -> Result<CommandResult, Box<dyn Error + Send + Sync>> {
    match command {
        DefinitionCommand::Publish { file } => publish_definition(env, &file).await,
        DefinitionCommand::Activate {
            definition_id,
            digest,
            dry_run,
        } => activate_definition(env, &definition_id, &digest, dry_run).await,
    }
}

async fn run_source(
    env: &RuntimeEnv,
    command: SourceCommand,
) -> Result<CommandResult, Box<dyn Error + Send + Sync>> {
    match command {
        SourceCommand::Connect { command } => connect_source(env, command).await,
        SourceCommand::Introduce {
            id,
            folder,
            path,
            query,
            dry_run,
        } => introduce_source(
            env,
            &id,
            folder.as_deref(),
            path.as_deref(),
            query.as_deref(),
            dry_run,
        ),
        SourceCommand::Sync { id, dry_run } => sync_source(env, &id, dry_run).await,
    }
}

async fn run_action(
    env: &RuntimeEnv,
    command: ActionCommand,
) -> Result<CommandResult, Box<dyn Error + Send + Sync>> {
    match command {
        ActionCommand::Propose {
            proposal_id,
            idempotency_key,
            action_id,
            resource_id,
            operation_id,
            quantity,
            unit,
            scenario,
            inputs,
            input_file,
            expires_at,
            dry_run,
        } => {
            let Some(proposal_id) = dest_create_key(&idempotency_key, &proposal_id) else {
                return Ok(fail(
                    2,
                    "zoen action propose requires --idempotency-key or --proposal-id --action-id --resource-id\n  zoen action propose --idempotency-key p --action-id inventory.replenish --resource-id inventory.item.1 --quantity 1 --expires-at 2030-01-01T00:00:00Z",
                ));
            };
            propose_action(
                env,
                ProposeInput {
                    proposal_id,
                    action_id,
                    resource_id,
                    operation_id: operation_id.unwrap_or_default(),
                    quantity,
                    unit,
                    scenario,
                    inputs: parse_inputs(&inputs),
                    input_file,
                    expires_at,
                    dry_run,
                },
            )
            .await
        }
        ActionCommand::Commit {
            proposal_id,
            operation_id,
            preview_hash,
            dry_run,
        } => commit_action(env, &proposal_id, &operation_id, &preview_hash, dry_run).await,
        ActionCommand::Discover { resource_id } => discover_actions(env, &resource_id).await,
    }
}

async fn run_history(
    env: &RuntimeEnv,
    command: HistoryCommand,
) -> Result<CommandResult, Box<dyn Error + Send + Sync>> {
    let HistoryCommand::Explain {
        operation_id,
        claim_id,
        effect_request_id,
        proposal_id,
    } = command;
    explain_history(
        env,
        operation_id.as_deref(),
        claim_id.as_deref(),
        effect_request_id.as_deref(),
        proposal_id.as_deref(),
    )
    .await
}

fn parse_env() -> Result<RuntimeEnv, Box<dyn Error + Send + Sync>> {
    let zoend = required_env("ZOEN_ZOEND")?.trim_end_matches('/').to_owned();
    Ok(RuntimeEnv {
        actor_id: env_or("ZOEN_ACTOR", "actor.personal"),
        bearer: resolve_bearer(&zoend)?,
        definition_digest: env_or("ZOEN_DEFINITION_DIGEST", ""),
        definition_id: env_or("ZOEN_DEFINITION_ID", ""),
        definition_revision: env_or("ZOEN_DEFINITION_REVISION", ""),
        isolate: env::var("ZOEN_ISOLATE").ok().as_deref() == Some("1"),
        principal_id: env_or("ZOEN_PRINCIPAL", "principal.personal"),
        source_home: PathBuf::from(env_or("ZOEN_SOURCE_HOME", ".zoen")),
        tenant: required_env("ZOEN_TENANT")?,
        valid_at: required_env("ZOEN_VALID_AT")?,
        workload_id: env_or("ZOEN_WORKLOAD", "workload.personal"),
        zoend,
    })
}

fn resolve_bearer(zoend: &str) -> Result<String, Box<dyn Error + Send + Sync>> {
    if let Ok(value) = env::var("ZOEN_BEARER") {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_owned());
        }
    }
    let path = credential_store_path()?;
    let raw = match fs::read_to_string(&path) {
        Ok(raw) => raw,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            return Err(missing_login_message().into());
        }
        Err(error) => {
            return Err(format!("could not read {}: {error}", path.display()).into());
        }
    };
    let credential: UserCredential = serde_json::from_str(&raw)
        .map_err(|_| format!("{} is not a valid Zoen credential store", path.display()))?;
    if credential.zoend != zoend || credential.session_token.trim().is_empty() {
        return Err(missing_login_message().into());
    }
    Ok(credential.session_token)
}

fn missing_login_message() -> &'static str {
    "authentication is required for ZOEN_ZOEND and ZOEN_BEARER is empty\n  zoen auth login --device\n  zoen auth login --email you@example.com --password-stdin"
}

fn env_or(name: &str, fallback: &str) -> String {
    env::var(name)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| fallback.to_owned())
}

fn required_env(name: &str) -> Result<String, Box<dyn Error + Send + Sync>> {
    if let Ok(value) = env::var(name) {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_owned());
        }
    }
    Err(required_env_message(name).into())
}

fn required_env_message(name: &str) -> String {
    match name {
        "ZOEN_ZOEND" => format!("{name} is required\n  export ZOEN_ZOEND=http://127.0.0.1:58080"),
        "ZOEN_TENANT" => format!("{name} is required\n  export ZOEN_TENANT=tenant.a"),
        "ZOEN_VALID_AT" => {
            format!("{name} is required\n  export ZOEN_VALID_AT=2026-01-15T00:00:00Z")
        }
        "ZOEN_EXPIRES_AT" => {
            format!("{name} is required\n  export ZOEN_EXPIRES_AT=2030-01-01T00:00:00Z")
        }
        _ => format!("{name} is required"),
    }
}

fn missing_definition(env: &RuntimeEnv) -> Option<CommandResult> {
    if env.definition_digest.is_empty() {
        return Some(fail(
            2,
            "ZOEN_DEFINITION_DIGEST is required\n  export ZOEN_DEFINITION_DIGEST=<digest>",
        ));
    }
    if env.definition_id.is_empty() {
        return Some(fail(
            2,
            "ZOEN_DEFINITION_ID is required\n  export ZOEN_DEFINITION_ID=inventory.definition",
        ));
    }
    None
}

async fn definition_ref(
    env: &RuntimeEnv,
    resolve_when_empty: bool,
) -> Result<Value, Box<dyn Error + Send + Sync>> {
    let revision = if !env.definition_revision.is_empty() {
        env.definition_revision.clone()
    } else if resolve_when_empty {
        resolve_active_revision(env).await?
    } else {
        // Dry-run / offline fixtures omit ZOEN_DEFINITION_REVISION; do not invent a live revision.
        String::new()
    };
    Ok(json!({
        "definitionId": env.definition_id,
        "digest": env.definition_digest,
        "revision": revision,
    }))
}

async fn resolve_active_revision(env: &RuntimeEnv) -> Result<String, Box<dyn Error + Send + Sync>> {
    let status = connect_json(
        env,
        "/zoen.definition.v1.DefinitionService/GetRevision",
        json!({
            "definitionId": env.definition_id,
            "digest": env.definition_digest,
            "tenantId": env.tenant,
        }),
    )
    .await?;
    if status.status != 200 {
        return Err(format!(
            "GetRevision failed: {} {}\n  export ZOEN_DEFINITION_REVISION=<n> for this digest",
            status.status, status.text
        )
        .into());
    }
    let revision = status
        .json
        .pointer("/definitionRevision/revision")
        .or_else(|| status.json.pointer("/definition_revision/revision"))
        .cloned();
    match revision {
        Some(Value::String(value)) if !value.is_empty() => Ok(value),
        Some(Value::Number(value)) => Ok(value.to_string()),
        _ => Err(
            "GetRevision returned no definitionRevision.revision\n  export ZOEN_DEFINITION_REVISION=<n>"
                .into(),
        ),
    }
}

fn parse_inputs(values: &[String]) -> Vec<(String, String)> {
    values
        .iter()
        .filter_map(|value| {
            let (key, rest) = value.split_once('=')?;
            if key.is_empty() {
                None
            } else {
                Some((key.to_owned(), rest.to_owned()))
            }
        })
        .collect()
}

fn map_release_result(result: &crate::world_release_cli::ReleaseCliResult) -> CommandResult {
    if result.exit_code == 0 {
        ok(&result.stdout)
    } else {
        fail(result.exit_code, &result.message)
    }
}

fn ok(value: &Value) -> CommandResult {
    CommandResult {
        exit_code: 0,
        stdout: format!("{value}\n"),
        stderr: String::new(),
    }
}

#[derive(Clone, Copy)]
enum FailCode {
    PermissionDenied,
    Unauthenticated,
    TimedOut,
    NotConnected,
    IsolateDenied,
    MissingEnv,
    Usage,
}

impl FailCode {
    fn as_str(self) -> &'static str {
        match self {
            Self::PermissionDenied => "permission_denied",
            Self::Unauthenticated => "unauthenticated",
            Self::TimedOut => "timed_out",
            Self::NotConnected => "not_connected",
            Self::IsolateDenied => "isolate_denied",
            Self::MissingEnv => "missing_env",
            Self::Usage => "usage",
        }
    }

    fn parse(raw: &str) -> Option<Self> {
        match raw {
            "permission_denied" | "access_denied" => Some(Self::PermissionDenied),
            "unauthenticated" | "invalid_grant" => Some(Self::Unauthenticated),
            "timed_out" | "expired_token" => Some(Self::TimedOut),
            "not_connected" => Some(Self::NotConnected),
            "isolate_denied" => Some(Self::IsolateDenied),
            "missing_env" => Some(Self::MissingEnv),
            "usage" => Some(Self::Usage),
            _ => None,
        }
    }
}

fn fail(exit_code: u8, message: &str) -> CommandResult {
    fail_coded(exit_code, infer_fail_code(exit_code, message), message)
}

fn fail_coded(exit_code: u8, code: FailCode, message: &str) -> CommandResult {
    let mut lines = message.lines();
    let head = lines.next().unwrap_or(message);
    let teaching = lines.collect::<Vec<_>>().join("\n");
    let header = json!({ "code": code.as_str(), "message": head });
    let stderr = if teaching.is_empty() {
        format!("{header}\n")
    } else {
        format!("{header}\n{teaching}\n")
    };
    CommandResult {
        exit_code,
        stdout: String::new(),
        stderr,
    }
}

fn infer_fail_code(exit_code: u8, message: &str) -> FailCode {
    let head = message.lines().next().unwrap_or(message);
    if head.contains("timed out") {
        return FailCode::TimedOut;
    }
    if head.contains("isolate cannot") {
        return FailCode::IsolateDenied;
    }
    if head.contains("is not connected") {
        return FailCode::NotConnected;
    }
    if head.contains("is required") {
        return FailCode::MissingEnv;
    }
    if exit_code == 2 {
        return FailCode::Usage;
    }
    FailCode::NotConnected
}

fn command_error(text: &str) -> CommandResult {
    let head = text.lines().next().unwrap_or(text);
    let exit_code = if head.contains("is required") { 2 } else { 1 };
    fail(exit_code, text)
}

fn map_connect(status: &ConnectStatus) -> (FailCode, String) {
    let body_code = status
        .json
        .get("code")
        .or_else(|| status.json.get("error"))
        .and_then(Value::as_str);
    let body_message = status
        .json
        .get("message")
        .or_else(|| status.json.get("error_description"))
        .and_then(Value::as_str)
        .map_or_else(
            || {
                if status.json.is_object() {
                    format!("request failed with HTTP {}", status.status)
                } else {
                    status.text.clone()
                }
            },
            str::to_owned,
        );
    if let Some(code) = body_code.and_then(FailCode::parse) {
        return (code, body_message);
    }
    match status.status {
        401 => (FailCode::Unauthenticated, body_message),
        403 => (FailCode::PermissionDenied, body_message),
        408 | 504 => (FailCode::TimedOut, body_message),
        status if (500..600).contains(&status) => (FailCode::NotConnected, body_message),
        _ => {
            let message = match body_code {
                Some(code) => format!("{code}: {body_message}"),
                None => body_message,
            };
            (FailCode::Usage, message)
        }
    }
}

fn fail_connect(status: &ConnectStatus, teaching: Option<&str>) -> CommandResult {
    let (code, message) = map_connect(status);
    match teaching {
        Some(extra) if !extra.is_empty() => fail_coded(1, code, &format!("{message}\n{extra}")),
        _ => fail_coded(1, code, &message),
    }
}

fn fail_http_body(status: u16, text: &str) -> CommandResult {
    let json = serde_json::from_str(text).unwrap_or_else(|_| Value::String(text.to_owned()));
    fail_connect(
        &ConnectStatus {
            status,
            text: text.to_owned(),
            json,
        },
        None,
    )
}

async fn publish_definition(
    env: &RuntimeEnv,
    file: &Path,
) -> Result<CommandResult, Box<dyn Error + Send + Sync>> {
    let raw = read_file_or_stdin(file)?;
    let digest = hex_digest(&raw);
    let status = connect_json(
        env,
        "/zoen.definition.v1.DefinitionService/Publish",
        json!({
            "canonicalJson": base64::engine::general_purpose::STANDARD.encode(&raw),
            "digest": digest,
            "tenantId": env.tenant,
        }),
    )
    .await?;
    if status.status != 200 {
        return Ok(fail_connect(&status, None));
    }
    Ok(ok(&json!({
        "definition": status.json,
        "digest": digest,
        "published": true,
    })))
}

async fn activate_definition(
    env: &RuntimeEnv,
    definition_id: &str,
    digest: &str,
    dry_run: bool,
) -> Result<CommandResult, Box<dyn Error + Send + Sync>> {
    if env.isolate && !dry_run {
        return Ok(fail(1, "isolate cannot activate"));
    }
    let body = json!({
        "definitionId": definition_id,
        "digest": digest,
        "expectNoActiveRevision": true,
        "tenantId": env.tenant,
    });
    if dry_run {
        return Ok(ok(&json!({ "activate": body, "dryRun": true })));
    }
    let status = connect_json(
        env,
        "/zoen.definition.v1.DefinitionService/ActivateRevision",
        body,
    )
    .await?;
    if status.status != 200 {
        return Ok(fail_connect(&status, None));
    }
    Ok(ok(&json!({
        "activated": true,
        "activation": status.json,
        "definitionId": definition_id,
        "digest": digest,
    })))
}

async fn scenario_rpc(
    env: &RuntimeEnv,
    path: &str,
    name: &str,
) -> Result<CommandResult, Box<dyn Error + Send + Sync>> {
    let status = connect_json(
        env,
        path,
        json!({
            "scenarioId": name,
            "tenantId": env.tenant,
        }),
    )
    .await?;
    if status.status != 200 {
        return Ok(fail_connect(&status, None));
    }
    Ok(CommandResult {
        exit_code: 0,
        stdout: format!("{}\n", status.text),
        stderr: String::new(),
    })
}

async fn world_query(
    env: &RuntimeEnv,
    type_id: &str,
    limit: u32,
    page_token: &str,
    fields: Option<&[String]>,
    scenario_id: &str,
) -> Result<CommandResult, Box<dyn Error + Send + Sync>> {
    if let Some(result) = missing_definition(env) {
        return Ok(result);
    }
    let selected = match parse_world_query_fields(fields) {
        Ok(selected) => selected,
        Err(message) => return Ok(fail(2, &message)),
    };
    let definition = match definition_ref(env, true).await {
        Ok(value) => value,
        Err(error) => return Ok(fail(2, &error.to_string())),
    };
    let mut body = json!({
        "byType": { "limit": limit, "typeId": type_id },
        "consistency": { "strong": {} },
        "definition": definition,
        "scenarioId": scenario_id,
        "tenantId": env.tenant,
        "validAt": env.valid_at,
    });
    if !page_token.is_empty() {
        body["pageToken"] = json!(page_token);
    }
    let status = connect_json(env, "/zoen.world.v1.WorldService/SemanticQuery", body).await?;
    if status.status != 200 {
        if status.status == 403 && status.text.contains("subject has no verified binding") {
            return Ok(fail_connect(
                &status,
                Some(
                    "subject has no verified binding. Dest membership is an Active row. An invite is required.\n  zoen action propose --proposal-id p --action-id zoen.world.invite --resource-id world --input accountId=<account>",
                ),
            ));
        }
        return Ok(fail_connect(&status, None));
    }
    Ok(ok(&project_world_query(&status.json, type_id, selected)))
}

const WORLD_QUERY_FIELDS: &[&str] = &["id", "nextPageToken", "type"];

#[derive(Clone, Copy)]
struct WorldQueryFields {
    id: bool,
    next_page_token: bool,
    type_id: bool,
}

fn parse_world_query_fields(fields: Option<&[String]>) -> Result<WorldQueryFields, String> {
    let Some(fields) = fields else {
        return Ok(WorldQueryFields {
            id: true,
            next_page_token: true,
            type_id: true,
        });
    };
    if fields.is_empty() || fields.iter().any(String::is_empty) {
        return Err(world_query_fields_help());
    }
    let mut selected = WorldQueryFields {
        id: false,
        next_page_token: false,
        type_id: false,
    };
    for field in fields {
        match field.as_str() {
            "id" => selected.id = true,
            "nextPageToken" => selected.next_page_token = true,
            "type" => selected.type_id = true,
            _ => return Err(world_query_fields_help()),
        }
    }
    Ok(selected)
}

fn world_query_fields_help() -> String {
    let mut lines = vec!["Specify one or more comma-separated fields for `--fields`:".to_owned()];
    lines.extend(WORLD_QUERY_FIELDS.iter().map(|field| format!("  {field}")));
    lines.join("\n")
}

fn project_world_query(body: &Value, type_id: &str, fields: WorldQueryFields) -> Value {
    let mut out = serde_json::Map::new();
    if fields.id || fields.type_id {
        let items = body
            .get("values")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|entry| {
                let id = entry
                    .pointer("/value/entityRefValue")
                    .and_then(Value::as_str)?;
                let mut item = serde_json::Map::new();
                if fields.id {
                    item.insert("id".to_owned(), json!(id));
                }
                if fields.type_id {
                    item.insert("type".to_owned(), json!(type_id));
                }
                Some(Value::Object(item))
            })
            .collect::<Vec<_>>();
        out.insert("items".to_owned(), Value::Array(items));
    }
    if fields.next_page_token {
        let token = body
            .get("nextPageToken")
            .and_then(Value::as_str)
            .unwrap_or("");
        if !token.is_empty() {
            out.insert("nextPageToken".to_owned(), json!(token));
        }
    }
    Value::Object(out)
}

struct ProposeInput {
    proposal_id: String,
    action_id: String,
    resource_id: String,
    operation_id: String,
    quantity: Option<String>,
    unit: String,
    scenario: String,
    inputs: Vec<(String, String)>,
    input_file: Option<PathBuf>,
    expires_at: Option<String>,
    dry_run: bool,
}

const PROPOSE_INPUT_STAMP: &str = "zoen action propose --idempotency-key p --action-id world.stamp --resource-id world.note.1 --input text=hello --expires-at 2030-01-01T00:00:00Z";

async fn propose_action(
    env: &RuntimeEnv,
    parsed: ProposeInput,
) -> Result<CommandResult, Box<dyn Error + Send + Sync>> {
    let operation_id = if parsed.operation_id.is_empty() {
        parsed.proposal_id.clone()
    } else {
        parsed.operation_id.clone()
    };
    if parsed.proposal_id.is_empty() || parsed.resource_id.is_empty() || parsed.action_id.is_empty()
    {
        return Ok(fail(
            2,
            "zoen action propose requires --idempotency-key or --proposal-id --action-id --resource-id\n  zoen action propose --idempotency-key p --action-id inventory.replenish --resource-id inventory.item.1 --quantity 1 --expires-at 2030-01-01T00:00:00Z",
        ));
    }
    let Some(expires_at) = parsed
        .expires_at
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
    else {
        return Ok(fail(
            2,
            "zoen action propose requires --expires-at\n  zoen action propose --idempotency-key p --action-id inventory.replenish --resource-id inventory.item.1 --quantity 1 --expires-at 2030-01-01T00:00:00Z",
        ));
    };
    if let Some(result) = missing_definition(env) {
        return Ok(result);
    }
    let inputs = match propose_inputs(&parsed) {
        Ok(inputs) => inputs,
        Err(message) => return Ok(fail(2, &message)),
    };
    let definition = match definition_ref(env, !parsed.dry_run).await {
        Ok(value) => value,
        Err(error) => return Ok(fail(2, &error.to_string())),
    };
    let body = json!({
        "actionId": parsed.action_id,
        "definition": definition,
        "expiresAt": expires_at,
        "inputs": inputs,
        "operationId": operation_id,
        "proposalId": parsed.proposal_id,
        "resourceId": parsed.resource_id,
        "scenarioId": parsed.scenario,
        "validAt": env.valid_at,
    });
    if parsed.dry_run {
        return Ok(ok(&json!({ "dryRun": true, "propose": body })));
    }
    let status = connect_json(env, "/zoen.action.v1.ActionService/Propose", body).await?;
    if status.status != 200 {
        return Ok(fail_connect(&status, None));
    }
    let preview = status
        .json
        .pointer("/proposal/previewHash")
        .cloned()
        .or_else(|| status.json.get("previewHash").cloned())
        .unwrap_or(Value::Null);
    Ok(ok(&json!({
        "decision": status.json.get("decision").cloned().unwrap_or(Value::Null),
        "previewHash": preview,
        "proposal": status.json.get("proposal").cloned().unwrap_or_else(|| status.json.clone()),
    })))
}

fn propose_inputs(parsed: &ProposeInput) -> Result<Value, String> {
    if let Some(path) = parsed.input_file.as_ref() {
        if parsed
            .quantity
            .as_ref()
            .is_some_and(|value| !value.is_empty())
            || !parsed.inputs.is_empty()
        {
            return Err(format!(
                "--input-file cannot combine with --input or --quantity:\n  {PROPOSE_INPUT_STAMP}"
            ));
        }
        return read_propose_input_file(path);
    }
    if parsed
        .inputs
        .iter()
        .any(|(input_id, _)| input_id == "quantity")
    {
        return Err(
            "quantity is not a textValue. Use --quantity:\n  zoen action propose --idempotency-key p --action-id inventory.replenish --resource-id inventory.item.1 --quantity 1"
                .to_owned(),
        );
    }
    if !parsed.inputs.is_empty() {
        return Ok(json!(
            parsed
                .inputs
                .iter()
                .map(|(input_id, value)| json!({
                    "inputId": input_id,
                    "value": { "textValue": value },
                }))
                .collect::<Vec<_>>()
        ));
    }
    let Some(quantity) = parsed.quantity.as_ref().filter(|value| !value.is_empty()) else {
        return Err(
            "zoen action propose needs --quantity, --input, or --input-file:\n  zoen action propose --idempotency-key p --action-id inventory.replenish --resource-id inventory.item.1 --quantity 1"
                .to_owned(),
        );
    };
    Ok(json!([{
        "inputId": "quantity",
        "value": { "quantityValue": { "amount": quantity, "unit": parsed.unit } },
    }]))
}

fn read_propose_input_file(path: &Path) -> Result<Value, String> {
    let Ok(raw) = read_file_or_stdin(path) else {
        return Err(format!(
            "could not read --input-file. Use --input for one-liners:\n  {PROPOSE_INPUT_STAMP}"
        ));
    };
    let Ok(value) = serde_json::from_slice::<Value>(&raw) else {
        return Err(format!(
            "invalid --input-file JSON. Use --input for one-liners:\n  {PROPOSE_INPUT_STAMP}"
        ));
    };
    match value.as_array() {
        Some(inputs) if !inputs.is_empty() => Ok(value),
        _ => Err(format!(
            "invalid --input-file JSON. Use --input for one-liners:\n  {PROPOSE_INPUT_STAMP}"
        )),
    }
}

async fn commit_action(
    env: &RuntimeEnv,
    proposal_id: &str,
    operation_id: &str,
    preview_hash: &str,
    dry_run: bool,
) -> Result<CommandResult, Box<dyn Error + Send + Sync>> {
    if proposal_id.is_empty() || operation_id.is_empty() || preview_hash.is_empty() {
        return Ok(fail(
            2,
            "zoen action commit requires --proposal-id --operation-id --preview-hash\n  zoen action commit --proposal-id p --operation-id p --preview-hash <hash>",
        ));
    }
    if env.isolate && !dry_run {
        return Ok(fail(1, "isolate cannot commit"));
    }
    let body = json!({
        "operationId": operation_id,
        "previewHash": preview_hash,
        "proposalId": proposal_id,
    });
    if dry_run {
        return Ok(ok(&json!({ "commit": body, "dryRun": true })));
    }
    let status = connect_json(env, "/zoen.action.v1.ActionService/Commit", body).await?;
    if status.status != 200 {
        return Ok(fail_connect(&status, None));
    }
    let claim_ids = status
        .json
        .pointer("/receipt/recordIds")
        .or_else(|| status.json.get("recordIds"))
        .cloned()
        .unwrap_or_else(|| json!([]));
    Ok(ok(&json!({
        "claimIds": claim_ids,
        "receipt": status.json.get("receipt").cloned().unwrap_or_else(|| status.json.clone()),
        "status": status.json.get("status").cloned().unwrap_or(Value::Null),
    })))
}

async fn connect_source(
    env: &RuntimeEnv,
    command: ConnectCommand,
) -> Result<CommandResult, Box<dyn Error + Send + Sync>> {
    match command {
        ConnectCommand::Rest {
            id,
            idempotency_key,
            base_url,
            auth,
            api_key,
            dry_run,
        } => {
            let Some(id) = dest_create_key(&idempotency_key, &id) else {
                return Ok(fail(
                    2,
                    "zoen source connect rest requires --idempotency-key or --id\n  zoen source connect rest --idempotency-key rest --base https://api.example.com",
                ));
            };
            connect_rest(env, &id, base_url, auth.as_deref(), api_key, dry_run)
        }
        ConnectCommand::Oauth2 {
            id,
            idempotency_key,
            token_url,
            client_id,
            client_secret,
            client_secret_stdin,
            base_url,
            dry_run,
        } => {
            let Some(id) = dest_create_key(&idempotency_key, &id) else {
                return Ok(fail(
                    2,
                    "zoen source connect oauth2 requires --idempotency-key or --id\n  zoen source connect oauth2 --idempotency-key oauth2 --token-url https://auth.example.com/token --client-id client --client-secret-stdin",
                ));
            };
            connect_oauth2(
                env,
                id,
                token_url,
                client_id,
                client_secret,
                client_secret_stdin,
                base_url,
                dry_run,
            )
            .await
        }
        ConnectCommand::Google {
            profile,
            id,
            idempotency_key,
            base_url,
            use_door,
            token,
            token_stdin,
            dry_run,
        } => {
            let fallback = if id.is_empty() { profile.clone() } else { id };
            let Some(id) = dest_create_key(&idempotency_key, &fallback) else {
                return Ok(fail(
                    2,
                    "zoen source connect google requires --idempotency-key, --id, or --profile\n  zoen source connect google --idempotency-key work --profile work --base https://www.googleapis.com",
                ));
            };
            connect_google(
                env,
                &profile,
                &id,
                base_url,
                use_door,
                token,
                token_stdin,
                dry_run,
            )
        }
        ConnectCommand::Mcp {
            url,
            id,
            idempotency_key,
            dry_run,
        } => {
            let Some(id) = dest_create_key(&idempotency_key, &id) else {
                return Ok(fail(
                    2,
                    "zoen source connect mcp requires --idempotency-key or --id\n  zoen source connect mcp --idempotency-key mcp --url https://mcp.example.com",
                ));
            };
            connect_mcp(env, url, &id, dry_run)
        }
    }
}

fn connect_rest(
    env: &RuntimeEnv,
    id: &str,
    base_url: String,
    auth: Option<&str>,
    api_key: Option<String>,
    dry_run: bool,
) -> Result<CommandResult, Box<dyn Error + Send + Sync>> {
    if dry_run {
        return Ok(ok(&json!({ "dryRun": true, "id": id, "kind": "rest" })));
    }
    if let Some(existing) = existing_source(env, id)? {
        return Ok(ok(&connect_receipt(&existing)));
    }
    let source_auth = if auth == Some("apikey") {
        let value = api_key
            .or_else(|| {
                env::var("ZOEN_SOURCE_API_KEY")
                    .ok()
                    .map(|value| value.trim().to_owned())
            })
            .filter(|value| !value.is_empty());
        let Some(value) = value else {
            return Ok(fail(
                2,
                "zoen source connect rest --auth apikey requires --api-key or ZOEN_SOURCE_API_KEY",
            ));
        };
        SourceAuth::ApiKey(SourceAuthApiKey {
            header: "Authorization".to_owned(),
            value: format!("Bearer {value}"),
        })
    } else {
        SourceAuth::None
    };
    let instance = SourceInstance {
        auth: source_auth,
        base_url: Some(base_url),
        cursor: None,
        id: id.to_owned(),
        introduced: None,
        kind: "rest".to_owned(),
        oauth_app: None,
        profile: None,
        url: None,
    };
    write_source(env, &instance)?;
    Ok(ok(&connect_receipt(&instance)))
}

async fn connect_oauth2(
    env: &RuntimeEnv,
    id: String,
    token_url: String,
    client_id: String,
    client_secret: Option<String>,
    client_secret_stdin: bool,
    base_url: Option<String>,
    dry_run: bool,
) -> Result<CommandResult, Box<dyn Error + Send + Sync>> {
    if dry_run {
        return Ok(ok(&json!({ "dryRun": true, "id": id, "kind": "oauth2" })));
    }
    if let Some(existing) = existing_source(env, &id)? {
        return Ok(ok(&connect_receipt(&existing)));
    }
    let client_secret = match resolve_source_secret(
        client_secret,
        client_secret_stdin,
        "ZOEN_SOURCE_CLIENT_SECRET",
        "--client-secret",
        "--client-secret-stdin",
        "zoen source connect oauth2",
    ) {
        Ok(secret) => secret,
        Err(message) => return Ok(fail(2, &message)),
    };
    let Some(client_secret) = client_secret else {
        return Ok(fail(
            2,
            "zoen source connect oauth2 requires --client-secret or ZOEN_SOURCE_CLIENT_SECRET",
        ));
    };
    let auth = fetch_oauth2_token(&token_url, &client_id, &client_secret).await?;
    let instance = SourceInstance {
        auth,
        base_url,
        cursor: None,
        id: id.clone(),
        introduced: None,
        kind: "oauth2".to_owned(),
        oauth_app: None,
        profile: None,
        url: None,
    };
    write_source(env, &instance)?;
    Ok(ok(&connect_receipt(&instance)))
}

fn connect_google(
    env: &RuntimeEnv,
    profile: &str,
    id: &str,
    base_url: Option<String>,
    use_door: bool,
    token: Option<String>,
    token_stdin: bool,
    dry_run: bool,
) -> Result<CommandResult, Box<dyn Error + Send + Sync>> {
    if use_door {
        return Ok(fail(2, "door tokens are not ingest authority"));
    }
    let token = match resolve_source_secret(
        token,
        token_stdin,
        "ZOEN_SOURCE_TOKEN",
        "--token",
        "--token-stdin",
        "zoen source connect google",
    ) {
        Ok(token) => token,
        Err(message) => return Ok(fail(2, &message)),
    };
    if dry_run {
        return Ok(ok(&json!({ "dryRun": true, "id": id, "kind": "google" })));
    }
    if let Some(existing) = existing_source(env, id)? {
        return Ok(ok(&connect_receipt(&existing)));
    }
    let auth = match token {
        Some(value) => SourceAuth::ApiKey(SourceAuthApiKey {
            header: "Authorization".to_owned(),
            value: format!("Bearer {value}"),
        }),
        None => SourceAuth::None,
    };
    let instance = SourceInstance {
        auth,
        base_url,
        cursor: None,
        id: id.to_owned(),
        introduced: None,
        kind: "google".to_owned(),
        oauth_app: Some("zoen".to_owned()),
        profile: Some(profile.to_owned()),
        url: None,
    };
    write_source(env, &instance)?;
    Ok(ok(&connect_receipt(&instance)))
}

fn connect_mcp(
    env: &RuntimeEnv,
    url: String,
    id: &str,
    dry_run: bool,
) -> Result<CommandResult, Box<dyn Error + Send + Sync>> {
    if dry_run {
        return Ok(ok(&json!({ "dryRun": true, "id": id, "kind": "mcp" })));
    }
    if let Some(existing) = existing_source(env, id)? {
        return Ok(ok(&connect_receipt(&existing)));
    }
    let instance = SourceInstance {
        auth: SourceAuth::None,
        base_url: None,
        cursor: None,
        id: id.to_owned(),
        introduced: None,
        kind: "mcp".to_owned(),
        oauth_app: None,
        profile: None,
        url: Some(url),
    };
    write_source(env, &instance)?;
    Ok(ok(&connect_receipt(&instance)))
}

fn introduce_source(
    env: &RuntimeEnv,
    id: &str,
    folder: Option<&str>,
    path: Option<&str>,
    query: Option<&str>,
    dry_run: bool,
) -> Result<CommandResult, Box<dyn Error + Send + Sync>> {
    let instance = match connected_source(env, id) {
        Ok(instance) => instance,
        Err(result) => return Ok(result),
    };
    if instance.kind == "google" {
        let Some(folder_name) = folder.filter(|value| !value.is_empty()) else {
            return Ok(fail(2, "introduce a folder, not the account"));
        };
        if folder_name == "My Drive" || folder_name == "account" {
            return Ok(fail(2, "introduce a folder, not the account"));
        }
    } else if folder.is_none() && path.is_none() && query.is_none() {
        return Ok(fail(
            2,
            "zoen source introduce requires --folder, --path, or --query",
        ));
    }
    if dry_run {
        return Ok(ok(&json!({
            "dryRun": true,
            "folder": folder,
            "id": instance.id,
            "path": path,
        })));
    }
    let mut next = instance;
    next.introduced = Some(Introduced {
        folder: folder.map(str::to_owned),
        folder_id: None,
        path: path.map(str::to_owned),
        query: query.map(str::to_owned),
    });
    write_source(env, &next)?;
    Ok(ok(&json!({
        "folder": folder,
        "introduced": id,
        "path": path,
        "query": query,
    })))
}

async fn sync_source(
    env: &RuntimeEnv,
    id: &str,
    dry_run: bool,
) -> Result<CommandResult, Box<dyn Error + Send + Sync>> {
    let instance = match connected_source(env, id) {
        Ok(instance) => instance,
        Err(result) => return Ok(result),
    };
    if instance.introduced.is_none() {
        return Ok(fail(2, &format!("source {id} has no introduced resource")));
    }
    if instance.kind == "google"
        && instance
            .introduced
            .as_ref()
            .and_then(|introduced| introduced.folder.as_ref())
            .is_none()
    {
        return Ok(fail(2, "introduce a folder, not the account"));
    }
    if env.isolate && !dry_run {
        return Ok(fail(1, "isolate cannot commit"));
    }
    let fetched = fetch_source(&instance).await?;
    let cas = put_cas(env, &fetched.bytes)?;
    if dry_run {
        return Ok(ok(&json!({
            "cursor": fetched.cursor,
            "digest": cas.digest,
            "dryRun": true,
            "id": id,
        })));
    }
    let signal = match emit_signal(env, &instance, &cas.digest, &fetched.durable_event_id).await {
        Ok(signal) => signal,
        Err(error) => return Ok(fail(1, error.message())),
    };
    let Some(quantity) = fetched.quantity.clone() else {
        return Ok(ok(&json!({
            "claimIds": [],
            "cursor": fetched.cursor,
            "digest": cas.digest,
            "id": id,
            "signalId": signal.expose(),
        })));
    };
    let mapped = map_quantity(
        env,
        id,
        &quantity,
        &fetched.resource_id,
        &fetched.operation_id,
    )
    .await?;
    if let Some(cursor) = fetched.cursor.clone() {
        let mut next = instance;
        next.cursor = Some(cursor);
        write_source(env, &next)?;
    }
    Ok(ok(&json!({
        "claimIds": mapped.claim_ids,
        "cursor": fetched.cursor,
        "digest": cas.digest,
        "id": id,
        "proposalId": mapped.proposal_id,
        "quantity": quantity,
        "signalId": signal.expose(),
    })))
}

async fn fetch_source(
    instance: &SourceInstance,
) -> Result<SourceFetch, Box<dyn Error + Send + Sync>> {
    match instance.kind.as_str() {
        "mcp" => fetch_mcp(instance).await,
        "google" => fetch_drive(instance).await,
        _ => fetch_rest(instance).await,
    }
}

async fn fetch_rest(
    instance: &SourceInstance,
) -> Result<SourceFetch, Box<dyn Error + Send + Sync>> {
    let base = instance
        .base_url
        .as_deref()
        .ok_or_else(|| format!("source {} has no --base", instance.id))?;
    let path = instance
        .introduced
        .as_ref()
        .and_then(|introduced| introduced.path.as_deref())
        .unwrap_or("/");
    let mut url = reqwest::Url::parse(base)?;
    url = url.join(path.trim_start_matches('/'))?;
    if let Some(cursor) = &instance.cursor {
        url.query_pairs_mut().append_pair("cursor", cursor);
    }
    let client = reqwest::Client::new();
    let response = client
        .get(url.clone())
        .headers(auth_headers(instance)?)
        .send()
        .await?;
    let status = response.status();
    let bytes = response.bytes().await?.to_vec();
    if !status.is_success() {
        return Err(format!(
            "source GET {url} {status} {}",
            String::from_utf8_lossy(&bytes)
        )
        .into());
    }
    let parsed = parse_json(&bytes);
    let hash = hash8(&bytes);
    Ok(SourceFetch {
        cursor: cursor_from_unknown(&parsed),
        durable_event_id: format!("evt.{}.{hash}", sanitize(&instance.id)),
        operation_id: format!("operation.{}-{hash}", sanitize(&instance.id)),
        quantity: quantity_from_unknown(&parsed),
        resource_id: resource_from_instance(instance),
        bytes,
    })
}

async fn fetch_drive(
    instance: &SourceInstance,
) -> Result<SourceFetch, Box<dyn Error + Send + Sync>> {
    let base = instance.base_url.as_deref().ok_or(
        "google profile sync needs --base stand-in or planted OAuth; door tokens are not ingest authority",
    )?;
    let folder = instance
        .introduced
        .as_ref()
        .and_then(|introduced| introduced.folder.as_deref())
        .ok_or("introduce a folder, not the account")?;
    let base_url = reqwest::Url::parse(base)?;
    let mut folder_url = base_url.join("drive/v3/files")?;
    folder_url.query_pairs_mut().append_pair(
        "q",
        &format!("name='{folder}' and mimeType='application/vnd.google-apps.folder'"),
    );
    let folder_list = fetch_json(folder_url, instance).await?;
    let folder_id =
        first_file_id(&folder_list).ok_or_else(|| format!("folder {folder} not found"))?;
    let mut children_url = base_url.join("drive/v3/files")?;
    children_url
        .query_pairs_mut()
        .append_pair("q", &format!("'{folder_id}' in parents"));
    let children = fetch_json(children_url, instance).await?;
    let file = first_file(&children).ok_or_else(|| format!("folder {folder} has no files"))?;
    let mut media_url = base_url.join(&format!("drive/v3/files/{}", file.id))?;
    media_url.query_pairs_mut().append_pair("alt", "media");
    let client = reqwest::Client::new();
    let response = client
        .get(media_url.clone())
        .headers(auth_headers(instance)?)
        .send()
        .await?;
    let status = response.status();
    let bytes = response.bytes().await?.to_vec();
    if !status.is_success() {
        return Err(format!("drive media {media_url} {status}").into());
    }
    let inner = unzip_first(&bytes).unwrap_or(bytes.clone());
    Ok(SourceFetch {
        cursor: file.modified_time,
        durable_event_id: format!("evt.drive.{}", sanitize(&file.id)),
        operation_id: format!("operation.drive-{}", sanitize(&file.id)),
        quantity: quantity_from_unknown(&parse_json(&inner)),
        resource_id: "entity.pedido.1".to_owned(),
        bytes,
    })
}

async fn fetch_mcp(instance: &SourceInstance) -> Result<SourceFetch, Box<dyn Error + Send + Sync>> {
    let url = instance
        .url
        .as_deref()
        .ok_or_else(|| format!("source {} has no --url", instance.id))?;
    mcp_call(
        url,
        instance,
        "initialize",
        json!({
            "capabilities": {},
            "clientInfo": { "name": "zoen", "version": "0" },
            "protocolVersion": "2024-11-05",
        }),
    )
    .await?;
    let listed = mcp_call(
        url,
        instance,
        "tools/call",
        json!({
            "arguments": { "cursor": instance.cursor },
            "name": instance.introduced.as_ref().and_then(|introduced| introduced.path.as_deref()).unwrap_or("list"),
        }),
    )
    .await?;
    let bytes = serde_json::to_vec(&listed)?;
    let hash = hash8(&bytes);
    Ok(SourceFetch {
        cursor: cursor_from_unknown(&listed),
        durable_event_id: format!("evt.mcp.{}.{hash}", sanitize(&instance.id)),
        operation_id: format!("operation.mcp-{}-{hash}", sanitize(&instance.id)),
        quantity: quantity_from_unknown(&listed),
        resource_id: "entity.nota.1".to_owned(),
        bytes,
    })
}

async fn mcp_call(
    url: &str,
    instance: &SourceInstance,
    method: &str,
    params: Value,
) -> Result<Value, Box<dyn Error + Send + Sync>> {
    let mut headers = auth_headers(instance)?;
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    let client = reqwest::Client::new();
    let response = client
        .post(url)
        .headers(headers)
        .json(&json!({ "id": 1, "jsonrpc": "2.0", "method": method, "params": params }))
        .send()
        .await?;
    let status = response.status();
    let text = response.text().await?;
    if !status.is_success() {
        return Err(format!("mcp {method} {status} {text}").into());
    }
    let doc: Value = serde_json::from_str(&text)?;
    if let Some(error) = doc.get("error") {
        return Err(format!("mcp {method} {error}").into());
    }
    Ok(doc.get("result").cloned().unwrap_or(Value::Null))
}

async fn fetch_oauth2_token(
    token_url: &str,
    client_id: &str,
    client_secret: &str,
) -> Result<SourceAuth, Box<dyn Error + Send + Sync>> {
    let client = reqwest::Client::new();
    let response = client
        .post(token_url)
        .header(CONTENT_TYPE, "application/x-www-form-urlencoded")
        .body(format!(
            "client_id={client_id}&client_secret={client_secret}&grant_type=client_credentials"
        ))
        .send()
        .await?;
    let status = response.status();
    let text = response.text().await?;
    if !status.is_success() {
        return Err(format!("oauth2 token {status} {text}").into());
    }
    let doc: Value = serde_json::from_str(&text)?;
    let access_token = doc
        .get("access_token")
        .and_then(Value::as_str)
        .ok_or("oauth2 token response missing access_token")?;
    Ok(SourceAuth::Oauth2(SourceAuthOauth2 {
        access_token: access_token.to_owned(),
        token_url: Some(token_url.to_owned()),
    }))
}

fn auth_headers(instance: &SourceInstance) -> Result<HeaderMap, Box<dyn Error + Send + Sync>> {
    let mut headers = HeaderMap::new();
    match &instance.auth {
        SourceAuth::ApiKey(auth) => {
            headers.insert(
                HeaderName::from_bytes(auth.header.as_bytes())?,
                HeaderValue::from_str(&auth.value)?,
            );
        }
        SourceAuth::Oauth2(auth) => {
            headers.insert(
                AUTHORIZATION,
                HeaderValue::from_str(&format!("Bearer {}", auth.access_token))?,
            );
        }
        SourceAuth::None => {}
    }
    Ok(headers)
}

async fn fetch_json(
    url: reqwest::Url,
    instance: &SourceInstance,
) -> Result<Value, Box<dyn Error + Send + Sync>> {
    let client = reqwest::Client::new();
    let response = client
        .get(url.clone())
        .headers(auth_headers(instance)?)
        .send()
        .await?;
    let status = response.status();
    let text = response.text().await?;
    if !status.is_success() {
        return Err(format!("GET {url} {status} {text}").into());
    }
    Ok(serde_json::from_str(&text)?)
}

struct DriveFile {
    id: String,
    modified_time: Option<String>,
}

fn first_file(doc: &Value) -> Option<DriveFile> {
    let first = doc.get("files")?.as_array()?.first()?;
    Some(DriveFile {
        id: first.get("id")?.as_str()?.to_owned(),
        modified_time: first
            .get("modifiedTime")
            .and_then(Value::as_str)
            .map(str::to_owned),
    })
}

fn first_file_id(doc: &Value) -> Option<String> {
    first_file(doc).map(|file| file.id)
}

fn parse_json(bytes: &[u8]) -> Value {
    serde_json::from_slice(bytes).unwrap_or(Value::Null)
}

fn quantity_from_unknown(value: &Value) -> Option<String> {
    let object = value.as_object()?;
    if let Some(Value::String(quantity)) = object.get("quantity") {
        return Some(quantity.clone());
    }
    match object.get("quantidade") {
        Some(Value::String(quantity)) => return Some(quantity.clone()),
        Some(Value::Number(quantity)) => return Some(quantity.to_string()),
        _ => {}
    }
    quantity_from_first(object.get("data"))
        .or_else(|| quantity_from_first(object.get("items")))
        .or_else(|| quantity_from_first(object.get("files")))
        .or_else(|| object.get("content").and_then(quantity_from_unknown))
        .or_else(|| object.get("result").and_then(quantity_from_unknown))
}

fn quantity_from_first(value: Option<&Value>) -> Option<String> {
    quantity_from_unknown(value?.as_array()?.first()?)
}

fn cursor_from_unknown(value: &Value) -> Option<String> {
    value
        .get("cursor")
        .and_then(Value::as_str)
        .map(str::to_owned)
}

fn resource_from_instance(instance: &SourceInstance) -> String {
    if instance.id == "bling"
        || instance
            .introduced
            .as_ref()
            .and_then(|introduced| introduced.path.as_deref())
            == Some("/pedidos")
    {
        "entity.pedido.1".to_owned()
    } else {
        "entity.nota.1".to_owned()
    }
}

fn sanitize(value: &str) -> String {
    let replaced = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '.' || ch == '_' || ch == '-' {
                ch
            } else {
                '-'
            }
        })
        .collect::<String>();
    let trimmed = replaced.trim_start_matches(|ch: char| !ch.is_ascii_alphabetic());
    if trimmed.is_empty() {
        format!("x{replaced}")
    } else {
        trimmed.to_owned()
    }
}

fn hash8(bytes: &[u8]) -> String {
    hex_digest(bytes).chars().take(8).collect()
}

fn hex_digest(bytes: &[u8]) -> String {
    zoen_core::encode_hex(Sha256::digest(bytes).as_slice())
}

fn put_cas(env: &RuntimeEnv, bytes: &[u8]) -> Result<Cas, Box<dyn Error + Send + Sync>> {
    let hex = hex_digest(bytes);
    let path = env.source_home.join("cas").join(&hex);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&path, bytes)?;
    Ok(Cas {
        digest: format!("sha256:{hex}"),
    })
}

struct Cas {
    digest: String,
}

#[derive(Clone, Copy, Debug)]
enum WorkloadSignalError {
    AuthenticationIdentityMismatch,
    AuthenticationMalformed,
    AuthenticationRejected,
    AuthenticationUnavailable,
    CredentialChanged,
    CredentialMalformed,
    CredentialMode,
    CredentialNotRegular,
    CredentialUnavailable,
    SignalMalformed,
    SignalRejected,
    SignalUnavailable,
}

impl WorkloadSignalError {
    fn message(self) -> &'static str {
        match self {
            Self::AuthenticationIdentityMismatch => {
                "workload authentication identity does not match the configured identity"
            }
            Self::AuthenticationMalformed => {
                "workload authentication returned a malformed response"
            }
            Self::AuthenticationRejected => "workload authentication was rejected",
            Self::AuthenticationUnavailable => "workload authentication is unavailable",
            Self::CredentialChanged => "workload API key changed while it was being opened",
            Self::CredentialMalformed => "workload API key file is malformed",
            Self::CredentialMode => "workload API key file must have mode 0600",
            Self::CredentialNotRegular => "workload API key must be a regular non-symlink file",
            Self::CredentialUnavailable => "workload API key file is unavailable",
            Self::SignalMalformed => "workload signal endpoint returned a malformed response",
            Self::SignalRejected => "workload signal was rejected",
            Self::SignalUnavailable => "workload signal endpoint is unavailable",
        }
    }
}

struct WorkloadApiKey(String);

impl WorkloadApiKey {
    fn parse(value: String) -> Result<Self, WorkloadSignalError> {
        if !is_canonical_workload_secret(&value, "zoen_wl_") {
            return Err(WorkloadSignalError::CredentialMalformed);
        }
        Ok(Self(value))
    }

    fn expose(&self) -> &str {
        &self.0
    }
}

struct WorkloadExchangeToken(String);

impl WorkloadExchangeToken {
    fn parse(value: String) -> Result<Self, WorkloadSignalError> {
        if !is_canonical_workload_secret(&value, "wlx.") {
            return Err(WorkloadSignalError::AuthenticationMalformed);
        }
        Ok(Self(value))
    }

    fn expose(&self) -> &str {
        &self.0
    }
}

struct SanitizedSignalId(String);

impl SanitizedSignalId {
    fn expose(&self) -> &str {
        &self.0
    }
}

fn is_canonical_workload_secret(value: &str, prefix: &str) -> bool {
    value.strip_prefix(prefix).is_some_and(|encoded| {
        encoded.len() == WORKLOAD_SECRET_ENCODED_LENGTH
            && base64::engine::general_purpose::URL_SAFE_NO_PAD
                .decode(encoded)
                .is_ok_and(|decoded| decoded.len() == WORKLOAD_SECRET_BYTES)
    })
}

fn workload_http_client(
    unavailable: WorkloadSignalError,
) -> Result<reqwest::Client, WorkloadSignalError> {
    reqwest::Client::builder()
        .connect_timeout(CONNECT_TIMEOUT)
        .redirect(reqwest::redirect::Policy::none())
        .timeout(CONNECT_TIMEOUT)
        .build()
        .map_err(|_| unavailable)
}

async fn bounded_workload_json<T: serde::de::DeserializeOwned>(
    mut response: reqwest::Response,
    malformed: WorkloadSignalError,
    unavailable: WorkloadSignalError,
) -> Result<T, WorkloadSignalError> {
    if response
        .content_length()
        .is_some_and(|length| length > MAX_WORKLOAD_RESPONSE_BYTES as u64)
    {
        return Err(malformed);
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| unavailable)? {
        if body
            .len()
            .checked_add(chunk.len())
            .is_none_or(|length| length > MAX_WORKLOAD_RESPONSE_BYTES)
        {
            return Err(malformed);
        }
        body.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&body).map_err(|_| malformed)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkloadAuthenticationDocument {
    actor_id: String,
    exchange_token: String,
    principal_id: String,
    tenant_id: String,
    workload_id: String,
}

#[derive(serde::Deserialize)]
struct WorkloadSignalDocument {
    signal: WorkloadSignalIdentity,
}

#[derive(serde::Deserialize)]
struct WorkloadSignalIdentity {
    id: String,
}

async fn emit_signal(
    env: &RuntimeEnv,
    instance: &SourceInstance,
    digest: &str,
    durable_event_id: &str,
) -> Result<SanitizedSignalId, WorkloadSignalError> {
    let exchange = workload_exchange(env).await?;
    let source_class = match instance.kind.as_str() {
        "google" => "google.drive",
        "mcp" => "mcp",
        _ => "rest",
    };
    let client = workload_http_client(WorkloadSignalError::SignalUnavailable)?;
    let response = client
        .put(format!("{}/workload/signals", env.zoend))
        .header(AUTHORIZATION, format!("Bearer {}", exchange.expose()))
        .header(CONTENT_TYPE, "application/json")
        .json(&json!({
            "durableEventId": durable_event_id,
            "payloadDigestRef": digest,
            "source": { "class": source_class, "externalId": instance.id },
            "sourceDigestRef": digest,
            "trustDisposition": "evidence_candidate",
        }))
        .send()
        .await
        .map_err(|_| WorkloadSignalError::SignalUnavailable)?;
    let status = response.status();
    if !status.is_success() {
        return Err(if status.is_server_error() {
            WorkloadSignalError::SignalUnavailable
        } else {
            WorkloadSignalError::SignalRejected
        });
    }
    let document = bounded_workload_json::<WorkloadSignalDocument>(
        response,
        WorkloadSignalError::SignalMalformed,
        WorkloadSignalError::SignalUnavailable,
    )
    .await?;
    sanitize_signal_id(&document.signal.id)
}

async fn workload_exchange(env: &RuntimeEnv) -> Result<WorkloadExchangeToken, WorkloadSignalError> {
    let key_path = env.source_home.join("workload.api-key");
    let api_key = load_workload_api_key(&key_path)?;
    let client = workload_http_client(WorkloadSignalError::AuthenticationUnavailable)?;
    let response = client
        .post(format!("{}/workload/authenticate", env.zoend))
        .header(CONTENT_TYPE, "application/json")
        .json(&json!({ "apiKey": api_key.expose() }))
        .send()
        .await
        .map_err(|_| WorkloadSignalError::AuthenticationUnavailable)?;
    let status = response.status();
    if !status.is_success() {
        return Err(if status.is_server_error() {
            WorkloadSignalError::AuthenticationUnavailable
        } else {
            WorkloadSignalError::AuthenticationRejected
        });
    }
    let document = bounded_workload_json::<WorkloadAuthenticationDocument>(
        response,
        WorkloadSignalError::AuthenticationMalformed,
        WorkloadSignalError::AuthenticationUnavailable,
    )
    .await?;
    if document.tenant_id != env.tenant
        || document.principal_id != env.principal_id
        || document.workload_id != env.workload_id
        || document.actor_id != env.actor_id
    {
        return Err(WorkloadSignalError::AuthenticationIdentityMismatch);
    }
    WorkloadExchangeToken::parse(document.exchange_token)
}

fn load_workload_api_key(path: &Path) -> Result<WorkloadApiKey, WorkloadSignalError> {
    let path_metadata =
        fs::symlink_metadata(path).map_err(|_| WorkloadSignalError::CredentialUnavailable)?;
    if !path_metadata.file_type().is_file() || path_metadata.file_type().is_symlink() {
        return Err(WorkloadSignalError::CredentialNotRegular);
    }
    let file = fs::File::open(path).map_err(|_| WorkloadSignalError::CredentialUnavailable)?;
    let opened_metadata = file
        .metadata()
        .map_err(|_| WorkloadSignalError::CredentialUnavailable)?;
    if !opened_metadata.file_type().is_file()
        || opened_metadata.dev() != path_metadata.dev()
        || opened_metadata.ino() != path_metadata.ino()
    {
        return Err(WorkloadSignalError::CredentialChanged);
    }
    let mode = opened_metadata.permissions().mode() & 0o777;
    if mode != 0o600 {
        return Err(WorkloadSignalError::CredentialMode);
    }
    if opened_metadata.len() > MAX_WORKLOAD_API_KEY_FILE_BYTES {
        return Err(WorkloadSignalError::CredentialMalformed);
    }
    let mut contents = String::new();
    let mut limited = file.take(MAX_WORKLOAD_API_KEY_FILE_BYTES + 1);
    let bytes_read = limited.read_to_string(&mut contents).map_err(|error| {
        if error.kind() == io::ErrorKind::InvalidData {
            WorkloadSignalError::CredentialMalformed
        } else {
            WorkloadSignalError::CredentialUnavailable
        }
    })?;
    if bytes_read as u64 > MAX_WORKLOAD_API_KEY_FILE_BYTES {
        return Err(WorkloadSignalError::CredentialMalformed);
    }
    let api_key = contents.strip_suffix('\n').unwrap_or(&contents);
    WorkloadApiKey::parse(api_key.to_owned())
}

fn sanitize_signal_id(value: &str) -> Result<SanitizedSignalId, WorkloadSignalError> {
    let Some(suffix) = value.strip_prefix("wlsig.") else {
        return Err(WorkloadSignalError::SignalMalformed);
    };
    if suffix.is_empty() || suffix.len() > 32 {
        return Err(WorkloadSignalError::SignalMalformed);
    }
    let mut sanitized = String::with_capacity(value.len());
    sanitized.push_str("wlsig.");
    for byte in suffix.bytes() {
        sanitized.push(match byte {
            b'0' => '0',
            b'1' => '1',
            b'2' => '2',
            b'3' => '3',
            b'4' => '4',
            b'5' => '5',
            b'6' => '6',
            b'7' => '7',
            b'8' => '8',
            b'9' => '9',
            b'a' => 'a',
            b'b' => 'b',
            b'c' => 'c',
            b'd' => 'd',
            b'e' => 'e',
            b'f' => 'f',
            _ => return Err(WorkloadSignalError::SignalMalformed),
        });
    }
    Ok(SanitizedSignalId(sanitized))
}

struct MappedQuantity {
    claim_ids: Value,
    proposal_id: String,
}

async fn map_quantity(
    env: &RuntimeEnv,
    source_id: &str,
    quantity: &str,
    resource_id: &str,
    operation_id: &str,
) -> Result<MappedQuantity, Box<dyn Error + Send + Sync>> {
    if env.definition_digest.is_empty() {
        return Err("ZOEN_DEFINITION_DIGEST is required to map".into());
    }
    if env.definition_id.is_empty() {
        return Err(
            "ZOEN_DEFINITION_ID is required\n  export ZOEN_DEFINITION_ID=inventory.definition"
                .into(),
        );
    }
    let proposal_id = format!(
        "proposal.{}-{}",
        sanitize(source_id),
        hash8(operation_id.as_bytes())
    );
    let proposed = propose_action(
        env,
        ProposeInput {
            action_id: "source.mapQuantity".to_owned(),
            dry_run: false,
            expires_at: Some(required_env("ZOEN_EXPIRES_AT")?),
            input_file: None,
            inputs: Vec::new(),
            operation_id: operation_id.to_owned(),
            proposal_id: proposal_id.clone(),
            quantity: Some(quantity.to_owned()),
            resource_id: resource_id.to_owned(),
            scenario: String::new(),
            unit: "each".to_owned(),
        },
    )
    .await?;
    if proposed.exit_code != 0 {
        return Err(proposed.stderr.trim().to_owned().into());
    }
    let doc: Value = serde_json::from_str(proposed.stdout.trim())?;
    let preview_hash = doc
        .get("previewHash")
        .and_then(Value::as_str)
        .or_else(|| doc.pointer("/proposal/previewHash").and_then(Value::as_str))
        .ok_or_else(|| format!("propose missing previewHash {}", proposed.stdout))?;
    let committed = commit_action(env, &proposal_id, operation_id, preview_hash, false).await?;
    if committed.exit_code != 0 {
        return Err(committed.stderr.trim().to_owned().into());
    }
    let receipt: Value = serde_json::from_str(committed.stdout.trim())?;
    Ok(MappedQuantity {
        claim_ids: receipt
            .get("claimIds")
            .or_else(|| receipt.get("recordIds"))
            .cloned()
            .unwrap_or_else(|| json!([])),
        proposal_id,
    })
}

fn source_path(env: &RuntimeEnv, id: &str) -> PathBuf {
    env.source_home.join("sources").join(format!("{id}.json"))
}

fn connected_source(env: &RuntimeEnv, id: &str) -> Result<SourceInstance, CommandResult> {
    match existing_source(env, id) {
        Ok(Some(instance)) => Ok(instance),
        Ok(None) => Err(fail(
            2,
            &format!(
                "source {id} is not connected\n  zoen source connect rest --id {id} --base <url>"
            ),
        )),
        Err(error) => Err(fail(1, &error.to_string())),
    }
}

fn existing_source(
    env: &RuntimeEnv,
    id: &str,
) -> Result<Option<SourceInstance>, Box<dyn Error + Send + Sync>> {
    match fs::read_to_string(source_path(env, id)) {
        Ok(raw) => Ok(Some(serde_json::from_str(&raw)?)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.into()),
    }
}

fn connect_receipt(instance: &SourceInstance) -> Value {
    json!({
        "connected": instance.id,
        "doorTokenStored": false,
        "kind": instance.kind,
        "oauthApp": instance.oauth_app,
        "profile": instance.profile,
    })
}

fn dest_create_key(idempotency_key: &str, fallback: &str) -> Option<String> {
    let key = idempotency_key.trim();
    if !key.is_empty() {
        return Some(key.to_owned());
    }
    let fallback = fallback.trim();
    if fallback.is_empty() {
        None
    } else {
        Some(fallback.to_owned())
    }
}

fn write_source(
    env: &RuntimeEnv,
    instance: &SourceInstance,
) -> Result<(), Box<dyn Error + Send + Sync>> {
    let path = source_path(env, &instance.id);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut file = fs::OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .mode(0o600)
        .open(&path)?;
    file.write_all(format!("{}\n", serde_json::to_string_pretty(instance)?).as_bytes())?;
    Ok(())
}

fn unzip_first(bytes: &[u8]) -> Option<Vec<u8>> {
    if bytes.len() < 30 {
        return None;
    }
    let signature = u32::from_le_bytes(bytes[0..4].try_into().ok()?);
    if signature != 0x0403_4b50 {
        return None;
    }
    let method = u16::from_le_bytes(bytes[8..10].try_into().ok()?);
    let compressed = usize::try_from(u32::from_le_bytes(bytes[18..22].try_into().ok()?)).ok()?;
    let name_len = usize::from(u16::from_le_bytes(bytes[26..28].try_into().ok()?));
    let extra_len = usize::from(u16::from_le_bytes(bytes[28..30].try_into().ok()?));
    let start = 30 + name_len + extra_len;
    let end = start.checked_add(compressed)?;
    if end > bytes.len() || method != 0 {
        return None;
    }
    Some(bytes[start..end].to_vec())
}

struct ConnectStatus {
    status: u16,
    text: String,
    json: Value,
}

fn read_file_or_stdin(file: &Path) -> Result<Vec<u8>, Box<dyn Error + Send + Sync>> {
    if file.as_os_str() == "-" {
        let mut raw = Vec::new();
        io::stdin().read_to_end(&mut raw)?;
        return Ok(raw);
    }
    Ok(fs::read(file)?)
}

fn http_client() -> Result<reqwest::Client, Box<dyn Error + Send + Sync>> {
    Ok(reqwest::Client::builder()
        .timeout(CONNECT_TIMEOUT)
        .build()?)
}

fn timed_out_talking_to(origin: &str, started: Instant) -> Box<dyn Error + Send + Sync> {
    let elapsed = started.elapsed().as_secs().max(CONNECT_TIMEOUT.as_secs());
    format!("ZOEN_ZOEND={origin} timed out after {elapsed}s").into()
}

async fn connect_json(
    env: &RuntimeEnv,
    path: &str,
    body: Value,
) -> Result<ConnectStatus, Box<dyn Error + Send + Sync>> {
    let started = Instant::now();
    let client = http_client()?;
    let response = match client
        .post(format!("{}{path}", env.zoend))
        .header(AUTHORIZATION, format!("Bearer {}", env.bearer))
        .header(CONTENT_TYPE, "application/json")
        .header("connect-protocol-version", "1")
        .header("x-zoen-tenant", &env.tenant)
        .json(&body)
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) if error.is_timeout() => return Err(timed_out_talking_to(&env.zoend, started)),
        Err(error) => return Err(error.into()),
    };
    let status = response.status().as_u16();
    let text = response.text().await?;
    let json = serde_json::from_str(&text).unwrap_or_else(|_| Value::String(text.clone()));
    Ok(ConnectStatus { status, text, json })
}

async fn discover_actions(
    env: &RuntimeEnv,
    resource_id: &str,
) -> Result<CommandResult, Box<dyn Error + Send + Sync>> {
    if resource_id.is_empty() {
        return Ok(fail(
            2,
            "zoen action discover requires --resource-id\n  zoen action discover --resource-id inventory.item.1",
        ));
    }
    if let Some(result) = missing_definition(env) {
        return Ok(result);
    }
    let definition = match definition_ref(env, true).await {
        Ok(value) => value,
        Err(error) => return Ok(fail(2, &error.to_string())),
    };
    let status = connect_json(
        env,
        "/zoen.action.v1.ActionService/Discover",
        json!({
            "definition": definition,
            "resourceId": resource_id,
        }),
    )
    .await?;
    if status.status != 200 {
        return Ok(fail_connect(&status, None));
    }
    Ok(CommandResult {
        exit_code: 0,
        stdout: format!("{}\n", status.text),
        stderr: String::new(),
    })
}

async fn explain_history(
    env: &RuntimeEnv,
    operation_id: Option<&str>,
    claim_id: Option<&str>,
    effect_request_id: Option<&str>,
    proposal_id: Option<&str>,
) -> Result<CommandResult, Box<dyn Error + Send + Sync>> {
    let target = match explain_target(operation_id, claim_id, effect_request_id, proposal_id) {
        Ok(target) => target,
        Err(message) => return Ok(fail(2, &message)),
    };
    let status = connect_json(
        env,
        "/zoen.history.v1.HistoryService/Explain",
        json!({ "target": target }),
    )
    .await?;
    if status.status != 200 {
        return Ok(fail_connect(&status, None));
    }
    Ok(CommandResult {
        exit_code: 0,
        stdout: format!("{}\n", status.text),
        stderr: String::new(),
    })
}

fn explain_target(
    operation_id: Option<&str>,
    claim_id: Option<&str>,
    effect_request_id: Option<&str>,
    proposal_id: Option<&str>,
) -> Result<Value, String> {
    let mut target = None;
    for (key, value) in [
        ("operationId", operation_id),
        ("claimId", claim_id),
        ("effectRequestId", effect_request_id),
        ("proposalId", proposal_id),
    ] {
        let Some(value) = value.filter(|value| !value.is_empty()) else {
            continue;
        };
        if target.is_some() {
            return Err(explain_example());
        }
        target = Some(json!({ key: value }));
    }
    target.ok_or_else(explain_example)
}

fn explain_example() -> String {
    "zoen history explain needs one target:\n  zoen history explain --claim-id claim.x\n  zoen history explain --operation-id operation.x\n  zoen history explain --proposal-id proposal.x\n  zoen history explain --effect-request-id effect.x"
        .to_owned()
}

async fn run_auth_login(
    email: Option<String>,
    password: Option<String>,
    password_stdin: bool,
    device: bool,
) -> Result<CommandResult, Box<dyn Error + Send + Sync>> {
    if device {
        if email.is_some() || password.is_some() || password_stdin {
            return Ok(fail(
                2,
                "zoen auth login --device does not take --email or --password\n  zoen auth login --device",
            ));
        }
        let zoend = required_env("ZOEN_ZOEND")?.trim_end_matches('/').to_owned();
        return login_device(&zoend).await;
    }
    let password = match resolve_login_password(password, password_stdin) {
        Ok(password) => password,
        Err(message) => return Ok(fail(2, &message)),
    };
    match (email, password) {
        (Some(email), Some(password)) if !email.trim().is_empty() && !password.is_empty() => {
            let zoend = required_env("ZOEN_ZOEND")?.trim_end_matches('/').to_owned();
            login_email(&zoend, email.trim(), &password).await
        }
        _ => Ok(fail(
            2,
            "zoen auth login needs --email and a password (--password, ZOEN_PASSWORD, or --password-stdin), or --device:\n  zoen auth login --device\n  zoen auth login --email you@example.com --password-stdin",
        )),
    }
}

fn resolve_login_password(
    password: Option<String>,
    password_stdin: bool,
) -> Result<Option<String>, String> {
    if password_stdin {
        if password.is_some() {
            return Err(
                "zoen auth login --password-stdin does not take --password\n  zoen auth login --email you@example.com --password-stdin"
                    .to_owned(),
            );
        }
        let mut raw = String::new();
        io::stdin()
            .read_to_string(&mut raw)
            .map_err(|error| error.to_string())?;
        let value = raw.trim_end_matches(['\r', '\n']).to_owned();
        if value.is_empty() {
            return Err("zoen auth login --password-stdin needs a password on stdin".to_owned());
        }
        return Ok(Some(value));
    }
    if let Some(value) = password.filter(|value| !value.is_empty()) {
        return Ok(Some(value));
    }
    if let Ok(value) = env::var("ZOEN_PASSWORD") {
        let trimmed = value.trim_end_matches(['\r', '\n']);
        if !trimmed.is_empty() {
            return Ok(Some(trimmed.to_owned()));
        }
    }
    Ok(None)
}

fn resolve_source_secret(
    flag: Option<String>,
    stdin_flag: bool,
    env_name: &str,
    argv_flag: &str,
    stdin_flag_name: &str,
    command: &str,
) -> Result<Option<String>, String> {
    if stdin_flag {
        if flag.is_some() {
            return Err(format!(
                "{command} {stdin_flag_name} does not take {argv_flag}\n  {command} {stdin_flag_name}"
            ));
        }
        let mut raw = String::new();
        io::stdin()
            .read_to_string(&mut raw)
            .map_err(|error| error.to_string())?;
        let value = raw.trim_end_matches(['\r', '\n']).to_owned();
        if value.is_empty() {
            return Err(format!(
                "{command} {stdin_flag_name} needs a secret on stdin"
            ));
        }
        return Ok(Some(value));
    }
    if let Some(value) = flag.filter(|value| !value.is_empty()) {
        return Ok(Some(value));
    }
    if let Ok(value) = env::var(env_name) {
        let trimmed = value.trim_end_matches(['\r', '\n']);
        if !trimmed.is_empty() {
            return Ok(Some(trimmed.to_owned()));
        }
    }
    Ok(None)
}

async fn login_email(
    zoend: &str,
    email: &str,
    password: &str,
) -> Result<CommandResult, Box<dyn Error + Send + Sync>> {
    let started = Instant::now();
    let response = match http_client()?
        .post(format!("{zoend}/api/auth/sign-in/email"))
        .header(CONTENT_TYPE, "application/json")
        .header("origin", zoend)
        .json(&json!({ "email": email, "password": password }))
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) if error.is_timeout() => return Err(timed_out_talking_to(zoend, started)),
        Err(error) => return Err(error.into()),
    };
    let status = response.status().as_u16();
    let headers = response.headers().clone();
    let text = response.text().await?;
    if !(200..300).contains(&status) {
        return Ok(fail_http_body(status, &text));
    }
    let session_token = session_token_from_headers(&headers)
        .or_else(|| session_token_from_body(&text))
        .filter(|token| !token.is_empty());
    let Some(session_token) = session_token else {
        return Ok(fail_coded(
            1,
            FailCode::Unauthenticated,
            "sign-in missing session_token",
        ));
    };
    store_credential(zoend, &session_token)?;
    Ok(ok(&json!({ "loggedIn": true })))
}

async fn login_device(zoend: &str) -> Result<CommandResult, Box<dyn Error + Send + Sync>> {
    let started = Instant::now();
    let response = match http_client()?
        .post(format!("{zoend}/api/auth/device/code"))
        .header(CONTENT_TYPE, "application/json")
        .header("origin", zoend)
        .json(&json!({ "client_id": AUTH_CLIENT_ID }))
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) if error.is_timeout() => return Err(timed_out_talking_to(zoend, started)),
        Err(error) => return Err(error.into()),
    };
    let status = response.status().as_u16();
    let text = response.text().await?;
    if !(200..300).contains(&status) {
        return Ok(fail_http_body(status, &text));
    }
    let doc: Value = serde_json::from_str(&text)?;
    let device_code = doc
        .get("device_code")
        .and_then(Value::as_str)
        .ok_or("device/code missing device_code")?
        .to_owned();
    let verification_uri_complete = doc
        .get("verification_uri_complete")
        .and_then(Value::as_str)
        .ok_or("device/code missing verification_uri_complete")?;
    let verification_uri_complete = rewrite_loopback_uri(verification_uri_complete, zoend);
    let open_line = format!("Open {verification_uri_complete}\n");
    io::stderr().write_all(open_line.as_bytes())?;
    let interval = doc
        .get("interval")
        .and_then(Value::as_u64)
        .ok_or("device/code missing interval")?;
    let expires_in = doc
        .get("expires_in")
        .and_then(Value::as_u64)
        .ok_or("device/code missing expires_in")?;
    poll_device_token(zoend, &device_code, interval, expires_in).await
}

async fn poll_device_token(
    zoend: &str,
    device_code: &str,
    interval: u64,
    expires_in: u64,
) -> Result<CommandResult, Box<dyn Error + Send + Sync>> {
    let Some(deadline) = Instant::now().checked_add(Duration::from_secs(expires_in)) else {
        return Err("device authorization expiry exceeds the supported clock range".into());
    };
    let mut sleep_for = Duration::from_secs(interval);
    let mut consecutive_failures = 0_u8;
    loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Ok(device_poll_deadline(zoend, consecutive_failures));
        }
        tokio::time::sleep(sleep_for.min(remaining)).await;
        if Instant::now() >= deadline {
            return Ok(device_poll_deadline(zoend, consecutive_failures));
        }
        let response = match http_client()?
            .post(format!("{zoend}/api/auth/device/token"))
            .header(CONTENT_TYPE, "application/json")
            .header("origin", zoend)
            .json(&json!({
                "client_id": AUTH_CLIENT_ID,
                "device_code": device_code,
                "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
            }))
            .send()
            .await
        {
            Ok(response) => response,
            Err(error) if error.is_timeout() || error.is_connect() => {
                if note_device_poll_failure(&mut consecutive_failures) {
                    return Ok(device_authorization_unavailable(zoend));
                }
                continue;
            }
            Err(error) => return Err(error.into()),
        };
        let status = response.status().as_u16();
        if (500..600).contains(&status) {
            if note_device_poll_failure(&mut consecutive_failures) {
                return Ok(device_authorization_unavailable(zoend));
            }
            continue;
        }
        let headers = response.headers().clone();
        let text = match response.text().await {
            Ok(text) => text,
            Err(error) if error.is_timeout() || error.is_connect() => {
                if note_device_poll_failure(&mut consecutive_failures) {
                    return Ok(device_authorization_unavailable(zoend));
                }
                continue;
            }
            Err(error) => return Err(error.into()),
        };
        consecutive_failures = 0;
        if status == 200 {
            let session_token = session_token_from_headers(&headers)
                .or_else(|| session_token_from_body(&text))
                .filter(|token| !token.is_empty());
            let Some(session_token) = session_token else {
                return Ok(fail_coded(
                    1,
                    FailCode::Unauthenticated,
                    "device/token missing session",
                ));
            };
            store_credential(zoend, &session_token)?;
            return Ok(ok(&json!({ "loggedIn": true })));
        }
        let error = serde_json::from_str::<Value>(&text)
            .ok()
            .and_then(|doc| doc.get("error").and_then(Value::as_str).map(str::to_owned))
            .unwrap_or_default();
        if error == "authorization_pending" {
            continue;
        }
        if error == "slow_down" {
            sleep_for = sleep_for
                .checked_add(Duration::from_secs(DEVICE_SLOW_DOWN_SECS))
                .ok_or("device polling interval exceeds the supported clock range")?;
            continue;
        }
        return Ok(fail_http_body(status, &text));
    }
}

fn note_device_poll_failure(consecutive_failures: &mut u8) -> bool {
    *consecutive_failures = consecutive_failures.saturating_add(1);
    *consecutive_failures >= DEVICE_POLL_FAILURE_LIMIT
}

fn device_poll_deadline(zoend: &str, consecutive_failures: u8) -> CommandResult {
    if consecutive_failures == 0 {
        device_authorization_timed_out()
    } else {
        device_authorization_unavailable(zoend)
    }
}

fn device_authorization_unavailable(zoend: &str) -> CommandResult {
    fail_coded(
        1,
        FailCode::NotConnected,
        &format!("device authorization service at {zoend} is unavailable"),
    )
}

fn device_authorization_timed_out() -> CommandResult {
    fail_coded(
        1,
        FailCode::TimedOut,
        "device authorization expired before approval",
    )
}

fn session_token_from_headers(headers: &HeaderMap) -> Option<String> {
    for value in headers.get_all(SET_COOKIE) {
        let Ok(raw) = value.to_str() else {
            continue;
        };
        let Some(pair) = raw.split(';').next() else {
            continue;
        };
        let Some((name, rest)) = pair.split_once('=') else {
            continue;
        };
        if name.trim().ends_with("session_token") {
            return Some(cookie_value(rest));
        }
    }
    None
}

fn session_token_from_body(text: &str) -> Option<String> {
    let doc: Value = serde_json::from_str(text).ok()?;
    doc.get("token")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .or_else(|| {
            doc.pointer("/session/token")
                .and_then(Value::as_str)
                .map(str::to_owned)
        })
        .or_else(|| {
            doc.get("access_token")
                .and_then(Value::as_str)
                .map(str::to_owned)
        })
}

fn credential_store_path() -> Result<PathBuf, Box<dyn Error + Send + Sync>> {
    let home = env::var_os("HOME")
        .filter(|value| !value.is_empty())
        .ok_or("HOME is required to store a Zoen login")?;
    Ok(PathBuf::from(home).join(".zoen").join("credentials.json"))
}

fn store_credential(zoend: &str, session_token: &str) -> Result<(), Box<dyn Error + Send + Sync>> {
    let path = credential_store_path()?;
    let directory = path
        .parent()
        .ok_or("Zoen credential store has no parent directory")?;
    fs::create_dir_all(directory)?;
    fs::set_permissions(directory, fs::Permissions::from_mode(0o700))?;
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos();
    let temporary = directory.join(format!(
        ".credentials.json.{}.{}.tmp",
        std::process::id(),
        stamp
    ));
    let credential = UserCredential {
        zoend: zoend.to_owned(),
        session_token: session_token.to_owned(),
    };
    let mut bytes = serde_json::to_vec(&credential)?;
    bytes.push(b'\n');
    let result = (|| -> Result<(), Box<dyn Error + Send + Sync>> {
        let mut file = fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .mode(0o600)
            .open(&temporary)?;
        fs::set_permissions(&temporary, fs::Permissions::from_mode(0o600))?;
        file.write_all(&bytes)?;
        file.sync_all()?;
        fs::rename(&temporary, &path)?;
        fs::File::open(directory)?.sync_all()?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

fn cookie_value(raw: &str) -> String {
    let mut out = String::new();
    let bytes = raw.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%'
            && i + 2 < bytes.len()
            && let (Some(hi), Some(lo)) = (from_hex(bytes[i + 1]), from_hex(bytes[i + 2]))
        {
            out.push(char::from(hi * 16 + lo));
            i += 3;
            continue;
        }
        out.push(char::from(bytes[i]));
        i += 1;
    }
    out
}

fn from_hex(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

fn rewrite_loopback_uri(raw: &str, zoend: &str) -> String {
    let parsed = match reqwest::Url::parse(raw) {
        Ok(parsed) => parsed,
        Err(_) => match reqwest::Url::parse(zoend).and_then(|base| base.join(raw)) {
            Ok(parsed) => parsed,
            Err(_) => return raw.to_owned(),
        },
    };
    let Some(host) = parsed.host_str() else {
        return parsed.to_string();
    };
    if !host_is_loopback(host) {
        return parsed.to_string();
    }
    let Ok(base) = reqwest::Url::parse(zoend) else {
        return parsed.to_string();
    };
    let mut next = parsed;
    let _ = next.set_scheme(base.scheme());
    let _ = next.set_host(base.host_str());
    let _ = next.set_port(base.port());
    next.to_string()
}

fn host_is_loopback(host: &str) -> bool {
    let host = host.trim_matches(|c| c == '[' || c == ']');
    if host.eq_ignore_ascii_case("localhost") {
        return true;
    }
    host.parse::<IpAddr>().is_ok_and(|ip| ip.is_loopback())
}
