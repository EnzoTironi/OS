# Sources. Temporal semantics

**Issue:** https://github.com/EnzoTironi/OS/issues/5  
**Retrieved:** 2026-08-15  
**Kind labels used below:** domain evidence, source artifact, candidate law, counterexample, runtime consequence.

Each card is one observation. Inference is labeled.

## XTDB

### S-XTDB-01 Two times, two questions

- Kind: domain evidence
- Citation: https://docs.xtdb.com/about/time-in-xtdb.html retrieved 2026-08-15
- Observation: System time is the immutable timeline the database maintains. Users have no control over it. Valid time is the user-editable timeline for when a fact holds in the real world. The docs say any requirement that uses "as of" or "with effect from" is probably valid time.
- Default current query is "for system-time as best known, for valid-time as of now."
- Audit that must hide later corrections uses `FOR SYSTEM_TIME AS OF`. Curated history that wants those corrections uses `FOR VALID_TIME`.
- Source artifact: every table is bitemporal. Four hidden columns. Closed-open periods. Built-in `WITHOUT OVERLAPS` on the rectangles.
- Runtime consequence: if OS copies ubiquitous columns, it has already chosen a storage thesis.

### S-XTDB-02 Future valid time and late correction

- Kind: domain evidence
- Citation: same page, Mike address worked example
- Observation: On 13 August the system records that from 1 September the address will be 84 Bank Street. A letter sent on 20 August still uses 123 London Road. Behind the scenes the old belief "London Road until further notice" remains visible under earlier system time.
- Counterexample to unitemporal system-time history. A future assignment is invisible if the only clock is commit time.

### S-XTDB-03 Valid time is not every domain clock

- Kind: source artifact
- Citation: https://docs.xtdb.com/quickstart/sql-overview.html retrieved via search 2026-08-15
- Observation: XTDB says valid time is the validity of a given row, "and not necessarily some other domain conception of time (unless you carefully model it 1:1)."
- Inference: promised date, planned date, and actual date still need distinct properties. One valid-time axis does not absorb them. Matches the Q3 caution in `docs/open-questions.md`.

### S-XTDB-04 BCDM lineage

- Kind: source artifact
- Citation: https://docs.xtdb.com/concepts/key-concepts.html retrieved 2026-08-15
- Observation: XTDB attributes the two-axis model to Jensen and Snodgrass, Bitemporal Conceptual Data Model, 1994, later adopted as the basis of SQL:2011. Allen interval operators are offered for overlap and containment.
- Limits: this pass did not fetch the 1994 paper itself.

## SQL:2011

### S-SQL-01 Application time versus system time

- Kind: domain evidence
- Citation: Kulkarni and Michels, Temporal features in SQL:2011, SIGMOD Record 41(3), 2012. https://sigmodrecord.org/publications/sigmodRecord/1209/pdfs/07.industry.kulkarni.pdf
- Observation: Valid time is the period during which a row is regarded as correctly reflecting reality. Transaction time is the period during which the row was recorded. "For any given row, its transaction time may arbitrarily differ from its valid time." Insurance example. A policy may be inserted long before it comes into effect.
- Users may define at most one application-time period and at most one system-time period per table.
- System-time columns are `GENERATED ALWAYS`. Users cannot update them. `FOR PORTION OF SYSTEM_TIME` is not allowed.
- Application-time start and end are user-assigned and may be past, present, or future. `UPDATE` and `DELETE` accept `FOR PORTION OF` and split overlapping rows.

### S-SQL-02 Temporal cardinality is optional

- Kind: domain evidence
- Citation: same paper, section 2.2.1
- Observation: A conventional primary key on `(ENo, EStart, EEnd)` still allows two overlapping assignments. The triples are not duplicates. The paper says the more typical requirement is one department at a time, expressed as `PRIMARY KEY (ENo, EPeriod WITHOUT OVERLAPS)`.
- Temporal foreign keys require the child's application-time period to be contained in a matching parent's period.
- Candidate law: exclusivity is a constraint, not a property of having a period.

### S-SQL-03 Bitemporal name-change example

- Kind: domain evidence
- Citation: same paper, bitemporal tables
- Observation: An employee name changes legally at a marriage. The database is updated later. Application time holds the legal change. System time holds when the row was recorded. Both periods are associated with the row.
- This is the employment late-correction shape.

### S-SQL-04 What the standard refused

- Kind: source artifact
- Citation: same paper, comparison with earlier valid-time tables
- Observation: Earlier designs only allowed rows whose valid time started at current time. SQL:2011 rejected that. Users may insert past or future application-time periods.
- Also refused in the 2011 feature set. Period joins as outer joins. Period aggregates. Multiple application-time periods per table.
- Runtime consequence: one application-time period per table is a standard limit, not a domain limit. A quote can still have requested, promised, and actual dates as ordinary columns.

## Datomic

### S-DAT-01 Transaction-time history only

- Kind: domain evidence for knowledge time. Counterexample to "as-of equals valid then"
- Citation: https://docs.datomic.com/reference/filters.html retrieved 2026-08-15
- Observation: `as-of` ignores later transactions. `since` keeps only later transactions. `history` includes assertions and retractions. Time points are transaction id, basis t, or a wall-clock instant. Instant is less precise than t.
- An entity is a point-in-time view and cannot be created from a `history` database, because the same attribute can have many values across time.
- Domain-specific `filter` can hide known-bad transactions. That is application-level correction, not valid-time rewrite.
- `as-of` is not a branch. `with` plus `as-of` does not let you branch the past.
- Present-tense `db` pays no history penalty.

### S-DAT-02 Schema does not travel with as-of

- Kind: counterexample
- Citation: https://docs.datomic.com/schema/schema-change.html retrieved 2026-08-15
- Observation: "a database value utilizes the single schema associated with its current basis. Thus traveling back in time does not take the working schema back in time, as the infrastructure to support the past schema may no longer exist."
- After a cardinality change to one, an entity from `as-of`, `since`, or `history` that had many values returns a single one of those values.
- Adding uniqueness does not change history. Historical databases may contain non-unique values.
- Candidate law L8. Replay under current ontology is a different operation from replay under the pinned revision.

### S-DAT-03 Wall clock is not the order

- Kind: runtime consequence
- Citation: https://docs.datomic.com/reference/best.html retrieved 2026-08-15
- Observation: Specify t, not `:db/txInstant`, when order matters. More than one transaction can share a millisecond. Use the log API when time is the selective criterion.
- `:db/txInstant` may be set explicitly when importing another store. That is a migration hatch, same family as XTDB `system_time_start`.

## ERPNext

### S-ERN-01 Immutable ledger

- Kind: domain evidence
- Citation: https://docs.frappe.io/erpnext/immutable-ledger-in-erpnext updated 2026-08-14
- Observation: Quietly replacing original ledger rows would make the audit trail impossible to trust. Cancel adds opposite rows. Combined effect is zero. Original remains. Cancelled documents with ledger rows cannot normally be deleted.
- Backdated stock can trigger Repost Item Valuation so later FIFO or moving-average layers recompute. Period freeze and Accounting Period can still block the write.
- "Do not alter the posting time merely to bypass valuation controls."
- Source artifact: GL Entry and Stock Ledger Entry as generated rows. `Show Cancelled Entries` filter.

### S-ERN-02 Posting date is not creation

- Kind: domain evidence
- Citation: https://docs.frappe.io/erpnext/how-transactions-affect-the-ledger updated 2026-07-30
- Observation: "The Posting Date determines the accounting period. The document's creation date and submission time may be different. If stock is involved, Posting Time can also affect the sequence used for stock valuation."
- Commitment documents such as Sales Order usually have no ledger effect. Ledger documents do. Collapsing those into one temporal object type would mix natures.

### S-ERN-03 Price validity is an interval, not a ledger

- Kind: domain evidence
- Citation: https://docs.frappe.io/erpnext/item-price updated 2026-03-06
- Observation: Item Price has Valid From and Valid Upto. Valid From defaults to the creation date. Public `get_item_price` filters `valid_from <= transaction_date <= valid_upto` and orders by latest Valid From.
- Overlaps are allowed and broken by recency. That is not `WITHOUT OVERLAPS`.
- Most price reads never ask known-then. Bitemporality here is optional until a published quote must be explained.

### S-ERN-04 Posting date versus creation as competing clocks

- Kind: source artifact and historical disagreement
- Citation: https://github.com/frappe/erpnext/issues/11782
- Observation: The 2017 immutable-ledger proposal wanted sequencing by creation timestamp and posting date as the period only. A commenter split "transaction date" as the physical date from "posting date" as when the books learned of the goods.
- Current docs still sequence stock by posting datetime and still distinguish creation. The proposal did not fully win.
- Inference: even one product argued with itself about which clock orders the ledger.

### S-ERN-05 Backdate without sequence is a lie

- Kind: counterexample
- Citation: https://github.com/frappe/erpnext/issues/51183
- Observation: A backdated posting date with `set_posting_time = 0` can leave the row out of chronological Stock Ledger order. Reposting then does not place it correctly. Valid time on the form is not the sequence key.
- Runtime consequence: projections must use the domain sequence, not a decorative date field.

## Odoo

### S-ODO-01 Lock dates rewrite the write, not the past

- Kind: domain evidence
- Citation: https://www.odoo.com/documentation/19.0/applications/finance/accounting/reporting/year_end.html retrieved 2026-08-15
- Observation: Lock Everything prevents create or modify of posted journal entries with accounting date on or before the lock. New entries that would fall on or before the lock get their accounting date set to the day after the lock.
- Administrators may open a dated exception. Hard Lock is irreversible "to ensure inalterability and to meet accounting requirements in certain countries."
- Closed-period correction is often a current-period recognition, not a valid-time rewrite of the locked year.
- Source artifact: several lock kinds. Sales, purchase, tax return, lock everything, hard lock.

### S-ODO-02 Valuation layer clock

- Kind: source artifact
- Citation: `stock.valuation.layer` in Odoo 17 public tree, `_order = 'create_date, id'`
- Observation: Native valuation history is ordered by ingest time. Official docs still expose "Valuation at Date." Community module `stock_valuation_layer_accounting_date` exists because `create_date` is the wrong clock for some reports.
- Counterexample to treating source-system timestamps as valid time.

### S-ODO-03 Employment versions

- Kind: domain evidence
- Citation: Odoo commit 21f18b1, public message. Official Contracts page at https://www.odoo.com/documentation/saas-19.3/applications/hr/payroll/contracts.html
- Observation: Odoo 19 merged contracts into `hr.version` so "each version reflects a time-specific contract state." Fields include `date_version`, `contract_date_start`, `contract_date_end`. The Contracts page says the start date may stay blank until the contract is signed, then that signed date becomes Start Date.
- Signed date and effective start can differ. That is knowledge versus valid time inside one product.
- Limits: this pass read the commit message and docs, not the full `hr.version` implementation.

## Palantir

### S-PAL-01 Edit history is opt-in knowledge time

- Kind: source artifact
- Citation: https://palantir.com/docs/foundry/object-edits/user-edit-history/ retrieved 2026-08-15
- Observation: Track user edit history is a toggle on the object type. History starts only after enable. Disable "permanently deletes all existing edit histories." Users who can see the current object can see the entire history, including history from before a delete-and-recreate of the same primary key.
- Workshop Edit History calls the trail immutable for end users and says changelog records cannot be deleted or modified even if the corresponding ontology edits are reverted. That immutability lasts only while the type-level toggle stays on.
- This is who changed the object and when. It is not valid time of the world.

### S-PAL-02 Time series is a different clock

- Kind: source artifact
- Citation: https://palantir.com/docs/foundry/api/ontologies-v2-resources/time-series-value-bank-properties/stream-values/
- Observation: Time-series properties stream timestamped points over a range. Latest-value may prefer a live integration over history.
- Sensor time is occurrence or sample time. It is not object edit history and not a bitemporal row.

### S-PAL-03 Scenarios and branches are hypothetical, not temporal

- Kind: source artifact
- Citation: Edits History API query parameters `branch` and `scenarioRid` on https://palantir.com/docs/foundry/api/ontologies-v2-resources/object-types/get-object-type-edits-history/
- Observation: A scenario stages edits without committing them to the ontology. A branch is an experimental read surface.
- Inference: what-if is not `valid then`. Do not reuse scenario as a temporal dimension.

## ValueFlows

### S-VF-01 Corrects, event date, created date

- Kind: domain evidence
- Citation: https://www.valueflo.ws/concepts/accounting/ retrieved 2026-08-15
- Observation: "recorded activity that affect financial and other accounting reports cannot be changed directly in case of error" because reports may already have been published.
- Correction is another Economic Event with `corrects`. Quantity is the delta. Negative quantities are allowed only here. Customary pattern. Reverse as of the correction date, then re-enter the true event on the earlier correct date.
- "All events should record the computer-generated `created` date/time also." Periodic reports use it to avoid miss or double count. "often the event date will be earlier than the created date."
- `vf:corrects` domain and range are Economic Event. https://www.valueflo.ws/specification/all_vf.html
- Candidate law L6 for ledger-class records.

## GS1 EPCIS

### S-EPCIS-01 Event Time versus Record Time

- Kind: domain evidence
- Citation: GS1 EPCIS and CBV Implementation Guideline, current standard. https://www.gs1.org/standards/epcis-and-cbv-implementation-guideline/current-standardd
- Observation: Event Time is when the event took place, with timezone. Record Time is when the event was stored. "Unlike all other fields in the EPCIS event, the record time is not filled in when the event is captured nor does it describe anything about the business step."
- Capture-side guidance. Confirm Event Time is not in the future for some processes. That is a domain policy on occurrence time, not a system-time rule.

### S-EPCIS-02 Error declaration, not rewrite

- Kind: domain evidence
- Citation: EPCIS 1.2 change note in https://ref.gs1.org/standards/epcis/2.0.0/
- Observation: When the historical trace cannot be corrected by ordinary events, an `errorDeclaration` marks a prior event as being in error. Optional `eventID` lets the declaration point at corrective events.
- ILMD embedded in an event "SHALL reflect the current values of master data attributes, as known to the event creator, as of the event time" and then stays permanently part of that event.
- Counterexample to replaying current product master over a past commissioning event.

## W3C PROV-O

### S-PROV-01 Activity interval, entity lifetime

- Kind: domain evidence
- Citation: https://www.w3.org/TR/prov-o/ W3C Recommendation 2013-04-30
- Observation: Activities have `startedAtTime` and `endedAtTime`. Entities may have `generatedAtTime` and `invalidatedAtTime` bounding existence. Those are occurrence and lifetime instants, not a knowledge-time axis.
- PROV records derivation and revision. It does not give `FOR SYSTEM_TIME AS OF`.
- Inference: provenance time and knowledge time can coincide on a generation stamp. They are still different jobs. Constitution §11 keeps provenance open.

## Project context, not evidence

Issue 5 states the question. Issue 2 requires the five-way distinction this folder uses. Issue 59 attacks over-generalized Fact and bitemporal semantics. Constitution §10 requires distinguishing valid time from learned time and leaves the mechanism open. Thesis says enterprise truth needs at least those two questions and has not selected an implementation. RFC-0001 sketches `valid time` on Fact and asks whether every fact must carry both. Those sentences are hypotheses under test.

## Why-skill coverage

- Source control. `git log -S bitemporal -- docs/` hits `51be690` and `31c6a5f`. The cut is documented, not decided.
- Issue tracker. Issues 5, 2, and 59. No comments on issue 5 at retrieve time.
- Long-form. Thesis, constitution, open questions, RFC-0001, this folder.
- Real-time chat. Skipped. No matching MCP.
- Infrastructure observability. Skipped. No matching MCP.
- Error tracking. Skipped. No matching MCP.
- Product analytics. Skipped. No matching MCP.
