/**
 * Overlay `ZOEN_EXECUTION_MODEL` onto `ZOEN_MODEL` for the workbench.
 *
 * Context: WhatsApp serve composition root. `resolveLanguageModel` stays
 * the only credentialed factory and still reads `ZOEN_MODEL`.
 * Inputs: process env. Outputs: env for `resolveLanguageModel`.
 * Side effects: none. Does not speak to the user.
 */
export function executionModelEnv(
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const specified = env.ZOEN_EXECUTION_MODEL?.trim();
  if (specified === undefined || specified.length === 0) {
    return env;
  }
  return { ...env, ZOEN_MODEL: specified };
}
