import { z } from "zod";

const restateIdentityKeySchema = z
  .string()
  .regex(/^publickeyv1_[1-9A-HJ-NP-Za-km-z]+$/);

/**
 * Parse Restate v1 request-identity public keys.
 *
 * Context: `ZoenEffect.execute` mints an EffectService bearer for the command
 * tenant. Only a Restate cluster holding the matching private key may invoke it.
 *
 * Inputs: JSON array of `publickeyv1_...` strings.
 * Outputs: Non-empty list of identity keys.
 * Fail-closed: missing, empty, or malformed values throw.
 */
export function parseRestateIdentityKeys(raw: string): string[] {
  const parsed: unknown = JSON.parse(raw);
  return z.array(restateIdentityKeySchema).min(1).parse(parsed);
}

/**
 * Build the Restate endpoint options that bind services to request identity.
 *
 * Context: `worker.ts` spreads this into `restate.serve`. The identity test
 * spreads the same object into `createEndpointHandler` so unsigned invoke and
 * `/discover` stay gated by production options, not a sibling stub endpoint.
 *
 * Inputs: env with `ZOEN_RESTATE_IDENTITY_KEYS`, plus the Restate services.
 * Outputs: `{ identityKeys, services }` for spreading into serve or handler.
 * Fail-closed: missing, empty, or malformed keys throw.
 */
export function effectWorkerEndpoint<TService>(
  env: { readonly ZOEN_RESTATE_IDENTITY_KEYS: string },
  services: readonly TService[],
): { identityKeys: string[]; services: TService[] } {
  return {
    identityKeys: parseRestateIdentityKeys(env.ZOEN_RESTATE_IDENTITY_KEYS),
    services: [...services],
  };
}
