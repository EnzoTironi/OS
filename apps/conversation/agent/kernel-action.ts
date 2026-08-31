export interface KernelInput {
  readonly inputId: string;
  readonly value: { readonly textValue: string };
}

interface ZoendEnv {
  readonly bearer: string;
  readonly definitionId: string;
  readonly digest: string;
  readonly expiresAt: string;
  readonly tenant: string;
  readonly validAt: string;
  readonly zoend: string;
}

const TRAILING_SLASHES = /\/+$/u;

function readZoendEnv(): ZoendEnv {
  const zoend = process.env.ZOEN_ZOEND?.trim();
  const bearer = process.env.ZOEN_BEARER?.trim();
  const tenant = process.env.ZOEN_TENANT?.trim();
  const definitionId = process.env.ZOEN_DEFINITION_ID?.trim();
  const digest = process.env.ZOEN_DEFINITION_DIGEST?.trim();
  const validAt = process.env.ZOEN_VALID_AT?.trim();
  const expiresAt = process.env.ZOEN_EXPIRES_AT?.trim();
  if (
    !(
      zoend &&
      bearer &&
      tenant &&
      definitionId &&
      digest &&
      validAt &&
      expiresAt
    )
  ) {
    throw new Error("zoend session env is required");
  }
  return { bearer, definitionId, digest, expiresAt, tenant, validAt, zoend };
}

async function connectJson(
  env: ZoendEnv,
  path: string,
  body: unknown
): Promise<Record<string, unknown>> {
  const response = await fetch(
    `${env.zoend.replace(TRAILING_SLASHES, "")}${path}`,
    {
      body: JSON.stringify(body),
      headers: {
        authorization: `Bearer ${env.bearer}`,
        "connect-protocol-version": "1",
        "content-type": "application/json",
        "x-zoen-tenant": env.tenant,
      },
      method: "POST",
      signal: AbortSignal.timeout(10_000),
    }
  );
  const json = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    throw new Error(
      `${path} failed: HTTP ${response.status}: ${JSON.stringify(json)}`
    );
  }
  return json;
}

async function resolveRevision(env: ZoendEnv): Promise<string> {
  const pinned = process.env.ZOEN_DEFINITION_REVISION?.trim();
  if (pinned) {
    return pinned;
  }
  const json = await connectJson(
    env,
    "/zoen.definition.v1.DefinitionService/GetRevision",
    {
      definitionId: env.definitionId,
      digest: env.digest,
      tenantId: env.tenant,
    }
  );
  const revision =
    (json.definitionRevision as { revision?: unknown } | undefined)?.revision ??
    (json.definition_revision as { revision?: unknown } | undefined)?.revision;
  if (typeof revision === "string" && revision.length > 0) {
    return revision;
  }
  if (typeof revision === "number") {
    return String(revision);
  }
  throw new Error("GetRevision returned no revision");
}

export async function commitKernelAction(command: {
  readonly actionId: string;
  readonly resourceId: string;
  readonly inputs: readonly KernelInput[];
}): Promise<unknown> {
  if (process.env.ZOEN_ISOLATE === "1") {
    throw new Error("isolate cannot commit");
  }
  const env = readZoendEnv();
  const slug = command.actionId.replaceAll(".", "-");
  const proposalId = `proposal.${slug}`;
  const operationId = `operation.${slug}`;
  const proposed = await connectJson(
    env,
    "/zoen.action.v1.ActionService/Propose",
    {
      actionId: command.actionId,
      definition: {
        definitionId: env.definitionId,
        digest: env.digest,
        revision: await resolveRevision(env),
      },
      expiresAt: env.expiresAt,
      inputs: command.inputs.map((input) => ({
        inputId: input.inputId,
        value: { textValue: input.value.textValue },
      })),
      operationId,
      proposalId,
      resourceId: command.resourceId,
      validAt: env.validAt,
    }
  );
  const previewHash =
    (proposed.proposal as { previewHash?: string } | undefined)?.previewHash ??
    (proposed.previewHash as string | undefined);
  if (previewHash === undefined || previewHash.length === 0) {
    throw new Error("propose missing preview_hash");
  }
  const committed = await connectJson(
    env,
    "/zoen.action.v1.ActionService/Commit",
    { operationId, previewHash, proposalId }
  );
  const receipt = (committed.receipt ?? committed) as {
    recordIds?: string[];
  };
  const claimIds = receipt.recordIds ?? (committed.recordIds as string[]) ?? [];
  return {
    claimIds,
    receipt: committed.receipt ?? committed,
    status: committed.status ?? null,
  };
}
