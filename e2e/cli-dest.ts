import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { readFile } from "node:fs/promises";
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
    ZOEN_TENANT: "tenant.a",
    ZOEN_ZOEND: "http://127.0.0.1:58080",
    ...extra,
  };
}

function listenHang(): Promise<{ close: () => void; port: number }> {
  return new Promise((resolve, reject) => {
    const server = createServer(() => undefined);
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

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const readme = await readFile(path.join(repositoryRoot, "README.md"), "utf8");

  const helpRoot = runZoen(["--help"]);
  record("root_help_ok", helpRoot.status === 0);
  record("root_help_has_examples", helpRoot.stdout.includes("Examples:"));
  record("root_help_names_ZOEN_BEARER", helpRoot.stdout.includes("ZOEN_BEARER"));
  record("root_help_names_ZOEN_TENANT", helpRoot.stdout.includes("ZOEN_TENANT"));
  record("root_help_names_ZOEN_ZOEND", helpRoot.stdout.includes("ZOEN_ZOEND"));
  record(
    "root_help_names_ZOEN_DEFINITION_DIGEST",
    helpRoot.stdout.includes("ZOEN_DEFINITION_DIGEST"),
  );
  record(
    "root_help_query_has_type",
    helpRoot.stdout.includes("zoen world query --type inventory.Item"),
  );

  const helpPropose = runZoen(["action", "propose", "--help"]);
  record("propose_help_ok", helpPropose.status === 0);
  record("propose_help_has_examples", helpPropose.stdout.includes("Examples:"));
  record("propose_help_shows_quantity", helpPropose.stdout.includes("--quantity"));
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

  const helpDiscover = runZoen(["action", "discover", "--help"]);
  record("discover_help_has_examples", helpDiscover.stdout.includes("Examples:"));
  const helpExplain = runZoen(["history", "explain", "--help"]);
  record("explain_help_has_examples", helpExplain.stdout.includes("Examples:"));

  const missingDbEnv = { ...process.env };
  delete missingDbEnv.DATABASE_URL;
  const missingDb = runZoen([], { env: missingDbEnv });
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
      "--dry-run",
    ],
    { env: cliEnv({ ZOEN_ISOLATE: "1" }) },
  );
  record("isolate_propose_dry_run_ok", isolateDryRun.status === 0);
  record("isolate_propose_dry_run_json", isolateDryRun.stdout.includes('"dryRun":true'));
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
  record("login_not_this_slice", !loginMissing.stderr.includes("not this slice"));

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
