# ADR-0025: Action preview_hash is SHA-256 of RFC 8785 JCS

**Status:** Accepted for V1
**Date:** 2026-08-25

## Context

ADR-0002 requires proposal, approval, revalidation, then commit. ADR-0023 froze RFC 8785 JCS for definition identity. Issue #403 requires a confirmation to bind `proposal_id` plus an exact `preview_hash` so a stale or tampered preview cannot authorize a different mutation.

`intent_digest` already pins tenant, definition, inputs, and state basis. It is an authority pin, not a user-facing preview. Speaker must show a canonical preview without leaking proposal, operation, claim, tenant, or principal identifiers.

## Decision

1. The kernel builds `zoen.action.preview.v1` at propose time. The document contains `schema`, `locale` (`pt-BR`), `action`, `resource`, sorted `inputs`, and `canonical_preview_text`.
2. `preview_hash` is SHA-256 (lowercase hex) of the RFC 8785 JCS bytes of that document. `zoen-core` builds the JSON; `zoen-engine` canonicalizes and hashes. TypeScript uses the same document and the in-repo JCS module.
3. Commit recomputes the preview from stored action, resource, and inputs. It accepts only when that digest equals the stored hash, the stored spoken text, `proposal_id`, `operation_id`, and the presented `preview_hash`. Missing, invalid, drifted, or unequal hashes return `COMMIT_STATUS_PREVIEW_MISMATCH` and do not mutate. Comparison is constant-time. A retry of an already committed `operation_id` returns the stored receipt before the hash gate.
4. Approve binds the same presented hash. Missing or unequal hashes are Connect invalid, not a Cedar deny.
5. Speaker renders `canonical_preview_text` only. `preview_hash`, proposal ids, and resource ids stay on the host binding. OSDK `commit()` requires a caller-presented `previewHash` and never copies the Propose result unless the caller passed that same digest.
6. A hasher or grammar change requires a new `schema` value and a new ADR. Stored hashes are not rewritten.
7. Pre-0020 rows backfilled with the all-zero digest and empty text are repaired on idempotent Propose when `proposal_id`, `operation_id`, and `intent_digest` match.

`intent_digest` stays the internal authority pin. `preview_hash` is the user-binding pin.

## Consequences

Clients that call Commit or Approve without the hash from Propose fail closed. OSDK generated `commit()` types include required `previewHash`. Isolates never invent a hash; the host reuses the kernel-stored value from the same proposal.

Spoken `requestStock` / `recordQuote` text still omits the resource id. Putting raw entity ids in speech trips the leak filter, and this branch has no presentation catalog. `valid_at` stays on `intent_digest` and the stale-state check, not on the preview document. Personal `note` / `remind` still Propose then Commit in one tool turn; the typed body is the confirm, and the tool now sends the kernel hash from Preview. e2e auto-fill of omitted hashes stays outside `governed-action`. That scenario uses unbound clients and passes the hash itself.
