//! Stateless MCP server (protocol era 2026-07-28): one `POST /mcp` route that
//! exposes the governed ontology verbs to external agents. The shim resolves
//! the caller through the same [`SessionExchange`] as the Connect handlers,
//! enforces the per-credential `capability_kinds` gate for workload
//! principals, then invokes the same Connect sub-router in process. Auth glue
//! and policy logic stay downstream; this file adds no second path.

use std::sync::Arc;

use axum::{
    Json, Router,
    body::{Body, to_bytes},
    extract::State,
    http::{HeaderMap, HeaderName, HeaderValue, Request, StatusCode, header},
    response::{IntoResponse, Response},
    routing::post,
};
use serde::Deserialize;
use serde_json::{Map, Value, json};
use tower::ServiceExt;
use zoen_adapters::PostgresWorkloadCredentialStore;
use zoen_core::{IngressAllowance, ProjectedCapabilityKind, TenantId};

use crate::session::SessionExchange;

/// The only MCP protocol era this shim serves. Anything else is rejected
/// loudly with `UnsupportedProtocolVersionError`.
pub const PROTOCOL_VERSION: &str = "2026-07-28";

const SERVER_NAME: &str = "zoend";
const CONNECT_BODY_LIMIT: usize = 4 * 1024 * 1024;
const JSONRPC_METHOD_NOT_FOUND: i64 = -32601;
const JSONRPC_INVALID_PARAMS: i64 = -32602;
const JSONRPC_UNSUPPORTED_VERSION: i64 = -32000;
const JSONRPC_INGRESS_DENIED: i64 = -32001;

/// Shared state for the MCP route. `connect` is the SAME Connect sub-router
/// the daemon serves; the shim calls it in process.
pub struct McpState {
    pub sessions: SessionExchange,
    pub credentials: PostgresWorkloadCredentialStore,
    pub connect: Router,
    pub tools_ttl_ms: u64,
}

/// Mount the MCP route on the existing zoend listener.
pub fn router(state: McpState) -> Router {
    Router::new()
        .route("/mcp", post(handle))
        .with_state(Arc::new(state))
}

#[derive(Debug, Deserialize)]
struct RpcRequest {
    id: Option<Value>,
    method: String,
    params: Option<Value>,
}

struct ToolDef {
    name: &'static str,
    summary: &'static str,
    capability: ProjectedCapabilityKind,
    connect_path: &'static str,
    input_schema: Value,
}

async fn handle(
    State(state): State<Arc<McpState>>,
    headers: HeaderMap,
    Json(request): Json<RpcRequest>,
) -> Response {
    let id = request.id.clone().unwrap_or(Value::Null);
    let version = headers
        .get("mcp-protocol-version")
        .and_then(|value| value.to_str().ok());
    if version != Some(PROTOCOL_VERSION) {
        return rpc_error(
            &id,
            JSONRPC_UNSUPPORTED_VERSION,
            "UnsupportedProtocolVersionError",
            &json!({ "supported": [PROTOCOL_VERSION] }),
        );
    }
    let tenant = match tenant_from_headers(&headers) {
        Ok(tenant) => tenant,
        Err(message) => return unauthorized(&message),
    };
    let authorization = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok());
    if let Err(error) = state.sessions.resolve(authorization, tenant.as_ref()).await {
        return unauthorized(&error.to_string());
    }
    let mut response = match request.method.as_str() {
        "server/discover" => rpc_ok(&id, discover_result()),
        "tools/list" => rpc_ok(&id, tools_list(&state)),
        "tools/call" => tools_call(&state, &headers, id, request.params).await,
        _ => rpc_error(
            &id,
            JSONRPC_METHOD_NOT_FOUND,
            "Method not found",
            &Value::Null,
        ),
    };
    response.headers_mut().insert(
        "mcp-protocol-version",
        HeaderValue::from_static(PROTOCOL_VERSION),
    );
    response
}

fn tenant_from_headers(headers: &HeaderMap) -> Result<Option<TenantId>, String> {
    match headers
        .get("x-zoen-tenant")
        .and_then(|value| value.to_str().ok())
    {
        Some(raw) => TenantId::parse(raw)
            .map(Some)
            .map_err(|error| error.to_string()),
        None => Ok(None),
    }
}

fn unauthorized(message: &str) -> Response {
    (StatusCode::UNAUTHORIZED, Json(json!({ "error": message }))).into_response()
}

fn discover_result() -> Value {
    json!({
        "protocolVersions": [PROTOCOL_VERSION],
        "capabilities": { "tools": { "listChanged": false } },
        "serverInfo": { "name": SERVER_NAME, "version": env!("CARGO_PKG_VERSION") },
    })
}

fn tools_list(state: &McpState) -> Value {
    let list: Vec<Value> = tools()
        .iter()
        .map(|tool| {
            json!({
                "name": tool.name,
                "description": tool.summary,
                "inputSchema": tool.input_schema,
                "annotations": {
                    "readOnlyHint": matches!(
                        tool.capability,
                        ProjectedCapabilityKind::Discover
                            | ProjectedCapabilityKind::Query
                            | ProjectedCapabilityKind::Explain
                    ),
                },
            })
        })
        .collect();
    json!({
        "tools": list,
        "ttlMs": state.tools_ttl_ms,
        "cacheScope": "private",
    })
}

async fn tools_call(
    state: &McpState,
    headers: &HeaderMap,
    id: Value,
    params: Option<Value>,
) -> Response {
    let params = params.unwrap_or(Value::Null);
    let name = params.get("name").and_then(Value::as_str).unwrap_or("");
    let Some(tool) = tools().into_iter().find(|tool| tool.name == name) else {
        return rpc_error(
            &id,
            JSONRPC_INVALID_PARAMS,
            "Unknown tool",
            &json!({ "name": name }),
        );
    };
    let arguments = params
        .get("arguments")
        .cloned()
        .unwrap_or_else(|| json!({}));
    if let Err(error) = require_capability(state, headers, tool.capability).await {
        return rpc_error(&id, JSONRPC_INGRESS_DENIED, "ingress_not_allowed", &error);
    }
    match build_connect_body(state, headers, &tool, arguments).await {
        Ok(body) => match connect_call(state, headers, tool.connect_path, &body).await {
            Ok(result) => tool_result(&id, &result),
            Err(error) => tool_error_result(&id, &error),
        },
        Err(error) => tool_error_result(&id, &error),
    }
}

/// The enforcement point that did not exist before this shim: a workload
/// principal may only call tools whose capability kind its credential
/// projects. Door sessions (people) skip the gate; Cedar enforces downstream.
async fn require_capability(
    state: &McpState,
    headers: &HeaderMap,
    kind: ProjectedCapabilityKind,
) -> Result<(), Value> {
    let authorization = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok());
    let Ok((credential_id, _context)) = state
        .sessions
        .resolve_workload_exchange(authorization)
        .await
    else {
        return Ok(());
    };
    let credential = state
        .credentials
        .get(&credential_id)
        .await
        .map_err(|error| json!({ "error": error.to_string() }))?;
    let allowed = credential.allowed_ingress.iter().any(|allowance| {
        matches!(
            allowance,
            IngressAllowance::OutboundProjected { capability_kinds }
                if capability_kinds.contains(&kind)
        )
    });
    if allowed {
        Ok(())
    } else {
        Err(json!({
            "error": "ingress_not_allowed",
            "capabilityKind": kind.as_str(),
        }))
    }
}

async fn build_connect_body(
    state: &McpState,
    headers: &HeaderMap,
    tool: &ToolDef,
    arguments: Value,
) -> Result<Value, Value> {
    let mut args = arguments.as_object().cloned().unwrap_or_default();
    match tool.name {
        "zoen_propose" => {
            require_field(&args, "operationId")?;
            require_field(&args, "actionId")?;
            require_field(&args, "resourceId")?;
            let definition = resolve_definition(state, headers, &mut args).await?;
            let operation = args
                .get("operationId")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_owned();
            args.entry("proposalId".to_owned())
                .or_insert_with(|| json!(format!("prop_{operation}")));
            args.insert("definition".to_owned(), definition);
            Ok(Value::Object(args))
        }
        "zoen_commit" => {
            require_field(&args, "proposalId")?;
            require_field(&args, "operationId")?;
            require_field(&args, "previewHash")?;
            Ok(Value::Object(args))
        }
        "zoen_explain" => {
            require_field(&args, "operationId")?;
            Ok(Value::Object(args))
        }
        "zoen_discover" => {
            require_field(&args, "resourceId")?;
            let definition = resolve_definition(state, headers, &mut args).await?;
            args.insert("definition".to_owned(), definition);
            Ok(Value::Object(args))
        }
        "zoen_query" => {
            let definition = resolve_definition(state, headers, &mut args).await?;
            args.insert("definition".to_owned(), definition);
            if let Some(tenant) = headers
                .get("x-zoen-tenant")
                .and_then(|value| value.to_str().ok())
            {
                args.entry("tenantId".to_owned())
                    .or_insert_with(|| json!(tenant));
            }
            Ok(Value::Object(args))
        }
        _ => Ok(Value::Object(args)),
    }
}

/// Fold the MCP-level definition arguments into the proto `definition`
/// reference. When `revision` is omitted, resolve head first: `GetRevision`
/// when a digest is given (the CLI `definition_ref` pattern), otherwise
/// `GetActiveRevision`.
async fn resolve_definition(
    state: &McpState,
    headers: &HeaderMap,
    args: &mut Map<String, Value>,
) -> Result<Value, Value> {
    let definition_id = take_string(args, "definitionId")?;
    let digest = take_opt_string(args, "digest");
    let revision = take_opt_string(args, "revision");
    match revision {
        Some(revision) if !revision.is_empty() => {
            let digest = digest.ok_or_else(|| {
                json!({ "error": "invalid_params", "detail": "digest is required with revision" })
            })?;
            Ok(json!({
                "definitionId": definition_id,
                "digest": digest,
                "revision": revision,
            }))
        }
        _ => resolve_head(state, headers, &definition_id, digest).await,
    }
}

async fn resolve_head(
    state: &McpState,
    headers: &HeaderMap,
    definition_id: &str,
    digest: Option<String>,
) -> Result<Value, Value> {
    let tenant = headers
        .get("x-zoen-tenant")
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| {
            json!({
                "error": "invalid_params",
                "detail": "x-zoen-tenant is required to resolve the head revision",
            })
        })?;
    let (path, body) = match &digest {
        Some(digest) => (
            "/zoen.definition.v1.DefinitionService/GetRevision",
            json!({ "tenantId": tenant, "definitionId": definition_id, "digest": digest }),
        ),
        None => (
            "/zoen.definition.v1.DefinitionService/GetActiveRevision",
            json!({ "tenantId": tenant, "definitionId": definition_id }),
        ),
    };
    let response = connect_call(state, headers, path, &body).await?;
    let revision = response
        .pointer("/definitionRevision/revision")
        .and_then(value_as_revision_string)
        .ok_or_else(
            || json!({ "error": "definition_head_unresolved", "detail": response.clone() }),
        )?;
    let head_digest = response
        .pointer("/definitionRevision/digest")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .or(digest)
        .ok_or_else(
            || json!({ "error": "definition_head_unresolved", "detail": response.clone() }),
        )?;
    Ok(json!({
        "definitionId": definition_id,
        "digest": head_digest,
        "revision": revision,
    }))
}

/// Invoke the SAME Connect sub-router in process, forwarding `Authorization`
/// and `x-zoen-tenant` verbatim (contract from cli.rs: Connect-JSON,
/// `connect-protocol-version: 1`, camelCase bodies).
async fn connect_call(
    state: &McpState,
    headers: &HeaderMap,
    path: &str,
    body: &Value,
) -> Result<Value, Value> {
    let payload =
        serde_json::to_string(body).map_err(|error| json!({ "error": error.to_string() }))?;
    let mut request = Request::post(path)
        .header(header::CONTENT_TYPE, "application/json")
        .header("connect-protocol-version", "1")
        .body(Body::from(payload))
        .map_err(|error| json!({ "error": error.to_string() }))?;
    for name in [
        header::AUTHORIZATION,
        HeaderName::from_static("x-zoen-tenant"),
    ] {
        if let Some(value) = headers.get(&name) {
            request.headers_mut().insert(name, value.clone());
        }
    }
    let response = match state.connect.clone().oneshot(request).await {
        Ok(response) => response,
        Err(error) => match error {},
    };
    let status = response.status();
    let bytes = to_bytes(response.into_body(), CONNECT_BODY_LIMIT)
        .await
        .map_err(|error| json!({ "error": error.to_string() }))?;
    let parsed: Value = serde_json::from_slice(&bytes)
        .unwrap_or_else(|_| Value::String(String::from_utf8_lossy(&bytes).into_owned()));
    if status.is_success() {
        Ok(parsed)
    } else {
        Err(parsed)
    }
}

fn tool_result(id: &Value, result: &Value) -> Response {
    rpc_ok(
        id,
        json!({
            "resultType": "complete",
            "structuredContent": result,
            "content": [{ "type": "text", "text": serde_json::to_string_pretty(result).unwrap_or_default() }],
        }),
    )
}

fn tool_error_result(id: &Value, error: &Value) -> Response {
    rpc_ok(
        id,
        json!({
            "isError": true,
            "resultType": "complete",
            "structuredContent": error,
            "content": [{ "type": "text", "text": serde_json::to_string_pretty(error).unwrap_or_default() }],
        }),
    )
}

fn rpc_ok(id: &Value, result: Value) -> Response {
    let mut result = result;
    if let Some(object) = result.as_object_mut() {
        object.insert(
            "_meta".to_owned(),
            json!({
                "io.modelcontextprotocol/serverInfo": {
                    "name": SERVER_NAME,
                    "version": env!("CARGO_PKG_VERSION"),
                },
            }),
        );
    }
    Json(json!({ "jsonrpc": "2.0", "id": id, "result": result })).into_response()
}

fn rpc_error(id: &Value, code: i64, message: &str, data: &Value) -> Response {
    Json(json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": { "code": code, "message": message, "data": data },
    }))
    .into_response()
}

fn require_field(args: &Map<String, Value>, key: &str) -> Result<(), Value> {
    match args.get(key).and_then(Value::as_str) {
        Some(value) if !value.is_empty() => Ok(()),
        _ => Err(json!({
            "error": "invalid_params",
            "detail": format!("{key} is required"),
        })),
    }
}

fn take_string(args: &mut Map<String, Value>, key: &str) -> Result<String, Value> {
    match args
        .remove(key)
        .and_then(|value| value.as_str().map(str::to_owned))
    {
        Some(value) if !value.is_empty() => Ok(value),
        _ => Err(json!({
            "error": "invalid_params",
            "detail": format!("{key} is required"),
        })),
    }
}

fn take_opt_string(args: &mut Map<String, Value>, key: &str) -> Option<String> {
    args.remove(key).and_then(|value| match value {
        Value::String(text) => Some(text),
        Value::Number(number) => Some(number.to_string()),
        _ => None,
    })
}

fn value_as_revision_string(value: &Value) -> Option<String> {
    match value {
        Value::String(text) if !text.is_empty() => Some(text.clone()),
        Value::Number(number) => Some(number.to_string()),
        _ => None,
    }
}

fn revision_schema() -> Value {
    json!({
        "type": ["string", "integer"],
        "description": "Definition revision (uint64; proto JSON carries it as a string). Omit to resolve head.",
    })
}

fn object_schema(required: &[&str], properties: &Value) -> Value {
    json!({
        "type": "object",
        "properties": properties,
        "required": required,
        "additionalProperties": true,
    })
}

fn tools() -> Vec<ToolDef> {
    let mut all = mutation_tools();
    all.extend(read_tools());
    all
}

fn mutation_tools() -> Vec<ToolDef> {
    vec![
        ToolDef {
            name: "zoen_commit",
            summary: "Commit a proposed operation and receive the receipt with policy evidence.",
            capability: ProjectedCapabilityKind::CommitOrRecover,
            connect_path: "/zoen.action.v1.ActionService/Commit",
            input_schema: object_schema(
                &["proposalId", "operationId", "previewHash"],
                &json!({
                    "proposalId": { "type": "string" },
                    "operationId": { "type": "string" },
                    "previewHash": { "type": "string", "description": "previewHash from the zoen_propose result" },
                }),
            ),
        },
        ToolDef {
            name: "zoen_discover",
            summary: "Discover the actions a definition exposes on a resource.",
            capability: ProjectedCapabilityKind::Discover,
            connect_path: "/zoen.action.v1.ActionService/Discover",
            input_schema: object_schema(
                &["definitionId", "resourceId"],
                &json!({
                    "definitionId": { "type": "string" },
                    "digest": { "type": "string" },
                    "revision": revision_schema(),
                    "resourceId": { "type": "string" },
                }),
            ),
        },
    ]
}

fn read_tools() -> Vec<ToolDef> {
    vec![
        ToolDef {
            name: "zoen_execute",
            summary: "Run a governed computation component over an input payload.",
            capability: ProjectedCapabilityKind::Query,
            connect_path: "/zoen.computation.v1.ComputationService/Execute",
            input_schema: object_schema(
                &["executionId", "componentDigest"],
                &json!({
                    "executionId": { "type": "string" },
                    "componentDigest": { "type": "string" },
                    "manifest": { "type": "object" },
                    "input": { "type": "string", "description": "base64-encoded input bytes" },
                    "limits": { "type": "object" },
                }),
            ),
        },
        ToolDef {
            name: "zoen_explain",
            summary: "Explain an operation: status, receipt, and policy evidence.",
            capability: ProjectedCapabilityKind::Explain,
            connect_path: "/zoen.action.v1.ActionService/GetOperationStatus",
            input_schema: object_schema(
                &["operationId"],
                &json!({
                    "operationId": { "type": "string" },
                }),
            ),
        },
        ToolDef {
            name: "zoen_propose",
            summary: "Propose a governed action; returns the proposal, decision, and preview hash.",
            capability: ProjectedCapabilityKind::Propose,
            connect_path: "/zoen.action.v1.ActionService/Propose",
            input_schema: object_schema(
                &["actionId", "definitionId", "resourceId", "operationId"],
                &json!({
                    "actionId": { "type": "string" },
                    "definitionId": { "type": "string" },
                    "digest": { "type": "string" },
                    "revision": revision_schema(),
                    "resourceId": { "type": "string" },
                    "inputs": { "type": "array", "items": { "type": "object" } },
                    "validAt": { "type": "string", "description": "RFC 3339 timestamp" },
                    "expiresAt": { "type": "string", "description": "RFC 3339 timestamp" },
                    "scenarioId": { "type": "string" },
                    "operationId": { "type": "string", "description": "required idempotency key" },
                    "proposalId": { "type": "string", "description": "defaults to prop_{operationId}" },
                }),
            ),
        },
        ToolDef {
            name: "zoen_query",
            summary: "Semantic query over the governed world state.",
            capability: ProjectedCapabilityKind::Query,
            connect_path: "/zoen.world.v1.WorldService/SemanticQuery",
            input_schema: object_schema(
                &["definitionId"],
                &json!({
                    "definitionId": { "type": "string" },
                    "digest": { "type": "string" },
                    "revision": revision_schema(),
                    "selection": { "type": "object" },
                    "validAt": { "type": "string", "description": "RFC 3339 timestamp" },
                    "consistency": { "type": "object" },
                    "entityId": { "type": "string" },
                    "byType": { "type": "object" },
                    "pageToken": { "type": "string" },
                    "scenarioId": { "type": "string" },
                }),
            ),
        },
    ]
}
