import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { Code } from "@connectrpc/connect";
import { chromium, type Browser, type Page } from "playwright";
import { z } from "zod";
import { CommitStatus } from "../packages/sdk/src/gen/zoen/action/v1/action_pb.js";
import {
  QueryConsistencySchema,
  StrongConsistencySchema,
  TypeQuerySchema,
} from "../packages/sdk/src/gen/zoen/world/v1/world_pb.js";
import { compileDeterministicSurface } from "../packages/surface/src/index.js";
import {
  activateDefinition,
  publishDefinition,
  recordEvidence,
  type DomainFixture,
} from "./domain-commercial/support.js";
import {
  actionClient,
  definitionClient,
  expectConnectCode,
  oidcToken,
  repositoryRoot,
  startServer,
  stopServer,
  tenantA,
  worldClient,
  type ServerProcess,
} from "./governed-action/support.js";
import {
  e2eArtifactsDirectory,
  e2eGeneratedDirectory,
  writeScenarioArtifact,
} from "./host-env.js";
import {
  changeCommitmentBinding,
  compileCommercial,
  loadPolicy,
  orderLineOne,
  orderLineTwo,
  scenario,
  startWeb,
  stopWeb,
  typeId,
  typeLimit,
  validAt,
  webOrigin,
  writePolicyManifest,
  zoendOrigin,
  type WebProcess,
} from "./workshop-miniapp/support.js";

const changeCommitmentForm = `form[data-action-binding="${changeCommitmentBinding}"]`;
const observations: Record<string, boolean> = {};

function observe(name: string, condition: boolean): void {
  assert.ok(condition, name);
  observations[name] = condition;
  console.log(`observe.${name}=true`);
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const commercial = await compileCommercial();
  const [activation, actionPolicy] = await Promise.all([
    loadPolicy("activation.cedar"),
    loadPolicy("commercial.cedar"),
  ]);
  const policyManifestPath = path.join(
    e2eGeneratedDirectory(repositoryRoot, scenario),
    "policies.json",
  );
  await writePolicyManifest(
    policyManifestPath,
    commercial,
    activation,
    actionPolicy,
  );

  const [agentToken, adminToken] = await Promise.all([
    oidcToken("agent-a"),
    oidcToken("admin-a"),
  ]);
  const actions = actionClient(agentToken);
  const definitionAgent = definitionClient(agentToken);
  const definitionAdmin = definitionClient(adminToken);
  const world = worldClient(agentToken);
  let authority: ServerProcess | undefined;
  let web: WebProcess | undefined;
  let browser: Browser | undefined;

  try {
    authority = await startServer(policyManifestPath);
    await publishDefinition(definitionAgent, tenantA, commercial);
    await activateDefinition(definitionAdmin, tenantA, commercial);
    await seedOrderLines(world, commercial);

    const listed = await world.semanticQuery({
      consistency: create(QueryConsistencySchema, {
        value: {
          case: "strong",
          value: create(StrongConsistencySchema),
        },
      }),
      definition: commercial.definition,
      entityId: "",
      query: {
        case: "byType",
        value: create(TypeQuerySchema, {
          limit: typeLimit,
          typeId,
        }),
      },
      tenantId: tenantA,
      validAt: timestampFromDate(validAt),
    });
    const listedIds = listed.values.flatMap((result) =>
      result.value?.value.case === "entityRefValue"
        ? [result.value.value.value]
        : [],
    );
    observe(
      "typeQueryReturnsMoreThanOneOrderLine",
      listedIds.length > 1 &&
        listedIds.includes(orderLineOne) &&
        listedIds.includes(orderLineTwo),
    );

    const deniedUnknown = await expectConnectCode(
      () =>
        actions.propose({
          actionId: "commercial.unknownAction",
          definition: commercial.definition,
          expiresAt: timestampFromDate(new Date(Date.now() + 300_000)),
          inputs: [],
          operationId: "operation.workshop.unknown",
          proposalId: "proposal.workshop.unknown",
          resourceId: orderLineOne,
          validAt: timestampFromDate(validAt),
        }),
      Code.PermissionDenied,
    );
    const deniedForeign = await expectConnectCode(
      () =>
        actions.propose({
          actionId: "commercial.changeCommitment",
          definition: commercial.definition,
          expiresAt: timestampFromDate(new Date(Date.now() + 300_000)),
          inputs: [],
          operationId: "operation.workshop.agent-change",
          proposalId: "proposal.workshop.agent-change",
          resourceId: orderLineOne,
          validAt: timestampFromDate(validAt),
        }),
      Code.PermissionDenied,
    );
    observe(
      "manuallyPostingDeniedActionStillDenies",
      deniedUnknown === Code.PermissionDenied &&
        deniedForeign === Code.PermissionDenied,
    );

    web = await startWeb(zoendOrigin);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await signIn(page, web);
    const jsonRenderer = page.locator('[data-renderer="json-render"]');
    await jsonRenderer
      .locator(`button[data-entity-id="${orderLineOne}"]`)
      .waitFor();
    await jsonRenderer
      .locator(`button[data-entity-id="${orderLineTwo}"]`)
      .waitFor();
    observe(
      "miniAppListsTypeQueryObjects",
      (await jsonRenderer
        .locator(`button[data-entity-id="${orderLineOne}"]`)
        .count()) > 0 &&
        (await jsonRenderer
          .locator(`button[data-entity-id="${orderLineTwo}"]`)
          .count()) > 0,
    );
    await jsonRenderer
      .locator(`button[data-entity-id="${orderLineOne}"]`)
      .click();
    await jsonRenderer
      .locator(`article.object-detail[data-entity-id="${orderLineOne}"]`)
      .waitFor();
    observe(
      "miniAppRendersOneObject",
      (await jsonRenderer
        .locator(`article.object-detail[data-entity-id="${orderLineOne}"]`)
        .count()) === 1 &&
        (await page.locator("main").getAttribute("data-type-id")) === typeId,
    );

    const jsonForm = jsonRenderer.locator(changeCommitmentForm);
    await jsonForm.waitFor();
    await jsonForm
      .locator('input[name="correctionOf"]')
      .fill("commercial.correction.workshop-1");
    await jsonForm.locator('input[name="quantity"]').fill("8");
    await jsonForm.locator('input[name="revision"]').fill("2");
    await jsonForm.locator('input[name="unitPrice"]').fill("18.75");
    await jsonForm.getByRole("button", { name: "Propose Action" }).click();
    await jsonForm.getByText(/Proposal .* is ready for commit/u).waitFor();
    const session = await storedActionSession(page);
    await jsonForm.getByRole("button", { name: "Commit Action" }).click();
    await jsonForm.getByText(/Committed locally at sequence/u).waitFor();

    const status = await actions.getOperationStatus({
      operationId: session.identity.operationId,
    });
    observe(
      "changeCommitmentCommitsThroughActionApi",
      status.status === CommitStatus.COMMITTED && status.receipt !== undefined,
    );

    const surface = compileDeterministicSurface({
      actionIds: ["commercial.changeCommitment"],
      definition: {
        definitionId: commercial.metadata.definitionId,
        digest: commercial.digest,
        revision: commercial.metadata.revision.toString(),
      },
      entityId: orderLineOne,
      metadata: commercial.metadata,
      typeQuery: { limit: typeLimit, typeId },
    });
    const surfaceDirectory = e2eArtifactsDirectory(repositoryRoot, scenario);
    await mkdir(surfaceDirectory, { recursive: true });
    const surfacePath = path.join(surfaceDirectory, "surface.json");
    await writeFile(surfacePath, `${JSON.stringify(surface, null, 2)}\n`);
    observe(
      "surfaceDocumentBindsTypeQueryAndSelectedObject",
      surface.queryBindings.some(
        (binding) =>
          binding.ref.kind === "type" && binding.ref.typeId === typeId,
      ) &&
        surface.semanticContext.entityId === orderLineOne &&
        surface.actionBindings.some(
          (binding) =>
            binding.ref.actionId === "commercial.changeCommitment" &&
            binding.ref.resourceId === orderLineOne,
        ) &&
        (await jsonRenderer.getAttribute("data-surface-id")) === surface.id,
    );

    const artifactPath = await writeScenarioArtifact(repositoryRoot, scenario, {
      completedAt: new Date().toISOString(),
      observations,
      operation: {
        commitSequence: status.receipt?.commitSequence.toString(),
        operationId: session.identity.operationId,
        proposalId: session.identity.proposalId,
      },
      sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
      startedAt,
      surfacePath,
      typeQuery: {
        entityIds: listedIds,
        typeId,
      },
    });
    console.log(`artifact=${artifactPath}`);
    console.log(`surface=${surfacePath}`);
  } finally {
    await browser?.close();
    if (web !== undefined) {
      await stopWeb(web);
    }
    if (authority !== undefined) {
      await stopServer(authority);
    }
  }
}

async function seedOrderLines(
  world: ReturnType<typeof worldClient>,
  fixture: DomainFixture,
): Promise<void> {
  const lines = [
    { entityId: orderLineOne, suffix: "1001" },
    { entityId: orderLineTwo, suffix: "1002" },
  ];
  for (const line of lines) {
    await recordEvidence(world, {
      claimId: `claim.workshop.${line.suffix}.committed`,
      entityId: line.entityId,
      fixture,
      relationId: "commercial.committedQuantity",
      sourceId: "source.workshop-seed",
      tenantId: tenantA,
      time: { at: validAt, kind: "instant" },
      value: { amount: "10", kind: "quantity", unit: "each" },
    });
    await recordEvidence(world, {
      claimId: `claim.workshop.${line.suffix}.proposed`,
      entityId: line.entityId,
      fixture,
      relationId: "commercial.proposedQuantity",
      sourceId: "source.workshop-seed",
      tenantId: tenantA,
      time: { at: validAt, kind: "instant" },
      value: { amount: "8", kind: "quantity", unit: "each" },
    });
  }
}

async function signIn(page: Page, web: WebProcess): Promise<void> {
  await page.goto(webOrigin);
  await page.getByRole("button", { name: "Sign in with OIDC" }).click();
  await page.locator("#username").fill("web-user");
  await page.locator("#password").fill("web-password");
  await page.locator("#kc-login").click();
  try {
    await page.locator('main[data-generated-without-llm="true"]').waitFor();
  } catch (cause: unknown) {
    throw new Error(
      [
        cause instanceof Error ? cause.message : String(cause),
        `OIDC browser flow stopped at ${page.url()}`,
        await page.locator("body").innerText(),
        `Web output:\n${web.output.join("")}`,
      ].join("\n\n"),
    );
  }
}

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

async function storedActionSession(page: Page) {
  const encoded = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) =>
      candidate.startsWith("zoen.web.action.v1:"),
    );
    return key === undefined ? null : localStorage.getItem(key);
  });
  assert.ok(encoded);
  return sessionSchema.parse(JSON.parse(encoded));
}

void main();
