import { z } from "zod";
import type { ActionIdentity } from "./authority.js";

const fieldValueSchema = z.union([z.string(), z.boolean()]);
const storedActionSessionSchema = z
  .object({
    definitionDigest: z.string().regex(/^[0-9a-f]{64}$/),
    identity: z
      .object({
        bindingId: z.string().min(1),
        operationId: z.string().min(1),
        proposalId: z.string().min(1),
      })
      .strict(),
    tenantId: z.string().min(1),
    values: z.record(z.string(), fieldValueSchema),
  })
  .strict();

export type StoredActionSession = z.infer<typeof storedActionSessionSchema>;

export function createActionIdentity(bindingId: string): ActionIdentity {
  const id = crypto.randomUUID();
  return {
    bindingId,
    operationId: `operation.web.${id}`,
    proposalId: `proposal.web.${id}`,
  };
}

export function loadActionSession(input: {
  readonly bindingId: string;
  readonly definitionDigest: string;
  readonly tenantId: string;
}): StoredActionSession | undefined {
  const key = actionSessionKey(input);
  const encoded = localStorage.getItem(key);
  if (encoded === null) {
    return undefined;
  }
  try {
    return storedActionSessionSchema.parse(JSON.parse(encoded));
  } catch {
    localStorage.removeItem(key);
    return undefined;
  }
}

export function saveActionSession(session: StoredActionSession): void {
  localStorage.setItem(
    actionSessionKey({
      bindingId: session.identity.bindingId,
      definitionDigest: session.definitionDigest,
      tenantId: session.tenantId,
    }),
    JSON.stringify(session),
  );
}

export function clearActionSession(input: {
  readonly bindingId: string;
  readonly definitionDigest: string;
  readonly tenantId: string;
}): void {
  localStorage.removeItem(actionSessionKey(input));
}

function actionSessionKey(input: {
  readonly bindingId: string;
  readonly definitionDigest: string;
  readonly tenantId: string;
}): string {
  return [
    "zoen.web.action.v1",
    input.tenantId,
    input.definitionDigest,
    input.bindingId,
  ].join(":");
}
