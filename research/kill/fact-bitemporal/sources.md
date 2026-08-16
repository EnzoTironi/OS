# Sources

**Kind:** source list  
**Retrieved:** 2026-08-16  
**Decision state:** n/a

Primary sources were read in this pass. Thesis, constitution, RFC-0001, and sibling research notes are project context, not observations. Sibling files were inspected with `git show` only and are not copied.

Code corpora for ERPNext and Odoo were not cloned. Behavior is taken from current public manuals. That remains a gap for issues 32 and 33.

## Project context, read only

- `docs/thesis.md`
- `docs/constitution.md` §1, §6, §10, §14, §18
- `docs/open-questions.md` Q2, Q6, Q7
- `docs/research-program.md`
- `docs/swarm-research-backlog.md` Agent output contract
- `docs/hypothesis-history.md` H4, H5
- `rfcs/0001-metamodel-hypothesis.md` Fact and Time sections, not edited
- `scenarios/README.md` S-001, S-007, S-010, S-012
- `research/README.md`
- `research/reference-landscape.md`
- https://github.com/EnzoTironi/OS/issues/59
- https://github.com/EnzoTironi/OS/issues/4
- https://github.com/EnzoTironi/OS/issues/5
- https://github.com/EnzoTironi/OS/issues/56

`docs/swarm-result-contract.md` was absent from `origin/main` at `dc918a50e550d384d1e18a6f24424e6ed4595b9c`.

## Snapshot and object models

| Source | What was read | Kind |
| --- | --- | --- |
| Palantir Foundry | How user edits are applied. Conflict strategies. Edit history is a later page, not required here. | Official product docs |
| Microsoft SQL Server | System-versioned temporal tables. Considerations and limitations. | Official docs, page dated 2025-05-19, fetched 2026-08-16 |

URLs.

- https://palantir.com/docs/foundry/object-edits/how-edits-applied/
- https://learn.microsoft.com/en-us/sql/relational-databases/tables/temporal-tables?view=sql-server-ver16
- https://learn.microsoft.com/en-us/sql/relational-databases/tables/temporal-table-considerations-and-limitations?view=sql-server-ver16

## Event models and ledgers

| Source | What was read | Kind |
| --- | --- | --- |
| Fowler, Event Sourcing | Pattern page. Snapshots. Retroactive events. | Public pattern write-up, mid-2000s draft, fetched 2026-08-16 |
| Greg Young | CQRS is not an architecture. Event sourcing everywhere is the largest failure. | Author blog, 2012-09-09 |
| InfoQ report of Young at DDD Europe 2016 | A whole system based on event sourcing is an anti-pattern. | News report, 2016-04-26 |
| Azure Architecture Center | Event Sourcing pattern. Snapshot cost. Cross-entity conflict. | Official docs, fetched 2026-08-16 |
| ValueFlows | Accounting. Flows. `corrects`. Event-resource logic. | Official vocabulary, fetched 2026-08-16 |
| ERPNext | Immutable ledger. Item Price. | Official docs dated 2026-08-14 and 2026-03-06 |
| Odoo 19.0 | Year-end closing. Lock Everything. Late postings move after the lock. | Official docs, fetched 2026-08-16 |
| GS1 EPCIS | Implementation guideline. EPCIS 2.0 XSD. SHACL shapes for `eventTime` and `recordTime`. | Official standard and guideline |

URLs.

- https://martinfowler.com/eaaDev/EventSourcing.html
- https://gregfyoung.wordpress.com/2012/09/09/cqrs-is-not-an-architecture/
- https://www.infoq.com/news/2016/04/event-sourcing-anti-pattern/
- https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing
- https://www.valueflo.ws/concepts/accounting/
- https://www.valueflo.ws/concepts/flows/
- https://www.valueflo.ws/specification/event-resource/
- https://docs.frappe.io/erpnext/immutable-ledger-in-erpnext
- https://docs.frappe.io/erpnext/item-price
- https://www.odoo.com/documentation/19.0/applications/finance/accounting/reporting/year_end.html
- https://www.gs1.org/standards/epcis-and-cbv-implementation-guideline/current-standardd
- https://ref.gs1.org/standards/epcis/2.0.0/
- https://github.com/gs1/EPCIS/blob/master/XSD/EPCglobal-epcis-2_0.xsd
- https://github.com/gs1/EPCIS/blob/master/Ontology/EPCIS-SHACL.ttl

## Temporal tables and bitemporal engines

| Source | What was read | Kind |
| --- | --- | --- |
| Kulkarni and Michels, 2012 | Temporal features in SQL:2011. SIGMOD Record 41(3). | Industry paper on the ISO standard |
| XTDB | Time in XTDB. Ubiquitous bitemporality. Default atemporal SQL. | Official product docs, fetched 2026-08-16 |
| Datomic | Database filters. Changing schema. | Official docs, fetched 2026-08-16 |

URLs.

- https://sigmodrecord.org/publications/sigmodRecord/1209/pdfs/07.industry.kulkarni.pdf
- https://docs.xtdb.com/about/time-in-xtdb.html
- https://docs.datomic.com/reference/filters.html
- https://docs.datomic.com/schema/schema-change.html

## Fact-oriented modeling

| Source | What was read | Kind |
| --- | --- | --- |
| Halpin, Object-Role Modeling overview | Elementary facts. CSDP. Relational mapping groups facts into tables. Objectification. | Author white paper |
| Halpin, ORM/NIAM Springer chapter | Elementary fact definition. Mapping is an implementation step. | Author chapter |

URLs.

- https://orm.net/pdf/ORMwhitePaper.pdf
- https://www.orm.net/pdf/springer.pdf

## Not used as evidence

- Vendor blogs that restate SQL:2011 without the standard text.
- Stack Overflow threads, except as a pointer that SQL Server users hit the missing application-time axis. The limitation is taken from Microsoft docs, not from the thread.
- Sibling research files as quoted evidence. They are session context only.

## Licensing note

OS is MIT. This folder extracts concepts, published behavior, and public standard text. No copyleft implementation is pasted or translated.
