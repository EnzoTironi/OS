# Candidate laws. Temporal semantics

**Issue:** https://github.com/EnzoTironi/OS/issues/5  
**Open question:** Q7 remains open.  
**Retrieved:** 2026-08-15

Each law is the smallest claim that still fits the cards in `sources.md`. Decision states are `hypothesis`, `supported`, `rejected`, or `undetermined`. None of these is `accepted`.

## L1 Two questions

**Claim.** `valid then` and `known then` are different questions. A system that can answer only one cannot explain a late correction.

**Decision state:** `supported`

**Domain evidence.** XTDB S-XTDB-01. SQL:2011 S-SQL-01. EPCIS S-EPCIS-01. ValueFlows S-VF-01. ERPNext S-ERN-02. Kulkarni insurance insert-before-effective.

**Counterexample that would reject it.** A real enterprise domain where published reports, late data, and later corrections never need to be separated, and operators never ask what the system believed at the time.

**Runtime consequence.** Query must name which question it asks. A single `as-of` parameter is not enough.

**Not claimed.** Every stored property carries both axes. That is L2.

## L2 Universal bitemporal rows are not a domain law

**Claim.** Not every stored property must carry both axes. Ubiquitous four-timestamp rows are a storage thesis.

**Decision state:** `supported`

**Domain evidence.** Datomic has no valid-time axis and still answers knowledge-then. Palantir current objects plus optional edit history plus optional time series. SQL:2011 makes each period opt-in per table. ERPNext Item Price stores only a validity interval.

**Source artifact to refuse.** XTDB "every table is bitemporal" as an OS primitive.

**Counterexample that would reject it.** A domain where omitting either axis on an ordinary note, draft, cache, or sensor point causes repeated operational failure.

**Runtime consequence.** Types or properties declare the clocks they need. ObjectType does not imply a bitemporal rectangle.

**Q7.** L1 plus L2 is why Q7 stays `undetermined` rather than yes or no.

## L3 Knowledge time is runtime-owned

**Claim.** The knowledge or system stamp on a committed record is assigned by the runtime. Clients do not mutate it.

**Decision state:** `supported`

**Domain evidence.** XTDB users have no control over system time. SQL:2011 `GENERATED ALWAYS` and no `FOR PORTION OF SYSTEM_TIME`. EPCIS Record Time is filled by the repository. Datomic reifies the transaction.

**Allowed hatch.** Import of a legacy system-time start, documented by XTDB and Datomic, is a migration boundary, not an end-user Action.

**Counterexample that would reject it.** A lawful user Action that must rewrite the knowledge stamp of an already committed record without it being an import.

**Runtime consequence.** Write boundary assigns the stamp. Brand it. Do not take it from the payload except at a named import Action.

## L4 Valid time is a domain value

**Claim.** Valid time or occurrence time is a domain value. It may precede or follow knowledge time. The write boundary parses it. The Action decides whether the caller may set it.

**Decision state:** `supported`

**Domain evidence.** SQL:2011 user-assigned application time in past or future. XTDB `FOR VALID_TIME FROM`. ERPNext posting date. ValueFlows late-recorded events. Odoo signed date versus contract start.

**Counterexample that would reject it.** A domain where the only meaningful time is commit time and backdating is always fraud.

**Runtime consequence.** Parse into a branded interval or instant. Do not store two raw timestamps that can be unordered. Type-system discipline. A valid range is a start plus a duration, or a closed-open pair that cannot be built backwards.

## L5 Point versus interval

**Claim.** Occurrence instants and validity intervals are different natures. An event timestamp is not a validity period.

**Decision state:** `hypothesis`

**Domain evidence.** EPCIS Event Time is an instant with timezone. PROV activities have start and end instants. PROV entities have generation and invalidation instants. SQL:2011 and ERPNext prices use intervals. XTDB S-XTDB-03 warns that row valid time is not every domain clock.

**Why not `supported`.** UFO and issue 3 may still collapse some of these into one temporal quality. This pass did not read OntoUML primary texts.

**Counterexample that would reject it.** A modeling where every occurrence is equivalently an interval of zero length, with no loss in constraints or queries.

**Runtime consequence.** Do not give every Event a `_valid_from` and `_valid_to`. Do not give every Relator a single `occurredAt`.

## L6 Ledger-class correction is append-only

**Claim.** A record that has entered a published ledger is corrected by a later record, not by rewriting the original valid-time portion.

**Decision state:** `supported` for ledger-class facts. `undetermined` as a law on every Fact.

**Domain evidence.** ERPNext S-ERN-01. ValueFlows S-VF-01. Odoo credit notes and lock dates. EPCIS error declaration.

**Competing pattern.** SQL:2011 and XTDB `FOR PORTION OF VALID_TIME` split the current system row. That is the right tool for an exclusive employment assignment that was mistyped. It is the wrong tool for a posted journal that already hit a tax return.

**Counterexample that would reject the ledger half.** A jurisdiction that requires in-place amendment of the original journal row and forbids reversals.

**Runtime consequence.** Ledger-class is a type invariant. The generic engine should not offer portion-update as the only correction verb.

## L7 Temporal cardinality is earned

**Claim.** Temporal uniqueness and temporal containment are constraints on a relationship or property. They are not a kernel default.

**Decision state:** `supported`

**Domain evidence.** SQL:2011 `WITHOUT OVERLAPS` is an explicit primary key option. The paper says a user might want two departments at once. ERPNext overlapping prices resolve by latest Valid From. Dual employment contracts can be concurrent. Exclusive warehouse bin occupancy cannot.

**Counterexample that would reject it.** A kernel that cannot express overlapping and exclusive intervals as two constraint shapes, and still models both domains.

**Runtime consequence.** Constraint engine evaluates interval overlap and period-containment foreign keys. The default is not exclusive.

## L8 Ontology pin is a third axis

**Claim.** Ontology, function, and policy revision is a third pin. Time travel on facts does not restore old meaning.

**Decision state:** `supported` as an observed Datomic fact. `hypothesis` as an OS law.

**Domain evidence.** Datomic S-DAT-02. Cardinality change makes historical entity reads return one of many values. Schema is the current basis.

**Project context, not evidence.** Q19 asks whether historical Actions pin ontology revisions. RFC-0001 asks the same. This law is the reason those questions exist.

**Counterexample that would reject it.** A store whose `as-of` restores the exact schema, functions, and policies in force at t, with no residual current-basis interpretation.

**Runtime consequence.** Replay names a revision. If the pin is missing, the read must say it is under current meaning.

## L9 Period locks are authority

**Claim.** A period lock is authority over valid-time writes. It is not a third clock and not a substitute for knowledge time.

**Decision state:** `supported`

**Domain evidence.** ERPNext freeze and Accounting Period. Odoo Lock Everything, exceptions, Hard Lock. ValueFlows published-report argument.

**Counterexample that would reject it.** A lock implemented only as "hide old rows" that still accepts writes into the locked valid-time range.

**Runtime consequence.** Policy on the Action. Who may backdate. Who may open an exception. Hard locks may be irreversible by design.

## L10 Named default read

**Claim.** The default read is valid-now and known-best. Historical reads name which question they ask.

**Decision state:** `hypothesis`

**Domain evidence.** XTDB says the vast majority of queries use those defaults. Datomic present-tense `db` pays no history penalty. Palantir default is the current object.

**Why not `supported`.** OS has no query surface yet. The default is a usability claim, not a domain law.

**Runtime consequence.** Query API with explicit parameters. No silent `as-of` that could mean either question.

## Rejected claims

### R1 Transaction history is enough

**Claim.** Datomic-style `as-of` answers all historical enterprise questions.

**Decision state:** `rejected`

**Why.** Future-dated assignments, posting date versus creation, Event Time versus Record Time, and published-report corrections all need a world clock that is not commit time.

### R2 Every Fact is a bitemporal rectangle

**Claim.** The metamodel should put valid time and system time on every Fact.

**Decision state:** `rejected` as a universal. `undetermined` as an optional representation for some Facts.

**Why.** L2. Palantir, Datomic, price lists, and time series show types that need one clock, or none. Issue 59 exists to keep attacking the remainder.

### R3 One timestamp field named `date`

**Claim.** A single date on the object is enough if reports can filter it.

**Decision state:** `rejected`

**Why.** Open questions Q3 already names requested, promised, planned, and actual as collapsed fields. S-XTDB-03, S-ERN-02, S-ODO-02, and S-EPCIS-01 are the same collapse in four products.

## Where bitemporality sits

This is a working map, not a decision.

| Use | Verdict | Why |
| --- | --- | --- |
| Explain a published report after a late correction | Essential | L1, L6. Need both questions |
| Exclusive dated assignment with late HR or legal correction | Essential | S-SQL-03, employment and contracts |
| Future-dated change already known | Essential as valid time. Knowledge time is just now | S-XTDB-02, S-SQL-01 |
| Period lock and backdate authorization | Essential as policy over valid-time writes | L9 |
| Operational price lookup | Optional | Validity interval. Known-then only if a quote must be explained |
| Sensor or machine time series | Optional, often harmful as rectangles | S-PAL-02. High cardinality points |
| Palantir-style current object plus audit widget | Optional | S-PAL-01. History is a toggle |
| Drafts, caches, derived projections | Harmful | No published-report identity. Four timestamps add no question |
| Posted journal, stock ledger, tax return | Harmful as portion-update | L6. Append a reversal |
| Concurrent relators forced through `WITHOUT OVERLAPS` | Harmful | L7 |
| Treating Datomic `as-of` as `valid then` | Harmful | S-DAT-01, R1 |
| Replaying current ontology over old facts without saying so | Harmful | L8 |

## Enforcement map

The domain lives in the type. The clocks are assigned at the boundary. The engine trusts the branded values.

| Law | Enforced at |
| --- | --- |
| L3 | Write boundary. Runtime stamp |
| L4, L5 | Action parameter parse. Type construction |
| L7, L9 | Constraint and Policy at commit |
| L6 | Type invariant on ledger-class records |
| L1, L10 | Query |
| L8 | Pin on Action, Function, Policy. Replay API |
| Order-sensitive folds | Projection, using the domain sequence key |

See principle-boundary-discipline and principle-model-the-domain. Scattered `if posting_date` checks across services would be the failure mode.
