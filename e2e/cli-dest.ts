import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { writeScenarioArtifact } from "./host-env.js";

const scenario = "cli-dest";
const repositoryRoot = process.cwd();
const cargoTargetDir = (() => {
  const raw = process.env.CARGO_TARGET_DIR;
  if (raw === undefined || raw === "") {
    return path.join(repositoryRoot, "target");
  }
  return path.isAbsolute(raw) ? raw : path.join(repositoryRoot, raw);
})();
const zoenPath = path.join(cargoTargetDir, "debug", "zoen");

const assertions: Record<string, boolean> = {};
const mutantsKilled: string[] = [];

function record(name: string, observed: boolean): void {
  assert.ok(observed, name);
  assertions[name] = observed;
}

function killMutant(name: string): void {
  mutantsKilled.push(name);
}

type Run = {
  status: number | null;
  stderr: string;
  stdout: string;
};

function runZoen(
  args: readonly string[],
  options?: {
    env?: NodeJS.ProcessEnv;
    input?: string;
    timeoutMs?: number;
  },
): Run {
  const result = spawnSync(zoenPath, [...args], {
    encoding: "utf8",
    env: options?.env === undefined ? process.env : options.env,
    input: options?.input,
    timeout: options?.timeoutMs,
  });
  return {
    status: result.status,
    stderr: result.stderr ?? "",
    stdout: result.stdout ?? "",
  };
}

function cliEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ZOEN_BEARER: "x",
    ZOEN_DEFINITION_DIGEST: "dead",
    ZOEN_DEFINITION_ID: "inventory.definition",
    ZOEN_TENANT: "tenant.a",
    ZOEN_VALID_AT: "2026-01-15T00:00:00Z",
    ZOEN_ZOEND: "http://127.0.0.1:58080",
    ...extra,
  };
}

function listenHang(): Promise<{ close: () => void; port: number }> {
  return new Promise((resolve, reject) => {
    const server = createNetServer(() => undefined);
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("hang listener has no port"));
        return;
      }
      resolve({
        close: () => {
          server.close();
        },
        port: address.port,
      });
    });
  });
}

function listenHttp(
  status: number,
  body: string,
): Promise<{ close: () => void; port: number }> {
  return listenHttpCapture(status, body).then(({ close, port }) => ({ close, port }));
}

function listenHttpCapture(
  status: number,
  body: string,
): Promise<{ close: () => void; port: number; requestsPath: string }> {
  return new Promise((resolve, reject) => {
    const requestsPath = path.join(
      mkdtempSync(path.join(tmpdir(), "zoen-http-")),
      "requests.json",
    );
    writeFileSync(requestsPath, "[]\n");
    const script = `
      const fs = require("node:fs");
      const http = require("node:http");
      const status = ${status};
      const body = ${JSON.stringify(body)};
      const requestsPath = ${JSON.stringify(requestsPath)};
      const requests = [];
      const server = http.createServer((request, response) => {
        let raw = "";
        request.on("data", (chunk) => {
          raw += chunk;
        });
        request.on("end", () => {
          requests.push({ body: raw, path: request.url ?? "" });
          fs.writeFileSync(requestsPath, JSON.stringify(requests));
          response.writeHead(status, { "content-type": "application/json" });
          response.end(body);
        });
      });
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (address === null || typeof address === "string") {
          process.exit(1);
        }
        fs.writeSync(1, String(address.port));
      });
    `;
    const child = spawn(process.execPath, ["-e", script], {
      stdio: ["ignore", "pipe", "inherit"],
    });
    child.once("error", reject);
    child.stdout.once("data", (chunk: Buffer) => {
      const port = Number(chunk.toString());
      if (!Number.isInteger(port) || port < 1) {
        child.kill("SIGTERM");
        reject(new Error("http child has no port"));
        return;
      }
      resolve({
        close: () => {
          child.kill("SIGTERM");
        },
        port,
        requestsPath,
      });
    });
  });
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const readme = await readFile(path.join(repositoryRoot, "README.md"), "utf8");

  const helpRoot = runZoen(["--help"]);
  record("root_help_ok", helpRoot.status === 0);
  record(
    "root_help_no_args_is_help",
    helpRoot.stdout.includes("No args is help"),
  );
  record("root_help_has_examples", helpRoot.stdout.includes("Examples:"));
  record("root_help_names_ZOEN_BEARER", helpRoot.stdout.includes("ZOEN_BEARER"));
  record("root_help_names_ZOEN_TENANT", helpRoot.stdout.includes("ZOEN_TENANT"));
  record("root_help_names_ZOEN_ZOEND", helpRoot.stdout.includes("ZOEN_ZOEND"));
  record(
    "root_help_names_ZOEN_DEFINITION_DIGEST",
    helpRoot.stdout.includes("ZOEN_DEFINITION_DIGEST"),
  );
  record(
    "root_help_names_ZOEN_DEFINITION_ID",
    helpRoot.stdout.includes("ZOEN_DEFINITION_ID"),
  );
  record("root_help_names_ZOEN_VALID_AT", helpRoot.stdout.includes("ZOEN_VALID_AT"));
  record("root_help_no_world_source", !helpRoot.stdout.includes("world.source"));
  record(
    "root_help_query_has_type",
    helpRoot.stdout.includes("zoen world query --type inventory.Item"),
  );

  const helpQuery = runZoen(["world", "query", "--help"]);
  record("query_help_ok", helpQuery.status === 0);
  record("query_help_has_page_token", helpQuery.stdout.includes("--page-token"));
  record("query_help_has_fields", helpQuery.stdout.includes("--fields"));
  record(
    "query_help_page_token_example",
    helpQuery.stdout.includes("--page-token <nextPageToken>"),
  );

  const helpActivate = runZoen(["definition", "activate", "--help"]);
  record("activate_help_ok", helpActivate.status === 0);
  record(
    "activate_help_inventory_definition",
    helpActivate.stdout.includes("--definition-id inventory.definition"),
  );
  record(
    "activate_help_no_world_source",
    !helpActivate.stdout.includes("world.source"),
  );

  const helpPropose = runZoen(["action", "propose", "--help"]);
  record("propose_help_ok", helpPropose.status === 0);
  record("propose_help_has_examples", helpPropose.stdout.includes("Examples:"));
  record("propose_help_shows_quantity", helpPropose.stdout.includes("--quantity"));
  record("propose_help_shows_expires_at", helpPropose.stdout.includes("--expires-at"));
  record(
    "propose_help_no_map_quantity_default",
    !helpPropose.stdout.includes("source.mapQuantity"),
  );

  const helpCommit = runZoen(["action", "commit", "--help"]);
  record("commit_help_has_dry_run", helpCommit.stdout.includes("--dry-run"));
  record("commit_help_has_examples", helpCommit.stdout.includes("Examples:"));

  const helpLogin = runZoen(["auth", "login", "--help"]);
  record("login_help_ok", helpLogin.status === 0);
  record("login_help_has_examples", helpLogin.stdout.includes("Examples:"));
  record("login_help_has_email", helpLogin.stdout.includes("--email"));
  record("login_help_has_device", helpLogin.stdout.includes("--device"));
  record("login_help_has_wait", helpLogin.stdout.includes("--wait"));
  record("login_help_has_password_stdin", helpLogin.stdout.includes("--password-stdin"));
  record(
    "login_help_device_wait_example",
    helpLogin.stdout.includes("zoen auth login --device --wait"),
  );
  const loginHelpExamples = helpLogin.stdout.split("Examples:")[1] ?? "";
  const loginHelpDeviceIdx = loginHelpExamples.indexOf("zoen auth login --device");
  const loginHelpEmailIdx = loginHelpExamples.indexOf("zoen auth login --email");
  record(
    "login_help_device_before_email",
    loginHelpDeviceIdx >= 0 &&
      (loginHelpEmailIdx < 0 || loginHelpDeviceIdx < loginHelpEmailIdx),
  );
  record(
    "login_help_no_password_secret_argv",
    !helpLogin.stdout.includes("--password secret"),
  );

  const helpDiscover = runZoen(["action", "discover", "--help"]);
  record("discover_help_has_examples", helpDiscover.stdout.includes("Examples:"));
  const helpExplain = runZoen(["history", "explain", "--help"]);
  record("explain_help_has_examples", helpExplain.stdout.includes("Examples:"));

  const bareZoen = runZoen([]);
  record("bare_zoen_is_help", bareZoen.status === 0);
  record("bare_zoen_has_examples", bareZoen.stdout.includes("Examples:"));
  record(
    "bare_zoen_login_device_example",
    bareZoen.stdout.includes("zoen auth login --device"),
  );
  record(
    "bare_zoen_no_password_secret_argv",
    !bareZoen.stdout.includes("--password secret"),
  );
  killMutant("bare zoen starts serve");

  const missingDbEnv = { ...process.env };
  delete missingDbEnv.DATABASE_URL;
  const missingDb = runZoen(["serve"], { env: missingDbEnv });
  record("serve_missing_db_names_DATABASE_URL", missingDb.stderr.includes("DATABASE_URL"));
  record("serve_missing_db_not_NotPresent", !missingDb.stderr.includes("NotPresent"));
  killMutant("Error: NotPresent for missing DATABASE_URL");

  const isolateDryRun = runZoen(
    [
      "action",
      "propose",
      "--proposal-id",
      "p",
      "--action-id",
      "inventory.replenish",
      "--resource-id",
      "inventory.item.1",
      "--quantity",
      "1",
      "--expires-at",
      "2030-01-01T00:00:00Z",
      "--dry-run",
    ],
    { env: cliEnv({ ZOEN_ISOLATE: "1" }) },
  );
  record("isolate_propose_dry_run_ok", isolateDryRun.status === 0);
  record("isolate_propose_dry_run_json", isolateDryRun.stdout.includes('"dryRun":true'));
  record(
    "isolate_propose_dry_run_no_hardcoded_2030_without_flag",
    isolateDryRun.stdout.includes('"expiresAt":"2030-01-01T00:00:00Z"'),
  );
  killMutant("ZOEN_ISOLATE=1 denies propose --dry-run");

  const isolateCommit = runZoen(
    [
      "action",
      "commit",
      "--proposal-id",
      "p",
      "--operation-id",
      "p",
      "--preview-hash",
      "hash",
    ],
    { env: cliEnv({ ZOEN_ISOLATE: "1" }) },
  );
  record("isolate_commit_denied", isolateCommit.status === 1);
  record(
    "isolate_commit_names_commit",
    isolateCommit.stderr.includes("isolate cannot commit"),
  );

  const commitDryRun = runZoen(
    [
      "action",
      "commit",
      "--proposal-id",
      "p",
      "--operation-id",
      "p",
      "--preview-hash",
      "hash",
      "--dry-run",
    ],
    { env: cliEnv({ ZOEN_ISOLATE: "1" }) },
  );
  record("isolate_commit_dry_run_ok", commitDryRun.status === 0);
  record("isolate_commit_dry_run_json", commitDryRun.stdout.includes('"dryRun":true'));

  const missingActionId = runZoen(
    [
      "action",
      "propose",
      "--proposal-id",
      "p",
      "--resource-id",
      "inventory.item.1",
      "--quantity",
      "1",
      "--expires-at",
      "2030-01-01T00:00:00Z",
      "--dry-run",
    ],
    { env: cliEnv() },
  );
  record("missing_action_id_fails", missingActionId.status !== 0);
  record(
    "missing_action_id_not_map_quantity",
    !missingActionId.stdout.includes("source.mapQuantity"),
  );
  killMutant("--action-id defaults to source.mapQuantity");

  const inputQuantity = runZoen(
    [
      "action",
      "propose",
      "--proposal-id",
      "p",
      "--action-id",
      "inventory.replenish",
      "--resource-id",
      "inventory.item.1",
      "--input",
      "quantity=1",
      "--expires-at",
      "2030-01-01T00:00:00Z",
      "--dry-run",
    ],
    { env: cliEnv() },
  );
  record("input_quantity_fails", inputQuantity.status === 2);
  record("input_quantity_mentions_flag", inputQuantity.stderr.includes("--quantity"));
  record("input_quantity_not_textValue", !inputQuantity.stdout.includes("textValue"));
  killMutant("--input quantity always sends textValue");

  const publishStdin = runZoen(["definition", "publish", "--file", "-"], {
    env: cliEnv(),
    input: "{}",
  });
  record(
    "publish_stdin_not_missing_file",
    !publishStdin.stderr.includes("No such file or directory"),
  );
  killMutant("--file - looks for a file named -");

  const identityOnly = { ...cliEnv() };
  delete identityOnly.ZOEN_ZOEND;
  identityOnly.ZOEN_IDENTITY_BASE_URL = "http://127.0.0.1:58080";
  const identityAlias = runZoen(
    [
      "action",
      "propose",
      "--proposal-id",
      "p",
      "--action-id",
      "inventory.replenish",
      "--resource-id",
      "inventory.item.1",
      "--quantity",
      "1",
      "--expires-at",
      "2030-01-01T00:00:00Z",
      "--dry-run",
    ],
    { env: identityOnly },
  );
  record("identity_alias_denied", identityAlias.status !== 0);
  record("identity_alias_names_ZOEN_ZOEND", identityAlias.stderr.includes("ZOEN_ZOEND"));
  killMutant("ZOEN_IDENTITY_BASE_URL alias of ZOEN_ZOEND");

  const evidence = runZoen(["world", "evidence", "--type", "inventory.Item"], {
    env: cliEnv(),
  });
  record("world_evidence_not_query", evidence.status !== 0);
  record("world_evidence_unrecognized", evidence.stderr.includes("unrecognized"));
  killMutant("world evidence is an alias of world query");

  const loginMissing = runZoen(["auth", "login"]);
  record("login_missing_flags_fails", loginMissing.status === 2);
  record("login_missing_flags_example", loginMissing.stderr.includes("--email"));
  record(
    "login_missing_flags_leads_device",
    (loginMissing.stderr.split("\n").find((line) => line.includes("zoen auth login")) ??
      "").includes("--device"),
  );
  record(
    "login_missing_no_password_secret_argv",
    !loginMissing.stderr.includes("--password secret"),
  );
  record("login_not_this_slice", !loginMissing.stderr.includes("not this slice"));

  const missingQuantity = runZoen(
    [
      "action",
      "propose",
      "--proposal-id",
      "p",
      "--action-id",
      "inventory.replenish",
      "--resource-id",
      "inventory.item.1",
      "--expires-at",
      "2030-01-01T00:00:00Z",
      "--dry-run",
    ],
    { env: cliEnv() },
  );
  record("missing_quantity_fails", missingQuantity.status === 2);
  record("missing_quantity_example", missingQuantity.stderr.includes("--quantity"));
  record(
    "missing_quantity_not_empty_inputs",
    !missingQuantity.stdout.includes('"inputs":[]'),
  );
  killMutant("propose --dry-run with no --quantity and no --input succeeds");

  const missingExpiresAt = runZoen(
    [
      "action",
      "propose",
      "--proposal-id",
      "p",
      "--action-id",
      "inventory.replenish",
      "--resource-id",
      "inventory.item.1",
      "--quantity",
      "1",
      "--dry-run",
    ],
    { env: cliEnv() },
  );
  record("missing_expires_at_fails", missingExpiresAt.status === 2);
  record("missing_expires_at_names_flag", missingExpiresAt.stderr.includes("--expires-at"));
  record(
    "missing_expires_at_no_2030_body",
    !missingExpiresAt.stdout.includes("2030-01-01"),
  );
  killMutant("propose hardcodes expiresAt 2030-01-01");

  const missingValidAtEnv = cliEnv();
  delete missingValidAtEnv.ZOEN_VALID_AT;
  const missingValidAt = runZoen(["world", "query", "--type", "inventory.Item"], {
    env: missingValidAtEnv,
    timeoutMs: 5_000,
  });
  record("missing_valid_at_fails", missingValidAt.status !== 0);
  record("missing_valid_at_names_var", missingValidAt.stderr.includes("ZOEN_VALID_AT"));
  record(
    "missing_valid_at_export",
    missingValidAt.stderr.includes("export ZOEN_VALID_AT=2026-01-15T00:00:00Z"),
  );
  killMutant("ZOEN_VALID_AT defaults to 2026-01-15");

  const missingDefinitionIdEnv = cliEnv();
  delete missingDefinitionIdEnv.ZOEN_DEFINITION_ID;
  const missingDefinitionId = runZoen(["world", "query", "--type", "inventory.Item"], {
    env: missingDefinitionIdEnv,
    timeoutMs: 5_000,
  });
  record("missing_definition_id_fails", missingDefinitionId.status === 2);
  record(
    "missing_definition_id_names_var",
    missingDefinitionId.stderr.includes("ZOEN_DEFINITION_ID"),
  );
  record(
    "missing_definition_id_export",
    missingDefinitionId.stderr.includes(
      "export ZOEN_DEFINITION_ID=inventory.definition",
    ),
  );
  record(
    "missing_definition_id_not_world_source",
    !missingDefinitionId.stderr.includes("world.source") &&
      !missingDefinitionId.stdout.includes("world.source"),
  );
  killMutant("ZOEN_DEFINITION_ID defaults to world.source");

  const sourceHome = mkdtempSync(path.join(tmpdir(), "zoen-src-"));
  try {
    const missingSource = runZoen(
      ["source", "introduce", "rest.qa", "--path", "/x", "--dry-run"],
      { env: cliEnv({ ZOEN_SOURCE_HOME: sourceHome }) },
    );
    record("missing_source_exit_2", missingSource.status === 2);
    record(
      "missing_source_not_os_error",
      !missingSource.stderr.includes("os error 2") &&
        !missingSource.stderr.includes("No such file or directory"),
    );
    record(
      "missing_source_not_connected",
      missingSource.stderr.includes("source rest.qa is not connected"),
    );
    record(
      "missing_source_connect_example",
      missingSource.stderr.includes(
        "zoen source connect rest --id rest.qa --base",
      ),
    );
    killMutant("missing source instance is os error 2");

    const missingSync = runZoen(["source", "sync", "nosuch", "--dry-run"], {
      env: cliEnv({ ZOEN_SOURCE_HOME: sourceHome }),
    });
    record("missing_sync_exit_2", missingSync.status === 2);
    record(
      "missing_sync_not_connected",
      missingSync.stderr.includes("source nosuch is not connected"),
    );
    record(
      "missing_sync_connect_example",
      missingSync.stderr.includes("zoen source connect rest --id nosuch --base"),
    );

    const fetchable = await listenHttp(200, JSON.stringify({ quantity: "1" }));
    try {
      mkdirSync(path.join(sourceHome, "sources"), { recursive: true });
      writeFileSync(
        path.join(sourceHome, "sources", "rest.qa.json"),
        `${JSON.stringify({
          auth: { type: "none" },
          baseUrl: `http://127.0.0.1:${fetchable.port}`,
          id: "rest.qa",
          introduced: { path: "/x" },
          kind: "rest",
        })}\n`,
      );
      const isolateSync = runZoen(["source", "sync", "rest.qa"], {
        env: cliEnv({ ZOEN_ISOLATE: "1", ZOEN_SOURCE_HOME: sourceHome }),
        timeoutMs: 5_000,
      });
      record("isolate_sync_denied", isolateSync.status === 1);
      record(
        "isolate_sync_names_commit",
        isolateSync.stderr.includes("isolate cannot commit"),
      );
      const casDir = path.join(sourceHome, "cas");
      const casFiles = existsSync(casDir) ? readdirSync(casDir) : [];
      record("isolate_sync_no_cas", casFiles.length === 0);
      killMutant("isolate source sync writes CAS then fails");

      const isolateSyncDry = runZoen(["source", "sync", "rest.qa", "--dry-run"], {
        env: cliEnv({ ZOEN_ISOLATE: "1", ZOEN_SOURCE_HOME: sourceHome }),
        timeoutMs: 5_000,
      });
      record("isolate_sync_dry_run_ok", isolateSyncDry.status === 0);
      record(
        "isolate_sync_dry_run_json",
        isolateSyncDry.stdout.includes('"dryRun":true'),
      );
    } finally {
      fetchable.close();
    }
  } finally {
    rmSync(sourceHome, { force: true, recursive: true });
  }

  const unbound = await listenHttp(
    403,
    JSON.stringify({
      code: "permission_denied",
      message: "subject has no verified binding",
    }),
  );
  try {
    const unboundQuery = runZoen(["world", "query", "--type", "inventory.Item"], {
      env: cliEnv({ ZOEN_ZOEND: `http://127.0.0.1:${unbound.port}` }),
      timeoutMs: 5_000,
    });
    record("unbound_query_fails", unboundQuery.status === 1);
    const unboundFirst = unboundQuery.stderr.split("\n")[0] ?? "";
    let unboundJson: { code?: string; message?: string } = {};
    try {
      unboundJson = JSON.parse(unboundFirst) as {
        code?: string;
        message?: string;
      };
    } catch {
      unboundJson = {};
    }
    record(
      "unbound_query_json_code",
      unboundJson.code === "permission_denied",
    );
    record(
      "unbound_query_json_message",
      unboundJson.message === "subject has no verified binding",
    );
    record(
      "unbound_query_no_http_status_code",
      !unboundFirst.includes("403") && !unboundFirst.startsWith("SemanticQuery"),
    );
    record(
      "unbound_query_keeps_connect",
      unboundQuery.stderr.includes("subject has no verified binding"),
    );
    record(
      "unbound_query_names_membership",
      unboundQuery.stderr.includes("Active row"),
    );
    record("unbound_query_names_invite", unboundQuery.stderr.includes("invite"));
    record(
      "unbound_query_next_verb",
      unboundQuery.stderr.includes("zoen action propose") &&
        unboundQuery.stderr.includes("zoen.world.invite"),
    );
    killMutant("unbound SemanticQuery dumps Connect JSON only");
    killMutant("unbound fail mints HTTP status as code");
  } finally {
    unbound.close();
  }

  const fieldsMissing = runZoen(["world", "query", "--type", "inventory.Item", "--fields"], {
    env: cliEnv(),
  });
  record("query_fields_missing_fails", fieldsMissing.status === 2);
  record(
    "query_fields_missing_lists_allowed",
    fieldsMissing.stderr.includes("Specify one or more comma-separated fields for `--fields`:") &&
      fieldsMissing.stderr.includes("id") &&
      fieldsMissing.stderr.includes("type") &&
      fieldsMissing.stderr.includes("nextPageToken"),
  );
  const fieldsUnknown = runZoen(
    ["world", "query", "--type", "inventory.Item", "--fields", "definition"],
    { env: cliEnv() },
  );
  record("query_fields_unknown_fails", fieldsUnknown.status === 2);
  record(
    "query_fields_unknown_lists_allowed",
    fieldsUnknown.stderr.includes("Specify one or more comma-separated fields for `--fields`:"),
  );
  killMutant("world query --fields accepts unknown Connect keys");

  const queryBody = JSON.stringify({
    actualCommitSequence: "9",
    definition: {
      definitionId: "inventory.definition",
      digest: "dead",
      revision: "1",
    },
    knowledgeCut: "9",
    nextPageToken: "page-cursor-abc",
    validAt: "2026-01-15T00:00:00Z",
    values: [
      {
        dependencies: [{ claimId: "c1", entityId: "inventory.item.1" }],
        value: { entityRefValue: "inventory.item.1" },
      },
      {
        dependencies: [{ claimId: "c2", entityId: "inventory.item.2" }],
        value: { entityRefValue: "inventory.item.2" },
      },
    ],
  });
  const queryDoor = await listenHttpCapture(200, queryBody);
  try {
    const projected = runZoen(
      ["world", "query", "--type", "inventory.Item", "--limit", "2"],
      {
        env: cliEnv({ ZOEN_ZOEND: `http://127.0.0.1:${queryDoor.port}` }),
        timeoutMs: 5_000,
      },
    );
    record("query_projected_ok", projected.status === 0);
    let projectedJson: {
      items?: Array<{ id?: string; type?: string }>;
      nextPageToken?: string;
      definition?: unknown;
      values?: unknown;
    } = {};
    try {
      projectedJson = JSON.parse(projected.stdout.trim()) as typeof projectedJson;
    } catch {
      projectedJson = {};
    }
    record(
      "query_projected_items",
      Array.isArray(projectedJson.items) &&
        projectedJson.items.length === 2 &&
        projectedJson.items[0]?.id === "inventory.item.1" &&
        projectedJson.items[0]?.type === "inventory.Item" &&
        projectedJson.items[1]?.id === "inventory.item.2",
    );
    record(
      "query_projected_next_page_token",
      projectedJson.nextPageToken === "page-cursor-abc",
    );
    record(
      "query_projected_no_connect_blob",
      projectedJson.definition === undefined && projectedJson.values === undefined,
    );
    killMutant("world query dumps Connect SemanticQuery body");

    const paged = runZoen(
      [
        "world",
        "query",
        "--type",
        "inventory.Item",
        "--limit",
        "2",
        "--page-token",
        "page-cursor-abc",
      ],
      {
        env: cliEnv({ ZOEN_ZOEND: `http://127.0.0.1:${queryDoor.port}` }),
        timeoutMs: 5_000,
      },
    );
    record("query_page_token_ok", paged.status === 0);
    const requests = JSON.parse(await readFile(queryDoor.requestsPath, "utf8")) as Array<{
      body: string;
    }>;
    const pagedRequest = requests.at(-1)?.body ?? "";
    record(
      "query_page_token_round_trips",
      pagedRequest.includes('"pageToken":"page-cursor-abc"'),
    );
    killMutant("world query drops page_token cursor");
  } finally {
    queryDoor.close();
  }

  const deviceDoor = await listenHttp(
    200,
    JSON.stringify({
      device_code: "dev-code",
      expires_in: 1800,
      interval: 5,
      user_code: "ABCD1234",
      verification_uri: "/device",
    }),
  );
  try {
    const deviceLogin = runZoen(["auth", "login", "--device"], {
      env: { ...process.env, ZOEN_ZOEND: `http://127.0.0.1:${deviceDoor.port}` },
      timeoutMs: 5_000,
    });
    record("device_default_exits", deviceLogin.status === 0);
    record(
      "device_default_json_deviceCode",
      deviceLogin.stdout.includes('"deviceCode"'),
    );
    record(
      "device_default_json_userCode",
      deviceLogin.stdout.includes("ABCD1234"),
    );
    record(
      "device_default_json_verificationUri",
      deviceLogin.stdout.includes('"verificationUri"'),
    );
    record(
      "device_default_open_stderr",
      deviceLogin.stderr.includes("Open ") &&
        deviceLogin.stderr.includes("ABCD1234"),
    );
    record(
      "device_default_stdout_not_open",
      !deviceLogin.stdout.includes("Open "),
    );
    killMutant("zoen auth login --device polls until expires_in");
  } finally {
    deviceDoor.close();
  }

  const explainMissing = runZoen(["history", "explain"], { env: cliEnv() });
  record("explain_missing_target_fails", explainMissing.status === 2);
  record("explain_missing_target_example", explainMissing.stderr.includes("--claim-id"));
  record("explain_not_this_slice", !explainMissing.stderr.includes("not this slice"));

  const hang = await listenHang();
  try {
    const queryHang = runZoen(["world", "query", "--type", "inventory.Item"], {
      env: cliEnv({ ZOEN_ZOEND: `http://127.0.0.1:${hang.port}` }),
      timeoutMs: 20_000,
    });
    record("query_hang_exits", queryHang.status === 1);
    record("query_hang_names_ZOEN_ZOEND", queryHang.stderr.includes("ZOEN_ZOEND"));
    record("query_hang_says_timed_out", queryHang.stderr.includes("timed out"));
    killMutant("Connect call hangs until Ctrl-C");
  } finally {
    hang.close();
  }

  record(
    "readme_query_has_type",
    readme.includes("zoen world query --type"),
  );
  record("readme_has_no_world_evidence", !readme.includes("zoen world evidence"));
  record(
    "readme_isolate_names_source_sync",
    readme.includes("source sync"),
  );

  const artifactPath = await writeScenarioArtifact(repositoryRoot, scenario, {
    assertions,
    finishedAt: new Date().toISOString(),
    mutantsKilled,
    startedAt,
    zoenPath,
  });
  console.log(`cli-dest PASS artifact=${artifactPath}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
