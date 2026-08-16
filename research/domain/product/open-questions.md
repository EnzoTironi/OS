# Open questions

**Kind.** unresolved uncertainty  
**Fetched.** 2026-08-16  
**Decision.** `undetermined` unless a row says otherwise.

Do not copy answers into `docs/open-questions.md`. Cite this file or leave the repo question open.

## Q-01. Is a SKU a specification, or a relator between specification and market?

GTIN is a trade-item identifier. ValueFlows has no GTIN layer. Moqui Product is both catalog and specification. If two companies sell the same manufacturer's part under different GTINs, is that two specifications or one specification with two trade-item identifiers?

**Depends on.** E-01, E-11, E-06  
**Decision.** `undetermined`

## Q-02. When does a configuration become a SKU?

Moqui can keep configuration on the order. Odoo can explode variants instantly. GS1 GTIN Management was listed and not read. Which commercial or regulatory events force minting?

**Depends on.** E-06, E-07, L-03  
**Decision.** `undetermined`

## Q-03. Can one instance carry both a lot and a serial?

Plants often print both. This pass did not fetch a first-party rule that requires both as first-class identities on one object. GS1 can put lot and serial in the same data carrier. That is encoding, not ontology.

**Decision.** `undetermined`

## Q-04. What is the exact key of a fungible stock slice?

Candidates seen: specification plus location. Plus lot. Plus owner. Plus package. Plus received date. ValueFlows also allows owner inside the logical identifier (E-17). Which keys are identity and which are projection dimensions?

**Cross-link.** Inventory issue family in `docs/research-program.md`. Sibling Odoo quant key on `origin/cursor/issue-33-corpus-cfd8`.  
**Decision.** `undetermined`

## Q-05. Is containment a resource, a relator, or an event consequence?

ValueFlows `containedIn` is a current relation. Moqui `Container` is an entity with location history. GS1 SSCC is an identifier for a logistics unit. EPCIS aggregation events record packing.

**Decision.** `undetermined`

## Q-06. Do equipment assets and inventory instances share one instance type?

Moqui Asset is both. ValueFlows EconomicResource can be a tractor or a carrot lot. ERPNext splits Item from Asset module, and also has `Is Fixed Asset` on Item (S-ERN-ITEM).

**Decision.** `undetermined`

## Q-07. How do specification version and effectivity attach to as-built identity?

Moqui uses sales dates on Product. ERPNext uses End of Life and Disabled. ValueFlows uses stage and state on the resource, or a new specification per stage. Sibling temporal note `research/foundation/temporal/counterexamples.md` CX-MFG-02 on `origin/cursor/issue-5-foundation-cfd8` says as-built must pin a revision.

ISA-95 product version was mentioned in secondary commentary and not read from the standard text.

**Decision.** `undetermined`

## Q-08. Are commercial supersession catalogs the same relation as manufacturing alternatives?

ERPNext Item Alternative is a manufacturing and subcontract replacement (E-19). Automotive and electronics supersession lists were not fetched. They may need effectivity, direction, and form-fit-function grades that Item Alternative does not have.

**Decision.** `undetermined`

## Q-09. Where do reservations sit relative to identity?

Sibling ERPNext and Odoo notes treat reservation as a claim on qty or on serial. This domain pass did not re-litigate reservation. It only needs identity to be addressable by a claim.

**Cross-link.** `docs/open-questions.md` section 12.  
**Decision.** `undetermined` here. Owned by reservation research.

## Q-10. What identifier scheme does OS store?

Natural keys (GTIN, serial printed on the part) versus surrogate keys versus both. GS1 requires globally unique keys for inter-org flows. Internal ERPs use local series (E-08, E-09). Reconciliation across sources is `docs/open-questions.md` section 3.

**Decision.** `undetermined`

## Q-11. Combo, kit, and bundle

Odoo Combo is a product type (E-04). Kits appear in the tracked-versus-untracked table. This pass did not fetch kit identity rules. A bundle may be a commercial SKU, a handling unit, or a BOM output.

**Decision.** `undetermined`

## Q-12. Digital license versus file instance versus specification

ValueFlows example uses a URI on an EconomicResource. Moqui Subscription is access with a date range. Neither was compared to license-key practice.

**Decision.** `undetermined`

## Repo questions this folder must not close

`docs/open-questions.md` section 13, economic resources, and section 14, manufacturing specification versus instance, stay open. This folder supplies evidence. It does not answer them in that file.
