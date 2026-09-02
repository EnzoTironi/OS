import { execFileSync } from "node:child_process";

export const sourceCommitKeys = [
  "sourceCommit",
  "sourceSha",
  "source_sha",
  "headSha",
] as const;

export function gitHead(repositoryRoot: string): string {
  const head = execFileSync("/usr/bin/git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(head)) {
    throw new Error(`git returned an invalid HEAD: ${JSON.stringify(head)}`);
  }
  return head;
}

export function exactSourceCommit(
  body: object,
  keys: readonly string[],
): string | null {
  const commits: string[] = [];
  for (const key of keys) {
    if (!Object.hasOwn(body, key)) {
      continue;
    }
    const value = Reflect.get(body, key);
    if (typeof value !== "string" || value.trim().length === 0) {
      return null;
    }
    commits.push(value.trim());
  }
  const first = commits[0];
  if (first === undefined || commits.some((commit) => commit !== first)) {
    return null;
  }
  return first;
}

export function scenarioPassed(body: Record<string, unknown>): boolean {
  const signals: boolean[] = [];
  if (Object.hasOwn(body, "verdict")) {
    if (typeof body.verdict !== "string") {
      return false;
    }
    signals.push(body.verdict.toUpperCase() === "PASS");
  }
  if (Object.hasOwn(body, "status")) {
    if (typeof body.status !== "string") {
      return false;
    }
    const status = body.status.toLowerCase();
    signals.push(status === "pass" || status === "passed" || status === "ok");
  }
  if (Object.hasOwn(body, "assertions")) {
    const assertions = body.assertions;
    if (
      assertions === null ||
      typeof assertions !== "object" ||
      Array.isArray(assertions)
    ) {
      return false;
    }
    const values = Object.values(assertions);
    signals.push(values.length > 0 && values.every((value) => value === true));
  }
  return signals.length > 0 && signals.every(Boolean);
}
