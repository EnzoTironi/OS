---
issue: 23
kind: domain evidence
fetched: 2026-08-16
decision_state: hypothesis
---

# Evidence

Labeled blocks. Each block names its kind and decision state. Source-system names stay in the source column. They are not OS types.

## E-001. Item Price is a dated rate on a Price List

**Kind.** domain evidence.

**Source.** S-EN-01, S-EN-02.

**Observed.** ERPNext stores a selling or buying rate as Item Price. The record names Item, Price List, currency, UOM, optional customer or supplier, optional batch, minimum quantity, packing unit, Valid From, and Valid Upto. A Price List is a collection of those rates and can be limited by country or disabled.

**Interpretation.** A catalog rate is an effectivity-bounded fact about an item in a list, not the item itself and not a sale.

**Decision state.** `supported` as ERPNext behavior.

## E-002. Pricing Rule changes a transaction result, not the Item Price

**Kind.** domain evidence.

**Source.** S-EN-03.

**Observed.** A Pricing Rule can replace the rate, apply a percentage or amount discount, add a margin, or add a free product. FAQ states the rule does not change the Item Price record. Eligibility can include party, quantity, amount, date, warehouse, company, currency, and Price List. Overlaps use priority. `Ignore Pricing Rule` is documented as an approved exception.

**Interpretation.** Conditional commercial adjustment is a separate object from the catalog rate. Applying it is a function of the transaction context.

**Decision state.** `supported` as ERPNext behavior.

## E-003. Coupon is a token to a rule

**Kind.** domain evidence.

**Source.** S-EN-05, S-OD-02.

**Observed.** ERPNext Coupon Code links to one coupon-based Pricing Rule. Promotional codes are reusable. Gift Card type is a generated code, not a stored-value wallet. Validity and Maximum Use sit on the coupon. Odoo Discount Code and Coupon program types also separate the code from the reward.

**Interpretation.** A coupon is an authorization token that enables a promotion. It is not the price and not a payment instrument.

**Decision state.** `supported` for "token, not price." `undetermined` for customer-level one-use enforcement. ERPNext FAQ says Maximum Use is global and asks the reader to confirm per-customer limits.

## E-004. Quotation is an expirable offer

**Kind.** domain evidence.

**Source.** S-EN-06. Sibling S-SIB-16 L-001.

**Observed.** ERPNext Quotation records items, rates, taxes, Valid Till, and terms offered to a Lead or Customer. Statuses include Open, Ordered, Lost, Expired, Cancelled. Print Heading can say Proforma Invoice without changing the DocType. Submission freezes the offered version. Conversion to Sales Order is a later step.

**Interpretation.** The priced proposal can expire or be lost without creating leftover demand. Issue 16 already supports this as offer-versus-commitment.

**Decision state.** `supported`.

## E-005. Margin on Price List Rate is not a cost floor

**Kind.** domain evidence.

**Source.** S-EN-04.

**Observed.** ERPNext margin is `Price List Rate + amount` or `Price List Rate × (1 + percent)`. FAQ states it is not calculated from valuation rate. Minimum selling price is pointed at Selling Settings, not at the margin field. Combining margin and discount without a documented policy is called out as confusing.

**Interpretation.** Markup from a list rate and a minimum-margin policy against cost are different constraints. Calling both "margin" is a source-system collision.

**Decision state.** `supported` for the split. The name "margin" in ERPNext is a source artifact.

## E-006. Odoo pricelist suggests. The order line can override

**Kind.** domain evidence.

**Source.** S-OD-01.

**Observed.** Official text. "Pricelists suggest certain prices, but they can always be overridden on the sales order." A customer form always has a pricelist. The field can still be cleared on a quotation and the quotation confirmed. Formula discounts are hidden from the customer. Discount-type discounts are visible. Validity and min qty sit on the rule.

**Interpretation.** Computed list application and the transaction price are different facts. Override is a first-class documented path in Odoo.

**Decision state.** `supported` as Odoo behavior.

## E-007. Odoo promotions are not pricelists

**Kind.** domain evidence.

**Source.** S-OD-02.

**Observed.** Discount and loyalty programs "offer more varied, public, and time-sensitive pricing options than pricelists." Program types include Coupons, Loyalty Cards, Promotions, Discount Code, Buy X Get Y, Next Order Coupons. A program can bind to pricelists, websites, PoS, company, start and end dates, and usage limits. Conditional rules can require minimum quantity or minimum purchase with tax included or excluded.

**Interpretation.** Channel-public, time-boxed, code-gated rewards are a different kind from a standing price list.

**Decision state.** `supported`.

## E-008. Tax-included and tax-excluded amounts are not inverses

**Kind.** domain evidence.

**Source.** S-OD-03.

**Observed.** Odoo documents a Belgium 21% case. 10.00 included implies 8.26 excluded. 8.26 excluded implies 9.99 included. Quantity multiplies the error. Official advice is to store one reference and compute the other. Dual reference needs a tax-included pricelist plus a fiscal position that maps the tax. Mismatch of pricelist and fiscal position is called error prone.

**Interpretation.** "Price" without a tax-inclusion flag is ambiguous. The encoding of that flag is not settled across sources. See E-009 and E-016.

**Decision state.** `supported` for the asymmetry. `undetermined` for a universal money encoding. See Q-PR-02.

## E-009. Moqui stores many price types on one entity, including competitive and tax-in-price

**Kind.** source-system artifact.

**Source.** S-MQ-01, S-MQ-02.

**Observed.** Mantle `ProductPrice` carries vendor, customer, `priceTypeEnumId` (list, current, max/min, promotional, competitive), `pricePurposeEnumId` (purchase, recurring, use), `minQuantity`, `fromDate`, `thruDate`, `productStoreId`, `taxInPrice`, tax amount fields, and currency UOM. AgreementItem can own a negotiated `ProductPrice`.

**Interpretation.** One table holding list, promotional, competitive, and agreement prices is an implementation grouping. The type enum is evidence that those kinds differ. Competitive as a stored type is not the same as a live marketplace observation.

**Decision state.** `supported` as Mantle shape. Not a candidate OS table.

## E-010. Moqui applies promotions after price lookup and re-runs them

**Kind.** domain evidence.

**Source.** S-MQ-03.

**Observed.** Price is looked up, then optionally modified by a price-modify service, unless a permitted user sets a manual price. Promotions run after that, only when the order has a Store. Every relevant order change removes promotion discount items and re-runs promotions against From/Thru dates, codes, and per-order, per-customer, per-promotion limits. Sequence number decides order. Most promotions consume item quantity so a later promotion cannot reuse it.

**Interpretation.** Standing price, price-modify, and promotion are three stages. Promotion application is recomputed, not a durable line price of its own until the order is placed.

**Decision state.** `supported` as Moqui behavior.

## E-011. Amazon listing offer is keyed by marketplace, currency, and audience

**Kind.** domain evidence.

**Source.** S-AM-03, S-AM-02.

**Observed.** `purchasable_offer` is an array of offer objects. Selectors are `marketplace_id`, `currency`, and `audience` (default ALL, also B2B). Sub-attributes include `our_price`, `start_at`, `end_at`, `map_price`, `discounted_price` with its own schedule, `minimum_seller_allowed_price`, `maximum_seller_allowed_price`. Amounts in the official examples are `value_with_tax`. `putListingsItem` replaces content. Omitted attributes can drop. Submission accepted is not later processing issues. Live quantity can differ from last submitted quantity.

**Interpretation.** A channel offer has identity distinct from the SKU. Product identity stays with issue 15. The offer has its own effectivity and floors.

**Decision state.** `supported` for Amazon. `undetermined` as a universal listing identity. eBay official docs 403 this session.

## E-012. Competitor price is an observation used to reprice

**Kind.** domain evidence.

**Source.** S-AM-01, S-AM-04, S-AM-05.

**Observed.** Product Pricing API is documented to support repricers that monitor competitor prices and other factors. `getCompetitiveSummary` returns featured buying options, reference prices including competitive price threshold, and lowest priced offers, each able to carry a promotions array. FOEP is the price at which an offer *may* become featured. Status is not guaranteed because competing offers and fulfillment to a customer change. `ANY_OFFER_CHANGED` reports price changes. `PRICING_HEALTH` reports ineligibility even if competitors did not move.

**Interpretation.** A competitor offer is an observation with a retrieval time. It is not the seller's list, not the seller's listing, and not a commitment to win a featured slot.

**Decision state.** `supported`.

## E-013. Competitive external price has withheld provenance

**Kind.** domain evidence.

**Source.** S-AM-05.

**Observed.** Competitive Price Threshold is based on prices at other retailers, excluding other Amazon sellers. Retailer names are not disclosed. Equivalence can be same product, per-unit pack resize, or near-identical attributes with a different brand. Average selling price is a 60-day mean that excludes promotional deals. List/MSRP is a manufacturer or seller suggested price and may be ignored if submitted as 0.

**Interpretation.** Two observations with the same amount can have different authority. Withheld retailer identity is still provenance. It is a documented gap, not missing data.

**Decision state.** `supported`.

## E-014. Marketplace fee estimates are not the posted fee

**Kind.** domain evidence.

**Source.** S-AM-06.

**Observed.** Product Fees API returns estimates so sellers can account for fees when setting prices. Official warning. "The estimated fees returned by this API are not guaranteed. Actual fees can vary." Correlation id is required so an estimate can be matched to a request.

**Interpretation.** A fee used in a reprice decision is an estimate observation. The fee that later hits the payout is a different fact.

**Decision state.** `supported` for Amazon. eBay and Mercado Libre fee pages failed. Those marketplaces stay `undetermined`.

## E-015. Reprice submit is an Action with unknown live outcome

**Kind.** domain evidence.

**Source.** S-AM-02, S-AM-04. Constitution items 8 and 9.

**Observed.** Listings Items responses say whether the submission was accepted for processing. They do not include issues that occur after accept. FOEP values are automatically generated. Amazon tells developers the seller remains retailer of record and must set prices independently and lawfully.

**Interpretation.** `UpdateListingPrice` can be accepted, delayed, rejected later, or live at a different number than submitted. Requested is not happened.

**Decision state.** `supported`.

## E-016. Amazon stores offer amounts as value_with_tax

**Kind.** source-system artifact.

**Source.** S-AM-03.

**Observed.** Official patch examples set `our_price`, `map_price`, and `discounted_price` with `value_with_tax`.

**Interpretation.** One major marketplace encodes the listing amount as tax-inclusive. That does not settle OS encoding. It is a counterweight to Odoo's "store excluded" advice.

**Decision state.** `supported` as Amazon artifact. Encoding fork stays `undetermined`. See Q-PR-02.

## E-017. Dynamics splits base, trade agreement, and active price

**Kind.** domain evidence.

**Source.** S-DY-01, S-DY-02, S-DY-03.

**Observed.** Base price is the released-product Price field, same for everyone. Trade agreement price comes from Price (sales) agreements with customer scopes Table, Group, and All. A trade agreement is always used before the base price. Active price is trade agreement after discounts. Price groups bind prices and discounts to channel, catalog, affiliation, and loyalty. Find-next can take the lowest applicable agreement. Unified Pricing can rank by attributes instead. Date type for matching can be today, requested ship, requested receipt, or created date.

**Interpretation.** Channel and customer-group prices are not the product's base price. Which calendar date counts as "now" for effectivity is itself a policy.

**Decision state.** `supported`.

## E-018. ValueFlows publishes Intents. Agreement is later

**Kind.** domain evidence.

**Source.** S-VF-01. Sibling S-SIB-16 L-001.

**Observed.** A Proposal publishes one or more primary Intents and optional reciprocal Intents. An Intent can appear in more than one Proposal, for example wholesale and retail price lists. Proposal Lists group proposals. Audience can be public, a club, or one agent. Matching may start a conversation that becomes an Agreement. Agreements can also start without a Proposal.

**Interpretation.** A published priced intent is not a commitment. Price lists can be a grouping of published intents.

**Decision state.** `supported`.

## E-019. Selling and buying rates are different facts

**Kind.** domain evidence.

**Source.** S-EN-02, S-MQ-01.

**Observed.** ERPNext stores buying and selling Item Prices separately. A Price List is selling, buying, or both. Moqui `ProductPrice` can name vendor and customer and a purpose of purchase versus sale.

**Interpretation.** The amount we will pay a supplier and the amount we will ask a customer are not one price with a sign flip.

**Decision state.** `supported`.

## E-020. UOM and quantity breaks change which rate applies

**Kind.** domain evidence.

**Source.** S-EN-01, S-EN-02, S-MQ-01, S-OD-01.

**Observed.** ERPNext Item Price is UOM-specific. Price Not UOM Dependent can scale a kilo rate to a box. Minimum quantity gates the rate. Moqui `minQuantity` is a break. Odoo pricelist rules have Min Qty.

**Interpretation.** A price without unit and without quantity predicate is incomplete.

**Decision state.** `supported`.

## E-021. Channel is not the product

**Kind.** domain evidence.

**Source.** S-EN-02, S-OD-01, S-OD-02, S-MQ-01, S-MQ-03, S-DY-01, S-AM-03.

**Observed.** ERPNext Price Lists take countries and can be tagged to a customer. Odoo pricelists take Country Groups, Company, and eCommerce Selectable. Loyalty programs take Website and Point of Sale. Moqui prices and promotions take ProductStore. Dynamics price groups attach to channels. Amazon offers take marketplace_id and audience.

**Interpretation.** The same SKU can have many live commercial offers. Listing identity is not product identity. Issue 15 owns the SKU.

**Decision state.** `supported` for the split. Canonical listing identity stays `undetermined`. See Q-PR-01.

## E-022. Promotion expiry is evaluated at apply time

**Kind.** domain evidence.

**Source.** S-EN-03, S-EN-05, S-EN-06, S-OD-02, S-MQ-03.

**Observed.** ERPNext Pricing Rule and Coupon have Valid From / Valid Upto. A discount can disappear after the order changes date, qty, or party. Quotation Expired is a status when Valid Till passes. Odoo programs have Start Date and End Date. Moqui promotions use Order Placed date, or current date if not yet placed, against From/Thru.

**Interpretation.** Effectivity is a predicate over a chosen business date, not a deleted row. Which date is "the" date is not universal. See E-017.

**Decision state.** `supported` for dated effectivity. `undetermined` for which timestamp is authoritative.

## E-023. Floor and ceiling prices appear as offer constraints

**Kind.** domain evidence.

**Source.** S-AM-03, S-EN-04, S-MQ-01.

**Observed.** Amazon exposes minimum and maximum seller-allowed prices and MAP on the purchasable offer. ERPNext points minimum selling price at Selling Settings and warns that item margin is not cost. Moqui has max/min price types.

**Interpretation.** A policy can refuse a reprice or a transaction rate below a floor. The floor's basis (cost, MAP, list, valuation) is not shared.

**Decision state.** `supported` that floors exist. `hypothesis` that one MarginPolicy form covers them.

## E-024. Approval of price override is uneven

**Kind.** domain evidence.

**Source.** S-EN-03, S-OD-01, S-MQ-03. S-LAND.

**Observed.** ERPNext documents Ignore Pricing Rule as an approved exception. Odoo says the sales order can always override. Moqui allows a manual price when the user is allowed. `research/reference-landscape.md` records Ontologiq propose, approve, re-read. That note is not this issue's proof.

**Interpretation.** Sources do not converge on a required approval threshold. Authority still matters when override exists.

**Decision state.** `undetermined` as a universal approval law. `supported` that override is not silent field mutation in the stricter sources.

## E-025. Concurrent applicable prices need a resolution rule

**Kind.** domain evidence.

**Source.** S-EN-03, S-OD-01, S-MQ-03, S-DY-01, S-DY-03.

**Observed.** ERPNext uses Priority and optional stacking, including discount-on-discounted-rate. Odoo takes the product rule over the category rule. Moqui uses sequence and quantity consumption. Dynamics Find-next takes lowest, or rank, then lowest.

**Interpretation.** Two live prices for the same item and context is a normal state. The resolution function is policy, not identity.

**Decision state.** `supported`.

## E-026. Featured-offer target is not the transaction price

**Kind.** domain evidence.

**Source.** S-AM-04, S-AM-05.

**Observed.** FOEP is a computed target that may win featured placement. Eligibility also depends on fulfillment and customer segment. Average selling price and competitive threshold are other reference numbers. None of them is the price a buyer later pays on an order.

**Interpretation.** Intelligence numbers are inputs to a Reprice Action. They are not the commercial offer and not the settlement amount.

**Decision state.** `supported`.

## E-027. List price on Amazon is a reference, not the offer

**Kind.** domain evidence.

**Source.** S-AM-05, S-DY-01, S-EN-01.

**Observed.** Amazon `msrpPrice` is suggested retail from manufacturer, supplier, or seller. Zero means "no list." Dynamics base price is the product field used only when no trade agreement hits. ERPNext Item Price on a Standard Selling list is the usual fetch source and can still be replaced by a rule or a typed rate.

**Interpretation.** List, agreement, and offer can coexist. Treating list as the only price loses channel and negotiation.

**Decision state.** `supported`.

## E-028. Offer versus commitment is already supported in O2C

**Kind.** domain evidence.

**Source.** S-SIB-16 L-001 and L-002. S-EN-06. S-VF-01.

**Observed.** Issue 16 L-001. A published priced proposal can expire without creating stock, receivable, or leftover demand. L-002. Accepting an order creates leftover demand and does not by itself move inventory. This folder's quotation and ValueFlows proposal pages agree.

**Interpretation.** Pricing research should not re-litigate that split. It should ask which priced object is the offer and which priced object is the commitment.

**Decision state.** `supported`. Quote-versus-order identity remains `undetermined` per S-SIB-16b.
