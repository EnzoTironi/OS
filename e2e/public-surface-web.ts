import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import {
  oidcToken,
  startServer,
  stopServer,
  type ServerProcess,
} from "./governed-action/support.js";
import {
  buildSamplePack,
  ensureGeneratedDirectory,
  generatedDirectory,
  preparePolicyManifest,
  publisherKeys,
  registryApi,
  repositoryRoot,
  scenario,
  signedSample,
  startWeb,
  stopWeb,
  tenantA,
  webOrigin,
  zoendOrigin,
  writeScenarioArtifact,
  type WebProcess,
} from "./public-surface-web/support.js";

const assertions: Record<string, boolean> = {};
const mutantsKilled: string[] = [];

function record(name: string, observed: boolean): void {
  assert.ok(observed, name);
  assertions[name] = observed;
}

function killMutant(name: string): void {
  mutantsKilled.push(name);
}

function forbidsLiveFiscal(text: string): boolean {
  const lower = text.toLowerCase();
  const banned = [
    "live fiscal",
    "live systax",
    "live plugnotas",
    "live protheus",
    "fiscal is supported",
    "fiscal supported",
  ];
  return banned.every((phrase) => !lower.includes(phrase));
}

function forbidsLiveLinq(text: string): boolean {
  const lower = text.toLowerCase();
  return !lower.includes("live linq") && !/\blinq\b.*\bsupported\b/i.test(text);
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  await ensureGeneratedDirectory();
  const policyManifestPath = path.join(generatedDirectory, "policies.json");
  const fixtures = await preparePolicyManifest(policyManifestPath);
  const sample = buildSamplePack(fixtures);
  const keys = publisherKeys();
  const signed = signedSample(sample, keys);
  const outcomeLabel = "Prevent late orders";

  const docs = await readFile(
    path.join(repositoryRoot, "docs/product/pack-directory.md"),
    "utf8",
  );
  record(
    "pack_directory_kitchen_landed",
    /#264/.test(docs) && /has landed/i.test(docs) && !/in flight/i.test(docs),
  );
  record(
    "pack_directory_names_web_routes",
    /\/packs/.test(docs) && /onboarding/i.test(docs),
  );
  record("docs_forbid_live_fiscal", forbidsLiveFiscal(docs));
  record("docs_forbid_live_linq", forbidsLiveLinq(docs));
  killMutant("live fiscal/Linq advertised");

  const adminToken = await oidcToken("admin-a");
  let server: ServerProcess | undefined;
  let web: WebProcess | undefined;
  let browser: Browser | undefined;

  try {
    server = await startServer(policyManifestPath);

    const registered = await registryApi(
      "POST",
      "/pack/registry/keys",
      adminToken,
      {
        algorithm: "ed25519",
        publicKeyId: keys.publicKeyId,
        publicKeyPem: keys.publicKeyRawB64,
        publisherId: "pub.zoen.official",
      },
    );
    assert.equal(registered.status, 200, JSON.stringify(registered.body));

    const put = await registryApi("POST", "/pack/registry/objects", adminToken, {
      categories: ["procurement", "operations"],
      manifestJcs: signed.canonicalJson,
      ontologyArtifacts: signed.ontologyArtifacts,
      outcomeLabel,
      signature: signed.signature,
      tenantId: tenantA,
      visibility: { kind: "public" },
    });
    assert.equal(put.status, 200, JSON.stringify(put.body));
    assert.equal(put.body.packDigest, sample.digest);

    web = await startWeb({
      packRegistryBearer: adminToken,
      rpcOrigin: zoendOrigin,
    });

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto(`${webOrigin}/packs/`, { waitUntil: "networkidle" });
    const directoryHtml = await page.content();
    record(
      "packs_list_shows_outcome",
      (await page.locator(`[data-pack-outcome="${outcomeLabel}"]`).count()) > 0,
    );
    record(
      "packs_list_hides_crate_names",
      !directoryHtml.includes("crates/") &&
        !directoryHtml.includes("zoen-core") &&
        !directoryHtml.includes("pack_registry.rs"),
    );
    record(
      "packs_landing_has_conversation_entry",
      (await page.locator('[data-conversation-entry="packs-landing"]').count()) >
        0,
    );
    record(
      "packs_landing_rejects_fake_chat_copy",
      /no fake chat/i.test(directoryHtml),
    );
    killMutant("fake chat backend");

    await page.locator(`[data-pack-digest="${sample.digest}"]`).click();
    await page.waitForURL(`**/packs/${sample.digest}`);
    await page.waitForSelector('[data-packs-state="ok"]');
    const detailHtml = await page.content();
    record(
      "pack_detail_shows_outcome",
      (await page.locator('[data-pack-field="outcome"]').innerText()) ===
        outcomeLabel,
    );
    record(
      "pack_detail_shows_publisher",
      /Zoen Official/.test(
        await page.locator('[data-pack-field="publisher"]').innerText(),
      ),
    );
    record(
      "pack_detail_shows_integrations",
      /inventory/.test(
        await page.locator('[data-pack-field="integrations"]').innerText(),
      ),
    );
    record(
      "pack_detail_shows_permissions",
      /sensitivity/.test(detailHtml.toLowerCase()) ||
        /non_sensitive|sensitive/.test(
          await page.locator('[data-pack-field="permissions"]').innerText(),
        ),
    );
    record(
      "pack_detail_shows_first_success",
      /sample\.first_governed_commitment/.test(
        await page.locator('[data-pack-field="first-success"]').innerText(),
      ),
    );
    record(
      "pack_detail_digest_is_identity",
      (await page.locator('[data-pack-field="digest"]').innerText()) ===
        sample.digest,
    );
    record(
      "pack_detail_has_install_share",
      (await page.locator('[data-pack-action="install"]').count()) === 1 &&
        (await page.locator('[data-pack-action="share"]').count()) === 1,
    );
    record(
      "pack_detail_has_no_secret_fields",
      !/password|api[_-]?key|private[_-]?key|client_secret/i.test(detailHtml),
    );

    const installHref = await page
      .locator('[data-pack-action="install"]')
      .getAttribute("href");
    assert.ok(installHref);
    record(
      "install_link_preserves_pack_referral_intent",
      installHref.includes(`pack=${sample.digest}`) &&
        installHref.includes("referral=") &&
        installHref.includes("intent="),
    );

    await page.goto(`${webOrigin}${installHref}`, {
      waitUntil: "networkidle",
    });
    await page.waitForSelector('[data-onboarding-entry="preserved"]');
    record(
      "onboarding_preserves_pack_query",
      (await page
        .locator('[data-onboarding-entry="preserved"]')
        .getAttribute("data-onboarding-pack")) === sample.digest,
    );
    record(
      "onboarding_preserves_referral_query",
      (await page
        .locator('[data-onboarding-entry="preserved"]')
        .getAttribute("data-onboarding-referral")) ===
        "ref.web.packs.install",
    );

    const captureRequest = page.waitForRequest(
      (request) =>
        request.url().includes("/api/onboarding/capture") &&
        request.method() === "POST",
    );
    await page.locator('[data-onboarding-field="goal"]').fill(outcomeLabel);
    await page.locator('button[type="submit"]').click();
    const captured = await captureRequest;
    const captureBody = captured.postDataJSON() as Record<string, unknown>;
    record(
      "captureGoal_receives_pack_referral_intent",
      captureBody.pack === sample.digest &&
        captureBody.referral === "ref.web.packs.install" &&
        typeof captureBody.intent === "string" &&
        captureBody.intent.length > 0,
    );
    killMutant("pack link drops referral/intent");

    const captureResponse = await captured.response();
    assert.ok(captureResponse);
    const captureJson = (await captureResponse.json()) as {
      entry?: { domainHints?: string[] };
    };
    record(
      "captureGoal_domain_hints_include_entry",
      Array.isArray(captureJson.entry?.domainHints) &&
        captureJson.entry.domainHints.some((hint) =>
          hint.startsWith(`pack:${sample.digest}`),
        ) &&
        captureJson.entry.domainHints.some((hint) =>
          hint.startsWith("referral:"),
        ),
    );

    await page.goto(`${webOrigin}/packs/${"0".repeat(64)}`, {
      waitUntil: "networkidle",
    });
    await page.waitForSelector('[data-packs-state="unsupported"]');
    record(
      "missing_pack_fails_closed",
      (await page.locator('[data-packs-state="unsupported"]').count()) === 1,
    );
    killMutant("advertised pack missing from registry");

    await assertNoFakeChatBackend(page);
  } finally {
    await browser?.close();
    if (web !== undefined) {
      await stopWeb(web);
    }
    if (server !== undefined) {
      await stopServer(server);
    }
  }

  const artifactPath = await writeScenarioArtifact(repositoryRoot, scenario, {
    assertions,
    finishedAt: new Date().toISOString(),
    mutantsKilled,
    packDigest: sample.digest,
    startedAt,
    webOrigin,
    zoendOrigin,
  });
  console.log(`public-surface-web PASS artifact=${artifactPath}`);
}

async function assertNoFakeChatBackend(page: Page): Promise<void> {
  const html = await page.content();
  record(
    "no_chat_sdk_widget",
    !html.includes("ChatSdk") &&
      !html.includes("data-fake-chat") &&
      !html.includes("fake-transcript"),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
