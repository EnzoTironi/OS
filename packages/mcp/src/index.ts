import { createHash, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type {
  AgentAuthority,
  AgentCommitCommand,
  AgentProposalCommand,
  SemanticCapabilityScope,
  TrustedAgentContext,
} from "../../harness/src/index.js";
import type {
  ProvenancedKnowledge,
  WorkloadSession,
} from "../../workload-ingress/src/index.js";
import { WorkloadIngressError } from "../../workload-ingress/src/index.js";

export type ProjectedCapabilityKind =
  | "discover"
  | "query"
  | "explain"
  | "propose"
  | "commit_or_recover";

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

export function createMcpOutboundServer(options: {
  readonly authority: AgentAuthority;
  readonly trustedContext: TrustedAgentContext;
  readonly project: readonly ProjectedCapabilityKind[];
}): McpOutboundServer {
  return new McpOutboundServerImpl(options);
}

export interface McpOutboundServer {
  listen(opts: { port: number }): Promise<{ port: number }>;
  close(): Promise<void>;
  invokeTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown>;
}

class McpOutboundServerImpl implements McpOutboundServer {
  readonly #authority: AgentAuthority;
  readonly #project: ReadonlySet<ProjectedCapabilityKind>;
  #server: ReturnType<typeof createServer> | undefined;
  #port = 0;

  constructor(options: {
    readonly authority: AgentAuthority;
    readonly trustedContext: TrustedAgentContext;
    readonly project: readonly ProjectedCapabilityKind[];
  }) {
    this.#authority = options.authority;
    this.#project = new Set(options.project);
    void options.trustedContext;
  }

  async listen(opts: { port: number }): Promise<{ port: number }> {
    this.#server = createServer((req, res) => {
      void this.#handle(req, res);
    });
    await new Promise<void>((resolve, reject) => {
      this.#server!.once("error", reject);
      this.#server!.listen(opts.port, "127.0.0.1", () => resolve());
    });
    const address = this.#server.address();
    if (address === null || typeof address === "string") {
      throw new Error("mcp outbound server missing port");
    }
    this.#port = address.port;
    return { port: this.#port };
  }

  async close(): Promise<void> {
    const server = this.#server;
    if (server === undefined) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    this.#server = undefined;
  }

  async invokeTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    switch (name) {
      case "discover":
        this.#require("discover");
        return this.#authority.discover(
          (args.scopes as readonly SemanticCapabilityScope[] | undefined) ?? [],
        );
      case "query":
        this.#require("query");
        return this.#authority.query(args.capability as never);
      case "explain":
        this.#require("explain");
        return this.#authority.explain(String(args.operationId));
      case "propose":
        this.#require("propose");
        return this.#authority.propose(args as unknown as AgentProposalCommand);
      case "commit_or_recover":
        this.#require("commit_or_recover");
        return this.#authority.commitOrRecover(
          args as unknown as AgentCommitCommand,
        );
      default:
        throw new WorkloadIngressError(
          "unknown_tool",
          `unknown outbound MCP tool ${name}`,
        );
    }
  }

  #require(kind: ProjectedCapabilityKind): void {
    if (!this.#project.has(kind)) {
      throw new WorkloadIngressError(
        "capability_not_projected",
        `capability ${kind} is not projected`,
      );
    }
  }

  async #handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      if (req.method !== "POST" || req.url !== "/mcp/tools/call") {
        res.writeHead(404).end("not found");
        return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.from(chunk));
      }
      const payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
        name?: string;
        arguments?: Record<string, unknown>;
      };
      const result = await this.invokeTool(
        String(payload.name ?? ""),
        payload.arguments ?? {},
      );
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ result }));
    } catch (error: unknown) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
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
