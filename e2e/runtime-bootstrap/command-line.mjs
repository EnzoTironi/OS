import { fileURLToPath, URL } from "node:url";

export const noncePattern = /^[0-9a-f]{64}$/;
export const scriptPath = fileURLToPath(
  new URL("../prepare-lock.mjs", import.meta.url),
);

export function commandAfterSeparator() {
  const separator = process.argv.indexOf("--");
  if (separator < 0) {
    throw new Error("missing -- before preparation command");
  }
  return process.argv.slice(separator + 1);
}

export function flag(name) {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (value === undefined || value === "") {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function optionalFlag(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

export function readerKind(value) {
  if (value !== "journey" && value !== "suite") {
    throw new Error("--kind must be journey or suite");
  }
  return value;
}

export function nonce(value) {
  if (!noncePattern.test(value)) {
    throw new Error("process owner nonce must be 64 lowercase hexadecimal characters");
  }
  return value;
}

export function positiveInteger(raw, name) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}
