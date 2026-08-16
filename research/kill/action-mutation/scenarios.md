# Scenarios

Adversarial cards. Each names kind, the law it attacks or preserves, and a decision state for what the card currently does to Action-first. Twenty-eight cards. Happy paths are not included.

## S-001. PATCH a submitted sales invoice total

**Kind.** counterexample  
**Attacks.** L-AM-02 if someone says any write is fine. **Preserves.** L-AM-01, L-AM-06  
**Setup.** Invoice is submitted. GL rows exist. A user PATCHes `grand_total`.  
**Expect if Action-first for decisions holds.** Refuse. Require Reverse, Credit Note, or Amend.  
**Expect if universal Action-only is the only story.** An EditInvoice Action that sets `grand_total` would still be wrong. The name does not fix an in-place posted edit.  
**Decision state.** `supported` as a preserve of L-AM-06  
**Runtime consequence.** Posted money has no generic write port.

## S-002. Save a draft invoice line three times

**Kind.** counterexample  
**Attacks.** L-AM-02, and a strict reading of L-AM-01 that names every draft keystroke  
**Setup.** Accountant types quantity, then rate, then a note. Docstatus 0. No GL.  
**Expect.** Generic save or ApplyDraftPatch is enough. Submit remains W1.  
**Decision state.** `hypothesis` that this weakens universal Action-only without killing L-AM-01  
**Runtime consequence.** Draft save is W9. If the draft already reserved stock, reclassify as W1. E-005.

## S-003. Cold-room temperature every two seconds

**Kind.** counterexample  
**Attacks.** L-AM-02. **Preserves.** L-AM-03, L-AM-09  
**Setup.** A sensor writes 0.5 Hz temperature into OS. No one decided to change the room.  
**Expect.** Append observations. Maybe batch ingest. No RecordTemperature Action with submission criteria per sample.  
**Decision state.** `supported` as a kill of universal Action-only  
**Runtime consequence.** Stream provenance lives on the ingest, not on 43,200 daily Actions.

## S-004. Funnel reindexes a warehouse object from a dataset

**Kind.** counterexample  
**Attacks.** L-AM-02. **Preserves.** L-AM-05  
**Setup.** Palantir-shaped pipeline. Nightly parquet of SAP bins replaces object properties. No user Action.  
**Expect.** W3 replica apply. If OS also owns stock via W1, this is a claim, not a silent win.  
**Decision state.** `supported` from E-002  
**Runtime consequence.** Datasource writes need a class and a source. They do not need AssignBin.

## S-005. Two lawyers type the same contract clause offline

**Kind.** counterexample  
**Attacks.** L-AM-02. **Preserves.** L-AM-07  
**Setup.** Yjs or similar. Both insert into the same sentence. Updates commute.  
**Expect.** `applyUpdate`, not InsertClause(offset, text) as a governed business Action.  
**Decision state.** `supported` as boilerplate evidence  
**Runtime consequence.** CRDT ops are W5. Signing the contract is W1. E-015.

## S-006. Sign the contract after the CRDT merge

**Kind.** counterexample  
**Attacks.** A reading of L-AM-07 that never commits  
**Preserves.** L-AM-01  
**Setup.** After S-005, a principal executes SignAgreement on the merged text.  
**Expect.** Named Action. Preview and policy. The merged bytes are an input, not the decision.  
**Decision state.** `supported`  
**Runtime consequence.** Collaborative state is not operational truth until W1.

## S-007. Refresh available-to-promise materialized view

**Kind.** counterexample  
**Attacks.** L-AM-02. **Preserves.** L-AM-04  
**Setup.** `REFRESH MATERIALIZED VIEW atp`. Rows replaced. E-014.  
**Expect.** Maintenance or derived job. Not RecalculateATP as a business decision unless someone is authorizing a plan change.  
**Decision state.** `supported`  
**Runtime consequence.** `MAINTAIN` privilege is not accountant authority.

## S-008. Wipe and rebuild a shipping read model

**Kind.** counterexample  
**Attacks.** L-AM-02. **Preserves.** L-AM-04  
**Setup.** Fowler complete rebuild. Event log replayed onto an empty projection.  
**Expect.** Same shipments as before. No new ShipOrder Actions.  
**Decision state.** `supported`  
**Runtime consequence.** Rebuild identity must not mint new Action invocations. E-013.

## S-009. Import 8,000 item masters

**Kind.** counterexample  
**Attacks.** Per-row CreateItem as the only legal shape  
**Preserves.** L-AM-13 if the import is typed  
**Setup.** Cutover CSV of SKUs, units, and barcodes. No stock yet.  
**Expect.** One ImportCatalog or ApplyReplicaBatch with provenance. Not 8,000 preview-approve-commit sagas.  
**Decision state.** `hypothesis`  
**Runtime consequence.** Still refuse a CSV that also posts opening stock as submitted ledger rows. See S-025.

## S-010. Cycle count Apply

**Kind.** counterexample  
**Attacks.** Silent `write({qty})` on on-hand  
**Preserves.** L-AM-01, L-AM-06  
**Setup.** Counted is 17. System on-hand is 20. User hits Apply with reason "Physical Inventory." E-008.  
**Expect.** Named adjustment Action. Movement or raise/lower Event. Not a quant PATCH.  
**Decision state.** `supported`  
**Runtime consequence.** Sibling 18 already split adjustment from ordinary movement.

## S-011. ORM write on a done stock move UoM

**Kind.** counterexample  
**Attacks.** Generic CRUD after done  
**Preserves.** L-AM-06  
**Setup.** Odoo-shaped move in `done`. Caller writes a new UoM. E-009.  
**Expect.** Refuse.  
**Decision state.** `supported`  
**Runtime consequence.** Done is posted operational state even if the UI still looks like a row.

## S-012. PLC tag at 200 Hz

**Kind.** counterexample  
**Attacks.** L-AM-02. **Preserves.** L-AM-09  
**Setup.** Motor current streamed into OS. Downstream quality uses the series.  
**Expect.** Time-series or event append. Action-per-sample is theater.  
**Decision state.** `supported`  
**Runtime consequence.** Use of the series in a HoldLot Action is W1. The samples stay W10.

## S-013. Add a custom field "internal nickname"

**Kind.** counterexample  
**Attacks.** Treating Customize Form as customer CRUD  
**Preserves.** L-AM-08, L-AM-12  
**Setup.** Admin adds a label-only field on Customer.  
**Expect.** W6. Not UpdateCustomer. Historical Actions should not change meaning.  
**Decision state.** `hypothesis` for the exact admin verb  
**Runtime consequence.** If the new field is later used in tax logic, that is an ontology revision with W1 consequences. Still not a customer Action.

## S-014. db_set status on a submitted invoice

**Kind.** counterexample  
**Attacks.** Escape-hatch culture  
**Preserves.** L-AM-06  
**Setup.** Frappe `db_set('status', 'Paid')` on a submitted invoice. E-007. No Payment Entry.  
**Expect.** OS treats this as a failed classification. Status that means "paid" is a projection of settlement Events.  
**Decision state.** `supported` as a source warning  
**Runtime consequence.** Bypass APIs in corpora are evidence of pressure, not of a legal write class.

## S-015. Moqui create#Example versus entity.create

**Kind.** counterexample  
**Attacks.** "Service wrapper equals business Action"  
**Preserves.** L-AM-11  
**Setup.** Same fields. One call goes through Service Facade, one through Entity Facade. E-010.  
**Expect.** The implicit service buys transaction and security. It does not buy a business verb.  
**Decision state.** `supported`  
**Runtime consequence.** Low-level typed ports may look like this. Do not advertise them as ShipOrder.

## S-016. Dock-door EPCIS OBSERVE

**Kind.** counterexample  
**Attacks.** L-AM-02. **Preserves.** L-AM-03  
**Setup.** Reader says EPC X was observed at Location L at 13:23. GS1 informal example. E-012.  
**Expect.** Visibility Event. Current location may project. No ObservePallet business decision unless a human is attesting beyond the reader.  
**Decision state.** `supported`  
**Runtime consequence.** Capture workflow is custom in GS1. The persist is still an event.

## S-017. Nightly SAP stock replica overwrites OS-owned receipt

**Kind.** counterexample  
**Attacks.** Last-write-wins sync  
**Preserves.** L-AM-05, L-AM-12  
**Setup.** This morning OS posted a receipt via W1. Tonight SAP extract lacks that receipt and Funnel-shaped sync writes yesterday's quantity.  
**Expect.** Disagreement, not silent mutation. Issue 4 owns the authority cut.  
**Decision state.** `supported` as a required conflict  
**Runtime consequence.** Replica apply cannot un-post a W1 by property overwrite.

## S-018. Vacuum after a crash rewrites a posted quantity

**Kind.** counterexample  
**Attacks.** Maintenance as a disguise  
**Preserves.** L-AM-04, L-AM-08's cousin W8, L-AM-10  
**Setup.** Operator runs a "repair" that changes on-hand because an index was rebuilt wrong.  
**Expect.** If the number is derived, rebuild from Events. If the number was posted, this is a corrupt W1.  
**Decision state.** `supported`  
**Runtime consequence.** W8 may compact bytes. It may not invent stock.

## S-019. allow_on_submit comment versus allow_on_submit rate

**Kind.** counterexample  
**Attacks.** A blanket "submitted documents are frozen"  
**Preserves.** L-AM-06 for money and quantity  
**Setup.** Frappe allows some fields after submit. A comment is one thing. A rate is another. E-005.  
**Expect.** Narrative fields may be W9 after submit. Economic fields may not.  
**Decision state.** `hypothesis` for the field cut  
**Runtime consequence.** The allow-on-submit flag is a source artifact. OS must classify the property, not copy the flag.

## S-020. Same payload, two classes

**Kind.** counterexample  
**Attacks.** Payload-shaped Actions  
**Preserves.** L-AM-03 versus L-AM-01  
**Setup.** JSON says `item=A, qty=5, location=BIN-1`. It might be a cycle-count Apply. It might be a reader observation. It might be a replica of SAP.  
**Expect.** Class comes from the speech act, not the keys.  
**Decision state.** `supported`  
**Runtime consequence.** One DTO is not one Action.

## S-021. Late OBSERVE after ShipOrder already succeeded

**Kind.** counterexample  
**Attacks.** Action as the only history  
**Preserves.** L-AM-03, issue 7 L-005  
**Setup.** Warehouse executed ShipOrder. Two days later a partner EPCIS event says the pallet was still at the origin dock at ship time.  
**Expect.** The Event arrives with no new OS Action. It may contradict the Action's intended outcome. Reconciliation is not an in-place edit of the Action.  
**Decision state.** `supported`  
**Runtime consequence.** Issue 7 four-place split. Unknown and late observation stay first-class.

## S-022. Merge two offline quote drafts, then confirm to the customer

**Kind.** counterexample  
**Attacks.** CRDT merge as commitment  
**Preserves.** L-AM-07 then L-AM-01  
**Setup.** Two salespeople edit price and lead time offline. CRDT merges both. Customer is then promised the merged price.  
**Expect.** Merge is W5. Promise is W1. If the merge already emailed the customer, the email was a hidden W1.  
**Decision state.** `hypothesis` for email-as-effect  
**Runtime consequence.** Side effects during draft are how L-AM-07 dies.

## S-023. Rename Action display name "Ship" to "Dispatch"

**Kind.** counterexample  
**Attacks.** Admin write as business mutation  
**Preserves.** L-AM-08  
**Setup.** Ontology editor changes a label. Historical invocations used "Ship."  
**Expect.** W6. Historical meaning stays pinned or is explicitly migrated. Issue 7 L-007.  
**Decision state.** `hypothesis` for pin mechanics  
**Runtime consequence.** Do not answer open question 19 here.

## S-024. Cache of available qty used as the authority to promise

**Kind.** counterexample  
**Attacks.** L-AM-04 if caches become truth  
**Preserves.** L-AM-04's warning  
**Setup.** ATP view is stale by 40 minutes. Agent promises 500 because the view says 500. Actual on-hand is 20. Seed S-003 energy.  
**Expect.** The promise Action re-reads surviving facts, not only the view. Issue 7 L-003.  
**Decision state.** `supported`  
**Runtime consequence.** Derived writes may be wrong. They must not be authoritative at commit.

## S-025. Data Import of already-submitted invoices

**Kind.** counterexample  
**Attacks.** L-AM-13's import port if it skips Posting  
**Preserves.** L-AM-06  
**Setup.** Cutover file includes `docstatus=1` and implied GL. Frappe-style import flags ignore validations. E-007.  
**Expect.** Either replay Posting per row, or a typed CutoverPostedHistory that records provenance and does not pretend the rows were posted today by a clerk.  
**Decision state.** `undetermined` for the cutover encoding  
**Runtime consequence.** Bulk is not a reason to skip debit-credit.

## S-026. Generated EditFlightTimes Action

**Kind.** counterexample  
**Attacks.** L-AM-02's "we wrapped it, so we are done"  
**Preserves.** L-AM-11  
**Setup.** Palantir-shaped Action whose rules set `Time of Departure` and `Origin`. E-021.  
**Expect.** Safer than raw PATCH if criteria and logs exist. Still generic if the name restates the fields. A real decision would be DelayFlight or RerouteFlight.  
**Decision state.** `hypothesis` that thin wrappers are W9, not W1  
**Runtime consequence.** Generator output needs a review question. Does the name state a decision?

## S-027. EconomicEvent with no prior Intent

**Kind.** counterexample  
**Attacks.** Action-required-before-Event  
**Preserves.** L-AM-03, E-011, issue 7 L-005  
**Setup.** ValueFlows. An agent records a past transfer that nobody planned.  
**Expect.** Event is legal. Resource quantities move because of the Event.  
**Decision state.** `supported`  
**Runtime consequence.** OS must ingest unplanned observations. Forcing a fake prior Action rewrites history.

## S-028. User Action and Funnel sync on the same object in one minute

**Kind.** counterexample  
**Attacks.** Single-writer Action-only  
**Preserves.** L-AM-05, L-AM-01  
**Setup.** Clerk Applies a count. Funnel then indexes a dataset that still has the old quantity. E-002, E-003.  
**Expect.** Two write classes, two sources. Edit history that ignores source will lie.  
**Decision state.** `supported`  
**Runtime consequence.** Concurrent W1 and W3 need a recorded winner policy. That policy is not "Actions are the only writer," because Funnel already is not.

## Seed scenario links

`scenarios/README.md` S-003 stale approval is S-024's cousin. S-004 unknown after timeout is issue 7, not reopened. S-007 backdated stock is a W2 or W1 correction, not a field edit. S-010 cancellation after irreversible consequences is L-AM-06. S-011 contradictory observations is W2 plus issue 4, not a reason to PATCH the winner.
