/**
 * ADR-0017 / ADR-0024: live workbench is Wasmtime. just-bash + node:vm
 * exist only behind an explicit test/dev flag.
 */
export const JS_SANDBOX_FLAG = "ZOEN_ALLOW_JS_SANDBOX";

export function jsSandboxAllowed(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env[JS_SANDBOX_FLAG] === "1";
}

export function assertJsSandboxAllowed(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!jsSandboxAllowed(env)) {
    throw new Error(
      "JS sandbox is not a production workbench; set ZOEN_ALLOW_JS_SANDBOX=1 for tests",
    );
  }
}
