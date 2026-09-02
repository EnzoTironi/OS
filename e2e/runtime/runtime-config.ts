import { nonceSchema } from "./runtime-contracts.js";

export function requiredFlag(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (value === undefined || value === "") {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function optionalFlag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

export function booleanFlag(name: string): boolean {
  const raw = requiredFlag(name);
  if (raw !== "true" && raw !== "false") {
    throw new Error(`${name} must be true or false`);
  }
  return raw === "true";
}

export function positiveInteger(raw: string, name: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}


export const command = process.argv[2] ?? "";
export const runtimeOwnerNonce = nonceSchema.parse(
  requiredFlag("--runtime-owner-nonce"),
);
