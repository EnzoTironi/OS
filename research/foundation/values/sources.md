# Sources

**Kind:** source-system artifact inventory  
**Fetched:** 2026-08-16  
**Decision:** none. Presence on this list is not endorsement.

Every URL below was opened this session unless marked `not fetched`. Cite these pages, not memory.

## OS documents read on this branch

- `docs/thesis.md`
- `docs/constitution.md` (rules 1, 6, 9, 10, 13, 16, 18)
- `docs/open-questions.md` (questions 3, 5, 7, 8, 9, 15). This folder does not write answers into that file.
- `docs/research-program.md`
- `docs/swarm-research-backlog.md` Agent output contract
- `docs/hypothesis-history.md`
- `rfcs/0001-metamodel-hypothesis.md` (Property, Function, Time, Provenance)
- `scenarios/README.md` (S-001 dates, S-007 backdating)
- `research/README.md`
- `research/reference-landscape.md`
- GitHub issue [#62](https://github.com/EnzoTironi/OS/issues/62)

`docs/swarm-result-contract.md` is not on `origin/main`.

## Money and currency

| Source | URL | What was taken |
| --- | --- | --- |
| ISO 4217 overview | https://www.iso.org/iso-4217-currency-codes.html | Alphabetic and numeric codes. Minor-unit relationship 100 or 1000. Historical codes in List 3. Maintenance by SIX. |
| ERPNext Currency | https://docs.frappe.io/erpnext/currency | Currency master is identity and display. Smallest circulating fraction is not calculation precision. |
| ERPNext Currency Exchange | https://docs.frappe.io/erpnext/currency-exchange | Dated, directional, buying or selling rates. Inverse is not automatic. Submitted documents keep their rate. |
| ERPNext multi-currency accounting | https://docs.frappe.io/erpnext/multi-currency-accounting | Company, account, and transaction currencies. Realized versus unrealized difference. Account currency is immutable after postings. |
| Odoo 18 multi-currency | https://www.odoo.com/documentation/18.0/applications/finance/accounting/get_started/multi_currency.html | Main currency, dated rates, account currency lock, automatic exchange-difference journal. |
| Odoo 18 cash rounding | https://www.odoo.com/documentation/18.0/applications/finance/accounting/customer_invoices/cash_rounding.html | Physical coin can be coarser than the unit of account. Rounding is a named method with a strategy. |
| JSR 354 spec 1.1 | https://github.com/JavaMoney/jsr354-api/blob/master/src/main/asciidoc/JavaMoneySpecification.adoc | `CurrencyUnit`, `MonetaryAmount`, `MonetaryContext`, `MonetaryRounding`. Exchange is an extension. Historic and regional currencies. |
| JSR 354 package docs | https://javamoney.github.io/apidocs/javax/money/package-summary.html | Multiple amount implementations. Minimal ISO rounding set plus custom roundings. |

SIX list download page returned 404 this session. Minor-unit table was not independently downloaded.

## Units, dimensions, quantity

| Source | URL | What was taken |
| --- | --- | --- |
| UCUM 2.2 (2024-06-17) | https://ucum.org/ucum | Dimensional algebra. Equality versus commensurability. Special units on interval or log scales. Arbitrary units incommensurable. `%` = `10*-2`. Annotations in `{}` are meaningless. |
| QUDT.org | https://qudt.org/ | Quantity kind, unit, dimension vector, system of units. Conversion and dimensional analysis as use cases. |
| ERPNext UoM | https://docs.frappe.io/erpnext/uom | UoM name is not a conversion. Conversion Factor is a separate document. `Must be Whole Number`. |
| ERPNext fractions in UoM | https://docs.frappe.io/erpnext/managing-fractions-in-uom | Whole-number UoM rejects 1.5 Nos. |
| ERPNext selling in different UoM | https://docs.frappe.io/erpnext/Selling-in-different-UOM | Transaction qty versus stock qty. Item-level factor. Price may ignore the factor. Stock ledger stays in Stock UoM. |
| Odoo 18 UoM | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/product_management/configure/uom.html | Conversion only inside a category. Reference unit. Purchase UoM versus inventory UoM. Pack conversions live in the same mechanism as kg-to-lb. |
| Moqui data model patterns | https://moqui.org/m/docs/framework/Data+and+Resources/Data+Model+Patterns | `Uom` includes currency. `UomConversion` has factor, offset, and optional `fromDate` or `thruDate`. |

## Number kinds

| Source | URL | What was taken |
| --- | --- | --- |
| W3C XML Schema Part 2 | https://www.w3.org/TR/xmlschema-2/#decimal | `decimal` is `i × 10^-n`. 2.0 is not distinct from 2.00. `float` and `double` follow IEEE 754 binary. |
| PostgreSQL 18 numeric types | https://www.postgresql.org/docs/current/datatype-numeric.html | `numeric` is exact and recommended for money. `real` and `double precision` are inexact IEEE 754. Tie rounding differs. |
| Palantir property types | https://palantir.com/docs/foundry/object-link-types/properties-overview/ | `Date` versus `Timestamp`. `Float`, `Double`, `Decimal` cannot be primary keys. `Long` breaks above 1e15 in JavaScript. |
| Palantir ObjectPropertyType | https://github.com/palantir/foundry-platform-python/blob/develop/docs/v2/Ontologies/models/ObjectPropertyType.md | Official union of ontology property base types. |

## Time, calendars, intervals

| Source | URL | What was taken |
| --- | --- | --- |
| RFC 3339 | https://www.rfc-editor.org/rfc/rfc3339 | Internet timestamps are instants with a stated UTC offset. Scheduling and DST politics are out of scope. Unknown offset is `-00:00`, not `Z`. Leap seconds exist. Intervals are not covered. |
| `java.time` package (Java 21) | https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/time/package-summary.html | Instant, LocalDate, LocalTime, LocalDateTime, ZonedDateTime, OffsetDateTime, Duration, Period. Store ISO across boundaries. Calendar conversion is a UI concern. |
| OWL-Time CRD 2022-11-15 | https://www.w3.org/TR/owl-time/ | TemporalEntity splits into Instant and Interval. ProperInterval has distinct ends. Duration versus DurationDescription. Temporal reference system is not only Gregorian. |

## Measurement uncertainty

| Source | URL | What was taken |
| --- | --- | --- |
| JCGM 100:2008 GUM | https://www.bipm.org/documents/20126/2071204/JCGM_100_2008_E.pdf/cb0ef43f-baa5-11cf-3f85-4dcd86f77bd6 | Type A and Type B evaluation. Combined standard uncertainty. Coverage factor. Expanded uncertainty. |
| JCGM GUM Part 1 introduction | https://www.bipm.org/documents/20126/2071204/JCGM_GUM-1.pdf/74e7aa56-2403-7037-f975-cd6b555b80e6 | Suite framing. Guidance targets a well-characterised physical quantity. |
| BIPM JCGM publications index | https://www.bipm.org/en/committees/jc/jcgm/publications | Confirms JCGM 100:2008 and Amd.1:2026. |

## Not fetched this session

| Intended source | Why missing | Effect |
| --- | --- | --- |
| ValueFlows quantities | Fetch timed out | No VF `Measure` citation. Cross-link later to corpus #37. |
| SIX ISO 4217 code list files | 404 on the marketing URL | Minor-unit table not independently verified beyond ISO's prose. |
| IEEE 754 PDF | Paywalled. Cited through XML Schema and PostgreSQL. | Binary inexactness is still `supported`. |
| FIBO MonetaryAmount | Not opened | Financial-ontology money shape is `undetermined`. |
| TC39 Temporal | Not opened | Covered by `java.time` and RFC 3339. |
| IANA TZDB | Not opened | Zone-id versus offset distinction still stands from `java.time`. |
| ISDA or FpML business-day conventions | Not opened | Business-day law stays `hypothesis`. |

## Licensing note

ERPNext documentation is first-party product docs. Odoo 18 documentation is first-party product docs. Moqui documentation is first-party. Notes extract behavior and distinctions only.
