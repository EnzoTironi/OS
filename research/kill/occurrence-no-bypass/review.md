# Adversarial review — issue #157 occurrence no-bypass

**Status:** review-clean  
**Architecture decision:** none  
**Candidate:** Event remains demotable for lifecycle enforcement; R6 remains `hypothesis`, not accepted.  
**Evidence status:** all greens before the mutable-guard finding are obsolete evidence for the final candidate. The final exact head must pass fresh semantic + PostgreSQL 18 gates after H6 hardening.

## Review question

Does the current `Type + generic sealed-semantic lifecycle + typed authority` candidate really preserve occurrence history across every modeled write path, or has Event/append-only semantics merely moved into a hidden implementation branch or mutable guard flag?

## Findings

### 1. Tag-only Event remains dead

An advisory Event tag/interface without inescapable authority enforcement is insufficient. The candidate is materially stronger: committed semantic replacement is blocked by a generic Type contract at the authority boundary.

### 2. The generic lifecycle job is independently reusable

`PublishedDefinition` is a deliberately non-event sealed value. The same candidate and physical control protect it and `StockMovement` without a Type-name branch. This weakens the claim that lifecycle enforcement alone requires Event as a base semantic form.

### 3. The favored candidate failed after green CI repeatedly

The hardening history is load-bearing:

- physical restore attempt identity was confused with semantic record identity;
- failed writes could consume operation/idempotency markers;
- provenance multiplicity was entangled with occurrence identity;
- privacy authority was frozen into historical Type revision;
- the first PostgreSQL experiment had a SQL-composition harness defect before measuring semantics;
- **most importantly, later adversarial review found a mutable guard metadata bypass after green CI**: `sealed_semantics` lived on the business row and a privileged admin could disable the flag before rewriting the protected core; the Python model similarly allowed redefining the same Type revision with weaker contracts.

The last flaw invalidates the old physical green as proof of no-bypass. A protection bit that the protected writer can turn off is not lifecycle enforcement.

### 4. Contract membership and historical Type meaning are now protected

The hardened candidate treats a published Type revision as immutable historical semantic definition. A record is pinned to `(type_name, type_revision)` and cannot silently rebind to a weaker revision.

A migration may publish a new revision for future values. It may not rewrite the meaning/contracts of an old revision, retype an accepted record, or use a weaker new revision as a bridge to rewrite historical semantic core.

This is generic Type-system behavior, not an Event-specific branch. The same rule protects non-event `PublishedDefinition`.

### 5. Semantic record identity and provenance are distinct

A second source can support the same occurrence record without creating another occurrence. Provenance is attached explicitly and auditably. `create` with changed provenance is not allowed to silently throw the new source away.

### 6. Correction history preserves accepted-record history, not metaphysical truth

A correction/retraction may establish that an earlier accepted claim was wrong or that the occurrence never happened. The system preserves that the organization accepted the old record and later changed its position where retention is lawful. It must not say that the old real-world occurrence remains true merely because the record remains historically visible.

### 7. Semantic immutability is not physical append-only storage

The append-only competitor blocks legitimate payload erasure and representation migration. The candidate protects meaning while permitting explicitly authorized envelope/representation changes.

### 8. Current privacy authority is independent from historical schema meaning

Historical Type revision remains pinned for interpretation, while a current `PrivacyPolicyRevision` governs present erasure authority. Erasure proof is bound to that policy revision. This is stronger and more correct than freezing redaction permission into the old Type.

### 9. Full erasure of semantic core remains unresolved

The bounded model does not pretend that payload redaction solves a legal obligation to delete information inside protected semantic core. That remains a future explicit lifecycle/privacy operation with policy-specific residual evidence rules.

This is unresolved, but it does not uniquely favor Event as a base sort: a native Event representation would face the same legal erasure problem.

### 10. Physical superuser remains outside semantic proof

The hardened PostgreSQL 18 experiment separates contract-bearing `type_revision` records from business rows:

- published Type revisions reject UPDATE/DELETE even through the migration role;
- semantic admin can address record columns but cannot replace sealed core;
- semantic admin cannot change a record's Type/revision binding;
- a newly published weaker `stock-v2` cannot be used to downgrade historical `stock-v1`;
- the same generic mechanism protects `StockMovement` and non-event `PublishedDefinition`;
- genuinely unsealed `MutableNote` remains editable;
- payload/representation changes remain possible.

A database/schema owner could still intentionally disable controls. That requires operational security, audit, restore and break-glass governance. Event as a primitive does not remove physical compromise.

### 11. Event demotion is narrower than Event elimination

#157 attacks one main reason for Event as a base form: unique lifecycle/immutability enforcement. It does not prove that all occurrence semantics disappear. Occurrence time, causation, participation, fulfillment, provenance and domain semantics still need representation and cross-cycle validation in #71.

## Current verdict

The strongest conclusion justified by #157 is:

> A dedicated Event base form is **not currently required for no-bypass lifecycle enforcement** if the generic Type contract itself is non-bypass: published contract-bearing Type revisions are immutable, accepted records remain pinned to those revisions, and all authoritative mutation paths enforce the same generic contract.

The earlier weaker candidate with a mutable per-row seal flag is explicitly rejected.

This is not enough to accept R6. Event should be revived if cross-cycle semantics require a unique Event-specific identity/interpreter/evolution protocol that cannot be expressed through Type/Relation/Computation/Action without hidden recreation.

## Promotion blockers

- one fresh exact-head CI after H6 contract/binding hardening;
- #158 Relation-vs-Property/Link reduction;
- #71 cross-cycle semantic acceptance vertical;
- explicit treatment of strong legal erasure where protected semantic content itself must be removed;
- production trusted authority/storage boundary design.

`review-clean` means only that the **bounded research model and its adversarial findings are internally coherent once the final gates pass**. It does not mean accepted architecture, Event deletion, R6 acceptance or production readiness.
