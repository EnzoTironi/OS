# ADR-0023: JCS RFC 8785 is the DefinitionDigest hasher; never silently rehash history

**Status:** Accepted for V1  
**Date:** 2026-08-25

## Context

Published ontology revisions are immutable (ADR-0008). `DefinitionDigest` is SHA-256 of the already-normalized canonical IR bytes. Two libraries were in use: TypeScript `canonicalize` 4.x and Rust `serde_jcs` 0.2. They happen to agree today (UTF-16 key order, ES6 `NumberToString`, short escapes for `\b\t\n\f\r`). A third, dependency-free implementation is required inside `zoen-core` because that crate must have zero Cargo dependencies.

Changing any of those rules, or swapping libraries, would rewrite historical `definition_revisions.digest` values and break pins such as `packages/ontology/fixtures/inventory.sha256`.

Migration `0015_state_basis_digest_rehash.sql` rehashes **state basis**, not definition identity. It is not a license to UPDATE `definition_revisions.digest`.

## Decision

1. Zoen JCS is RFC 8785 as implemented by `serde_jcs` 0.2 / `canonicalize` 4.x. Shared vectors live under `testdata/jcs/`.
2. `zoen-core::jcs` is the Rust source of truth (no crates). Engine admission may keep `serde_jcs` only as a differential check against `zoen-core` and the fixtures.
3. TypeScript authoring (`packages/ontology`) uses the in-repo JCS module. `canonicalize` remains a test oracle, not the production hasher.
4. `zoen.definition.v1` identity is SHA-256 (lowercase hex) of **normalized, then JCS** UTF-8 bytes. Schema/version is part of the hashed document. A JCS or normalize rule change requires a **new `schema` value** and a new ADR. Stored digests are never rewritten in place.
5. CI must reject fixture drift (`scripts/generate-jcs-fixtures.mjs --check`) and run Rust/TypeScript fixture tests.

## Safe migration

To change canonicalization:

1. Publish a new schema id (for example `zoen.definition.v2`).
2. Admit new revisions under the new schema only.
3. Keep serving historical `v1` rows by their original digest.
4. Do not run an in-place digest UPDATE.

## Consequences

Bit-perfect Rust/TypeScript conformance is a release gate. Drift is a bug, not a migration.
