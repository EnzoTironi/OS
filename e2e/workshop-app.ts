import assert from "node:assert/strict";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createClient, type Interceptor } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import canonicalize from "canonicalize";
import { z } from "zod";
import {
  ActionService,
  CommitStatus,
} from "../gen/connect/zoen/action/v1/action_pb.js";
import {
  EffectAttemptOutcome,
  EffectKnowledgeState,
} from "../gen/connect/zoen/effect/v1/effect_pb.js";
import { DefinitionReferenceSchema } from "../gen/connect/zoen/world/v1/world_pb.js";
import { digestAppFiles } from "../apps/shared/app-files-digest.js";
import { bindActionPreviewHash } from "./action-preview-bind.js";
import { ensureDynamicAppsArtifact } from "./dynamic-apps-artifact.js";
import {
  AUTH_DOOR_ORIGIN,
  invitePersona,
  plantPersonas,
  sessionOf,
  startAuthDoor,
  stopAuthDoor,
} from "./ba-door.js";
import { sha256 } from "./effect-scenario.js";
import {
  actionClient,
  adminClient,
  adminDatabaseUrl,
  authDatabaseUrl,
  definitionClient,
  dispatchOnce,
  dynamicAppsArtifactCacheDir,
  effectClient,
  registerWorker,
  repositoryRoot,
  rivetEndpoint,
  startWorker,
  startWorkshop,
  startZoend,
  stopProcess,
  tenantA,
  waitFor,
  workshopBaseUrl,
  zoenBaseUrl,
  type ManagedProcess,
} from "./effect-support.js";
import {
  type DefinitionFixture,
  activateDefinition,
  publishDefinition,
  textInput,
} from "./governed-action/support.js";
import {
  e2eGeneratedDirectory,
  e2eIdentityAdminToken,
  writeScenarioArtifact,
} from "./host-env.js";
import {
  definitionPublishActionId,
  definitionPublishPolicy,
} from "./definition-publish-policy.js";

const workshopActionId = "workshop.deployApp";
const workshopResourceId = "workshop.app";
const appSlug = "quadro";
const appSummary = "Quadro de recados da casa";
const appMarker = "e2e-workshop-app-ok";
const waId = "5531987654321";
const kapsoPhoneNumberId = "e2e-kapso-phone-number-id";
const validAt = new Date("2026-08-19T00:00:00.000Z");

const workshopPayloadSchema = z
  .object({
    channel: z
      .object({
        kind: z.literal("whatsapp"),
        to: z.string().min(1),
      })
      .strict()
      .optional(),
    executorClass: z.literal("workshop_deploy_app"),
    filesDigest: z.string().min(1),
    membershipId: z.string().min(1),
    schemaVersion: z.literal(1),
    slug: z.string().min(1),
    summary: z.string().min(1),
  })
  .strict();

function channelCredential(subjectKey: string): string {
  const encode = (value: string): string =>
    Buffer.from(value, "utf8").toString("base64url");
  return `chx.${encode(e2eIdentityAdminToken())}.${encode(`whatsapp:${subjectKey}`)}`;
}

async function bindVerifiedSubject(
  accountId: string,
  subjectKey: string,
): Promise<void> {
  const response = await fetch(`${zoenBaseUrl}/identity/admin/bind-verified`, {
    body: JSON.stringify({ accountId, provider: "whatsapp", subjectKey }),
    headers: {
      authorization: `Bearer ${e2eIdentityAdminToken()}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
  assert.equal(
    response.status,
    200,
    `bind-verified ${subjectKey} -> ${await response.text()}`,
  );
}

interface KapsoMessage {
  readonly path: string;
  readonly text: string;
  readonly to: string;
}

async function startMockKapso(): Promise<{
  readonly messages: KapsoMessage[];
  readonly url: string;
  readonly close: () => Promise<void>;
}> {
  const messages: KapsoMessage[] = [];
  const server: Server = createServer(
    (request: IncomingMessage, response: ServerResponse) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        const match = /^\/meta\/whatsapp\/([^/]+)\/messages$/.exec(
          request.url ?? "",
        );
        if (request.method !== "POST" || match === null) {
          response.writeHead(404).end();
          return;
        }
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
          text?: { body?: string };
          to?: string;
        };
        messages.push({
          path: match[1] ?? "",
          text: body.text?.body ?? "",
          to: body.to ?? "",
        });
        response
          .writeHead(200, { "content-type": "application/json" })
          .end(JSON.stringify({ messages: [{ id: "wamid.e2e.workshop" }] }));
      });
    },
  );
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  assert.ok(address !== null && typeof address !== "string");
  return {
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
    messages,
    url: `http://127.0.0.1:${address.port}`,
  };
}

// The app the persona "built": the exact web-server contract from the
// dynamic-apps skill (build = tsc, entrypoint dist/index.js, Hono default
// export, no port). The marker string proves the deployed isolate serves.
function appFiles(marker: string): Record<string, string> {
  return {
    "package.json": `${JSON.stringify(
      {
        name: "generated-web-app",
        version: "0.0.0",
        private: true,
        type: "module",
        main: "dist/index.js",
        scripts: { build: "tsc" },
        dependencies: { hono: "4.13.5" },
        devDependencies: { "@types/node": "22.20.1", typescript: "5.9.3" },
      },
      null,
      2,
    )}\n`,
    "tsconfig.json": `${JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          lib: ["ES2022", "DOM", "DOM.Iterable"],
          module: "NodeNext",
          moduleResolution: "NodeNext",
          strict: true,
          outDir: "dist",
          types: ["node"],
          skipLibCheck: true,
        },
        include: ["src"],
      },
      null,
      2,
    )}\n`,
    "src/index.ts": [
      'import { Hono } from "hono";',
      "",
      "const app = new Hono();",
      "",
      'app.get("/", (context) =>',
      `  context.html(\`<h1>${marker}</h1>\`),`,
      ");",
      "",
      "export default app;",
      "",
    ].join("\n"),
  };
}

async function plantAppFiles(
  diskRoot: string,
  membershipId: string,
  files: Record<string, string>,
): Promise<string> {
  const root = path.join(
    diskRoot,
    membershipId,
    "workspace",
    "apps",
    appSlug,
  );
  for (const [relative, text] of Object.entries(files)) {
    const full = path.join(root, relative);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, text);
  }
  return root;
}

function sessionCookie(token: string): string {
  return `better-auth.session_token=${encodeURIComponent(token)}`;
}

async function membershipIdOf(principalId: string): Promise<string> {
  const client = adminClient();
  await client.connect();
  try {
    const result = await client.query(
      "SELECT membership_id FROM memberships WHERE principal_id = $1 AND tenant_id = $2",
      [principalId, tenantA],
    );
    const row = result.rows[0] as { membership_id: string } | undefined;
    assert.ok(row, `no membership for ${principalId}`);
    return row.membership_id;
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const kapso = await startMockKapso();
  process.env.ZOEN_E2E_REMINDER_CHANNEL_URL = kapso.url;

  const baseDefinition = JSON.parse(
    (
      await readFile(
        path.join(repositoryRoot, "testdata/lakes/personal.canonical.json"),
        "utf8",
      )
    ).trimEnd(),
  ) as { revision: number };
  const canonicalJson = canonicalize(baseDefinition);
  assert.ok(canonicalJson !== undefined);
  const digest = sha256(canonicalJson);
  const definitionId = "personal.memory";
  const activationSource = await readFile(
    path.join(repositoryRoot, "e2e/governed-action/activation.cedar"),
    "utf8",
  );
  const readSource =
    'permit (\n    principal,\n    action == Action::"read",\n    resource\n);\n';
  // Same source as deploy/fly/policies.json policy.workshop.deployApp.r2
  // (rev 2): discover + commit gated on context.actionId.
  const workshopPolicySource = `@id("workshop-deployApp-discover")
permit (
    principal,
    action == Action::"discover",
    resource
)
when {
    context.actionId == "workshop.deployApp"
};

@id("workshop-deployApp-commit")
permit (
    principal,
    action == Action::"commit",
    resource
)
when {
    context.actionId == "workshop.deployApp"
};
`;
  const fixture: DefinitionFixture = {
    canonicalJson,
    definition: create(DefinitionReferenceSchema, {
      definitionId,
      digest,
      // Track the lake document's own revision: the personal definition
      // carries workshop.deployApp at revision 2, and publish/activate assert
      // the server-returned revision against this reference.
      revision: BigInt(baseDefinition.revision),
    }),
    digest,
    policyDigest: sha256(workshopPolicySource),
    policyId: "policy.workshop.deployApp.r2",
    policyRevision: 2,
    policySource: workshopPolicySource,
  };
  const policyManifestPath = path.join(
    e2eGeneratedDirectory(repositoryRoot, "workshop-app"),
    "workshop-app-policies.json",
  );
  await mkdir(path.dirname(policyManifestPath), { recursive: true });
  await writeFile(
    policyManifestPath,
    `${JSON.stringify(
      {
        policies: [
          definitionPublishPolicy({
            definitionDigest: digest,
            revision: baseDefinition.revision,
          }),
          {
            actionId: workshopActionId,
            definitionDigest: digest,
            digest: fixture.policyDigest,
            policyId: fixture.policyId,
            revision: 2,
            source: workshopPolicySource,
          },
          {
            actionId: "zoen.definition.activate",
            definitionDigest: digest,
            digest: sha256(activationSource),
            policyId: "policy.activation.personal",
            revision: 1,
            source: activationSource,
          },
          {
            actionId: "zoen.world.read",
            definitionDigest: digest,
            digest: sha256(readSource),
            policyId: "policy.read.personal",
            revision: 1,
            source: readSource,
          },
        ],
      },
      null,
      2,
    )}\n`,
  );

  const door = await startAuthDoor(authDatabaseUrl);
  const processes: ManagedProcess[] = [];
  const assertions: Record<string, boolean> = {};
  const observe = (name: string, value: boolean): void => {
    assert.ok(value, name);
    assertions[name] = value;
  };
  const diskRoot = path.join(
    e2eGeneratedDirectory(repositoryRoot, "workshop-app"),
    "membership-disk",
  );

  try {
    processes.push(await startZoend(policyManifestPath));
    const planted = await plantPersonas(door, {
      adminToken: e2eIdentityAdminToken(),
      applicationDatabaseUrl: adminDatabaseUrl,
      personas: [
        invitePersona({
          actionIds: [workshopActionId],
          actorId: "actor.wa.user",
          id: "wa-user",
          principalId: "principal.wa.user",
          resourceIds: [workshopResourceId],
          tenantId: tenantA,
          workloadId: "workload.wa.user",
        }),
        // A second person in the same tenant: their session must NOT see the
        // first person's app (membership isolation, 404 not 403).
        invitePersona({
          actionIds: [workshopActionId],
          actorId: "actor.wa.user.b",
          id: "wa-user-b",
          principalId: "principal.wa.user.b",
          resourceIds: [workshopResourceId],
          tenantId: tenantA,
          workloadId: "workload.wa.user.b",
        }),
        invitePersona({
          actionIds: [
            definitionPublishActionId,
            "zoen.definition.activate",
            workshopActionId,
          ],
          actorId: "actor.admin.a",
          id: "admin-a",
          principalId: "principal.admin.a",
          resourceIds: [definitionId, workshopResourceId],
          tenantId: tenantA,
          workloadId: "workload.admin.a",
        }),
        invitePersona({
          actionIds: [workshopActionId],
          actorId: "actor.effect.worker.a",
          id: "effect-worker-a",
          principalId: "principal.effect-worker.a",
          resourceIds: [workshopResourceId],
          tenantId: tenantA,
          workloadId: "workload.effect-worker",
        }),
        invitePersona({
          actionIds: [workshopActionId],
          actorId: "actor.effect.reconciler.a",
          id: "effect-reconciler-a",
          principalId: "principal.effect-reconciler.a",
          resourceIds: [workshopResourceId],
          tenantId: tenantA,
          workloadId: "workload.effect-reconciler",
        }),
      ],
      zoendBaseUrl: zoenBaseUrl,
    });
    const waSession = sessionOf(planted, "wa-user");
    const waSessionB = sessionOf(planted, "wa-user-b");
    await bindVerifiedSubject(waSession.accountId, `${waId}@s.whatsapp.net`);
    const waToken = channelCredential(`${waId}@s.whatsapp.net`);
    const adminToken = sessionOf(planted, "admin-a").token;
    const workerToken = sessionOf(planted, "effect-worker-a").token;
    const reconcilerToken = sessionOf(planted, "effect-reconciler-a").token;

    const membershipId = await membershipIdOf("principal.wa.user");
    const plantedFiles = appFiles(appMarker);
    await plantAppFiles(diskRoot, membershipId, plantedFiles);
    // Prebuild the deploy artifact outside the broken host-mount pack step so
    // the engine-side deploy actor resolves the release from its artifact
    // cache instead of running the in-VM build (denied on Linux).
    await ensureDynamicAppsArtifact({
      repositoryRoot,
      cacheDir: dynamicAppsArtifactCacheDir,
      appId: appSlug,
      files: plantedFiles,
      log: (message) => console.log(`journey: ${message}`),
    });
    const filesDigest = digestAppFiles(
      Object.entries(plantedFiles).map(([filePath, text]) => ({
        path: filePath,
        text,
      })),
    );

    processes.push(
      await startWorker(
        { [tenantA]: workerToken },
        {
          connectorUrl: null,
          reconcilerTokens: { [tenantA]: reconcilerToken },
          workshop: {
            // The engine runs in docker and dials this runner callback
            // through the host gateway (compose extra_hosts).
            callbackUrl: `http://host.docker.internal:${new URL(workshopBaseUrl).port}`,
            membershipDiskRoot: diskRoot,
            publicOrigin: zoenBaseUrl,
          },
        },
      ),
    );
    const registration = await registerWorker();
    assert.match(registration, /runner|normal/i);
    processes.push(await startWorkshop({ authBaseUrl: AUTH_DOOR_ORIGIN }));

    const definitions = definitionClient(adminToken, tenantA);
    await publishDefinition(definitions, tenantA, fixture);
    await activateDefinition(definitions, tenantA, fixture);

    const action = actionClient(waToken, tenantA);
    const operationId = "operation.workshop.app.1";
    const proposalId = "proposal.workshop.app.1";
    const proposed = await action.propose({
      actionId: workshopActionId,
      definition: fixture.definition,
      expiresAt: timestampFromDate(new Date(Date.now() + 300_000)),
      inputs: [
        textInput("slug", appSlug),
        textInput("summary", appSummary),
        textInput("filesDigest", filesDigest),
        textInput("membershipId", membershipId),
      ],
      operationId,
      proposalId,
      resourceId: workshopResourceId,
      validAt: timestampFromDate(validAt),
    });
    assert.ok(proposed.proposal);
    const committed = await action.commit({ operationId, proposalId });
    assert.equal(committed.status, CommitStatus.COMMITTED);
    assert.ok(committed.receipt);
    const effectRequestIds = committed.receipt.effectRequestIds;
    // As with reminder-loop, the commit mints a generic companion effect
    // alongside the action's own; exactly one must carry the
    // workshop_deploy_app contract.
    const effects = effectClient(workerToken, tenantA);
    let effectRequestId: string | undefined;
    let contractPayload: z.infer<typeof workshopPayloadSchema> | undefined;
    for (const candidateId of effectRequestIds) {
      const response = await effects.getEffect({
        effectRequestId: candidateId,
      });
      const payload = response.snapshot?.request?.payload;
      assert.ok(payload, `${candidateId} has no payload`);
      const parsed: unknown = JSON.parse(Buffer.from(payload).toString("utf8"));
      const contract = workshopPayloadSchema.safeParse(parsed);
      if (contract.success) {
        assert.ok(
          effectRequestId === undefined,
          "more than one workshop_deploy_app payload minted",
        );
        effectRequestId = candidateId;
        contractPayload = contract.data;
      }
    }
    assert.ok(
      effectRequestId !== undefined && contractPayload !== undefined,
      "no effect_request carried the workshop_deploy_app contract",
    );
    observe("exactly_one_workshop_deploy_app_payload", true);
    observe("contract_slug_matches", contractPayload.slug === appSlug);
    observe(
      "contract_files_digest_matches",
      contractPayload.filesDigest === filesDigest,
    );
    observe(
      "contract_membership_matches",
      contractPayload.membershipId === membershipId,
    );
    observe(
      "contract_channel_is_wa_id",
      contractPayload.channel?.to === waId,
    );

    await dispatchOnce(tenantA);
    // The deploy builds the app (npm install + tsc) inside the engine before
    // reconcile lands; the 10s default window is not enough on a cold CI
    // runner. On timeout, dump the worker/workshop logs - the harness buffers
    // child output and otherwise only prints it on shutdown failures.
    try {
      await waitFor(
        async () => {
          const response = await effects.getEffect({ effectRequestId });
          const snapshot = response.snapshot;
          return snapshot?.request?.state === EffectKnowledgeState.CONFIRMED
            ? snapshot
            : undefined;
        },
        `${effectRequestId} to reach CONFIRMED`,
        3600,
      );
    } catch (error: unknown) {
      for (const process of processes) {
        console.error(
          `--- ${process.name} output (last 400 lines) ---\n${process.output.slice(-400).join("")}`,
        );
      }
      // Dispatch state: was the workshop effect handed to the worker at all,
      // and what knowledge state did each effect reach?
      try {
        const client = adminClient();
        await client.connect();
        try {
          const attempts = await client.query(
            "SELECT effect_request_id, outcome, error_message FROM effect_dispatch_attempts WHERE tenant_id = $1 ORDER BY effect_request_id, attempt_number",
            [tenantA],
          );
          console.error(
            `--- effect_dispatch_attempts ---\n${JSON.stringify(attempts.rows, null, 2)}`,
          );
          const requests = await client.query(
            "SELECT effect_request_id, knowledge_state FROM effect_requests WHERE tenant_id = $1 ORDER BY effect_request_id",
            [tenantA],
          );
          console.error(
            `--- effect_requests ---\n${JSON.stringify(requests.rows, null, 2)}`,
          );
          const claims = await client.query(
            "SELECT effect_request_id, attempt_id, claimed_workload_id FROM effect_attempt_claims WHERE tenant_id = $1 ORDER BY effect_request_id",
            [tenantA],
          );
          console.error(
            `--- effect_attempt_claims ---\n${JSON.stringify(claims.rows, null, 2)}`,
          );
        } finally {
          await client.end();
        }
      } catch (dbError: unknown) {
        console.error(`could not read effect tables: ${dbError}`);
      }
      // Which actors does the workshop engine know about, and in what state?
      // Distinguishes "the .0 zoenEffect actor never started" from "it started
      // and hung" and shows whether dynamicAppsApp was ever created.
      for (const actorName of ["zoenEffect", "dynamicAppsApp"]) {
        try {
          const response = await fetch(
            `${rivetEndpoint}/actors?name=${actorName}&namespace=default`,
            { headers: { authorization: "Bearer admin" } },
          );
          const body = (await response.text()).slice(0, 4000);
          console.error(
            `--- rivet actors ${actorName} (${response.status}) ---\n${body}`,
          );
        } catch (probeError: unknown) {
          console.error(`could not list rivet actors: ${probeError}`);
        }
      }
      // The deploy stalls inside the engine: its container log is the only
      // place the build/callback failure is visible.
      try {
        const logs = await promisify(execFile)(
          "docker",
          [
            "compose",
            "--project-name",
            "zoen-workshop-app",
            "--file",
            "e2e/workshop-app/compose.yaml",
            "logs",
            "--tail",
            "400",
            "rivet",
          ],
          { cwd: repositoryRoot, maxBuffer: 8 * 1024 * 1024 },
        );
        console.error(`--- rivet engine logs (tail) ---\n${logs.stdout}`);
      } catch (logsError: unknown) {
        console.error(`could not read rivet logs: ${logsError}`);
      }
      throw error;
    }
    observe("workshop_effect_reconciled_confirmed", true);

    // The deployed app is reachable through zoend's apps proxy with the
    // persona's door session cookie.
    const appUrl = `${zoenBaseUrl}/apps/${membershipId}/${appSlug}/`;
    const page = await waitFor(async () => {
      const response = await fetch(appUrl, {
        headers: { cookie: sessionCookie(waSession.token) },
        redirect: "manual",
      });
      if (response.status !== 200) {
        return undefined;
      }
      return await response.text();
      // First hit cold-starts the isolate on the runner - allow a long window.
    }, `deployed app to serve 200 at ${appUrl}`, 1200);
    observe("app_served_through_zoend_proxy", page.includes(appMarker));

    // Membership isolation: the second persona's session gets a 404, and a
    // request with no session is redirected to the door login.
    const foreign = await fetch(appUrl, {
      headers: { cookie: sessionCookie(waSessionB.token) },
      redirect: "manual",
    });
    observe(
      "foreign_membership_session_gets_404",
      foreign.status === 404,
    );
    await foreign.arrayBuffer();
    const anonymous = await fetch(appUrl, { redirect: "manual" });
    const anonymousLocation = anonymous.headers.get("location") ?? "<none>";
    assert.ok(
      anonymous.status === 302 && anonymousLocation.includes("/login"),
      `anonymous_request_redirects_to_login: got HTTP ${anonymous.status}, location: ${anonymousLocation}`,
    );
    assertions.anonymous_request_redirects_to_login = true;
    await anonymous.arrayBuffer();

    // BFF: generated apps call same-origin /zoen/<Service>/<Method>. Propose
    // through the proxy (cookie auth only - the workshop attaches the door
    // token server-side) and confirm the engine sees the operation.
    const bffCookie: Interceptor = (next) => async (request) => {
      request.header.set("cookie", sessionCookie(waSession.token));
      return next(request);
    };
    const bffAction = bindActionPreviewHash(
      createClient(
        ActionService,
        createConnectTransport({
          baseUrl: `${zoenBaseUrl}/zoen`,
          httpVersion: "1.1",
          interceptors: [bffCookie],
          // Generated apps run in the browser, where connect-web defaults to
          // JSON; connect-node defaults to binary, so pin the format.
          useBinaryFormat: false,
        }),
      ),
    );
    const bffOperationId = "operation.workshop.app.bff";
    const bffProposalId = "proposal.workshop.app.bff";
    const bffProposed = await bffAction.propose({
      actionId: workshopActionId,
      definition: fixture.definition,
      expiresAt: timestampFromDate(new Date(Date.now() + 300_000)),
      inputs: [
        textInput("slug", `${appSlug}-bff`),
        textInput("summary", appSummary),
        textInput("filesDigest", filesDigest),
        textInput("membershipId", membershipId),
      ],
      operationId: bffOperationId,
      proposalId: bffProposalId,
      resourceId: workshopResourceId,
      validAt: timestampFromDate(validAt),
    });
    assert.ok(bffProposed.proposal);
    const bffStatus = await actionClient(waSession.token, tenantA)
      .getOperationStatus({ operationId: bffOperationId });
    observe(
      "bff_propose_visible_in_get_operation_status",
      bffStatus.status !== CommitStatus.COMMITTED,
    );

    // Digest pinning: mutate the planted files after the commit approved
    // them; the next deploy with the stale digest must fail terminally.
    const tamperedIndex = appFiles("tampered")["src/index.ts"];
    assert.ok(tamperedIndex !== undefined);
    const mutatedFiles = { ...plantedFiles, "src/index.ts": tamperedIndex };
    await plantAppFiles(diskRoot, membershipId, mutatedFiles);
    const tamperOperationId = "operation.workshop.app.tamper";
    const tamperProposalId = "proposal.workshop.app.tamper";
    const tampered = await action.propose({
      actionId: workshopActionId,
      definition: fixture.definition,
      expiresAt: timestampFromDate(new Date(Date.now() + 300_000)),
      inputs: [
        textInput("slug", appSlug),
        textInput("summary", appSummary),
        // The digest of the ORIGINAL files: the commit approves these bytes,
        // but the disk now holds different ones.
        textInput("filesDigest", filesDigest),
        textInput("membershipId", membershipId),
      ],
      operationId: tamperOperationId,
      proposalId: tamperProposalId,
      resourceId: workshopResourceId,
      validAt: timestampFromDate(validAt),
    });
    assert.ok(tampered.proposal);
    const tamperCommit = await action.commit({
      operationId: tamperOperationId,
      proposalId: tamperProposalId,
    });
    assert.equal(tamperCommit.status, CommitStatus.COMMITTED);
    let tamperEffectId: string | undefined;
    for (const candidateId of tamperCommit.receipt?.effectRequestIds ?? []) {
      const response = await effects.getEffect({
        effectRequestId: candidateId,
      });
      const payload = response.snapshot?.request?.payload;
      assert.ok(payload, `${candidateId} has no payload`);
      const parsed: unknown = JSON.parse(Buffer.from(payload).toString("utf8"));
      if (workshopPayloadSchema.safeParse(parsed).success) {
        tamperEffectId = candidateId;
      }
    }
    assert.ok(tamperEffectId, "tamper commit minted no workshop effect");
    await dispatchOnce(tenantA);
    await waitFor(async () => {
      const response = await effects.getEffect({
        effectRequestId: tamperEffectId,
      });
      const attempt = response.snapshot?.attempts.find(
        (candidate) =>
          candidate.outcome === EffectAttemptOutcome.DEFINITELY_NOT_SENT,
      );
      return attempt;
    // The tamper effect actor cold-boots on dispatch (~20s on a CI runner:
    // fresh sqlite bucket branch) before the claim/read/digest path can run;
    // the poll returns as soon as the terminal attempt lands, so a generous
    // cap costs nothing when the boot is fast.
    }, "tampered deploy to fail terminally", 1800);
    observe(
      "files_changed_after_commit_is_terminal",
      (await effects.getEffect({ effectRequestId: tamperEffectId })).snapshot
        ?.attempts[0]?.providerOperationId ===
        "workshop.files_changed_after_commit",
    );

    // The deploy notification went to the person's WhatsApp via Kapso with
    // the public URL.
    observe("kapso_received_exactly_one_message", kapso.messages.length === 1);
    const delivered = kapso.messages[0];
    assert.ok(delivered);
    observe(
      "kapso_path_is_planted_phone_number_id",
      delivered.path === kapsoPhoneNumberId,
    );
    observe("kapso_to_is_wa_id", delivered.to === waId);
    observe(
      "kapso_text_announces_public_url",
      delivered.text ===
        `tá no ar: ${zoenBaseUrl}/apps/${membershipId}/${appSlug}`,
    );

    await writeScenarioArtifact(repositoryRoot, "workshop-app", {
      assertions,
      componentVersions: {
        postgres: "18",
        rivet: "2.3.11",
        sessionDoor: "better-auth",
      },
      finishedAt: new Date().toISOString(),
      scenario: "workshop-app",
      startedAt,
    });
  } catch (error: unknown) {
    // The harness buffers child output and otherwise only prints it on
    // shutdown failures: dump zoend/worker/workshop tails on any journey
    // failure so CI logs carry the server side of a bad response.
    for (const process of processes) {
      console.error(
        `--- ${process.name} output (last 400 lines) ---\n${process.output.slice(-400).join("")}`,
      );
    }
    throw error;
  } finally {
    for (const process of processes) {
      await stopProcess(process);
    }
    await stopAuthDoor(door);
    await kapso.close();
  }
}

await main();
