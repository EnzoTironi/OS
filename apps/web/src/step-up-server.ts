import {
  createInteractionControlRegistry,
  createPostgresControlStore,
  createStepUpRegistry,
  decideAudienceDisclosure,
  interactionControlRef,
  issueApprovalControl,
  openStepUpSession,
  completeStepUpCommit,
  principalIdString,
  proposalRef,
  stepUpUrl,
  tenantIdString,
  type InteractionControlRef,
  type InteractionControlRegistry,
  type SealedActionRef,
  type StepUpRegistry,
  type StepUpSession,
  type StepUpSessionId,
  stepUpSessionId,
} from "@zoen/interaction";
import pg from "pg";

let storeClient: pg.Client | undefined;
let controlsSingleton: InteractionControlRegistry | undefined;
let stepUpsSingleton: StepUpRegistry | undefined;
let connecting: Promise<void> | undefined;

async function ensureStore(): Promise<void> {
  if (controlsSingleton !== undefined && stepUpsSingleton !== undefined) {
    return;
  }
  if (connecting !== undefined) {
    await connecting;
    return;
  }
  connecting = (async () => {
    const connectionString = process.env.ZOEN_INTERACTION_DATABASE_URL;
    if (connectionString === undefined || connectionString === "") {
      throw new Error("ZOEN_INTERACTION_DATABASE_URL is required for step-up");
    }
    const client = new pg.Client({ connectionString });
    await client.connect();
    await ensureInteractionSchema(client);
    storeClient = client;
    const store = createPostgresControlStore(client);
    controlsSingleton = createInteractionControlRegistry({ store });
    stepUpsSingleton = createStepUpRegistry({ store });
  })();
  try {
    await connecting;
  } finally {
    connecting = undefined;
  }
}

export async function stepUpControls(): Promise<InteractionControlRegistry> {
  await ensureStore();
  if (controlsSingleton === undefined) {
    throw new Error("step-up controls unavailable");
  }
  return controlsSingleton;
}

export async function stepUpRegistry(): Promise<StepUpRegistry> {
  await ensureStore();
  if (stepUpsSingleton === undefined) {
    throw new Error("step-up registry unavailable");
  }
  return stepUpsSingleton;
}

export function bearerFromRequest(request: Request): string | undefined {
  const header = request.headers.get("authorization");
  if (header === null || !header.startsWith("Bearer ")) {
    return undefined;
  }
  const token = header.slice("Bearer ".length).trim();
  return token.length === 0 ? undefined : token;
}

/**
 * Chat cookie is not step-up evidence. OIDC access-token claims are authentication
 * evidence for this adapter; Active Membership remains the product SoR when bound.
 */
export function verifiedMembershipFromAccessToken(token: string): {
  readonly accountId: string;
  readonly tenantId: ReturnType<typeof tenantIdString>;
  readonly principalId: ReturnType<typeof principalIdString>;
  readonly oidcSubject: string;
} {
  const claims = decodeJwtPayload(token);
  const sub = asNonEmptyString(claims.sub);
  const tenantId = asNonEmptyString(claims.tenant_id);
  const principalId = asNonEmptyString(claims.principal_id);
  if (sub === undefined || tenantId === undefined || principalId === undefined) {
    throw new Error("oidc_claims_incomplete");
  }
  return {
    accountId: `account.oidc.${sub}`,
    oidcSubject: sub,
    principalId: principalIdString(principalId),
    tenantId: tenantIdString(tenantId),
  };
}

export async function openAuthenticatedStepUp(input: {
  readonly controlRef: string;
  readonly accessToken: string;
}): Promise<StepUpSession> {
  const controls = await stepUpControls();
  const stepUps = await stepUpRegistry();
  return openStepUpSession({
    controlRef: interactionControlRef(input.controlRef),
    controls,
    oidcBearerVerified: verifiedMembershipFromAccessToken(input.accessToken),
    stepUps,
  });
}

/**
 * Seal an InteractionControlRef to the Sample Company proposal/action from the
 * live surface binding. Rejects toy stepup.local / resource mismatches.
 */
export async function issueAuthenticatedApprovalControl(input: {
  readonly accessToken: string;
  readonly proposalId: string;
  readonly operationId: string;
  readonly actionBindingId: string;
  readonly actionRef: SealedActionRef;
  readonly publicOrigin: string;
}): Promise<{
  readonly approveUrl: string;
  readonly controlRef: InteractionControlRef;
}> {
  rejectToyStepUpBinding(input.actionRef);
  const verified = verifiedMembershipFromAccessToken(input.accessToken);
  const disclosure = decideAudienceDisclosure({
    actionRisk: "high",
    audience: { kind: "dm" },
    channelAssurance: "web_oidc",
    resourceClass: "confidential",
  });
  if (disclosure.kind === "deny") {
    throw new Error("step_up_disclosure_denied");
  }
  const controls = await stepUpControls();
  const controlRef = await issueApprovalControl(controls, {
    actionBindingId: input.actionBindingId,
    actionRef: input.actionRef,
    assurance: "oidc_step_up",
    disclosure,
    expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    operationId: input.operationId,
    principalId: verified.principalId,
    proposalRef: proposalRef(input.proposalId),
    sealedAudienceKind: "dm",
    tenantId: verified.tenantId,
  });
  return {
    approveUrl: stepUpUrl(input.publicOrigin, controlRef),
    controlRef,
  };
}

function rejectToyStepUpBinding(actionRef: SealedActionRef): void {
  if (actionRef.definition.digest === "stepup.local") {
    throw new Error("toy_stepup_local_forbidden");
  }
  if (
    actionRef.actionId === "inventory.requestStock" &&
    actionRef.resourceId === "inventory.item.1"
  ) {
    throw new Error("toy_inventory_camera_forbidden");
  }
  const boundResource = process.env.ZOEN_WEB_RESOURCE_ID;
  if (
    boundResource !== undefined &&
    boundResource.length > 0 &&
    actionRef.resourceId !== boundResource
  ) {
    throw new Error("action_ref_resource_mismatch");
  }
}

export async function completeAuthenticatedStepUp(input: {
  readonly sessionId: string;
  readonly accessToken: string;
  readonly commit: (
    proposalRef: string,
    operationId: string,
  ) => Promise<{ operationId: string }>;
}): Promise<{ proposalRef: string; operationId: string }> {
  const controls = await stepUpControls();
  const stepUps = await stepUpRegistry();
  const session = await stepUps.get(asSessionId(input.sessionId));
  const verified = verifiedMembershipFromAccessToken(input.accessToken);
  if (
    session.status !== "authenticated" ||
    String(session.requiredPrincipalId) !== String(verified.principalId) ||
    String(session.tenantId) !== String(verified.tenantId)
  ) {
    throw new Error("wrong_account");
  }
  const control = await controls.resolveApproval(session.controlRef);
  const operationId = control.operationId;
  if (operationId === undefined || operationId.length === 0) {
    throw new Error("step_up_missing_operation_id");
  }
  const receipt = await completeStepUpCommit({
    commit: async (proposalRef) =>
      input.commit(String(proposalRef), operationId),
    controls,
    session,
    stepUps,
  });
  return {
    operationId: receipt.operationId,
    proposalRef: String(receipt.proposalRef),
  };
}

function asSessionId(value: string): StepUpSessionId {
  return stepUpSessionId(value);
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length < 2 || parts[1] === undefined) {
    throw new Error("oidc_token_malformed");
  }
  const json = Buffer.from(
    parts[1].replaceAll("-", "+").replaceAll("_", "/"),
    "base64",
  ).toString("utf8");
  const parsed: unknown = JSON.parse(json);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("oidc_token_malformed");
  }
  return parsed as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

async function ensureInteractionSchema(client: pg.Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS interaction_controls (
      ref TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      principal_id TEXT NOT NULL,
      proposal_ref TEXT,
      action_binding_id TEXT,
      action_ref JSONB,
      disclosure JSONB,
      assurance TEXT,
      nonce TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ,
      step_up_session_id TEXT,
      sealed_audience_kind TEXT,
      payload JSONB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS interaction_step_ups (
      id TEXT PRIMARY KEY,
      control_ref TEXT NOT NULL,
      proposal_ref TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      required_principal_id TEXT NOT NULL,
      oidc_subject TEXT,
      account_id TEXT,
      expires_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL,
      payload JSONB NOT NULL
    );
  `);
}
