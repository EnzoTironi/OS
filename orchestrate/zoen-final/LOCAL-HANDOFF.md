# Zoen local continuation handoff

Generated on 2026-09-01 UTC for the transfer from `grok-coder-2` to Enzo's Mac.

## Active goal

Goal ID: `01a05e59-d3d3-7112-86db-db2ca59190ed`

Objective: Orchestrate and deliver the approved final Zoen product architecture through verified vertical journeys, merge-ready implementation, and production-shaped release proof.

The goal is paused for transport. It is not complete or blocked.

## Current frontier

- Repository: `EnzoTironi/OS`
- Base: `origin/main` at `d530f622141149f564a22e2f03051c34690426f4`
- Pilot branch: `codex/w1-01-governed-publish`
- Pilot PR: `#602`
- Pilot head: `601af9d472e6a9f0602e4c2e64477bd68df316bd`
- Pilot worktree was clean when transferred.
- Sonar is green with zero issues and 1.7% duplication.
- Every review thread present at transfer time was replied to and resolved.
- A current-head CodeRabbit incremental review was triggered after the final push.
- Fresh CI for the pilot head was still running at transfer time. Re-query it. Do not inherit a verdict from an older SHA.

## Restore on the Mac

Set task-specific paths. Do not reuse `HOME` for this.

```bash
export ZOEN_REPO="$PWD/OS"
export ZOEN_PR_WT="$PWD/OS-w1-01"
export ZOEN_HANDOFF="$PWD/zoen-handoff"

git clone https://github.com/EnzoTironi/OS.git "$ZOEN_REPO"
git -C "$ZOEN_REPO" fetch origin \
  codex/w1-01-governed-publish \
  codex/zoen-local-handoff
git -C "$ZOEN_REPO" worktree add \
  "$ZOEN_PR_WT" \
  codex/w1-01-governed-publish
```

Accept the Taildrop file from `grok-coder-2`, then restore it:

```bash
mkdir -p "$ZOEN_HANDOFF"
tar -xzf /path/to/zoen-local-handoff.tar.gz -C "$ZOEN_HANDOFF"
cd "$ZOEN_HANDOFF"
shasum -a 256 -c MANIFEST.sha256
rsync -a workspace-overlay/ "$ZOEN_REPO/"
```

The overlay contains only uncommitted source and orchestration state. It does not contain credentials.

If GitHub is unavailable, `zoen-refs.bundle` contains the transferred Git refs.

## Telegram browser sessions

The two authenticated Telegram sessions remain on the source Chrome. They are intentionally absent from the archive. Telegram Web state spans encrypted Chrome cookies and browser storage, and the Linux encryption keys do not transfer safely into the macOS Keychain.

Connect the Mac Chrome to this ChatGPT session through **Settings → Computer use**. Then migrate both accounts through Telegram's supported login flow in the Mac Chrome. Do not copy a Linux Chrome profile, cookie database, or plaintext session token into the repository or Taildrop archive.

## Prerequisites

Before validating, make these commands succeed on the Mac:

```bash
docker version
node --version
npm --version
rustc --version
cargo --version
gh auth status
jq --version
```

Use Node 22 and Rust 1.88. Docker Desktop must be running. Do not reuse the Linux `target`; warm a Mac-native worktree from a compatible Mac build cache only.

## One validation command

From the restored orchestration checkout, run exactly one gate:

```bash
"$ZOEN_REPO/orchestrate/zoen-final/validate-pr" \
  --pr 602 \
  --worktree "$ZOEN_PR_WT" \
  --expected-head 601af9d472e6a9f0602e4c2e64477bd68df316bd
```

The lever fails closed when the local SHA and PR SHA differ, the tracked tree is dirty, a live journey or evidence bundle fails, the definition-publication artifact does not name the exact SHA, CI fails or stays pending, a review thread remains open, or a fresh Codecov/Sonar comment reports failure. CodeRabbit remains an advisory source of findings, but its OSS quota is not a verdict. The exact-head independent verifier and ledger row are the merge gate.

The source machine lost Docker before the final local live run. Static checks, Rust tests, Clippy, builds, TypeScript lint, and Comment Sicko passed. Treat current-head GitHub CI and the Mac run above as the required live proof.

## Product decisions that must survive the move

- Zoen is exactly three products: Ontology CLI/API/MCP, Eve conversation, and Better Auth door.
- The product bar is Poke voice plus Palantir governed ontology. The product is named Eve, not Poke.
- Journeys drive the product. Do not add unit tests, mocks, fakes, stubs, or `vi.mock`.
- Restate owns only ontology `ZoenEffect`. Eve owns conversation durability. Do not add Redis.
- Pre-launch evolution deletes old paths. Do not add compatibility shims, aliases, dual reads/writes, or data-preserving backfills.
- Every actionable human or automated PR comment must be fixed. A changed head invalidates every prior verdict.
- Workers use isolated worktrees and private `target` copies. Never let concurrent writers share one writable Cargo target.
- Workers do not merge or deploy. The coordinator may merge and deploy only the exact ledger-verified SHA.

## Next move

Run the one-command gate on the Mac against PR #602. Fix every new current-head review finding, obtain an independent exact-head PASS, rerun the same command, and only then add the ledger row and merge the pilot. After the pilot lands, use its evidence to finalize the unit contract before starting the rolling Wave 1 worker window.

Do not deploy from the transferred state. Production-shaped deployment remains a later verified unit.

## Resume prompt

```text
$Poteto Mode
Resume goal 01a05e59-d3d3-7112-86db-db2ca59190ed from orchestrate/zoen-final/LOCAL-HANDOFF.md. Verify live Git and PR state first. Continue with the Next move, use isolated warmed worktrees and subagents, fix every current-head review comment, and keep the decision trail current.
```
