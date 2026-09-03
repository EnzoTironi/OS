# W2-01 WorldRelease contract correction

## Outcome

Replace the earlier value-record candidate with a release root that makes an unrelated ID impossible.

## Contract

`WorldRelease` content contains:

- `WorldId`.
- An optional parent `ReleaseDigest`.
- One `OntologyCatalogDigest`.
- One `PolicyCatalogDigest`.
- One `ExecutorCatalogDigest`.
- One `ComponentCatalogDigest`.

Keep every field private. Construct the value only through an API that serializes the schema-domain tag and those fields with RFC 8785 JCS, hashes the bytes, and assigns the resulting `ReleaseDigest`.

`WorldReleasePublication` records the release digest, publication time, publishing principal, and policy evidence. It is not part of the release content.

Activation state is separate. Enforce at most one active release for each World with a transactional store invariant. Historical releases remain addressable.

## Correction to the source candidate

The source candidate at `f00efc7f245db80ff0d0d9051986d4d61e0e20e8` exposed public fields and accepted an independently parsed `ReleaseDigest`. The corrective branch is `codex/w2-01-world-release-contract`.

The correction also replaces remaining domain-level World identifiers stored as raw strings, including private pack allowlists, with `WorldId`. Existing protocol and SQL field names may keep their boundary spelling until a separate migration changes them.

Land W2-01 after W1-03 and W1-04. Migrate every W1-03 `TenantId` reference to `WorldId`. Preserve `RegistrationGate`, `Backoff`, dispatch-version mismatch handling, secure session exchange, scoped revoke, and credential-race safety. Accept the Ontology Conversation and `whoCan` deletions from W1-04. Do not import a runtime file from PR 616.

Treat merges in `workload_credential_store`, `identity_store`, the core library, and the Action engine as semantic conflicts even when Git merges the text automatically.

## Proof

- Two identical release contents produce the same digest.
- Any changed content field changes the digest.
- Publication time, principal, and policy evidence do not change the release digest.
- Construction cannot pair arbitrary content with a caller-supplied ID.
- A second activation for one World replaces the active pointer atomically and leaves the prior release queryable.
- Domain code contains no raw-string World allowlist.
