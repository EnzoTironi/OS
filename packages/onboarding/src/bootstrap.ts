import {
  type AmbiguityRecordId,
  type GoalDigest,
  type MappingArtifactId,
  type ShadowDecisionId,
  type SourceConnectionId,
  sourceConnectionId,
} from "./brands.js";
import type { AmbiguityRecordStore } from "./ambiguity-record.js";
import type {
  MappingArtifactStore,
  SourceFieldRef,
  SourceSchemaRef,
} from "./mapping-artifact.js";
import type { ShadowDecisionStore } from "./shadow-decision.js";

export type BootstrapMarker =
  | "source_inspected"
  | "mapping_proposed"
  | "ambiguity_resolved"
  | "ontology_ready"
  | "shadow_started"
  | "first_proposal";

/**
 * Rebuildable projection for metrics and planNext.
 * Not an authority. Mapping/Ambiguity/Shadow stores are authoritative.
 */
export type BootstrapProjection = {
  readonly goalDigest: GoalDigest;
  readonly tenantId: string;
  readonly connectionId?: SourceConnectionId;
  readonly artifactId?: MappingArtifactId;
  readonly openAmbiguityIds: ReadonlyArray<AmbiguityRecordId>;
  readonly publishedDefinitionDigest?: string;
  readonly shadowDecisionId?: ShadowDecisionId;
  readonly markers: ReadonlyArray<BootstrapMarker>;
};

export type CompanyBrainInspectPort = {
  inspectSchema(input: {
    readonly tenantId: string;
    readonly connectionId: SourceConnectionId;
  }): Promise<{
    readonly sourceId: string;
    readonly sourceRevision: string;
    readonly contentDigest: string;
    readonly schemaDigest: string;
    readonly fields: ReadonlyArray<SourceFieldRef>;
    readonly workspaceClass?: "enterprise" | "personal";
  }>;
};

export async function inspectReadOnlySource(input: {
  readonly brain: CompanyBrainInspectPort;
  readonly trustedContext: {
    readonly tenantId: string;
    readonly workspaceClass: "enterprise";
  };
  readonly connectionId: SourceConnectionId;
  readonly now?: string;
}): Promise<SourceSchemaRef> {
  if (input.trustedContext.workspaceClass !== "enterprise") {
    throw new Error("Personal source is absent from enterprise bootstrap");
  }

  const inspected = await input.brain.inspectSchema({
    tenantId: input.trustedContext.tenantId,
    connectionId: input.connectionId,
  });

  if (inspected.workspaceClass === "personal") {
    throw new Error("Personal source is absent from enterprise bootstrap");
  }

  return {
    connectionId: sourceConnectionId(String(input.connectionId)),
    sourceId: inspected.sourceId,
    sourceRevision: inspected.sourceRevision,
    contentDigest: inspected.contentDigest,
    schemaDigest: inspected.schemaDigest,
    fields: inspected.fields,
    inspectedAt: input.now ?? new Date().toISOString(),
    workspaceClass: "enterprise",
  };
}

export async function rebuildBootstrapProjection(input: {
  readonly goalDigest: GoalDigest;
  readonly tenantId: string;
  readonly mappingStore: MappingArtifactStore;
  readonly ambiguityStore: AmbiguityRecordStore;
  readonly shadowStore: ShadowDecisionStore;
}): Promise<BootstrapProjection> {
  const artifacts = [...(await input.mappingStore.listByGoal(input.goalDigest))];
  const latest = artifacts.sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  )[0];
  const open =
    latest === undefined
      ? []
      : await input.ambiguityStore.listOpen({
          tenantId: input.tenantId,
          goalDigest: input.goalDigest,
          artifactId: latest.id,
        });

  const markers: BootstrapMarker[] = [];
  if (latest !== undefined) {
    markers.push("source_inspected");
    markers.push("mapping_proposed");
  }
  if (latest !== undefined && open.length === 0 && latest.status.kind !== "proposed") {
    markers.push("ambiguity_resolved");
  }
  if (latest?.status.kind === "published") {
    markers.push("ontology_ready");
  }

  let shadowDecisionId: ShadowDecisionId | undefined;
  const snap =
    "snapshot" in input.shadowStore &&
    typeof input.shadowStore.snapshot === "function"
      ? (
          input.shadowStore as ShadowDecisionStore & {
            snapshot: () => Map<string, { id: ShadowDecisionId; goalDigest: GoalDigest }>;
          }
        ).snapshot()
      : null;
  if (snap !== null) {
    for (const decision of snap.values()) {
      if (decision.goalDigest === input.goalDigest) {
        shadowDecisionId = decision.id;
        markers.push("shadow_started");
        markers.push("first_proposal");
        break;
      }
    }
  }

  return {
    goalDigest: input.goalDigest,
    tenantId: input.tenantId,
    connectionId: latest?.schemaRef.connectionId,
    artifactId: latest?.id,
    openAmbiguityIds: open.map((r) => r.id),
    publishedDefinitionDigest:
      latest?.status.kind === "published"
        ? latest.status.definitionDigest
        : undefined,
    shadowDecisionId,
    markers,
  };
}

/**
 * Deep façade over mapping / ambiguity / shadow for callers that want one entry.
 */
export type CompanyBootstrapApi = {
  readonly inspectReadOnlySource: typeof inspectReadOnlySource;
  readonly rebuildBootstrapProjection: typeof rebuildBootstrapProjection;
};

export const companyBootstrapApi: CompanyBootstrapApi = {
  inspectReadOnlySource,
  rebuildBootstrapProjection,
};
