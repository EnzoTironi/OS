const packDefinitionIds = [
  "party.core",
  "product.catalog",
  "commercial.sales",
  "inventory.operations",
  "procurement.purchasing",
] as const;

async function identityAdmin(
  baseUrl: string,
  method: string,
  route: string,
  body?: unknown,
  token?: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${baseUrl}${route}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    },
    method,
  });
  const text = await response.text();
  const parsed =
    text.length === 0 ? {} : (JSON.parse(text) as Record<string, unknown>);
  return { body: parsed, status: response.status };
}

export async function seedBoundTenantMembership(args: {
  readonly baseUrl: string;
  readonly token: string;
  readonly tenantId: string;
  readonly principalId: string;
  readonly actorId: string;
  readonly workloadId: string;
}): Promise<{ accountId: string; membershipId: string }> {
  const bootstrap = await identityAdmin(
    args.baseUrl,
    "POST",
    "/identity/admin/bootstrap-bound",
    undefined,
    args.token,
  );
  if (bootstrap.status !== 200) {
    throw new Error(
      `bootstrap-bound failed: ${bootstrap.status} ${JSON.stringify(bootstrap.body)}`,
    );
  }
  const accountId = String(bootstrap.body.accountId);
  const inviteToken = `invite.pack.${args.tenantId}.${accountId}`;
  const invite = await identityAdmin(args.baseUrl, "POST", "/identity/admin/invites", {
    actionIds: ["zoen.definition.activate", "inventory.requestStock"],
    actorId: args.actorId,
    expiresAtMicros: Date.now() * 1000 + 3_600_000_000,
    principalId: args.principalId,
    resourceIds: [...packDefinitionIds, "inventory.item.1"],
    tenantId: args.tenantId,
    token: inviteToken,
    workloadId: args.workloadId,
  });
  if (invite.status !== 200) {
    throw new Error(
      `create invite failed: ${invite.status} ${JSON.stringify(invite.body)}`,
    );
  }
  const accepted = await identityAdmin(
    args.baseUrl,
    "POST",
    "/identity/admin/accept-invite",
    { accountId, token: inviteToken },
  );
  if (accepted.status !== 200) {
    throw new Error(
      `accept-invite failed: ${accepted.status} ${JSON.stringify(accepted.body)}`,
    );
  }
  return {
    accountId,
    membershipId: String(accepted.body.membershipId),
  };
}

export async function seedVerifiedBindingOnly(args: {
  readonly baseUrl: string;
  readonly token: string;
}): Promise<{ accountId: string }> {
  const bootstrap = await identityAdmin(
    args.baseUrl,
    "POST",
    "/identity/admin/bootstrap-bound",
    undefined,
    args.token,
  );
  if (bootstrap.status !== 200) {
    throw new Error(
      `bootstrap-bound failed: ${bootstrap.status} ${JSON.stringify(bootstrap.body)}`,
    );
  }
  return { accountId: String(bootstrap.body.accountId) };
}
