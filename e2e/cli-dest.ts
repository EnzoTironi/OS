import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { runDeviceLoginJourney } from "./cli-dest/device-login.js";
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
    ZOEN_DEFINITION_REVISION: "1",
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

  const skill = runZoen(["--skill"]);
  record("skill_ok", skill.status === 0);
  record("skill_flags_over_prompts", skill.stdout.includes("flags over prompts"));
  record("skill_json_stdout", skill.stdout.includes("JSON on stdout"));
  record("skill_dry_run", skill.stdout.includes("--dry-run"));
  record("skill_names_ZOEN_ISOLATE", skill.stdout.includes("ZOEN_ISOLATE"));
  record("skill_file_dash", skill.stdout.includes("--file -"));
  record("skill_device_not_password_argv", skill.stdout.includes("--device"));
  record(
    "skill_no_password_secret_argv",
    !skill.stdout.includes("--password secret"),
  );
  record(
    "skill_no_bare_zoen_discovery",
    skill.stdout.includes("No bare zoen for discovery"),
  );
  record("skill_no_connect_proto", !skill.stdout.includes("protobuf"));
  killMutant("zoen --skill missing agent dest");

  const schemaPropose = runZoen(["schema", "action.propose"]);
  record("schema_propose_ok", schemaPropose.status === 0);
  let schemaProposeJson: {
    command?: unknown;
    requiredFlags?: unknown;
    examples?: unknown;
    stdout?: unknown;
  } = {};
  try {
    schemaProposeJson = JSON.parse(schemaPropose.stdout) as typeof schemaProposeJson;
  } catch {
    schemaProposeJson = {};
  }
  record(
    "schema_propose_command",
    schemaProposeJson.command === "action.propose",
  );
  record(
    "schema_propose_required_flags",
    Array.isArray(schemaProposeJson.requiredFlags) &&
      schemaProposeJson.requiredFlags.includes("--action-id") &&
      schemaProposeJson.requiredFlags.includes("--resource-id") &&
      schemaProposeJson.requiredFlags.includes("--expires-at"),
  );
  record(
    "schema_propose_examples",
    Array.isArray(schemaProposeJson.examples) &&
      schemaProposeJson.examples.some(
        (example) =>
          typeof example === "string" &&
          example.includes("zoen action propose") &&
          example.includes("--dry-run"),
      ),
  );
  record(
    "schema_propose_stdout_shape",
    schemaProposeJson.stdout !== undefined && schemaProposeJson.stdout !== null,
  );
  killMutant("zoen schema action.propose missing");

  const schemaUnknown = runZoen(["schema", "world.evidence"]);
  record("schema_unknown_fails", schemaUnknown.status === 2);
  record(
    "schema_unknown_teaches",
    schemaUnknown.stderr.includes("action.propose") ||
      schemaUnknown.stdout.includes("action.propose"),
  );
  killMutant("zoen schema accepts dest-wrong verbs");

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
  record("activate_help_has_dry_run", helpActivate.stdout.includes("--dry-run"));
  record(
    "activate_help_no_world_source",
    !helpActivate.stdout.includes("world.source"),
  );

  const helpApply = runZoen(["world", "scenario", "apply", "--help"]);
  record("apply_help_ok", helpApply.status === 0);
  record("apply_help_has_dry_run", helpApply.stdout.includes("--dry-run"));
  record("apply_help_has_examples", helpApply.stdout.includes("Examples:"));

  const helpDiscard = runZoen(["world", "scenario", "discard", "--help"]);
  record("discard_help_ok", helpDiscard.status === 0);
  record("discard_help_has_dry_run", helpDiscard.stdout.includes("--dry-run"));
  record("discard_help_has_examples", helpDiscard.stdout.includes("Examples:"));

  const helpPropose = runZoen(["action", "propose", "--help"]);
  record("propose_help_ok", helpPropose.status === 0);
  record("propose_help_has_examples", helpPropose.stdout.includes("Examples:"));
  record("propose_help_shows_quantity", helpPropose.stdout.includes("--quantity"));
  record("propose_help_shows_expires_at", helpPropose.stdout.includes("--expires-at"));
  record(
    "propose_help_shows_idempotency_key",
    helpPropose.stdout.includes("--idempotency-key"),
  );
  record(
    "propose_help_example_has_idempotency_key",
    helpPropose.stdout.includes("zoen action propose --idempotency-key"),
  );
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
  record("login_help_has_no_wait", !helpLogin.stdout.includes("--wait"));
  record("login_help_has_password_stdin", helpLogin.stdout.includes("--password-stdin"));
  record(
    "login_help_device_poll_example",
    helpLogin.stdout.includes("zoen auth login --device"),
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

  const helpOauth2 = runZoen(["source", "connect", "oauth2", "--help"]);
  record("oauth2_help_ok", helpOauth2.status === 0);
  record(
    "oauth2_help_has_client_secret_stdin",
    helpOauth2.stdout.includes("--client-secret-stdin"),
  );
  record(
    "oauth2_help_names_ZOEN_SOURCE_CLIENT_SECRET",
    helpOauth2.stdout.includes("ZOEN_SOURCE_CLIENT_SECRET"),
  );
  const oauth2HelpExamples = helpOauth2.stdout.split("Examples:")[1] ?? "";
  record(
    "oauth2_help_examples_no_secret_argv",
    !oauth2HelpExamples.includes("--client-secret "),
  );

  const helpGoogle = runZoen(["source", "connect", "google", "--help"]);
  record("google_help_ok", helpGoogle.status === 0);
  record("google_help_has_token_stdin", helpGoogle.stdout.includes("--token-stdin"));
  record(
    "google_help_names_ZOEN_SOURCE_TOKEN",
    helpGoogle.stdout.includes("ZOEN_SOURCE_TOKEN"),
  );
  const googleHelpExamples = helpGoogle.stdout.split("Examples:")[1] ?? "";
  record(
    "google_help_examples_no_token_argv",
    !googleHelpExamples.includes("--token "),
  );
  record("google_help_examples_no_ya29", !googleHelpExamples.includes("ya29"));

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
      "--idempotency-key",
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
  record(
    "isolate_propose_idempotency_key_is_proposal_id",
    isolateDryRun.stdout.includes('"proposalId":"p"'),
  );
  killMutant("ZOEN_ISOLATE=1 denies propose --dry-run");

  const emptyKeyUsesProposalId = runZoen(
    [
      "action",
      "propose",
      "--proposal-id",
      "proposal.from.flag",
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
  record("empty_key_uses_proposal_id", emptyKeyUsesProposalId.status === 0);
  record(
    "empty_key_proposal_id_body",
    emptyKeyUsesProposalId.stdout.includes('"proposalId":"proposal.from.flag"'),
  );
  record(
    "empty_key_no_random_uuid",
    !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(
      emptyKeyUsesProposalId.stdout,
    ),
  );
  killMutant("empty --idempotency-key invents a UUID");

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

  const isolateActivate = runZoen(
    [
      "definition",
      "activate",
      "--definition-id",
      "inventory.definition",
      "--digest",
      "deadbeef",
    ],
    { env: cliEnv({ ZOEN_ISOLATE: "1" }) },
  );
  record("isolate_activate_denied", isolateActivate.status === 1);
  record(
    "isolate_activate_names_activate",
    isolateActivate.stderr.includes("isolate cannot activate"),
  );
  record(
    "isolate_activate_no_zoend",
    !isolateActivate.stderr.includes("ActivateRevision"),
  );

  const activateDryRun = runZoen(
    [
      "definition",
      "activate",
      "--definition-id",
      "inventory.definition",
      "--digest",
      "deadbeef",
      "--dry-run",
    ],
    { env: cliEnv({ ZOEN_ISOLATE: "1" }) },
  );
  record("isolate_activate_dry_run_ok", activateDryRun.status === 0);
  record(
    "isolate_activate_dry_run_json",
    activateDryRun.stdout.includes('"dryRun":true'),
  );
  record(
    "isolate_activate_dry_run_body",
    activateDryRun.stdout.includes('"definitionId":"inventory.definition"') &&
      activateDryRun.stdout.includes('"digest":"deadbeef"'),
  );

  const isolateApply = runZoen(["world", "scenario", "apply", "--name", "draft"], {
    env: cliEnv({ ZOEN_ISOLATE: "1" }),
  });
  record("isolate_apply_denied", isolateApply.status === 1);
  record(
    "isolate_apply_names_apply",
    isolateApply.stderr.includes("isolate cannot apply"),
  );

  const applyDryRun = runZoen(
    ["world", "scenario", "apply", "--name", "draft", "--dry-run"],
    { env: cliEnv({ ZOEN_ISOLATE: "1" }) },
  );
  record("isolate_apply_dry_run_ok", applyDryRun.status === 0);
  record("isolate_apply_dry_run_json", applyDryRun.stdout.includes('"dryRun":true'));
  record(
    "isolate_apply_dry_run_body",
    applyDryRun.stdout.includes('"scenarioId":"draft"'),
  );

  const isolateDiscard = runZoen(
    ["world", "scenario", "discard", "--name", "draft"],
    { env: cliEnv({ ZOEN_ISOLATE: "1" }) },
  );
  record("isolate_discard_denied", isolateDiscard.status === 1);
  record(
    "isolate_discard_names_discard",
    isolateDiscard.stderr.includes("isolate cannot discard"),
  );
  record(
    "isolate_discard_no_zoend",
    !isolateDiscard.stderr.includes("DiscardScenario"),
  );

  const discardDryRun = runZoen(
    ["world", "scenario", "discard", "--name", "draft", "--dry-run"],
    { env: cliEnv({ ZOEN_ISOLATE: "1" }) },
  );
  record("isolate_discard_dry_run_ok", discardDryRun.status === 0);
  record(
    "isolate_discard_dry_run_json",
    discardDryRun.stdout.includes('"dryRun":true'),
  );
  record(
    "isolate_discard_dry_run_body",
    discardDryRun.stdout.includes('"scenarioId":"draft"'),
  );
  killMutant("isolate activates or discards without --dry-run");

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

  const proposeHelp = runZoen(["action", "propose", "--help"]);
  record("propose_help_input_file_example", proposeHelp.stdout.includes("--input-file -"));

  const inputFileStdin = runZoen(
    [
      "action",
      "propose",
      "--proposal-id",
      "p",
      "--action-id",
      "world.stamp",
      "--resource-id",
      "world.note.1",
      "--input-file",
      "-",
      "--expires-at",
      "2030-01-01T00:00:00Z",
      "--dry-run",
    ],
    {
      env: cliEnv(),
      input: JSON.stringify([{ inputId: "text", value: { textValue: "hello" } }]),
    },
  );
  record("input_file_stdin_ok", inputFileStdin.status === 0);
  record("input_file_stdin_textValue", inputFileStdin.stdout.includes('"textValue":"hello"'));
  record(
    "input_file_stdin_not_missing_file",
    !inputFileStdin.stderr.includes("No such file or directory"),
  );
  killMutant("--input-file - looks for a file named -");

  const inputFileQuantity = runZoen(
    [
      "action",
      "propose",
      "--proposal-id",
      "p",
      "--action-id",
      "inventory.replenish",
      "--resource-id",
      "inventory.item.1",
      "--input-file",
      "-",
      "--expires-at",
      "2030-01-01T00:00:00Z",
      "--dry-run",
    ],
    {
      env: cliEnv(),
      input: JSON.stringify([
        {
          inputId: "quantity",
          value: { quantityValue: { amount: "2", unit: "kg" } },
        },
      ]),
    },
  );
  record("input_file_quantity_ok", inputFileQuantity.status === 0);
  record(
    "input_file_quantityValue",
    inputFileQuantity.stdout.includes('"quantityValue"') &&
      inputFileQuantity.stdout.includes('"amount":"2"'),
  );
  record("input_file_quantity_not_textValue", !inputFileQuantity.stdout.includes("textValue"));
  killMutant("--input-file quantityValue forced to textValue");

  const missingInputFile = path.join(tmpdir(), `zoen-input-file-missing-${process.pid}.json`);
  const inputFileMissing = runZoen(
    [
      "action",
      "propose",
      "--proposal-id",
      "p",
      "--action-id",
      "world.stamp",
      "--resource-id",
      "world.note.1",
      "--input-file",
      missingInputFile,
      "--expires-at",
      "2030-01-01T00:00:00Z",
      "--dry-run",
    ],
    { env: cliEnv() },
  );
  record("input_file_missing_exit_2", inputFileMissing.status === 2);
  record("input_file_missing_stamp", inputFileMissing.stderr.includes("--input"));
  killMutant("missing --input-file exits 0");

  const inputFileInvalid = runZoen(
    [
      "action",
      "propose",
      "--proposal-id",
      "p",
      "--action-id",
      "world.stamp",
      "--resource-id",
      "world.note.1",
      "--input-file",
      "-",
      "--expires-at",
      "2030-01-01T00:00:00Z",
      "--dry-run",
    ],
    { env: cliEnv(), input: "not-json{" },
  );
  record("input_file_invalid_exit_2", inputFileInvalid.status === 2);
  record("input_file_invalid_stamp", inputFileInvalid.stderr.includes("--input"));
  killMutant("invalid --input-file JSON exits 0");

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

    const connectOnce = runZoen(
      [
        "source",
        "connect",
        "rest",
        "--idempotency-key",
        "rest.qa",
        "--base",
        "https://api.example.com",
      ],
      { env: cliEnv({ ZOEN_SOURCE_HOME: sourceHome }) },
    );
    record("connect_idempotency_key_ok", connectOnce.status === 0);
    record("connect_idempotency_key_json", connectOnce.stdout.includes('"connected":"rest.qa"'));
    const sourcePath = path.join(sourceHome, "sources", "rest.qa.json");
    const firstRaw = readFileSync(sourcePath, "utf8");
    const firstDoc = JSON.parse(firstRaw) as {
      introduced?: { path?: string };
      cursor?: string;
    };
    firstDoc.introduced = { path: "/x" };
    firstDoc.cursor = "c1";
    writeFileSync(sourcePath, `${JSON.stringify(firstDoc, null, 2)}\n`);
    const connectRetry = runZoen(
      [
        "source",
        "connect",
        "rest",
        "--idempotency-key",
        "rest.qa",
        "--base",
        "https://api.example.com",
      ],
      { env: cliEnv({ ZOEN_SOURCE_HOME: sourceHome }) },
    );
    record("connect_retry_ok", connectRetry.status === 0);
    record("connect_retry_same_receipt", connectRetry.stdout.includes('"connected":"rest.qa"'));
    const afterRetry = JSON.parse(readFileSync(sourcePath, "utf8")) as {
      introduced?: { path?: string };
      cursor?: string;
    };
    record(
      "connect_retry_preserves_introduced",
      afterRetry.introduced?.path === "/x" && afterRetry.cursor === "c1",
    );
    killMutant("source connect retry truncates introduced state");

    const oauth2MissingEnv = cliEnv({ ZOEN_SOURCE_HOME: sourceHome });
    delete oauth2MissingEnv.ZOEN_SOURCE_CLIENT_SECRET;
    const oauth2Missing = runZoen(
      [
        "source",
        "connect",
        "oauth2",
        "--idempotency-key",
        "oauth2.miss",
        "--token-url",
        "https://auth.example.com/token",
        "--client-id",
        "client",
      ],
      { env: oauth2MissingEnv },
    );
    record("oauth2_missing_secret_exit_2", oauth2Missing.status === 2);
    record(
      "oauth2_missing_secret_names_env",
      oauth2Missing.stderr.includes("ZOEN_SOURCE_CLIENT_SECRET"),
    );
    record(
      "oauth2_missing_secret_not_network",
      !oauth2Missing.stderr.includes("error sending request") &&
        !oauth2Missing.stderr.includes('"code":"not_connected"'),
    );
    killMutant("oauth2 connect proceeds with empty client secret");

    const oauth2Token = await listenHttp(
      200,
      JSON.stringify({ access_token: "tok.oauth2", token_type: "Bearer", expires_in: 3600 }),
    );
    try {
      const oauth2Env = cliEnv({
        ZOEN_SOURCE_HOME: sourceHome,
        ZOEN_SOURCE_CLIENT_SECRET: "from-env-secret",
      });
      const oauth2Ok = runZoen(
        [
          "source",
          "connect",
          "oauth2",
          "--idempotency-key",
          "oauth2.env",
          "--token-url",
          `http://127.0.0.1:${oauth2Token.port}/token`,
          "--client-id",
          "client",
        ],
        { env: oauth2Env },
      );
      record("oauth2_env_secret_ok", oauth2Ok.status === 0);
      record(
        "oauth2_env_secret_receipt",
        oauth2Ok.stdout.includes('"connected":"oauth2.env"'),
      );
      record(
        "oauth2_env_secret_not_on_stdout",
        !oauth2Ok.stdout.includes("from-env-secret") &&
          !oauth2Ok.stdout.includes("tok.oauth2"),
      );
      record(
        "oauth2_env_secret_not_on_stderr",
        !oauth2Ok.stderr.includes("from-env-secret"),
      );
    } finally {
      oauth2Token.close();
    }

    const googleDoor = runZoen(
      [
        "source",
        "connect",
        "google",
        "--idempotency-key",
        "google.door",
        "--profile",
        "work",
        "--use-door",
      ],
      { env: cliEnv({ ZOEN_SOURCE_HOME: sourceHome }) },
    );
    record("google_use_door_exit_2", googleDoor.status === 2);
    record(
      "google_use_door_not_ingest",
      googleDoor.stderr.includes("door tokens are not ingest authority"),
    );

    const googleTokenEnv = cliEnv({
      ZOEN_SOURCE_HOME: sourceHome,
      ZOEN_SOURCE_TOKEN: "ya29.from-env",
    });
    const googleOk = runZoen(
      [
        "source",
        "connect",
        "google",
        "--idempotency-key",
        "google.env",
        "--profile",
        "work",
        "--base",
        "https://stand-in.example",
      ],
      { env: googleTokenEnv },
    );
    record("google_env_token_ok", googleOk.status === 0);
    record(
      "google_env_token_receipt",
      googleOk.stdout.includes('"connected":"google.env"'),
    );
    record(
      "google_env_token_not_on_stdout",
      !googleOk.stdout.includes("ya29.from-env"),
    );
    const googlePath = path.join(sourceHome, "sources", "google.env.json");
    const googleDoc = JSON.parse(readFileSync(googlePath, "utf8")) as {
      auth?: { type?: string; value?: string };
    };
    record(
      "google_env_token_stored_as_apikey",
      googleDoc.auth?.type === "apikey" &&
        googleDoc.auth?.value === "Bearer ya29.from-env",
    );
    killMutant("google token stays on argv or prints on stdout");

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

  await runDeviceLoginJourney(zoenPath, { killMutant, record });

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
