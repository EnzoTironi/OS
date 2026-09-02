import { execFileSync } from "node:child_process";

const fullGitObjectIdPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const fixtureSourceCommitPlaceholder = "__CANDIDATE_SHA__";

export type VerificationMutantResult = {
  readonly id: string;
  readonly killed: boolean;
  readonly observation: string;
};

export const sourceCommitKeys = [
  "sourceCommit",
  "sourceSha",
  "source_sha",
  "headSha",
] as const;

export function exactGitObjectId(value: unknown): string | null {
  return typeof value === "string" && fullGitObjectIdPattern.test(value)
    ? value
    : null;
}

export function sourceCommitMatches(
  candidate: string,
  evidence: string,
): boolean {
  return (
    exactGitObjectId(candidate) !== null &&
    exactGitObjectId(evidence) !== null &&
    candidate === evidence
  );
}

export function hasSourceCommitAlias(
  body: object,
  keys: readonly string[] = sourceCommitKeys,
): boolean {
  return keys.some((key) => Object.hasOwn(body, key));
}

export function gitHead(repositoryRoot: string): string {
  const head = execFileSync("/usr/bin/git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { PATH: "/usr/bin:/bin" },
  }).trim();
  if (exactGitObjectId(head) === null) {
    throw new Error(`git returned an invalid HEAD: ${JSON.stringify(head)}`);
  }
  return head;
}

export function resolveCandidateCommit(
  repositoryRoot: string,
  environmentValue = process.env.ZOEN_VERIFY_CANDIDATE_SHA,
): string {
  if (environmentValue !== undefined) {
    const candidate = exactGitObjectId(environmentValue.trim());
    if (candidate === null) {
      throw new Error(
        "ZOEN_VERIFY_CANDIDATE_SHA must be a full lowercase Git object ID",
      );
    }
    return candidate;
  }
  return gitHead(repositoryRoot);
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
    const commit = exactGitObjectId(Reflect.get(body, key));
    if (commit === null) {
      return null;
    }
    commits.push(commit);
  }
  const first = commits[0];
  if (first === undefined || commits.some((commit) => commit !== first)) {
    return null;
  }
  return first;
}

export function bindFixtureCommitValue(
  value: unknown,
  candidate: string,
): unknown {
  if (typeof value === "string") {
    return value === fixtureSourceCommitPlaceholder ? candidate : value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => bindFixtureCommitValue(entry, candidate));
  }
  if (value !== null && typeof value === "object") {
    const bound: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      bound[key] = bindFixtureCommitValue(entry, candidate);
    }
    return bound;
  }
  return value;
}

export function sourceCommitVerificationMutants(
  candidate: string,
): VerificationMutantResult[] {
  const abbreviated = candidate.slice(0, 7);
  const malformed = [
    "a".repeat(39),
    "a".repeat(41),
    "A".repeat(40),
    "g".repeat(40),
    fixtureSourceCommitPlaceholder,
  ];
  const validSha256 = "a".repeat(64);
  const abbreviatedKilled =
    exactSourceCommit({ sourceCommit: abbreviated }, sourceCommitKeys) === null &&
    !sourceCommitMatches(candidate, abbreviated);
  const malformedKilled =
    malformed.every(
      (commit) =>
        exactSourceCommit({ sourceCommit: commit }, sourceCommitKeys) === null,
    ) &&
    exactSourceCommit({ sourceCommit: validSha256 }, sourceCommitKeys) ===
      validSha256;

  return [
    {
      id: "accept-abbreviated-commit",
      killed: abbreviatedKilled,
      observation: abbreviatedKilled
        ? "strict provenance boundary rejected abbreviated commit evidence"
        : "abbreviated commit evidence survived the strict provenance boundary",
    },
    {
      id: "accept-malformed-commit",
      killed: malformedKilled,
      observation: malformedKilled
        ? "strict parser rejected malformed commits and retained full SHA-256 support"
        : "malformed commit evidence survived the strict parser",
    },
  ];
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
