#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
SNAPSHOT_BRANCH="research/wave-a-2026-08-16"
SNAPSHOT_SHA="53235fc5b8fb723e84351435ccfad719e784d5ba"
WORKTREE="${TMPDIR:-/tmp}/os-wave-a-graph-$$"
OUTPUT="$ROOT/research/graph/generated/wave-a-graph.json"

cleanup() {
  git -C "$ROOT" worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true
}
trap cleanup EXIT

git -C "$ROOT" worktree add --detach "$WORKTREE" "$SNAPSHOT_SHA" >/dev/null
ACTUAL="$(git -C "$WORKTREE" rev-parse HEAD)"
if [[ "$ACTUAL" != "$SNAPSHOT_SHA" ]]; then
  echo "snapshot mismatch: expected $SNAPSHOT_SHA got $ACTUAL" >&2
  exit 2
fi

# Review resolution overrides are post-review indexing metadata. They are copied
# into the detached source worktree solely for graph derivation; the frozen
# branch is never mutated.
mkdir -p "$WORKTREE/research/graph"
cp "$ROOT/research/graph/review-overrides.json" "$WORKTREE/research/graph/review-overrides.json"

python3 "$ROOT/research/graph/build_graph.py" \
  --root "$WORKTREE" \
  --snapshot-branch "$SNAPSHOT_BRANCH" \
  --snapshot-commit "$SNAPSHOT_SHA" \
  --out "$OUTPUT"

python3 "$ROOT/research/graph/normalize_graph.py" "$OUTPUT" \
  --source-root "$WORKTREE"

python3 "$ROOT/research/graph/validate_graph.py" "$OUTPUT" \
  --source-root "$WORKTREE" \
  --expected-snapshot "$SNAPSHOT_SHA"

printf 'Wave A graph built from %s -> %s\n' "$SNAPSHOT_SHA" "$OUTPUT"
