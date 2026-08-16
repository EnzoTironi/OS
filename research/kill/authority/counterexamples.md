# Counterexamples

**Kind.** counterexample  
**Fetched.** 2026-08-16  
**Decision.** per record

### X-001 All four dates are one promise

- Targets: L-001, RED-01
- Setup: Customer, sales, planning, and carrier all repeat the same promised delivery date. No one is requesting, planning, or observing a different day.
- Falsifying result: The four-date split would invent distinctions the domain does not have.
- Observed result: not run. The manuals still name promise and shipment as different documents even when the calendar day matches. E-006, E-007.
- Consequence: Narrow L-001. Equal numbers can still be different relations. The split is about relation type, not about numeric inequality.
- Decision state: `hypothesis`

### X-002 Book and count are secretly different properties

- Targets: L-002, IRR-01
- Setup: Someone restates WMS 87 versus ERP 92 as reserved versus on-hand, or as two locations.
- Falsifying result: Every IRR-01 case in the first inventory corpus reduces to RED-04 or RED-05.
- Observed result: not run against cloned code. The public manuals still keep On Hand and Counted as two inputs to one adjustment of one location. E-008, E-009.
- Consequence: Leave L-002 `supported` on the manuals. Corpus issues 32 and 33 should try to break it with tests.
- Decision state: `undetermined` as a kill. `supported` that the manuals treat the pair as same-property inputs.

### X-003 Filed canonical number must exist as its own object

- Targets: L-003, L-005
- Setup: A regulator or auditor requires a stored canonical quantity that is not reconstructible from Decisions plus inputs.
- Falsifying result: Projection plus Decision record is legally insufficient.
- Observed result: not found in this pass. IAS 8 wants restated comparatives and disclosure of the error, which is still a later record. E-014.
- Consequence: Leave L-003 `hypothesis`. If found, the mechanism grows by one durable Decision object, not by a winner-merge layer.
- Decision state: `undetermined`

### X-004 Foundry merge is enough for operations

- Targets: L-003
- Setup: Operators never need the losing ERP value after a user edit wins.
- Falsifying result: Dropping the loser from the object causes no audit or reconciliation failure.
- Observed result: E-005 drops the loser from the object. E-008 and E-009 keep both inputs. The two product families disagree.
- Consequence: Open disagreement D-001. Do not average them.
- Decision state: `open` as a product split. Not a reason to enlarge OS.

### X-005 One object-level source always wins

- Targets: L-004
- Setup: A mature domain where every property of an object has the same authoritative source for every Action.
- Falsifying result: Property-scoped and Action-scoped authority is unnecessary.
- Observed result: Foundry already maps properties to different datasources. SAP posts different valuations to different ledgers. E-004, E-015.
- Consequence: L-004 stays `hypothesis` but the counterexample is weaker after those two sources.
- Decision state: `hypothesis`

### X-006 Calibrated posterior is legally sufficient

- Targets: L-006
- Setup: A regulated measurement whose uncertainty interval is accepted as the release decision with no human or policy disposition.
- Falsifying result: Confidence settles the Action.
- Observed result: not found. ERPNext still has a user-set inspection status. E-013.
- Consequence: Leave L-006 `hypothesis`.
- Decision state: `undetermined`

### X-007 Safe automatic merge of party masters

- Targets: L-007
- Setup: A source that merges Customer and Supplier into one master and still preserves tax, credit, portal, and offset behavior without a link Decision.
- Falsifying result: Identity binding is not a separate Decision.
- Observed result: ERPNext refuses the merge. E-016.
- Consequence: L-007 stays `hypothesis`. Other ERPs were not checked.
- Decision state: `undetermined`

## Disagreements

### D-001 Merge-and-drop versus append-and-decide

- Claim A: `issue-0060-kill-authority#L-003`
- Claim B: Foundry user-edits-win and recency merge in E-005
- Conflict: Different observed product behavior. Foundry elects one property value in the index. ERPNext, Odoo, ValueFlows, and IAS 8 append a later record and keep the earlier one speakable.
- Evidence for A: E-002, E-008, E-009, E-014
- Evidence for B: E-005
- Possible explanation: Application UX versus audit and fiscal practice.
- Resolution test: A domain where dropping the loser is lawful for stock, tax, and quality release.
- Status: `open`
- Resolution: unresolved

### D-002 Issue 4 pointed at the wrong kill-test number

- Claim A: this folder, issue 60
- Claim B: `research/foundation/facts/disagreement-classes.md` on `origin/cursor/issue-4-foundation-cfd8` at `905baa0c99f09fd445b9f1bb0eee5435fa814be3`, which names kill test 59 as the place to press Class D
- Conflict: Issue numbering. The assigned kill test for explicit authority is 60.
- Evidence for A: https://github.com/EnzoTironi/OS/issues/60
- Evidence for B: sibling note via `git show` only
- Possible explanation: Backlog numbering shifted while issue 4 was written.
- Resolution test: none needed for semantics
- Status: `open`
- Resolution: unresolved. Recorded so a synthesis agent does not follow the stale pointer.
