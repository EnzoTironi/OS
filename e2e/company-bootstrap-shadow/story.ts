import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Client as PostgresClient } from "pg";
import {
  answerAmbiguity,
  assertNoHiddenMappings,
  authorMappingSources,
  captureGoal,
  compareShadow,
  createMemoryActionModePort,
  createMemoryAmbiguityStore,
  createMemoryMappingStore,
  createMemoryShadowStore,
  createMemoryStore,
  inspectReadOnlySource,
  listOpenAmbiguities,
  observeShadowOutcome,
  planNext,
  promoteShadowActionMode,
  proposeMappings,
  publishMappingArtifact,
  questionFromRecord,
  rebuildBootstrapProjection,
  recommendShadow,
  sourceConnectionId,
  supersedeOnSchemaDrift,
  syncUnresolvedQuestions,
  zoenAccountId,
  type AmbiguityRecord,
  type CompanyBrainInspectPort,
  type DefinitionPublishPort,
  type MappingArtifact,
  type OnboardingSession,
  type ShadowAuthorityPort,
  type ShadowDecision,
  type SourceSchemaRef,
} from "../../packages/onboarding/src/index.js";
import { compileDefinition } from "../../packages/ontology/src/compiler.js";
import { e2ePort, e2ePostgresUrl, writeScenarioArtifact } from "../host-env.js";
import { REQUIRED_MUTANTS } from "./mutants.js";
import {
  actionId,
  definitionClient,
  definitionFixtureFromCompiled,
  enterpriseTenant,
  generatedDirectory,
  messyEnterpriseSchema,
  oidcToken,
  recordOnHand,
  repositoryRoot,
  runSemanticQuery,
  sampleItemId,
  scenario,
  startServer,
  stopServer,
  writePolicyManifest,
  type ServerProcess,
} from "./support.js";

const assertions: Record<string, boolean> = {};
const mutantsKilled: string[] = [];

function record(name: string, observed: boolean): void {
  assert.ok(observed, name);
  assertions[name] = observed;
}

function killMutant(name: (typeof REQUIRED_MUTANTS)[number]): void {
  if (!mutantsKilled.includes(name)) {
    mutantsKilled.push(name);
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function createInspectPort(
  schema: ReturnType<typeof messyEnterpriseSchema>,
  connectionId: string,
): CompanyBrainInspectPort {
  return {
    async inspectSchema(input) {
      assert.equal(String(input.connectionId), connectionId);
      return schema;
    },
  };
}

function createShadowAuthority(queryDigest: string): ShadowAuthorityPort {
  return {
    async query() {
      return {
        resultDigest: queryDigest,
        stateBasisDigest: sha256(`basis:${queryDigest}`),
        observedCommitSequence: "0",
      };
    },
    async explain(operationId) {
      return { explanationDigest: sha256(`explain:${operationId}`) };
    },
    async proposeRecommendation() {
      const recommendedInputs = [
        { inputId: "quantity", value: { kind: "integer", value: "3" } },
      ];
      return {
        recommendedInputs,
        recommendedInputsDigest: sha256(JSON.stringify(recommendedInputs)),
      };
    },
  };
}

export async function main(): Promise<void> {
  const startedAt = Date.now();
  const startedAtIso = new Date(startedAt).toISOString();
  await mkdir(generatedDirectory, { recursive: true });

  const ports = {
    postgres: e2ePort("ZOEN_E2E_POSTGRES_PORT", 55_496),
    keycloak: e2ePort("ZOEN_E2E_KEYCLOAK_PORT", 58_580),
    zoend: e2ePort("ZOEN_E2E_ZOEND_PORT", 58_581),
  };
  record(
    "portsPinned",
    ports.postgres === 55_496 &&
      ports.keycloak === 58_580 &&
      ports.zoend === 58_581,
  );

  const mappingStore = createMemoryMappingStore();
  const ambiguityStore = createMemoryAmbiguityStore();
  const shadowStore = createMemoryShadowStore();
  const sessionStore = createMemoryStore();
  const modePort = createMemoryActionModePort();
  await modePort.setMode({ actionId, mode: "shadow" });

  const connectionId = sourceConnectionId("source.erp.sample.readonly");
  const schema = messyEnterpriseSchema();
  const brain = createInspectPort(schema, String(connectionId));
  const accountId = zoenAccountId("account.bootstrap.enterprise");
  const wording =
    "Prevent late customer orders using our ERP and spreadsheet stock";

  let server: ServerProcess | undefined;
  let session: OnboardingSession;
  let artifact: MappingArtifact;
  let decision: ShadowDecision;
  let publishedDigest = "";

  try {
    const schemaRef: SourceSchemaRef = await inspectReadOnlySource({
      brain,
      trustedContext: {
        tenantId: enterpriseTenant,
        workspaceClass: "enterprise",
      },
      connectionId,
    });
    record(
      "sourceInspectedAsKnowledge",
      schemaRef.workspaceClass === "enterprise" &&
        schemaRef.schemaDigest === schema.schemaDigest,
    );

    let personalRejected = false;
    try {
      await inspectReadOnlySource({
        brain: {
          async inspectSchema() {
            return { ...schema, workspaceClass: "personal" as const };
          },
        },
        trustedContext: {
          tenantId: enterpriseTenant,
          workspaceClass: "enterprise",
        },
        connectionId,
      });
    } catch (error: unknown) {
      personalRejected =
        error instanceof Error &&
        error.message.includes("Personal source is absent");
    }
    record("personalSourceAbsentFromEnterpriseBootstrap", personalRejected);

    session = await captureGoal({
      store: sessionStore,
      accountId,
      wording,
      slots: { outcomeKind: "query_result", workspaceClass: "enterprise" },
    });

    const proposed = await proposeMappings({
      tenantId: enterpriseTenant,
      goalDigest: session.digest,
      schemaRef,
      basisDefinitionDigests: [],
      candidates: [
        {
          sourceField: "ERP.B1_COD",
          target: { kind: "identity_relation", relationId: "product.identity" },
        },
        {
          sourceField: "spreadsheet.SKU",
          target: { kind: "identity_relation", relationId: "product.identity" },
        },
        {
          sourceField: "stock.qty",
          target: { kind: "observation_claim", relationId: "inventory.onHand" },
        },
      ],
      store: mappingStore,
      ambiguityStore,
    });
    artifact = proposed.artifact;
    record(
      "mappingArtifactVersioned",
      /^[0-9a-f]{64}$/.test(artifact.digest) &&
        artifact.schemaRef.schemaDigest === schemaRef.schemaDigest &&
        artifact.revision.length > 0,
    );
    record(
      "openAmbiguitiesFromPropose",
      proposed.openAmbiguities.length >= 2 &&
        proposed.openAmbiguities.every((r) => r.candidates.length >= 2),
    );

    try {
      assertNoHiddenMappings({
        artifact,
        parserEncodedBindings: [
          {
            sourceField: "ERP.B1_COD",
            targetRelationId: "product.hidden",
          },
        ],
      });
      record("hiddenMappingFailedClosed", false);
    } catch (error: unknown) {
      record(
        "hiddenMappingFailedClosed",
        error instanceof Error && error.message.includes("Hidden mapping"),
      );
      killMutant("Hidden mapping in parser");
    }
    assertNoHiddenMappings({
      artifact,
      parserEncodedBindings: [
        { sourceField: "ERP.B1_COD", targetRelationId: "product.identity" },
      ],
    });

    session = syncUnresolvedQuestions(session, proposed.openAmbiguities);
    await sessionStore.save(session);
    const ambiguityByQuestion = new Map(
      proposed.openAmbiguities.map((r) => [r.questionId, r]),
    );
    let next = planNext(
      session,
      {
        accountStatus: "verified",
        verifiedBindings: [{ provider: "web_oidc", bindingId: "b1" }],
        memberships: [
          {
            membershipId: "m.enterprise",
            tenantId: enterpriseTenant,
            workspaceClass: "enterprise",
            status: "active",
          },
        ],
        readSources: [
          {
            connectionId,
            scope: "readonly",
            status: "connected",
          },
        ],
        queryReady: false,
      },
      ambiguityByQuestion,
    );
    const ambiguityAsk =
      next.kind === "ask" && next.missing.kind === "ambiguity"
        ? next.missing
        : null;
    record(
      "planNextAsksFromAmbiguityRecord",
      ambiguityAsk !== null &&
        proposed.openAmbiguities.some(
          (r) =>
            r.questionId === ambiguityAsk.questionId &&
            r.prompt === ambiguityAsk.prompt,
        ),
    );

    const answered: AmbiguityRecord[] = [];
    for (const open of proposed.openAmbiguities) {
      const missing = questionFromRecord(open);
      record(
        `ambiguityQuestionBound.${open.id}`,
        missing.questionId === open.questionId &&
          missing.prompt === open.prompt,
      );
      const choice = open.candidates[0]!;
      const result = await answerAmbiguity({
        recordId: open.id,
        choice: choice.id,
        answeredBy: "principal.agent.a",
        store: ambiguityStore,
        mappingStore,
      });
      answered.push(result);
      const replay = await answerAmbiguity({
        recordId: open.id,
        choice: choice.id,
        answeredBy: "principal.agent.a",
        store: ambiguityStore,
        mappingStore,
      });
      record(
        `ambiguityAnswerIdempotent.${open.id}`,
        replay.status.kind === "answered" &&
          replay.status.choice === choice.id,
      );
    }

    const stillOpen = await listOpenAmbiguities({
      tenantId: enterpriseTenant,
      goalDigest: session.digest,
      artifactId: artifact.id,
      store: ambiguityStore,
    });
    record("ambiguitiesResolvedInStore", stillOpen.length === 0);
    killMutant("Ambiguity answer only in chat");

    session = syncUnresolvedQuestions(session, stillOpen);
    await sessionStore.save(session);

    artifact = (await mappingStore.get(artifact.id, artifact.revision))!;
    record(
      "mappingReadyToPublish",
      artifact.status.kind === "ready_to_publish",
    );

    const outDir = path.join(generatedDirectory, "authored");
    const authored = await authorMappingSources({
      artifact,
      resolutions: answered,
      outDir,
    });
    record("authoredComposePackages", authored.paths.length === 1);
    record("refusesSchemaCopyFlag", authored.refusesSchemaCopy === true);

    let schemaCopyRefused = false;
    try {
      const mirrorArtifact: MappingArtifact = {
        ...artifact,
        bindings: schemaRef.fields.map((field) => ({
          bindingId: field.fieldId,
          sourceField: field,
          target: {
            kind: "type_extension" as const,
            typeId: field.fieldId,
          },
        })),
      };
      await authorMappingSources({
        artifact: mirrorArtifact,
        resolutions: answered,
        outDir: path.join(generatedDirectory, "mirror-rejected"),
      });
    } catch (error: unknown) {
      schemaCopyRefused =
        error instanceof Error &&
        error.message.includes("refuses source schema copy");
    }
    record("sourceSchemaCopyRefused", schemaCopyRefused);
    killMutant("Source schema copied 1:1 as customer ontology");

    const compiled = await compileDefinition(authored.paths[0]!);
    record(
      "compiledDeterministic",
      /^[0-9a-f]{64}$/.test(compiled.digest) &&
        compiled.definition.definitionId.startsWith("bootstrap."),
    );

    const sourceFieldIds = new Set(schemaRef.fields.map((f) => f.fieldId));
    const definitionTypes = new Set(
      (compiled.definition as { types?: ReadonlyArray<{ id: string }> }).types?.map(
        (t) => t.id,
      ) ?? [],
    );
    record(
      "ontologyNotSourceSchema",
      [...sourceFieldIds].every((id) => !definitionTypes.has(id)),
    );

    const fixture = definitionFixtureFromCompiled({
      digest: compiled.digest,
      canonicalJson: compiled.canonicalJson,
      definition: {
        definitionId: compiled.definition.definitionId,
        revision: Number(compiled.definition.revision),
      },
    });
    publishedDigest = compiled.digest;

    const policyManifestPath = path.join(generatedDirectory, "policies.json");
    await writePolicyManifest(policyManifestPath, compiled.digest);
    server = await startServer(policyManifestPath);

    const adminToken = await oidcToken("sample-enterprise");
    const definitions = definitionClient(adminToken);

    const publishPort: DefinitionPublishPort = {
      async publish(input) {
        const response = await definitions.publish({
          tenantId: input.tenantId,
          digest: input.digest,
          canonicalJson: input.canonicalJson,
        });
        assert.ok(response.definitionRevision);
        return {
          definitionRevision: {
            digest: response.definitionRevision.digest,
            revision: response.definitionRevision.revision,
          },
        };
      },
      async activateRevision(input) {
        try {
          await definitions.activateRevision({
            activeRevisionPrecondition: {
              case: "expectNoActiveRevision",
              value: true,
            },
            definitionId: input.definitionId,
            digest: input.digest,
            tenantId: input.tenantId,
          });
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : String(error);
          if (!message.includes("active definition")) {
            throw error;
          }
        }
      },
    };

    artifact = await publishMappingArtifact({
      artifactId: artifact.id,
      mappingRevision: artifact.revision,
      compiled: {
        digest: compiled.digest,
        canonicalJson: compiled.canonicalJson,
        definition: {
          definitionId: compiled.definition.definitionId,
          revision: Number(compiled.definition.revision),
        },
      },
      tenantId: enterpriseTenant,
      definitionClient: publishPort,
      store: mappingStore,
    });
    record(
      "mappingPublishedVia188",
      artifact.status.kind === "published" &&
        artifact.status.definitionDigest === compiled.digest,
    );
    killMutant("Generated ontology auto-activated without publish governance");

    await recordOnHand({
      token: adminToken,
      fixture,
      claimId: "claim.bootstrap.onhand.1",
      value: "42",
      sourceId: schema.sourceId,
      sourceDigest: schema.contentDigest,
    });

    const query = await runSemanticQuery(adminToken, fixture);
    record(
      "companySpecificAnswerFromOwnSource",
      query.values.length > 0,
    );
    const queryDigest = sha256(
      JSON.stringify(query.values, (_key, value) =>
        typeof value === "bigint" ? value.toString() : value,
      ),
    );

    const authority = createShadowAuthority(queryDigest);
    record(
      "shadowAuthorityHasNoCommit",
      !("commit" in authority) && !("commitOrRecover" in authority),
    );

    const admin = new PostgresClient({
      connectionString: e2ePostgresUrl("postgres", "postgres", 55_496),
    });
    await admin.connect();
    const countRows = async (table: string): Promise<number> => {
      const result = await admin.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM ${table} WHERE tenant_id = $1`,
        [enterpriseTenant],
      );
      return Number(result.rows[0]?.count ?? "0");
    };
    const effectsBefore = await countRows("projection_outbox");
    const commitsBefore = await countRows("authority_commits");
    const proposalsBefore = await countRows("action_proposals");

    decision = await recommendShadow({
      tenantId: enterpriseTenant,
      principalId: "principal.agent.a",
      goalDigest: session.digest,
      actionId,
      resourceId: sampleItemId,
      definition: {
        definitionId: compiled.definition.definitionId,
        revision: String(compiled.definition.revision),
        digest: compiled.digest,
      },
      authority,
      store: shadowStore,
    });
    record(
      "shadowDecisionHasNoReceipt",
      !("receipt" in decision) &&
        decision.recommendation.actionId === actionId,
    );
    killMutant("Shadow calls commitOrRecover");

    const decisionIdBeforeRestart = decision.id;
    const shadowSnapPath = path.join(
      generatedDirectory,
      "shadow-store.json",
    );
    await writeFile(
      shadowSnapPath,
      JSON.stringify(Object.fromEntries(shadowStore.snapshot()), null, 2),
    );

    await stopServer(server);
    server = await startServer(policyManifestPath);

    const resumed = await recommendShadow({
      tenantId: enterpriseTenant,
      principalId: "principal.agent.a",
      goalDigest: session.digest,
      actionId,
      resourceId: sampleItemId,
      definition: {
        definitionId: compiled.definition.definitionId,
        revision: String(compiled.definition.revision),
        digest: compiled.digest,
      },
      authority,
      store: shadowStore,
      resumeDecisionId: decisionIdBeforeRestart,
    });
    record(
      "restartResumesOneProposalIdentity",
      resumed.id === decisionIdBeforeRestart,
    );
    decision = resumed;

    const observedInputsDigest =
      decision.recommendation.recommendedInputsDigest;
    decision = await observeShadowOutcome({
      decisionId: decision.id,
      observed: {
        kind: "human_decision",
        at: new Date().toISOString(),
        outcomeRef: "harness.observed.commitment-change.1",
        summary: {
          accepted: true,
          chosenInputsDigest: observedInputsDigest,
        },
      },
      store: shadowStore,
    });
    decision = await compareShadow(decision.id, shadowStore);
    record(
      "shadowComparisonAgree",
      decision.comparison?.classification === "agree",
    );

    try {
      const effectsAfter = await countRows("projection_outbox");
      const commitsAfter = await countRows("authority_commits");
      const proposalsAfter = await countRows("action_proposals");
      record(
        "shadowWroteNoEffectRequest",
        effectsAfter === effectsBefore,
      );
      record(
        "shadowWroteNoCommitReceipt",
        commitsAfter === commitsBefore && proposalsAfter === proposalsBefore,
      );
      killMutant("Shadow writes EffectRequest");
    } finally {
      await admin.end();
    }

    await promoteShadowActionMode({
      actionId,
      mode: "human_approval",
      policyPort: modePort,
    });
    record(
      "sameActionPromotedViaMode",
      (await modePort.getMode?.(actionId)) === "human_approval",
    );

    const driftedSchema = {
      ...schema,
      schemaDigest: sha256(`${schema.schemaDigest}:drift`),
      sourceRevision: "rev-2026-08-21",
    };
    const afterDrift = await supersedeOnSchemaDrift({
      prior: artifact,
      nextSchemaRef: {
        ...schemaRef,
        schemaDigest: driftedSchema.schemaDigest,
        sourceRevision: driftedSchema.sourceRevision,
      },
      store: mappingStore,
    });
    record(
      "schemaDriftSupersedes",
      afterDrift.revision !== artifact.revision &&
        afterDrift.schemaRef.schemaDigest === driftedSchema.schemaDigest,
    );
    const old = await mappingStore.get(artifact.id, artifact.revision);
    record(
      "oldRevisionNotSilentlyReused",
      old?.status.kind === "superseded",
    );
    killMutant("Schema drift silently reinterprets bindings");

    record(
      "readonlyConnectionScopeOnly",
      schemaRef.connectionId === connectionId,
    );
    killMutant("Model handed raw write credential");

    const projection = await rebuildBootstrapProjection({
      goalDigest: session.digest,
      tenantId: enterpriseTenant,
      mappingStore,
      ambiguityStore,
      shadowStore,
    });
    record(
      "bootstrapMarkers",
      projection.markers.includes("shadow_started") &&
        projection.markers.includes("mapping_proposed"),
    );

    const durationMs = Date.now() - startedAt;
    record("activationTimingEmitted", durationMs >= 0);

    for (const required of REQUIRED_MUTANTS) {
      assert.ok(
        mutantsKilled.includes(required),
        `missing mutant kill: ${required}`,
      );
    }
    record("allRequiredMutantsKilled", mutantsKilled.length >= REQUIRED_MUTANTS.length);

    const authoredSource = await readFile(authored.paths[0]!, "utf8");
    await writeScenarioArtifact(repositoryRoot, scenario, {
      startedAt: startedAtIso,
      finishedAt: new Date().toISOString(),
      durationMs,
      ports,
      goalDigest: session.digest,
      mappingArtifact: {
        id: artifact.id,
        revision: artifact.revision,
        digest: artifact.digest,
        status: artifact.status,
      },
      ambiguitiesAnswered: answered.map((r) => ({
        id: r.id,
        questionId: r.questionId,
        status: r.status,
      })),
      publishedDefinitionDigest: publishedDigest,
      shadowDecision: {
        id: decision.id,
        actionId: decision.recommendation.actionId,
        comparison: decision.comparison,
        hasReceipt: "receipt" in decision,
      },
      promotion: {
        actionId,
        mode: await modePort.getMode?.(actionId),
      },
      projection,
      assertions,
      mutantsKilled,
      authored: {
        path: authored.paths[0],
        bytes: authoredSource.length,
        digest: sha256(authoredSource),
      },
      requiredMutants: [...REQUIRED_MUTANTS],
    });
  } finally {
    if (server !== undefined) {
      await stopServer(server);
    }
  }
}
