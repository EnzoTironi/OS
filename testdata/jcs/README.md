# JCS RFC 8785 fixtures

Shared bit-perfect vectors for Zoen canonical JSON. Rust (`zoen-core`,
`zoen-engine` admission) and TypeScript (`@zoen/ontology`, `@zoen/speaker`)
must emit identical UTF-8 bytes and the same lowercase SHA-256 hex digest.

## Layout

Each success case is a directory entry with three files:

- `<name>.json` — input document (pretty or compact; parsers must accept both)
- `<name>.jcs` — exact RFC 8785 / JCS bytes as used by Zoen (no trailing newline)
- `<name>.sha256` — 64-char lowercase hex SHA-256 of those JCS bytes, plus `\n`

Error cases live under `errors/` with `<name>.json` and `<name>.error`
(`duplicate_key`, `invalid_utf8`, `non_finite_number`, `trailing_junk`).

## What is hashed

`DefinitionDigest` for `zoen.definition.v1` is SHA-256 of the **already
normalized** canonical IR bytes, not of authoring source and not of Protobuf.

```text
authoring → validate → semantic normalize → JCS bytes → SHA-256 hex
```

Semantic normalize (family/id sort, omit empty `outputs`, tagged decimal
strings) happens **before** JCS. Changing JCS libraries or number/escape
rules without a new `schema` value would silently rehash history. That is
forbidden. See `docs/adr/0023-jcs-rfc8785-and-definition-digest-versioning.md`.

## Historical identity

`packages/ontology/fixtures/inventory.canonical.json` and
`inventory.sha256` are production-shaped pins. Tests must keep that digest
stable. Do not rewrite stored `definition_revisions.digest` rows.

State-basis rehash (`0015_state_basis_digest_rehash.sql`) is a different
hasher and is not a license to rehash definition identity.

## Implementation notes

Zoen JCS matches `serde_jcs` 0.2 and `canonicalize` 4.x:

- object keys sorted by UTF-16 code units
- ES6 / `Number.prototype.toString` numbers (`1e+30`, not `1e30`)
- `null` is present; omitted fields stay omitted
- duplicate keys are rejected before hashing
- `"` and `\` escaped; `\b \t \n \f \r` short forms; other controls `\u00xx`
