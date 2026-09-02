export const sourceCommitKeys = [
  "sourceCommit",
  "sourceSha",
  "source_sha",
  "headSha",
] as const;

export function exactSourceCommit(
  body: object,
  keys: readonly string[],
): string | null {
  const commits: string[] = [];
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) {
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
  if (Object.prototype.hasOwnProperty.call(body, "verdict")) {
    if (typeof body.verdict !== "string") {
      return false;
    }
    signals.push(body.verdict.toUpperCase() === "PASS");
  }
  if (Object.prototype.hasOwnProperty.call(body, "status")) {
    if (typeof body.status !== "string") {
      return false;
    }
    const status = body.status.toLowerCase();
    signals.push(status === "pass" || status === "passed" || status === "ok");
  }
  if (Object.prototype.hasOwnProperty.call(body, "assertions")) {
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
  return signals.length > 0 && signals.every((signal) => signal);
}
