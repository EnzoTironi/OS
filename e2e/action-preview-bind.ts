import type { Client } from "@connectrpc/connect";
import type { ActionService } from "../gen/connect/zoen/action/v1/action_pb.js";

export type BoundActionClient = Client<typeof ActionService>;

const SHA256_HEX = /^[0-9a-f]{64}$/;

/**
 * Context: live Action clients must send the kernel preview_hash.
 * Inputs: a raw ActionService client.
 * Outputs: the same client, with Propose caching the hash and Commit filling
 * it when the caller omitted one. An explicit previewHash is never replaced.
 * Side effects: per-client in-memory cache keyed by proposal_id.
 */
export function bindActionPreviewHash(
  client: BoundActionClient,
): BoundActionClient {
  const hashes = new Map<string, string>();
  const propose = client.propose.bind(client);
  const commit = client.commit.bind(client);
  client.propose = async (request) => {
    const response = await propose(request);
    const proposal = response.proposal;
    if (proposal !== undefined && SHA256_HEX.test(proposal.previewHash)) {
      hashes.set(proposal.proposalId, proposal.previewHash);
    }
    return response;
  };
  client.commit = async (request) => {
    const presented = request.previewHash ?? "";
    const previewHash =
      presented.length > 0
        ? presented
        : (hashes.get(request.proposalId ?? "") ?? "");
    return commit({
      operationId: request.operationId,
      previewHash,
      proposalId: request.proposalId,
    });
  };
  return client;
}

/** True iff `value` is a lowercase SHA-256 hex digest. */
export function isPreviewHash(value: string): boolean {
  return SHA256_HEX.test(value);
}

/** True iff preview copy leaks an internal identifier or digest. */
export function leaksInternalId(text: string): boolean {
  return (
    text.includes("proposal.") ||
    text.includes("operation.") ||
    text.includes("claim.") ||
    text.includes("tenant.") ||
    text.includes("principal.") ||
    text.includes("actor.") ||
    text.includes("workload.") ||
    text.includes("approval.") ||
    /\b(?:inventory|personal|commercial)\.[A-Za-z0-9._-]+/.test(text) ||
    /zoen-engine|zoen-core|packages\/|crates\//i.test(text) ||
    SHA256_HEX.test(text)
  );
}

/** Flip the first hex nibble so the digest is still well-formed but wrong. */
export function flippedPreviewHash(hash: string): string {
  if (!SHA256_HEX.test(hash)) {
    throw new Error("preview hash is not a SHA-256 hex digest");
  }
  return `${hash.startsWith("a") ? "b" : "a"}${hash.slice(1)}`;
}

/**
 * Commit with the stored hash, or an override for stale/tampered cases.
 */
export function commitProposal(
  client: BoundActionClient,
  proposal: { operationId: string; previewHash: string; proposalId: string },
  overrides?: { previewHash?: string },
) {
  return client.commit({
    operationId: proposal.operationId,
    previewHash: overrides?.previewHash ?? proposal.previewHash,
    proposalId: proposal.proposalId,
  });
}

/**
 * Approve with the stored hash, or an override for mismatch cases.
 */
export function approveProposal(
  client: BoundActionClient,
  proposal: { previewHash: string; proposalId: string },
  input: {
    readonly approvalId: string;
    readonly expiresAt: NonNullable<
      Parameters<BoundActionClient["approve"]>[0]["expiresAt"]
    >;
  },
  overrides?: { previewHash?: string },
) {
  return client.approve({
    approvalId: input.approvalId,
    expiresAt: input.expiresAt,
    previewHash: overrides?.previewHash ?? proposal.previewHash,
    proposalId: proposal.proposalId,
  });
}
