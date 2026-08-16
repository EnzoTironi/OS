# Evidence

**Kind:** labeled evidence blocks  
**Fetched:** 2026-08-16  
**Decision:** none accepted from this file alone.

Each block is one of `domain-evidence`, `source-artifact`, `candidate-law`, `counterexample`, or `runtime-consequence`. Laws are restated in [candidate-laws.md](candidate-laws.md). Tests that try to kill them are in [adversarial.md](adversarial.md).

## 1. Number kinds

### E-NUM-01. Exact decimal versus IEEE binary

- **Kind:** domain-evidence
- **Sources:** W3C XML Schema 2 §3.2.3 and §3.2.4. PostgreSQL 18 §8.1.2 and §8.1.3.
- **Observation:** XML Schema `decimal` is the set `i × 10^-n`. Trailing zeros are not part of the value. `2.0` equals `2.00`. `float` and `double` are IEEE 754 binary significand times a power of two, plus infinities and NaN. PostgreSQL says `numeric` is exact and is the type to use for monetary amounts. `real` and `double precision` are inexact. Equality comparison of floats is unreliable.
- **Decision:** `supported` that money and counted commercial quantity cannot use binary float as the semantic number.

### E-NUM-02. Scale is a constraint, not the value

- **Kind:** source-artifact
- **Sources:** XML Schema `decimal` note. PostgreSQL `NUMERIC(precision, scale)`. Palantir OSv2 decimal migration errors.
- **Observation:** Schema decimal does not remember that a value was entered as `2.00`. PostgreSQL declared scale rounds on write. Palantir Object Storage v2 refuses a Decimal property that lacks precision and scale (`DecimalPropertyTypeMissingPrecisionOrScale`).
- **Interpretation:** Stored scale and rounding-on-write are implementation choices. The semantic question is whether a value carries a rounding policy or only a magnitude.
- **Decision:** `hypothesis` that magnitude and rounding policy are separate facts.

### E-NUM-03. Tie rounding is not one law

- **Kind:** counterexample
- **Source:** PostgreSQL 18 numeric types, the `round` comparison table.
- **Observation:** `numeric` rounds ties away from zero. `double precision` on most machines uses round-ties-to-even. `-2.5` becomes `-3` as numeric and `-2` as float.
- **Runtime consequence:** A Function that mixes float intermediates with decimal money can change a posted total without changing inputs.
- **Decision:** `supported` that rounding mode must be named.

## 2. Money and currency

### E-MNY-01. Currency identity is a code catalog

- **Kind:** domain-evidence
- **Source:** ISO 4217:2015 overview.
- **Observation:** A currency has a three-letter alphabetic code, a three-digit numeric code, and, when it has minor units, a stated ratio of 100 or 1000. Historical codes live in List 3. The catalog is maintained and amended.
- **Interpretation:** ISO 4217 is evolving reference data, not a closed engine enum.
- **Decision:** `supported`.

### E-MNY-02. Currency master is not a rate

- **Kind:** source-artifact
- **Sources:** ERPNext Currency. ERPNext Currency Exchange.
- **Observation:** The Currency record stores code, symbol, fraction name, fraction units, smallest circulating fraction, and number format. It stores no rate. Enabling EUR does not convert money, create a EUR ledger, or change Company currency. Rates live on dated Currency Exchange rows with From, To, buying flag, and selling flag. The inverse pair is a separate record.
- **Decision:** `supported` as ERPNext behavior. Independent confirmation in Odoo 18, where rates sit on the currency under a Rates tab, not inside the code itself.

### E-MNY-03. Three money roles on one invoice

- **Kind:** domain-evidence
- **Sources:** ERPNext multi-currency accounting. Odoo 18 multi-currency.
- **Observation:** Company currency is the book. Account currency is the ledger's fixed denomination. Transaction currency is what the party sees. A Price List can add a fourth pricing currency. ERPNext converts item prices with Price List Exchange Rate and converts the document with Exchange Rate. Those two rates can differ.
- **Candidate implication:** A Money value names its currency. It does not know which of those four roles it is playing. Role is a fact about the Property or the Action, not about the number type.
- **Decision:** `supported` that the roles exist. `hypothesis` that role stays off the value type.

### E-MNY-04. Circulating coin is not book precision

- **Kind:** domain-evidence
- **Sources:** ERPNext Currency field table. Odoo 18 cash rounding.
- **Observation:** ERPNext states that Smallest Currency Fraction Value is not Currency Precision. A whole-number currency can still show decimals in reports because hiding places is not stored precision. Odoo cash rounding exists when the lowest coin is coarser than the unit of account. Strategies are "add a rounding line" or "modify tax amount". Methods include UP, DOWN, and HALF-UP.
- **Decision:** `supported`.

### E-MNY-05. Rate is dated, directional, and sticky on submit

- **Kind:** source-artifact
- **Sources:** ERPNext Currency Exchange. ERPNext multi-currency accounting. Odoo 18 exchange difference example.
- **Observation:** Lookup is latest eligible rate on or before the transaction date, then stale-day policy, then provider, then manual entry. Buying and selling can differ. A submitted invoice keeps its rate. Later master edits do not revalue it. Payment at a different rate creates a realized difference. Open balances at a reporting date create unrealized difference via revaluation. Revaluation changes company-currency carrying value and does not change the foreign amount.
- **Runtime consequence:** Conversion is a Function over a rate fact plus a document date. It is not a total operation on two Money values.
- **Decision:** `supported`.

### E-MNY-06. JSR 354 splits amount, currency, context, and rounding

- **Kind:** source-artifact
- **Sources:** JSR 354 specification 1.1. `javax.money` package summary.
- **Observation:** `MonetaryAmount` exposes `getCurrency()`, `getNumber()`, and `getContext()`. Rounding is `MonetaryRounding`. The JSR requires a minimal ISO rounding set and custom roundings. Exchange, historic validity, and regional variants are extension points. The spec says one implementation cannot cover all identified aspects, so multiple amount implementations are required.
- **Interpretation:** Even a dedicated money API refuses a single kernel number class.
- **Decision:** `supported` as API evidence. Not a commitment to adopt JSR 354.

### E-MNY-07. Moqui treats currency as a UoM type

- **Kind:** source-artifact
- **Source:** Moqui Data Model Patterns, Units of Measure.
- **Observation:** `moqui.basic.Uom` covers length, weight, temperature, data size, and currency. `UomConversion` has `conversionFactor`, `conversionOffset` for Celsius or Fahrenheit, and optional `fromDate` or `thruDate` because some conversions, "such as currency", change over time.
- **Divergence:** ERPNext and Odoo keep Currency beside UoM. Moqui unifies them and uses effective dates on the conversion row. UCUM's dimensional algebra has no dated conversion.
- **Decision:** `undetermined` whether OS should treat currency as a Unit. Current lean is no. See L-MNY-02.

## 3. Quantity, unit, dimension

### E-QTY-01. Unit expressions have algebra and two equivalences

- **Kind:** domain-evidence
- **Source:** UCUM 2.2 sections 16 to 20.
- **Observation:** Units form an abelian group under multiplication. Two expressions can be equal or only commensurable. Commensurable units share a dimension and differ by a scalar magnitude. A unit relative to a basis is a pair `(r, û)` of magnitude and dimension vector. Full conformance compares semantics. Limited conformance may compare literals.
- **Decision:** `supported` as the metrological model. `hypothesis` that OS Functions that convert units must be fully conformant inside one dimension.

### E-QTY-02. Special units and arbitrary units break naive conversion

- **Kind:** counterexample
- **Source:** UCUM sections 21 to 25, Table 3, Table 4, §44.
- **Observation:** Degree Celsius is a special unit. `30 Cel` is not three times `10 Cel`. Prefixes scale the reading, not a ratio-scale unit. Arbitrary units such as `[iU]` are incommensurable with every other unit, including other arbitrary units. `%` is dimensionless `10*-2`. `%[slope]` is a different special unit. Annotations `{vol}` do not change meaning. `ppb` and `ppt` are deprecated because "billion" is ambiguous.
- **Decision:** `supported` that unit conversion is not a single multiply.

### E-QTY-03. QUDT splits quantity kind from unit

- **Kind:** domain-evidence
- **Source:** https://qudt.org/
- **Observation:** QUDT publishes separate vocabularies for units, quantity kinds, dimension vectors, constants, and systems of units. Stated use cases are conversion, dimensional analysis, and finding equivalent units or quantity kinds across systems.
- **Interpretation:** "5 kg" is a quantity. Mass is the kind. Kilogram is the unit. Length and mass do not convert.
- **Decision:** `supported` as an independent ontology split.

### E-QTY-04. ERP UoM is a name plus two conversion layers

- **Kind:** source-artifact
- **Sources:** ERPNext UoM, Selling in different UoM, fractions. Odoo 18 UoM.
- **Observation:** ERPNext UoM stores a name and a whole-number flag. Physical-ish factors live in UoM Conversion Factor. Business packs live on the Item UOMs table relative to Stock UoM. Stock ledger posts only in Stock UoM. A carton price need not be ten times the unit price. Odoo converts only inside a UoM category against a reference unit. The same category mechanism holds both "Box of 6" and centimeter-versus-meter. Odoo computed quantity is always a multiple of the UoM rounding precision.
- **Domain evidence:** A pack-of-six is a commercial counting convention. A kilogram is a physical unit. ERP schemas often collapse them.
- **Decision:** `supported` that the collapse exists. `hypothesis` that OS must keep physical dimension conversion and commercial pack conversion as different facts.

## 4. Percentages and rates

### E-PCT-01. Percent is a dimensionless unit, not a money type

- **Kind:** domain-evidence
- **Source:** UCUM Table 3.
- **Observation:** Percent is `%` = `10*-2` and is not metric. UCUM prefers a specific concentration unit such as `ug/l` over "parts per N" when the quantity is a concentration.
- **Counterexample:** `g%` drifted from a mass ratio to `g/dl` and regained a dimension. A percent-shaped token can hide a dimensional quantity.
- **Decision:** `hypothesis` that a Rate value must name its base and its period or dimension, not only a number and a `%` glyph.

### E-PCT-02. Exchange rate is not a percentage

- **Kind:** domain-evidence
- **Sources:** ERPNext Currency Exchange. JSR 354 use cases.
- **Observation:** An exchange rate is a dated ratio between two currencies, sometimes with a buying or selling side, sometimes with a validity window. JSR 354 says a rate can be current, deferred, or historic and has a defined validity scope.
- **Decision:** `supported` that FX rate, interest rate, tax rate, and dimensionless percent are different kinds even when all print as decimals.

## 5. Measurement uncertainty

### E-UNC-01. A measurement result is not a point

- **Kind:** domain-evidence
- **Sources:** JCGM 100:2008 definitions of standard uncertainty, combined standard uncertainty, coverage factor. Constitution rule 9.
- **Observation:** GUM evaluates Type A uncertainty from repeated observations and Type B from other information. Combined standard uncertainty is the standard uncertainty of a result obtained from several input quantities. A coverage factor, typically 2 to 3, expands that to an interval. The Guide targets a well-characterised physical quantity.
- **Interpretation:** "12.4 mm" without uncertainty is an incomplete measurement statement. It can still be a complete commercial quantity.
- **Decision:** `supported` in metrology. `undetermined` whether every OS Property may carry a GUM-shaped payload.

## 6. Time, calendars, intervals

### E-TME-01. Instant is not civil date

- **Kind:** domain-evidence
- **Sources:** `java.time` package summary. RFC 3339 §1 and §4.3. OWL-Time §3.
- **Observation:** `Instant` is a timeline timestamp. `LocalDate` is a date without time or zone and is the type `java.time` recommends for a birthday. RFC 3339 timestamps always have a stated relationship to UTC and describe an instant, not a period. Unknown local offset is `-00:00` and is not `Z`. OWL-Time splits `TemporalEntity` into `Instant` and `Interval`. `ProperInterval` has distinct beginning and end.
- **Decision:** `supported`.

### E-TME-02. Duration is not Period

- **Kind:** domain-evidence
- **Sources:** `java.time` Duration and Period. OWL-Time Duration versus DurationDescription.
- **Observation:** `Duration` is a nanosecond span on the timeline. `Period` is years, months, and days on the calendar. OWL-Time `Duration` is a decimal scaled by a temporal unit. `DurationDescription` uses calendar elements. One day as a calendar period is not always 86400 seconds.
- **Counterexample:** Adding `Period.ofDays(1)` across a DST spring-forward is not adding 24 hours.
- **Decision:** `supported`.

### E-TME-03. Zone id is not offset, and RFC 3339 refuses scheduling

- **Kind:** domain-evidence
- **Sources:** RFC 3339 §1. `java.time` design notes. OWL-Time TRS.
- **Observation:** RFC 3339 steers clear of the case where 17:00 on 23 March 2005 in New York depends on later DST law. `java.time` says widespread zone use adds considerable complexity and recommends storing ISO types, converting other calendars at the UI. Offset types exist because databases often store `+02:00` and cannot store `Europe/Paris`. OWL-Time allows non-Gregorian temporal reference systems.
- **Runtime consequence:** A promised local date is not an Instant until a zone and an offset-resolution policy are bound.
- **Decision:** `supported`.

### E-TME-04. Business days are not in the temporal kernel sources

- **Kind:** source-artifact
- **Sources:** RFC 3339 scope. `java.time` TemporalAdjuster example (`next(FRIDAY)`). ISDA or FpML not fetched.
- **Observation:** Weekend skipping appears as an adjuster. Holiday calendars and settlement conventions do not appear in RFC 3339 or the `java.time` core types.
- **Decision:** `hypothesis` that business-day math is a Function over Calendar facts. `undetermined` until a financial-calendar primary source is fetched.

## 7. Identifiers, enums, absence

### E-ID-01. Some numbers are identifiers

- **Kind:** source-artifact
- **Source:** Palantir properties overview.
- **Observation:** `Long` is discouraged as a primary key because JavaScript cannot represent integers above 1e15 faithfully. Time values are discouraged as keys because storage format and display format can collide. Float-like types cannot be keys.
- **Decision:** `supported` that identifier and quantity are different types even when both look numeric.

### E-ID-02. Closed enum versus catalog

- **Kind:** domain-evidence
- **Sources:** ISO 4217 List 3. Moqui Enumeration versus StatusItem. ERPNext "enable existing currency".
- **Observation:** ISO 4217 is amended. Historical codes remain. ERPNext ships codes and asks the operator to enable them. Moqui stores enumerations as rows typed by EnumerationType, and stores lifecycle statuses as a graph of StatusItem and StatusFlowTransition.
- **Decision:** `supported` that a closed algebraic enum and an open catalog are different.

### E-ABS-01. One null is too few

- **Kind:** domain-evidence
- **Sources:** Constitution rule 9. RFC 3339 unknown offset. Open question 5. Scenario S-004.
- **Observation:** A timeout is not a failure. RFC 3339 can say "UTC instant known, local offset unknown". SQL NULL, not fetched as a primary page this session, is widely used to collapse missing, unknown, and inapplicable.
- **Decision:** `hypothesis` that absence is a sum type. Not `supported` until a SQL or RDF missing-value primary page is cited in a follow-up.

## Convergence

Independent sources that make the same distinction.

| Distinction | Who agrees |
| --- | --- |
| Exact decimal versus binary float for money | XML Schema, PostgreSQL, Palantir Decimal, JSR 354 number-plus-currency, ERP and Odoo stored amounts |
| Currency code catalog with minor units | ISO 4217, ERPNext Currency, Odoo Currencies, JSR 354 ISO-4217 plus custom |
| Rate is dated and not part of the currency code | ERPNext Currency Exchange, Odoo Rates tab, JSR 354 validity scope, Moqui dated `UomConversion` |
| Coin, display, and calculation precision differ | ERPNext Currency FAQ, Odoo cash rounding, JSR 354 display rounding versus bookable rounding |
| Quantity is number plus unit | UCUM, QUDT, ERPNext qty plus UoM, Odoo qty plus UoM, Moqui value plus `uomId` |
| Instant versus interval or date | RFC 3339, `java.time`, OWL-Time |
| Timeline duration versus calendar period | `java.time`, OWL-Time |
| Measurement includes uncertainty | GUM, constitution rule 9 |

## Divergence

| Topic | Disagreement | Plausible reason |
| --- | --- | --- |
| Is currency a UoM? | Moqui yes. ERPNext and Odoo no. UCUM does not treat money as a physical unit. JSR 354 gives money its own API. | Framework reuse versus metrology versus banking API history. |
| Where do pack conversions live? | ERPNext item table plus global factor. Odoo category plus reference unit. UCUM only dimensional algebra. | Commercial packs are not physical units. |
| Inverse FX rate | ERPNext stores each direction. Some systems invert. | Bid or ask spread and rounding make exact inverses false. |
| Decimal trailing zeros | XML Schema value space forgets them. Palantir and PostgreSQL require declared scale. | Interchange versus storage. |
| Calendar in the data model | `java.time` says keep ISO in storage. OWL-Time first-classes TRS. | Interoperability versus cultural time. |
| Uncertainty on every value | GUM yes for measurements. ERP quantity fields are points. | Commercial quantity is often a commitment, not a measurement. |

## Source artifacts that must not become OS primitives

These are useful and source-shaped.

- ERPNext DocTypes Currency, Currency Exchange, UoM, UoM Conversion Factor, Exchange Rate Revaluation.
- Odoo UoM Categories, Cash Rounding records, Automatic Currency Rates interval.
- Moqui `moqui.basic.Uom` and `UomConversion` entities.
- Palantir property base-type union and OSv2 precision or scale columns.
- JSR 354 SPI and multiple `MonetaryAmount` implementations.
- PostgreSQL `numeric` versus `money` storage types. The PostgreSQL `money` type page was not fetched. Do not treat `money` as recommended.

A one-to-one map from any of those tables to an OS Type is forbidden by constitution rule 2.
