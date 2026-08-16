---
issue: 51
kind: reference
fetched: 2026-08-16
decision_state: hypothesis
---

# Generation dimensions

Reusable generator recipes. Each recipe is a research artifact, not a program. Kind is tagged on the recipe and on the source echo.

A generator is a function from a choice sequence to a scenario that matches [dsl.md](dsl.md). Shrink walks that same function. See E3 and E4.

Do not emit a happy path unless it sets up a later attack. Pairwise combination is the default combinator. A single-dimension run is a smoke check, not coverage.

Source echoes are differential oracles. They are not correct semantics. E7.

## How to use a recipe

1. Bind the ontology fragment under test. Name the candidate laws.
2. Draw choices for the recipe fields.
3. Interleave with one other recipe unless the card says singleton.
4. Attach oracles from the recipe and from the law cards.
5. If a law fails, shrink choices, then isolate against a neighbor that drops one dimension. E5.

## D-01. Partial quantities

**Kind.** generator recipe  
**Decision state.** `supported` as a required dimension  
**Choices.** ordered qty, shipped qty, invoiced qty, paid qty, returned qty, scrap qty, each independently in `0..ordered` except over-delivery which may exceed.  
**Must keep independent.** leftover demand, leftover bill, leftover settle.  
**Oracle.** leftover demand equals ordered minus fulfilled events, not minus invoices. Sibling o2c S-O2C-02, S-O2C-11. Seed S-002.  
**Source echo.** ERPNext multiple Delivery Notes. Odoo backorder.  
**Falsifies.** a single `status` or a single remaining qty that cannot answer those three leftovers.

## D-02. Backdating

**Kind.** generator recipe  
**Decision state.** `supported` as a required dimension  
**Choices.** valid time, known time, with `known >= valid` or `known < valid` as an explicit late-record case. A later movement already posted after valid time.  
**Must keep independent.** stock-as-known-then, stock-as-now-believed-for-then. Seed S-007. Sibling L-INV-08.  
**Oracle.** metamorphic. Inserting a late receipt changes believed-then and does not rewrite known-then. E6.  
**Source echo.** ERPNext Posting Date versus creation. Repost Item Valuation. E9. Closed period may refuse the action. That refusal is also a case.  
**Falsifies.** one timestamp field.

## D-03. Cancellation timing

**Kind.** generator recipe  
**Decision state.** `supported` as a required dimension  
**Choices.** cancel relative to draft, submitted commitment, fulfillment event, claim, settlement, period close.  
**Must keep independent.** the original occurrence, the compensating occurrence, the blocked-cancel case.  
**Oracle.** after irreversible downstream events, cancel is refused or a new compensating action is required. History stays. Seed S-010. Sibling S-O2C-07.  
**Source echo.** ERPNext cancel adds reversal rows. Odoo Return plus credit note. E9, E10. Divergence is about the verb.  
**Falsifies.** delete-in-place of a posted document.

## D-04. Duplicate and reordered events

**Kind.** generator recipe  
**Decision state.** `supported` as a required dimension  
**Choices.** same external id twice, same payload twice with different ids, permutation of a causal pair, delayed first copy after the second already applied.  
**Must keep independent.** occurrence identity, message identity, observation identity.  
**Oracle.** applying the same occurrence twice does not double quantity. Reordering two observations must not mint a second occurrence. Sibling S-INV-07. Constitution rule 9 for unknown.  
**Source echo.** integration duplicates. Not fetched as a named ERPNext test this session. Cell `undetermined` for a file pointer.  
**Falsifies.** treat every inbound message as a new Event.

## D-05. Ownership and custody

**Kind.** generator recipe  
**Decision state.** `supported` as a required dimension  
**Choices.** owner, custodian, location, independently. Actions drawn from ValueFlows `transferAllRights`, `transferCustody`, `move`. E11.  
**Must keep independent.** Q-OWNED, Q-ONHAND, place. Sibling L-INV-01, L-INV-02, L-INV-13.  
**Oracle.** consignment sale lowers custodian on-hand and owner rights, not a single party field. S-INV-04.  
**Source echo.** ERPNext Location Type Vendor is a source artifact. Do not promote it.  
**Falsifies.** one party on a quantity row.

## D-06. Lots and serials

**Kind.** generator recipe  
**Decision state.** `supported` as a required dimension  
**Choices.** grain in {fungible, lot, serial}, transform versus transfer versus pack, split across customers.  
**Must keep independent.** identity, quantity, transformation participation. Sibling L-INV-06, L-INV-11. Seed S-008. EPCIS Transformation versus Aggregation. E12.  
**Oracle.** recall can name output lots. A serial never has qty greater than one unless reclassified.  
**Source echo.** ERPNext batch and serial validations on backdate. E9.  
**Falsifies.** lot and serial as two labels on one type.

## D-07. Multi-currency

**Kind.** generator recipe  
**Decision state.** `hypothesis` as a universal law. `supported` as a required attack  
**Choices.** transaction currency, company currency, rate at commitment, rate at claim, rate at settlement, optional revaluation date.  
**Must keep independent.** money-in-currency, money-in-base, realized difference, unrealized revaluation.  
**Oracle.** settlement at a new rate posts a difference. It does not rewrite the claim's original rate. S-ERPN-LED foreign-currency paragraph.  
**Source echo.** ERPNext Exchange Rate Revaluation is a source document name.  
**Falsifies.** one amount field with a silent latest rate.

## D-08. Tax changes

**Kind.** generator recipe  
**Decision state.** `hypothesis`  
**Choices.** rate at offer, rate at accept, rate at invoice, rate at fiscal period boundary, late law change known after invoice.  
**Must keep independent.** offered tax, committed tax, invoiced tax, later correction.  
**Oracle.** a rate change after accept does not silently mutate the accepted offer. Correction is a new claim or a dated amendment. Sibling S-O2C-06 is the price analog.  
**Source echo.** Brazilian fiscal is issue 29. Not opened this session. Cell `undetermined` for first-party tax-change docs.  
**Falsifies.** a single tax amount on the order header.

## D-09. Substitutions

**Kind.** generator recipe  
**Decision state.** `supported` as a required attack  
**Choices.** committed resource, issued resource, allowed-alternate flag, return of the substitute.  
**Must keep independent.** commitment identity, event resource, recall walk. Sibling S-O2C-05, S-M02.  
**Oracle.** as-built consume names the substitute. Recall of the original lot does not include this output unless the substitute lot is related.  
**Source echo.** ERPNext Work Order alternate issue. Cited by manufacturing sibling, not re-opened here.  
**Falsifies.** store only the original item id on the consume.

## D-10. Concurrent decisions

**Kind.** generator recipe  
**Decision state.** `supported` as a required dimension  
**Choices.** two actions on the last N units, interleaving of read and commit, optional stale snapshot.  
**Must keep independent.** each action's read set, the exclusive claim, the loser as still-a-commitment. Sibling S-INV-01.  
**Oracle.** at most one exclusive claim succeeds for the same serial or the same reserved qty. The loser is refused or becomes Q-NOT-ATP, not a silent overwrite.  
**Source echo.** ERPNext reserved serial cannot be delivered to another order. Sibling S-O2C-15.  
**Falsifies.** last-write-wins on reserved quantity.

## D-11. Stale approvals

**Kind.** generator recipe  
**Decision state.** `supported` as a required attack  
**Choices.** proposal parameters, assumed facts, approval time, intervening event, commit time. Seed S-003. E14.  
**Must keep independent.** what was approved, what is true at commit, the revalidation result.  
**Oracle.** commit re-reads. If assumed inventory moved, the action is refused or replanned. Approval of a hash of parameters is not approval of a later world.  
**Source echo.** Ontologiq propose, approve, re-read, execute. S-LAND.  
**Falsifies.** approval as a sticky boolean on the action row.

## D-12. Offline and unknown external outcomes

**Kind.** generator recipe  
**Decision state.** `supported` as a required dimension  
**Choices.** request leaves, timeout, later observed success, later observed failure, neither. Seed S-004.  
**Must keep independent.** attempted action, unknown effect, later observation. `docs/open-questions.md` item 5.  
**Oracle.** timeout is not failure. Retry is unsafe until an idempotency key or a reconcile observation exists. Constitution rule 9.  
**Source echo.** Open Foundry local-then-external commit in S-LAND. Not re-fetched.  
**Falsifies.** map timeout to failed.

## D-13. Contradictory observations

**Kind.** generator recipe  
**Decision state.** `supported` as a required dimension  
**Choices.** two or more claims about one property, or two properties that were collapsed under one source field name, each with agent and activity. Seed S-011. E13.  
**Must keep independent.** each claim, its provenance, accepted operational state if any.  
**Oracle.** the scenario can answer what each source said. A winner, if any, is policy, not overwrite. Induction contradiction types. E15.  
**Source echo.** ERP promised date versus spreadsheet versus chat.  
**Falsifies.** last inbound write wins.

## D-14. Ontology revisions

**Kind.** generator recipe  
**Decision state.** `supported` as a required attack  
**Choices.** revision at approve, revision at commit, later revision of the function or policy, audit query years later. Seed S-012. Manufacturing S-M01.  
**Must keep independent.** historical definition, current definition, the pinned revision on the action.  
**Oracle.** the auditor can explain the old discount without replaying today's rule. `docs/open-questions.md` item 19.  
**Source echo.** none fetched as a vendor ontology-pin feature. Palantir mapping is not this. Induction L-IND-11.  
**Falsifies.** replay history under current functions and call that audit.

## D-15. Adversarial agent behavior

**Kind.** generator recipe  
**Decision state.** `hypothesis` as a separate dimension. Overlaps D-10, D-11, D-13  
**Choices.** agent proposes out-of-policy parameters, uses stale tools, double-submits, acts after revocation, mixes `as` and `on behalf of`. `docs/open-questions.md` items 10 and 11.  
**Must keep independent.** principal, actor, delegated purpose, tool output, committed action.  
**Oracle.** a tool result is a claim, not a fact. Commit is a governed action. Prompt text is not a hidden policy.  
**Source echo.** none as a first-party ERP page. Seed suite has no dedicated agent-adversary card.  
**Falsifies.** treat an agent message as an Event.

## Combinators

**Kind.** generator recipe  
**Decision state.** `hypothesis`

- **Pairwise.** Default. Cover each pair of D-01 through D-15 at least once per fragment.
- **Timed interleave.** Draw a permutation of two action attempts and one observation.
- **McKeeman level 7.** Start from a sibling seed card and mutate one dimension. S-DIFF level 7.
- **Validity wrapper.** The generator refuses worlds that collapse two named facts into one field. Shrink must keep that refusal. E3.

## Coverage metrics

These are research scores. They do not need a process.

| ID | Metric | How to compute | Not this |
| --- | --- | --- | --- |
| M1 | Dimension hit | Fraction of D-01 through D-15 that produced at least one scenario for the fragment | Statement coverage |
| M2 | Pairwise hit | Fraction of dimension pairs exercised | Random count of cases |
| M3 | Distinction hit | Fraction of targeted law IDs that a scenario could have broken | Concept count |
| M4 | Competency hit | Fraction of Gruninger questions the fragment can still answer after the attack | Lookup-only questions. E8 |
| M5 | Oracle disagreement | Count of typed disagreements across differential oracles | Majority-is-right. E7 |
| M6 | Shrink ratio | Steps and choice-length before versus after internal reduce | Human "looks smaller" |
| M7 | Isolation | Whether `dd` against a one-dimension-dropped neighbor keeps the same failing law | A different error after shrink. E3 |
| M8 | Homonym catch | Whether Work Order or `delivery_date` style collisions stay typed | String inequality |

A run that only raises M1 has not attacked the ontology. M3, M4, and M7 are the scores that change architecture.
