import assert from "node:assert/strict";
import {
  execFile,
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
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
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { Client as PostgresClient } from "pg";
import { z } from "zod";
import { DefinitionService } from "../packages/sdk/src/gen/zoen/definition/v1/definition_pb.js";
import {
  DefinitionReferenceSchema,
  EvidenceClaimSchema,
  EvidenceProvenanceSchema,
  EventualConsistencySchema,
  ExactValueSchema,
  LineageRole,
  QueryConsistencySchema,
  QuerySelectionSchema,
  StrongConsistencySchema,
  TemporalIntervalSchema,
  TypeQuerySchema,
  ValidTimeSchema,
  WorldService,
  type DefinitionReference as WorldDefinitionReference,
  type QueryConsistency,
  type QuerySelection,
  type ValidTime,
} from "../packages/sdk/src/gen/zoen/world/v1/world_pb.js";
import {
  e2eGeneratedDirectory,
  e2eHttpUrl,
  e2eListenAddr,
  e2ePort,
  e2ePostgresUrl,
  writeScenarioArtifact,
} from "./host-env.js";

const repositoryRoot = process.cwd();
const composeFile = path.join("e2e", "semantic-query", "compose.yaml");
const composeProject = "zoen-semantic-query";
const definitionPath = path.join(
  repositoryRoot,
  "e2e",
  "semantic-query",
  "definition.canonical.json",
);
const cargoTargetDir = (() => {
  const raw = process.env.CARGO_TARGET_DIR;
  if (raw === undefined || raw === "") {
    return path.join(repositoryRoot, "target");
  }
  return path.isAbsolute(raw) ? raw : path.join(repositoryRoot, raw);
})();
const serverPath = path.join(cargoTargetDir, "debug", "zoend");
const workerPath = path.join(cargoTargetDir, "debug", "zoen-projection");
const postgresPortFallback = 55_433;
const zoendPortFallback = 58_081;
const minioPortFallback = 59_000;
const zoendPort = e2ePort("ZOEN_E2E_ZOEND_PORT", zoendPortFallback);
const applicationDatabaseUrl = e2ePostgresUrl(
  "zoen_app",
  "zoen_app",
  postgresPortFallback,
);
const adminDatabaseUrl = e2ePostgresUrl(
  "postgres",
  "postgres",
  postgresPortFallback,
);
const baseUrl = e2eHttpUrl("ZOEN_E2E_ZOEND_PORT", zoendPortFallback);
const keycloakPortFallback = 58_086;
const oidcIssuer = e2eHttpUrl(
  "ZOEN_E2E_KEYCLOAK_PORT",
  keycloakPortFallback,
  "/realms/zoen",
);
const oidcAudience = "zoend";
const tenantA = "tenant.a";
const tenantB = "tenant.b";
const entityId = "entity.item";
const definitionId = "world.definition";
const tokenResponseSchema = z
  .object({
    access_token: z.string().min(1),
  })
  .passthrough();
const onHand = "world.onHand";
const reserved = "world.reserved";
const available = "world.available";
const binCount = "world.binCount";
const binOne = "entity.bin.one";
const binTwo = "entity.bin.two";
const binThree = "entity.bin.three";
const validStart = new Date("2025-01-01T00:00:00.000Z");
const validEnd = new Date("2025-02-01T00:00:00.000Z");
const validAt = new Date("2025-01-15T00:00:00.000Z");
const instantAt = new Date("2025-01-20T00:00:00.000Z");
const afterInstant = new Date("2025-01-21T00:00:00.000Z");

type DefinitionClient = Client<typeof DefinitionService>;
type WorldClient = Client<typeof WorldService>;

interface ServerProcess {
  child: ChildProcessWithoutNullStreams;
  output: string[];
}

const assertions: Record<string, boolean> = {};
const failureInjections: string[] = [];

function recordAssertion(name: string): void {
  assertions[name] = true;
}

function recordFailureInjection(name: string): void {
  failureInjections.push(name);
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const canonicalDefinition = (
    await readFile(definitionPath, "utf8")
  ).trimEnd();
  const definitionDigest = sha256(canonicalDefinition);
  const definition = create(DefinitionReferenceSchema, {
    definitionId,
    digest: definitionDigest,
    revision: 1n,
  });
  const tokenA = await oidcToken("admin-a");
  const tokenB = await oidcToken("admin-b");
  const clientA = definitionClient(tokenA);
  const clientB = definitionClient(tokenB);
  const worldA = worldClient(tokenA);
  const worldB = worldClient(tokenB);
  const admin = new PostgresClient({ connectionString: adminDatabaseUrl });
  const policyManifestPath = await writeActivationManifest(definitionDigest);
  let server = await startServer(policyManifestPath);
  await admin.connect();

  try {
    const publishedA = await clientA.publish({
      canonicalJson: new TextEncoder().encode(canonicalDefinition),
      digest: definitionDigest,
      tenantId: tenantA,
    });
    assert.equal(publishedA.definitionRevision?.commitSequence, 1n);
    const publishedB = await clientB.publish({
      canonicalJson: new TextEncoder().encode(canonicalDefinition),
      digest: definitionDigest,
      tenantId: tenantB,
    });
    assert.equal(publishedB.definitionRevision?.commitSequence, 1n);

    const activatedA = await clientA.activateRevision({
      activeRevisionPrecondition: {
        case: "expectNoActiveRevision",
        value: true,
      },
      definitionId,
      digest: definitionDigest,
      tenantId: tenantA,
    });
    assert.equal(activatedA.activation?.active?.digest, definitionDigest);
    const activatedB = await clientB.activateRevision({
      activeRevisionPrecondition: {
        case: "expectNoActiveRevision",
        value: true,
      },
      definitionId,
      digest: definitionDigest,
      tenantId: tenantB,
    });
    assert.equal(activatedB.activation?.active?.digest, definitionDigest);

    await expectConnectCode(
      () =>
        query(worldA, {
          consistency: strong(),
          definition,
          entityId,
          selection: relation("world.unknown"),
          tenantId: tenantA,
          validAt,
        }),
      Code.InvalidArgument,
    );
    recordAssertion("unknownRelationRejected");

    await expectConnectCode(
      () =>
        recordInterval(worldA, {
          claimId: "claim.invalidInterval",
          definition,
          end: validStart,
          entityId,
          relationId: onHand,
          sourceId: "source.invalid",
          start: validEnd,
          tenantId: tenantA,
          value: "1",
        }),
      Code.InvalidArgument,
    );
    recordFailureInjection("inverted-valid-time");
    await expectConnectCode(
      () =>
        recordInterval(worldA, {
          claimId: "claim.invalidRelation",
          definition,
          end: validEnd,
          entityId,
          relationId: "world.unknown",
          sourceId: "source.invalid",
          start: validStart,
          tenantId: tenantA,
          value: "1",
        }),
      Code.InvalidArgument,
    );
    recordFailureInjection("unknown-relation");
    assert.equal(await rowCount(admin, "authority_commits", tenantA), 2);
    assert.equal(await rowCount(admin, "semantic_claims", tenantA), 0);
    assert.equal(await rowCount(admin, "projection_outbox", tenantA), 2);
    recordAssertion("invalidEvidenceAtomic");

    assert.equal(
      await recordInterval(worldA, {
        claimId: "claim.primary",
        definition,
        end: validEnd,
        entityId,
        relationId: onHand,
        sourceId: "source.sensor",
        start: validStart,
        tenantId: tenantA,
        value: "10",
      }),
      3n,
    );
    assert.equal(
      await recordInterval(worldA, {
        claimId: "claim.rival",
        definition,
        end: validEnd,
        entityId,
        relationId: onHand,
        sourceId: "source.inspector",
        start: validStart,
        tenantId: tenantA,
        value: "12",
      }),
      4n,
    );
    assert.equal(
      await recordInterval(worldA, {
        claimId: "claim.reserved",
        definition,
        end: validEnd,
        entityId,
        relationId: reserved,
        sourceId: "source.planner",
        start: validStart,
        tenantId: tenantA,
        value: "3",
      }),
      5n,
    );

    await compose("stop", "minio");
    await expectCommandFailure(workerPath, ["--once", tenantA], workerEnvironment());
    assert.equal(await projectionState(admin, tenantA), null);
    await compose("start", "minio");
    await waitForObjectStore();
    recordFailureInjection("object-store-outage");
    recordAssertion("objectStoreOutagePreservesWatermark");

    await installProjectionPublishFailure(admin);
    try {
      await expectCommandFailure(
        workerPath,
        ["--once", tenantA],
        workerEnvironment(),
      );
    } finally {
      await removeProjectionPublishFailure(admin);
    }
    assert.equal(await projectionState(admin, tenantA), null);
    assert.ok((await objectKeys()).length >= 2);
    recordFailureInjection("projection-publish-failure");
    recordAssertion("projectionFailureLeavesNoPublishedWatermark");

    const firstProjection = await runProjection(["--once", tenantA]);
    assert.equal(firstProjection.throughCommit, 5);
    assert.equal(firstProjection.projectedRows, 3);
    assert.equal(firstProjection.wroteManifest, true);
    const firstManifestCount = await rowCount(
      admin,
      "projection_manifests",
      tenantA,
    );
    const duplicateProjection = await runProjection(["--once", tenantA]);
    assert.equal(duplicateProjection.wroteManifest, false);
    assert.equal(
      await rowCount(admin, "projection_manifests", tenantA),
      firstManifestCount,
    );
    recordFailureInjection("duplicate-projection-delivery");
    recordAssertion("duplicateOutboxDeliveryIdempotent");

    const strongAfterReserved = await query(worldA, {
      consistency: strong(),
      definition,
      entityId,
      selection: computation(available),
      tenantId: tenantA,
      validAt,
    });
    const snapshotAfterReserved = await query(worldA, {
      consistency: snapshot(5n),
      definition,
      entityId,
      selection: computation(available),
      tenantId: tenantA,
      validAt,
    });
    assert.equal(strongAfterReserved.actualCommitSequence, 5n);
    assert.equal(snapshotAfterReserved.actualCommitSequence, 5n);
    assert.deepEqual(
      semanticShape(strongAfterReserved),
      semanticShape(snapshotAfterReserved),
    );
    assert.deepEqual(integerValues(strongAfterReserved), ["7", "9"]);
    assertComputationLineage(strongAfterReserved, 2);
    recordAssertion("crossRelationLineageComplete");
    recordAssertion("postgresParquetLineageEquivalent");

    await stopServer(server);
    server = await startServer(policyManifestPath);
    const rivalsAfterRestart = await query(worldA, {
      consistency: strong(),
      definition,
      entityId,
      selection: relation(onHand),
      tenantId: tenantA,
      validAt,
    });
    assert.deepEqual(integerValues(rivalsAfterRestart), ["10", "12"]);
    assertRelationLineage(rivalsAfterRestart, 2);
    recordAssertion("contradictoryClaimsSurviveRestart");
    recordAssertion("rivalLineageComplete");

    assert.equal(
      await recordInterval(worldA, {
        claimId: "claim.late",
        definition,
        end: validEnd,
        entityId,
        relationId: onHand,
        sourceId: "source.audit",
        start: validStart,
        tenantId: tenantA,
        value: "11",
      }),
      6n,
    );
    const knownThen = await query(worldA, {
      consistency: snapshot(5n),
      definition,
      entityId,
      selection: relation(onHand),
      tenantId: tenantA,
      validAt,
    });
    const nowBelievedThen = await query(worldA, {
      consistency: strong(),
      definition,
      entityId,
      selection: relation(onHand),
      tenantId: tenantA,
      validAt,
    });
    assert.deepEqual(integerValues(knownThen), ["10", "12"]);
    assert.deepEqual(integerValues(nowBelievedThen), ["10", "11", "12"]);
    const snapshotAfterLate = await query(worldA, {
      consistency: snapshot(6n),
      definition,
      entityId,
      selection: relation(onHand),
      tenantId: tenantA,
      validAt,
    });
    assert.deepEqual(
      semanticShape(snapshotAfterLate),
      semanticShape(nowBelievedThen),
    );
    recordAssertion("lateEvidenceSeparatesKnowledgeCuts");
    recordAssertion("snapshotReadsAuthorityWhenProjectionBehind");
    const eventualBehind = await query(worldA, {
      consistency: eventual(),
      definition,
      entityId,
      selection: relation(onHand),
      tenantId: tenantA,
      validAt,
    });
    assert.equal(eventualBehind.actualCommitSequence, 5n);
    assert.deepEqual(integerValues(eventualBehind), ["10", "12"]);
    await expectConnectCode(
      () =>
        query(worldA, {
          consistency: atLeast(6n),
          definition,
          entityId,
          selection: relation(onHand),
          tenantId: tenantA,
          validAt,
        }),
      Code.FailedPrecondition,
    );
    recordFailureInjection("stale-at-least");
    recordAssertion("staleAtLeastRejected");

    const caughtUp = await runProjection(["--once", tenantA]);
    assert.equal(caughtUp.throughCommit, 6);
    const atLeastAfterLate = await query(worldA, {
      consistency: atLeast(6n),
      definition,
      entityId,
      selection: relation(onHand),
      tenantId: tenantA,
      validAt,
    });
    assert.equal(atLeastAfterLate.actualCommitSequence, 6n);
    assert.deepEqual(integerValues(atLeastAfterLate), ["10", "11", "12"]);
    const snapshotReservedAfterLateProjection = await query(worldA, {
      consistency: snapshot(5n),
      definition,
      entityId,
      selection: computation(available),
      tenantId: tenantA,
      validAt,
    });
    assert.deepEqual(
      semanticShape(snapshotReservedAfterLateProjection),
      semanticShape(snapshotAfterReserved),
    );
    recordAssertion("snapshotCutFiltersAheadProjection");

    assert.equal(
      await recordInstant(worldA, {
        claimId: "claim.instant",
        definition,
        entityId,
        instant: instantAt,
        relationId: onHand,
        sourceId: "source.instant",
        tenantId: tenantA,
        value: "99",
      }),
      7n,
    );
    const atInstant = await query(worldA, {
      consistency: strong(),
      definition,
      entityId,
      selection: relation(onHand),
      tenantId: tenantA,
      validAt: instantAt,
    });
    const afterInstantResult = await query(worldA, {
      consistency: strong(),
      definition,
      entityId,
      selection: relation(onHand),
      tenantId: tenantA,
      validAt: afterInstant,
    });
    assert.deepEqual(integerValues(atInstant), ["10", "11", "12", "99"]);
    assert.deepEqual(integerValues(afterInstantResult), ["10", "11", "12"]);
    recordAssertion("instantIsNotOpenEnded");

    assert.equal(
      await recordInterval(worldB, {
        claimId: "claim.primary",
        definition,
        end: validEnd,
        entityId,
        relationId: onHand,
        sourceId: "source.sensor",
        start: validStart,
        tenantId: tenantB,
        value: "100",
      }),
      3n,
    );
    assert.equal(
      await recordInterval(worldB, {
        claimId: "claim.reserved",
        definition,
        end: validEnd,
        entityId,
        relationId: reserved,
        sourceId: "source.planner",
        start: validStart,
        tenantId: tenantB,
        value: "1",
      }),
      4n,
    );
    await runProjection(["--once", tenantB]);
    const tenantBResult = await query(worldB, {
      consistency: snapshot(4n),
      definition,
      entityId,
      selection: relation(onHand),
      tenantId: tenantB,
      validAt,
    });
    assert.deepEqual(integerValues(tenantBResult), ["100"]);
    assert.deepEqual(integerValues(nowBelievedThen), ["10", "11", "12"]);
    await expectConnectCode(
      () =>
        query(worldA, {
          consistency: strong(),
          definition,
          entityId,
          selection: relation(onHand),
          tenantId: tenantB,
          validAt,
        }),
      Code.PermissionDenied,
    );
    recordAssertion("tenantCollisionsIsolated");

    assert.equal(
      await recordInterval(worldA, {
        claimId: "claim.huge",
        definition,
        end: validEnd,
        entityId: "entity.overflow",
        relationId: onHand,
        sourceId: "source.huge",
        start: validStart,
        tenantId: tenantA,
        value: "170141183460469231731687303715884105728",
      }),
      8n,
    );
    assert.equal(
      await recordInterval(worldA, {
        claimId: "claim.hugeReserved",
        definition,
        end: validEnd,
        entityId: "entity.overflow",
        relationId: reserved,
        sourceId: "source.planner",
        start: validStart,
        tenantId: tenantA,
        value: "1",
      }),
      9n,
    );
    await expectConnectCode(
      () =>
        query(worldA, {
          consistency: strong(),
          definition,
          entityId: "entity.overflow",
          selection: computation(available),
          tenantId: tenantA,
          validAt,
        }),
      Code.FailedPrecondition,
    );
    recordFailureInjection("computation-overflow");
    recordAssertion("computationEvaluationErrorTyped");
    const latestProjection = await runProjection(["--once", tenantA]);
    assert.equal(latestProjection.throughCommit, 9);

    const strongAfterHuge = await query(worldA, {
      consistency: strong(),
      definition,
      entityId,
      selection: computation(available),
      tenantId: tenantA,
      validAt,
    });
    const snapshotAfterHuge = await query(worldA, {
      consistency: snapshot(9n),
      definition,
      entityId,
      selection: computation(available),
      tenantId: tenantA,
      validAt,
    });
    assert.deepEqual(semanticShape(strongAfterHuge), semanticShape(snapshotAfterHuge));
    assert.deepEqual(integerValues(strongAfterHuge), ["7", "8", "9"]);
    assertComputationLineage(strongAfterHuge, 3);

    const activeBeforeLoss = await projectionState(admin, tenantA);
    assert.ok(activeBeforeLoss);
    await overwriteObject(activeBeforeLoss.parquetObjectKey, "corrupt parquet");
    await expectConnectCode(
      () =>
        query(worldA, {
          consistency: snapshot(9n),
          definition,
          entityId,
          selection: relation(onHand),
          tenantId: tenantA,
          validAt,
        }),
      Code.DataLoss,
    );
    recordFailureInjection("corrupt-parquet-object");
    recordAssertion("corruptParquetDetected");
    await removeObject(activeBeforeLoss.parquetObjectKey);
    await expectConnectCode(
      () =>
        query(worldA, {
          consistency: snapshot(9n),
          definition,
          entityId,
          selection: relation(onHand),
          tenantId: tenantA,
          validAt,
        }),
      Code.Unavailable,
    );
    recordFailureInjection("missing-parquet-object");
    recordAssertion("missingParquetDetected");
    const strongWithoutProjection = await query(worldA, {
      consistency: strong(),
      definition,
      entityId,
      selection: relation(onHand),
      tenantId: tenantA,
      validAt,
    });
    assert.deepEqual(integerValues(strongWithoutProjection), ["10", "11", "12"]);

    const authorityBeforeRebuild = await rowCount(
      admin,
      "authority_commits",
      tenantA,
    );
    const claimsBeforeRebuild = await rowCount(
      admin,
      "semantic_claims",
      tenantA,
    );
    const rebuilt = await runProjection(["--rebuild", tenantA]);
    assert.equal(rebuilt.throughCommit, 9);
    assert.notEqual(rebuilt.manifestDigest, activeBeforeLoss.manifestDigest);
    assert.equal(
      await rowCount(admin, "authority_commits", tenantA),
      authorityBeforeRebuild,
    );
    assert.equal(
      await rowCount(admin, "semantic_claims", tenantA),
      claimsBeforeRebuild,
    );
    const rebuiltResult = await query(worldA, {
      consistency: snapshot(9n),
      definition,
      entityId,
      selection: computation(available),
      tenantId: tenantA,
      validAt,
    });
    assert.deepEqual(semanticShape(strongAfterHuge), semanticShape(rebuiltResult));
    recordAssertion("projectionRebuildAddsNoBusinessHistory");

    await stopServer(server);
    server = await startServer(policyManifestPath);
    const finalRivals = await query(worldA, {
      consistency: strong(),
      definition,
      entityId,
      selection: relation(onHand),
      tenantId: tenantA,
      validAt,
    });
    assert.deepEqual(integerValues(finalRivals), ["10", "11", "12"]);

    assert.equal(
      await recordInterval(worldA, {
        claimId: "claim.bin.one",
        definition,
        end: validEnd,
        entityId: binOne,
        relationId: binCount,
        sourceId: "source.bin",
        start: validStart,
        tenantId: tenantA,
        value: "1",
      }),
      10n,
    );
    assert.equal(
      await recordInterval(worldA, {
        claimId: "claim.bin.two",
        definition,
        end: validEnd,
        entityId: binTwo,
        relationId: binCount,
        sourceId: "source.bin",
        start: validStart,
        tenantId: tenantA,
        value: "2",
      }),
      11n,
    );
    assert.equal(
      await recordInterval(worldA, {
        claimId: "claim.bin.three",
        definition,
        end: validEnd,
        entityId: binThree,
        relationId: binCount,
        sourceId: "source.bin",
        start: validStart,
        tenantId: tenantA,
        value: "3",
      }),
      12n,
    );
    const binIds = [binOne, binTwo, binThree];
    const typeLimited = await query(worldA, {
      consistency: strong(),
      definition,
      tenantId: tenantA,
      typeQuery: { limit: 2, typeId: "world.Bin" },
      validAt,
    });
    const limitedIds = entityValues(typeLimited);
    assert.equal(limitedIds.length, 2);
    for (const id of limitedIds) {
      assert.ok(binIds.includes(id));
    }
    assert.equal(
      typeLimited.values.every((result) => result.dependencies.length === 0),
      true,
    );
    recordAssertion("typeQueryLimitExcludesThird");
    const typeAll = await query(worldA, {
      consistency: strong(),
      definition,
      tenantId: tenantA,
      typeQuery: { limit: 10, typeId: "world.Bin" },
      validAt,
    });
    assert.deepEqual(entityValues(typeAll).sort(), binIds.slice().sort());
    assert.equal(
      entityValues(typeAll).includes(entityId) ||
        entityValues(typeAll).includes("entity.overflow"),
      false,
    );
    recordAssertion("typeQueryReturnsEntitiesOfType");
    const items = await query(worldA, {
      consistency: strong(),
      definition,
      tenantId: tenantA,
      typeQuery: { limit: 2, typeId: "world.Item" },
      validAt,
    });
    assert.deepEqual(entityValues(items).sort(), [entityId, "entity.overflow"].sort());
    recordAssertion("typeQueryDoesNotReturnOtherTypes");

    const postgresVersion = (
      await admin.query<{ server_version: string }>("SHOW server_version")
    ).rows[0]?.server_version;
    assert.match(postgresVersion ?? "", /^18\./);
    const minioVersion = await composeOutput("exec", "-T", "minio", "minio", "--version");
    const dataFusionVersion = (
      await command("cargo", ["tree", "--package", "zoen-query", "--depth", "1"])
    )
      .split("\n")
      .find((line) => line.includes("datafusion v"))
      ?.trim();
    assert.ok(dataFusionVersion);
    const sourceCommit = await command("git", ["rev-parse", "HEAD"]);
    const protocol = await readFile(
      path.join(repositoryRoot, "proto", "zoen", "world", "v1", "world.proto"),
    );
    const activeAfterRebuild = await projectionState(admin, tenantA);
    assert.ok(activeAfterRebuild);
    const manifest = {
      assertions,
      authMode: "oidc",
      componentVersions: {
        dataFusion: dataFusionVersion,
        minio: minioVersion.split("\n")[0],
        postgres: postgresVersion,
      },
      definitionDigest,
      failureInjections,
      finishedAt: new Date().toISOString(),
      observedCuts: {
        authoritative: strongAfterHuge.actualCommitSequence.toString(),
        knownThen: knownThen.knowledgeCut.toString(),
        nowBelievedThen: nowBelievedThen.knowledgeCut.toString(),
        projected: rebuiltResult.actualCommitSequence.toString(),
      },
      projection: {
        manifestDigest: activeAfterRebuild.manifestDigest,
        parquetDigest: activeAfterRebuild.parquetDigest,
        parquetObjectKey: activeAfterRebuild.parquetObjectKey,
        throughCommit: activeAfterRebuild.throughCommit,
      },
      protocolDigest: createHash("sha256").update(protocol).digest("hex"),
      scenario: "semantic-query",
      sourceCommit,
      startedAt,
    };
    await writeScenarioArtifact(repositoryRoot, "semantic-query", manifest);
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  } finally {
    await admin.end();
    if (server.child.exitCode === null) {
      await stopServer(server);
    }
  }
}

function definitionClient(token: string): DefinitionClient {
  return createClient(
    DefinitionService,
    createConnectTransport({
      baseUrl,
      httpVersion: "1.1",
      interceptors: [authorization(token)],
    }),
  );
}

function worldClient(token: string): WorldClient {
  return createClient(
    WorldService,
    createConnectTransport({
      baseUrl,
      httpVersion: "1.1",
      interceptors: [authorization(token)],
    }),
  );
}

function authorization(token: string): Interceptor {
  return (next) => async (request) => {
    request.header.set("authorization", `Bearer ${token}`);
    return next(request);
  };
}

interface EvidenceInput {
  claimId: string;
  definition: WorldDefinitionReference;
  entityId: string;
  relationId: string;
  sourceId: string;
  tenantId: string;
  value: string;
}

interface IntervalEvidenceInput extends EvidenceInput {
  end: Date;
  start: Date;
}

interface InstantEvidenceInput extends EvidenceInput {
  instant: Date;
}

async function recordInterval(
  client: WorldClient,
  input: IntervalEvidenceInput,
): Promise<bigint> {
  return record(
    client,
    input,
    create(ValidTimeSchema, {
      value: {
        case: "interval",
        value: create(TemporalIntervalSchema, {
          end: timestampFromDate(input.end),
          start: timestampFromDate(input.start),
        }),
      },
    }),
  );
}

async function recordInstant(
  client: WorldClient,
  input: InstantEvidenceInput,
): Promise<bigint> {
  return record(
    client,
    input,
    create(ValidTimeSchema, {
      value: {
        case: "instant",
        value: timestampFromDate(input.instant),
      },
    }),
  );
}

async function record(
  client: WorldClient,
  input: EvidenceInput,
  validTime: ValidTime,
): Promise<bigint> {
  const response = await client.recordEvidence({
    claim: create(EvidenceClaimSchema, {
      claimId: input.claimId,
      definition: input.definition,
      entityId: input.entityId,
      provenance: create(EvidenceProvenanceSchema, {
        sourceDigest: sha256(input.sourceId),
        sourceId: input.sourceId,
        sourceRef: `urn:evidence:${input.claimId}`,
      }),
      relationId: input.relationId,
      validTime,
      value: create(ExactValueSchema, {
        value: {
          case: "integerValue",
          value: input.value,
        },
      }),
    }),
    tenantId: input.tenantId,
  });
  assert.equal(response.claimId, input.claimId);
  return response.commitSequence;
}

interface QueryInput {
  consistency: QueryConsistency;
  definition: WorldDefinitionReference;
  entityId?: string;
  selection?: QuerySelection;
  tenantId: string;
  typeQuery?: { limit: number; typeId: string };
  validAt: Date;
}

async function query(client: WorldClient, input: QueryInput) {
  const response = await client.semanticQuery({
    consistency: input.consistency,
    definition: input.definition,
    entityId: input.entityId ?? "",
    query: input.typeQuery
      ? {
          case: "byType" as const,
          value: create(TypeQuerySchema, {
            limit: input.typeQuery.limit,
            typeId: input.typeQuery.typeId,
          }),
        }
      : { case: undefined },
    selection: input.selection,
    tenantId: input.tenantId,
    validAt: timestampFromDate(input.validAt),
  });
  assert.equal(response.definition?.definitionId, input.definition.definitionId);
  assert.equal(response.definition?.digest, input.definition.digest);
  assert.equal(response.definition?.revision, input.definition.revision);
  assert.ok(response.actualCommitSequence > 0n);
  assert.equal(response.knowledgeCut, response.actualCommitSequence);
  assert.ok(response.validAt);
  return response;
}

function strong() {
  return create(QueryConsistencySchema, {
    value: {
      case: "strong",
      value: create(StrongConsistencySchema),
    },
  });
}

function atLeast(commit: bigint) {
  return create(QueryConsistencySchema, {
    value: { case: "atLeastCommit", value: commit },
  });
}

function snapshot(commit: bigint) {
  return create(QueryConsistencySchema, {
    value: { case: "snapshotCommit", value: commit },
  });
}

function eventual() {
  return create(QueryConsistencySchema, {
    value: {
      case: "eventual",
      value: create(EventualConsistencySchema),
    },
  });
}

function relation(relationId: string) {
  return create(QuerySelectionSchema, {
    value: { case: "relationId", value: relationId },
  });
}

function computation(computationId: string) {
  return create(QuerySelectionSchema, {
    value: { case: "computationId", value: computationId },
  });
}

function integerValues(response: Awaited<ReturnType<typeof query>>): string[] {
  return response.values.map((result) => {
    assert.equal(result.value?.value.case, "integerValue");
    return String(result.value.value.value);
  });
}

function entityValues(response: Awaited<ReturnType<typeof query>>): string[] {
  return response.values.map((result) => {
    assert.equal(result.value?.value.case, "entityRefValue");
    return String(result.value.value.value);
  });
}

function semanticShape(response: Awaited<ReturnType<typeof query>>) {
  return {
    actualCommitSequence: response.actualCommitSequence.toString(),
    definition: {
      definitionId: response.definition?.definitionId,
      digest: response.definition?.digest,
      revision: response.definition?.revision.toString(),
    },
    knowledgeCut: response.knowledgeCut.toString(),
    values: response.values.map((result) => ({
      dependencies: result.dependencies.map((dependency) => ({
        claimId: dependency.claimId,
        commitSequence: dependency.commitSequence.toString(),
        entityId: dependency.entityId,
        relationId: dependency.relationId,
        role: dependency.role,
        sourceDigest: dependency.sourceDigest,
        sourceId: dependency.sourceId,
        sourceRef: dependency.sourceRef,
      })),
      value: {
        case: result.value?.value.case,
        value:
          result.value?.value.case === "integerValue"
            ? result.value.value.value
            : undefined,
      },
    })),
  };
}

function assertRelationLineage(
  response: Awaited<ReturnType<typeof query>>,
  claimCount: number,
): void {
  assert.equal(response.values.length, claimCount);
  for (const value of response.values) {
    assert.equal(
      value.dependencies.filter(
        (dependency) => dependency.role === LineageRole.SUPPORTING,
      ).length,
      1,
    );
    assert.equal(
      value.dependencies.filter(
        (dependency) => dependency.role === LineageRole.RIVAL,
      ).length,
      claimCount - 1,
    );
  }
}

function assertComputationLineage(
  response: Awaited<ReturnType<typeof query>>,
  onHandClaimCount: number,
): void {
  assert.equal(response.values.length, onHandClaimCount);
  for (const value of response.values) {
    const computationDependencies = value.dependencies.filter(
      (dependency) =>
        dependency.role === LineageRole.COMPUTATION_DEPENDENCY,
    );
    assert.equal(computationDependencies.length, 2);
    assert.deepEqual(
      computationDependencies
        .map((dependency) => dependency.relationId)
        .sort(),
      [onHand, reserved].sort(),
    );
    assert.equal(
      value.dependencies.filter(
        (dependency) =>
          dependency.role === LineageRole.RIVAL &&
          dependency.relationId === onHand,
      ).length,
      onHandClaimCount - 1,
    );
  }
}

async function writeActivationManifest(definitionDigest: string): Promise<string> {
  const source = await readFile(
    path.join(repositoryRoot, "e2e", "semantic-query", "activation.cedar"),
    "utf8",
  );
  const outputPath = path.join(
    e2eGeneratedDirectory(repositoryRoot, "semantic-query"),
    "policies.json",
  );
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify(
      {
        policies: [
          {
            actionId: "zoen.definition.activate",
            definitionDigest,
            digest: sha256(source),
            policyId: "policy.activation.v1",
            revision: 1,
            source,
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  return outputPath;
}

async function oidcToken(clientId: string): Promise<string> {
  const response = await fetch(`${oidcIssuer}/protocol/openid-connect/token`, {
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: `${clientId}-secret`,
      grant_type: "client_credentials",
    }),
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    method: "POST",
  });
  const body: unknown = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  return tokenResponseSchema.parse(body).access_token;
}

async function startServer(policyManifestPath: string): Promise<ServerProcess> {
  const output: string[] = [];
  const child = spawn(serverPath, [], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      ...workerEnvironment(),
      ZOEN_CEDAR_POLICY_MANIFEST: policyManifestPath,
      ZOEN_LISTEN_ADDR: e2eListenAddr("ZOEN_E2E_ZOEND_PORT", zoendPortFallback),
      ZOEN_OIDC_AUDIENCE: oidcAudience,
      ZOEN_OIDC_ISSUER: oidcIssuer,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdin.end();
  child.stdout.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  await waitForPort(child, output);
  return { child, output };
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
  throw new Error(`zoend did not listen on port ${zoendPort}:\n${output.join("")}`);
}

function canConnect(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port: zoendPort });
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

function workerEnvironment(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    DATABASE_URL: applicationDatabaseUrl,
    S3_ACCESS_KEY_ID: "zoen-access",
    S3_ALLOW_HTTP: "true",
    S3_BUCKET: "zoen-projections",
    S3_ENDPOINT: e2eHttpUrl("ZOEN_E2E_MINIO_PORT", minioPortFallback),
    S3_REGION: "us-east-1",
    S3_SECRET_ACCESS_KEY: "zoen-secret",
  };
}

async function runProjection(arguments_: readonly string[]) {
  const output = await command(workerPath, arguments_, workerEnvironment());
  return JSON.parse(output) as {
    manifestDigest: string;
    manifestObjectKey: string;
    parquetDigest: string;
    parquetObjectKey: string;
    projectedRows: number;
    throughCommit: number;
    wroteManifest: boolean;
  };
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
    "projection_manifests",
    "projection_outbox",
    "semantic_claims",
  ]);
  assert.ok(allowedTables.has(table));
  const result = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM ${table} WHERE tenant_id = $1`,
    [tenantId],
  );
  return Number(result.rows[0]?.count);
}

async function installProjectionPublishFailure(
  client: PostgresClient,
): Promise<void> {
  await client.query(`
    CREATE FUNCTION e2e_fail_projection_manifest()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RAISE EXCEPTION 'injected projection manifest failure';
    END;
    $$;

    CREATE TRIGGER e2e_projection_manifest_failure
    BEFORE INSERT ON projection_manifests
    FOR EACH ROW
    EXECUTE FUNCTION e2e_fail_projection_manifest();
  `);
}

async function removeProjectionPublishFailure(
  client: PostgresClient,
): Promise<void> {
  await client.query(`
    DROP TRIGGER e2e_projection_manifest_failure ON projection_manifests;
    DROP FUNCTION e2e_fail_projection_manifest();
  `);
}

async function projectionState(
  client: PostgresClient,
  tenantId: string,
): Promise<{
  manifestDigest: string;
  parquetDigest: string;
  parquetObjectKey: string;
  throughCommit: number;
} | null> {
  const result = await client.query<{
    manifest_digest: string;
    parquet_digest: string;
    parquet_object_key: string;
    through_commit: string;
  }>(
    `SELECT w.manifest_digest, m.parquet_digest, m.parquet_object_key,
            w.through_commit::text
     FROM projection_watermarks w
     JOIN projection_manifests m
       ON m.tenant_id = w.tenant_id
      AND m.projection_id = w.projection_id
      AND m.manifest_digest = w.manifest_digest
     WHERE w.tenant_id = $1 AND w.projection_id = 'semantic_claims_v1'`,
    [tenantId],
  );
  const row = result.rows[0];
  return row
    ? {
        manifestDigest: row.manifest_digest,
        parquetDigest: row.parquet_digest,
        parquetObjectKey: row.parquet_object_key,
        throughCommit: Number(row.through_commit),
      }
    : null;
}

async function objectKeys(): Promise<string[]> {
  const output = await composeOutput(
    "exec",
    "-T",
    "minio-client",
    "mc",
    "ls",
    "--recursive",
    "--json",
    "local/zoen-projections",
  );
  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { key: string })
    .map((item) => item.key);
}

async function overwriteObject(key: string, contents: string): Promise<void> {
  await commandWithInput(
    "docker",
    [
      "compose",
      "--project-name",
      composeProject,
      "--file",
      composeFile,
      "exec",
      "-T",
      "minio-client",
      "mc",
      "pipe",
      `local/zoen-projections/${key}`,
    ],
    contents,
  );
}

async function removeObject(key: string): Promise<void> {
  await composeOutput(
    "exec",
    "-T",
    "minio-client",
    "mc",
    "rm",
    `local/zoen-projections/${key}`,
  );
}

async function waitForObjectStore(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      await composeOutput(
        "exec",
        "-T",
        "minio-client",
        "mc",
        "ready",
        "local",
      );
      return;
    } catch {
      await delay(250);
    }
  }
  throw new Error("MinIO did not recover");
}

async function compose(...arguments_: string[]): Promise<void> {
  await composeOutput(...arguments_);
}

function composeOutput(...arguments_: string[]): Promise<string> {
  return command("docker", [
    "compose",
    "--project-name",
    composeProject,
    "--file",
    composeFile,
    ...arguments_,
  ]);
}

function command(
  executable: string,
  arguments_: readonly string[],
  environment: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      executable,
      [...arguments_],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: environment,
        maxBuffer: 10 * 1024 * 1024,
      },
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

function commandWithInput(
  executable: string,
  arguments_: readonly string[],
  input: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [...arguments_], {
      cwd: repositoryRoot,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      const output = Buffer.concat(stdout).toString();
      const errors = Buffer.concat(stderr).toString();
      if (code !== 0) {
        reject(new Error(`${output}${errors}`));
        return;
      }
      resolve(output.trim());
    });
    child.stdin.end(input);
  });
}

async function expectCommandFailure(
  executable: string,
  arguments_: readonly string[],
  environment: NodeJS.ProcessEnv,
): Promise<void> {
  await assert.rejects(command(executable, arguments_, environment));
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
