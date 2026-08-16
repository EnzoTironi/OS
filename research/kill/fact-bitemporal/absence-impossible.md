# Where absence makes historical explanation impossible

**Kind:** domain evidence, counterexample, candidate law, runtime consequence  
**Decision state:** `supported` for the cases below. This is the other half of the kill test. Over-generalization is rejected. Under-generalization is also rejected in these domains.  
**Issue:** https://github.com/EnzoTironi/OS/issues/59

The attractive opposite of ubiquitous Fact and dual time is a mutable snapshot with a single clock. These cases show where that opposite cannot explain the world.

## Late stock correction

S-007. On August 10 the system believes there are 100 units. On August 12 a document proves 20 units left on August 8.

A single `updated_at` cannot answer both questions.

- What did operations believe on August 10.
- What do we now believe August 10's stock was.

ERPNext keeps the original ledger rows and posts a backdated movement, then may run Repost Item Valuation so later FIFO or moving-average layers change. The cost of the second question is real. Skipping the first question makes Wednesday's shipment look negligent when the warehouse acted on the knowledge it had.

ValueFlows records event date and `created` so a late entry stays visible. GS1 Record Time exists so a query can ask which events arrived since the last pull, even when Event Time is last week.

**Candidate law.** Inventory that allows backdating must retain knowledge time separately from posting or occurrence time. `supported`

**Runtime consequence.** A current-state quantity projection is not enough. The engine must be able to cut the same movements by knowledge time.

## Published report, then correction

ValueFlows. Recorded activity that affects financial reports cannot be changed directly, because one cannot tell when reports were published, and many reports cannot be amended. The correction is a later event.

ERPNext. Quietly replacing original ledger rows would make the audit trail impossible to trust. Reviewers could no longer see what was posted first. Cancel keeps original plus opposite rows.

Odoo. Lock Everything freezes posted items on or before the lock. Hard Lock is irreversible in some localizations. The system then forces a later accounting date rather than rewrite the closed year.

A snapshot that overwrites the invoice, or a bitemporal portion-update that splits the posted row away, both destroy the explanation. The honest record is the original effect plus the later compensating effect, each with its own knowledge time.

**Candidate law.** Once a record may have been published, explanation requires the original and the correction as two records. `supported`

## Future-dated assignment recorded today

Kulkarni. An insurance policy may be inserted before it comes into effect. XTDB. Mike tells you on 13 August that from 1 September his address is 84 Bank Street. A letter sent on 20 August must still go to London Road.

A system-time-only table answers "what did we store at T" and cannot represent a future valid interval. SQL Server temporal tables hit this wall. Users cannot enter a non-now validity without disabling system versioning.

**Candidate law.** When the domain schedules a future assignment, valid time is required and may sit after knowledge time. `supported`

## Promise versus delivery

S-001. Requested 18, promised 20, planned 21, delivered 22.

One mutable `delivery_date` makes historical explanation of the promise impossible after the truck arrives. This is not a bitemporal problem first. It is a collapsed-property problem. After the four dates are split, dual time is needed only if a promise is later corrected and someone asks what we believed we had promised.

**Candidate law.** Layer split is prior to dual time. Absence of the layer split makes the history unexplainable even if four timestamps exist. `supported`

## Employment and exclusive seats

S-006. Person P works for O from January to July, changes position in March, compensation in May, is suspended, then leaves.

A current `worksFor` link cannot answer who held the seat in April. SQL:2011's Emp example exists because application-time periods are the assignment. `WITHOUT OVERLAPS` is how exclusivity is stated. Dual contracts are the counterexample that forbids making exclusivity a kernel default.

**Candidate law.** Enduring assignments that are queried historically need a validity interval on the assignment, not on every property of the person. `supported`

## As-built versus current master

EPCIS ILMD is embedded in the event and reflects master data as known at event time. It stays on that event when queried later. Replaying today's product master over last year's commissioning event answers a different question and will lie about the as-built.

**Candidate law.** Instance data frozen at occurrence time cannot be reconstructed from current master data. `supported`

## Decision under an old rule

S-012. A discount was legal under ontology version 1. Version 2 changes the rule. An auditor asks why the discount was allowed.

Datomic is explicit. A database value uses the schema of its current basis. Traveling back in time does not take the working schema back in time. Dual time on instance facts does not restore old meaning.

**Candidate law.** Historical explanation of a decision requires a pin of the definitions that authorized it. That pin is not valid time and not system time. `supported` as a requirement. Issue 9 owns the mechanism. `undetermined` as an OS representation

## What absence does not require

These failures do not revive Fact as the write unit. They do not revive four columns on every property.

They require, in named domains,

- a knowledge or record stamp that users cannot forge
- a valid or occurrence stamp when the world time differs from ingest
- append-only correction for published effects
- layer-typed dates instead of one field
- an ontology pin for old meaning

That list is smaller than "everything is a bitemporal Fact."
