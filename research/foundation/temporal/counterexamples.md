# Counterexamples. Temporal semantics

**Issue:** https://github.com/EnzoTironi/OS/issues/5  
**Retrieved:** 2026-08-15  
**How to use.** Each card tries to break a candidate law or to show where bitemporality is essential, optional, or harmful.

## Inventory

### CX-INV-01 Late receipt into a live FIFO stream

**Setup.** Warehouse ships Wednesday from what it believes is on-hand. Thursday a receipt is entered with posting date Tuesday.

**What breaks if we have only knowledge time.** Wednesday's shipment looks like negative stock or a different layer. The books never see Tuesday as the receipt's world time.

**What breaks if we rewrite Tuesday in place.** Wednesday's operators lose the picture they acted on. ERPNext S-ERN-01 says later FIFO layers must recompute, and the original plus any cancellation remain visible.

**Verdict.** Bitemporality is essential for the explanation. The correction of quantity is still a new stock row or a reversal, not a portion-update of Tuesday's system-time identity.

**Laws hit.** L1, L4, L6.

### CX-INV-02 Backdate that does not enter the sequence

**Setup.** ERPNext issue 51183. User sets a past posting date and leaves `set_posting_time` off. Later stock ledger rows stay earlier in the sequence.

**What breaks.** The form shows valid time. The projection ignores it. Repost does not repair order.

**Verdict.** A valid-time field without a sequence key is harmful. Enforcement belongs in the projection and the write boundary, not in a second decorative column.

**Laws hit.** L4. Runtime pressure item 6.

### CX-INV-03 Stock count versus book

**Setup.** ERPNext Stock Reconciliation and Odoo inventory adjustment. Counted quantity at a count instant. Book quantity is a projection.

**What breaks if we overwrite on-hand.** The count and the book become one number. The adjustment that should have been posted disappears.

**Verdict.** The count is an occurrence. The book is a projection over events. Bitemporal rows on the on-hand field are optional. The adjustment document is essential.

**Laws hit.** L5, L6.

## Pricing

### CX-PRC-01 Validity interval without knowledge time

**Setup.** ERPNext Item Price Valid From and Valid Upto. A sale on 15 March picks the row whose interval covers 15 March, latest Valid From wins.

**What breaks if we force bitemporal rectangles on every price.** Write path and indexes grow. Operational lookup never asks known-then.

**Verdict.** Bitemporality is optional. A validity interval is essential.

**Laws hit.** L2, L7.

### CX-PRC-02 Published quote versus later list correction

**Setup.** Sales quote sent on 1 March using the March list. On 10 March someone corrects the March list because the January increase was typed wrong.

**What breaks if valid-time portion-update reprices the quote.** The customer's offer changes after the fact. The commercial decision was taken under known-then prices.

**What breaks if we refuse valid time entirely.** We cannot say what the list was supposed to be in March after the correction.

**Verdict.** The list needs both questions. The quote is a decision pinned to price-as-known, closer to issue 7 than to a price row.

**Laws hit.** L1, L6, L8 if the pricing function itself changed.

### CX-PRC-03 Future increase already announced

**Setup.** XTDB's "price goes up next month." Marketing publishes the new list in advance.

**What breaks if only system time exists.** The future price cannot be current-as-known without becoming current-as-valid.

**Verdict.** Valid time in the future is essential. Knowledge time is now.

**Laws hit.** L4, S-XTDB-02.

## Accounting

### CX-ACC-01 Cancelled journal

**Setup.** ERPNext S-ERN-01. Submitted journal debit 120, credit 120. Cancel adds opposite rows. Status becomes Cancelled. Source document stays.

**What breaks if we `UPDATE FOR PORTION OF VALID_TIME` the original lines.** Reviewers cannot see what was posted first. Tax and period reports that already included the 120 lose their identity.

**Verdict.** Bitemporal portion-update is harmful on ledger-class records. Append-only reversal is essential.

**Laws hit.** L6. R2.

### CX-ACC-02 Lock date moves the write

**Setup.** Odoo S-ODO-01. Lock Everything on 31 December. A January user tries to post a December invoice. Accounting date becomes 1 January unless an exception is opened.

**What breaks if we treat that as valid-then December.** The books claim a December recognition that the lock forbade. The late invoice is a current-period fact about an earlier occurrence.

**Verdict.** Occurrence or invoice date may stay December. Recognition valid time is January. Knowledge time is January. Three stamps, two of which may coincide. Bitemporality is essential only if someone must later ask what the lock allowed us to know in December.

**Laws hit.** L4, L9. Open question 1.

### CX-ACC-03 Hard lock

**Setup.** Odoo Hard Lock is irreversible for inalterability in some countries.

**What breaks if knowledge time remains editable by a System Manager.** The legal property is gone.

**Verdict.** L3 is essential here. A superuser hatch that rewrites system time is harmful after hard lock.

**Laws hit.** L3, L9.

## Employment

### CX-EMP-01 Exclusive department with late name or dept change

**Setup.** SQL:2011 S-SQL-02 and S-SQL-03. Employee 22217 in dept 3. Marriage changes the legal name on 1 June. HR types it on 20 June. Or a transfer is recorded late.

**What breaks if only system time exists.** Payroll cannot answer "who was in dept 3 on 1 June" after the late edit without also seeing the 20 June knowledge cut.

**What breaks if intervals may overlap.** The same person appears in two departments for the overlap, unless the domain allows that.

**Verdict.** Bitemporality is essential. `WITHOUT OVERLAPS` is essential for this relator.

**Laws hit.** L1, L7.

### CX-EMP-02 Concurrent contracts

**Setup.** A person holds two part-time contracts with two legal employers in one group. Odoo `hr.version` can carry `contract_date_start` and `contract_date_end` per version.

**What breaks if the kernel applies `WITHOUT OVERLAPS` to all employment relators.** The second contract cannot be represented.

**Verdict.** The same temporal uniqueness that was essential in CX-EMP-01 is harmful here. L7.

### CX-EMP-03 Raise effective January, entered in March, payroll already paid

**Setup.** Classic late payroll correction.

**What breaks if we rewrite January payslips in place.** Published payments and tax withholdings move. ValueFlows S-VF-01.

**What breaks if we only post a March adjustment and forget valid-then.** Compensation history and "rate as of 15 January" reports stay wrong.

**Verdict.** Payslips are ledger-class. The salary assignment is an exclusive interval that needs both questions. Two types, two enforcement paths.

**Laws hit.** L1, L6, L7.

## Contracts

### CX-CON-01 Policy inserted before it takes effect

**Setup.** Kulkarni insurance example. S-SQL-01.

**What breaks if only system time exists.** The future policy is either invisible or incorrectly current.

**Verdict.** Future valid time is essential. Bitemporality becomes essential the first time the future row is corrected before the effective date.

**Laws hit.** L4, L1.

### CX-CON-02 Signed date versus start date

**Setup.** Odoo Contracts page. Start date may be blank until signed. Signed date then becomes Start Date. Those can still differ in other products. A contract signed on 15 June that starts 1 July.

**What breaks if one `date` field holds both.** Offer, signature, and performance collapse. Same family as requested versus promised versus actual.

**Verdict.** Signature is an occurrence. Performance is an interval. Knowledge time is when OS recorded the signature. Bitemporality is optional until a late correction of the start date hits a published obligation.

**Laws hit.** L5. R3.

### CX-CON-03 Temporal foreign key

**Setup.** SQL:2011 S-SQL-02. Employee assigned to dept 4 for a period in which dept 4 does not exist.

**What breaks if ordinary foreign keys ignore periods.** The assignment is referentially valid and ontologically false.

**Verdict.** Period-containment foreign keys are essential for this pair of types. They are not a reason to make every link temporal.

**Laws hit.** L7.

## Manufacturing

### CX-MFG-01 Planned, actual, recorded

**Setup.** A work order has a planned start. The machine actually starts three hours late. The operator records the job at end of shift.

**What breaks if one timestamp is stored.** Variance, capacity, and audit cannot be recovered. Open questions Q3 and Q14 already name this collapse.

**Verdict.** Three clocks. Planned is a plan property. Actual is an occurrence. Recorded is knowledge time. Bitemporal rectangles on the work order header are optional. Distinct properties are essential.

**Laws hit.** L5, R3.

### CX-MFG-02 Late scrap after the next operation consumed the lot

**Setup.** Operation 10 completes. Operation 20 consumes the output. Next day someone records scrap that actually happened during operation 10.

**What breaks if we rewrite operation 10's output in place.** Operation 20's consumption becomes unexplainable. Genealogy lies.

**What breaks if we only append scrap as-of today.** Yield reports for that shift stay wrong unless valid-then is the shift.

**Verdict.** Genealogy events are ledger-class. Valid time of the scrap is essential. Portion-update of the original output event is harmful. EPCIS error declaration or a new scrap event is the available pattern.

**Laws hit.** L5, L6, S-EPCIS-02.

### CX-MFG-03 As-built master data versus current product master

**Setup.** EPCIS ILMD. Master data in the event is as known at event time and then frozen.

**What breaks if we replay the current product specification over that event.** A later BOM change rewrites what was commissioned.

**Verdict.** This is L8 in manufacturing clothes. The event pins a specification revision, or it embeds the values. Either way, current ontology or current master is the wrong default for as-built.

**Laws hit.** L8, S-EPCIS-02.

## Ontology replay

### CX-ONT-01 Cardinality change under as-of

**Setup.** Datomic S-DAT-02. An attribute goes from many to one. Historical entities had several values.

**What breaks.** `as-of` last year under today's schema returns one value. The old meaning is gone even though the datoms exist.

**Verdict.** Time travel on facts is not replay under the old ontology. Harmful if OS advertises `as-of` as full historical explanation.

**Laws hit.** L8.

### CX-ONT-02 Function change, same facts

**Setup.** A costing Function changes how it folds the same stock events. Last year's margin report used the old Function.

**What breaks if replay uses the current Function silently.** The report cannot be reproduced. Q9 and Q19 in `docs/open-questions.md`.

**Verdict.** Pin Function revision on the Action or on the report. Not a valid-time problem.

**Laws hit.** L8.

## Falsifiers this pass did not run

- A live ERPNext or Odoo tenant with a backdated stock move and a closed period. Issues 32 and 33.
- Palantir runtime source for edit history retention. Docs only.
- OntoUML event versus situation time. Issue 37.
- A jurisdiction that forbids reversals and requires in-place amendment. Would attack L6.
- High-frequency process-data historian volumes. Would quantify the "harmful rectangles" claim for CX-series telemetry.
