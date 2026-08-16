# Counterexample cards

**Kind:** counterexample, with domain evidence and the law under attack  
**Decision state:** each card says whether it currently bounds a law or would flip it if found  
**Issue:** https://github.com/EnzoTironi/OS/issues/59

These cards are for later corpus and domain agents. A pass here does not invent a company that was not in the sources.

## CX-1. Balanced journal as independent facts

**Attacks.** K1, K3, K4

**Setup.** A writer asserts debit 120 against Expense and, in a later commit, credit 120 against Bank. A second writer asserts only the debit.

**Expected if Fact is fundamental.** Both commits succeed. A later constraint sweep repairs balance.

**Observed.** ERPNext posts and reverses at voucher grain. ValueFlows requires an event that already carries the economic effect. Partial line commits are not the published write.

**Status.** Bounds K1 and K3. Does not flip them.

## CX-2. Portion-update of a posted invoice

**Attacks.** K4, K6

**Setup.** A posted sales invoice used last month's tax. An operator runs `FOR PORTION OF VALID_TIME` and rewrites the valid-time slice.

**Expected if ubiquitous bitemporality is honest correction.** The current system row now shows the new tax. History exists only as superseded portions.

**Observed.** ValueFlows and ERPNext keep the original published effect and add a credit note, reversal, or `corrects` event. Odoo will not let the rewrite through a lock.

**Status.** Portion-update is `rejected` for ledger-class types. It remains a legal SQL:2011 operation on non-ledger application-time tables.

## CX-3. Exclusive seat versus dual contracts

**Attacks.** K10

**Setup.** One person, two concurrent employments, both paid.

**Expected if temporal exclusivity is a kernel default.** The second assignment is refused.

**Observed.** SQL:2011 makes `WITHOUT OVERLAPS` optional. Real HR systems allow dual contracts. Exclusive seats still need the constraint.

**Status.** Flips any law that says every dated relationship is exclusive. Supports K10.

## CX-4. Item Price typo

**Attacks.** K6, K8

**Setup.** A list price was entered as 99 instead of 9.90 at 09:00. A clerk fixes it at 09:05. No quote used the bad price.

**Expected if every row is bitemporal.** The type stores four timestamps and answers `known then` for 09:02.

**Observed.** ERPNext Item Price exposes Valid From and Valid Upto. No manual in this pass asks `known then` for an unused typo.

**Status.** Supports rejecting mandatory system time on price lists. If a regulated price-filing domain requires `known then` even for unused values, move that type to optional dual time. Not found here.

## CX-5. SQL Server patient location

**Attacks.** K5, K7, K8

**Setup.** A patient moved wards at 02:00. The row is entered at 08:00. Operators need both times.

**Expected if system-versioned tables are enough.** `ValidFrom` is 02:00.

**Observed.** SQL Server sets period columns from the transaction clock. Application time is not implemented. The honest model is a domain `moved_at` plus system time, or a full application-time period.

**Status.** Supports K5 and K8. Shows K6. System-time products are not a complete temporal semantics.

## CX-6. Datomic count as-of

**Attacks.** K5, K11

**Setup.** Dilithium `item/count` changes across months. A later schema change makes `item/count` cardinality-one after it had been multi-valued in history.

**Expected if `as-of` is `valid then`.** The 2014-01-01 view is the warehouse count as of that night, under the old meaning.

**Observed.** Datomic `as-of` is transaction time. Schema of the current basis is used. Historical multi-values collapse to one value after the cardinality change.

**Status.** Supports K5 and K11. A caller who treats Datomic `as-of` as valid-world stock will mis-explain S-007.

## CX-7. XTDB current-path majority

**Attacks.** K6, K13

**Setup.** A product puts four temporal columns on every table and claims this is required for correctness.

**Expected if pervasive bitemporality is cheap and necessary.** Most queries mention both axes. No extra current index is needed.

**Observed.** XTDB documents ordinary SQL as the common path, current-time indexes for that path, and historical indexes on the side. The product thesis is ubiquitous storage with atemporal defaults.

**Status.** Does not flip K6. It is the strongest product for optional dual time with cheap now-reads. Treat as a Wave B candidate, not as a semantic default.

## CX-8. Palantir merge deletes the loser

**Attacks.** K1, K14, issue 4 Class D

**Setup.** Two sources report different on-hand quantities for one SKU, location, and lot at one valid time.

**Expected if the object snapshot is enough.** The index keeps both values with provenance.

**Observed.** Foundry maps one property to one datasource. User-edits-win or most-recent-timestamp leaves one value. The loser leaves the object. Edit history can be dropped.

**Status.** Object snapshots are enough for many operational reads and fail historical rivalry. Supports rejecting Fact as the object model, and supports keeping rival records when Class D appears. Issue 4 owns the authority model.

## CX-9. Odoo lock moves the posting date

**Attacks.** K12, K5

**Setup.** A vendor bill for last year arrives after Lock Everything.

**Expected if valid time is freely writable.** The bill posts in the closed year.

**Observed.** Odoo sets the accounting date to the day after the lock. Recognition time and occurrence time part. The lock is policy.

**Status.** Supports K12. A model that has only one date field cannot say "this bill is for last year and was recognized this year."

## CX-10. EPCIS ILMD replay

**Attacks.** K9, K14

**Setup.** A commissioning event carries as-built master data. Two years later the product master has a new weight.

**Expected if current master plus eventTime is enough.** Replay yields the as-built.

**Observed.** EPCIS says ILMD is permanently part of the event as of event time.

**Status.** Supports K9 and K14. Current-state projection of the product is the wrong explanation.

## CX-11. Event sourcing the whole ontology

**Attacks.** K1, K13

**Setup.** Every display name, every ticket flag, every sensor point, and every journal is an event-sourced aggregate.

**Expected if Fact or event history is the fundamental unit.** One pattern fits.

**Observed.** Young. The largest failure is using event sourcing everywhere. InfoQ. A whole system based on event sourcing is an anti-pattern. Fowler. Not every system can keep state as replay. Snapshots exist because replay is slow.

**Status.** Bounds K1 and K13. The pattern stays useful inside ledger-class and other earned boundaries.

## CX-12. What would restore the attractive hypotheses

**Attacks.** the issue 59 claims themselves

**Would restore Fact as fundamental.** See K1 counterexample.

**Would restore pervasive bitemporality.** A domain where every property is independently asked both questions, portion-update is the honest correction, current reads stay cheap without extra indexes, and ledger identity survives portion splits.

**Status.** Not found in this pass. Decision on the two over-generalizations remains `rejected`.
