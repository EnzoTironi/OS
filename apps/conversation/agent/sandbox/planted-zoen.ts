import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { HostCredential } from "./credentials";

export const ISOLATE_COMMIT_DENY = "isolate cannot commit";
export const ISOLATE_SPEAK_DENY = "isolate cannot speak";

const HELP = `zoen world query --type TYPE
zoen definition publish --file FILE
zoen source connect rest --id ID --base URL
zoen source connect google --profile drive [--base URL]
zoen source connect mcp --id ID --url URL
zoen source introduce ID --folder NAME | --path PATH
zoen source sync ID
`;

export type PlantedZoenResult = {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
};

export type ParsedZoen =
  | { readonly kind: "world-query"; readonly typeId: string; readonly limit: number }
  | { readonly kind: "denied-commit" }
  | { readonly kind: "denied-speak" }
  | { readonly kind: "help" }
  | { readonly kind: "invalid"; readonly message: string }
  | { readonly kind: "definition-publish"; readonly file: string }
  | { readonly kind: "source-connect"; readonly args: readonly string[] }
  | { readonly kind: "source-introduce"; readonly args: readonly string[] }
  | { readonly kind: "source-sync"; readonly id: string };

export function isZoenArgv(argv: readonly string[]): boolean {
  const first = argv[0];
  if (first === undefined) {
    return false;
  }
  if (first === "zoen") {
    return true;
  }
  return first === "/workspace/bin/zoen" || first.endsWith("/bin/zoen");
}

export function parseZoenArgv(argv: readonly string[]): ParsedZoen {
  const rest = isZoenArgv(argv) ? argv.slice(1) : argv;
  if (rest.length === 0 || rest[0] === "help" || rest[0] === "--help") {
    return { kind: "help" };
  }
  const noun = rest[0];
  const verb = rest[1];
  if (noun === "speak" || noun === "say" || verb === "speak") {
    return { kind: "denied-speak" };
  }
  if (noun === "action" && verb === "commit") {
    return { kind: "denied-commit" };
  }
  if (noun === "commit") {
    return { kind: "denied-commit" };
  }
  if (noun === "world" && verb === "query") {
    let typeId = "";
    let limit = 10;
    for (let i = 2; i < rest.length; i += 1) {
      const flag = rest[i];
      const value = rest[i + 1];
      if (flag === "--type" && value !== undefined) {
        typeId = value;
        i += 1;
      } else if (flag === "--limit" && value !== undefined) {
        limit = Number(value);
        i += 1;
      }
    }
    if (typeId.length === 0) {
      return { kind: "invalid", message: "zoen world query requires --type" };
    }
    return { kind: "world-query", typeId, limit };
  }
  if (noun === "definition" && verb === "publish") {
    const file = flagValue(rest, "--file");
    if (file === undefined) {
      return { kind: "invalid", message: "zoen definition publish requires --file" };
    }
    return { kind: "definition-publish", file };
  }
  if (noun === "source" && verb === "connect") {
    return { kind: "source-connect", args: rest.slice(2) };
  }
  if (noun === "source" && verb === "introduce") {
    return { kind: "source-introduce", args: rest.slice(2) };
  }
  if (noun === "source" && verb === "sync") {
    const id = rest[2];
    if (id === undefined || id.startsWith("-")) {
      return { kind: "invalid", message: "zoen source sync requires a source id" };
    }
    return { kind: "source-sync", id };
  }
  return { kind: "invalid", message: `unknown zoen verb: ${rest.join(" ")}` };
}

export async function runPlantedZoen(input: {
  readonly zoendBaseUrl: string;
  readonly credential: HostCredential | undefined;
  readonly argv: readonly string[];
  readonly workspace?: string;
}): Promise<PlantedZoenResult> {
  const parsed = parseZoenArgv(input.argv);
  if (parsed.kind === "denied-commit") {
    return { exitCode: 1, stdout: "", stderr: `${ISOLATE_COMMIT_DENY}\n` };
  }
  if (parsed.kind === "denied-speak") {
    return { exitCode: 1, stdout: "", stderr: `${ISOLATE_SPEAK_DENY}\n` };
  }
  if (parsed.kind === "help") {
    return { exitCode: 0, stdout: HELP, stderr: "" };
  }
  if (parsed.kind === "invalid") {
    return { exitCode: 2, stdout: "", stderr: `${parsed.message}\n` };
  }
  if (parsed.kind === "source-sync") {
    return { exitCode: 1, stdout: "", stderr: `${ISOLATE_COMMIT_DENY}\n` };
  }
  if (input.credential === undefined) {
    return { exitCode: 1, stdout: "", stderr: "precisa de membership\n" };
  }
  if (parsed.kind === "world-query") {
    return semanticQuery({
      zoendBaseUrl: input.zoendBaseUrl,
      credential: input.credential,
      typeId: parsed.typeId,
      limit: parsed.limit,
    });
  }
  if (parsed.kind === "definition-publish") {
    return publishFile({
      zoendBaseUrl: input.zoendBaseUrl,
      credential: input.credential,
      workspace: input.workspace,
      file: parsed.file,
    });
  }
  if (parsed.kind === "source-connect" || parsed.kind === "source-introduce") {
    if (input.workspace === undefined) {
      return { exitCode: 1, stdout: "", stderr: "source config needs a membership workbench\n" };
    }
    return writeSourceConfig(input.workspace, parsed);
  }
  return { exitCode: 2, stdout: "", stderr: "unknown zoen verb\n" };
}

async function writeSourceConfig(
  workspace: string,
  parsed: Extract<ParsedZoen, { kind: "source-connect" | "source-introduce" }>,
): Promise<PlantedZoenResult> {
  const home = join(workspace, ".zoen", "sources");
  await mkdir(home, { recursive: true });
  if (parsed.kind === "source-connect") {
    const flags = flagMap(parsed.args);
    const kind = parsed.args[0];
    if (kind === "google" && flags.get("use-door") !== undefined) {
      return { exitCode: 2, stdout: "", stderr: "door tokens are not ingest authority\n" };
    }
    const id = flags.get("id") ?? flags.get("profile") ?? kind ?? "source";
    const instance = {
      id,
      kind,
      profile: flags.get("profile") ?? null,
      oauthApp: kind === "google" ? "zoen" : null,
      baseUrl: flags.get("base") ?? null,
      url: flags.get("url") ?? null,
      doorTokenStored: false,
    };
    await writeFile(join(home, `${id}.json`), `${JSON.stringify(instance)}\n`);
    return { exitCode: 0, stdout: `${JSON.stringify({ connected: id, kind, doorTokenStored: false })}\n`, stderr: "" };
  }
  const id = parsed.args[0];
  if (id === undefined || id.startsWith("-")) {
    return { exitCode: 2, stdout: "", stderr: "zoen source introduce requires a source id\n" };
  }
  const flags = flagMap(parsed.args);
  const folder = flags.get("folder");
  const path = flags.get("path");
  if (folder === undefined && path === undefined) {
    return { exitCode: 2, stdout: "", stderr: "introduce a folder, not the account\n" };
  }
  if (folder === "My Drive" || folder === "account") {
    return { exitCode: 2, stdout: "", stderr: "introduce a folder, not the account\n" };
  }
  const file = join(home, `${id}.json`);
  let current: Record<string, unknown> = { id };
  try {
    current = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
  } catch {
    current = { id };
  }
  current.introduced = { folder: folder ?? null, path: path ?? null };
  await writeFile(file, `${JSON.stringify(current)}\n`);
  return { exitCode: 0, stdout: `${JSON.stringify({ introduced: id, folder: folder ?? null, path: path ?? null })}\n`, stderr: "" };
}

async function publishFile(input: {
  readonly zoendBaseUrl: string;
  readonly credential: HostCredential;
  readonly workspace?: string;
  readonly file: string;
}): Promise<PlantedZoenResult> {
  const absolute =
    input.file.startsWith("/") || input.workspace === undefined
      ? input.file
      : join(input.workspace, input.file.replace(/^\/workspace\//u, ""));
  const raw = (await readFile(absolute)).toString("utf8").trim();
  const digest = createHash("sha256").update(raw).digest("hex");
  const url = `${input.zoendBaseUrl.replace(/\/+$/u, "")}/zoen.definition.v1.DefinitionService/Publish`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.credential.doorToken}`,
      "content-type": "application/json",
      "connect-protocol-version": "1",
    },
    body: JSON.stringify({
      tenantId: input.credential.tenantId,
      canonicalJson: Buffer.from(raw, "utf8").toString("base64"),
      digest,
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    return { exitCode: 1, stdout: "", stderr: `Publish ${response.status} ${text}\n` };
  }
  return { exitCode: 0, stdout: `${text}\n`, stderr: "" };
}

async function semanticQuery(input: {
  readonly zoendBaseUrl: string;
  readonly credential: HostCredential;
  readonly typeId: string;
  readonly limit: number;
}): Promise<PlantedZoenResult> {
  const url = `${input.zoendBaseUrl.replace(/\/+$/u, "")}/zoen.world.v1.WorldService/SemanticQuery`;
  const body = JSON.stringify({
    tenantId: input.credential.tenantId,
    definition: {
      definitionId: input.credential.definitionId,
      revision: "1",
      digest: input.credential.definitionDigest,
    },
    validAt: input.credential.validAt,
    consistency: { strong: {} },
    byType: { typeId: input.typeId, limit: input.limit },
  });
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.credential.doorToken}`,
      "content-type": "application/json",
      "connect-protocol-version": "1",
    },
    body,
  });
  const text = await response.text();
  if (!response.ok) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `zoend SemanticQuery ${response.status} ${text}\n`,
    };
  }
  return { exitCode: 0, stdout: `${text}\n`, stderr: "" };
}

export function splitCommand(command: string): string[] {
  return command.trim().split(/\s+/u).filter((part) => part.length > 0);
}

function flagValue(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) {
    return undefined;
  }
  return args[index + 1];
}

function flagMap(args: readonly string[]): Map<string, string> {
  const flags = new Map<string, string>();
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === undefined || !arg.startsWith("--")) {
      continue;
    }
    const next = args[i + 1];
    if (next === undefined || next.startsWith("--")) {
      flags.set(arg.slice(2), "1");
      continue;
    }
    flags.set(arg.slice(2), next);
    i += 1;
  }
  return flags;
}
