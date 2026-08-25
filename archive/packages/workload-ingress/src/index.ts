import { z } from "zod";

const identifier = z.string().min(1).max(200);

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

export type AcceptSignalInput = {
  readonly durableEventId: string;
  readonly source: {
    readonly class: string;
    readonly externalId: string;
    readonly audienceClass?: string;
  };
  readonly payloadDigestRef: string;
  readonly sourceDigestRef: string;
  readonly body?: {
    readonly kind: "opaque_json_digest_only";
    readonly textHint?: string;
    readonly claimedTenantId?: string;
    readonly claimedPrincipalId?: string;
  };
  readonly trustDisposition?:
    | "attention_candidate"
    | "evidence_candidate"
    | "untrusted_raw";
};

export type AcceptSignalResult = {
  readonly signal: {
    readonly id: string;
    readonly durableEventId: string;
    readonly workloadCredentialId: string;
    readonly tenantId: string;
    readonly principalId: string;
    readonly trustDisposition:
      | "attention_candidate"
      | "evidence_candidate"
      | "untrusted_raw";
  };
  readonly duplicate: boolean;
  readonly evidenceCandidate?: {
    readonly signalId: string;
    readonly tenantId: string;
    readonly payloadDigestRef: string;
    readonly sourceDigestRef: string;
    readonly workloadCredentialId: string;
  };
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

export type IssueCredentialInput = {
  readonly tenantId: string;
  readonly workloadId: string;
  readonly principalId: string;
  readonly actorId: string;
  readonly delegation: readonly {
    readonly id: string;
    readonly actions: readonly string[];
    readonly resources?: readonly string[];
  }[];
  readonly allowedIngress: readonly (
    | { readonly kind: "api_event"; readonly sourceClass: string }
    | {
        readonly kind: "mcp_outbound";
        readonly capabilityKinds: readonly string[];
      }
    | {
        readonly kind: "mcp_inbound_read";
        readonly serverAllowlist: readonly string[];
      }
  )[];
  readonly rateBudget: {
    readonly maxAcceptsPerMinute: number;
    readonly maxCommitsPerHour: number;
  };
  readonly expiresAt: string | number;
  readonly audienceClass?: string;
  readonly jwtIssuer?: string;
  readonly jwtSubject?: string;
};

export type IssuedCredential = {
  readonly credentialId: string;
  readonly apiKeyOnce: string;
  readonly tenantId: string;
  readonly principalId: string;
  readonly workloadId: string;
};

export class WorkloadIngressError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "WorkloadIngressError";
  }
}

const sessionSchema = z
  .object({
    actorId: identifier,
    credentialId: identifier,
    discoverableScopes: z.array(
      z
        .object({
          definitionId: identifier,
          kind: z.string(),
          resourceId: identifier.optional(),
        })
        .passthrough(),
    ),
    exchangeToken: z.string().min(1),
    principalId: identifier,
    tenantId: identifier,
    workloadId: identifier,
  })
  .passthrough();

const acceptSchema = z
  .object({
    duplicate: z.boolean(),
    evidenceCandidate: z
      .object({
        payloadDigestRef: z.string(),
        signalId: identifier,
        sourceDigestRef: z.string(),
        tenantId: identifier,
        workloadCredentialId: identifier,
      })
      .passthrough()
      .optional(),
    signal: z
      .object({
        durableEventId: identifier,
        id: identifier,
        principalId: identifier,
        tenantId: identifier,
        trustDisposition: z.enum([
          "attention_candidate",
          "evidence_candidate",
          "untrusted_raw",
        ]),
        workloadCredentialId: identifier,
      })
      .passthrough(),
  })
  .passthrough();

const issuedSchema = z
  .object({
    apiKeyOnce: z.string().min(1),
    credentialId: identifier,
    principalId: identifier,
    tenantId: identifier,
    workloadId: identifier,
  })
  .passthrough();

export function createWorkloadIngressClient(options: {
  readonly baseUrl: string;
}): {
  authenticate(input: {
    readonly apiKey?: string;
    readonly bearerJwt?: string;
  }): Promise<WorkloadSession>;
  acceptSignal(
    session: WorkloadSession,
    input: AcceptSignalInput,
  ): Promise<AcceptSignalResult>;
} {
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  return {
    async authenticate(input) {
      const response = await fetch(`${baseUrl}/workload/authenticate`, {
        body: JSON.stringify({
          apiKey: input.apiKey,
          bearerJwt: input.bearerJwt,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const body = await readJson(response);
      if (!response.ok) {
        throw new WorkloadIngressError(
          "authenticate_failed",
          String(body.error ?? response.status),
        );
      }
      const parsed = sessionSchema.parse(body);
      return {
        actorId: parsed.actorId,
        credentialId: parsed.credentialId,
        discoverableScopes: parsed.discoverableScopes,
        exchangeToken: parsed.exchangeToken,
        principalId: parsed.principalId,
        tenantId: parsed.tenantId,
        workloadId: parsed.workloadId,
      };
    },
    async acceptSignal(session, input) {
      const response = await fetch(`${baseUrl}/workload/signals`, {
        body: JSON.stringify({
          body: input.body,
          durableEventId: input.durableEventId,
          payloadDigestRef: input.payloadDigestRef,
          source: {
            audienceClass: input.source.audienceClass,
            class: input.source.class,
            externalId: input.source.externalId,
          },
          sourceDigestRef: input.sourceDigestRef,
          trustDisposition: input.trustDisposition,
        }),
        headers: {
          authorization: `Bearer ${session.exchangeToken}`,
          "content-type": "application/json",
        },
        method: "PUT",
      });
      const body = await readJson(response);
      if (!response.ok) {
        throw new WorkloadIngressError(
          "accept_signal_failed",
          String(body.error ?? response.status),
        );
      }
      const parsed = acceptSchema.parse(body);
      return {
        duplicate: parsed.duplicate,
        evidenceCandidate: parsed.evidenceCandidate,
        signal: {
          durableEventId: parsed.signal.durableEventId,
          id: parsed.signal.id,
          principalId: parsed.signal.principalId,
          tenantId: parsed.signal.tenantId,
          trustDisposition: parsed.signal.trustDisposition,
          workloadCredentialId: parsed.signal.workloadCredentialId,
        },
      };
    },
  };
}

export function createWorkloadAdminClient(options: {
  readonly baseUrl: string;
  readonly bearerToken: string;
}): {
  issueCredential(input: IssueCredentialInput): Promise<IssuedCredential>;
  revokeCredential(
    credentialId: string,
    reason?: string,
  ): Promise<{ credentialId: string; status: string }>;
} {
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const authorization = `Bearer ${options.bearerToken}`;
  return {
    async issueCredential(input) {
      const expiresAtMicros =
        typeof input.expiresAt === "number"
          ? input.expiresAt
          : Date.parse(input.expiresAt) * 1000;
      const response = await fetch(`${baseUrl}/workload/admin/credentials`, {
        body: JSON.stringify({
          actorId: input.actorId,
          allowedIngress: input.allowedIngress,
          audienceClass: input.audienceClass,
          delegation: input.delegation,
          expiresAtMicros,
          jwtIssuer: input.jwtIssuer,
          jwtSubject: input.jwtSubject,
          principalId: input.principalId,
          rateBudget: {
            maxAcceptsPerHour: input.rateBudget.maxCommitsPerHour,
            maxAcceptsPerMinute: input.rateBudget.maxAcceptsPerMinute,
            maxCommitsPerHour: input.rateBudget.maxCommitsPerHour,
          },
          tenantId: input.tenantId,
          workloadId: input.workloadId,
        }),
        headers: {
          authorization,
          "content-type": "application/json",
        },
        method: "POST",
      });
      const body = await readJson(response);
      if (!response.ok) {
        throw new WorkloadIngressError(
          "issue_failed",
          String(body.error ?? response.status),
        );
      }
      const parsed = issuedSchema.parse(body);
      return {
        apiKeyOnce: parsed.apiKeyOnce,
        credentialId: parsed.credentialId,
        principalId: parsed.principalId,
        tenantId: parsed.tenantId,
        workloadId: parsed.workloadId,
      };
    },
    async revokeCredential(credentialId, reason = "admin") {
      const response = await fetch(
        `${baseUrl}/workload/admin/credentials/${encodeURIComponent(credentialId)}/revoke`,
        {
          body: JSON.stringify({ reason }),
          headers: {
            authorization,
            "content-type": "application/json",
          },
          method: "POST",
        },
      );
      const body = await readJson(response);
      if (!response.ok) {
        throw new WorkloadIngressError(
          "revoke_failed",
          String(body.error ?? response.status),
        );
      }
      return {
        credentialId: String(body.credentialId ?? credentialId),
        status: String(body.status ?? "revoked"),
      };
    },
  };
}

async function readJson(
  response: Response,
): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (text.length === 0) {
    return {};
  }
  return JSON.parse(text) as Record<string, unknown>;
}
