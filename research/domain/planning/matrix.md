# Convergence matrix

**Kind:** domain-evidence plus source-artifact  
**Decision:** mixed per row  
**Fetched:** 2026-08-16

Marks:

- `Y` first-party evidence this session
- `P` partial or only a nearby concept
- `N` not found in the pages and files opened
- `U` undetermined, usually paywall or missing community code

This is not a feature scorecard. A `Y` means the distinction appears. It does not mean the implementations agree.

| Distinction | ERPNext | Odoo 18 | Moqui | ValueFlows | ISA-95 public | OR / APS pages | Notes | State |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Forecast ≠ sales-order demand | Y | Y | P | Y | U | P | Moqui has Requirement types, not a forecast document. | supported |
| Forecast object same as commitment | N | N | N | N | U | N | No source equates them. Identity still open. | undetermined |
| Independent vs dependent demand | Y | Y | P | Y | U | Y | ValueFlows names independent demand on Plan. | supported |
| Planning horizon / buckets | Y | Y | N | P | U | P | Moqui uses required-by dates, not a bucket grid. | supported |
| Safety stock policy | Y | Y | P | N | U | P | Formulas diverge. See E-04. | supported |
| Lead-time offset | Y | U | P | P | U | Y | Odoo product lead-time form not opened. | supported for ERPNext |
| BOM / recipe explosion | Y | Y | P | Y | U | Y | Spec owned by #19. | supported |
| Material netting | Y | Y | P | P | U | Y | Position owned by #18. | supported |
| Projected / ATP quantity | Y | Y | Y | N | U | P | Moqui ATP or QOH requirement methods. | supported as a need. Definition #18 |
| Capacity as load or rate | Y | Y | P | N | P | Y | ISA-95 lists Capability models. Attributes U. | hypothesis for capability split |
| Finite capacity refusal | N | U | N | N | U | Y | Odoo shows load. Refusal not in official MPS/work-center pages. | undetermined in ERPs. supported as APS problem |
| Alternate resource | P | Y | P | P | U | Y | Odoo alternate work center. ERPNext sourcing type. | supported as config |
| Priority rank | N | N | P | N | U | P | Moqui Request.priority only. | undetermined |
| Named optimization objective | N | N | N | N | U | P | APS says "optimally". No math in ERP manuals. | undetermined |
| Plan as submitted document | Y | N | P | P | P | N | Odoo MPS is a grid. ISA-95 schedule is a message. | undetermined (Action vs projection) |
| Plan close ≠ complete | Y | N | N | N | U | N | ERPNext only this session. | supported locally |
| Replan after new facts | P | P | P | P | U | Y | All can edit or rerun. Version identity missing. | hypothesis |
| Requirement approval lifecycle | P | P | Y | Y | U | N | Moqui Requirement. ValueFlows Intent to Commitment. | supported as a pattern |
| MTO link from order to supply | P | Y | P | P | U | P | Odoo MTO keeps the SO to PO/MO link. | supported as a strategy |
| Reorder-point path beside MRP | P | Y | Y | N | U | Y | Odoo forbids MPS plus reordering rules. | supported |
| Schedule message ≠ performance | N | N | N | Y | P | N | ValueFlows plan vs event. ISA-95 model names. | hypothesis |
| Delivery split inside one order | Y | U | U | P | U | P | ERPNext delivery schedules. | supported |
| Agent reasoning named | N | N | N | N | N | N | Absent. Boundary is our research question. | undetermined |

## Convergence that survived

Independent demand, dependent explosion, a horizon, some safety policy, lead-time offset, and material netting appear in at least two independent families. Those are the strongest Wave A distinctions.

Forecast and committed demand are both inputs in ERPNext, Odoo, and ValueFlows. Combining them is always a rule. It is never identity.

## Divergence that must not be averaged away

1. Safety stock as added shortage versus safety stock as target ending inventory.
2. Plan as a submitted reserving document versus plan as an editable grid versus plan as a collection of flows versus plan as a Level 4 message.
3. Demand combination as `max(plan, forecast)` plus ad-hoc orders versus side-by-side actual and forecast.
4. Capacity as item make-rate versus work-center parallel units and calendar.
5. Replenishment trigger. Order-driven, forecast-grid, and reorder-point cannot share one silent default.

## Empty cells that are not failures

ISA-95 Part 1 attributes stay `U` because the text is paywalled. Odoo MPS Python stays `U` because it was not in public `odoo/odoo` search. Moqui has no MPS document. Those are research facts.
