# ADR-0025: Action preview_hash is SHA-256 of RFC 8785 JCS

**Status:** Accepted for V1
**Date:** 2026-08-25

## Context

ADR-0002 requires proposal, approval, revalidation, then commit. ADR-0023 froze RFC 8785 JCS for definition identity. Issue #403 requires a confirmation to bind `proposal_id` plus an exact `preview_hash` so a stale or tampered preview cannot authorize a different mutation.

`intent_digest` already pins tenant, definition, inputs, and state basis. It is an authority pin, not a user-facing preview. Speaker must show a canonical preview without leaking proposal, operation, claim, tenant, or principal identifiers.

## Decision

1. The kernel builds `zoen.action.preview.v1` at propose time. The document contains `schema`, `locale` (`pt-BR`), `action`, `resource`, sorted `inputs`, and `canonical_preview_text`.
2. `preview_hash` is SHA-256 (lowercase hex) of the RFC 8785 JCS bytes of that document. `zoen-core` builds the JSON; `zoen-engine` canonicalizes and hashes. TypeScript uses the same document and the in-repo JCS module.
3. Commit accepts only when `proposal_id`, `operation_id`, and the presented `preview_hash` match the stored proposal. Missing, invalid, or unequal hashes return `COMMIT_STATUS_PREVIEW_MISMATCH` and do not mutate.
4. Speaker renders `canonical_preview_text` only. `preview_hash`, proposal ids, and resource ids stay on the host binding.
5. A hasher or grammar change requires a new `schema` value and a new ADR. Stored hashes are not rewritten.

`intent_digest` stays the internal authority pin. `preview_hash` is the user-binding pin.

## Consequences

Clients that call Commit without the hash from Propose fail closed. OSDK `commit()` sends the hash returned by Propose. Isolates never invent a hash; the host reuses the kernel-stored value from the same proposal.
