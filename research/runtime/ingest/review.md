# Adversarial review — issue #45 ingest/entity resolution

**Date:** 2026-08-16  
**Disposition:** `review-clean` as research pressure, not accepted architecture.

This review attacked the draft after the source study and contract were written. It found and corrected three material over-generalizations before merge.

## R-I45-01 — identity must not become consumer-relative

**Draft failure:** the first contract allowed a fuzzy match to become an exact binding for low-risk analytics while being disallowed for payment.

**Why wrong:** consumer risk can change whether a relation is sufficient for an Action; it cannot change the semantic meaning of exact identity.

**Correction:** separate:

```text
relation semantics
assurance/evidence
Action/consumer admissibility
```

Analytics may use `probableSameProductFamily`; payment may require `sameExactEntity` with stronger assurance. The relation keeps one meaning.

**Artifacts corrected:** README, ingest contract, candidate laws, adversarial cases, open questions, CI guard.

## R-I45-02 — provenance preservation is not universal forever-retention

**Draft pressure:** wording around preserving unresolved/source evidence could be read as append-only retention of every raw byte.

**Why wrong:** privacy, legal disposition, security, storage and jurisdictional retention rules can require deletion/redaction/crypto-erasure. Historical explainability and raw-data retention are different requirements.

**Correction:** evidence remains inspectable **while retained**; disposition/retention is a governed lifecycle. The contract requires that mapping failure not be disguised as semantic success, not that every raw artifact be immortal.

## R-I45-03 — operational qualification is not canonical truth

**Draft failure:** `admit/admitted statement` could be interpreted as a generic truth-election layer.

**Why wrong:** Wave A showed many apparent truth conflicts dissolve through better modeling, and surviving authority often answers `may this evidence drive this operation?` rather than `which value is metaphysically true?`.

**Correction:** define **qualification for scoped operational use**:

```text
statement S may drive projection/query/Action X under authority rule R
```

without implying rival assertions are false or deleted. Qualification can be deterministic from a source contract or governed when ambiguity/risk requires it. No `CanonicalFact` primitive is introduced.

## Primary-source factual recheck

The most time-sensitive/source-specific claims were rechecked against official sources on 2026-08-16:

- Palantir Object Storage v2 MDOs: column-wise supported, row-wise unavailable, property multiplicity unsupported; source-backed property permissions and edit conflict strategies are explicit in current docs.
- Splink: pairwise predictions can be clustered by connected components at a configurable match probability/weight threshold.
- OpenRefine reconciliation: the service returns ranked candidate entities and supports review/correction rather than requiring immediate one-match truth.
- Debezium PostgreSQL: snapshot `r` and source `c/u/d` operations carry source/transaction/order/timestamp metadata; a consistent initial snapshot transitions to streaming at the captured log position.
- Debezium MySQL: schema history is used to recover the table structure in effect when older log events were recorded.
- W3C PROV remains a provenance vocabulary, not an authority-election mechanism.

Exact URLs/locators are preserved in `source-study.md`.

## Surviving model after review

The strongest current hypothesis is still compositional:

```text
source evidence
  -> semantic statement proposals
  -> candidate typed relations + assurance
  -> exact binding only when justified
  -> scoped qualification under authority rules
  -> operational projection/query/Action
```

This does **not** establish `Observation`, `Binding`, `Qualification`, or `Fact` as engine primitives. It establishes competency requirements that #46/#70 must try to satisfy with smaller forms.

## Remaining unresolved questions

- Whether exact binding should be an ordinary typed link, relationship-object/relator, or a native semantic form.
- Whether statement qualification needs durable identity or can often be derived from source/authority policy at query/Action time.
- How #40 represents stale binding/qualification proposals at commit.
- How #42 expresses assurance requirements without embedding entity-resolution logic inside authorization policy.
- How #39 persists unresolved evidence and binding history without universal bitemporal/fact-oriented storage.

Those are bounded unknowns, not blockers to preserving #45 as Wave B research.
