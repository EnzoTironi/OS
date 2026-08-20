import assert from "node:assert/strict";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { Client as PostgresClient } from "pg";
import {
  chromium,
  type Browser,
  type Page,
} from "playwright";
import { z } from "zod";
import {
  CommitStatus,
  PolicyDecision,
} from "../packages/sdk/src/gen/zoen/action/v1/action_pb.js";
import {
  actionClient,
  activateDefinition,
  adminDatabaseUrl,
  databaseSnapshot,
  definitionClient,
  loadFixture,
  oidcToken,
  publishDefinition,
  recordAvailable,
  repositoryRoot,
  resourceId,
  startServer,
  stopServer,
  tenantA,
  worldClient,
  writePolicyManifest,
  type ServerProcess,
} from "./governed-action/support.js";
import {
  e2eGeneratedDirectory,
  e2eHttpUrl,
  writeScenarioArtifact,
} from "./host-env.js";
import {
  startResponseLossProxy,
  startWeb,
  stopWeb,
  type ResponseLossProxy,
  type WebProcess,
} from "./web-deterministic/support.js";

const scenario = "web-deterministic";
const webOrigin = e2eHttpUrl("ZOEN_E2E_WEB_PORT", 58_187);
const sessionSchema = z
  .object({
    identity: z
      .object({
        bindingId: z.string().min(1),
        operationId: z.string().min(1),
        proposalId: z.string().min(1),
      })
      .strict(),
  })
  .passthrough();
const observations: Record<string, boolean> = {};
const failureInjections: string[] = [];

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const fixture = await loadFixture("direct", 1);
  const policyManifestPath = path.join(
    e2eGeneratedDirectory(repositoryRoot, scenario),
    "policies.json",
  );
  await writePolicyManifest(policyManifestPath, [fixture]);

  const [agentToken, adminToken] = await Promise.all([
    oidcToken("agent-a"),
    oidcToken("admin-a"),
  ]);
  const actions = actionClient(agentToken);
  const definitions = definitionClient(agentToken);
  const definitionAdmin = definitionClient(adminToken);
  const world = worldClient(agentToken);
  const admin = new PostgresClient({ connectionString: adminDatabaseUrl });
  let authority: ServerProcess | undefined;
  let web: WebProcess | undefined;
  let proxy: ResponseLossProxy | undefined;
  let browser: Browser | undefined;

  await admin.connect();
  try {
    authority = await startServer(policyManifestPath);
    await publishDefinition(definitions, tenantA, fixture);
    await activateDefinition(definitionAdmin, tenantA, fixture);
    await recordAvailable(world, {
      claimId: "claim.available.web",
      fixture,
      resource: resourceId,
      tenantId: tenantA,
      value: "10",
    });
    const beforeAction = await databaseSnapshot(admin, tenantA);
    proxy = await startResponseLossProxy();
    web = await startWeb(proxy.origin);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await signIn(page);
    await verifyInitialSurface(page, actions, fixture.digest);

    const jsonRenderer = page.locator('[data-renderer="json-render"]');
    const referenceRenderer = page.locator('[data-renderer="reference"]');
    const jsonForm = jsonRenderer.locator("form");
    await jsonForm.locator('input[name="quantity"]').fill("2");
    await jsonForm.getByRole("button", { name: "Propose Action" }).click();
    await jsonForm.getByText(/Proposal .* is ready for commit/u).waitFor();
    const session = await storedActionSession(page);
    proxy.dropNextCommitResponse();
    failureInjections.push("commit-response-loss");
    await jsonForm.getByRole("button", { name: "Commit Action" }).click();
    await jsonForm.getByText(/Action failed/u).waitFor();

    const directStatus = await actions.getOperationStatus({
      operationId: session.identity.operationId,
    });
    assert.equal(directStatus.status, CommitStatus.COMMITTED);
    assert.ok(directStatus.receipt);
    assert.equal(
      directStatus.receipt.proposalId,
      session.identity.proposalId,
    );
    const afterAction = await databaseSnapshot(admin, tenantA);
    observe(
      "buttonClickIssuesRealActionProtocolAndMatchesDirectSdkClient",
      proxy.requests.some((request) =>
        request.endsWith("/zoen.action.v1.ActionService/Propose"),
      ) &&
        proxy.requests.some((request) =>
          request.endsWith("/zoen.action.v1.ActionService/Commit"),
        ) &&
        afterAction.actionOperations === beforeAction.actionOperations + 1 &&
        afterAction.authorityCommits === beforeAction.authorityCommits + 1,
    );

    await stopWeb(web);
    web = undefined;
    await stopServer(authority);
    authority = undefined;
    proxy.allowStatusRecovery();
    failureInjections.push("web-and-zoend-restart");
    authority = await startServer(policyManifestPath);
    web = await startWeb(proxy.origin);
    await page.goto(webOrigin);
    await page.getByText(/Committed locally at sequence/u).first().waitFor();

    const recoveredStatus = await actions.getOperationStatus({
      operationId: session.identity.operationId,
    });
    assert.equal(recoveredStatus.status, CommitStatus.COMMITTED);
    assert.equal(
      recoveredStatus.receipt?.commitSequence,
      directStatus.receipt.commitSequence,
    );
    const replay = await actions.commit({
      operationId: session.identity.operationId,
      proposalId: session.identity.proposalId,
    });
    assert.equal(replay.status, CommitStatus.COMMITTED);
    assert.equal(
      replay.receipt?.commitSequence,
      directStatus.receipt.commitSequence,
    );
    observe(
      "responseLossRecoversSameOperation",
      (await page.getByText(session.identity.operationId).count()) === 2 &&
        afterAction.actionOperations === beforeAction.actionOperations + 1,
    );

    const jsonStatus = await jsonRenderer.locator(".operation-status").innerText();
    const referenceStatus = await referenceRenderer
      .locator(".operation-status")
      .innerText();
    assert.equal(jsonStatus, referenceStatus);
    const effectText = await jsonRenderer.locator(".effect-list").innerText();
    assert.match(effectText, /pending|unknown/u);
    assert.doesNotMatch(effectText, /confirmed|completed/u);
    observe(
      "pendingOrUnknownEffectIsNotDisplayedAsCompleted",
      /not complete/u.test(jsonStatus),
    );

    const jsonRows = await jsonRenderer.locator("tbody").innerText();
    const referenceRows = await referenceRenderer.locator("tbody").innerText();
    assert.equal(jsonRows, referenceRows);
    assert.match(jsonRows, /2/u);
    assert.match(
      await jsonRenderer.locator(".timeline").innerText(),
      /Action committed locally/u,
    );
    observe(
      "sameSurfaceIrPassesBothRenderers",
      (await jsonRenderer.getAttribute("data-surface-id")) ===
        (await referenceRenderer.getAttribute("data-surface-id")) &&
        (await jsonRenderer.getAttribute("data-definition-digest")) ===
          (await referenceRenderer.getAttribute("data-definition-digest")),
    );

    const accessibility = await new AxeBuilder({ page })
      .include("main")
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    observe(
      "accessibilityBaselineCriticalFormListHistoryFlow",
      accessibility.violations.every(
        (violation) =>
          violation.impact !== "critical" && violation.impact !== "serious",
      ),
    );

    const artifactPath = await writeScenarioArtifact(
      repositoryRoot,
      scenario,
      {
        completedAt: new Date().toISOString(),
        failureInjections,
        observations,
        operation: {
          commitSequence: directStatus.receipt.commitSequence.toString(),
          operationId: session.identity.operationId,
          proposalId: session.identity.proposalId,
        },
        protocolRequests: proxy.requests,
        startedAt,
      },
    );
    console.log(`artifact=${artifactPath}`);
  } finally {
    await browser?.close();
    if (web !== undefined) {
      await stopWeb(web);
    }
    await proxy?.close();
    if (authority !== undefined) {
      await stopServer(authority);
    }
    await admin.end();
  }
}

async function signIn(page: Page): Promise<void> {
  await page.goto(webOrigin);
  await page.getByRole("button", { name: "Sign in with OIDC" }).click();
  await page.locator("#username").fill("web-user");
  await page.locator("#password").fill("web-password");
  await page.locator("#kc-login").click();
  await page.locator('main[data-generated-without-llm="true"]').waitFor();
}

async function verifyInitialSurface(
  page: Page,
  actions: ReturnType<typeof actionClient>,
  definitionDigest: string,
): Promise<void> {
  const jsonRenderer = page.locator('[data-renderer="json-render"]');
  const referenceRenderer = page.locator('[data-renderer="reference"]');
  await jsonRenderer.locator("form").waitFor();
  const jsonInput = jsonRenderer.locator('input[name="quantity"]');
  const referenceInput = referenceRenderer.locator('input[name="quantity"]');
  observe(
    "deterministicSurfaceGeneratedWithoutLlm",
    (await page.locator("main").getAttribute("data-compiler")) ===
      "deterministic",
  );
  observe(
    "generatedFormReflectsRealActionInputTypes",
    (await jsonInput.getAttribute("type")) === "number" &&
      (await jsonInput.getAttribute("step")) === "1" &&
      (await referenceInput.getAttribute("type")) === "number" &&
      (await referenceInput.getAttribute("step")) === "1",
  );
  const visibleDigest = await jsonRenderer.getAttribute(
    "data-definition-digest",
  );
  assert.equal(visibleDigest, definitionDigest);
  const visibility = page.getByLabel("Show Action controls");
  await visibility.uncheck();
  assert.equal(await page.locator(".action-form").count(), 0);
  const discovery = await actions.discover({
    definition: {
      definitionId: "inventory.governed",
      digest: definitionDigest,
      revision: 1n,
    },
    resourceId,
  });
  await visibility.check();
  await jsonRenderer.locator("form").waitFor();
  observe(
    "hidingOrShowingControlDoesNotChangeServerAuthority",
    discovery.actions.some(
      (action) =>
        action.actionId === "inventory.requestStock" &&
        action.decision === PolicyDecision.PERMIT,
    ),
  );
  observe(
    "presentationOnlyEditDoesNotChangeDefinitionDigest",
    (await jsonRenderer.getAttribute("data-definition-digest")) ===
      visibleDigest &&
      (await referenceRenderer.getAttribute("data-definition-digest")) ===
        visibleDigest,
  );
}

async function storedActionSession(page: Page) {
  const encoded = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) =>
      candidate.startsWith("zoen.web.action.v1:"),
    );
    return key === undefined ? null : localStorage.getItem(key);
  });
  assert.ok(encoded);
  const value: unknown = JSON.parse(encoded);
  return sessionSchema.parse(value);
}

function observe(name: string, value: boolean): void {
  assert.equal(value, true, name);
  observations[name] = value;
  console.log(`observe.${name}=true`);
}

void main();
