---
issue: 23
kind: source artifact
fetched: 2026-08-16
decision_state: supported
---

# Sources

First-party pages fetched or confirmed this session. Secondary blogs and SDK wrappers are listed only when the official page failed, and those cells stay `undetermined`.

**Kind.** source artifact for the URL list. Domain claims live in `evidence.md`.

## ERPNext / Frappe docs

| ID | URL | Fetched | Notes |
| --- | --- | --- | --- |
| S-EN-01 | https://docs.frappe.io/erpnext/item-price | 2026-08-16 | Item Price is selling or buying rate. UOM, packing unit, min qty, customer or supplier, batch, Valid From / Valid Upto, lead time. |
| S-EN-02 | https://docs.frappe.io/erpnext/price-lists | 2026-08-16 | Price List is a collection of Item Prices, selling, buying, or both. Country, enabled flag, UOM-dependent price. Older `/user/manual/en/selling/price-lists` path 404. |
| S-EN-03 | https://docs.frappe.io/erpnext/pricing-rule | 2026-08-16 | Pricing Rule replaces rate, applies discount or margin, or adds a free product. Validity, party, qty, amount, warehouse, company, currency, price list, priority, coupon-based, Ignore Pricing Rule. |
| S-EN-04 | https://docs.frappe.io/erpnext/adding-margin | 2026-08-16 | Margin is markup on Price List Rate, not valuation. Selling Settings mentioned for minimum selling price. |
| S-EN-05 | https://docs.frappe.io/erpnext/coupon-code | 2026-08-16 | Coupon Code is a token that points at one coupon-based Pricing Rule. Not a stored-value wallet. |
| S-EN-06 | https://docs.frappe.io/erpnext/quotation | 2026-08-16 | Quotation is a submittable offer with Valid Till. Statuses Draft, Open, Ordered, Lost, Expired, Cancelled. Print Heading does not change DocType. |
| S-EN-07 | https://docs.frappe.io/erpnext/promotional-scheme | 2026-08-16 | Linked from Pricing Rule. Fetch timed out. Cell stays thin. Use S-EN-03 FAQ that a Promotional Scheme generates several slab rules. |

## Odoo 18 docs

| ID | URL | Fetched | Notes |
| --- | --- | --- | --- |
| S-OD-01 | https://www.odoo.com/documentation/18.0/applications/sales/sales/products_prices/prices/pricing.html | 2026-08-16 | Pricelists suggest prices and can always be overridden on the sales order. Validity, min qty, country group, company, currency. Discount versus Formula visibility. |
| S-OD-02 | https://www.odoo.com/documentation/18.0/applications/sales/sales/products_prices/loyalty_discount.html | 2026-08-16 | Discount and loyalty programs are more varied, public, and time-sensitive than pricelists. Coupons, loyalty cards, promotions, discount codes, Buy X Get Y, next-order coupons. |
| S-OD-03 | https://www.odoo.com/documentation/18.0/applications/finance/accounting/taxes/B2B_B2C.html | 2026-08-16 | Tax-included and tax-excluded amounts are not symmetric. 8.26 × 1.21 = 9.99, not 10.00. Official advice is one stored reference. |

## Moqui / Mantle docs

| ID | URL | Fetched | Notes |
| --- | --- | --- | --- |
| S-MQ-01 | https://moqui.org/m/docs/mantle/Mantle+Structure+and+UDM/Product | 2026-08-16 | `ProductPrice` covers list, current, max/min, promotional, competitive types. `fromDate` / `thruDate`. Store restriction. `taxInPrice`. Currency UOM. |
| S-MQ-02 | https://www.moqui.org/m/docs/mantle/Mantle+Structure+and+UDM/Party | 2026-08-16 | Agreement and AgreementItem. ProductPrice can point at an AgreementItem for negotiated pricing. |
| S-MQ-03 | https://moqui.org/m/docs/apps/Marble+ERP+User+Guide/Configuration/Products/Pricing+and+Promotions | 2026-08-16 | Price lookup first. Promotions after, store-scoped, re-run on every order change. Manual price if the user is allowed. |

## Amazon Selling Partner API

| ID | URL | Fetched | Notes |
| --- | --- | --- | --- |
| S-AM-01 | https://developer-docs.amazon.com/sp-api/docs/product-pricing-api-v2022-05-01-use-case-guide | 2026-08-16 | Product Pricing API exists to feed repricers. `getCompetitiveSummary` and `getFeaturedOfferExpectedPriceBatch`. |
| S-AM-02 | https://developer-docs.amazon.com/sp-api/docs/listings-items-api-v2021-08-01-use-case-guide | 2026-08-16 | Listing updates are accepted for processing. Response is not the later live-state issues. Attributes versus live `fulfillmentAvailability`. |
| S-AM-03 | https://developer-docs.amazon.com/sp-api/docs/manage-purchasable-offer | 2026-08-16 | `purchasable_offer` is identified by `marketplace_id`, `currency`, and `audience`. `our_price`, MAP, discounted schedule, min/max seller allowed price. Amounts shown as `value_with_tax`. |
| S-AM-04 | https://developer-docs.amazon.com/sp-api/docs/return-batch-foep-data-set-skus | 2026-08-16 | FOEP is not a guarantee of featured-offer status. Competing offers change. Seller remains retailer of record. |
| S-AM-05 | https://developer-docs.amazon.com/sp-api/docs/pricing-faq | 2026-08-16 | Competitive Price Threshold from external retailers, names withheld. Average selling price excludes promotions. List/MSRP is a reference. `ANY_OFFER_CHANGED` versus `PRICING_HEALTH`. |
| S-AM-06 | https://developer-docs.amazon.com/sp-api/docs/product-fees-v0-use-case-guide | 2026-08-16 | Fee estimates are not guaranteed. Actual fees can vary. |

## Dynamics 365 Commerce

| ID | URL | Fetched | Notes |
| --- | --- | --- | --- |
| S-DY-01 | https://learn.microsoft.com/en-us/dynamics365/commerce/price-management | 2026-08-16 | Base price, trade agreement price, active price. Price groups bind prices and discounts to channel, catalog, affiliation, loyalty. Trade agreement always before base price. |
| S-DY-02 | https://learn.microsoft.com/en-us/dynamics365/commerce/tasks/base-price-trade-agreements | 2026-08-16 | Channel-specific sales prices through price groups on stores. |
| S-DY-03 | https://learn.microsoft.com/en-us/dynamics365/supply-chain/unified-pricing-management/upm-sales-trade-agreement-prices | 2026-08-16 | Concurrent trade-agreement resolution. Find-next lowest versus attribute rank. Date type can be today, requested ship, requested receipt, or created date. |

## ValueFlows

| ID | URL | Fetched | Notes |
| --- | --- | --- | --- |
| S-VF-01 | https://www.valueflo.ws/concepts/proposals/ | 2026-08-16 | Proposal publishes one or more Intents, optional reciprocal Intents. Proposal Lists can be price lists. Match may become Agreement. Intents page 404 this session. |

## Failed or blocked first-party pages

| ID | URL | Result | Consequence |
| --- | --- | --- | --- |
| S-FAIL-01 | https://docs.frappe.io/erpnext/user/manual/en/selling/price-lists | 404 | Used S-EN-02 instead. |
| S-FAIL-02 | https://www.odoo.com/documentation/18.0/applications/sales/sales/products_prices/loyalty.html | 404 | Used S-OD-02. |
| S-FAIL-03 | https://developer.ebay.com/api-docs/sell/inventory/overview.html | 403 | eBay offer and listing-fee cells are `undetermined`. |
| S-FAIL-04 | Mercado Libre developer price pages | no usable first-party body | Mercado Libre cells are `undetermined`. |
| S-FAIL-05 | https://www.valueflo.ws/introduction/flows/ and `/concepts/intents/` | 404 | Proposal page still usable. |

## Sibling research, read only

| ID | Path | Branch | Use |
| --- | --- | --- | --- |
| S-SIB-16 | `research/domain/o2c/candidate-laws.md` L-001, L-002 | `origin/cursor/issue-16-domain-cfd8` | Offer is not commitment. Commitment is not occurrence. Cited, not copied. |
| S-SIB-16b | `research/domain/o2c/open-questions.md` Q-O2C-02 | same | Quote and order identity split stays undetermined there. |
| S-SIB-15 | `research/domain/product/` | `origin/cursor/issue-15-domain-cfd8` | Product and SKU identity. Not rewritten here. |
| S-LAND | `research/reference-landscape.md` | `origin/main` | Ontologiq propose, approve, re-read. Landscape only. |

## Licensing note

ERPNext and Odoo are copyleft. Notes record documented behavior and public field names. No source was translated into OS code.
