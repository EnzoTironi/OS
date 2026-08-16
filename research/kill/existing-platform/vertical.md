# Demanding vertical

**Status.** Shared scoring story for issue 68.  
**Kind.** domain evidence plus counterexample.  
**Decision.** `supported` as the issue's required property list, packaged as one story. `hypothesis` that this story is the hardest honest vertical. A later agent may substitute a harder one if it still hits every required property.

## Why one story

Issue 68 asks to model the same demanding vertical on every candidate. The required properties are a list. A list lets a platform pass by pointing at six disconnected demos. One story forces the collisions.

The story is assembled from `scenarios/README.md` S-001, S-002, S-003, S-004, S-007, and S-011. It is not a new domain claim. It is a composition that a replace-OS verdict can fail against.

## Story V-001. Accelerated remainder after a stale purchase and a lost booking

Organization A sells finished lot-tracked units. Organization B is the customer and, in another relationship, a raw-material supplier. That is S-005 pressure, kept light.

On 10 August the operational picture is this.

1. B requested 10 units of SKU-X for delivery 18 August. That is requested.
2. Sales promised 20 August. That is committed.
3. Planning scheduled 4 units from stock, 4 from a work authorization, and 2 from a purchase. Planned dates sit on 21 August.
4. Four units from lot L1 ship on 16 August. That is actual partial fulfillment.
5. B asks to accelerate the remainder.
6. An agent reads available-to-promise as 20 and remaining demand as 6, then proposes `PurchaseRaw(qty=1000)` because a second demand wave of 980 is also in a spreadsheet. The proposal is a typed action with a dry-run preview and a policy check.
7. At 10:06 a goods receipt of 800 posts from the WMS. The ERP still shows 20 on hand. A chat message says the customer will take a substitute SKU.
8. At 10:07 a human approves the 10:01 proposal.
9. Commit must decide whether the approved call is still legal.
10. If a reduced purchase commits, the runtime books a carrier pickup. The HTTP request leaves. The socket times out. The carrier may have the booking.
11. On 12 August a signed delivery document arrives proving 20 units of an input lot left on 8 August and were never recorded. Stock as known on 10 August was wrong.
12. An auditor asks which observation authorized the agent's ATP number, and what the system believed on 10 August.

A human button, an API client, and an agent tool must address the same `PurchaseRaw` and the same `BookCarrier` operations. The readable surface must be generated from those operations, not rewritten beside them.

## Required properties, bound to the story

| ID | Property from issue 68 | Beat in V-001 |
| --- | --- | --- |
| P1 | Multi-source observations | ERP stock, WMS receipt, spreadsheet demand, chat substitute, signed late document |
| P2 | Typed identity and relations | Party vs customer/supplier roles, SKU vs lot, order vs line, reservation vs on-hand, employment-like commercial terms left implicit |
| P3 | Requested vs committed vs planned vs actual | 18 / 20 / 21 / 16 August, plus the accelerated remainder |
| P4 | Action with preview and policy | `PurchaseRaw` dry-run and fail-closed policy |
| P5 | Approval | Human sign-off of the agent proposal |
| P6 | Stale-state revalidation | Receipt at 10:06, approval at 10:07 |
| P7 | Transaction | Local reservation and purchase commitment either atomic or explicitly split |
| P8 | External effect with ambiguous outcome | Carrier timeout after send |
| P9 | Reconciliation | Later evidence that the booking did or did not exist |
| P10 | Temporal history | Stock as known on 10 August vs stock now believed for 10 August |
| P11 | Provenance | Which source authorized the ATP figure |
| P12 | Agent and human, same operation | Same `PurchaseRaw` / `BookCarrier` |
| P13 | Generated or readable surface | UI, API, and tool from one definition |

## What a clean pass would look like

A platform passes only if the engine, not a modeler's private convention, can do all of the following.

- Keep the five observations as first-class claims with provenance. Merging them into one `on_hand` and one `demand` before the action runs is a fail.
- Address B as one organization with two roles, not as two master records that happen to share a name.
- Answer "what did we promise?" without reading the actual ship date.
- Preview `PurchaseRaw` without committing it.
- Bind approval to the exact arguments and to the ontology or policy revision in force.
- Re-read live state at commit and refuse or replan when the 800-unit receipt lands first.
- Expose a transaction boundary the modeler cannot accidentally straddle.
- Leave the carrier booking `unknown` until reconciliation evidence arrives. Timeout is not failure.
- Record a reconciliation fact that explains the later known outcome.
- Answer both temporal questions in S-007.
- Let provenance change authority. A signed document outranks a chat extract for the same quantity.
- Offer the same operation to a human and an agent without a second business implementation and without silently widening authority.
- Generate a readable surface from that operation.

A platform that can draw the screens and still needs hidden procedural glue on any row fails that row.

## What this vertical is not

It is not a product prototype. It is not an ERPNext DocType list. It is not a Palantir Workshop module. Those are source artifacts a candidate might use while distorting the story.
