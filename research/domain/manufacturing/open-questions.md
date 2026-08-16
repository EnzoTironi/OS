---
issue: 19
kind: reference
fetched: 2026-08-16
decision_state: undetermined
---

# Open questions

Residual uncertainty after this pass. None of these is an answer to `docs/open-questions.md`. Question 14 there stays open. Cite a card or mark `undetermined`.

Kind on each row is residual research question. Decision state is `undetermined` unless a narrower state is given.

## Q1. What is a Work Order?

`docs/open-questions.md` question 14 asks whether a Work Order is a commitment, authorization, plan, process instance, or combination.

This folder's evidence. ERPNext Work Order is an authorization that also copies a plan and holds progress fields. Odoo uses the same English words for a job. ValueFlows would split the ERPNext document into Plan, Commitment, and Process. See E12, E13, E15, E28, L1.

Decision state. `undetermined` for a single OS name. `supported` that one source document is not one domain concept.

Do not invent a winner.

## Q2. Must every plant have a routing object?

ERPNext has Routing. Odoo keeps operations on one BoM. Moqui's public manufacturing path is often single-step. ValueFlows uses RecipeProcess, optionally grouped by Recipe.

Decision state. `undetermined` whether a reusable routing master is domain-level or an authoring convenience. L2 stays `supported` for material graph versus process graph even if routing is not a named object.

## Q3. How is specification effectivity represented?

ERPNext freezes a submitted BOM. Moqui dates `ProductAssoc`. Odoo versions through PLM. ValueFlows decouples the generated plan. Open manufacturing-order behavior under Odoo PLM was not fetched.

Decision state. `undetermined`. L13 is `hypothesis`. S-M01 and S-M32 are the tests.

## Q4. What is WIP?

Location, valuation class, resource stage, or interim stocked item. All four appear. See E18, L7, S-M14, S-M27.

Decision state. `undetermined`. Issue 18 inventory notes, if present on another branch, may constrain the location and valuation readings. This folder does not copy them.

## Q5. Is primary output required on a transformation?

ERPs need a production item on the order. ValueFlows and EPCIS record several outputs without a privileged one. Costing and fiscal rules may still need a role.

Decision state. `undetermined`. L9 splits the event from the role on purpose.

## Q6. When does subcontracting become ordinary purchase?

If the supplier sources every input and the contractor never sees lots, the flow looks like buy. Genealogy and supplied-material recall still need production semantics. S-M22.

Decision state. `undetermined`. Cross-link procure-to-pay when that folder exists. Do not answer it here.

## Q7. Is reservation a relator, a fact, or a projection?

Issue 12 in `docs/open-questions.md` already asks this for relationships. Manufacturing adds capacity slots and material holds. This folder did not fetch a full Odoo reservation page.

Decision state. `undetermined`. L5 only claims reservation is not issue and not consume.

## Q8. Which ISA-95 objects survive a reading of Part 1?

Product definition, production schedule, production performance, work definition, work request, and work response are plausible. They are not `supported` from S-ISA-LAND alone. S-ISA-WD is a working draft mirror.

Decision state. `undetermined`. Issue 38 owns a deeper standards pass. This folder must not treat blog summaries as Part 1.

## Q9. Quote versus identity on shared lots in a mix

EPCIS says any input may have contributed to any output. Some plants keep tighter genealogy with weigh-scale events. Whether OS should treat possible contribution as identity of the output lot is a foundation question, not a manufacturing schema.

Decision state. `undetermined`. Standing order 23. Do not close it.

## Q10. Does quality release belong in manufacturing or in a quality domain?

In-process inspection attaches to the job in ERPNext. Incoming and outgoing tests sit on the BOM. A separate quality issue exists in the backlog.

Decision state. `undetermined`. S-M30 is recorded so a quality worker can cite it.

## Q11. Are estimated standard and actual cost manufacturing facts or accounting facts?

Mantle and ERPNext store both near the run. The split between planned and actual effort is manufacturing. Valuation methods are not.

Decision state. `undetermined` for the cost objects. L1 and E36 only need planned versus actual effort.

## Q12. Can Action-only mutation express backflush, inferred consume, and late correction without an escape hatch?

RFC-0001 falsification target 4 and constitution article 7. This folder lists candidate actions. It does not prove the list is closed.

Decision state. `undetermined`. S-M10 and S-M34 are the pressure.

## What this folder will not do

It will not edit `docs/open-questions.md`.
It will not edit `rfcs/0001-metamodel-hypothesis.md`.
It will not design a target schema.
It will not mark any law `accepted`.
