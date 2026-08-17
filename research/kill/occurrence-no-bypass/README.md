# Occurrence/Event no-bypass kill test

**Issue:** #157  
**Consumes:** #7, #9, #40, #45, #46, #57, #70, #156  
**Status:** hypothesis under attack  
**Architecture decision:** none

## Question

Can `Event` remain demoted from base-form status if every legitimate write path is modeled, including admin, ingest, migration, repair, privacy, restore and reconciliation?

RFC-0002 reopened the question as:

```text
Event = Type + tag/interface                       // rejected
Occurrence = Type + generic lifecycle enforcement // hypothesis
```

#157 attacks the second line.

## What is not under debate here

`Action != occurrence` remains a semantic distinction.

A request/decision to do something and the historical claim that something happened are not interchangeable. The question is narrower: does that distinction require a dedicated `Event` base sort, or can ordinary Types participate in a generic lifecycle/authority contract that preserves the same guarantees?

## Candidate C — generic sealed-semantic Type contract

The strongest demotion candidate is:

```text
Type StockMovement
  contract: sealed_semantics

Type JournalPosting
  contract: sealed_semantics

Type PublishedDefinition
  contract: sealed_semantics
```

`PublishedDefinition` is intentionally a non-event control. If the mechanism only protects StockMovement/JournalPosting because runtime knows they are Events, the reduction is false.

`sealed_semantics` means:

> after a value is authoritatively constructed, its committed semantic core is not replaced in place.

It does **not** mean:

- every byte is immutable forever;
- all metadata is immutable;
- privacy erasure is forbidden;
- corrections are forbidden;
- projections are append-only;
- physical storage can never be rewritten;
- every historical assertion remains legally retainable.

Instead, operations are separated by what they are allowed to change.

## Semantic core vs payload vs representation

The bounded model separates:

```text
semantic_core
payload
annotations
representation_version
```

Examples:

```text
StockMovement.semantic_core:
  sku
  quantity
  source location
  destination location

StockMovement.payload:
  operator display name
  free-text note
```

A privacy operation can erase a payload field designated redactable without changing quantity/location semantics. A representation migration can rewrite storage encoding/version while preserving the logical semantic value. A repair can amend annotation/provenance without rewriting the occurrence.

This separation is a model hypothesis. If a domain has PII that is inseparable from the semantic core and law requires full erasure, the runtime must obey the legal deletion contract; #157 does not claim that a hidden digest/tombstone may always be retained.

## Correction is not UPDATE

For a committed sealed record:

```text
wrong historical meaning
      ↓
CorrectionStatement / replacement / reversal / retraction
      ↓ relation
original record remains the record that was previously accepted
```

The current-state projection may prefer the correction or reversal. Historical explanation can still state that the original record was once accepted and later corrected, where retention law permits it.

This is especially important for source evidence:

```text
source assertion was wrong
        ≠
rewrite accepted business occurrence in place
```

If later evidence shows the occurrence never happened, the model must express that correction/retraction explicitly. It must not manufacture a new past by silent overwrite.

## Required write paths

The executable model exercises:

1. `action`
2. `admin`
3. `ingest`
4. `bulk-import`
5. `migration`
6. `repair`
7. `privacy`
8. `restore-replay`
9. projection rebuild
10. `connector-reconcile`

All authoritative mutation paths use the same generic authority boundary. Projection rebuild is deliberately not an authoritative business mutation.

No path has permission to call an Event-specific bypass.

## Competing models

### A. Native Event/Occurrence nature

Runtime knows specific occurrence types and hard-codes their immutable lifecycle.

This is a valid control, but it only earns base-form status if a generic contract cannot preserve the same behavior across all write paths.

### B. R5 RuleBinding lifecycle

A lifecycle rule is attached/scheduled through RuleBinding.

R5 can express the job, but #156 weakened the case that RuleBinding itself is irreducible. #157 therefore evaluates the stronger R6-compatible candidate too.

### C. Generic sealed-semantic Type values — current candidate

The store protects the semantic core based on a generic Type contract. The same contract can protect non-event committed values. Privileged operations use typed authority; correction/redaction/migration have distinct semantics.

This is a real reduction only if runtime never needs an `if Event`/`if Occurrence` branch.

### D. Append-only authority store below ontology

Physical storage never updates authority records and ontology projects occurrence semantics above it.

This can provide strong history but is not automatically superior. It risks confusing storage immutability with semantic/legal retention, and privacy/schema migration can require physical change. The issue tests semantic guarantees, not one append-only implementation.

## Mutants

The executable suite includes deliberately unsafe controls:

- `UnsafeAdminStore.raw_admin_replace()` rewrites committed semantics directly;
- `UnsafeReplayStore.replay_overwrite()` lets source replay rewrite accepted meaning;
- `NativeOccurrenceStore` protects only hard-coded occurrence type names and therefore demonstrates why Event-specific enforcement is a different model from generic Type-contract enforcement.

A trustworthy gate must reproduce the bugs those mutants permit.

## Privacy rule

Privacy is not modeled as `DELETE history never` or `redact everything`.

The bounded rule is:

```text
privacy authority
  may remove fields explicitly classified as erasable payload
  may not smuggle a business-semantic rewrite through the payload API
```

Whether a digest, tombstone, audit envelope or nothing may remain is policy/law-specific. The model exposes `retain_digest` only as a testable option, not a universal requirement.

## Migration rule

Two different operations must not collapse:

```text
representation migration:
  old bytes/schema representation -> new representation
  logical semantic value unchanged

semantic reinterpretation/correction:
  old accepted meaning -> new claim/definition/correction
  explicit historical relation required
```

Existing records pin the Type revision under which they were created; changing the current Type revision does not silently reinterpret history.

## Restore/replay rule

Disaster recovery or source replay must preserve stable semantic identity and operation identity where known. Replaying the same semantic operation may reconstruct lost physical state without creating a second business occurrence.

If restored/source data conflicts with an already accepted record under the same identity, the result is a conflict/reconciliation problem—not permission to overwrite the record.

## Success criterion

Event remains demoted only if all are true:

- sealed semantic values are generic Type semantics, not Event-specific code;
- all authoritative write paths cross the same authority boundary;
- no admin/import/migration/privacy/repair path can rewrite protected semantic core in place;
- correction/reversal/retraction are explicit new records/relations where required;
- privacy can remove designated payload without pretending business meaning changed;
- representation migration does not reinterpret historical meaning;
- restore/replay/projection rebuild preserve occurrence identity rather than generate new occurrences accidentally;
- the same mechanism has a real non-event use case.

If these require an Event-specific interpreter or unique lifecycle species not expressible by generic Type contracts, Event should be reconsidered as a base form.

## Epistemic boundary

Passing #157 does not make Event “deleted from the architecture.” It only removes one reason for a base sort: lifecycle enforcement.

#158 and #71 remain required before the four-form R6 candidate can supersede R5/RFC-0002.
