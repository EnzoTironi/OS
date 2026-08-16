# Open questions left by issue 12

**Kind:** open questions  
**Decision:** undetermined  
**Fetched:** 2026-08-16

These are gaps after this session. They are not answers to `docs/open-questions.md`. That file stays untouched.

Each item names what would settle it. Until then the decision is `undetermined`.

---

## OQ-12-1. Is Fact the storage unit, or only one representation?

`docs/open-questions.md` Q2 and Q6, and RFC-0001 Fact, stay open.

This folder shows Datomic datoms, XTDB row versions, ERPNext document-plus-ledger, and Palantir current objects. All can explain current state. None won.

**Settle with.** A later note that finds a reconstructability failure that only one of those atoms can express across two independent domains.

**Do not settle with.** Aesthetic preference for triples or events.

---

## OQ-12-2. Must every derived value be live, or may some be frozen?

Period close, tax declaration, and quoted price under an approval all look like frozen derivations. This session saw ERPNext Period Closing Voucher and freeze dates next to immutable ledger. It did not compare fiscal close across Odoo, Brazilian rules, or FIBO.

**Settle with.** Domain research on accounting close and fiscal correction (issues in the accounting / Brazilian fiscal tracks). Cite a research artifact. Do not invent a rule here.

---

## OQ-12-3. How should OS represent "available"?

Odoo stores availability on the move. ERPNext keeps reservation entries and lets available be computed. ValueFlows has no ATP field.

**Settle with.** Inventory and order-to-cash domain notes that include serials, partial reserve, and concurrent orders. If those notes show a stored available flag causing a real invariant failure, CL-4 stays. If they show a live predicate that cannot be computed in time, that is runtime pressure, not a new primitive.

---

## OQ-12-4. Bin / quantity-on-hand cache

[taxonomy.md](taxonomy.md) flagged ERPNext Bin as a hypothesized cache. This session did not fetch a first-party Bin page.

**Settle with.** A corpus note under the ERPNext track that cites Stock Settings / Bin behavior. Until then, do not treat Bin as evidence.

---

## OQ-12-5. Valid time on every fact?

`docs/open-questions.md` Q7. XTDB puts two times on every row. Datomic's `t` is closer to system/transaction time. ERPNext posting date is valid-ish and creation/submit is knowledge-ish, but the product is not a bitemporal database.

**Settle with.** The temporal foundation issue, not this folder. Issue #12 only shows that late stock and address-change examples need both questions. It does not show that every descriptive property needs both.

---

## OQ-12-6. When is a stored running total allowed on a ledger row?

ERPNext's Stock Ledger Report prints Balance Quantity on each movement line. Whether OS may store that running total on the effect row is a runtime question.

**Settle with.** Wave B only after a vertical proves the live sum is too slow and the denormalized total stays reconcilable to the same function.

---

## OQ-12-7. Does Palantir's action log satisfy reconstructability?

Actions "can" create a historical action log. Object properties remain the operational values. This session did not fetch a page that shows replay of property values from that log, or as-of object queries comparable to Datomic `as-of`.

**Settle with.** Palantir corpus issue #35, if it lands a first-party page on object history. Until then, Palantir is evidence for current-object primacy, not for historical replay.

---

## OQ-12-8. External unknown outcomes

Constitution §9 and scenario S-004. Fowler ES is painful here because replay must not re-hit the world. This folder did not study a first-party ERP timeout/reconciliation protocol.

**Settle with.** Foundation Action/Event/Effect research and the external-effects runtime issue. Do not answer from this note.

---

## Questions this session did answer enough to use

Use [candidate-laws.md](candidate-laws.md). Short form:

- Current state is sometimes a primary fact. CL-2.
- Remainders are derived. CL-3.
- Pure event sourcing is not required. CL-5 rejected.
- Correct versus compensate. CL-6.
- Late facts invalidate later derived values. CL-7.

If a later agent needs a one-line input to synthesis, take CL-5's rejection and CL-1's support together. Explainability yes. Event-sourced kernel no.
