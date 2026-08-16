# Candidate laws

**Kind:** candidate law, with domain evidence, counterexample, runtime consequence, decision state  
**Issue:** https://github.com/EnzoTironi/OS/issues/59  
**Rule:** a law is the smallest claim that explains more than one source. A law that only restates one vendor feature is a source-system artifact and is not listed.

None of these is `accepted`. RFC-0001 is not edited.

## K1. Fact is not the fundamental write unit

**Claim.** Independent mature systems do not converge on Fact as the thing authors commit. They commit objects, documents, actions, events, or datoms, then reconstruct current state.

**Decision state:** `rejected` as a universal kernel claim. The weaker interchange claim stays `hypothesis`.

**Domain evidence.** Palantir Actions on objects. ERPNext submitted vouchers. ValueFlows EconomicEvents. Halpin maps elementary facts into tables. Young rejects event sourcing everywhere.

**Counterexample that would restore Fact as fundamental.** Six independent operational systems whose write API is an elementary fact and whose identity, invariants, and UX stay simpler than document or object writes. Not found.

**Runtime consequence.** Do not make Fact the default persistence of `ObjectType`.

## K2. Elementary-fact analysis is not a storage default

**Claim.** ORM-style fact decomposition is a conceptual quality check. Implementation groups facts. Objectification exists because some relationships need identity.

**Decision state:** `supported`

**Domain evidence.** Halpin CSDP step 1 versus the relational mapping algorithm. Objectified Teaching and DegreeAcquisition.

**Counterexample.** A production engine that stores only elementary facts, never groups them, and still matches ERP write latency and invariant enforcement. Not found.

**Runtime consequence.** Research may use fact verbalization in notes. The runtime is not required to store those atoms.

## K3. Identity-bearing aggregates are not bags of independently writable facts

**Claim.** Journals, orders, lots, and exclusive seats have spanning identity. Independent Fact writes against their parts create illegal states.

**Decision state:** `supported` for those types

**Domain evidence.** ERPNext voucher-level reverse. SQL:2011 period in the key. Datomic `since` losing identity lookup. S-002, S-008.

**Counterexample.** See [`fact-decomposition-harm.md`](fact-decomposition-harm.md).

**Runtime consequence.** The Action or document is the commit unit.

## K4. Ledger-class records correct by a later record

**Claim.** A record that may already have been published is not rewritten in place. The correction points at the earlier record.

**Decision state:** `supported` for ledger-class types. `undetermined` as a law for every Fact.

**Domain evidence.** ValueFlows `corrects`. ERPNext original plus reversal. EPCIS `errorDeclaration`. Odoo credit notes and lock dates.

**Counterexample.** A required query that cannot be answered from the append-only chain without mutating the original published row. Valuation repost rewrites later derived layers under control. That is projection refresh, not original-row mutation.

**Runtime consequence.** Ledger-class types reject `FOR PORTION OF VALID_TIME` style overwrite.

## K5. Two time questions exist

**Claim.** `valid then` and `known then` are different questions.

**Decision state:** `supported`

**Domain evidence.** SQL:2011. XTDB. EPCIS. ValueFlows. ERPNext posting versus creation. Kulkarni insurance insert. S-007.

**Counterexample.** A real enterprise domain with published reports, late data, and later corrections that never needs the split. Not found.

**Runtime consequence.** Query must name which question it asks. A single `as-of` is not enough.

## K6. Ubiquitous bitemporal rows are not a domain law

**Claim.** Not every stored property or type must carry both axes.

**Decision state:** `rejected` as a metamodel default. `optional` as a type capability.

**Domain evidence.** SQL:2011 opt-in per table. SQL Server system-time only. Datomic transaction-time only. XTDB's own "90 percent looks atemporal." Pricing Valid From and Valid Upto. Display names. Sensor points.

**Counterexample.** See [`bitemporal-scope.md`](bitemporal-scope.md) last section.

**Runtime consequence.** History and dual time are declared. They are not implied by `ObjectType`.

## K7. Knowledge time is runtime-owned

**Claim.** The record or system stamp is assigned by the engine. Clients may not forge it. Import of a past system time is a migration hatch.

**Decision state:** `supported`

**Domain evidence.** SQL:2011 `GENERATED ALWAYS AS ROW START` and `ROW END`. EPCIS Record Time filled by the repository. Datomic `:db/txInstant`. XTDB users have no control over system time except documented import.

**Counterexample.** A domain where the capturer legally owns record time and the repository must accept it as system time. Not found. Event Time is the user-owned stamp.

**Runtime consequence.** Write boundary assigns knowledge time.

## K8. Valid or occurrence time is user-owned and optional

**Claim.** World time may sit in the past or the future. Types that do not have a world-time question omit it.

**Decision state:** `supported`

**Domain evidence.** SQL:2011 application time. XTDB `FOR VALID_TIME FROM`. ERPNext posting date. Item Price validity. EPCIS `eventTime` mandatory, `recordTime` optional.

**Counterexample.** A type that has no world-time question and still cannot be modeled without a valid-time interval. Not found.

**Runtime consequence.** The Action parses world time when the type declares it.

## K9. Temporal natures are not one rectangle

**Claim.** Occurrence instants, validity intervals, posting dates, and knowledge stamps are different. An event timestamp is not a validity period.

**Decision state:** `hypothesis` as a closed list. `supported` as a "do not collapse" rule

**Domain evidence.** EPCIS instants. SQL:2011 periods. PROV start and end. ValueFlows event date versus created. S-001 four dates.

**Counterexample.** A domain that treats every timestamp as a closed-open interval with equal ends and never loses a question. Unlikely, not disproven.

**Runtime consequence.** Type construction distinguishes point and interval. See issue 5.

## K10. Temporal cardinality is earned

**Claim.** `WITHOUT OVERLAPS` is a constraint on a relationship or property, not a kernel default.

**Decision state:** `supported`

**Domain evidence.** SQL:2011 optional syntax. Exclusive job versus dual contracts. ERPNext overlapping Item Prices resolved by latest Valid From, which is a tie-break, not uniqueness.

**Counterexample.** A domain where every dated relationship is exclusive. Employment dual contracts kill that.

**Runtime consequence.** Constraint engine evaluates declared temporal cardinality at commit.

## K11. Schema time is not fact time

**Claim.** Time travel on instance data does not restore old type, function, or policy meaning.

**Decision state:** `supported` as a Datomic-shaped fact. `hypothesis` for OS representation. Issue 9 owns the pin.

**Domain evidence.** Datomic schema-change page. S-012.

**Counterexample.** A store that reconstructs past meaning from instance timestamps alone after a non-invertible definition change. Datomic says the infrastructure to support the past schema may no longer exist.

**Runtime consequence.** Actions that must be explained later pin definition revisions.

## K12. Period locks are authority, not a clock

**Claim.** Closed-period rules forbid or reroute valid-time writes. They are not a third temporal axis.

**Decision state:** `supported`

**Domain evidence.** Odoo Lock Everything and Hard Lock. ERPNext freeze and Accounting Period. Odoo moving a late posting to the day after the lock.

**Counterexample.** A localization where rewriting a locked valid-time row is legal and still auditable. Not found in these manuals.

**Runtime consequence.** Policy on the Action, not a missing index.

## K13. Current state must not pay full history

**Claim.** Operational now-reads are a first-class path. Full historical reconstruction is opt-in cost.

**Decision state:** `supported` as pressure. `undetermined` as storage design.

**Domain evidence.** Fowler snapshots. Azure event-stream snapshots. XTDB current-time indexes. Datomic "the present pays no penalty." ERPNext repost cost.

**Counterexample.** See [`fact-decomposition-harm.md`](fact-decomposition-harm.md) performance section.

**Runtime consequence.** Wave B may materialize current projections. That is not a semantic promotion of snapshots to truth.

## K14. Absence of selected history makes some explanations impossible

**Claim.** The cases in [`absence-impossible.md`](absence-impossible.md) cannot be answered from a single-clock mutable snapshot.

**Decision state:** `supported`

**Domain evidence.** S-007, S-001, S-006, S-012, ValueFlows reports, EPCIS ILMD, Kulkarni future valid time.

**Counterexample.** An inventory or accounting deployment that overwrites in place and still answers `known then` and `valid then` for late corrections. That would reject K14 and K4 together.

**Runtime consequence.** Named domains in the map keep the stamps and correction rules they earned. Other domains do not inherit them.
