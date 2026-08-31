use std::{
    env,
    error::Error,
    fs,
    io::{self, Write},
    os::unix::fs::OpenOptionsExt,
    path::{Path, PathBuf},
};

use base64::Engine;
use clap::{Parser, Subcommand};
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE, HeaderMap, HeaderName, HeaderValue};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

/// Ontology CLI parser. Empty args and `serve` start the daemon.
#[derive(Parser)]
#[command(name = "zoen", about = "Zoen ontology CLI and daemon", version)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Option<Command>,
}

/// Ontology commands the `zoen` binary accepts.
#[derive(Subcommand)]
pub enum Command {
    Serve,
    World {
        #[command(subcommand)]
        command: WorldCommand,
    },
    Definition {
        #[command(subcommand)]
        command: DefinitionCommand,
    },
    Source {
        #[command(subcommand)]
        command: SourceCommand,
    },
    Action {
        #[command(subcommand)]
        command: ActionCommand,
    },
    History {
        #[command(subcommand)]
        command: HistoryCommand,
    },
    Auth {
        #[command(subcommand)]
        command: AuthCommand,
    },
}

#[derive(Subcommand)]
pub enum WorldCommand {
    Query {
        #[arg(long = "type")]
        type_id: String,
        #[arg(long, default_value_t = 10)]
        limit: u32,
        #[arg(long = "scenario", default_value = "")]
        scenario: String,
    },
    Evidence {
        #[arg(long = "type")]
        type_id: String,
        #[arg(long, default_value_t = 10)]
        limit: u32,
        #[arg(long = "scenario", default_value = "")]
        scenario: String,
    },
    Scenario {
        #[command(subcommand)]
        command: ScenarioCommand,
    },
}

#[derive(Subcommand)]
pub enum ScenarioCommand {
    Create {
        #[arg(long)]
        name: String,
    },
    Apply {
        #[arg(long)]
        name: String,
    },
    Discard {
        #[arg(long)]
        name: String,
    },
}

#[derive(Subcommand)]
pub enum DefinitionCommand {
    Publish {
        #[arg(long)]
        file: PathBuf,
    },
    Activate {
        #[arg(long = "definition-id")]
        definition_id: String,
        #[arg(long)]
        digest: String,
    },
}

#[derive(Subcommand)]
pub enum SourceCommand {
    Connect {
        #[command(subcommand)]
        command: ConnectCommand,
    },
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
    Sync {
        id: String,
        #[arg(long)]
        dry_run: bool,
    },
}

#[derive(Subcommand)]
pub enum ConnectCommand {
    Rest {
        #[arg(long, default_value = "rest")]
        id: String,
        #[arg(long = "base")]
        base_url: String,
        #[arg(long)]
        auth: Option<String>,
        #[arg(long = "api-key")]
        api_key: Option<String>,
        #[arg(long)]
        dry_run: bool,
    },
    Oauth2 {
        #[arg(long, default_value = "oauth2")]
        id: String,
        #[arg(long = "token-url")]
        token_url: String,
        #[arg(long = "client-id")]
        client_id: String,
        #[arg(long = "client-secret")]
        client_secret: Option<String>,
        #[arg(long = "base")]
        base_url: Option<String>,
        #[arg(long)]
        dry_run: bool,
    },
    Google {
        #[arg(long)]
        profile: String,
        #[arg(long, default_value = "")]
        id: String,
        #[arg(long = "base")]
        base_url: Option<String>,
        #[arg(long = "use-door")]
        use_door: bool,
        #[arg(long)]
        token: Option<String>,
        #[arg(long)]
        dry_run: bool,
    },
    Mcp {
        #[arg(long)]
        url: String,
        #[arg(long, default_value = "mcp")]
        id: String,
        #[arg(long)]
        dry_run: bool,
    },
}

#[derive(Subcommand)]
pub enum ActionCommand {
    Propose {
        #[arg(long = "proposal-id")]
        proposal_id: String,
        #[arg(long = "action-id", default_value = "source.mapQuantity")]
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
        #[arg(long)]
        dry_run: bool,
    },
    Commit {
        #[arg(long = "proposal-id")]
        proposal_id: String,
        #[arg(long = "operation-id")]
        operation_id: String,
        #[arg(long = "preview-hash")]
        preview_hash: String,
    },
    Discover,
}

#[derive(Subcommand)]
pub enum HistoryCommand {
    Explain,
}

#[derive(Subcommand)]
pub enum AuthCommand {
    Login,
}

struct RuntimeEnv {
    zoend: String,
    bearer: String,
    tenant: String,
    source_home: PathBuf,
    definition_id: String,
    definition_digest: String,
    valid_at: String,
    principal_id: String,
    actor_id: String,
    workload_id: String,
    isolate: bool,
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
        Err(error) => CommandResult {
            exit_code: 1,
            stdout: String::new(),
            stderr: format!("{error}\n"),
        },
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
    if matches!(
        command,
        Command::History {
            command: HistoryCommand::Explain
        }
    ) {
        return Ok(fail(2, "zoen history explain is not this slice"));
    }
    if matches!(
        command,
        Command::Auth {
            command: AuthCommand::Login
        }
    ) {
        return Ok(fail(
            2,
            "zoen auth login uses the Better Auth door, not this binary",
        ));
    }
    if matches!(
        command,
        Command::Action {
            command: ActionCommand::Discover
        }
    ) {
        return Ok(fail(2, "zoen action discover is not this slice"));
    }
    let env = parse_env()?;
    match command {
        Command::Serve => unreachable!("serve is handled in main"),
        Command::World { command } => run_world(&env, command).await,
        Command::Definition { command } => run_definition(&env, command).await,
        Command::Source { command } => run_source(&env, command).await,
        Command::Action { command } => run_action(&env, command).await,
        Command::History { .. } | Command::Auth { .. } => unreachable!("handled above"),
    }
}

async fn run_world(
    env: &RuntimeEnv,
    command: WorldCommand,
) -> Result<CommandResult, Box<dyn Error + Send + Sync>> {
    match command {
        WorldCommand::Query {
            type_id,
            limit,
            scenario,
        }
        | WorldCommand::Evidence {
            type_id,
            limit,
            scenario,
        } => world_query(env, &type_id, limit, &scenario).await,
        WorldCommand::Scenario { command } => match command {
            ScenarioCommand::Create { name } => {
                scenario_rpc(env, "/zoen.world.v1.WorldService/CreateScenario", &name).await
            }
            ScenarioCommand::Apply { name } => {
                if env.isolate {
                    return Ok(fail(1, "isolate cannot commit"));
                }
                scenario_rpc(env, "/zoen.world.v1.WorldService/ApplyScenario", &name).await
            }
            ScenarioCommand::Discard { name } => {
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
        } => activate_definition(env, &definition_id, &digest).await,
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
    if env.isolate {
        return Ok(fail(1, "isolate cannot commit"));
    }
    match command {
        ActionCommand::Propose {
            proposal_id,
            action_id,
            resource_id,
            operation_id,
            quantity,
            unit,
            scenario,
            inputs,
            dry_run,
        } => {
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
                    dry_run,
                },
            )
            .await
        }
        ActionCommand::Commit {
            proposal_id,
            operation_id,
            preview_hash,
        } => commit_action(env, &proposal_id, &operation_id, &preview_hash).await,
        ActionCommand::Discover => unreachable!("handled in dispatch"),
    }
}

fn parse_env() -> Result<RuntimeEnv, Box<dyn Error + Send + Sync>> {
    Ok(RuntimeEnv {
        actor_id: env_or("ZOEN_ACTOR", "actor.personal"),
        bearer: required_env("ZOEN_BEARER")?,
        definition_digest: env_or("ZOEN_DEFINITION_DIGEST", ""),
        definition_id: env_or("ZOEN_DEFINITION_ID", "world.source"),
        isolate: env::var("ZOEN_ISOLATE").ok().as_deref() == Some("1"),
        principal_id: env_or("ZOEN_PRINCIPAL", "principal.personal"),
        source_home: PathBuf::from(env_or("ZOEN_SOURCE_HOME", ".zoen")),
        tenant: required_env("ZOEN_TENANT")?,
        valid_at: env_or("ZOEN_VALID_AT", "2026-01-15T00:00:00Z"),
        workload_id: env_or("ZOEN_WORKLOAD", "workload.personal"),
        zoend: required_env_any(&["ZOEN_ZOEND", "ZOEN_IDENTITY_BASE_URL"])?
            .trim_end_matches('/')
            .to_owned(),
    })
}

fn env_or(name: &str, fallback: &str) -> String {
    env::var(name)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| fallback.to_owned())
}

fn required_env(name: &str) -> Result<String, Box<dyn Error + Send + Sync>> {
    required_env_any(&[name])
}

fn required_env_any(names: &[&str]) -> Result<String, Box<dyn Error + Send + Sync>> {
    for name in names {
        if let Ok(value) = env::var(name) {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return Ok(trimmed.to_owned());
            }
        }
    }
    Err(format!("{} is required", names[0]).into())
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

fn ok(value: &Value) -> CommandResult {
    CommandResult {
        exit_code: 0,
        stdout: format!("{value}\n"),
        stderr: String::new(),
    }
}

fn fail(exit_code: u8, message: &str) -> CommandResult {
    CommandResult {
        exit_code,
        stdout: String::new(),
        stderr: format!("{message}\n"),
    }
}

async fn publish_definition(
    env: &RuntimeEnv,
    file: &Path,
) -> Result<CommandResult, Box<dyn Error + Send + Sync>> {
    let raw = fs::read(file)?;
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
        return Ok(fail(
            1,
            &format!("Publish {} {}", status.status, status.text),
        ));
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
) -> Result<CommandResult, Box<dyn Error + Send + Sync>> {
    let status = connect_json(
        env,
        "/zoen.definition.v1.DefinitionService/ActivateRevision",
        json!({
            "definitionId": definition_id,
            "digest": digest,
            "expectNoActiveRevision": true,
            "tenantId": env.tenant,
        }),
    )
    .await?;
    if status.status != 200 {
        return Ok(fail(
            1,
            &format!("ActivateRevision {} {}", status.status, status.text),
        ));
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
        return Ok(fail(
            1,
            &format!(
                "{} {} {}",
                path.rsplit('/').next().unwrap_or(path),
                status.status,
                status.text
            ),
        ));
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
    scenario_id: &str,
) -> Result<CommandResult, Box<dyn Error + Send + Sync>> {
    if env.definition_digest.is_empty() {
        return Ok(fail(2, "ZOEN_DEFINITION_DIGEST is required"));
    }
    let status = connect_json(
        env,
        "/zoen.world.v1.WorldService/SemanticQuery",
        json!({
            "byType": { "limit": limit, "typeId": type_id },
            "consistency": { "strong": {} },
            "definition": {
                "definitionId": env.definition_id,
                "digest": env.definition_digest,
                "revision": "1",
            },
            "scenarioId": scenario_id,
            "tenantId": env.tenant,
            "validAt": env.valid_at,
        }),
    )
    .await?;
    if status.status != 200 {
        return Ok(fail(
            1,
            &format!("SemanticQuery {} {}", status.status, status.text),
        ));
    }
    Ok(CommandResult {
        exit_code: 0,
        stdout: format!("{}\n", status.text),
        stderr: String::new(),
    })
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
    dry_run: bool,
}

async fn propose_action(
    env: &RuntimeEnv,
    parsed: ProposeInput,
) -> Result<CommandResult, Box<dyn Error + Send + Sync>> {
    let operation_id = if parsed.operation_id.is_empty() {
        parsed.proposal_id.clone()
    } else {
        parsed.operation_id.clone()
    };
    if parsed.proposal_id.is_empty() || parsed.resource_id.is_empty() {
        return Ok(fail(
            2,
            "zoen action propose requires --proposal-id and --resource-id",
        ));
    }
    if env.definition_digest.is_empty() {
        return Ok(fail(2, "ZOEN_DEFINITION_DIGEST is required"));
    }
    let inputs = propose_inputs(&parsed);
    let body = json!({
        "actionId": parsed.action_id,
        "definition": {
            "definitionId": env.definition_id,
            "digest": env.definition_digest,
            "revision": "1",
        },
        "expiresAt": "2030-01-01T00:00:00Z",
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
        return Ok(fail(
            1,
            &format!("Propose {} {}", status.status, status.text),
        ));
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

fn propose_inputs(parsed: &ProposeInput) -> Value {
    if !parsed.inputs.is_empty() {
        return json!(
            parsed
                .inputs
                .iter()
                .map(|(input_id, value)| json!({
                    "inputId": input_id,
                    "value": { "textValue": value },
                }))
                .collect::<Vec<_>>()
        );
    }
    let Some(quantity) = parsed.quantity.as_ref() else {
        return json!([]);
    };
    json!([{
        "inputId": "quantity",
        "value": { "quantityValue": { "amount": quantity, "unit": parsed.unit } },
    }])
}

async fn commit_action(
    env: &RuntimeEnv,
    proposal_id: &str,
    operation_id: &str,
    preview_hash: &str,
) -> Result<CommandResult, Box<dyn Error + Send + Sync>> {
    if proposal_id.is_empty() || operation_id.is_empty() || preview_hash.is_empty() {
        return Ok(fail(
            2,
            "zoen action commit requires --proposal-id --operation-id --preview-hash",
        ));
    }
    let status = connect_json(
        env,
        "/zoen.action.v1.ActionService/Commit",
        json!({
            "operationId": operation_id,
            "previewHash": preview_hash,
            "proposalId": proposal_id,
        }),
    )
    .await?;
    if status.status != 200 {
        return Ok(fail(
            1,
            &format!("Commit {} {}", status.status, status.text),
        ));
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
            base_url,
            auth,
            api_key,
            dry_run,
        } => connect_rest(env, &id, base_url, auth.as_deref(), api_key, dry_run),
        ConnectCommand::Oauth2 {
            id,
            token_url,
            client_id,
            client_secret,
            base_url,
            dry_run,
        } => {
            connect_oauth2(
                env,
                id,
                token_url,
                client_id,
                client_secret,
                base_url,
                dry_run,
            )
            .await
        }
        ConnectCommand::Google {
            profile,
            id,
            base_url,
            use_door,
            token,
            dry_run,
        } => connect_google(
            env,
            &profile,
            id,
            base_url,
            use_door,
            token.as_deref(),
            dry_run,
        ),
        ConnectCommand::Mcp { url, id, dry_run } => connect_mcp(env, url, &id, dry_run),
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
    write_source(
        env,
        &SourceInstance {
            auth: source_auth,
            base_url: Some(base_url),
            cursor: None,
            id: id.to_owned(),
            introduced: None,
            kind: "rest".to_owned(),
            oauth_app: None,
            profile: None,
            url: None,
        },
    )?;
    Ok(ok(&json!({
        "connected": id,
        "doorTokenStored": false,
        "kind": "rest",
        "oauthApp": null,
        "profile": null,
    })))
}

async fn connect_oauth2(
    env: &RuntimeEnv,
    id: String,
    token_url: String,
    client_id: String,
    client_secret: Option<String>,
    base_url: Option<String>,
    dry_run: bool,
) -> Result<CommandResult, Box<dyn Error + Send + Sync>> {
    if dry_run {
        return Ok(ok(&json!({ "dryRun": true, "id": id, "kind": "oauth2" })));
    }
    let auth = fetch_oauth2_token(
        &token_url,
        &client_id,
        client_secret.as_deref().unwrap_or(""),
    )
    .await?;
    write_source(
        env,
        &SourceInstance {
            auth,
            base_url,
            cursor: None,
            id: id.clone(),
            introduced: None,
            kind: "oauth2".to_owned(),
            oauth_app: None,
            profile: None,
            url: None,
        },
    )?;
    Ok(ok(&json!({
        "connected": id,
        "doorTokenStored": false,
        "kind": "oauth2",
        "oauthApp": null,
        "profile": null,
    })))
}

fn connect_google(
    env: &RuntimeEnv,
    profile: &str,
    id: String,
    base_url: Option<String>,
    use_door: bool,
    token: Option<&str>,
    dry_run: bool,
) -> Result<CommandResult, Box<dyn Error + Send + Sync>> {
    if use_door || token.is_some() {
        return Ok(fail(2, "door tokens are not ingest authority"));
    }
    let id = if id.is_empty() {
        profile.to_owned()
    } else {
        id
    };
    if dry_run {
        return Ok(ok(&json!({ "dryRun": true, "id": id, "kind": "google" })));
    }
    write_source(
        env,
        &SourceInstance {
            auth: SourceAuth::None,
            base_url,
            cursor: None,
            id: id.clone(),
            introduced: None,
            kind: "google".to_owned(),
            oauth_app: Some("zoen".to_owned()),
            profile: Some(profile.to_owned()),
            url: None,
        },
    )?;
    Ok(ok(&json!({
        "connected": id,
        "doorTokenStored": false,
        "kind": "google",
        "oauthApp": "zoen",
        "profile": profile,
    })))
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
    write_source(
        env,
        &SourceInstance {
            auth: SourceAuth::None,
            base_url: None,
            cursor: None,
            id: id.to_owned(),
            introduced: None,
            kind: "mcp".to_owned(),
            oauth_app: None,
            profile: None,
            url: Some(url),
        },
    )?;
    Ok(ok(&json!({
        "connected": id,
        "doorTokenStored": false,
        "kind": "mcp",
        "oauthApp": null,
        "profile": null,
    })))
}

fn introduce_source(
    env: &RuntimeEnv,
    id: &str,
    folder: Option<&str>,
    path: Option<&str>,
    query: Option<&str>,
    dry_run: bool,
) -> Result<CommandResult, Box<dyn Error + Send + Sync>> {
    let instance = read_source(env, id)?;
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
    let instance = read_source(env, id)?;
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
    let signal = emit_signal(env, &instance, &cas.digest, &fetched.durable_event_id).await?;
    if env.isolate {
        return Ok(CommandResult {
            exit_code: 1,
            stderr: "isolate cannot commit\n".to_owned(),
            stdout: format!(
                "{}\n",
                json!({
                    "claimIds": [],
                    "digest": cas.digest,
                    "id": id,
                    "quantity": fetched.quantity,
                    "signalId": signal,
                })
            ),
        });
    }
    let Some(quantity) = fetched.quantity.clone() else {
        return Ok(ok(&json!({
            "claimIds": [],
            "cursor": fetched.cursor,
            "digest": cas.digest,
            "id": id,
            "signalId": signal,
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
        "signalId": signal,
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

async fn emit_signal(
    env: &RuntimeEnv,
    instance: &SourceInstance,
    digest: &str,
    durable_event_id: &str,
) -> Result<String, Box<dyn Error + Send + Sync>> {
    let exchange = workload_exchange(env).await?;
    let source_class = match instance.kind.as_str() {
        "google" => "google.drive",
        "mcp" => "mcp",
        _ => "rest",
    };
    let client = reqwest::Client::new();
    let response = client
        .put(format!("{}/workload/signals", env.zoend))
        .header(AUTHORIZATION, format!("Bearer {exchange}"))
        .header(CONTENT_TYPE, "application/json")
        .json(&json!({
            "durableEventId": durable_event_id,
            "payloadDigestRef": digest,
            "source": { "class": source_class, "externalId": instance.id },
            "sourceDigestRef": digest,
            "trustDisposition": "evidence_candidate",
        }))
        .send()
        .await?;
    let status = response.status();
    let text = response.text().await?;
    if !status.is_success() {
        return Err(format!("PUT /workload/signals {status} {text}").into());
    }
    let doc: Value = serde_json::from_str(&text)?;
    doc.pointer("/signal/id")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| "signal id missing".into())
}

async fn workload_exchange(env: &RuntimeEnv) -> Result<String, Box<dyn Error + Send + Sync>> {
    let key_path = env.source_home.join("workload.api-key");
    let mut api_key = fs::read_to_string(&key_path)
        .unwrap_or_default()
        .trim()
        .to_owned();
    if api_key.is_empty() {
        api_key = issue_workload(env, &key_path).await?;
    }
    let client = reqwest::Client::new();
    let response = client
        .post(format!("{}/workload/authenticate", env.zoend))
        .header(CONTENT_TYPE, "application/json")
        .json(&json!({ "apiKey": api_key }))
        .send()
        .await?;
    let status = response.status();
    let text = response.text().await?;
    if !status.is_success() {
        return Err(format!("POST /workload/authenticate {status} {text}").into());
    }
    let doc: Value = serde_json::from_str(&text)?;
    doc.get("exchangeToken")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| "workload exchangeToken missing".into())
}

async fn issue_workload(
    env: &RuntimeEnv,
    key_path: &Path,
) -> Result<String, Box<dyn Error + Send + Sync>> {
    let client = reqwest::Client::new();
    let response = client
        .post(format!("{}/workload/admin/credentials", env.zoend))
        .header(AUTHORIZATION, format!("Bearer {}", env.bearer))
        .header(CONTENT_TYPE, "application/json")
        .json(&json!({
            "actorId": env.actor_id,
            "allowedIngress": [
                { "kind": "api_event", "sourceClass": "google.drive" },
                { "kind": "api_event", "sourceClass": "rest" },
                { "kind": "api_event", "sourceClass": "mcp" },
            ],
            "delegation": [{
                "actions": ["source.mapQuantity"],
                "id": "delegation.source",
                "resources": ["entity.pedido.1", "entity.nota.1"],
            }],
            "expiresAtMicros": 4_102_444_800_000_000_i64,
            "principalId": env.principal_id,
            "rateBudget": { "maxAcceptsPerMinute": 120, "maxCommitsPerHour": 120 },
            "tenantId": env.tenant,
            "workloadId": env.workload_id,
        }))
        .send()
        .await?;
    let status = response.status();
    let text = response.text().await?;
    if !status.is_success() {
        return Err(format!("POST /workload/admin/credentials {status} {text}").into());
    }
    let doc: Value = serde_json::from_str(&text)?;
    let api_key = doc
        .get("apiKeyOnce")
        .and_then(Value::as_str)
        .ok_or("workload apiKeyOnce missing")?;
    if let Some(parent) = key_path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .mode(0o600)
        .open(key_path)?
        .write_all(format!("{api_key}\n").as_bytes())?;
    Ok(api_key.to_owned())
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
    let committed = commit_action(env, &proposal_id, operation_id, preview_hash).await?;
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

fn read_source(env: &RuntimeEnv, id: &str) -> Result<SourceInstance, Box<dyn Error + Send + Sync>> {
    let raw = fs::read_to_string(source_path(env, id))?;
    Ok(serde_json::from_str(&raw)?)
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

async fn connect_json(
    env: &RuntimeEnv,
    path: &str,
    body: Value,
) -> Result<ConnectStatus, Box<dyn Error + Send + Sync>> {
    let client = reqwest::Client::new();
    let response = client
        .post(format!("{}{path}", env.zoend))
        .header(AUTHORIZATION, format!("Bearer {}", env.bearer))
        .header(CONTENT_TYPE, "application/json")
        .header("connect-protocol-version", "1")
        .header("x-zoen-tenant", &env.tenant)
        .json(&body)
        .send()
        .await?;
    let status = response.status().as_u16();
    let text = response.text().await?;
    let json = serde_json::from_str(&text).unwrap_or_else(|_| Value::String(text.clone()));
    Ok(ConnectStatus { status, text, json })
}
