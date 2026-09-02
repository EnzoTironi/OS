import { createHash, randomBytes } from "node:crypto";
import { copyFile, mkdir, open, readdir, rename, stat } from "node:fs/promises";
import path from "node:path";

export async function copyDirectory(source: string, destination: string): Promise<void> {
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(from, to);
    } else if (entry.isFile()) {
      await copyFile(from, to);
    } else {
      throw new Error(`artifact tree contains unsupported entry ${from}`);
    }
  }
}

export function jsonObject(text: string, source: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text);
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${source} must contain a JSON object`);
  }
  return Object.fromEntries(Object.entries(value));
}


export function composeProjectName(scenario: string, suffix: string): string {
  const available = 63 - "zoen--".length - suffix.length;
  return `zoen-${scenario.slice(0, available)}-${suffix}`;
}

export function dnsLabel(value: string): string {
  if (value.length <= 63) {
    return value;
  }
  const prefix = value.slice(0, 46).replace(/-+$/, "");
  return `${prefix}-${digest(value).slice(0, 16)}`;
}

export function requireComposeProject(project: string | null): string {
  if (project === null) {
    throw new Error("Compose project is missing");
  }
  return project;
}

export function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}


export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

export function assertOwnedPath(parent: string, candidate: string): void {
  const relative = path.relative(parent, candidate);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`refusing to remove non-owned path ${candidate}`);
  }
}

export async function writeTextAtomically(outputPath: string, text: string): Promise<void> {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const temporary = `${outputPath}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  const handle = await open(temporary, "wx");
  try {
    await handle.writeFile(text);
  } finally {
    await handle.close();
  }
  await rename(temporary, outputPath);
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (isMissingFile(error)) {
      return false;
    }
    throw error;
  }
}

export function isAlreadyExists(error: unknown): boolean {
  return errorCode(error) === "EEXIST";
}

export function isPathOccupied(error: unknown): boolean {
  const code = errorCode(error);
  return code === "EEXIST" || code === "ENOTEMPTY";
}

export function isMissingFile(error: unknown): boolean {
  return errorCode(error) === "ENOENT";
}

export function isNoSuchProcess(error: unknown): boolean {
  return errorCode(error) === "ESRCH";
}

export function errorCode(error: unknown): unknown {
  return error instanceof Error && "code" in error
    ? Reflect.get(error, "code")
    : undefined;
}
