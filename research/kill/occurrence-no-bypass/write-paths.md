# Write-path taxonomy — issue #157

**Decision:** none.

The purpose of this table is to prevent privileged tooling from becoming an undocumented exception to historical semantics.

| Path | Legitimate job | May create semantic record? | May replace sealed semantic core? | Legitimate alternative |
|---|---|---:|---:|---|
| business Action | commit a governed business decision/occurrence | yes | no | new occurrence/correction/reversal |
| admin | governed operational administration | yes when explicitly authorized | no | typed admin operation + correction/annotation |
| ingest / CDC | admit external observation/occurrence | yes | no | duplicate no-op, new evidence, conflict/reconciliation |
| bulk import/backfill | admit historical external data | yes | no | provenance-preserving create/correction |
| schema/ontology migration | change representation/definition revision | not by itself | no | representation migration or explicit reinterpretation record |
| repair | fix metadata/provenance or correct accepted meaning | yes for correction | no | annotation or correction/supersession |
| privacy | erase/redact legally erasable data | no new occurrence required | no | redact designated payload / policy-specific erasure |
| disaster restore/replay | reconstruct physical state | reconstruct existing identity | no | replay stable operation IDs + reconcile conflicts |
| projection rebuild | recompute derived state | no | no | replace derived projection only |
| connector reconciliation | compare/resolve external state | may append evidence/correction | no | observation, correction, reconciliation outcome |

## Four mutation classes

### 1. Semantic construction

A new accepted semantic value is constructed with stable identity, Type revision and provenance.

Examples:

- local business occurrence after Action commit;
- externally observed occurrence admitted from source evidence;
- correction/reversal/retraction statement.

### 2. Semantic correction by addition

The original accepted value is not replaced. A new value states that it corrects, supersedes, reverses or retracts a prior statement/occurrence.

This preserves historical explainability where retention policy permits it.

### 3. Envelope/payload maintenance

Metadata or legally erasable payload may change without changing the protected semantic core.

Examples:

- provenance annotation;
- diagnostic metadata;
- erasing a display name from payload;
- retaining or not retaining a digest according to policy.

This class must not become a way to smuggle semantic fields into the “metadata” bucket.

### 4. Physical representation change

Storage encoding/schema/representation version may change while the logical protected value remains equal.

If logical meaning changes, it is no longer representation migration and must use an explicit semantic migration/correction path.

## Authority graph

The candidate authority graph is intentionally generic:

```text
caller / agent / connector / admin tool
            ↓
trusted runtime identity + typed operation
            ↓
authority proof over exact operation context
            ↓
SemanticStore authoritative operation
            ↓
Type contract checked (sealed_semantics where applicable)
```

There is no lower `raw update committed occurrence` path in the candidate.

A storage administrator can physically alter a database in reality. That is not treated as a legitimate semantic API; production hardening must use DB permissions, append/audit mechanisms, separation of duties and restore/reconciliation controls so privileged physical access cannot silently masquerade as a valid business mutation.

## Source replay distinction

Three cases must not collapse:

```text
same semantic operation + same record/meaning
    -> replay/no new occurrence

new source message + same accepted occurrence
    -> additional observation/evidence, not duplicate occurrence

same identity + conflicting meaning
    -> disagreement/reconciliation/correction, not overwrite
```

## Privacy distinction

#157 deliberately refuses both extremes:

```text
"history is immutable, therefore PII can never be erased"   // rejected
"privacy operation may rewrite anything"                    // rejected
```

The actual contract is field/payload and jurisdiction/policy specific. If law requires deleting information that the current model classifies inside semantic core, the model must support a stronger erasure operation and record only whatever residual evidence is legally permitted. That is not evidence by itself for an Event base form; it is evidence that lifecycle contracts need explicit erasure semantics.
