import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import canonicalize from "canonicalize";
import { CommitStatus } from "../gen/connect/zoen/action/v1/action_pb.js";
import { DefinitionReferenceSchema } from "../gen/connect/zoen/world/v1/world_pb.js";
import {
  invitePersona,
  plantPersonas,
  sessionOf,
  startAuthDoor,
  stopAuthDoor,
} from "./ba-door.js";
import {
  definitionPublishActionId,
  definitionPublishPolicy,
} from "./definition-publish-policy.js";
import { sha256 } from "./effect-scenario.js";
import {
  actionClient,
  adminDatabaseUrl,
  authDatabaseUrl,
  definitionClient,
  repositoryRoot,
  startZoend,
  stopProcess,
  tenantA,
  zoenBaseUrl,
  type ManagedProcess,
} from "./effect-support.js";
import {
  type DefinitionFixture,
  activateDefinition,
  publishDefinition,
} from "./governed-action/support.js";
import {
  e2eGeneratedDirectory,
  e2eIdentityAdminToken,
  writeScenarioArtifact,
} from "./host-env.js";

const openDocActionId = "mcp.openDoc";
const writeNoteActionId = "mcp.writeNote";
const docResourceId = "mcp.doc.1";
const mcpProtocolVersion = "2026-07-28";

interface McpReply {
  body: {
    error?: { code: number; data?: unknown; message: string };
    result?: Record<string, unknown>;
  };
  protocolVersion: string | null;
  status: number;
}

async function mcpCall(
  token: string | null,
  method: string,
  params?: unknown,
  version: string = mcpProtocolVersion,
): Promise<McpReply> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "mcp-protocol-version": version,
    "x-zoen-tenant": tenantA,
  };
  if (token !== null) {
    headers.authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${zoenBaseUrl}/mcp`, {
    body: JSON.stringify({ id: 1, jsonrpc: "2.0", method, params }),
    headers,
    method: "POST",
  });
  return {
    body: (await response.json()) as McpReply["body"],
    protocolVersion: response.headers.get("mcp-protocol-version"),
    status: response.status,
  };
}

async function issueCredential(
  bearer: string,
  capabilityKinds: readonly string[],
): Promise<string> {
  const response = await fetch(`${zoenBaseUrl}/workload/admin/credentials`, {
    body: JSON.stringify({
      actorId: "actor.mcp.agent",
      allowedIngress: [{ capabilityKinds, kind: "mcp_outbound" }],
      delegation: [
        {
          actions: [writeNoteActionId],
          id: "delegation.mcp.agent",
          resources: [docResourceId],
        },
      ],
      expiresAtMicros: (Date.now() + 3_600_000) * 1000,
      principalId: "principal.mcp.agent",
      rateBudget: { maxAcceptsPerMinute: 60, maxCommitsPerHour: 30 },
      tenantId: tenantA,
      workloadId: "workload.mcp.agent",
    }),
    headers: {
      authorization: `Bearer ${bearer}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
  if (response.status !== 200) {
    assert.fail(`issue credential: ${await response.text()}`);
  }
  const body = (await response.json()) as { apiKeyOnce: string };
  return body.apiKeyOnce;
}

async function authenticate(apiKey: string): Promise<string> {
  const response = await fetch(`${zoenBaseUrl}/workload/authenticate`, {
    body: JSON.stringify({ apiKey }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (response.status !== 200) {
    assert.fail(`authenticate: ${await response.text()}`);
  }
  const body = (await response.json()) as { exchangeToken: string };
  return body.exchangeToken;
}

function structured(reply: McpReply): Record<string, unknown> {
  const result = reply.body.result;
  assert.ok(result, `missing result: ${JSON.stringify(reply.body)}`);
  const content = result.structuredContent as Record<string, unknown> | undefined;
  assert.ok(content, `missing structuredContent: ${JSON.stringify(result)}`);
  return content;
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  // Workload credentials carry world_floor clearance and an unclassified
  // resource reads as zoen.world.top, so MAC would deny the agent's propose.
  // This definition declares zoen.classifiedAs: the admin opens the doc at
  // floor classification before the agent acts on it.
  const definitionId = "mcp.agentBoard";
  const boardDefinition = {
    actions: [
      {
        effects: [
          {
            relationId: "zoen.classifiedAs",
            value: {
              kind: "literal",
              value: { kind: "text", value: "zoen.world.floor" },
            },
          },
        ],
        id: openDocActionId,
        inputs: [],
        precondition: {
          kind: "literal",
          value: { kind: "bool", value: true },
        },
      },
      {
        effects: [
          {
            relationId: "mcp.note",
            value: { inputId: "note", kind: "input" },
          },
        ],
        id: writeNoteActionId,
        inputs: [{ id: "note", valueType: { kind: "text" } }],
        precondition: {
          kind: "literal",
          value: { kind: "bool", value: true },
        },
      },
    ],
    definitionId,
    relations: [
      {
        cardinality: "many",
        id: "zoen.classifiedAs",
        sourceType: "mcp.Doc",
        target: { kind: "value", valueType: { kind: "text" } },
      },
      {
        cardinality: "one",
        id: "mcp.note",
        sourceType: "mcp.Doc",
        target: { kind: "value", valueType: { kind: "text" } },
      },
    ],
    revision: 1,
    schema: "zoen.definition.v1",
    types: [{ attributes: [], id: "mcp.Doc" }],
  };
  const canonicalJson = canonicalize(boardDefinition);
  assert.ok(canonicalJson !== undefined);
  const digest = sha256(canonicalJson);
  const policySource =
    'permit (\n    principal,\n    action == Action::"discover",\n    resource\n);\n\npermit (\n    principal,\n    action == Action::"commit",\n    resource\n);\n';
  const activationSource = await readFile(
    path.join(repositoryRoot, "e2e/governed-action/activation.cedar"),
    "utf8",
  );
  const fixture: DefinitionFixture = {
    canonicalJson,
    definition: create(DefinitionReferenceSchema, {
      definitionId,
      digest,
      revision: 1n,
    }),
    digest,
    policyDigest: sha256(policySource),
    policyId: "policy.mcp.writeNote",
    policyRevision: 1,
    policySource,
  };
  const policyManifestPath = path.join(
    e2eGeneratedDirectory(repositoryRoot, "mcp-server"),
    "mcp-server-policies.json",
  );
  await writeFile(
    policyManifestPath,
    `${JSON.stringify(
      {
        policies: [
          definitionPublishPolicy({
            definitionDigest: digest,
            revision: 1,
          }),
          {
            actionId: openDocActionId,
            definitionDigest: digest,
            digest: sha256(policySource),
            policyId: "policy.mcp.openDoc",
            revision: 1,
            source: policySource,
          },
          {
            actionId: writeNoteActionId,
            definitionDigest: digest,
            digest: fixture.policyDigest,
            policyId: fixture.policyId,
            revision: 1,
            source: policySource,
          },
          {
            actionId: "zoen.definition.activate",
            definitionDigest: digest,
            digest: sha256(activationSource),
            policyId: "policy.activation.mcp",
            revision: 1,
            source: activationSource,
          },
        ],
      },
      null,
      2,
    )}\n`,
  );

  const door = await startAuthDoor(authDatabaseUrl);
  const processes: ManagedProcess[] = [];
  const assertions: Record<string, boolean> = {};
  const observe = (name: string, value: boolean): void => {
    assert.ok(value, name);
    assertions[name] = value;
  };

  try {
    processes.push(await startZoend(policyManifestPath));
    const planted = await plantPersonas(door, {
      adminToken: e2eIdentityAdminToken(),
      applicationDatabaseUrl: adminDatabaseUrl,
      personas: [
        invitePersona({
          actionIds: [
            definitionPublishActionId,
            "zoen.definition.activate",
            openDocActionId,
          ],
          actorId: "actor.admin.a",
          id: "admin-a",
          principalId: "principal.admin.a",
          resourceIds: [definitionId, docResourceId],
          tenantId: tenantA,
          workloadId: "workload.admin.a",
        }),
      ],
      zoendBaseUrl: zoenBaseUrl,
    });
    const adminToken = sessionOf(planted, "admin-a").token;
    const definitions = definitionClient(adminToken, tenantA);
    await publishDefinition(definitions, tenantA, fixture);
    await activateDefinition(definitions, tenantA, fixture);

    // Open the doc at world-floor classification so the floor-clearance
    // workload credential passes MAC on the doc from here on.
    const adminActions = actionClient(adminToken, tenantA);
    const openOperationId = "operation.mcp.open.1";
    const opened = await adminActions.propose({
      actionId: openDocActionId,
      definition: fixture.definition,
      expiresAt: timestampFromDate(new Date(Date.now() + 300_000)),
      inputs: [],
      operationId: openOperationId,
      proposalId: "proposal.mcp.open.1",
      resourceId: docResourceId,
      validAt: timestampFromDate(new Date()),
    });
    assert.ok(opened.proposal);
    const openedCommit = await adminActions.commit({
      operationId: openOperationId,
      proposalId: "proposal.mcp.open.1",
    });
    assert.equal(openedCommit.status, CommitStatus.COMMITTED);

    // A workload credential WITHOUT commit_or_recover: everything but commit.
    const readWriteKey = await issueCredential(adminToken, [
      "discover",
      "explain",
      "propose",
      "query",
    ]);
    const agentToken = await authenticate(readWriteKey);

    const discover = await mcpCall(agentToken, "server/discover");
    observe("discover_status_200", discover.status === 200);
    observe(
      "discover_protocol_versions",
      JSON.stringify(discover.body.result?.protocolVersions) ===
        JSON.stringify([mcpProtocolVersion]),
    );
    observe(
      "discover_echoes_protocol_header",
      discover.protocolVersion === mcpProtocolVersion,
    );

    const listed = await mcpCall(agentToken, "tools/list");
    const toolList = (listed.body.result?.tools ?? []) as { name: string }[];
    observe(
      "tools_list_six_alphabetical",
      JSON.stringify(toolList.map((tool) => tool.name)) ===
        JSON.stringify([
          "zoen_commit",
          "zoen_discover",
          "zoen_execute",
          "zoen_explain",
          "zoen_propose",
          "zoen_query",
        ]),
    );
    observe("tools_list_ttl_default", listed.body.result?.ttlMs === 300_000);
    observe("tools_list_cache_private", listed.body.result?.cacheScope === "private");

    const discovered = await mcpCall(agentToken, "tools/call", {
      arguments: {
        definitionId,
        digest,
        resourceId: docResourceId,
        revision: "1",
      },
      name: "zoen_discover",
    });
    observe("zoen_discover_complete", discovered.body.result?.resultType === "complete");

    const proposeArgs = {
      actionId: writeNoteActionId,
      definitionId,
      digest,
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      inputs: [{ inputId: "note", value: { textValue: "mcp note" } }],
      resourceId: docResourceId,
      validAt: new Date().toISOString(),
    };
    const proposed = await mcpCall(agentToken, "tools/call", {
      arguments: { ...proposeArgs, operationId: "operation.mcp.1" },
      name: "zoen_propose",
    });
    const proposedContent = structured(proposed);
    if (proposedContent.proposal === undefined) {
      assert.fail(`zoen_propose: ${JSON.stringify(proposed.body)}`);
    }
    const proposal = proposedContent.proposal as {
      previewHash: string;
      proposalId: string;
    };
    observe("zoen_propose_returns_proposal", true);
    observe(
      "zoen_propose_default_proposal_id",
      proposal.proposalId === "prop_operation.mcp.1",
    );
    observe(
      "zoen_propose_carries_decision",
      proposedContent.decision !== undefined,
    );

    const deniedCommit = await mcpCall(agentToken, "tools/call", {
      arguments: {
        operationId: "operation.mcp.1",
        previewHash: proposal.previewHash,
        proposalId: proposal.proposalId,
      },
      name: "zoen_commit",
    });
    observe(
      "commit_without_capability_gated",
      deniedCommit.body.error?.code === -32_001 &&
        (deniedCommit.body.error.data as { error?: string } | undefined)?.error ===
          "ingress_not_allowed",
    );

    // Re-issued WITH commit_or_recover: the full loop closes.
    const fullKey = await issueCredential(adminToken, [
      "commit_or_recover",
      "discover",
      "explain",
      "propose",
      "query",
    ]);
    const fullToken = await authenticate(fullKey);
    const proposed2 = await mcpCall(fullToken, "tools/call", {
      arguments: { ...proposeArgs, operationId: "operation.mcp.2" },
      name: "zoen_propose",
    });
    const proposed2Content = structured(proposed2);
    if (proposed2Content.proposal === undefined) {
      assert.fail(`zoen_propose with commit_or_recover: ${JSON.stringify(proposed2.body)}`);
    }
    const proposal2 = proposed2Content.proposal as {
      previewHash: string;
      proposalId: string;
    };
    const committed = await mcpCall(fullToken, "tools/call", {
      arguments: {
        operationId: "operation.mcp.2",
        previewHash: proposal2.previewHash,
        proposalId: proposal2.proposalId,
      },
      name: "zoen_commit",
    });
    const commitResult = structured(committed);
    if (commitResult.receipt === undefined) {
      assert.fail(`zoen_commit: ${JSON.stringify(committed.body)}`);
    }
    const receipt = commitResult.receipt as
      | { commitSequence?: unknown; policy?: unknown }
      | undefined;
    observe("zoen_commit_returns_receipt", receipt !== undefined);
    observe("receipt_has_policy_evidence", receipt?.policy !== undefined);
    observe("receipt_has_commit_sequence", receipt?.commitSequence !== undefined);

    const explained = await mcpCall(fullToken, "tools/call", {
      arguments: { operationId: "operation.mcp.2" },
      name: "zoen_explain",
    });
    const explainedContent = structured(explained);
    if (explainedContent.status === undefined) {
      assert.fail(`zoen_explain: ${JSON.stringify(explained.body)}`);
    }
    observe("zoen_explain_returns_status", true);

    const noBearer = await mcpCall(null, "tools/list");
    observe("no_bearer_is_401", noBearer.status === 401);

    const wrongVersion = await mcpCall(agentToken, "tools/list", undefined, "2025-11-25");
    observe(
      "wrong_version_rejected",
      wrongVersion.body.error?.code === -32_000 &&
        wrongVersion.body.error.message === "UnsupportedProtocolVersionError",
    );

    const unknownMethod = await mcpCall(agentToken, "tools/unknown");
    observe("unknown_method_is_32601", unknownMethod.body.error?.code === -32_601);

    await writeScenarioArtifact(repositoryRoot, "mcp-server", {
      assertions,
      componentVersions: {
        postgres: "18",
        rivet: "2.3.11",
        sessionDoor: "better-auth",
      },
      finishedAt: new Date().toISOString(),
      scenario: "mcp-server",
      startedAt,
    });
  } finally {
    for (const process of processes) {
      await stopProcess(process);
    }
    await stopAuthDoor(door);
  }
}

await main();
