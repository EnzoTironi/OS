# Wave A contract. Issue 5

**Track:** foundation  
**Issue:** https://github.com/EnzoTironi/OS/issues/5  
**Open question:** `docs/open-questions.md` Q7  
**Decision state:** `undetermined`  
**Retrieved:** 2026-08-15  
**Contract used:** `docs/swarm-research-backlog.md` Agent output contract. `docs/swarm-result-contract.md` was not in the tree.

This file is the single-page contract. The other files in this folder are the queryable cards.

Q7 stays open. Two query questions look independently necessary in several domains. That is not the same as making every stored fact a bitemporal rectangle.

## 1. Question

Which temporal dimensions are semantically necessary, and where must they be enforced?

Subquestions from the issue, left unanswered as architecture.

- Valid time versus system or knowledge time.
- Point events versus intervals.
- Backdated operations and late-arriving corrections.
- Historical queries `valid then` versus `known then`.
- Transaction-time immutability.
- Temporal cardinality and temporal relationships.
- Historical replay under an old ontology revision versus the current one.

## 2. Sources

Primary sources read in this pass. Thesis, constitution, and RFC-0001 are project context, not observations.

| Source | What was read | Kind |
| --- | --- | --- |
| XTDB | Time in XTDB. Key concepts. | Official product docs, retrieved 2026-08-15 |
| SQL:2011 | Kulkarni and Michels, Temporal features in SQL:2011, SIGMOD Record 41(3) | Industry paper on the ISO standard, 2012 |
| Datomic | Database filters. Changing schema. Best practices. | Official docs, retrieved 2026-08-15 |
| ERPNext | Immutable ledger. How transactions affect the ledger. Item Price. Issue 11782. Issue 51183. | Official docs dated 2026-07-30 and 2026-08-14. Public GitHub issues |
| Odoo | Year-end closing 19.0. `account.move` lock-date behavior. `hr.version` contract dates. `stock.valuation.layer` order | Official 19.0 docs. Public source field names and a public refactor commit message |
| Palantir Foundry | Enable user edit history. Edit History widget. Time series stream values. Edits History API | Official product docs, retrieved 2026-08-15 |
| ValueFlows | Accounting. Flows. `vf:corrects` | Official vocabulary, retrieved 2026-08-15 |
| GS1 EPCIS | Implementation guideline current standard. EPCIS 1.2 error declaration note | Official guideline and standard text |
| W3C PROV-O | `startedAtTime`, `endedAtTime`, `generatedAtTime`, `invalidatedAtTime` | W3C Recommendation, 2013-04-30 |
| This repo | Issue 5. Issue 2. Issue 59. `docs/open-questions.md` Q7. `docs/constitution.md` §10. `docs/thesis.md` time section. RFC-0001 Time, read only | Project context |

URLs.

- https://docs.xtdb.com/about/time-in-xtdb.html
- https://docs.xtdb.com/concepts/key-concepts.html
- https://sigmodrecord.org/publications/sigmodRecord/1209/pdfs/07.industry.kulkarni.pdf
- https://docs.datomic.com/reference/filters.html
- https://docs.datomic.com/schema/schema-change.html
- https://docs.datomic.com/reference/best.html
- https://docs.frappe.io/erpnext/immutable-ledger-in-erpnext
- https://docs.frappe.io/erpnext/how-transactions-affect-the-ledger
- https://docs.frappe.io/erpnext/item-price
- https://github.com/frappe/erpnext/issues/11782
- https://github.com/frappe/erpnext/issues/51183
- https://www.odoo.com/documentation/19.0/applications/finance/accounting/reporting/year_end.html
- https://palantir.com/docs/foundry/object-edits/user-edit-history/
- https://palantir.com/docs/foundry/workshop/widgets-edits-history/
- https://palantir.com/docs/foundry/api/ontologies-v2-resources/time-series-value-bank-properties/stream-values/
- https://www.valueflo.ws/concepts/accounting/
- https://www.valueflo.ws/concepts/flows/
- https://www.gs1.org/standards/epcis-and-cbv-implementation-guideline/current-standardd
- https://www.w3.org/TR/prov-o/
- https://github.com/EnzoTironi/OS/issues/5
- https://github.com/EnzoTironi/OS/issues/59

Code corpora for ERPNext and Odoo were not cloned. That is a gap for issues 32 and 33.

## 3. Evidence

**Domain evidence.** Distinctions that keep showing up because the world requires them.

- A published report and a later correction are different questions. ValueFlows says recorded activity that already hit reports cannot be changed in place. ERPNext keeps original plus reversal rows. Odoo blocks edits on or before a lock date and steers later postings after that date.
- Occurrence time and record time come apart. GS1 Event Time is when the step happened. Record Time is when the repository stamped the event and does not describe the business step. ValueFlows says the event date is often earlier than the computer-generated `created` time. ERPNext posting date sets the accounting period. Creation and submission time may differ.
- Enduring assignments need intervals. SQL:2011's employee-department example needs `WITHOUT OVERLAPS` when one assignment is exclusive. ERPNext Item Price has Valid From and Valid Upto. Odoo 19 moved payroll-impacting fields onto dated `hr.version` rows with `contract_date_start` and `contract_date_end`.
- Point occurrences are not the same as those intervals. EPCIS events are instants with a timezone offset. PROV activities have start and end instants. PROV entities have generation and invalidation instants.
- Stock valuation is order-sensitive. ERPNext FIFO and moving average change later layers when an earlier movement is inserted. A backdated stock row is not a harmless metadata edit.
- Schema time is not fact time. Datomic `as-of` does not restore the past schema. A later cardinality change rewrites how historical entities are read.

**Source-system artifact.** See `sources.md` section 4 in spirit, and the Divergence section below. Palantir edit history is an opt-in toggle that can be permanently deleted. XTDB puts four temporal columns on every table. Datomic has no valid-time axis. Odoo stock valuation layers order by `create_date`. Those are product choices.

## 4. Source artifacts

Do not promote these into OS primitives.

- XTDB hidden columns `_system_from`, `_system_to`, `_valid_from`, `_valid_to` and ubiquitous bitemporality on every table.
- SQL:2011 `PERIOD` as table metadata rather than a period type. At most one application-time period and one system-time period per table.
- Datomic datom `[e a v tx added]`, `as-of`, `since`, `history`, and `:db/txInstant`.
- ERPNext DocType plus generated GL Entry and Stock Ledger Entry rows, `is_cancelled`, Repost Item Valuation jobs, `set_posting_time`.
- Odoo `account.move.date`, lock dates, Hard Lock, `stock.valuation.layer` ordered by `create_date`, `hr.version`.
- Palantir Track user edit history, Action Logs as a second object type, time-series value banks, ontology scenarios and branches.
- ValueFlows `corrects` as a link between Economic Events.
- EPCIS `errorDeclaration` plus optional `eventID`.

## 5. Convergence

Independent sources make the same cuts.

1. **Two questions.** XTDB names them as curated valid-time history versus immutable system-time history. SQL:2011 names them application time and system time. EPCIS names them Event Time and Record Time. ValueFlows names them event date and created time. ERPNext names them posting date and creation or submission time. The labels differ. The cut repeats.

2. **System time is not user-editable.** XTDB. SQL:2011 `GENERATED ALWAYS AS ROW START` and `ROW END`. EPCIS Record Time is filled by the repository, not the capturer. Datomic `:db/txInstant` is a transaction fact. Users may import a past system time only as a migration hatch, which XTDB documents as `system_time_start` for legacy import.

3. **Valid or application time is user-owned and may sit in the past or the future.** SQL:2011. XTDB `FOR VALID_TIME FROM`. ERPNext posting date. ValueFlows late-recorded events. Kulkarni's insurance policy inserted before it comes into effect.

4. **Ledger-class records do not overwrite.** ERPNext immutable ledger. ValueFlows `corrects`. Odoo credit notes and lock dates. The correction is a later record.

5. **Closed periods are a policy wall, not a storage trick.** ERPNext freeze and Accounting Period. Odoo Lock Everything and Hard Lock. A bitemporal engine that still lets anyone rewrite last year's valid time has not enforced the domain.

## 6. Divergence

Sources disagree, and the disagreement is useful.

| Topic | Split | Plausible reason |
| --- | --- | --- |
| Must every row carry both axes? | XTDB yes, by default. SQL:2011 no, table by table. Datomic no valid time. Palantir no, current object plus optional edit history plus optional time series | Product thesis versus incremental standard versus transaction-log database versus operational ontology |
| How do you correct a wrong past? | XTDB and SQL:2011 split or supersede valid-time portions in place on the current system row. ERPNext and ValueFlows append a reversal or `corrects` event. EPCIS appends an error declaration | Row-version databases versus published-report ledgers versus supply-chain event logs |
| What does `as-of` mean? | Datomic `as-of` is transaction time only. XTDB default current query is valid-now and system-best-known. Palantir edit history is who changed the object, not what was true in the world | Collapsing the two questions is the common failure |
| Does time travel restore the old schema? | Datomic explicitly no. XTDB gradual schema is current-basis. Palantir ontology edits are a separate product surface | Physical indexes and live ontology definitions outlive old shapes |
| Stock sequence key | ERPNext posting datetime, with a known hole when `set_posting_time` is off. Odoo valuation layers order by `create_date` | Implementation accident. OCA even ships an accounting-date module because the native key is the wrong clock |
| Temporal uniqueness | SQL:2011 `WITHOUT OVERLAPS` is optional. ERPNext overlapping Item Prices resolve by latest Valid From. Employment may require exclusivity. Dual contracts may not | Cardinality is a domain constraint |

## 7. Candidate laws

Smallest claims. Full cards in `candidate-laws.md`.

| ID | Claim | Decision state |
| --- | --- | --- |
| L1 | The questions `valid then` and `known then` are different questions. A system that can answer only one cannot explain late corrections. | `supported` |
| L2 | Not every stored property must carry both axes. Universal bitemporal rows are a storage thesis, not a domain law. | `supported` |
| L3 | Knowledge or system time on a committed record is assigned by the runtime and is not user-mutable. | `supported` |
| L4 | Valid time is a domain value. It may precede or follow knowledge time. The write boundary parses it. The user may set it when the action allows backdating or scheduling. | `supported` |
| L5 | Occurrence instants and validity intervals are different natures. An event timestamp is not a validity period. | `hypothesis` |
| L6 | A record that has entered a published ledger is corrected by a later record, not by rewriting the original valid-time portion. | `supported` for ledger-class facts. `undetermined` as a universal Fact law |
| L7 | Temporal cardinality is a constraint on a relationship or property, not a kernel default. `WITHOUT OVERLAPS` is earned per type. | `supported` |
| L8 | Ontology, function, and policy revision is a third pin. Time travel on facts does not restore old meaning. | `supported` as a Datomic-shaped fact. `hypothesis` for OS |
| L9 | Period locks are authority over valid-time writes, not a second clock. | `supported` |
| L10 | Default read is valid-now, known-best. Historical reads name which question they ask. | `hypothesis` |

Q7 asked whether every fact must carry both dimensions. L1 and L2 together refuse a yes and refuse a no. That is why the decision state on this issue stays `undetermined`.

## 8. Counterexamples

Full cards in `counterexamples.md`.

- Inventory. A late receipt dated last Tuesday changes FIFO layers. Valid-time insert plus known-now. Rewriting Tuesday's system-time row would hide what operations believed when they shipped Wednesday.
- Inventory. Backdating without placing the row in posting order. ERPNext issue 51183. The valid-time field is a lie if the sequence key ignores it.
- Pricing. Item Price Valid From and Valid Upto answer valid-then for quotes. Most operational pricing never asks known-then. Forcing bitemporal rectangles on every price list row is optional cost.
- Pricing. A published quote used last month's price. Later the list is corrected. The quote is a decision pinned to the price-as-known, not an invitation to reprice history.
- Accounting. Cancelled journal. Original plus reversal. `FOR PORTION OF VALID_TIME` overwrite of the posted journal is harmful.
- Accounting. Lock date. Odoo moves a late posting to the day after the lock. That is current-period recognition of a late fact, not a valid-time rewrite of the closed year.
- Employment. One exclusive job. `WITHOUT OVERLAPS` is essential. Two concurrent contracts. The same constraint is harmful.
- Employment. HR records a raise in March, effective January. Payroll already ran. Valid-then says January. Known-then says March. The payslip is a published ledger.
- Contracts. A policy inserted before it takes effect. Kulkarni. Future valid time with current knowledge time. Unitemporal system-time history cannot represent the future assignment.
- Manufacturing. Planned start versus actual start versus recorded-at. Collapsing those three into one timestamp makes variance and late scrap unexplainable.
- Manufacturing. As-built ILMD is frozen at event time in EPCIS. Replaying the current product master over that event is a different question.
- Ontology. Datomic cardinality change. `as-of` last year under today's schema returns one of several historical values. Replay under current ontology is not replay under old ontology.

## 9. Runtime pressure

If the surviving claims hold, the engine has to do these things. Storage layout stays an implementation choice.

1. **Write boundary.** Assign knowledge or system time. Refuse client mutation of that stamp. Parse valid time or occurrence time into a branded domain value. See principle-boundary-discipline.
2. **Type construction.** A validity interval is a start plus a duration or a closed-open pair that cannot be built unordered. A point event is not an interval with equal ends unless the domain says so. See principle-type-system-discipline.
3. **Constraint engine.** Evaluate temporal cardinality and temporal foreign keys at commit. Evaluate period locks as policy, not as missing indexes.
4. **Ledger kernel.** For types marked ledger-class, reject in-place valid-time rewrite. Accept reversal, amendment, return, or `corrects`.
5. **Query defaults.** Current read is valid-now and known-best. `valid then` and `known then` are named parameters. A query that asks both is bitemporal. A query that asks one is not.
6. **Projection.** Order-sensitive projections such as FIFO use the domain sequence key, usually posting or occurrence time, not ingest time.
7. **Replay.** An Action that must be explained later pins ontology revision, function revision, and policy revision. Those pins are not valid time and not system time.
8. **Opt-in history.** Edit history, time series, and full bitemporal rectangles are capabilities a type or property declares. They are not implied by ObjectType.

Wave B owns indexes, logs, and engines. This list is semantic pressure, not a storage shortlist.

## 10. Open questions

1. Are knowledge time and transaction time the same stamp, or is "when a human knew" a provenance attribute on top of the commit stamp? ValueFlows `created` is computer-generated. ERPNext creation is a document field. Neither is a third index yet. **Decision state:** `undetermined`.
2. Is `Fact` the carrier of valid time, or do Events carry occurrence instants and Relators carry validity intervals? Crosses issue 4 and issue 3. **Decision state:** `undetermined`.
3. Which types are ledger-class by law, and which may use SQL-style portion update? **Decision state:** `hypothesis`.
4. Can two ontology revisions coexist for read, or is old meaning recovered only by pinning the revision on the Action? Crosses Q19. **Decision state:** `undetermined`.
5. Does the generic engine need native temporal operators, or can domains declare interval constraints as ordinary Functions? Crosses Q15. **Decision state:** `undetermined`.
6. Issue 59 remains the adversarial twin of this folder.

## 11. Decision state

**Issue 5 overall:** `undetermined`.

Q7 is not settled. The evidence supports two independently askable questions and rejects both "every row is bitemporal" and "transaction history is enough." The next useful work is a type-level requirement map, which issue 59 already asked for, plus corpus traces in issues 32, 33, and 35.

## Overview

Enterprise systems keep asking two different time questions. What was true in the modeled world at T. What did we know or record at T. XTDB, SQL:2011, EPCIS, ValueFlows, and ERPNext all cut those questions apart. Datomic and Palantir answer the second well and leave the first to the application.

The attractive mistake is to treat that cut as a storage default. Put four timestamps on every property and call the metamodel done. Ledger domains then lose published-report identity, because a valid-time portion update looks like a correction. High-churn series then drown in rectangles. Schema evolution then pretends that `as-of` restored meaning.

The less attractive and more accurate picture is a small set of temporal natures, enforced at named boundaries, declared per type.

## Key concepts

**Valid time.** When the statement holds in the modeled world. User-owned. May be past or future. Also called application time, business time, effective time.

**Knowledge or system time.** When the runtime accepted the statement. Runtime-owned. Monotonic for a given store. Also called transaction time, record time, processing time.

**Occurrence instant.** When an event happened. A point, with timezone. Not an interval.

**Validity interval.** Closed-open period during which an enduring assignment holds. Employment, price, contract, role.

**Ledger-class record.** A record that may already have been published. Corrected by a later record.

**Ontology pin.** The revision of types, functions, and policies under which a decision was taken. Not a clock.

**Period lock.** Authority that forbids or reroutes valid-time writes before a date.

## How it works

A write arrives at the Action boundary. The shell assigns knowledge time. The Action parameters carry valid time or occurrence time when the domain has one. Constraints run against the valid-time picture the Action claims. Policy checks the lock and the caller's backdate right. Ledger-class types append. Non-ledger types may supersede a validity portion if their constraint set allows it. Projections that care about sequence read the domain clock, not the ingest clock.

A read names its question. Default is current world, best knowledge. Audit names a knowledge-time cut. Operations planning names a valid-time cut. A dispute names both.

A replay names its ontology pin. If the pin is missing, the read is under current meaning and must say so.

## Where things live

Enforcement is not one layer.

| Concern | Where it is enforced |
| --- | --- |
| Who owns the knowledge stamp | Write boundary, runtime |
| What the valid or occurrence stamp means | Type, parsed at the Action boundary |
| Exclusive intervals, temporal foreign keys | Constraint on the type or relator |
| Closed periods, who may backdate | Policy on the Action |
| No in-place rewrite | Ledger-class invariant on the type |
| `valid then` versus `known then` | Query |
| FIFO and other order-sensitive folds | Projection, using the domain sequence key |
| Old versus current meaning | Ontology pin on Action, Function, Policy |

## Gotchas

- `as-of` in Datomic is not `valid then`.
- ERPNext posting date is not knowledge time, and creation is not a full system-time period.
- Palantir edit history can be turned off and deleted. It is not a semantic guarantee.
- Odoo can move a late invoice to the day after the lock. That answers a recognition question, not a valid-then question.
- Overlapping prices are resolved by latest Valid From in ERPNext. That is a tie-break, not a uniqueness law.
- Future valid time is real. Address changes, price rises, contracts that start next month.
- Schema change after the fact can make historical reads lie even when the datoms are intact.
