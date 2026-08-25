# Action preview_hash fixtures

Shared bit-perfect vectors for `zoen.action.preview.v1`.
`preview_hash` is SHA-256 of RFC 8785 JCS bytes of this document.

Each case has:

- `<name>.json` — wire document (`schema`, `locale`, `action`, `resource`,
  sorted `inputs`, `canonical_preview_text`)
- `<name>.jcs` — exact JCS bytes (no trailing newline)
- `<name>.sha256` — lowercase hex digest of those bytes, plus `\n`

Rust (`zoen-engine::preview_hash`) and TypeScript (`actionPreviewHash`) must
emit the same digest. A hasher or grammar change needs a new `schema` value
and a new ADR. See `docs/adr/0025-action-preview-hash-binding.md`.
