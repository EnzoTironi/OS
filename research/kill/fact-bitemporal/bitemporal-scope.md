# Where dual time is unnecessary, local, or harmful

**Kind:** domain evidence, source-system artifact, candidate law, counterexample, runtime consequence  
**Decision state:** pervasive bitemporality is `rejected`. The two questions remain `supported` in selected domains.  
**Issue:** https://github.com/EnzoTironi/OS/issues/59  
**Open question:** Q7 stays open. This note refuses both "every row is bitemporal" and "one clock is always enough."

## The two questions are real

**Domain evidence.** Independent vocabularies keep cutting the same pair.

| Question | Names in sources |
| --- | --- |
| When did this hold in the modeled world. | SQL:2011 application time. XTDB valid time. EPCIS Event Time. ValueFlows event date. ERPNext posting date. |
| When did the system record or know it. | SQL:2011 system time. XTDB system time. EPCIS Record Time. ValueFlows `created`. Datomic `:db/txInstant`. SQL Server `ValidFrom` and `ValidTo` despite those names. |

Kulkarni and Michels state that transaction time may arbitrarily differ from valid time. An insurance policy may be inserted before it comes into effect. XTDB's address example records a 1 September move on 13 August. ValueFlows says the event date is often earlier than the computer-generated `created` time. GS1 says Record Time does not describe the business step and is not filled by the capturer.

**Candidate law.** `valid then` and `known then` are different questions. A system that can answer only one cannot explain a late correction. `supported`

**Not claimed.** Every stored property carries both axes.

## Products already refuse pervasiveness

**Source-system artifact, used as negative evidence.**

SQL:2011 lets a table have at most one application-time period and at most one system-time period. Either, both, or neither. Period definitions are table metadata, not a period type, because adding a type would have forced JDBC, ODBC, ETL, and host languages to change.

SQL Server implements only system-versioned tables. The engine owns `ValidFrom` and `ValidTo`. Users cannot insert a row that is valid last Tuesday and recorded today without turning `SYSTEM_VERSIONING` off. Microsoft's own usage list is audit, reconstruct stored state, trends, slowly changing dimensions, and recover from accidents. That is `known then`, not `valid then`.

Datomic filters are transaction-time predicates. `as-of` ignores later transactions. Traveling back in time does not restore the past schema. Cardinality changes rewrite how historical entities are read. A later single-valued attribute returns one of several historical values.

XTDB makes bitemporality ubiquitous, then immediately says it is opt-in in the query language. Ninety percent of the time applications look like ordinary SQL. Current-time indexes exist because history is the expensive path. That product thesis is a source-system artifact. The interesting part is the admission that most reads do not want the rectangles.

Palantir edit history is a later product surface. User edits can be dropped entirely with "drop all edits." Conflict resolution keeps one value in the object. The loser is gone.

**Candidate law.** Dual time is a declared capability of a type or property, not a hidden column set on `ObjectType`. `supported`

## Where the second axis adds no business value

These cases fail the "do operators ask both questions" test in [`criteria.md`](criteria.md).

**Pricing lists.** ERPNext Item Price has Valid From and Valid Upto. That answers "what price applied on the quote date." Most operational pricing never asks what the list looked like before a typo was fixed. Forcing system-time history on every list row is optional cost.

**Display names, colors, sort keys, icons.** No source in this pass asks `known then` for a label. Datomic `:db/noHistory` is the nearby hatch for values that should not keep versions.

**Password hashes and other secrets.** Datomic documents `:db/noHistory` on `:person/encrypted-password`. History here is a liability.

**Current-only operational flags.** Draft versus submitted in ERPNext is a lifecycle on the document. System-time history of the flag may help support. Valid time on the flag does not.

**High-churn sensor points.** EPCIS attaches sensor elements to events. The event already has Event Time. A bitemporal rectangle per reading multiplies storage the way SQL Server warns about large columns in temporal tables.

**UI and view metadata.** Constitution §6. Surfaces are not domain meaning.

**Candidate law.** If no operator, auditor, or projection asks `known then` for a property, system time on that property is rejected. If no operator asks `valid then` independently of record time, application time is rejected. `supported`

## Where time belongs only to selected properties or events

An Employee object can carry a current display name with no interval, an exclusive seat assignment with `WITHOUT OVERLAPS`, a compensation version with a valid interval, and a hiring Event with an occurrence instant. Putting the same four timestamps on every field erases those natures.

EPCIS events are instants with a timezone offset. `eventTime` is mandatory. `recordTime` is optional. SHACL says so. That is point occurrence plus optional ingest stamp, not a validity interval.

PROV activities have start and end instants. Entities have generation and invalidation instants. Those are not SQL application-time periods.

ValueFlows EconomicEvents are past observed flows. Intent and Commitment are future or scheduled flows. Collapsing those into one bitemporal Fact about "the date" is S-001.

**Candidate law.** Occurrence instants, validity intervals, posting dates, and knowledge stamps are different natures. A type picks the ones it has. `hypothesis` as a closed list. `supported` as a "not one rectangle" rule

## Where dual time or portion-update is harmful

**Published ledgers.** `FOR PORTION OF VALID_TIME` splits and rewrites the current system row. Kulkarni's Emp department update turns one row into three. ERPNext and ValueFlows instead append a reversal or `corrects` event so published reports remain explainable. Applying portion-update to a posted journal is harmful. The original effect disappears as a first-class row.

**Closed periods.** Odoo Lock Everything prevents new or changed journal items on or before the lock. A late fact is posted the day after the lock. That is current-period recognition, not a valid-time rewrite of the closed year. A bitemporal engine that still lets anyone rewrite last year's valid time has not enforced the domain. ERPNext freeze and Accounting Period are the same wall.

**Stock sequence.** A backdated movement that does not sit in posting order makes the valid-time field a lie. ERPNext's own manuals say valuation follows posting date and time, and that changing posting time to bypass controls is wrong. Odoo valuation-layer order by `create_date` is a source-system artifact and a known wrong clock when the business key is accounting date.

**Schema meaning.** Datomic `as-of` last year under today's cardinality is not last year's meaning. S-012 needs an ontology pin. Dual time does not provide it.

**Graph shapes in SQL Server.** Node and edge tables cannot be temporal. If OS later uses a graph store, copying SQL Server temporal as a universal feature fails at that boundary. That is a source-system limit, recorded so Wave B does not assume every store can hide four columns.

**Candidate law.** Ledger-class types correct by a later record. Period locks are policy over valid-time writes. Sequence-sensitive projections use the domain clock, not ingest time. Ontology revision is a third pin. `supported`

## What would restore pervasive bitemporality

A counterexample would need a domain where every property is independently asked both questions, portion-update is the honest correction, and current-state reads stay cheap without extra indexes. The sources in this pass do not show that domain. XTDB is the closest product thesis, and even XTDB optimizes the atemporal path as the common case.
