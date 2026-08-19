import assert from "node:assert/strict";
import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import {
  Code,
  ConnectError,
  createClient,
  type Client,
  type Interceptor,
} from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import { Client as PostgresClient } from "pg";
import { z } from "zod";
import { DefinitionService } from "../packages/sdk/src/gen/zoen/definition/v1/definition_pb.js";

const repositoryRoot = process.cwd();
const fixtureDirectory = path.join(
  repositoryRoot,
  "packages",
  "ontology",
  "fixtures",
);
const compilerPath = path.join(
  repositoryRoot,
  "dist",
  "packages",
  "ontology",
  "src",
  "cli.js",
);
const serverPath = path.join(repositoryRoot, "target", "debug", "zoend");
const applicationDatabaseUrl =
  "postgres://zoen_app:zoen_app@127.0.0.1:55432/zoen";
const adminDatabaseUrl =
  "postgres://postgres:postgres@127.0.0.1:55432/zoen";
const baseUrl = "http://127.0.0.1:58080";
const tenantA = "tenant.a";
const tenantB = "tenant.b";
const tokenA = "definition-session-a";
const tokenB = "definition-session-b";

const compiledDefinitionSchema = z
  .object({
    canonicalJson: z.string(),
    definition: z
      .object({
        definitionId: z.string(),
        revision: z.number().int().positive(),
      })
      .passthrough(),
    digest: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

type CompiledDefinition = z.infer<typeof compiledDefinitionSchema>;
type DefinitionClient = Client<typeof DefinitionService>;

interface ServerProcess {
  child: ChildProcessWithoutNullStreams;
  output: string[];
}

const assertions: Record<string, boolean> = {};

function recordAssertion(name: string): void {
  assertions[name] = true;
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const sourcePath = path.join(fixtureDirectory, "inventory.zoen.ts");
  const reorderedPath = path.join(
    fixtureDirectory,
    "inventory-reordered.zoen.ts",
  );
  const expectedCanonical = (
    await readFile(
      path.join(fixtureDirectory, "inventory.canonical.json"),
      "utf8",
    )
  ).trimEnd();
  const expectedDigest = (
    await readFile(path.join(fixtureDirectory, "inventory.sha256"), "utf8")
  ).trim();

  const first = await compile(sourcePath);
  const second = await compile(sourcePath);
  const reordered = await compile(reorderedPath);
  assert.equal(first.canonicalJson, second.canonicalJson);
  assert.equal(first.digest, second.digest);
  assert.equal(first.canonicalJson, reordered.canonicalJson);
  assert.equal(first.digest, reordered.digest);
  assert.equal(first.canonicalJson, expectedCanonical);
  assert.equal(first.digest, expectedDigest);
  recordAssertion("canonicalFixtureMatched");
  recordAssertion("deterministicIndependentCompiles");
  recordAssertion("sourceOrderingNormalized");

  const source = await readFile(sourcePath, "utf8");
  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), "zoen-definition-e2e-"),
  );
  const computationMutationPath = path.join(
    temporaryDirectory,
    "computation-mutation.zoen.ts",
  );
  const actionMutationPath = path.join(
    temporaryDirectory,
    "action-mutation.zoen.ts",
  );
  await writeFile(
    computationMutationPath,
    source.replace('operator: "subtract"', 'operator: "add"'),
  );
  await writeFile(
    actionMutationPath,
    source
      .replace('value: { amount: "0.125"', 'value: { amount: "0.25"')
      .replace("revision: 1", "revision: 2"),
  );
  const computationMutation = await compile(computationMutationPath);
  const actionMutation = await compile(actionMutationPath);
  assert.notEqual(first.digest, computationMutation.digest);
  assert.notEqual(first.digest, actionMutation.digest);
  await expectCompilerFailure(
    path.join(fixtureDirectory, "nondeterministic.zoen.ts"),
  );
  recordAssertion("computationMutationChangedDigest");

  let server = await startServer();
  const clientA = definitionClient(tokenA);
  const clientB = definitionClient(tokenB);
  const admin = new PostgresClient({ connectionString: adminDatabaseUrl });
  await admin.connect();

  try {
    const publishedA = await publish(clientA, tenantA, first);
    assert.equal(publishedA.commitSequence, 1n);
    assert.equal(publishedA.digest, expectedDigest);
    assert.equal(decode(publishedA.canonicalJson), expectedCanonical);

    const replayedA = await publish(clientA, tenantA, first);
    assert.equal(replayedA.commitSequence, 1n);
    assert.equal(await rowCount(admin, "authority_commits", tenantA), 1);
    assert.equal(await rowCount(admin, "definition_revisions", tenantA), 1);
    assert.equal(await rowCount(admin, "projection_outbox", tenantA), 1);
    assert.deepEqual(await projectionEvent(admin, tenantA, 1), {
      eventType: "DefinitionPublished",
      eventVersion: 1,
      payload: {
        definitionId: first.definition.definitionId,
        digest: first.digest,
        revision: 1,
      },
    });
    recordAssertion("authorityCommitParentPersisted");
    recordAssertion("definitionPublishedEventPersisted");
    recordAssertion("outboxAndCommitSequencePersisted");

    await expectConnectCode(
      () => publish(clientA, tenantB, first),
      Code.PermissionDenied,
    );
    assert.equal(await rowCount(admin, "definition_revisions", tenantB), 0);

    const publishedB = await publish(clientB, tenantB, first);
    assert.equal(publishedB.commitSequence, 1n);
    assert.equal(await rowCount(admin, "authority_commits", tenantB), 1);
    assert.equal(await rowCount(admin, "definition_revisions", tenantB), 1);

    await expectConnectCode(
      () =>
        clientA.publish({
          canonicalJson: encode(first.canonicalJson),
          digest: "0".repeat(64),
          tenantId: tenantA,
        }),
      Code.InvalidArgument,
    );

    const invalidReference = first.canonicalJson.replace(
      '"sourceType":"inventory.Item"',
      '"sourceType":"inventory.Missing"',
    );
    assert.notEqual(invalidReference, first.canonicalJson);
    await expectConnectCode(
      () =>
        clientA.publish({
          canonicalJson: encode(invalidReference),
          digest: sha256(invalidReference),
          tenantId: tenantA,
        }),
      Code.InvalidArgument,
    );

    for (const value of ["01", "+1", "-0", "001"]) {
      const invalidInteger = first.canonicalJson.replace(
        '{"amount":"0.125","kind":"quantity","unit":"kg"}',
        `{"kind":"integer","value":"${value}"}`,
      );
      assert.notEqual(invalidInteger, first.canonicalJson);
      await expectConnectCode(
        () =>
          clientA.publish({
            canonicalJson: encode(invalidInteger),
            digest: sha256(invalidInteger),
            tenantId: tenantA,
          }),
        Code.InvalidArgument,
      );
    }
    recordAssertion("noncanonicalIntegersRejected");

    await expectConnectCode(
      () =>
        clientA.publish({
          canonicalJson: encode(actionMutation.canonicalJson),
          digest: first.digest,
          tenantId: tenantA,
        }),
      Code.InvalidArgument,
    );

    await installOutboxFailure(admin);
    try {
      await expectConnectCode(
        () => publish(clientA, tenantA, actionMutation),
        Code.Unavailable,
      );
    } finally {
      await removeOutboxFailure(admin);
    }
    assert.equal(await rowCount(admin, "authority_commits", tenantA), 1);
    assert.equal(await rowCount(admin, "definition_revisions", tenantA), 1);
    assert.equal(await rowCount(admin, "projection_outbox", tenantA), 1);
    assert.equal(await authorityHead(admin, tenantA), 1);
    recordAssertion("atomicDatabaseFailure");

    await assert.rejects(
      admin.query(
        `UPDATE definition_revisions
         SET canonical_json = replace(
           canonical_json,
           '"operator":"greater_than"',
           '"operator":"multiply"'
         )
         WHERE tenant_id = $1 AND definition_id = $2 AND digest = $3`,
        [tenantA, first.definition.definitionId, first.digest],
      ),
      /published definition revisions are immutable/,
    );
    recordAssertion("immutableMutationKilled");

    assert.equal(await relationName(admin, "active_definition_revisions"), null);
    recordAssertion("activationStorageDeferred");
    await assertRlsIsolation();

    await stopServer(server);
    const afterStopCompile = await compile(sourcePath);
    assert.equal(afterStopCompile.canonicalJson, expectedCanonical);
    assert.equal(afterStopCompile.digest, expectedDigest);

    server = await startServer();
    const recoveredA = await getRevision(
      clientA,
      tenantA,
      first.definition.definitionId,
      first.digest,
    );
    assert.equal(recoveredA.commitSequence, 1n);
    assert.equal(recoveredA.digest, expectedDigest);
    assert.equal(decode(recoveredA.canonicalJson), expectedCanonical);
    recordAssertion("restartRecoveredExactRevision");

    const recoveredB = await getRevision(
      clientB,
      tenantB,
      first.definition.definitionId,
      first.digest,
    );
    assert.equal(recoveredB.digest, expectedDigest);

    await expectConnectCode(
      () =>
        clientA.getRevision({
          definitionId: first.definition.definitionId,
          digest: first.digest,
          tenantId: tenantB,
        }),
      Code.PermissionDenied,
    );
    recordAssertion("tenantSubstitutionRejected");
    await expectConnectCode(
      () =>
        clientB.getRevision({
          definitionId: first.definition.definitionId,
          digest: first.digest,
          tenantId: tenantA,
        }),
      Code.PermissionDenied,
    );

    const postgresVersion = await admin.query<{ server_version: string }>(
      "SHOW server_version",
    );
    const version = postgresVersion.rows[0]?.server_version;
    assert.match(version ?? "", /^18\./);

    const sourceCommit = await command("git", ["rev-parse", "HEAD"]);
    const protocol = await readFile(
      path.join(
        repositoryRoot,
        "proto",
        "zoen",
        "definition",
        "v1",
        "definition.proto",
      ),
    );
    const manifest = {
      assertions,
      componentVersions: {
        postgres: version,
      },
      definitionDigest: expectedDigest,
      finishedAt: new Date().toISOString(),
      protocolDigest: createHash("sha256").update(protocol).digest("hex"),
      scenario: "definition-publication",
      sourceCommit,
      startedAt,
    };
    await mkdir(path.join(repositoryRoot, "artifacts"), { recursive: true });
    await writeFile(
      path.join(repositoryRoot, "artifacts", "definition-publication.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  } finally {
    await admin.end();
    if (server.child.exitCode === null) {
      await stopServer(server);
    }
  }
}

function definitionClient(token: string): DefinitionClient {
  const authorization: Interceptor = (next) => async (request) => {
    request.header.set("authorization", `Bearer ${token}`);
    return next(request);
  };
  return createClient(
    DefinitionService,
    createConnectTransport({
      baseUrl,
      httpVersion: "1.1",
      interceptors: [authorization],
    }),
  );
}

async function publish(
  client: DefinitionClient,
  tenantId: string,
  definition: CompiledDefinition,
) {
  const response = await client.publish({
    canonicalJson: encode(definition.canonicalJson),
    digest: definition.digest,
    tenantId,
  });
  assert.ok(response.definitionRevision);
  return response.definitionRevision;
}

async function getRevision(
  client: DefinitionClient,
  tenantId: string,
  definitionId: string,
  digest: string,
) {
  const response = await client.getRevision({
    definitionId,
    digest,
    tenantId,
  });
  assert.ok(response.definitionRevision);
  return response.definitionRevision;
}

async function compile(sourcePath: string): Promise<CompiledDefinition> {
  const output = await command(process.execPath, [
    compilerPath,
    "compile",
    sourcePath,
  ]);
  return compiledDefinitionSchema.parse(JSON.parse(output));
}

async function expectCompilerFailure(sourcePath: string): Promise<void> {
  await assert.rejects(
    command(process.execPath, [compilerPath, "compile", sourcePath]),
    /nondeterministic or unsupported syntax/,
  );
}

function command(executable: string, arguments_: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      executable,
      arguments_,
      { cwd: repositoryRoot, encoding: "utf8" },
      (error, stdout, stderr) => {
        if (error !== null) {
          reject(new Error(`${stdout}${stderr}`, { cause: error }));
          return;
        }
        resolve(stdout.trim());
      },
    );
  });
}

async function startServer(): Promise<ServerProcess> {
  const output: string[] = [];
  const child = spawn(serverPath, [], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      DATABASE_URL: applicationDatabaseUrl,
      ZOEN_LISTEN_ADDR: "127.0.0.1:58080",
      ZOEN_SESSION_TOKENS: JSON.stringify({
        [tokenA]: tenantA,
        [tokenB]: tenantB,
      }),
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdin.end();
  child.stdout.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  await waitForPort(child, output);
  return { child, output };
}

async function waitForPort(
  child: ChildProcessWithoutNullStreams,
  output: readonly string[],
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`zoend exited during startup:\n${output.join("")}`);
    }
    if (await canConnect()) {
      return;
    }
    await delay(100);
  }
  throw new Error(`zoend did not listen on port 58080:\n${output.join("")}`);
}

function canConnect(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port: 58080 });
    let settled = false;
    const finish = (connected: boolean) => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolve(connected);
      }
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(200, () => finish(false));
  });
}

async function stopServer(server: ServerProcess): Promise<void> {
  if (server.child.exitCode !== null) {
    return;
  }
  server.child.kill("SIGINT");
  await once(server.child, "exit");
  assert.equal(
    server.child.exitCode,
    0,
    `zoend failed during shutdown:\n${server.output.join("")}`,
  );
}

async function expectConnectCode(
  action: () => Promise<unknown>,
  expected: Code,
): Promise<void> {
  try {
    await action();
    assert.fail(`expected Connect error ${Code[expected]}`);
  } catch (error: unknown) {
    if (!(error instanceof ConnectError)) {
      throw error;
    }
    assert.equal(error.code, expected, error.message);
  }
}

async function rowCount(
  client: PostgresClient,
  table: string,
  tenantId: string,
): Promise<number> {
  const allowedTables = new Set([
    "authority_commits",
    "definition_revisions",
    "projection_outbox",
  ]);
  assert.ok(allowedTables.has(table));
  const result = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM ${table} WHERE tenant_id = $1`,
    [tenantId],
  );
  return Number(result.rows[0]?.count);
}

async function projectionEvent(
  client: PostgresClient,
  tenantId: string,
  commitSequence: number,
): Promise<{
  eventType: string;
  eventVersion: number;
  payload: unknown;
}> {
  const result = await client.query<{
    event_type: string;
    event_version: number;
    payload: unknown;
  }>(
    `SELECT event_type, event_version, payload
     FROM projection_outbox
     WHERE tenant_id = $1 AND commit_sequence = $2 AND ordinal = 0`,
    [tenantId, commitSequence],
  );
  const row = result.rows[0];
  assert.ok(row);
  return {
    eventType: row.event_type,
    eventVersion: row.event_version,
    payload: row.payload,
  };
}

async function relationName(
  client: PostgresClient,
  relation: string,
): Promise<string | null> {
  const result = await client.query<{ name: string | null }>(
    "SELECT to_regclass($1)::text AS name",
    [`public.${relation}`],
  );
  return result.rows[0]?.name ?? null;
}

async function authorityHead(
  client: PostgresClient,
  tenantId: string,
): Promise<number> {
  const result = await client.query<{ commit_sequence: string }>(
    `SELECT commit_sequence::text
     FROM authority_heads
     WHERE tenant_id = $1`,
    [tenantId],
  );
  return Number(result.rows[0]?.commit_sequence);
}

async function installOutboxFailure(client: PostgresClient): Promise<void> {
  await client.query(`
    CREATE FUNCTION e2e_fail_projection_outbox()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RAISE EXCEPTION 'injected outbox failure';
    END;
    $$;

    CREATE TRIGGER e2e_projection_outbox_failure
    BEFORE INSERT ON projection_outbox
    FOR EACH ROW
    EXECUTE FUNCTION e2e_fail_projection_outbox();
  `);
}

async function removeOutboxFailure(client: PostgresClient): Promise<void> {
  await client.query(`
    DROP TRIGGER e2e_projection_outbox_failure ON projection_outbox;
    DROP FUNCTION e2e_fail_projection_outbox();
  `);
}

async function assertRlsIsolation(): Promise<void> {
  const application = new PostgresClient({
    connectionString: applicationDatabaseUrl,
  });
  await application.connect();
  try {
    await application.query("BEGIN");
    await application.query(
      "SELECT set_config('zoen.tenant_id', $1, true)",
      [tenantA],
    );
    for (const table of [
      "authority_commits",
      "definition_revisions",
      "projection_outbox",
    ]) {
      const result = await application.query<{ count: string }>(
        `SELECT count(*)::text AS count
         FROM ${table}
         WHERE tenant_id = $1`,
        [tenantB],
      );
      assert.equal(result.rows[0]?.count, "0");
    }
    await application.query("ROLLBACK");
  } finally {
    await application.end();
  }
}

function encode(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function decode(value: Uint8Array): string {
  return new TextDecoder().decode(value);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
