export type KernelInput = {
  readonly inputId: string;
  readonly value: { readonly textValue: string };
};

export async function commitKernelAction(command: {
  readonly actionId: string;
  readonly resourceId: string;
  readonly inputs: readonly KernelInput[];
}): Promise<unknown> {
  const zoend = process.env.ZOEN_ZOEND?.trim();
  const bearer = process.env.ZOEN_BEARER?.trim();
  const tenant = process.env.ZOEN_TENANT?.trim();
  const definitionId = process.env.ZOEN_DEFINITION_ID?.trim();
  const digest = process.env.ZOEN_DEFINITION_DIGEST?.trim();
  const validAt = process.env.ZOEN_VALID_AT?.trim() ?? "2026-01-15T00:00:00Z";
  if (!zoend || !bearer || !tenant || !definitionId || !digest) {
    throw new Error("zoend session env is required");
  }
  const proposalId = `proposal.${command.actionId.replaceAll(".", "-")}`;
  const operationId = `operation.${command.actionId.replaceAll(".", "-")}`;
  const proposed = await connect(zoend, bearer, tenant, "/zoen.action.v1.ActionService/Propose", {
    proposalId,
    operationId,
    definition: { definitionId, revision: "1", digest },
    actionId: command.actionId,
    resourceId: command.resourceId,
    inputs: command.inputs,
    validAt,
    expiresAt: "2030-01-01T00:00:00Z",
  });
  const previewHash =
    (proposed.proposal as { previewHash?: string } | undefined)?.previewHash ??
    (proposed.previewHash as string | undefined);
  if (!previewHash) {
    throw new Error("propose missing preview_hash");
  }
  return connect(zoend, bearer, tenant, "/zoen.action.v1.ActionService/Commit", {
    proposalId,
    operationId,
    previewHash,
  });
}

async function connect(
  zoend: string,
  bearer: string,
  tenant: string,
  path: string,
  body: unknown,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${zoend}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${bearer}`,
      "content-type": "application/json",
      "connect-protocol-version": "1",
      "x-zoen-tenant": tenant,
    },
    body: JSON.stringify(body),
  });
  const json = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(`zoend ${path} ${String(response.status)}`);
  }
  return json;
}
