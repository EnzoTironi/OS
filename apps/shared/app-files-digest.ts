import { createHash } from "node:crypto";

/**
 * One app file, content already decoded as UTF-8 text. `path` is relative to
 * the app directory root, POSIX separators.
 */
export interface AppFileText {
  readonly path: string;
  readonly text: string;
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Stable digest over an app directory: entries sorted by relative path, each
 * contributing `path\nsha256(text)\n` to a manifest whose sha256 is the digest.
 * Shared by the agent tool `build-app` (pins `filesDigest` at commit time) and
 * the effect worker (recomputes from the membership disk before deploy and
 * rejects on drift with `files_changed_after_commit`). v1 hashes text files
 * only: the agent generates app source/markup and binary assets are out of
 * scope, so both sides read files as UTF-8 text.
 */
export function digestAppFiles(files: readonly AppFileText[]): string {
  const sorted = [...files].sort((a, b) => {
    if (a.path < b.path) {
      return -1;
    }
    if (a.path > b.path) {
      return 1;
    }
    return 0;
  });
  const manifest = sorted
    .map((file) => `${file.path}\n${sha256Hex(file.text)}\n`)
    .join("");
  return sha256Hex(manifest);
}
