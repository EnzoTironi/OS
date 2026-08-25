/**
 * Workload session and ingress error types for the live MCP package.
 *
 * The full workload-ingress client lives on archive/pre-modeled-erp.
 */
export type WorkloadSession = {
  readonly credentialId: string;
  readonly tenantId: string;
  readonly principalId: string;
  readonly workloadId: string;
  readonly actorId: string;
  readonly exchangeToken: string;
  readonly discoverableScopes: readonly DiscoverableScope[];
};

export type DiscoverableScope = {
  readonly kind: string;
  readonly definitionId: string;
  readonly resourceId?: string;
};

export type ProvenancedKnowledge = {
  readonly kind: "provenanced_knowledge";
  readonly fragmentDigest: string;
  readonly text: string;
  readonly provenance: {
    readonly serverId: string;
    readonly toolName: string;
    readonly callId: string;
    readonly tenantId: string;
    readonly workloadCredentialId: string;
  };
};

export class WorkloadIngressError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "WorkloadIngressError";
  }
}
