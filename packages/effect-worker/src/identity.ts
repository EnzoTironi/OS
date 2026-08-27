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
