import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import type { TrustedInteractionContext } from "./types.js";
import { INTERACTION_TOOL_NAMES } from "./interaction-tools.js";

const FORBIDDEN_SPEAKER_IMPORT =
  /from\s+["'](?:@zoen\/(?:ontology|osdk)|@connectrpc\/connect(?:-node)?|@bufbuild\/protobuf(?:\/wkt)?|@chat-adapter\/[^"']+)["']|from\s+["']\.\.\/\.\.\/(?:ontology|osdk|sdk)\/[^"']+["']|world_pb|action_pb/;

const FORBIDDEN_SPEAKER_DEP = new Set([
  "@zoen/ontology",
  "@zoen/osdk",
  "@zoen/sdk",
  "@connectrpc/connect",
  "@connectrpc/connect-node",
  "@bufbuild/protobuf",
  "@chat-adapter/telegram",
]);

type MembershipKey = keyof TrustedInteractionContext | keyof TrustedInteractionContext["channel"];
type ChatSdkShapedKey =
  | "adapter"
  | "callbackData"
  | "card"
  | "experienceToken"
  | "threadKind";
type ChatSdkInMembership = Extract<MembershipKey, ChatSdkShapedKey>;
const noChatSdkInMembership: [ChatSdkInMembership] extends [never] ? true : never =
  true;
void noChatSdkInMembership;

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const next = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listTsFiles(next));
      continue;
    }
    if (entry.name.endsWith(".ts")) {
      out.push(next);
    }
  }
  return out;
}

function packageJsonDeps(packageDir: string): Record<string, string> {
  const raw = JSON.parse(
    readFileSync(path.join(packageDir, "package.json"), "utf8"),
  ) as { dependencies?: Record<string, string> };
  return raw.dependencies ?? {};
}

test("speaker package has no ontology, OSDK, Connect, or Chat SDK dependency", () => {
  const deps = packageJsonDeps(path.join(process.cwd(), "packages", "speaker"));
  for (const name of FORBIDDEN_SPEAKER_DEP) {
    assert.equal(deps[name], undefined, name);
  }
});

test("ontology package has no speaker or Chat SDK dependency", () => {
  const deps = packageJsonDeps(path.join(process.cwd(), "packages", "ontology"));
  assert.equal(deps["@zoen/speaker"], undefined);
  assert.equal(deps["@zoen/transport"], undefined);
  assert.equal(deps["@chat-adapter/telegram"], undefined);
});

test("speaker sources do not import Cedar, World, OSDK Connect, or Chat SDK", () => {
  const root = path.join(process.cwd(), "packages", "speaker", "src");
  for (const file of listTsFiles(root)) {
    const text = readFileSync(file, "utf8");
    const match = FORBIDDEN_SPEAKER_IMPORT.exec(text);
    assert.equal(match, null, `${path.relative(root, file)}: ${match?.[0]}`);
    if (!file.endsWith(".test.ts")) {
      assert.doesNotMatch(
        text,
        /ChatSdk/,
        `${path.relative(root, file)} mentions Chat SDK types`,
      );
    }
  }
});

test("ontology sources do not import speaker or Chat SDK", () => {
  const root = path.join(process.cwd(), "packages", "ontology", "src");
  const forbidden =
    /from\s+["']@zoen\/(?:speaker|transport)["']|ChatSdk|@chat-adapter/;
  for (const file of listTsFiles(root)) {
    const text = readFileSync(file, "utf8");
    const match = forbidden.exec(text);
    assert.equal(match, null, `${path.relative(root, file)}: ${match?.[0]}`);
  }
});

test("interaction tools are speak, wait, and spawn only", () => {
  assert.deepEqual(
    [...INTERACTION_TOOL_NAMES].sort(),
    ["spawn_execution", "speak_to_user", "wait"],
  );
});
