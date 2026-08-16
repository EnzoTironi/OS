# Evidence

**Kind:** reference cards  
**Retrieved:** 2026-08-16  
**Decision:** per card. None accepted.

Each card states its kind. Source-system names are local. They are not OS types.

## E-001 ValueFlows layers are not one Fact

- Kind: domain evidence
- Observation: Recipe Flow, Intent, Commitment, Economic Event, and Claim form a progression from defined to potential to scheduled to realized. Economic Events describe past flows, something observed, never a potential future event. Correction is another Economic Event related by `corrects`.
- Locator: <https://www.valueflo.ws/concepts/flows/>, fetched 2026-08-16
- Attacks: M1 Event-as-Type-tag, M2 one Fact predicate for "the flow"
- Decision state: `supported` as a real split
- Runtime consequence: A generic assertion row that stores "delivery date" or "quantity moved" without a layer is the wrong unit.

## E-002 Cedar policy is not a boolean Function

- Kind: source-system artifact, used as domain evidence of an authority job
- Observation: The authorizer evaluates each policy to `true`, `false`, or `error`, then folds with default-deny, forbid-overrides-permit, and skip-on-error. Diagnostics include determining policy IDs. Skip-on-error was chosen against deny-on-error.
- Locator: <https://docs.cedarpolicy.com/auth/authorization.html>, fetched 2026-08-16
- Attacks: M1 Policy as `Function<Bool>` plus fail-closed, M2 Policy as an ordinary rule
- Decision state: `supported` that authority combination is not a Bool
- Runtime consequence: `Policy = Function + fail-closed` cannot express Cedar as specified. Issue 8 R2 already recorded this. Reconfirmed here.

## E-003 Palantir action apply is not validate and not a webhook

- Kind: source-system artifact
- Observation: An action type is a definition of object edits plus side effects. Apply is a later transaction. Validate checks parameters and submission criteria and, for performance, does not consider existing objects. Writeback webhooks run before object changes. Side-effect webhooks run after and may hide failure. Writeback can still succeed while ontology changes fail.
- Locator: Palantir Action types overview, Validate Action, and webhooks pages, cited in issue 7 E-001 through E-003
- Attacks: M1 Action as Function, M2 Action as a rule that asserts a Fact, M3 missing effect or unknown
- Decision state: `supported` as a product split. Not a kernel pick.
- Runtime consequence: Preview is not commit. Internal commit is not external outcome.

## E-004 Ontologiq unknown after dispatch

- Kind: source-system artifact plus implemented behavior, via issue 7
- Observation: Propose cannot execute. Preconditions run at propose and again at execute. Approved arguments are hashed. A lost response is `unknown`, never `failed`. Outcomes are `executed`, `effect_failed`, and `unknown`.
- Locator: issue 7 E-005 through E-007, Ontologiq `5a087250f5ee0c7ab354d27fbafd53694a8ec366`
- Attacks: M2 timeout as a false Fact, M1 Action success as Event
- Decision state: `supported` for the unknown outcome
- Runtime consequence: An Action invocation record can be known while the world change is not.

## E-005 Open Foundry commits locally, then calls out

- Kind: source-system artifact, implemented
- Observation: Local object and link edits commit, then side effects run. Rollback after a side-effect failure is a new compensating transaction. Audit and emit must not make the action appear failed.
- Locator: issue 7 E-008, Open Foundry `f29bcb9ed819be76d549183b017316908bab8585`
- Attacks: M1 one Action transaction covering the world, M2 one Fact for "the change"
- Decision state: `supported` as a failed collapse of commit and effect
- Runtime consequence: Dual-write is visible in the model. Constitution §9.

## E-006 Stripe treats a lost response as indeterminate

- Kind: domain evidence from a payment network
- Observation: Clients often do not know whether the server received the request. A 500 is indeterminate and may have side effects. Retry uses the same idempotency key. A new key after a 500 can double-charge.
- Locator: <https://docs.stripe.com/error-low-level>, <https://docs.stripe.com/api/idempotent_requests>
- Attacks: M2 failed Fact, M1 Event emitted on timeout
- Decision state: `supported`
- Runtime consequence: Unknown is a first-class outcome of an effect attempt.

## E-007 ERPNext does not delete posted history

- Kind: domain evidence, documented product behavior
- Observation: Cancel keeps original ledger rows and adds opposite rows. Cancelling does not erase the original accounting entry. Amend creates a new document. A journal can be reversed without cancelling the source. Drafts may be edited or deleted. Submitted work may not.
- Locator: <https://docs.frappe.io/erpnext/immutable-ledger-in-erpnext>, updated 2026-08-14
- Attacks: M1 Event as a mutable Type, M2 in-place Fact rewrite, M3 Role or Phase as document status
- Decision state: `supported` for append-or-compensate in posted ledgers
- Runtime consequence: Delete of a posted LedgerEntry is not a business Action.

## E-008 Accounting balance is Eval plus Bind, not one Function

- Kind: domain evidence, via issue 21
- Observation: A successful posting has debit total equal to credit total. Draft work does not affect the books. Posted history is not deleted. Cancel and reverse are different Actions. Recognition, billing, and cash are different times. Stock quantity change is not automatically a ledger Event.
- Locator: issue 21 L1, L2, L3, L4, L8, L11 at `4df1c8b44d8f21cdf23ebfa32bae247cd25aa9dc`
- Attacks: M1 Constraint as Function, M2 one Fact "posted", M3 Event-nature covering both stock and GL
- Decision state: `supported` for the splits. Encoding of close stays `undetermined` there.
- Runtime consequence: `DebitTotal` and `CreditTotal` are Eval. `BalancedJournal` is Bind at commit. `PostJournalEntry` is Action. Those three jobs share a body language only if Bind stays explicit.

## E-009 Inventory movement is occurrence. Balance is projection

- Kind: domain evidence, via issue 18
- Observation: Ownership is not custody. On-hand is not available. Reservation is a claim, not a movement. A trustworthy on-hand figure is explained by dated movements. Valuation layers are not quantity layers. Backdating changes valid time and forces later projections to move. Reconciliation posts a raise or lower event.
- Locator: issue 18 L-INV-01, L-INV-03, L-INV-04, L-INV-05, L-INV-08, L-INV-09, L-INV-10 at `de2bbe3ff71dcabb9ead699854a1b934496affbc`
- Attacks: M1 current qty as a mutable Property, M2 objects-only without events, M3 Relator for every reservation
- Decision state: `supported` for the splits
- Runtime consequence: Editing a bin without an Event is not an inventory fact. Cache is not authority.

## E-010 Employment needs an identifiable relationship-object

- Kind: domain evidence, via issue 28 and issue 3
- Observation: Employee is not a Kind of Person. Hire, end, compensation, position, suspension, and termination belong on a dated relationship that later Actions can name. Relator as a kernel primitive is not earned by HR alone. Composition from an ordinary object plus constrained links may still work.
- Locator: issue 28 L1, L3, L4 at `8856f901462c69ae706615b7d70e668043f9053b`. Issue 3 L1 through L4 at `8b9ce1ee5e5a09e556f5442de826e6062c55abfa`
- Attacks: M1 Link-only `worksFor`, M3 native Relator sort, M1 Interface `Employee`
- Decision state: relationship-object `supported`. Native Relator sort `rejected` here, `undetermined` in issue 28
- Runtime consequence: Promote, Suspend, and Terminate target the relationship, not the Person key.

## E-011 Interface is not Role

- Kind: domain evidence plus source-system artifact
- Observation: Palantir Interface describes shape and capabilities and does not prescribe a primary key. UFO Role is anti-rigid and founded by a relationship. The same string can key a Contractor and a Customer in Palantir notes. Supplier exists because a commercial relationship exists, not because a mixin was applied.
- Locator: issue 3 L2 and L4. Palantir interface docs as cited there.
- Attacks: M1 Interface as Role, M3 Role as a required engine category
- Decision state: `supported` that Interface cannot carry Role
- Runtime consequence: `Actor` and `Principal` may be shared shapes. `Supplier` may not live in that slot.

## E-012 Approval does not bind the future world

- Kind: domain evidence, via issue 67 and seed S-003
- Observation: Approval binds a judgment on stated parameters and assumptions. It does not bind later receipts, prices, or stock. Governance L-05. Ontologiq rechecks preconditions at execute. Palantir submission criteria bind the moment of submit.
- Locator: issue 67 L-05 at `037982590f250e8c80b31c5006f9511bbab03911`. Issue 7 L-003. `scenarios/README.md` S-003
- Attacks: M1 Policy evaluated only at propose, M2 approved Fact as a standing truth
- Decision state: `supported`
- Runtime consequence: Commit rebinds. Stale approval is a real refusal reason.

## E-013 Workflow is not a semantic sort

- Kind: candidate law already stated next door, reused as evidence
- Observation: Issue 67 L-12 rejects Workflow as a semantic primitive. Long-running approvals are composition of Action, Bind, and time. RFC-0001 already left Workflow out.
- Locator: issue 67 L-12. RFC-0001 "Concepts intentionally NOT proposed"
- Attacks: any fifth core that adds Workflow to recover M1 losses
- Decision state: `supported` as a non-addition
- Runtime consequence: Do not revive Pack, Compiler, or Workflow to paper over a missing Bind or Event.

## E-014 Cedar, OpenFGA, and OPA are an enforcement job

- Kind: source-system artifact
- Observation: Issue 67 L-13 and issue 8 say these engines evidence a job, not a kernel pick. OpenFGA Check is graph reachability. OPA `allow` is an ordinary document. Cedar combination is in the authorizer, not in each policy body.
- Locator: issue 67 L-13. Issue 8 reduction R1 losses 1 and 2
- Attacks: M1 Policy primitive as "whatever Cedar is", M3 Policy as a UFO-like sort
- Decision state: `supported` that picking Cedar is not a metamodel decision
- Runtime consequence: Wave B may choose an engine. Wave A must name obligation, locus, and algebra.

## E-015 Rival values survive in some systems and die in others

- Kind: divergence
- Observation: Foundry merge strategies delete the losing property value from the object. ValueFlows and ERPNext keep prior economic records and append. PROV revises or invalidates entities with fixed aspects. Issue 4 F3 and F5. No convergence on a Fact type. Convergence on layers, append-correction, and property-scoped source ownership.
- Locator: issue 4 falsification note and wave-a contract at `905baa0c99f09fd445b9f1bb0eee5435fa814be3`
- Attacks: M2 Fact as the converged unit, M1 object snapshot as enough for contradiction
- Decision state: `supported` as non-convergence on Fact
- Runtime consequence: Experimental assertion rows may exist. They are not a semantic decision.

## E-016 Some current values are primary facts. Remainders are derived

- Kind: domain evidence, via issue 12
- Observation: Reconstructability is required. Pure event sourcing is not. Commitments and official acts can be stored current facts. Arithmetic remainders are derived. Status that names a decision is stored. Status that names a predicate is derived. Late facts force later derived values to move or freeze.
- Locator: issue 12 CL-1 through CL-7 at `db8d2840647f0e01e49759edb3625895bb6f240a`
- Attacks: M2 every object is only a projection, M1 every property is mutable truth
- Decision state: `supported`
- Runtime consequence: M2 dies if it forbids primary current facts. M1 dies if it forbids explained remainders.

## E-017 Valid then is not known then

- Kind: domain evidence, via issue 5
- Observation: Two questions. Universal bitemporal rows are not a domain law. Knowledge time is runtime-owned. Valid time is a domain value. Point occurrence and validity interval may differ.
- Locator: issue 5 L1 through L5 at `a967d4de3164b41098055625d08cc492a7ee3a24`
- Attacks: M1 one timestamp Property, M2 every Fact must carry four timestamps, M3 Event-nature as the only clock
- Decision state: `supported` for the two questions. Universal rows `rejected` as a law
- Runtime consequence: Time is not a new sort. It is a declared clock on some Types, Events, and assertions.

## E-018 Money and quantity are values, not metamodel sorts

- Kind: domain evidence, via issue 62
- Observation: Money is amount plus currency. Binary float is illegal for money. Quantity is magnitude plus unit. Currency conversion is a dated fact, not a unit change.
- Locator: issue 62 L-NUM-01, L-MNY-01, L-QTY-01 at `7457c00312a5686092d8c202b26c6bc92a9f7911`
- Attacks: M3 Quality as a required engine category, RFC Property as a base sort
- Decision state: `supported` as value types. `rejected` as extra metamodel sorts
- Runtime consequence: Property dies as a primitive. The type system still needs decimal money and unit-bearing quantity.

## E-019 Actor, principal, and party are different identities

- Kind: domain evidence, via issue 11 and issue 28
- Observation: Every Action invocation has a concrete Actor. Workload identity is not a Party. SoftwareAgent is not a Party by default. "As" and "on behalf of" differ. Person, employment, post, and principal differ. Issue 55 L-004 agrees.
- Locator: issue 11 L1 through L4. Issue 28 L13. Issue 55 L-004
- Attacks: M1 one Interface `Actor` covering all four, M3 Agent as a UFO Kind
- Decision state: `supported` for the splits. Agent as a kernel sort `rejected` in RFC-0001 already
- Runtime consequence: Shared shape is fine. Shared identity key is not.

## E-020 Issue 8 already rejected one Computation and Q9-as-written

- Kind: candidate law from an independent foundation note
- Observation: R0 one Computation is rejected as a semantic core. R1 Function plus Gate loses algebra, search, triggers, and purity-as-boundary. R2 Q9 collapse is not accepted. R3 Eval, Search, Bind is their working hypothesis.
- Locator: issue 8 `reduction.md` at `d064a310579ac8bc78d744e089c7eb5076dfd585`
- Attacks: M1 Function as the only logic sort
- Decision state: R0 `rejected` here too. R3 reused as input to M4, still `hypothesis`
- Runtime consequence: This folder does not reopen MiniZinc. Search stays a possible Eval purity with a mandated status type, not a seventh sort.

## E-021 Issue 7 already rejected Action equals Event

- Kind: candidate law from an independent foundation note
- Observation: L-005 Event is not Action, `supported`. L-002 unknown after dispatch, `supported`. L-008 Effect is not a kernel type, `hypothesis`. C-006 leaves Event as kernel type, interface, or Fact shape `undetermined`.
- Locator: issue 7 at `08676a1040780eed586288c1a43fa40535e2111d`
- Attacks: M1 Event interface, M2 Event as Fact class
- Decision state: Action versus Event `supported`. Event encoding `undetermined` there, `rejected` as Type-plus-tag here for enforcement reasons. See L-P-04.
- Runtime consequence: I am allowed to harden their undetermined encoding question. I am not allowed to pretend they already picked a sort.

## E-022 One enterprise vocabulary already died. The metamodel did not

- Kind: candidate law from kill test 55
- Observation: One Product, Customer, or Inventory type for the organization is `rejected`. A shared Action, Event, Fact, Constraint vocabulary was not killed. The shareable kernel is the metamodel plus surviving kinds, not role types.
- Locator: issue 55 L-001, L-009, L-012, R-006 at `5f4233579cf3057783775126afa64c39ed631353`
- Attacks: politeness toward Constraint and Fact
- Decision state: I accept their kill of one vocabulary. I do not accept their leftover Constraint sort. See L-P-06.
- Runtime consequence: Context ontologies can still share a smaller metamodel than issue 55 listed.

## E-023 Foundry objects hide losing values

- Kind: source-system artifact
- Observation: User edits win or most recent timestamp wins. Losing values leave the object. Property multiplicity is forbidden. One property, one datasource.
- Locator: issue 4 source artifacts. <https://palantir.com/docs/foundry/object-edits/how-edits-applied/>
- Attacks: M1 object snapshot as the information model
- Decision state: `supported` as a product choice that fails seed S-011
- Runtime consequence: If OS copies this index behavior, contradictory observations become unspeakable.

## E-024 Dual-write and outbox do not mint a business Event

- Kind: source-system artifact
- Observation: A database commit and an external message are not one atomic fact. An outbox makes the intent to notify atomic with the local commit. Delivery remains at-least-once. Consumers must be idempotent.
- Locator: Richardson outbox pattern, cited in issue 7 E-011
- Attacks: M2 outbox row as Economic Event, M1 Action success as observed outcome
- Decision state: `supported`
- Runtime consequence: Intent to notify is an internal commit. Observed economic or carrier outcome is a later Event.
