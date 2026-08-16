# Candidate laws

**Kind.** candidate law. Each card names counterexample and runtime consequence.
**Fetched.** 2026-08-16
**Decision.** per law. Never `accepted`.

These are the smallest claims that explain the evidence. They are not OS primitives. RFC-0001 was not edited.

## L-001 A mapping is not a removed model

**Claim.** Introducing a canonical type that maps ERP, marketplace, and spreadsheet fields adds a model. It deletes nothing until those writers close.

**Kind.** candidate law
**Evidence.** E-001, E-009, E-010, E-015, E-018, E-027
**Decision.** `supported`

**Counterexample that would reject it.** A production ontology that maps three writers onto one type and then deletes the three source models while the writers continue, without a remaining mapping table.

**Runtime consequence.** Count models after adoption, not before. A new Object Type with three datasource keys is evidence of added duplication.

## L-002 A replica without exclusive write is a second fact

**Claim.** If anyone else can still write the grain, a stored ontology row is a rival record, not a view.

**Kind.** candidate law
**Evidence.** E-002, E-004, E-009, E-011, E-012, E-016
**Decision.** `supported`

**Counterexample.** A stored ontology row that is mechanically unable to diverge from its source, including across `doInsert`-class bypass, pause windows, and webhook timeouts.

**Runtime consequence.** Stored foreign rows need the same provenance and knowledge time as any other observation. They must not be presented as the only current state.

## L-003 Virtualize when the source remains system of record

**Claim.** If OS is not the only writer, the default placement is a schema projection that runs source logic on write and stores no independently editable row.

**Kind.** candidate law
**Evidence.** E-006, E-008, E-014, E-017, E-018
**Decision.** `supported`

**Counterexample.** A foreign SoR grain that cannot be read or lightly written except by copying it, and where the copy still has only one writer.

**Runtime consequence.** Virtual types expose source identity, not an OS-minted surrogate that later needs CVI-style link tables.

## L-004 Materialize only projections that are not independently edited

**Claim.** A local index, search document, or join snapshot may exist if it is derived, stale-tolerant, and unable to win against the source on edited properties.

**Kind.** candidate law
**Evidence.** E-002, E-004, E-007, E-014
**Decision.** `supported` for the restriction. `hypothesis` for when a projection is required.

**Counterexample.** A projection that users edit in place and that later source updates must not override, while the source remains SoR. That is Palantir's default merge, and it is L-002, not this law.

**Runtime consequence.** If a projection exists, the engine must be able to answer "what did the source say?" after the projection moved. User-edits-win is forbidden on virtualized grains.

## L-005 Refuse legally issued identities

**Claim.** OS must not mint or own a second identity for a document or posting whose legal existence is issued elsewhere.

**Kind.** candidate law
**Evidence.** E-021, E-020
**Decision.** `supported` for NF-e. `hypothesis` for bank postings and marketplace order ids, which follow the same shape and were not fully retrieved.

**Counterexample.** A jurisdiction where storing a copy of the XML in an operational system is itself the authorization of use.

**Runtime consequence.** Fiscal and payment Actions may attach a correspondence to a foreign protocol or statement line. They must not create an editable OS object that shares that identity.

## L-006 Refuse grains the mapping would collapse

**Claim.** If two source fields are different facts, a canonical property that holds one value is a new error, not a reduction.

**Kind.** candidate law
**Evidence.** E-019, E-022, E-023, E-024, E-027, `docs/open-questions.md` question 3 caution on `delivery_date`
**Decision.** `supported`

**Counterexample.** A mature domain where requested, promised, planned, and actual times are one field with no audit loss. Issue 16 did not find one.

**Runtime consequence.** Composition fails closed on type or grain conflict. Silent coercion of `Event.timestamp` Int versus String is the bug.

## L-007 Bypass is an expected writer

**Claim.** Source users, batch jobs, machines, and legal contingency paths will write the SoR without passing an OS Action. Designs that treat bypass as rare are false.

**Kind.** candidate law
**Evidence.** E-012, E-004, E-016, E-021, scenario S-004
**Decision.** `supported`

**Counterexample.** A company where every ERP, marketplace, bank, fiscal, machine, and spreadsheet write is mechanically impossible except through OS, and that closure is evidenced, not hoped.

**Runtime consequence.** Reconciliation is a first-class Action over rival records. It is not a background sync that drops the loser.

## L-008 There is no two-phase commit with a foreign SoR

**Claim.** An OS Action and a foreign write can diverge. The model must represent `unknown`, later observation, and compensating records.

**Kind.** candidate law
**Evidence.** E-003, E-005, E-011, E-013, scenario S-004
**Decision.** `supported`

**Counterexample.** A documented distributed transaction that commits OS and an independent ERP, marketplace, bank, or SEFAZ in one atomic outcome under timeout.

**Runtime consequence.** Writeback-before-local and side-effect-after-local are both incomplete. Persist the attempt, keep the outcome unknown, reconcile with evidence. Do not pick a runtime bus in Wave A.

## L-009 OS becomes system of record only after exclusive write and legal capacity

**Claim.** Surfaces, agents, and a nicer type system do not move SoR. Exclusive write plus legal capacity do.

**Kind.** candidate law
**Evidence.** E-008, E-014, E-021, E-028, lifecycle conditions
**Decision.** `supported`

**Counterexample.** A grain OS does not exclusively write and does not legally issue, which regulators and counterparties still treat as OS-owned.

**Runtime consequence.** SoR is a per-grain flag with an evidence test, not a deployment mode for the whole tenant.

## L-010 Product create and Sales Order ownership are per grain, not per screen

**Claim.** The first form that typed a SKU or an order number is not the owner of specification, listing, commitment, fulfillment, claim, or cash.

**Kind.** candidate law
**Evidence.** E-022, E-023, E-026
**Decision.** `supported`

**Counterexample.** A lawful flow where one stored document is simultaneously specification, marketplace listing, promised commitment, stock movement, fiscal document, and settlement, and where independent systems do not re-issue those facts.

**Runtime consequence.** Actions name the grain. `CreateProduct` and `CreateSalesOrder` as single verbs are source-shaped and fail this law.

## L-011 Blanket materialization creates more duplication than it removes

**Claim.** If OS copies Product, party, and order while ERP, marketplace, bank, fiscal, machine, and SaaS writers remain, the net is one new model, N new replicas, and a sync office. That outweighs the ontology benefit.

**Kind.** candidate law
**Evidence.** E-009 through E-016, E-004, E-028
**Decision.** `supported`

**Counterexample.** A production ontology that materialized those grains under live foreign writers and then deleted the source models, the mappings, and the sync office, while auditors still found one fact per grain.

**Runtime consequence.** Wave B must not start from a Funnel-like default. Refuse and virtualize first. Own later, per L-009.

## L-012 A refuse-by-default hybrid can still carry the ontology benefit

**Claim.** One Action for human, agent, and API can virtualize a foreign write or own an OS-native grain. The benefit does not require a golden record.

**Kind.** candidate law
**Evidence.** E-008, E-014, E-017, `docs/thesis.md` "One model, many surfaces"
**Decision.** `hypothesis`

**Counterexample.** Every useful cross-surface Action needs a materialized current object that wins against the source. Then L-011 applies and the thesis's surface claim dies with the replica.

**Runtime consequence.** Action dispatch names the owner. Virtualized Actions are not allowed to persist an overlay that later merge rules can prefer to the source.
