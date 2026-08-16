# Adversarial review — issue #157 occurrence no-bypass

**Status:** review-clean  
**Architecture decision:** none  
**Candidate:** Event remains demotable for lifecycle enforcement; R6 remains `hypothesis`, not accepted.  
**Evidence run:** `31955779098` on head `3bdafb8a2271939b654f135b68a1e4362d8a57e8` passed both semantic and PostgreSQL 18 jobs before this status-only promotion.

## Review question

Does the current `Type + generic sealed-semantic lifecycle + typed authority` candidate really preserve occurrence history across every modeled write path, or has Event/append-only semantics merely moved into a hidden implementation branch?

## Findings

### 1. Tag-only Event remains dead

An advisory Event tag/interface without inescapable authority enforcement is insufficient. The candidate is materially stronger: committed semantic replacement is blocked by a generic Type contract at the authority boundary.

### 2. The generic lifecycle job is independently reusable

`PublishedDefinition` is a deliberately non-event sealed value. The same candidate and real PostgreSQL 18 control protect it and `StockMovement` without a Type-name branch. This weakens the claim that immutability/lifecycle enforcement alone requires Event as a base semantic form.

### 3. The favored candidate failed after green CI several times

The research history is load-bearing:

- physical restore attempt identity was confused with semantic record identity;
- failed writes could consume operation/idempotency markers;
- provenance multiplicity was entangled with occurrence identity;
- privacy authority was frozen into historical Type revision;
- the first PostgreSQL experiment itself failed before measuring semantics because SQL composition treated a JSON literal as a format placeholder.

All semantic flaws were corrected and retained as permanent regressions. The SQL harness bug was corrected without weakening the physical test. A single green run before those discoveries is not accepted as evidence for the final candidate.

### 4. Semantic record identity and provenance are distinct

A second source can support the same occurrence record without creating another occurrence. Provenance is attached explicitly and auditably. `create` with changed provenance is not allowed to silently throw the new source away.

### 5. Correction history preserves accepted-record history, not metaphysical truth

A correction/retraction may establish that an earlier accepted claim was wrong or that the occurrence never happened. The system preserves that the organization accepted the old record and later changed its position where retention is lawful. It must not say that the old real-world occurrence remains true merely because the record remains historically visible.

### 6. Semantic immutability is not physical append-only storage

The append-only competitor blocks legitimate payload erasure and representation migration. The candidate protects meaning while permitting explicitly authorized envelope/representation changes.

### 7. Current privacy authority is independent from historical schema meaning

Historical Type revision remains pinned for interpretation, while a current `PrivacyPolicyRevision` governs present erasure authority. Erasure proof is bound to that policy revision. This is stronger and more correct than freezing redaction permission into the old Type.

### 8. Full erasure of semantic core remains unresolved

The bounded model does not pretend that payload redaction solves a legal obligation to delete information inside protected semantic core. That remains a future explicit lifecycle/privacy operation with policy-specific residual evidence rules.

This is an unresolved boundary, but it does not uniquely favor Event as a base sort: a native Event representation would face the same legal erasure problem.

### 9. Physical superuser remains outside semantic proof

PostgreSQL 18 roles + generic trigger demonstrate enforcement for application/semantic-admin paths. The experiment protects both `StockMovement` and non-event `PublishedDefinition`, permits `MutableNote`, and permits payload/representation changes without a Type-name branch.

A database superuser could intentionally disable controls. That requires operational security, audit, restore and break-glass governance. Event as a primitive does not remove physical compromise.

### 10. Event demotion is narrower than Event elimination

#157 only attacks one main reason for Event as a base form: unique lifecycle/immutability enforcement. It does not prove that all occurrence semantics disappear. Occurrence time, causation, participation, fulfillment, provenance and domain semantics still need representation and cross-cycle validation in #71.

## Current verdict

The strongest conclusion justified by #157 is:

> A dedicated Event base form is **not currently required for no-bypass lifecycle enforcement**. A generic sealed-semantic Type contract, enforced at the same typed authority boundary used by other committed values, survives the modeled Action/admin/ingest/import/migration/repair/privacy/restore/projection/reconciliation attacks and has an independent non-event use case.

This is not enough to accept R6. Event should be revived if cross-cycle semantics require a unique Event-specific identity/interpreter/evolution protocol that cannot be expressed through Type/Relation/Computation/Action without hidden recreation.

## Promotion blockers

- one final exact-head CI after this review/index status promotion;
- #158 Relation-vs-Property/Link reduction;
- #71 cross-cycle semantic acceptance vertical;
- explicit treatment of strong legal erasure where protected semantic content itself must be removed;
- production trusted authority/storage boundary design.

`review-clean` means only that #157 is internally coherent after adversarial review and executable/physical gates. It does not mean accepted architecture, Event deletion, R6 acceptance or production readiness.