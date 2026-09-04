import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const WORLD_DEFINITION_DIGEST = "a".repeat(64);
export const WORLD_ACTION_ID = "zoen.world.discover";
export const SEVEN_VERBS = [
  "Discover",
  "Query",
  "Propose",
  "Decide",
  "Commit",
  "Explain",
  "Execute",
] as const;
export const KERNEL_SURFACES = ["cli", "connect", "mcp", "eve"] as const;

export interface ZoenResult {
  status: number | null;
  stdout: string;
  stderr: string;
  body?: Record<string, unknown>;
}

export function zoenBinaryPath(repositoryRoot: string): string {
  const targetDir = process.env.CARGO_TARGET_DIR ?? path.join(repositoryRoot, "target");
  return path.join(targetDir, "debug", "zoen");
}

export function ontologyCatalogBytes(label: string): string {
  return `${JSON.stringify({
    label,
    publicVerbs: [...SEVEN_VERBS],
    schema: "zoen.ontology-catalog.v1",
  })}\n`;
}

export function buildDiscoverPolicyCatalog(): {
  bytes: string;
  evidenceDigest: string;
  policyDigest: string;
} {
  const source = `permit (
    principal,
    action == Action::"discover",
    resource
)
when {
    context.actionId == "${WORLD_ACTION_ID}"
};
`;
  const policyDigest = createHash("sha256").update(source).digest("hex");
  const bytes = `${JSON.stringify({
    schema: "zoen.policy-catalog.v1",
    authorization: {
      policies: [
        {
          actionId: WORLD_ACTION_ID,
          definitionDigest: WORLD_DEFINITION_DIGEST,
          digest: policyDigest,
          policyId: "policy.world.discover.r1",
          revision: 1,
          source,
        },
      ],
    },
    membership: [],
    sourceAdmission: [],
  })}\n`;
  return { bytes, evidenceDigest: policyDigest, policyDigest };
}

export function createZoenRunner(zoenPath: string, databaseUrl: string) {
  function runZoen(args: string[]): ZoenResult {
    try {
      const stdout = execFileSync(zoenPath, args, {
        encoding: "utf8",
        env: { ...process.env, DATABASE_URL: databaseUrl },
      });
      return { status: 0, stdout, stderr: "" };
    } catch (error) {
      const failure = error as {
        status?: number | null;
        stdout?: string;
        stderr?: string;
      };
      return {
        status: failure.status ?? 1,
        stdout: failure.stdout ?? "",
        stderr: failure.stderr ?? String(error),
      };
    }
  }

  function parseJson(text: string): Record<string, unknown> {
    return JSON.parse(text) as Record<string, unknown>;
  }

  function withBody(result: ZoenResult): ZoenResult {
    if (result.status === 0 && result.stdout.trim() !== "") {
      return { ...result, body: parseJson(result.stdout) };
    }
    return result;
  }

  function construct(file: string): Record<string, unknown> {
    const result = runZoen(["world", "release", "construct", "--file", file]);
    assert.equal(result.status, 0, result.stderr);
    return parseJson(result.stdout);
  }

  function publish(file: string, principal: string, evidenceDigest: string): ZoenResult {
    return runZoen([
      "world",
      "release",
      "publish",
      "--file",
      file,
      "--principal",
      principal,
      "--policy-id",
      "policy.world",
      "--policy-digest",
      evidenceDigest,
      "--policy-revision",
      "1",
      "--determining-policy",
      "policy.world",
    ]);
  }

  function preview(world: string, digest: string, principal: string): ZoenResult {
    return withBody(
      runZoen([
        "world",
        "release",
        "preview",
        "--world",
        world,
        "--digest",
        digest,
        "--principal",
        principal,
      ]),
    );
  }

  function decideRelease(
    previewDigest: string,
    principal: string,
    decision: "approve" | "reject",
  ): ZoenResult {
    return runZoen([
      "world",
      "release",
      "decide",
      "--preview-digest",
      previewDigest,
      "--principal",
      principal,
      "--decision",
      decision,
    ]);
  }

  function activate(
    world: string,
    digest: string,
    principal: string,
    previewDigest: string,
  ): ZoenResult {
    return runZoen([
      "world",
      "release",
      "activate",
      "--world",
      world,
      "--digest",
      digest,
      "--preview-digest",
      previewDigest,
      "--principal",
      principal,
    ]);
  }

  function approveAndActivate(
    world: string,
    digest: string,
    principal: string,
  ): { preview: Record<string, unknown>; activate: ZoenResult } {
    const previewed = preview(world, digest, principal);
    assert.equal(previewed.status, 0, previewed.stderr);
    const previewDigest = asString(previewed.body?.previewDigest);
    assert.equal(decideRelease(previewDigest, principal, "approve").status, 0);
    const activated = activate(world, digest, principal, previewDigest);
    assert.equal(activated.status, 0, activated.stderr);
    return { preview: previewed.body ?? {}, activate: activated };
  }

  return {
    activate,
    approveAndActivate,
    construct,
    decideRelease,
    parseJson,
    preview,
    publish,
    runZoen,
    withBody,
  };
}

export async function writeGeneratedJson(
  directory: string,
  name: string,
  content: Record<string, unknown>,
): Promise<string> {
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, name);
  await writeFile(file, `${JSON.stringify(content, null, 2)}\n`);
  return file;
}

export function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function recordAssertion(
  assertions: Record<string, boolean>,
  name: string,
  observed: boolean,
): void {
  assert.ok(observed, name);
  assertions[name] = observed;
}
