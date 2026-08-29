import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type SourceKind = "rest" | "oauth2" | "mcp" | "google";

export type SourceAuth =
  | { readonly type: "none" }
  | { readonly type: "apikey"; readonly header: string; readonly value: string }
  | { readonly type: "oauth2"; readonly accessToken: string; readonly tokenUrl?: string };

export type Introduced = {
  readonly folder?: string;
  readonly folderId?: string;
  readonly path?: string;
  readonly query?: string;
};

export type SourceInstance = {
  readonly id: string;
  readonly kind: SourceKind;
  readonly profile?: string;
  readonly oauthApp?: string;
  readonly baseUrl?: string;
  readonly url?: string;
  readonly auth: SourceAuth;
  readonly introduced?: Introduced;
  readonly cursor?: string;
};

export type RuntimeEnv = {
  readonly zoend: string;
  readonly bearer: string;
  readonly tenant: string;
  readonly sourceHome: string;
  readonly definitionId: string;
  readonly definitionDigest: string;
  readonly validAt: string;
  readonly principalId: string;
  readonly actorId: string;
  readonly workloadId: string;
  readonly isolate: boolean;
};

export type CommandResult = {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
};

const HELP = `zoen world query --type TYPE [--scenario S]
zoen world evidence --type TYPE
zoen world scenario create --name S
zoen world scenario apply --name S
zoen world scenario discard --name S
zoen definition publish --file FILE
zoen definition activate --definition-id ID --digest DIGEST
zoen source connect rest --id ID --base URL [--auth apikey]
zoen source connect oauth2 --id ID --token-url URL --client-id ID
zoen source connect google --profile drive|mail|calendar|contacts [--base URL]
zoen source connect mcp --id ID --url URL
zoen source introduce ID --folder NAME | --path PATH
zoen source sync ID
zoen action propose --proposal-id ID --action-id ID --resource-id ID [--scenario S] [--input KEY=VALUE]...
zoen action commit --proposal-id ID --operation-id ID --preview-hash HASH
zoen history explain
zoen auth login
`;

export function parseEnv(env: NodeJS.ProcessEnv): RuntimeEnv {
  return {
    zoend: requiredEnv(env, "ZOEN_ZOEND", "ZOEN_IDENTITY_BASE_URL").replace(/\/+$/u, ""),
    bearer: requiredEnv(env, "ZOEN_BEARER"),
    tenant: requiredEnv(env, "ZOEN_TENANT"),
    sourceHome: env.ZOEN_SOURCE_HOME?.trim() || join(process.cwd(), ".zoen"),
    definitionId: env.ZOEN_DEFINITION_ID?.trim() || "world.source",
    definitionDigest: env.ZOEN_DEFINITION_DIGEST?.trim() || "",
    validAt: env.ZOEN_VALID_AT?.trim() || "2026-01-15T00:00:00Z",
    principalId: env.ZOEN_PRINCIPAL?.trim() || "principal.personal",
    actorId: env.ZOEN_ACTOR?.trim() || "actor.personal",
    workloadId: env.ZOEN_WORKLOAD?.trim() || "workload.personal",
    isolate: env.ZOEN_ISOLATE === "1",
  };
}

function requiredEnv(env: NodeJS.ProcessEnv, ...names: string[]): string {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value !== undefined && value.length > 0) {
      return value;
    }
  }
  throw new Error(`${names[0]} is required`);
}

export async function dispatchZoen(input: {
  readonly argv: readonly string[];
  readonly env: RuntimeEnv;
}): Promise<CommandResult> {
  const parsed = parseArgv(input.argv);
  try {
    if (parsed.kind === "help") {
      return { exitCode: 0, stdout: HELP, stderr: "" };
    }
    if (parsed.kind === "invalid") {
      return fail(2, parsed.message);
    }
    if (parsed.kind === "denied-commit") {
      return fail(1, "isolate cannot commit");
    }
    if (parsed.kind === "denied-speak") {
      return fail(1, "isolate cannot speak");
    }
    if (parsed.kind === "world-query" || parsed.kind === "world-evidence") {
      return worldQuery(input.env, parsed.typeId, parsed.limit, parsed.scenarioId);
    }
    if (parsed.kind === "world-scenario-create") {
      return createScenario(input.env, parsed.name);
    }
    if (parsed.kind === "world-scenario-apply") {
      if (input.env.isolate) {
        return fail(1, "isolate cannot commit");
      }
      return applyScenario(input.env, parsed.name);
    }
    if (parsed.kind === "world-scenario-discard") {
      return discardScenario(input.env, parsed.name);
    }
    if (parsed.kind === "definition-publish") {
      return publishDefinition(input.env, parsed.file);
    }
    if (parsed.kind === "definition-activate") {
      return activateDefinition(input.env, parsed.definitionId, parsed.digest);
    }
    if (parsed.kind === "source-connect") {
      return connectSource(input.env, parsed);
    }
    if (parsed.kind === "source-introduce") {
      return introduceSource(input.env, parsed);
    }
    if (parsed.kind === "source-sync") {
      return syncSource(input.env, parsed.id, parsed.dryRun);
    }
    if (parsed.kind === "action-propose") {
      if (input.env.isolate) {
        return fail(1, "isolate cannot commit");
      }
      return proposeAction(input.env, parsed);
    }
    if (parsed.kind === "action-commit") {
      if (input.env.isolate) {
        return fail(1, "isolate cannot commit");
      }
      return commitAction(input.env, parsed);
    }
    if (parsed.kind === "history-explain") {
      return fail(2, "zoen history explain is not this slice");
    }
    if (parsed.kind === "auth-login") {
      return fail(2, "zoen auth login uses the Better Auth door, not this binary");
    }
    return fail(2, "unknown zoen verb");
  } catch (error) {
    return fail(1, error instanceof Error ? error.message : String(error));
  }
}

type Parsed =
  | { readonly kind: "help" }
  | { readonly kind: "invalid"; readonly message: string }
  | { readonly kind: "denied-commit" }
  | { readonly kind: "denied-speak" }
  | { readonly kind: "world-query"; readonly typeId: string; readonly limit: number; readonly scenarioId: string }
  | { readonly kind: "world-evidence"; readonly typeId: string; readonly limit: number; readonly scenarioId: string }
  | { readonly kind: "world-scenario-create"; readonly name: string }
  | { readonly kind: "world-scenario-apply"; readonly name: string }
  | { readonly kind: "world-scenario-discard"; readonly name: string }
  | { readonly kind: "definition-publish"; readonly file: string }
  | { readonly kind: "definition-activate"; readonly definitionId: string; readonly digest: string }
  | {
      readonly kind: "source-connect";
      readonly sourceKind: SourceKind;
      readonly id: string;
      readonly profile?: string;
      readonly baseUrl?: string;
      readonly url?: string;
      readonly tokenUrl?: string;
      readonly clientId?: string;
      readonly clientSecret?: string;
      readonly authType: "none" | "apikey" | "oauth2";
      readonly apiKey?: string;
      readonly dryRun: boolean;
    }
  | {
      readonly kind: "source-introduce";
      readonly id: string;
      readonly folder?: string;
      readonly path?: string;
      readonly query?: string;
      readonly dryRun: boolean;
    }
  | { readonly kind: "source-sync"; readonly id: string; readonly dryRun: boolean }
  | {
      readonly kind: "action-propose";
      readonly proposalId: string;
      readonly operationId: string;
      readonly actionId: string;
      readonly resourceId: string;
      readonly quantity?: string;
      readonly unit: string;
      readonly scenarioId: string;
      readonly inputs: ReadonlyArray<{ readonly inputId: string; readonly value: string }>;
      readonly dryRun: boolean;
    }
  | {
      readonly kind: "action-commit";
      readonly proposalId: string;
      readonly operationId: string;
      readonly previewHash: string;
    }
  | { readonly kind: "history-explain" }
  | { readonly kind: "auth-login" };

function parseArgv(argv: readonly string[]): Parsed {
  const rest = stripBin(argv);
  if (rest.length === 0 || rest[0] === "help" || rest[0] === "--help") {
    return { kind: "help" };
  }
  const noun = rest[0];
  const verb = rest[1];
  if (noun === "world" && verb === "scenario") {
    const action = rest[2];
    const flags = parseFlags(rest.slice(3));
    const name = flags.get("name") ?? "";
    if (name.length === 0) {
      return { kind: "invalid", message: "zoen world scenario requires --name" };
    }
    if (action === "create") {
      return { kind: "world-scenario-create", name };
    }
    if (action === "apply") {
      return { kind: "world-scenario-apply", name };
    }
    if (action === "discard") {
      return { kind: "world-scenario-discard", name };
    }
    return { kind: "invalid", message: `unknown zoen world scenario verb: ${action ?? ""}` };
  }
  const flags = parseFlags(rest.slice(2));
  if (noun === "speak" || noun === "say" || verb === "speak") {
    return { kind: "denied-speak" };
  }
  if (noun === "action" && verb === "commit") {
    return {
      kind: "action-commit",
      proposalId: flags.get("proposal-id") ?? "",
      operationId: flags.get("operation-id") ?? "",
      previewHash: flags.get("preview-hash") ?? "",
    };
  }
  if (noun === "commit") {
    return { kind: "denied-commit" };
  }
  if (noun === "world" && (verb === "query" || verb === "evidence")) {
    const typeId = flags.get("type") ?? "";
    if (typeId.length === 0) {
      return { kind: "invalid", message: `zoen world ${verb} requires --type` };
    }
    return {
      kind: verb === "evidence" ? "world-evidence" : "world-query",
      typeId,
      limit: Number(flags.get("limit") ?? "10"),
      scenarioId: flags.get("scenario") ?? "",
    };
  }
  if (noun === "definition" && verb === "publish") {
    const file = flags.get("file") ?? "";
    if (file.length === 0) {
      return { kind: "invalid", message: "zoen definition publish requires --file" };
    }
    return { kind: "definition-publish", file };
  }
  if (noun === "definition" && verb === "activate") {
    const definitionId = flags.get("definition-id") ?? "";
    const digest = flags.get("digest") ?? "";
    if (definitionId.length === 0 || digest.length === 0) {
      return { kind: "invalid", message: "zoen definition activate requires --definition-id and --digest" };
    }
    return { kind: "definition-activate", definitionId, digest };
  }
  if (noun === "source" && verb === "connect") {
    return parseConnect(rest.slice(2), flags);
  }
  if (noun === "source" && verb === "introduce") {
    const id = rest[2];
    if (id === undefined || id.startsWith("-")) {
      return { kind: "invalid", message: "zoen source introduce requires a source id" };
    }
    return {
      kind: "source-introduce",
      id,
      folder: flags.get("folder"),
      path: flags.get("path"),
      query: flags.get("query"),
      dryRun: flags.has("dry-run"),
    };
  }
  if (noun === "source" && verb === "sync") {
    const id = rest[2];
    if (id === undefined || id.startsWith("-")) {
      return { kind: "invalid", message: "zoen source sync requires a source id" };
    }
    return { kind: "source-sync", id, dryRun: flags.has("dry-run") };
  }
  if (noun === "action" && verb === "propose") {
    return {
      kind: "action-propose",
      proposalId: flags.get("proposal-id") ?? "",
      operationId: flags.get("operation-id") ?? flags.get("proposal-id") ?? "",
      actionId: flags.get("action-id") ?? "source.mapQuantity",
      resourceId: flags.get("resource-id") ?? "",
      quantity: flags.get("quantity"),
      unit: flags.get("unit") ?? "each",
      scenarioId: flags.get("scenario") ?? "",
      inputs: parseInputFlags(rest.slice(2)),
      dryRun: flags.has("dry-run"),
    };
  }
  if (noun === "action" && verb === "discover") {
    return { kind: "invalid", message: "zoen action discover is not this slice" };
  }
  if (noun === "history" && verb === "explain") {
    return { kind: "history-explain" };
  }
  if (noun === "auth" && verb === "login") {
    return { kind: "auth-login" };
  }
  return { kind: "invalid", message: `unknown zoen verb: ${rest.join(" ")}` };
}

function parseConnect(args: readonly string[], flags: Map<string, string>): Parsed {
  const sourceKind = args[0];
  const dryRun = flags.has("dry-run");
  if (sourceKind === "rest") {
    const id = flags.get("id") ?? "rest";
    const baseUrl = flags.get("base");
    if (baseUrl === undefined) {
      return { kind: "invalid", message: "zoen source connect rest requires --base" };
    }
    return {
      kind: "source-connect",
      sourceKind: "rest",
      id,
      baseUrl,
      authType: (flags.get("auth") as "apikey" | undefined) ?? "none",
      apiKey: flags.get("api-key"),
      dryRun,
    };
  }
  if (sourceKind === "oauth2") {
    const id = flags.get("id") ?? "oauth2";
    const tokenUrl = flags.get("token-url");
    const clientId = flags.get("client-id");
    if (tokenUrl === undefined || clientId === undefined) {
      return { kind: "invalid", message: "zoen source connect oauth2 requires --token-url and --client-id" };
    }
    return {
      kind: "source-connect",
      sourceKind: "oauth2",
      id,
      tokenUrl,
      clientId,
      clientSecret: flags.get("client-secret"),
      baseUrl: flags.get("base"),
      authType: "oauth2",
      dryRun,
    };
  }
  if (sourceKind === "google") {
    const profile = flags.get("profile");
    if (profile === undefined) {
      return { kind: "invalid", message: "zoen source connect google requires --profile drive|mail|calendar|contacts" };
    }
    if (flags.has("use-door") || flags.get("token") !== undefined) {
      return { kind: "invalid", message: "door tokens are not ingest authority" };
    }
    return {
      kind: "source-connect",
      sourceKind: "google",
      id: flags.get("id") ?? profile,
      profile,
      baseUrl: flags.get("base"),
      authType: "none",
      dryRun,
    };
  }
  if (sourceKind === "mcp") {
    const url = flags.get("url");
    if (url === undefined) {
      return { kind: "invalid", message: "zoen source connect mcp requires --url" };
    }
    return {
      kind: "source-connect",
      sourceKind: "mcp",
      id: flags.get("id") ?? "mcp",
      url,
      authType: "none",
      dryRun,
    };
  }
  return { kind: "invalid", message: "zoen source connect expects rest|oauth2|google|mcp" };
}

function stripBin(argv: readonly string[]): string[] {
  if (argv[0] === "zoen" || argv[0]?.endsWith("/zoen") || argv[0]?.endsWith("/bin/zoen")) {
    return argv.slice(1).map(String);
  }
  return argv.map(String);
}

function parseFlags(args: readonly string[]): Map<string, string> {
  const flags = new Map<string, string>();
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === undefined || !arg.startsWith("--")) {
      continue;
    }
    const name = arg.slice(2);
    const next = args[i + 1];
    if (next === undefined || next.startsWith("--")) {
      flags.set(name, "1");
      continue;
    }
    flags.set(name, next);
    i += 1;
  }
  return flags;
}

function parseInputFlags(
  args: readonly string[],
): Array<{ readonly inputId: string; readonly value: string }> {
  const inputs: Array<{ readonly inputId: string; readonly value: string }> = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg !== "--input") {
      continue;
    }
    const next = args[i + 1];
    if (next === undefined || next.startsWith("--")) {
      continue;
    }
    const eq = next.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    inputs.push({ inputId: next.slice(0, eq), value: next.slice(eq + 1) });
    i += 1;
  }
  return inputs;
}

function ok(value: unknown): CommandResult {
  return { exitCode: 0, stdout: `${JSON.stringify(value)}\n`, stderr: "" };
}

function fail(exitCode: number, message: string): CommandResult {
  return { exitCode, stdout: "", stderr: `${message}\n` };
}

async function connectSource(
  env: RuntimeEnv,
  parsed: Extract<Parsed, { kind: "source-connect" }>,
): Promise<CommandResult> {
  if (parsed.dryRun) {
    return ok({ dryRun: true, id: parsed.id, kind: parsed.sourceKind });
  }
  let auth: SourceAuth = { type: "none" };
  if (parsed.sourceKind === "oauth2") {
    auth = await fetchOAuth2Token(parsed.tokenUrl ?? "", parsed.clientId ?? "", parsed.clientSecret ?? "");
  } else if (parsed.authType === "apikey") {
    const value = parsed.apiKey ?? process.env.ZOEN_SOURCE_API_KEY?.trim();
    if (value === undefined || value.length === 0) {
      return fail(2, "zoen source connect rest --auth apikey requires --api-key or ZOEN_SOURCE_API_KEY");
    }
    auth = { type: "apikey", header: "Authorization", value: `Bearer ${value}` };
  }
  const instance: SourceInstance = {
    id: parsed.id,
    kind: parsed.sourceKind,
    profile: parsed.profile,
    oauthApp: parsed.sourceKind === "google" ? "zoen" : undefined,
    baseUrl: parsed.baseUrl,
    url: parsed.url,
    auth,
  };
  await writeSource(env, instance);
  return ok({
    connected: instance.id,
    kind: instance.kind,
    profile: instance.profile ?? null,
    oauthApp: instance.oauthApp ?? null,
    doorTokenStored: false,
  });
}

async function introduceSource(
  env: RuntimeEnv,
  parsed: Extract<Parsed, { kind: "source-introduce" }>,
): Promise<CommandResult> {
  const instance = await readSource(env, parsed.id);
  if (instance.kind === "google") {
    if (parsed.folder === undefined || parsed.folder.length === 0) {
      return fail(2, "introduce a folder, not the account");
    }
    if (parsed.folder === "My Drive" || parsed.folder === "account") {
      return fail(2, "introduce a folder, not the account");
    }
  } else if (parsed.path === undefined && parsed.query === undefined && parsed.folder === undefined) {
    return fail(2, "zoen source introduce requires --folder, --path, or --query");
  }
  if (parsed.dryRun) {
    return ok({ dryRun: true, id: instance.id, folder: parsed.folder ?? null, path: parsed.path ?? null });
  }
  const introduced: Introduced = {
    folder: parsed.folder,
    path: parsed.path,
    query: parsed.query,
  };
  const next = { ...instance, introduced };
  await writeSource(env, next);
  return ok({ introduced: parsed.id, folder: parsed.folder ?? null, path: parsed.path ?? null, query: parsed.query ?? null });
}

async function syncSource(env: RuntimeEnv, id: string, dryRun: boolean): Promise<CommandResult> {
  const instance = await readSource(env, id);
  if (instance.introduced === undefined) {
    return fail(2, `source ${id} has no introduced resource`);
  }
  if (instance.kind === "google" && instance.introduced.folder === undefined) {
    return fail(2, "introduce a folder, not the account");
  }
  const fetched = await fetchSource(instance);
  const cas = await putCas(env, fetched.bytes);
  if (dryRun) {
    return ok({ dryRun: true, id, digest: cas.digest, cursor: fetched.cursor ?? null });
  }
  const signal = await emitSignal(env, instance, cas, fetched.durableEventId);
  const quantity = fetched.quantity;
  if (env.isolate) {
    return {
      exitCode: 1,
      stdout: `${JSON.stringify({
        id,
        signalId: signal.signalId,
        digest: cas.digest,
        quantity,
        claimIds: [],
      })}\n`,
      stderr: "isolate cannot commit\n",
    };
  }
  if (quantity === undefined) {
    return ok({
      id,
      signalId: signal.signalId,
      digest: cas.digest,
      claimIds: [],
      cursor: fetched.cursor ?? null,
    });
  }
  const mapped = await mapQuantity(env, {
    sourceId: instance.id,
    quantity,
    resourceId: fetched.resourceId,
    operationId: fetched.operationId,
  });
  const cursor = fetched.cursor;
  if (cursor !== undefined) {
    await writeSource(env, { ...instance, cursor });
  }
  return ok({
    id,
    signalId: signal.signalId,
    digest: cas.digest,
    quantity,
    claimIds: mapped.claimIds,
    proposalId: mapped.proposalId,
    cursor: cursor ?? null,
  });
}

async function fetchSource(instance: SourceInstance): Promise<{
  readonly bytes: Buffer;
  readonly quantity?: string;
  readonly cursor?: string;
  readonly durableEventId: string;
  readonly resourceId: string;
  readonly operationId: string;
}> {
  if (instance.kind === "mcp") {
    return fetchMcp(instance);
  }
  if (instance.kind === "google") {
    return fetchDrive(instance);
  }
  return fetchRest(instance);
}

async function fetchRest(instance: SourceInstance): Promise<{
  readonly bytes: Buffer;
  readonly quantity?: string;
  readonly cursor?: string;
  readonly durableEventId: string;
  readonly resourceId: string;
  readonly operationId: string;
}> {
  const base = instance.baseUrl;
  if (base === undefined) {
    throw new Error(`source ${instance.id} has no --base`);
  }
  const path = instance.introduced?.path ?? "/";
  const url = new URL(path, base.endsWith("/") ? base : `${base}/`);
  if (instance.cursor !== undefined) {
    url.searchParams.set("cursor", instance.cursor);
  }
  const response = await fetch(url, { headers: authHeaders(instance) });
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!response.ok) {
    throw new Error(`source GET ${url.href} ${response.status} ${bytes.toString("utf8")}`);
  }
  const parsed = parseJson(bytes);
  return {
    bytes,
    quantity: quantityFromUnknown(parsed),
    cursor: cursorFromUnknown(parsed) ?? undefined,
    durableEventId: `evt.${sanitize(instance.id)}.${hash8(bytes)}`,
    resourceId: resourceFromInstance(instance),
    operationId: `operation.${sanitize(instance.id)}-${hash8(bytes)}`,
  };
}

async function fetchDrive(instance: SourceInstance): Promise<{
  readonly bytes: Buffer;
  readonly quantity?: string;
  readonly cursor?: string;
  readonly durableEventId: string;
  readonly resourceId: string;
  readonly operationId: string;
}> {
  const base = instance.baseUrl;
  if (base === undefined) {
    throw new Error("google profile sync needs --base stand-in or planted OAuth; door tokens are not ingest authority");
  }
  const folder = instance.introduced?.folder;
  if (folder === undefined) {
    throw new Error("introduce a folder, not the account");
  }
  const folderUrl = new URL("/drive/v3/files", base.endsWith("/") ? base : `${base}/`);
  folderUrl.searchParams.set("q", `name='${folder}' and mimeType='application/vnd.google-apps.folder'`);
  const folderList = await fetchJson(folderUrl, instance);
  const folderId = firstFileId(folderList);
  if (folderId === undefined) {
    throw new Error(`folder ${folder} not found`);
  }
  const childrenUrl = new URL("/drive/v3/files", base.endsWith("/") ? base : `${base}/`);
  childrenUrl.searchParams.set("q", `'${folderId}' in parents`);
  const children = await fetchJson(childrenUrl, instance);
  const file = firstFile(children);
  if (file === undefined) {
    throw new Error(`folder ${folder} has no files`);
  }
  const mediaUrl = new URL(`/drive/v3/files/${file.id}`, base.endsWith("/") ? base : `${base}/`);
  mediaUrl.searchParams.set("alt", "media");
  const response = await fetch(mediaUrl, { headers: authHeaders(instance) });
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!response.ok) {
    throw new Error(`drive media ${mediaUrl.href} ${response.status}`);
  }
  const inner = unzipFirst(bytes) ?? bytes;
  return {
    bytes,
    quantity: quantityFromUnknown(parseJson(inner)),
    cursor: file.modifiedTime,
    durableEventId: `evt.drive.${sanitize(file.id)}`,
    resourceId: "entity.pedido.1",
    operationId: `operation.drive-${sanitize(file.id)}`,
  };
}

async function fetchMcp(instance: SourceInstance): Promise<{
  readonly bytes: Buffer;
  readonly quantity?: string;
  readonly cursor?: string;
  readonly durableEventId: string;
  readonly resourceId: string;
  readonly operationId: string;
}> {
  const url = instance.url;
  if (url === undefined) {
    throw new Error(`source ${instance.id} has no --url`);
  }
  await mcpCall(url, instance, "initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "zoen", version: "0" },
  });
  const listed = await mcpCall(url, instance, "tools/call", {
    name: instance.introduced?.path ?? "list",
    arguments: { cursor: instance.cursor ?? null },
  });
  const bytes = Buffer.from(JSON.stringify(listed), "utf8");
  return {
    bytes,
    quantity: quantityFromUnknown(listed),
    cursor: cursorFromUnknown(listed) ?? undefined,
    durableEventId: `evt.mcp.${sanitize(instance.id)}.${hash8(bytes)}`,
    resourceId: "entity.nota.1",
    operationId: `operation.mcp-${sanitize(instance.id)}-${hash8(bytes)}`,
  };
}

async function mcpCall(
  url: string,
  instance: SourceInstance,
  method: string,
  params: unknown,
): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...authHeaders(instance),
      "content-type": "application/json",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`mcp ${method} ${response.status} ${text}`);
  }
  const doc = JSON.parse(text) as { result?: unknown; error?: unknown };
  if (doc.error !== undefined) {
    throw new Error(`mcp ${method} ${JSON.stringify(doc.error)}`);
  }
  return doc.result;
}

async function fetchOAuth2Token(
  tokenUrl: string,
  clientId: string,
  clientSecret: string,
): Promise<SourceAuth> {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`oauth2 token ${response.status} ${text}`);
  }
  const doc = JSON.parse(text) as { access_token?: string };
  if (doc.access_token === undefined) {
    throw new Error("oauth2 token response missing access_token");
  }
  return { type: "oauth2", accessToken: doc.access_token, tokenUrl };
}

function authHeaders(instance: SourceInstance): Record<string, string> {
  if (instance.auth.type === "apikey") {
    return { [instance.auth.header]: instance.auth.value };
  }
  if (instance.auth.type === "oauth2") {
    return { Authorization: `Bearer ${instance.auth.accessToken}` };
  }
  return {};
}

async function fetchJson(url: URL, instance: SourceInstance): Promise<unknown> {
  const response = await fetch(url, { headers: authHeaders(instance) });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`GET ${url.href} ${response.status} ${text}`);
  }
  return JSON.parse(text);
}

function firstFile(doc: unknown): { id: string; modifiedTime?: string } | undefined {
  if (typeof doc !== "object" || doc === null || !("files" in doc)) {
    return undefined;
  }
  const files = (doc as { files: unknown }).files;
  if (!Array.isArray(files) || files.length === 0) {
    return undefined;
  }
  const first = files[0];
  if (typeof first !== "object" || first === null || !("id" in first)) {
    return undefined;
  }
  const id = (first as { id: unknown }).id;
  if (typeof id !== "string") {
    return undefined;
  }
  const modifiedTime = (first as { modifiedTime?: unknown }).modifiedTime;
  return {
    id,
    modifiedTime: typeof modifiedTime === "string" ? modifiedTime : undefined,
  };
}

function firstFileId(doc: unknown): string | undefined {
  return firstFile(doc)?.id;
}

function parseJson(bytes: Buffer): unknown {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    return null;
  }
}

function quantityFromUnknown(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.quantity === "string") {
    return record.quantity;
  }
  if (typeof record.quantidade === "string") {
    return record.quantidade;
  }
  if (typeof record.quantidade === "number") {
    return String(record.quantidade);
  }
  if (Array.isArray(record.data) && record.data[0] !== undefined) {
    return quantityFromUnknown(record.data[0]);
  }
  if (Array.isArray(record.items) && record.items[0] !== undefined) {
    return quantityFromUnknown(record.items[0]);
  }
  if (Array.isArray(record.files) && record.files[0] !== undefined) {
    return quantityFromUnknown(record.files[0]);
  }
  if (record.content !== undefined) {
    return quantityFromUnknown(record.content);
  }
  if (record.result !== undefined) {
    return quantityFromUnknown(record.result);
  }
  if (Array.isArray(record.content)) {
    for (const part of record.content) {
      const found = quantityFromUnknown(part);
      if (found !== undefined) {
        return found;
      }
      if (typeof part === "object" && part !== null && "text" in part && typeof (part as { text: unknown }).text === "string") {
        try {
          const nested = quantityFromUnknown(JSON.parse((part as { text: string }).text));
          if (nested !== undefined) {
            return nested;
          }
        } catch {
          continue;
        }
      }
    }
  }
  return undefined;
}

function cursorFromUnknown(value: unknown): string | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.cursor === "string") {
    return record.cursor;
  }
  if (record.cursor === null) {
    return null;
  }
  return null;
}

function resourceFromInstance(instance: SourceInstance): string {
  if (instance.id === "bling" || instance.introduced?.path === "/pedidos") {
    return "entity.pedido.1";
  }
  return "entity.nota.1";
}

function sanitize(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^[^a-zA-Z]+/, "x");
}

function hash8(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 8);
}

async function putCas(env: RuntimeEnv, bytes: Buffer): Promise<{ digest: string; path: string }> {
  const hex = createHash("sha256").update(bytes).digest("hex");
  const digest = `sha256:${hex}`;
  const path = join(env.sourceHome, "cas", hex);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  return { digest, path };
}

async function emitSignal(
  env: RuntimeEnv,
  instance: SourceInstance,
  cas: { digest: string },
  durableEventId: string,
): Promise<{ signalId: string }> {
  const exchange = await workloadExchange(env);
  const sourceClass = sourceClassOf(instance);
  const response = await fetch(`${env.zoend}/workload/signals`, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${exchange}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      durableEventId,
      source: {
        class: sourceClass,
        externalId: instance.id,
      },
      payloadDigestRef: cas.digest,
      sourceDigestRef: cas.digest,
      trustDisposition: "evidence_candidate",
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`PUT /workload/signals ${response.status} ${text}`);
  }
  const doc = JSON.parse(text) as { signal?: { id?: string } };
  const signalId = doc.signal?.id;
  if (signalId === undefined) {
    throw new Error("signal id missing");
  }
  return { signalId };
}

function sourceClassOf(instance: SourceInstance): string {
  if (instance.kind === "google") {
    return "google.drive";
  }
  if (instance.kind === "mcp") {
    return "mcp";
  }
  return "rest";
}

async function workloadExchange(env: RuntimeEnv): Promise<string> {
  const keyPath = join(env.sourceHome, "workload.api-key");
  let apiKey = "";
  try {
    apiKey = (await readFile(keyPath, "utf8")).trim();
  } catch {
    apiKey = "";
  }
  if (apiKey.length === 0) {
    apiKey = await issueWorkload(env, keyPath);
  }
  const response = await fetch(`${env.zoend}/workload/authenticate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ apiKey }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`POST /workload/authenticate ${response.status} ${text}`);
  }
  const doc = JSON.parse(text) as { exchangeToken?: string };
  if (doc.exchangeToken === undefined) {
    throw new Error("workload exchangeToken missing");
  }
  return doc.exchangeToken;
}

async function issueWorkload(env: RuntimeEnv, keyPath: string): Promise<string> {
  const response = await fetch(`${env.zoend}/workload/admin/credentials`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.bearer}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      tenantId: env.tenant,
      workloadId: env.workloadId,
      principalId: env.principalId,
      actorId: env.actorId,
      delegation: [
        {
          id: "delegation.source",
          actions: ["source.mapQuantity"],
          resources: ["entity.pedido.1", "entity.nota.1"],
        },
      ],
      allowedIngress: [
        { kind: "api_event", sourceClass: "google.drive" },
        { kind: "api_event", sourceClass: "rest" },
        { kind: "api_event", sourceClass: "mcp" },
      ],
      rateBudget: { maxAcceptsPerMinute: 120, maxCommitsPerHour: 120 },
      expiresAtMicros: 4102444800000000,
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`POST /workload/admin/credentials ${response.status} ${text}`);
  }
  const doc = JSON.parse(text) as { apiKeyOnce?: string };
  if (doc.apiKeyOnce === undefined) {
    throw new Error("workload apiKeyOnce missing");
  }
  await mkdir(dirname(keyPath), { recursive: true });
  await writeFile(keyPath, `${doc.apiKeyOnce}\n`, { mode: 0o600 });
  return doc.apiKeyOnce;
}

async function mapQuantity(
  env: RuntimeEnv,
  input: {
    readonly sourceId: string;
    readonly quantity: string;
    readonly resourceId: string;
    readonly operationId: string;
  },
): Promise<{ claimIds: string[]; proposalId: string }> {
  if (env.definitionDigest.length === 0) {
    throw new Error("ZOEN_DEFINITION_DIGEST is required to map");
  }
  const proposalId = `proposal.${sanitize(input.sourceId)}-${hash8(Buffer.from(input.operationId))}`;
  const proposed = await proposeAction(env, {
    kind: "action-propose",
    proposalId,
    operationId: input.operationId,
    actionId: "source.mapQuantity",
    resourceId: input.resourceId,
    quantity: input.quantity,
    unit: "each",
    scenarioId: "",
    inputs: [],
    dryRun: false,
  });
  if (proposed.exitCode !== 0) {
    throw new Error(proposed.stderr.trim() || proposed.stdout.trim());
  }
  const doc = JSON.parse(proposed.stdout) as {
    previewHash?: string;
    proposal?: { previewHash?: string };
  };
  const previewHash = doc.previewHash ?? doc.proposal?.previewHash;
  if (previewHash === undefined) {
    throw new Error(`propose missing previewHash ${proposed.stdout}`);
  }
  const committed = await commitAction(env, {
    kind: "action-commit",
    proposalId,
    operationId: input.operationId,
    previewHash,
  });
  if (committed.exitCode !== 0) {
    throw new Error(committed.stderr.trim() || committed.stdout.trim());
  }
  const receipt = JSON.parse(committed.stdout) as { claimIds?: string[]; recordIds?: string[] };
  const claimIds = receipt.claimIds ?? receipt.recordIds ?? [];
  return { claimIds, proposalId };
}

async function publishDefinition(env: RuntimeEnv, file: string): Promise<CommandResult> {
  const raw = (await readFile(file)).toString("utf8").trim();
  const bytes = Buffer.from(raw, "utf8");
  const digest = createHash("sha256").update(bytes).digest("hex");
  const status = await connectJson(env, "/zoen.definition.v1.DefinitionService/Publish", {
    tenantId: env.tenant,
    canonicalJson: bytes.toString("base64"),
    digest,
  });
  if (status.status !== 200) {
    return fail(1, `Publish ${status.status} ${status.text}`);
  }
  return ok({ published: true, digest, definition: status.json });
}

async function activateDefinition(
  env: RuntimeEnv,
  definitionId: string,
  digest: string,
): Promise<CommandResult> {
  const status = await connectJson(env, "/zoen.definition.v1.DefinitionService/ActivateRevision", {
    tenantId: env.tenant,
    definitionId,
    digest,
    expectNoActiveRevision: true,
  });
  if (status.status !== 200) {
    return fail(1, `ActivateRevision ${status.status} ${status.text}`);
  }
  return ok({ activated: true, digest, definitionId, activation: status.json });
}

async function createScenario(env: RuntimeEnv, name: string): Promise<CommandResult> {
  const status = await connectJson(env, "/zoen.world.v1.WorldService/CreateScenario", {
    tenantId: env.tenant,
    scenarioId: name,
  }, true);
  if (status.status !== 200) {
    return fail(1, `CreateScenario ${status.status} ${status.text}`);
  }
  return { exitCode: 0, stdout: `${status.text}\n`, stderr: "" };
}

async function applyScenario(env: RuntimeEnv, name: string): Promise<CommandResult> {
  const status = await connectJson(env, "/zoen.world.v1.WorldService/ApplyScenario", {
    tenantId: env.tenant,
    scenarioId: name,
  }, true);
  if (status.status !== 200) {
    return fail(1, `ApplyScenario ${status.status} ${status.text}`);
  }
  return { exitCode: 0, stdout: `${status.text}\n`, stderr: "" };
}

async function discardScenario(env: RuntimeEnv, name: string): Promise<CommandResult> {
  const status = await connectJson(env, "/zoen.world.v1.WorldService/DiscardScenario", {
    tenantId: env.tenant,
    scenarioId: name,
  }, true);
  if (status.status !== 200) {
    return fail(1, `DiscardScenario ${status.status} ${status.text}`);
  }
  return { exitCode: 0, stdout: `${status.text}\n`, stderr: "" };
}

async function worldQuery(
  env: RuntimeEnv,
  typeId: string,
  limit: number,
  scenarioId = "",
): Promise<CommandResult> {
  if (env.definitionDigest.length === 0) {
    return fail(2, "ZOEN_DEFINITION_DIGEST is required");
  }
  const status = await connectJson(env, "/zoen.world.v1.WorldService/SemanticQuery", {
    tenantId: env.tenant,
    definition: {
      definitionId: env.definitionId,
      revision: "1",
      digest: env.definitionDigest,
    },
    validAt: env.validAt,
    consistency: { strong: {} },
    byType: { typeId, limit },
    scenarioId,
  });
  if (status.status !== 200) {
    return fail(1, `SemanticQuery ${status.status} ${status.text}`);
  }
  return { exitCode: 0, stdout: `${status.text}\n`, stderr: "" };
}

async function proposeAction(
  env: RuntimeEnv,
  parsed: Extract<Parsed, { kind: "action-propose" }>,
): Promise<CommandResult> {
  if (parsed.proposalId.length === 0 || parsed.resourceId.length === 0) {
    return fail(2, "zoen action propose requires --proposal-id and --resource-id");
  }
  if (env.definitionDigest.length === 0) {
    return fail(2, "ZOEN_DEFINITION_DIGEST is required");
  }
  const inputs =
    parsed.inputs.length > 0
      ? parsed.inputs.map((input) => ({
          inputId: input.inputId,
          value: { textValue: input.value },
        }))
      : parsed.quantity === undefined
        ? []
        : [
            {
              inputId: "quantity",
              value: { quantityValue: { amount: parsed.quantity, unit: parsed.unit } },
            },
          ];
  const body = {
    proposalId: parsed.proposalId,
    operationId: parsed.operationId,
    definition: {
      definitionId: env.definitionId,
      revision: "1",
      digest: env.definitionDigest,
    },
    actionId: parsed.actionId,
    resourceId: parsed.resourceId,
    inputs,
    validAt: env.validAt,
    expiresAt: "2030-01-01T00:00:00Z",
    scenarioId: parsed.scenarioId,
  };
  if (parsed.dryRun) {
    return ok({ dryRun: true, propose: body });
  }
  const status = await connectJson(env, "/zoen.action.v1.ActionService/Propose", body, true);
  if (status.status !== 200) {
    return fail(1, `Propose ${status.status} ${status.text}`);
  }
  const doc = status.json as {
    proposal?: { previewHash?: string };
    previewHash?: string;
    decision?: unknown;
  };
  return ok({
    decision: doc.decision ?? null,
    previewHash: doc.proposal?.previewHash ?? doc.previewHash ?? null,
    proposal: doc.proposal ?? doc,
  });
}

async function commitAction(
  env: RuntimeEnv,
  parsed: Extract<Parsed, { kind: "action-commit" }>,
): Promise<CommandResult> {
  if (parsed.proposalId.length === 0 || parsed.operationId.length === 0 || parsed.previewHash.length === 0) {
    return fail(2, "zoen action commit requires --proposal-id --operation-id --preview-hash");
  }
  const status = await connectJson(
    env,
    "/zoen.action.v1.ActionService/Commit",
    {
      proposalId: parsed.proposalId,
      operationId: parsed.operationId,
      previewHash: parsed.previewHash,
    },
    true,
  );
  if (status.status !== 200) {
    return fail(1, `Commit ${status.status} ${status.text}`);
  }
  const doc = status.json as {
    receipt?: { recordIds?: string[] };
    recordIds?: string[];
    status?: unknown;
  };
  const claimIds = doc.receipt?.recordIds ?? doc.recordIds ?? [];
  return ok({
    status: doc.status ?? null,
    claimIds,
    receipt: doc.receipt ?? doc,
  });
}

async function connectJson(
  env: RuntimeEnv,
  path: string,
  body: unknown,
  tenantHeader = false,
): Promise<{ status: number; text: string; json: unknown }> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${env.bearer}`,
    "content-type": "application/json",
    "connect-protocol-version": "1",
  };
  if (tenantHeader) {
    headers["x-zoen-tenant"] = env.tenant;
  }
  const response = await fetch(`${env.zoend}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json: unknown = text;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: response.status, text, json };
}

async function readSource(env: RuntimeEnv, id: string): Promise<SourceInstance> {
  const path = join(env.sourceHome, "sources", `${id}.json`);
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as SourceInstance;
}

async function writeSource(env: RuntimeEnv, instance: SourceInstance): Promise<void> {
  const path = join(env.sourceHome, "sources", `${instance.id}.json`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(instance, null, 2)}\n`, { mode: 0o600 });
}

function unzipFirst(bytes: Buffer): Buffer | undefined {
  if (bytes.length < 30 || bytes.readUInt32LE(0) !== 0x04034b50) {
    return undefined;
  }
  const method = bytes.readUInt16LE(8);
  const compressed = bytes.readUInt32LE(18);
  const nameLen = bytes.readUInt16LE(26);
  const extraLen = bytes.readUInt16LE(28);
  const start = 30 + nameLen + extraLen;
  const end = start + compressed;
  if (end > bytes.length) {
    return undefined;
  }
  if (method !== 0) {
    return undefined;
  }
  return bytes.subarray(start, end);
}
