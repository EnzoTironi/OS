import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { z } from "zod";
import {
  CommitStatus,
  PolicyDecision,
  ProposalStatus,
} from "../packages/sdk/src/gen/zoen/action/v1/action_pb.js";
import {
  EffectEvidenceOutcome,
  EffectKnowledgeState,
} from "../packages/sdk/src/gen/zoen/effect/v1/effect_pb.js";
import {
  e2eGeneratedDirectory,
  e2eHttpUrl,
  writeScenarioArtifact,
} from "./host-env.js";
import {
  actionClient,
  activateDefinition,
  adapterProviderUrl,
  compileCommercialPackage,
  compileFiscalPackage,
  definitionClient,
  dispatchOnce,
  effectClient,
  oidcToken,
  proposalRequest,
  publishDefinition,
  recordFiscalEvidence,
  registerWorker,
  repositoryRoot,
  startConnector,
  startFiscalAdapter,
  startServer,
  startWorker,
  stopProcess,
  stopServer,
  tenantA,
  tenantB,
  worldClient,
  writeFiscalPolicyManifest,
  type ManagedProcess,
} from "./fiscal-fault-matrix/support.js";

const semanticValueSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("bool"), value: z.boolean() }),
  z.object({ kind: z.literal("decimal"), value: z.string().min(1) }),
  z.object({ kind: z.literal("entity-ref"), value: z.string().min(1) }),
  z.object({ kind: z.literal("integer"), value: z.string().min(1) }),
  z.object({
    amount: z.string().min(1),
    kind: z.literal("quantity"),
    unit: z.string().min(1),
  }),
  z.object({ kind: z.literal("text"), value: z.string().min(1) }),
]);
const contextSchema = z.object({
  actionId: z.enum([
    "fiscal.requestTaxDetermination",
    "fiscal.submitDocument",
  ]),
  entityId: z.enum(["fiscal.intent.live", "fiscal.tax.live"]),
  inputs: z
    .array(
      z.object({
        id: z.string().min(1),
        value: semanticValueSchema,
      }),
    )
    .min(1),
  relations: z
    .array(
      z.object({
        id: z.string().startsWith("fiscal."),
        value: semanticValueSchema,
      }),
    )
    .min(1),
});
const statusSchema = z.object({
  evidenceDigest: z.string().regex(/^[a-f0-9]{64}$/u),
  idempotencyKey: z.string().min(1),
  observedAtMicros: z.string().regex(/^[0-9]+$/u),
  outcome: z.enum(["confirmed", "no_effect", "pending"]),
  providerOperationId: z.string().min(1),
  sourceRef: z.string().min(1),
});

type LiveProvider = "plugnotas" | "protheus" | "systax";

export async function runFiscalLive(provider: LiveProvider): Promise<void> {
  const scenario = `fiscal-${provider}-live`;
  const contextPath = requiredEnvironment(
    process.env.ZOEN_FISCAL_LIVE_CONTEXT_PATH,
    "ZOEN_FISCAL_LIVE_CONTEXT_PATH",
  );
  const contextJson: unknown = JSON.parse(await readFile(contextPath, "utf8"));
  const context = contextSchema.parse(contextJson);
  requireCompatibleAction(provider, context.actionId);
  const providerConfig = liveProviderConfig(provider);
  const [commercial, fiscal] = await Promise.all([
    compileCommercialPackage(),
    compileFiscalPackage(),
  ]);
  const policyManifestPath = path.join(
    e2eGeneratedDirectory(repositoryRoot, scenario),
    "policies.json",
  );
  await writeFiscalPolicyManifest(policyManifestPath, commercial, fiscal);

  const [
    adminAToken,
    adminBToken,
    fiscalAToken,
    workerAToken,
    workerBToken,
    reconcilerAToken,
  ] = await Promise.all([
    oidcToken("domain-admin-a"),
    oidcToken("domain-admin-b"),
    oidcToken("fiscal-agent-a"),
    oidcToken("effect-worker-a"),
    oidcToken("effect-worker-b"),
    oidcToken("effect-reconciler-a"),
  ]);
  const callerASecret = randomBytes(32).toString("hex");
  const callerBSecret = randomBytes(32).toString("hex");
  const connectorCredentials = {
    "secret.provider.a": { secret: callerASecret, tenantId: tenantA },
    "secret.provider.b": { secret: callerBSecret, tenantId: tenantB },
  };
  const processes: ManagedProcess[] = [];
  let server: Awaited<ReturnType<typeof startServer>> | undefined;
  try {
    server = await startServer(policyManifestPath);
    processes.push(
      await startFiscalAdapter({
        callerBindings: {
          [callerASecret]: tenantA,
          [callerBSecret]: tenantB,
        },
        provider,
        providerBaseUrl: providerConfig.baseUrl,
        providerCredential: providerConfig.credential,
        providerTimeoutMs: 10_000,
      }),
    );
    processes.push(
      await startConnector({
        credentials: connectorCredentials,
        providerUrl: adapterProviderUrl(provider),
        timeoutMs: 8_000,
      }),
    );
    processes.push(
      await startWorker({
        [tenantA]: workerAToken,
        [tenantB]: workerBToken,
      }),
    );
    await registerWorker();

    const definitionA = definitionClient(adminAToken);
    const definitionB = definitionClient(adminBToken);
    await Promise.all(
      [commercial, fiscal].flatMap((fixture) => [
        publishDefinition(definitionA, tenantA, fixture),
        publishDefinition(definitionB, tenantB, fixture),
      ]),
    );
    await Promise.all(
      [commercial, fiscal].flatMap((fixture) => [
        activateDefinition(definitionA, tenantA, fixture),
        activateDefinition(definitionB, tenantB, fixture),
      ]),
    );

    const worldClientA = worldClient(fiscalAToken);
    const liveValidAt = new Date();
    for (const [index, relation] of context.relations.entries()) {
      await recordFiscalEvidence(worldClientA, fiscal, {
        at: liveValidAt,
        claimId: `claim.fiscal.live.${provider}.${index}`,
        entityId: context.entityId,
        relationId: relation.id,
        sourceId: `source.fiscal.${provider}.live`,
        tenantId: tenantA,
        value: relation.value,
      });
    }
    const action = actionClient(fiscalAToken);
    const suffix = `${provider}-live-${Date.now()}`;
    const proposal = proposalRequest({
      actionId: context.actionId,
      fixture: fiscal,
      inputs: context.inputs,
      resourceId: context.entityId,
      suffix,
      validAt: liveValidAt,
    });
    const proposed = await action.propose(proposal);
    assert.equal(proposed.decision, PolicyDecision.PERMIT);
    assert.equal(proposed.proposal?.status, ProposalStatus.READY);
    const committed = await action.commit({
      operationId: proposal.operationId,
      proposalId: proposal.proposalId,
    });
    assert.equal(committed.status, CommitStatus.COMMITTED);
    const effectRequestId = committed.receipt?.effectRequestIds[0];
    assert.ok(effectRequestId);
    const idempotencyKey = `idempotency.${tenantA}.${effectRequestId}`;
    await dispatchOnce();

    const effects = effectClient(fiscalAToken);
    const reconciler = effectClient(reconcilerAToken);
    let snapshot = await waitForAttempt(effects, effectRequestId);
    let providerOperationId =
      snapshot.attempts.at(-1)?.providerOperationId ?? "";
    let evidenceDigest = snapshot.attempts.at(-1)?.responseDigest ?? "";
    if (
      snapshot.request?.state === EffectKnowledgeState.ACCEPTED_PENDING ||
      snapshot.request?.state === EffectKnowledgeState.UNKNOWN
    ) {
      const observed = await waitForTerminalStatus(idempotencyKey);
      providerOperationId = observed.providerOperationId;
      evidenceDigest = observed.evidenceDigest;
      const reconciled = await reconciler.reconcile({
        effectRequestId,
        evidence: {
          evidenceDigest: observed.evidenceDigest,
          evidenceId: `evidence.fiscal.${provider}.live.${Date.now()}`,
          idempotencyKey,
          observedAt: timestampFromDate(
            new Date(Number(BigInt(observed.observedAtMicros) / 1_000n)),
          ),
          outcome:
            observed.outcome === "confirmed"
              ? EffectEvidenceOutcome.CONFIRMED
              : EffectEvidenceOutcome.NO_EFFECT,
          providerOperationId: observed.providerOperationId,
          sourceId: `source.fiscal.${provider}.live-status`,
          sourceRef: observed.sourceRef,
        },
      });
      if (reconciled.snapshot === undefined) {
        throw new Error("live reconciliation returned no effect snapshot");
      }
      snapshot = reconciled.snapshot;
    }
    if (snapshot.request?.state !== EffectKnowledgeState.CONFIRMED) {
      throw new Error(
        `${provider} live run did not produce confirmed provider evidence`,
      );
    }
    const artifactPath = await writeScenarioArtifact(
      repositoryRoot,
      scenario,
      {
        completedAt: new Date().toISOString(),
        effectRequestId,
        evidenceDigest,
        live: true,
        provider,
        providerOperationId,
        scenario,
        state: "confirmed",
      },
    );
    process.stdout.write(`${provider} live fiscal run passed: ${artifactPath}\n`);
  } finally {
    for (const process of [...processes].reverse()) {
      await stopProcess(process);
    }
    if (server !== undefined) {
      await stopServer(server);
    }
  }
}

function liveProviderConfig(provider: LiveProvider): {
  readonly baseUrl: string;
  readonly credential: string;
} {
  switch (provider) {
    case "plugnotas":
      return {
        baseUrl: requiredEnvironment(
          process.env.ZOEN_PLUGNOTAS_BASE_URL,
          "ZOEN_PLUGNOTAS_BASE_URL",
        ),
        credential: requiredEnvironment(
          process.env.ZOEN_PLUGNOTAS_API_KEY,
          "ZOEN_PLUGNOTAS_API_KEY",
        ),
      };
    case "protheus":
      return {
        baseUrl: requiredEnvironment(
          process.env.ZOEN_PROTHEUS_BASE_URL,
          "ZOEN_PROTHEUS_BASE_URL",
        ),
        credential: requiredEnvironment(
          process.env.ZOEN_PROTHEUS_API_TOKEN,
          "ZOEN_PROTHEUS_API_TOKEN",
        ),
      };
    case "systax":
      return {
        baseUrl: requiredEnvironment(
          process.env.ZOEN_SYSTAX_BASE_URL,
          "ZOEN_SYSTAX_BASE_URL",
        ),
        credential: requiredEnvironment(
          process.env.ZOEN_SYSTAX_API_TOKEN,
          "ZOEN_SYSTAX_API_TOKEN",
        ),
      };
    default: {
      const exhaustive: never = provider;
      throw new Error(`unsupported live provider: ${String(exhaustive)}`);
    }
  }
}

function requireCompatibleAction(
  provider: LiveProvider,
  actionId: "fiscal.requestTaxDetermination" | "fiscal.submitDocument",
): void {
  if (
    (provider === "systax" &&
      actionId !== "fiscal.requestTaxDetermination") ||
    (provider !== "systax" && actionId !== "fiscal.submitDocument")
  ) {
    throw new Error(`${provider} live context uses an incompatible Action`);
  }
}

async function waitForAttempt(
  client: ReturnType<typeof effectClient>,
  effectRequestId: string,
) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const response = await client.getEffect({ effectRequestId });
    if (
      response.snapshot?.request?.state !==
        EffectKnowledgeState.NOT_ATTEMPTED &&
      response.snapshot !== undefined
    ) {
      return response.snapshot;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("live effect dispatch did not complete");
}

async function waitForTerminalStatus(idempotencyKey: string) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const response = await fetch(
      `${e2eHttpUrl("ZOEN_E2E_CONNECTOR_PORT", 58_273)}/v1/effects/status`,
      {
        body: JSON.stringify({
          credentialRef: "secret.provider.a",
          idempotencyKey,
          tenantId: tenantA,
        }),
        headers: {
          authorization: "Bearer connector-worker-token",
          "content-type": "application/json",
        },
        method: "POST",
      },
    );
    if (response.ok) {
      const body: unknown = await response.json();
      const status = statusSchema.parse(body);
      if (status.outcome !== "pending") {
        return status;
      }
    } else if (response.status !== 404 && response.status !== 502) {
      throw new Error(`live status query failed with HTTP ${response.status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error("live provider did not return terminal evidence");
}

function requiredEnvironment(
  value: string | undefined,
  name: string,
): string {
  if (value === undefined || value === "") {
    throw new Error(`${name} is required for the live fiscal command`);
  }
  return value;
}
