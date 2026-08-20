import { z } from "zod";

const sessionIdSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);

export function loadAdaptiveSessionId(input: {
  readonly definitionId: string;
  readonly tenantId: string;
}): string | undefined {
  const key = adaptiveSessionKey(input);
  const value = localStorage.getItem(key);
  const parsed = sessionIdSchema.safeParse(value);
  if (!parsed.success) {
    localStorage.removeItem(key);
    return undefined;
  }
  return parsed.data;
}

export function saveAdaptiveSessionId(input: {
  readonly definitionId: string;
  readonly sessionId: string;
  readonly tenantId: string;
}): void {
  localStorage.setItem(
    adaptiveSessionKey(input),
    sessionIdSchema.parse(input.sessionId),
  );
}

export function clearAdaptiveSessionId(input: {
  readonly definitionId: string;
  readonly tenantId: string;
}): void {
  localStorage.removeItem(adaptiveSessionKey(input));
}

function adaptiveSessionKey(input: {
  readonly definitionId: string;
  readonly tenantId: string;
}): string {
  return [
    "zoen.web.adaptive-surface.v1",
    input.tenantId,
    input.definitionId,
  ].join(":");
}
