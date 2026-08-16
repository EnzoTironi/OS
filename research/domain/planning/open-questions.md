# Open questions

**Kind:** domain-evidence  
**Decision:** undetermined unless a row says otherwise  
**Fetched:** 2026-08-16

This file does not answer `docs/open-questions.md`. It points at research cards or leaves the item open. Invented closures are forbidden.

---

## Q-01 Are forecast and commitment the same object with a status

**Points at:** L-02, E-01, E-08, standing fork in README  
**State:** undetermined

Independent sources keep two quantities. None of them write a shared identity. Do not treat a status flag as the answer until a later wave finds agreement.

Related `docs/open-questions.md` item 13 (Intent, Commitment, EconomicEvent).

---

## Q-02 Is a plan an Action, a projection, a collection of flows, or a message

**Points at:** E-07, lifecycle §§1–3 and 7–8, L-07, L-08  
**State:** undetermined

ERPNext Production Plan is a submitted document. Odoo MPS is a grid. ValueFlows Plan is a bundle of processes and flows. ISA-95 names schedule messages. These four readings are still live.

Related `docs/open-questions.md` items 4 and 6.

---

## Q-03 Which combination rule turns forecast and orders into one independent-demand row

**Points at:** E-08, P-01, P-23  
**State:** undetermined

`max`, sum, leftover forecast, and "show both" all appear. The rule is a Function. The choice of rule is not decided.

---

## Q-04 Which safety-stock policy is the domain default

**Points at:** E-04, L-05, P-06  
**State:** undetermined

Add-to-required versus target-ending-inventory. No default is chosen.

---

## Q-05 Must finite infeasibility be a first-class result

**Points at:** L-06, L-10, P-04, P-05  
**State:** undetermined

APS pages say yes. Open ERP manuals do not refuse a plan on collision. Wave B runtime work waits.

---

## Q-06 Is capability a planning kind or only a manufacturing specification

**Points at:** L-09, E-09, issue #19  
**State:** undetermined

ISA-95 Part 1 attributes unread. ERPNext item make-rate mixes the ideas. Odoo alternate work centers and allowed employees suggest a split.

---

## Q-07 Does priority belong in the planning ontology

**Points at:** E-12, P-12  
**State:** undetermined

Moqui Request.priority is the only first-party field found. Shortage allocation still needs a rule.

---

## Q-08 Can optimization live as a Function in RFC-0001

**Points at:** L-10, RFC-0001 Function section, `docs/open-questions.md` item 9  
**State:** undetermined

Not answered. Not edited into the RFC. Solver product not chosen.

---

## Q-09 Where may agent reasoning sit relative to MRP arithmetic

**Points at:** L-11, `docs/open-questions.md` item 10, P-29  
**State:** undetermined

Manuals do not name agents. The constitution still forbids improvising hard invariants. Forecast adoption and expedite look like judgment. Explosion and netting do not.

---

## Q-10 What is the identity of a plan revision

**Points at:** L-08, E-14, P-13, P-15  
**State:** undetermined

`amended_from` exists on ERPNext documents. Odoo overwrites cells. ValueFlows revision pages 404'd. Close versus complete versus cancel are distinct in one source only.

---

## Q-11 How does planning consume inventory position without owning it

**Points at:** E-06, issue #18, P-11, P-25  
**State:** undetermined here

Projected qty, ATP, reserved-for-plan, and on-hand are different numbers. #18 owns the definitions. Planning needs a snapshot contract.

---

## Q-12 How does planning consume BOM and routing without owning execution

**Points at:** E-02, issue #19, P-09, P-26  
**State:** undetermined here

Explosion cites a specification. Release creates work. Those are different verbs. Work order meaning stays on #19 (`docs/open-questions.md` item 14).

---

## Q-13 What ISA-95 Part 1 actually says about schedule attributes

**Points at:** E-18, sources ISA-95  
**State:** undetermined

Part 1 is paywalled this session. Part 5 preview only names models. Do not invent attributes.

---

## Q-14 Is Odoo community MPS the same as the 18.0 documented MPS

**Points at:** sources Odoo  
**State:** undetermined

GitHub search of `odoo/odoo` found no `MrpMps` / `mrp.production.schedule` this session. Docs were used. Code-level confirmation waits.

---

## Q-15 Does Moqui have an MRP explosion, or only requirements

**Points at:** sources Moqui, matrix row "BOM / recipe explosion"  
**State:** undetermined

Requirement plus WorkEffort is documented. A time-phased BOM explosion service was not found under the names searched.

---

## Q-16 Is there a frozen horizon in the open corpora

**Points at:** P-29  
**State:** undetermined

Not present on the ERPNext Production Plan fields or Odoo MPS page that were read.

---

## Questions that are not open here

| Claim | State | Where |
| --- | --- | --- |
| Independent versus dependent demand is a real split | supported | L-01 |
| Forecast qty and committed qty are different facts | supported | L-02 |
| Material netting is deterministic given a position | supported | L-03 |
| Lead time offsets planned dates, not promises | supported | L-04 |
| One universal safety-stock formula | rejected | L-05 |
| MRP output is automatically capacity-feasible | rejected | L-06 |
| Copy a source DocType into OS | rejected | constitution §2 |
| Pick a solver product in Wave A | rejected | standing order 7 |

---

## Suggested follow-ups

1. Read ISA-95 Part 1 if a licensed copy appears. Until then keep attribute cells `U`.
2. Open Odoo enterprise or `mrp_mps` source if a later corpus agent finds it. Confirm finite versus infinite in code.
3. Trace ERPNext reservation release on Production Plan close. P-25 is partial.
4. Find ValueFlows operational-planning pages. Two concept URLs 404'd.
5. Cross-read issue #18 position names and issue #19 work-order meaning when those folders land.
6. Do not close #24 on issue-thread prose. These files are the durable store.
