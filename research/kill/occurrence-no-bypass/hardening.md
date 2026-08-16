# Post-green hardening history — issue #157

**Architecture decision:** none.  
**Purpose:** preserve flaws discovered after green CI so future simplification cannot silently reintroduce them.

## H1 — Physical replay attempt was confused with semantic occurrence identity

The first model treated a new restore/replay `operation_id` as evidence of a new semantic creation attempt. A restore job with a new technical run id but the same record identity/meaning therefore conflicted.

**Correction:** separate:

```text
physical write/replay attempt identity
        ≠
semantic record/occurrence identity + content
```

A new physical attempt may reconstruct an identical semantic record without creating a second occurrence. Same stable record identity with different protected meaning remains a conflict.

## H2 — Failed writes could consume idempotency markers

The first green `SemanticStore` called `_operation_once()` before all later validation. A conflicting create/correction could fail after registering the operation fingerprint; retrying the same operation could then return as a false no-op.

That violates #40's commit contract.

**Correction:** `AtomicSemanticStore` makes operation marker + authorized mutation one bounded atomic unit. Failed operations restore records/history/corrections/projections/operation markers. Dedicated regressions prove a failed create/correction does not consume an operation id.

Production must use the real transactional authority boundary; Python snapshots are only the sensitivity model.

## H3 — Source evidence was entangled with occurrence identity

The first record fingerprint included `source_evidence`. That makes a second independent observation of the same business occurrence look like a different occurrence identity/content.

Simply removing provenance from the fingerprint would also be unsafe because a second source could then be silently discarded.

**Correction:** semantic fingerprint excludes provenance multiplicity, while `attach_evidence` is an explicit, authorized, idempotent envelope operation. A second source cannot call `create` and disappear into dedupe; it must add provenance without changing `semantic_core` or creating another business occurrence.

## H4 — Privacy authority was frozen into the historical Type revision

The first model checked `record.type_revision.redactable_payload_fields`. That preserves historical schema meaning but can violate current law/policy: a field that was not erasable when the record was admitted may become erasable later.

**Correction:** the hardened candidate separates:

```text
historical Type revision -> what the record/field meant then
current PrivacyPolicyRevision -> what may/must be erased now
```

Erasure proof context includes the current policy revision. A proof from policy v2 becomes stale under v3 even when the same field remains erasable.

This is an important argument against treating `sealed_semantics` as absolute immutability.

## H5 — Physical enforcement must not depend on Event type names

The PostgreSQL 18 experiment projects the generic contract to a real local authority table:

- application role cannot update protected semantic core;
- privileged semantic-admin role has UPDATE but a generic trigger rejects changes when `sealed_semantics=true`;
- the same trigger protects `StockMovement` and non-event `PublishedDefinition`;
- mutable `MutableNote` can change;
- payload and representation version can change independently.

The trigger contains no Event/Occurrence type-name branch.

This is evidence that lifecycle enforcement can be physically implemented without a native Event base sort.

## Still-open boundary A — accepted record is not metaphysical truth

The store preserves that an **accepted semantic record/assertion** existed. If later evidence establishes that the claimed occurrence never happened, the correct model may retract/correct the assertion.

Do not phrase this as “the original real-world occurrence remains true.” The preserved history is what the organization accepted/recorded and how that position changed.

This distinction remains relevant to `Fact`/Observation/Assertion research and is not solved by `sealed_semantics`.

## Still-open boundary B — legal erasure of protected semantic core

The current model supports erasure of separately classified payload. It deliberately does not pretend to solve a law/policy that requires erasing information currently inside protected `semantic_core`.

A future system may need a stronger operation such as:

```text
legal erasure / crypto-erasure / deletion
```

with only whatever residual evidence the applicable law permits.

If that operation exists, it must be explicit and governed. It does not automatically imply Event should be a base sort; it may instead show that lifecycle contracts have more than one terminal retention behavior.

## Still-open boundary C — raw database superuser / physical compromise

A real superuser can potentially disable a trigger, rewrite storage or restore arbitrary bytes. Semantic APIs cannot prove otherwise.

Production no-bypass therefore also needs:

- least-privilege DB/service roles;
- separation of duties;
- tamper-evident audit/backup/restore controls where required;
- reconciliation after physical restore;
- operational governance of break-glass access.

A malicious superuser is a physical security boundary. Promoting Event to a semantic primitive does not make a compromised storage administrator obey it.

## Still-open boundary D — Is `sealed_semantics` merely Event renamed?

The current evidence argues **not for the lifecycle job** because the same contract has an independently useful non-event case (`PublishedDefinition`). The generic engine has no Event/Occurrence branch.

That is not proof that every semantic property of occurrences reduces to this contract. Occurrence time, participants, causation, provenance, satisfaction/fulfillment and domain meaning can still be modeled through Type/Relation/Computation semantics and must survive #71.

Revive Event as a base form only if those occurrence semantics require a unique interpreter/identity/evolution protocol that generic Type contracts cannot express without rebuilding an Event species.
