---
issue: 23
kind: domain evidence
fetched: 2026-08-16
decision_state: hypothesis
---

# Convergence and divergence

The goal is evidence of semantic agreement or disagreement. This is not a feature checklist.

Legend. `Y` means the distinction is documented. `P` means a partial or neighboring construct. `N` means not found in the pages fetched this session. `U` means the first-party page failed or was too thin.

**Kind.** domain evidence for the cells. Source names in the last column are source-system artifacts.

## Convergence matrix

| Distinction | ERPNext | Odoo | Moqui | Dynamics | Amazon | ValueFlows | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Catalog or list rate ≠ product identity | Y | Y | Y | Y | Y | P | Product/SKU is issue 15 |
| Selling rate ≠ buying rate | Y | P | Y | P | N | P | Odoo purchase pricelists exist in product but were not fetched |
| Effectivity interval on a rate | Y | Y | Y | Y | Y | P | Amazon `start_at` / `end_at` and discount schedules |
| Customer or group specific rate | Y | Y | Y | Y | P | Y | Amazon `audience` is B2B versus ALL, not a named customer |
| Channel or store specific rate | P | Y | Y | Y | Y | P | ERPNext country and customer tag. Not a marketplace listing |
| Quantity or UOM predicate | Y | Y | Y | P | P | P | Amazon quantity_discount_plan is B2B only |
| Computed price can be overridden | Y | Y | Y | U | N | N | Amazon seller sets `our_price`. Buyer does not override |
| Promotion ≠ price list | Y | Y | Y | Y | P | P | Amazon promotions appear on observed offers |
| Coupon is a token to a rule | Y | Y | Y | P | U | N | Dynamics discount codes mentioned in sibling Commerce discount page, not fully fetched |
| Offer ≠ commitment | Y | Y | P | U | Y | Y | Cite issue 16. Amazon listing is an offer to the market |
| Competitor price as observation | N | N | P | N | Y | N | Moqui `competitive` is a stored price type |
| Fee estimate ≠ posted fee | N | N | N | N | Y | N | eBay and Mercado Libre `U` |
| Floor or ceiling constraint | P | P | Y | U | Y | N | ERPNext Selling Settings. Odoo formula min margin example |
| Tax-inclusion flag on the amount | U | Y | Y | U | Y | U | Encoding fork. See divergence |
| Reprice is an explicit update | P | P | P | P | Y | N | ERPNext/Odoo edit Item Price or pricelist. Not a marketplace patch |
| Approval before override | P | N | P | U | N | N | ERPNext "approved exception." Odoo always override |
| Concurrent price resolution rule | Y | Y | Y | Y | U | N | Priority, product-over-category, sequence, find-next |
| Listing identity ≠ SKU | N | N | N | P | Y | N | eBay official `U`. Dynamics channel price group is close |

## Divergence that matters

### D1. List versus offer identity

**Kind.** domain evidence.

**Decision state.** `undetermined`.

ERPNext keeps Item Price, Pricing Rule, Quotation, and Sales Order as different documents. Odoo can keep one `sale.order` from quotation to order and treats pricelist as suggestion. Amazon `purchasable_offer` is the live market offer and is not a customer quotation. ValueFlows can publish one Intent in several Proposals.

Issue 16 already left "must offer and agreement have different identities" `undetermined`. This folder does not close that fork.

### D2. Tax-inclusive encoding

**Kind.** domain evidence.

**Decision state.** `undetermined`.

Odoo recommends one stored reference and shows that included and excluded are not inverses (E-008). Moqui has `taxInPrice` on `ProductPrice` (E-009). Amazon examples use `value_with_tax` (E-016). ERPNext Item Price pages fetched this session do not settle inclusion. Standing order. Do not pick an encoding unless independent first-party sources agree. They do not.

### D3. Who may override a computed price

**Kind.** domain evidence.

**Decision state.** `undetermined`.

Odoo documents unconditional override on the sales order (E-006). ERPNext documents Ignore Pricing Rule as an approved exception (E-002). Moqui requires a permitted user (E-010). Amazon has no buyer-side override. The seller still owns lawful independent pricing (E-015).

### D4. Competitive price storage versus live observation

**Kind.** domain evidence.

**Decision state.** `supported` as a real split.

Moqui can store a competitive `ProductPrice` as just another typed rate (E-009). Amazon treats competitor and featured-offer numbers as retrieved observations with notifications (E-012, E-013). Those are not the same kind. A stored competitive rate without provenance is a weaker claim.

### D5. Which date is "now" for effectivity

**Kind.** domain evidence.

**Decision state.** `undetermined`.

Moqui promotions use order placed date or current date (E-010). Dynamics can match on today, requested ship, requested receipt, or created date (E-017). ERPNext uses transaction date against Valid From / Valid Upto (E-002, E-022). A single "valid time" field without naming the business date is under-specified.

## Source artifacts that must not become OS types

| Artifact | Source | Why it is an artifact |
| --- | --- | --- |
| Item Price DocType | ERPNext | One row shape for list, customer, batch, and dated rates |
| Pricing Rule DocType | ERPNext | Mixes rate replace, discount, margin, and free-item |
| `product.pricelist` / `product.pricelist.item` | Odoo | Implementation of suggested prices |
| `loyalty.program` | Odoo | Unified engine for coupons, points, gift cards |
| `ProductPrice` | Moqui | One entity, many `priceTypeEnumId` values |
| `purchasable_offer` | Amazon | JSON listing attribute with marketplace selectors |
| FOEP | Amazon | Marketplace-specific featured-offer target |
| Price group | Dynamics | Many-to-many join between channels and prices |
| Proposal List | ValueFlows | Publishing group, not a kernel table |

## Failed marketplace cells

eBay Inventory `createOffer` / `publishOffer` and Mercado Libre price APIs were not retrieved from first-party pages this session (S-FAIL-03, S-FAIL-04). Do not invent those rows. A later pass can fill them.
