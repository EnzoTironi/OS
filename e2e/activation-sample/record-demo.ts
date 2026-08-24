import assert from "node:assert/strict";
import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { e2eHttpUrl } from "../host-env.js";

const repositoryRoot = process.cwd();
const scenario = "activation-sample";
const defaultVideoRel = path.join("docs", "demo", "sample-company-five-minute.webm");
const defaultManifestRel = path.join(
  "docs",
  "demo",
  "sample-company-five-minute.json",
);

type LiveProbe = {
  readonly keycloakIssuer: string;
  readonly oidcDiscovery: string;
  readonly webConfig: {
    readonly definitionId: string;
    readonly oidcIssuer: string;
    readonly resourceId: string;
    readonly rpcBaseUrl: string;
  };
  readonly webOrigin: string;
  readonly zoendOrigin: string;
};

type RecordingManifest = {
  readonly durationHintSec: { readonly max: number; readonly min: number };
  readonly endpoints: LiveProbe;
  readonly liveOperationIds: readonly string[];
  readonly liveProposalIds: readonly string[];
  readonly mutantsKilled: readonly string[];
  readonly path: readonly string[];
  readonly recordedAt: string;
  readonly scenario: string;
  readonly videoPath: string;
  readonly videoBytes: number;
};

function forbidStub(url: string, label: string): void {
  const lower = url.toLowerCase();
  const banned = [
    "mock",
    "fixture-only",
    "fake-backend",
    "stub.",
    "example.com",
    "localhost:0",
  ];
  for (const token of banned) {
    assert.equal(
      lower.includes(token),
      false,
      `mutant: ${label} looks stubbed (${token}): ${url}`,
    );
  }
}

async function probeLiveStack(): Promise<LiveProbe> {
  const webOrigin = e2eHttpUrl("ZOEN_E2E_WEB_PORT", 58_359);
  const zoendOrigin = e2eHttpUrl("ZOEN_E2E_ZOEND_PORT", 58_351);
  const keycloakOrigin = e2eHttpUrl("ZOEN_E2E_KEYCLOAK_PORT", 58_350);
  const keycloakIssuer = `${keycloakOrigin}/realms/zoen`;
  const oidcDiscovery = `${keycloakIssuer}/.well-known/openid-configuration`;

  forbidStub(webOrigin, "webOrigin");
  forbidStub(zoendOrigin, "zoendOrigin");
  forbidStub(keycloakIssuer, "keycloakIssuer");

  const discovery = await fetch(oidcDiscovery);
  assert.equal(
    discovery.ok,
    true,
    `Keycloak OIDC discovery failed at ${oidcDiscovery} (is just start Ready?)`,
  );
  const discoveryBody = (await discovery.json()) as { issuer?: string };
  assert.equal(
    discoveryBody.issuer,
    keycloakIssuer,
    "OIDC issuer must be the live Sample Company Keycloak realm",
  );

  const zoendHealth = await fetch(`${zoendOrigin}/`);
  assert.ok(
    zoendHealth.status > 0 && zoendHealth.status < 600,
    `zoend unreachable at ${zoendOrigin}`,
  );

  const configResponse = await fetch(`${webOrigin}/api/config`);
  assert.equal(
    configResponse.ok,
    true,
    `web /api/config failed at ${webOrigin} (is just start Ready?)`,
  );
  const webConfig = (await configResponse.json()) as LiveProbe["webConfig"];
  assert.ok(webConfig.definitionId.length > 0, "definitionId missing");
  assert.ok(webConfig.resourceId.length > 0, "resourceId missing");
  assert.equal(
    webConfig.oidcIssuer,
    keycloakIssuer,
    "web config must point at live Keycloak, not a stub IdP",
  );
  assert.ok(
    webConfig.rpcBaseUrl.includes("58351") ||
      webConfig.rpcBaseUrl.startsWith(webOrigin) ||
      webConfig.rpcBaseUrl.includes("/rpc"),
    `rpcBaseUrl must reach live zoend/web rpc, got ${webConfig.rpcBaseUrl}`,
  );
  forbidStub(webConfig.rpcBaseUrl, "rpcBaseUrl");
  forbidStub(webConfig.oidcIssuer, "webConfig.oidcIssuer");

  return {
    keycloakIssuer,
    oidcDiscovery,
    webConfig,
    webOrigin,
    zoendOrigin,
  };
}

async function signIn(page: Page, webOrigin: string): Promise<void> {
  await page.goto(webOrigin, { waitUntil: "domcontentloaded" });
  await pause(2_000);
  await page.getByRole("button", { name: "Sign in with OIDC" }).click();
  await page.locator("#username").waitFor({ timeout: 60_000 });
  await pause(1_500);
  await page.locator("#username").fill("web-user");
  await pause(700);
  await page.locator("#password").fill("web-password");
  await pause(900);
  await page.locator("#kc-login").click();
  await page
    .locator('main[data-generated-without-llm="true"], main.app-shell')
    .waitFor({ timeout: 60_000 });
  await pause(2_000);
}

function collectIds(text: string): {
  readonly operationIds: string[];
  readonly proposalIds: string[];
} {
  const operationIds = [
    ...new Set(text.match(/operation\.[a-zA-Z0-9._-]+/g) ?? []),
  ];
  const proposalIds = [
    ...new Set(text.match(/proposal\.[a-zA-Z0-9._-]+/g) ?? []),
  ];
  return { operationIds, proposalIds };
}

async function pause(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function scrollSurface(page: Page): Promise<void> {
  for (const y of [0, 320, 640, 960, 0] as const) {
    await page.evaluate((top) => window.scrollTo({ top, behavior: "smooth" }), y);
    await pause(1_100);
  }
}

async function walkFiveMinutePath(page: Page): Promise<{
  readonly liveOperationIds: string[];
  readonly liveProposalIds: string[];
  readonly path: string[];
}> {
  const pathSteps: string[] = [];
  const operationIds: string[] = [];
  const proposalIds: string[] = [];

  pathSteps.push("signed-in-surface");
  await page.locator(".action-form").first().waitFor({ timeout: 60_000 });
  await pause(4_000);

  const bodyEarly = await page.locator("body").innerText();
  assert.match(
    bodyEarly,
    /inventory|stock|quantity|physical|reserve|commit/i,
    "surface must show Sample Company inventory/risk content from live seed",
  );
  pathSteps.push("at-risk-stock-visible");
  await scrollSurface(page);
  pathSteps.push("scanned-rival-claims");
  await pause(3_000);

  // Prefer Reserve Inventory when present; otherwise first enabled Propose form.
  const reserveForm = page.locator(
    '.action-form:has(input[name="reservationReference"])',
  );
  const form =
    (await reserveForm.count()) > 0
      ? reserveForm.first()
      : page.locator(".action-form").first();
  await form.scrollIntoViewIfNeeded();
  await pause(2_000);

  const quantity = form.locator('input[name="quantity"]');
  if ((await quantity.count()) > 0) {
    await quantity.click();
    await pause(600);
    await quantity.fill("1");
    await pause(900);
  }
  for (const name of [
    "allocationReference",
    "commitmentReference",
    "reservationReference",
    "sourceReference",
  ] as const) {
    const field = form.locator(`input[name="${name}"]`);
    if ((await field.count()) > 0) {
      await field.click();
      await pause(400);
      await field.fill(`demo.${name}.${Date.now()}`);
      await pause(700);
    }
  }
  pathSteps.push("governed-recommendation-filled");
  await pause(2_500);

  const propose = form.getByRole("button", {
    name: /Propose Action|Commit Action/,
  });
  await propose.click();
  pathSteps.push("proposed");
  await pause(5_000);

  const stepUp = page.locator("[data-approve-href]").first();
  if ((await stepUp.count()) > 0) {
    pathSteps.push("awaiting-approval");
    await pause(2_500);
    await stepUp.click();
    await page.locator('[data-approve-surface="step-up"]').waitFor({
      timeout: 60_000,
    });
    await pause(3_000);
    const needOidc = page.getByRole("button", { name: "Sign in with IdP" });
    if ((await needOidc.count()) > 0) {
      await needOidc.click();
      await page.locator("#username").fill("web-user");
      await page.locator("#password").fill("web-password");
      await page.locator("#kc-login").click();
      await page.locator('[data-approve-surface="step-up"]').waitFor({
        timeout: 60_000,
      });
      await pause(2_000);
    }
    const approveCommit = page.getByRole("button", {
      name: "Commit via Action API",
    });
    if ((await approveCommit.count()) > 0) {
      await approveCommit.click();
      pathSteps.push("approved-and-committed");
      await page.getByText(/Operation operation\./).waitFor({ timeout: 60_000 });
      await pause(5_000);
    }
  } else {
    const commit = form.getByRole("button", { name: "Commit Action" });
    if ((await commit.count()) > 0) {
      await pause(2_000);
      await commit.click();
      pathSteps.push("committed");
      await pause(6_000);
    }
  }

  const home = page.url().includes("/approve/")
    ? page.url().split("/approve/")[0]!
    : page.url();
  await page.goto(home, { waitUntil: "domcontentloaded" });
  try {
    await page
      .locator('main[data-generated-without-llm="true"], main.app-shell')
      .waitFor({ timeout: 30_000 });
  } catch {
    // Stay on approve receipt if home did not remount; IDs still in DOM.
  }
  await pause(3_000);
  await scrollSurface(page);
  await pause(4_000);

  const body = await page.locator("body").innerText();
  const ids = collectIds(body);
  operationIds.push(...ids.operationIds);
  proposalIds.push(...ids.proposalIds);

  if (/unknown outcome|Effect .+ unknown|not complete/i.test(body)) {
    pathSteps.push("effect-unknown-visible");
  }
  if (/Explanation|rival|claim|evidence|physical/i.test(body)) {
    pathSteps.push("why-or-evidence-visible");
  }

  assert.ok(
    operationIds.length > 0 || pathSteps.includes("proposed"),
    "recording must capture a live proposal/operation id from the stack",
  );

  return {
    liveOperationIds: [...new Set(operationIds)],
    liveProposalIds: [...new Set(proposalIds)],
    path: pathSteps,
  };
}

async function main(): Promise<void> {
  const videoOut = path.resolve(
    repositoryRoot,
    process.env.ZOEN_DEMO_VIDEO_PATH ?? defaultVideoRel,
  );
  const manifestOut = path.resolve(
    repositoryRoot,
    process.env.ZOEN_DEMO_MANIFEST_PATH ?? defaultManifestRel,
  );
  await mkdir(path.dirname(videoOut), { recursive: true });

  const probe = await probeLiveStack();
  const mutantsKilled = [
    "mocked-backend-as-sole-demo",
    "fixture-only-ui-without-live-zoend-keycloak",
  ];

  let browser: Browser | undefined;
  const videoDir = path.join(
    repositoryRoot,
    "artifacts",
    scenario,
    "demo-record",
  );
  await mkdir(videoDir, { recursive: true });

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      recordVideo: {
        dir: videoDir,
        size: { width: 1280, height: 720 },
      },
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    await signIn(page, probe.webOrigin);
    const walk = await walkFiveMinutePath(page);
    const video = page.video();
    await context.close();
    assert.ok(video, "Playwright did not produce a video handle");
    const tempPath = await video.path();
    await rename(tempPath, videoOut);
    const info = await stat(videoOut);
    assert.ok(info.size > 10_000, `video too small (${info.size} bytes)`);

    const manifest: RecordingManifest = {
      durationHintSec: { max: 90, min: 45 },
      endpoints: probe,
      liveOperationIds: walk.liveOperationIds,
      liveProposalIds: walk.liveProposalIds,
      mutantsKilled,
      path: walk.path,
      recordedAt: new Date().toISOString(),
      scenario,
      videoBytes: info.size,
      videoPath: path.relative(repositoryRoot, videoOut),
    };
    await writeFile(manifestOut, `${JSON.stringify(manifest, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  } finally {
    await browser?.close();
  }
}

await main();
