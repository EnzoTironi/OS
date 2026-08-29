import { createHash, randomUUID } from "node:crypto";
import {
  WorkloadIngressError,
  type ProvenancedKnowledge,
  type WorkloadSession,
} from "./workload.js";

export {
  WorkloadIngressError,
  type ProvenancedKnowledge,
  type WorkloadSession,
} from "./workload.js";

export type McpServerLaunch = {
  readonly transport: "stdio" | "http";
  readonly command?: string;
  readonly tools?: Readonly<
    Record<
      string,
      {
        readonly classification: "read" | "write_like";
        readonly handler?: (args: unknown) => Promise<{ text: string }> | { text: string };
      }
    >
  >;
};

const WRITE_LIKE_NAMES = new Set([
  "write_file",
  "write",
  "update",
  "delete",
  "mutate",
  "create",
  "put",
  "patch",
]);

export function classifyMcpTool(toolName: string): "read" | "write_like" {
  const normalized = toolName.toLowerCase();
  if (
    WRITE_LIKE_NAMES.has(normalized) ||
    normalized.startsWith("write_") ||
    normalized.endsWith("_write") ||
    normalized.includes("mutate")
  ) {
    return "write_like";
  }
  return "read";
}

export function createMcpInboundAdapter(options: {
  readonly session: WorkloadSession;
  readonly servers: Readonly<Record<string, McpServerLaunch>>;
}): McpInboundAdapter {
  return new McpInboundAdapterImpl(options);
}

export interface McpInboundAdapter {
  invokeReadTool(input: {
    readonly serverId: string;
    readonly toolName: string;
    readonly args: unknown;
  }): Promise<ProvenancedKnowledge>;
}

class McpInboundAdapterImpl implements McpInboundAdapter {
  readonly #session: WorkloadSession;
  readonly #servers: Readonly<Record<string, McpServerLaunch>>;

  constructor(options: {
    readonly session: WorkloadSession;
    readonly servers: Readonly<Record<string, McpServerLaunch>>;
  }) {
    this.#session = options.session;
    this.#servers = options.servers;
  }

  async invokeReadTool(input: {
    readonly serverId: string;
    readonly toolName: string;
    readonly args: unknown;
  }): Promise<ProvenancedKnowledge> {
    const server = this.#servers[input.serverId];
    if (server === undefined) {
      throw new WorkloadIngressError(
        "server_not_allowed",
        `mcp server ${input.serverId} is not configured`,
      );
    }
    const tool = server.tools?.[input.toolName];
    const classification =
      tool?.classification ?? classifyMcpTool(input.toolName);
    if (classification === "write_like") {
      throw new WorkloadIngressError(
        "WriteLikeToolNotAction",
        `write-like MCP tool ${input.toolName} cannot become an Action`,
      );
    }
    const produced = tool?.handler
      ? await tool.handler(input.args)
      : { text: JSON.stringify(input.args ?? {}) };
    const callId = randomUUID();
    const fragmentDigest = createHash("sha256")
      .update(
        JSON.stringify({
          callId,
          serverId: input.serverId,
          text: produced.text,
          toolName: input.toolName,
        }),
      )
      .digest("hex");
    return {
      fragmentDigest,
      kind: "provenanced_knowledge",
      provenance: {
        callId,
        serverId: input.serverId,
        tenantId: this.#session.tenantId,
        toolName: input.toolName,
        workloadCredentialId: this.#session.credentialId,
      },
      text: produced.text,
    };
  }
}

export async function callMcpOutboundTool(options: {
  readonly baseUrl: string;
  readonly name: string;
  readonly arguments?: Record<string, unknown>;
}): Promise<unknown> {
  const response = await fetch(`${options.baseUrl}/mcp/tools/call`, {
    body: JSON.stringify({
      arguments: options.arguments ?? {},
      name: options.name,
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const body = (await response.json()) as {
    result?: unknown;
    error?: string;
  };
  if (!response.ok) {
    throw new WorkloadIngressError(
      "outbound_tool_failed",
      body.error ?? String(response.status),
    );
  }
  return body.result;
}
