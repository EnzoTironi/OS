import path from "node:path";
import { nonceSchema } from "./pool-contracts.js";

export const repositoryRoot = process.cwd();
export const runScript = path.join(repositoryRoot, "e2e", "run.sh");
export const prepareLockScript = path.join(repositoryRoot, "e2e", "prepare-lock.mjs");
export const suiteReaderToken = nonceSchema.parse(
  internalFlag("--zoen-suite-reader-token"),
);
export const suiteOwnerNonce = nonceSchema.parse(
  internalFlag("--zoen-suite-owner-nonce"),
);
export const scenarioArguments = argumentsAfterSeparator();

function internalFlag(name: string): string {
  const separator = process.argv.indexOf("--");
  const limit = separator < 0 ? process.argv.length : separator;
  const index = process.argv.indexOf(name);
  const value = index < 2 || index >= limit ? undefined : process.argv[index + 1];
  if (value === undefined || value === "" || index + 1 >= limit) {
    throw new Error(`${name} is required before --`);
  }
  return value;
}

function argumentsAfterSeparator(): readonly string[] {
  const separator = process.argv.indexOf("--");
  if (separator < 0) {
    throw new Error("journey pool requires -- before scenario names");
  }
  return process.argv.slice(separator + 1);
}
