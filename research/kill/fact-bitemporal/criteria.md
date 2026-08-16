# Placement criteria

**Kind:** candidate law, with domain evidence and runtime consequence  
**Decision state:** `supported` for the four-way split. Each placement rule below carries its own state.  
**Issue:** https://github.com/EnzoTironi/OS/issues/59

A synthesis agent should apply these tests before promoting Fact or dual time into the kernel. Constitution §1 is the bar. A primitive earns its place only if composition cannot enforce the same meaning safely, independent systems converge, removal causes repeated real failures, or a critical property needs a hidden convention.

The four placements are exclusive for a given type or property.

## Native

Use native enforcement when a write or read would be silently wrong if the engine treated the concern as an ordinary property.

Tests.

1. The stamp or invariant is not user-owned. SQL:2011 system-time columns are `GENERATED ALWAYS`. Users must not assign them. EPCIS Record Time is filled by the repository, not the capturer. **Decision state:** `supported`
2. A published ledger row must stay visible after correction. ValueFlows forbids in-place change of recorded activity that may already have hit a report. ERPNext keeps original plus reversal rows. **Decision state:** `supported` for ledger-class types
3. A query that names only one clock answers the wrong question. `as-of` in Datomic is transaction time. Calling that `valid then` hides late corrections. **Decision state:** `supported` for query defaults

**Runtime consequence.** The write boundary assigns knowledge or system time. Ledger-class types reject in-place valid-time rewrite. Query names which question it asks.

**Not native.** A `Fact` type. A four-timestamp rectangle on every property. A period type in the language. Kulkarni and Michels record that SQL:2011 refused a period type because the surrounding ecosystem could not absorb it.

## Optional

Use an opt-in capability when some types need the extra axis or the extra history, and most types do not.

Tests.

1. Independent products already ship the feature as a table or type switch. SQL:2011 allows at most one application-time period and one system-time period per table, and neither is required. SQL Server ships system versioning only. Palantir edit history is a later toggle. **Decision state:** `supported`
2. Operators sometimes ask the extra question, and the cost is paid only by those types. XTDB says most applications look like ordinary `INSERT`, `UPDATE`, `SELECT`, and `DELETE`, with current-time indexes built for that majority. **Decision state:** `supported` as product evidence, not as an OS storage choice
3. The type can name a validity interval or an occurrence instant without forcing the other. ERPNext Item Price has Valid From and Valid Upto. EPCIS `eventTime` is mandatory. `recordTime` is optional in the 2.0 XSD and SHACL. **Decision state:** `supported`

**Runtime consequence.** A type or property declares history, valid time, occurrence time, or both. The default object or document does not inherit four hidden columns.

## Compositional

Encode the meaning with ordinary types, properties, events, constraints, and provenance when those already carry the distinction.

Tests.

1. Halpin's CSDP treats elementary facts as a conceptual analysis step, then maps them into grouped relational tables. Grouping is an implementation concern, not a second semantic world. **Decision state:** `supported` as a modeling method, `rejected` as a claim that the runtime must store those atoms
2. ValueFlows already types Intent, Commitment, and EconomicEvent. A generic Fact that holds "the delivery date" collapses S-001. **Decision state:** `supported` as a layering rule
3. Current quantity can be a function of events. ValueFlows `accountingQuantity` is derived from economic events. Fowler stores snapshots because replay is slow, and still treats the snapshot as cache. **Decision state:** `hypothesis` for OS, `supported` in those sources
4. Valid-from and valid-upto can be ordinary dated properties plus a `WITHOUT OVERLAPS` constraint when exclusivity is required. SQL:2011 makes that constraint optional. **Decision state:** `supported`

**Runtime consequence.** Experimental code may persist assertion-like rows to test interchange. That code is not a semantic decision. Wave B waits.

## Rejected

Refuse the placement when it harms identity, invariants, write shape, or cost, or when it answers a question nobody asks.

Tests.

1. The write unit people actually submit is a document, action, or object, not a bag of independent facts. Palantir Actions edit objects. ERPNext submits a voucher and reverses the voucher. Young calls event sourcing everywhere the largest failure he has seen. **Decision state:** `supported` against Fact as the write unit
2. Decomposing a balanced journal, an order, or an exclusive employment into independently writable facts lets illegal states exist until a later sweep. **Decision state:** `supported` for those types. See [`fact-decomposition-harm.md`](fact-decomposition-harm.md)
3. `FOR PORTION OF VALID_TIME` on a posted journal or stock ledger row hides the original published effect. That is the opposite of ValueFlows `corrects` and ERPNext reversal. **Decision state:** `supported` as harmful for ledger-class types
4. Dual time on display names, sort keys, colors, password hashes, and high-churn sensor points adds storage and join cost with no business question. Datomic `:db/noHistory` exists for this class. SQL Server warns that large blob columns in temporal tables incur significant storage cost. **Decision state:** `supported`
5. A unitemporal system-time table cannot represent "moved next week, recorded today." SQL Server users cannot insert a non-now valid time without turning `SYSTEM_VERSIONING` off. That hatch is a source-system artifact, not a domain law. **Decision state:** `supported` as a limit of system-time-only products

**Runtime consequence.** The metamodel must not default every `ObjectType` to Fact storage or to four temporal columns.

## Decision procedure

Walk a type or property in this order.

1. Is the write a published ledger effect? If yes, native append-only correction. Reject portion update. Dual time is optional on the row only if operators must answer `known then`.
2. Is the value an occurrence instant? If yes, compositional timestamp on an Event. Record time is optional and runtime-owned if present.
3. Is the value an exclusive assignment over an interval? If yes, compositional validity interval plus a declared cardinality constraint. System time is optional.
4. Do operators ever ask both `valid then` and `known then` for this property? If yes, optional bitemporal capability on that property. If no, reject the second axis.
5. Is the write an identity-bearing aggregate with a spanning invariant? If yes, reject independent Fact writes. Keep the Action or document as the commit unit.
6. Otherwise treat current state as a snapshot or projection. History is optional.

Q2 still asks whether a Fact type belongs in the kernel at all. This procedure can run with Fact as an interchange encoding and without Fact as a primitive. That is why Q2 stays `undetermined`.
