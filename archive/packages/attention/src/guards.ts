import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const EFFECT_IMPORT_MARKERS = [
  'from "@zoen/effect-worker"',
  "from '@zoen/effect-worker'",
  "from '../../effect-worker",
  'from "../../effect-worker',
  "EffectService",
  "createEffectAdapter(",
] as const;

function resolveSourceRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(process.cwd(), "archive", "packages", "attention", "src"),
    path.resolve(here, "..", "..", "..", "..", "archive", "packages", "attention", "src"),
    path.resolve(here, "..", "src"),
    here,
  ];
  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, "identity.ts"))) {
      return candidate;
    }
    if (existsSync(path.join(candidate, "identity.js"))) {
      return candidate;
    }
  }
  return path.join(process.cwd(), "archive", "packages", "attention", "src");
}

/**
 * Conformance guards that kill named mutants without needing a live run.
 * text-only-dedupe and automation-calls-external-effect.
 */
export function assertAttentionPackageGuards(options?: {
  readonly sourceRoot?: string;
}): {
  readonly textOnlyDedupeKilled: true;
  readonly automationCallsExternalEffectKilled: true;
  readonly checkedFiles: readonly string[];
} {
  const root = options?.sourceRoot ?? resolveSourceRoot();
  const files = [
    "identity",
    "types",
    "evaluate",
    "execute",
    "wake",
    "delivery",
    "index",
  ];
  const checked: string[] = [];
  for (const base of files) {
    const tsPath = path.join(root, `${base}.ts`);
    const jsPath = path.join(root, `${base}.js`);
    const absolute = existsSync(tsPath) ? tsPath : jsPath;
    const relative = path.basename(absolute);
    const source = readFileSync(absolute, "utf8");
    checked.push(relative);

    if (base === "types") {
      for (const banned of [
        "textHash:",
        "messageHash:",
        "renderedCopyHash:",
        "notificationTextHash:",
      ]) {
        if (source.includes(banned)) {
          throw new Error(`text-only-dedupe mutant alive: found ${banned}`);
        }
      }
      if (!source.includes("Generated notification text is NOT a field")) {
        throw new Error(
          "text-only-dedupe mutant alive: ConditionIdentity lost text exclusion invariant",
        );
      }
    }

    if (base === "wake" || base === "execute" || base === "evaluate") {
      for (const forbidden of EFFECT_IMPORT_MARKERS) {
        if (source.includes(forbidden)) {
          throw new Error(
            `automation-calls-external-effect mutant alive: found ${forbidden} in ${relative}`,
          );
        }
      }
    }
  }

  return {
    textOnlyDedupeKilled: true,
    automationCallsExternalEffectKilled: true,
    checkedFiles: checked,
  };
}
