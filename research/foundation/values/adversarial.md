# Adversarial tests

**Kind:** counterexample  
**Decision:** each case is a falsifier, not a passing test  
**Related:** `scenarios/README.md` S-001, S-004, S-007

These cases try to kill the laws in [candidate-laws.md](candidate-laws.md). A later synthesis agent should turn survivors into executable scenarios. None of these is an implementation.

## Currency rounding

### A-RND-01. Half-even versus half-away on a 0.5 cent

- **Attacks:** L-NUM-02
- **Setup:** Line amounts `1.125` and `1.125` in a currency with scale 2.
- **Expect if L-NUM-02 holds:** The posted total names the mode. Half-even and half-away can differ by 0.01.
- **Kills the law if:** The engine can pick either mode silently and still claim one total.

### A-RND-02. Cash coin coarser than book

- **Attacks:** L-NUM-03, L-MNY-01
- **Setup:** Books keep 0.01. Cash rounds to 0.05. Invoice total 10.02 paid in cash.
- **Expect:** Book amount, cash tendered, and rounding-line or tax-adjust amount are three values. Odoo documents both strategies.
- **Kills the law if:** One Money field is overwritten to 10.00 and the 0.02 disappears from the audit.

### A-RND-03. JPY scale 0 versus BHD scale 3

- **Attacks:** L-MNY-01, L-NUM-03
- **Setup:** Same Function posts JPY 1000 and BHD 1.000.
- **Expect:** Scale comes from the currency catalog, not from a global `2`.
- **Kills the law if:** Both store two decimals or both store zero.

### A-RND-04. Display format is not the ledger

- **Attacks:** L-NUM-03
- **Setup:** Currency number format hides decimals. Tax computation keeps four places.
- **Expect:** A report that prints `12` still has a stored value that can be `12.0049` or a separately rounded statutory amount.
- **Kills the law if:** Reprinting with another format changes the posted debit.

## Exchange rates

### A-FX-01. Inverse is not the reciprocal

- **Attacks:** L-MNY-03
- **Setup:** EUR to USD = 1.15. Ask for USD to EUR.
- **Expect:** Either a stored inverse or an explicit invert Function that names its rounding. ERPNext stores the other direction.
- **Kills the law if:** The engine uses `1/1.15` and posts both directions with no residual account.

### A-FX-02. Buying and selling sides

- **Attacks:** L-MNY-03
- **Setup:** Same pair, same date, different approved buy and sell rates.
- **Expect:** A sales invoice cannot consume the buying row.
- **Kills the law if:** One rate field serves both and the difference is unexplained.

### A-FX-03. Price-list rate versus document rate

- **Attacks:** L-MNY-03, L-MNY-01
- **Setup:** Price list in GBP. Invoice in EUR. Company in USD. Three rates.
- **Expect:** Item price conversion and document conversion are two Function applications. ERPNext names both fields.
- **Kills the law if:** One FX context is attached to Money and reused for both.

### A-FX-04. Submit then edit the master

- **Attacks:** L-MNY-03, L-MNY-04
- **Setup:** Invoice submitted at 1.15. Next day the catalog says 1.20.
- **Expect:** The invoice still explains 1.15. Revaluation, if any, is a new fact.
- **Kills the law if:** Opening the invoice rewrites Company-currency debit.

### A-FX-05. Zero foreign, nonzero books

- **Attacks:** L-MNY-04
- **Setup:** Foreign balance is 0 after settlement. Company-currency residue remains from rate movement. ERPNext documents this case.
- **Expect:** A revaluation or residual Function, not a mutation of the foreign Money to a nonzero amount.
- **Kills the law if:** The foreign amount is adjusted to "fix" the books.

## UoM conversion

### A-UOM-01. Carton price is not 10× unit price

- **Attacks:** L-QTY-03
- **Setup:** Stock UoM Unit. Carton factor 10. Carton price is a negotiated 9.5×.
- **Expect:** Stock qty uses 10. Amount uses the carton price. ERPNext "Price Not UoM Dependent" is the other policy and must be named.
- **Kills the law if:** Extending price always multiplies by the stock factor.

### A-UOM-02. kg to lb versus Box to Each

- **Attacks:** L-QTY-03, L-MNY-02
- **Setup:** Convert 2.5 kg to lb. Convert 2 boxes to each.
- **Expect:** First conversion uses a unit fact. Second uses a product fact. Failure modes differ when the product has no pack row.
- **Kills the law if:** Both are rows in one table and the engine cannot tell which kind failed.

### A-UOM-03. Cross-dimension add

- **Attacks:** L-QTY-01
- **Setup:** `3 kg + 2 m`.
- **Expect:** Type error. QUDT quantity kinds differ.
- **Kills the law if:** The engine returns `5` of a silent default unit.

### A-UOM-04. Celsius is not ratio scale

- **Attacks:** L-QTY-02
- **Setup:** Average or triple `10 Cel` and `30 Cel`. Convert `10 Cel` to K.
- **Expect:** Conversion uses the UCUM special-unit functions, not `× 3`. Moqui's offset field is the ERP-shaped cousin.
- **Kills the law if:** `30 Cel` is treated as three times `10 Cel`.

### A-UOM-05. Two international units

- **Attacks:** L-QTY-02
- **Setup:** Assay A reports `5 [iU]`. Assay B reports `5 [iU]` from another procedure.
- **Expect:** Incommensurable. UCUM §24.
- **Kills the law if:** They cancel in a stock balance.

### A-UOM-06. Whole-number UoM

- **Attacks:** L-QTY-04
- **Setup:** UoM Nos, must be whole. Quantity 1.5. Serialized laptop 0.5.
- **Expect:** Reject. ERPNext message is "Quantity cannot be a fraction".
- **Kills the law if:** Stock accepts 0.5 of a serial identity.

### A-UOM-07. Annotation is not a unit

- **Attacks:** L-QTY-01
- **Setup:** `kg{wet}` versus `kg{dry}`.
- **Expect:** UCUM semantics are both `kg`. If wet versus dry matters, that is a different Property or a qualifier Fact, not a unit.
- **Kills the law if:** The engine treats the annotation as a dimension.

### A-UOM-08. Mixed precision after conversion

- **Attacks:** L-NUM-02, L-QTY-01
- **Setup:** 1 in = 25.4 mm exact. Quantity 1/3 in, stock in mm, rounding increment 0.01 mm.
- **Expect:** The conversion Function names the rounding. Repeating convert-and-convert-back can drift. The stock ledger keeps one unit.
- **Kills the law if:** Round-trip is assumed lossless for every factor.

## DST, timezone, calendars

### A-TZ-01. Spring-forward gap

- **Attacks:** L-TME-01, L-TME-03
- **Setup:** `2026-03-08T02:30` in `America/New_York` (US spring-forward; confirm the year's rules before executing).
- **Expect:** Construction fails or applies a named gap policy. It does not become `07:30Z` by accident.
- **Kills the law if:** The value is stored as an Instant that no local clock showed.

### A-TZ-02. Fall-back overlap

- **Attacks:** L-TME-01
- **Setup:** `2026-11-01T01:30` in `America/New_York` occurs twice.
- **Expect:** Offset or "first or second" is required. `ZonedDateTime` without offset is incomplete.
- **Kills the law if:** Two real instants collapse to one.

### A-TZ-03. Offset is not a zone

- **Attacks:** L-TME-01, L-TME-03
- **Setup:** Store `2026-07-01T12:00+02:00`. Later ask what civil time that is in `Europe/Paris` after a rule change.
- **Expect:** The offset datetime is stable. A zone id would have followed the new rules for future civil times. RFC 3339 refuses this scheduling case.
- **Kills the law if:** `+02:00` is rewritten when TZDB updates.

### A-TZ-04. Unknown offset

- **Attacks:** L-ABS-01, L-TME-01
- **Setup:** RFC 3339 `-00:00`.
- **Expect:** Instant known, local offset unknown. Not equal to `Z`.
- **Kills the law if:** Parsers normalize to `Z` and later assume UTC-as-local.

### A-TZ-05. Birthday as Instant

- **Attacks:** L-TME-01
- **Setup:** Birth date `1970-01-01` stored as `1970-01-01T00:00:00Z`.
- **Expect:** A user in UTC−14 sees the previous civil date. `java.time` says use `LocalDate`.
- **Kills the law if:** The ontology has only Timestamp, as a Palantir-like pair of Date and Timestamp would already warn.

### A-TZ-06. Leap second

- **Attacks:** L-TME-02
- **Setup:** RFC 3339 `1990-12-31T23:59:60Z`.
- **Expect:** Either the type admits leap seconds or the Function that maps to a POSIX-like Instant names the smear or rejection.
- **Kills the law if:** The second is dropped and durations across the leap become 1 s short without a record.

## Business-day promises

### A-BD-01. Two business days over a holiday

- **Attacks:** L-TME-04, L-TME-03
- **Setup:** Promise "two business days" on a Thursday before a Friday public holiday.
- **Expect:** Result depends on a Calendar fact. Tuesday and Monday are both plausible under different calendars.
- **Kills L-TME-04 if:** The engine returns a date with no calendar input.

### A-BD-02. Business day is not 8 hours

- **Attacks:** L-TME-02, L-TME-04
- **Setup:** SLA "one business day" encoded as 86400 seconds.
- **Expect:** False. A business day is a CalendarPeriod-like step, not a TimelineDuration.
- **Kills the law if:** DST or a shortened session still counts as 86400 s of SLA.

### A-BD-03. Same Instant, two settlement dates

- **Attacks:** L-TME-03
- **Setup:** Trade Instant Friday 22:00 UTC. New York civil date still Friday. Tokyo already Saturday.
- **Expect:** Settlement CivilDate is a Function of zone and calendar, not of Instant alone.
- **Kills the law if:** One Instant implies one business date worldwide.

## Measurement uncertainty and mixed precision

### A-UNC-01. Adding a precise money to an uncertain length

- **Attacks:** L-UNC-01, L-UNC-02, L-QTY-01
- **Setup:** Invoice money `12.00 USD` and a measured `12.0 ± 0.3 mm`.
- **Expect:** No add. Different kinds. Uncertainty does not attach to the money by contagion.
- **Kills L-UNC-02 if:** The only way to keep the uncertainty is to make it a kernel primitive on every Property.

### A-UNC-02. Coverage factor dropped

- **Attacks:** L-UNC-01
- **Setup:** Report `12.4 mm` after computing expanded uncertainty with `k = 2`.
- **Expect:** Consumers cannot reconstruct the interval. GUM says the coverage factor is part of the statement.
- **Kills the law if:** Point-only storage is accepted as a complete measurement.

### A-UNC-03. Type A versus Type B hidden

- **Attacks:** L-UNC-01
- **Setup:** One uncertainty from repeats, one from a datasheet.
- **Expect:** Combined uncertainty is a Function that names both. The classification is evaluation method, not a value kind.
- **Kills the law if:** OS needs Type A and Type B as engine types.

### A-UNC-04. Mixed decimal scales in one sum

- **Attacks:** L-NUM-02
- **Setup:** `1.2 + 1.234 + 1.23` as money with policy "round each line to 2 then sum" versus "sum then round".
- **Expect:** Totals can differ by 0.01. The policy is on the Function.
- **Kills the law if:** Both policies produce one number and neither is recorded.

## Absence and identifiers

### A-ABS-01. Timeout is not zero money

- **Attacks:** L-ABS-01
- **Setup:** S-004. External FX provider times out.
- **Expect:** Rate is `unknown`. Not `0`, not yesterday's stale rate unless a stale policy is explicit. ERPNext stale-days setting is that policy.
- **Kills the law if:** NULL, 0, and last-good-rate are interchangeable.

### A-ABS-02. Not-applicable percent

- **Attacks:** L-ABS-01, L-PCT-01
- **Setup:** Discount % on a free-of-charge line that is not discounted, versus a line whose discount is unknown.
- **Expect:** `not_applicable` versus `unknown`.
- **Kills the law if:** Both store NULL and a report averages them as zero.

### A-ID-01. Numeric currency code arithmetic

- **Attacks:** L-ID-01
- **Setup:** Average ISO numeric codes 840 and 978.
- **Expect:** Type error.
- **Kills the law if:** The Function type-checks as `ExactDecimal`.

### A-ID-02. Closed enum of currencies

- **Attacks:** L-ID-02
- **Setup:** A new ISO 4217 amendment adds a code. List 3 retires another.
- **Expect:** Catalog update, not an ontology-revision of a ClosedEnum of all currencies.
- **Kills the law if:** Every ISO amendment is an OS primitive change.

## Cross-law stress

### A-X-01. Backdated stock in a foreign UoM

- **Attacks:** L-QTY-03, L-MNY-03, L-TME-01. Scenario S-007.
- **Setup:** Receipt recorded 12 August as 2 cartons. Valid movement was 8 August. Company currency revalued on 10 August.
- **Expect:** Stock qty in Stock UoM, valid time 8 August, knowledge time 12 August, FX facts for 8 and 10 stay distinct.
- **Kills several laws if:** One mutable row holds qty, UoM, date, and rate.

### A-X-02. Percent of a quantity with a unit

- **Attacks:** L-PCT-01, L-QTY-01
- **Setup:** "10% scrap of 80 kg".
- **Expect:** Result is 8 kg, a Quantity. The 10% is a dimensionless ratio applied by a Function. It is not a Unit on the scrap line unless someone models scrap as `kg` already.
- **Kills the law if:** Scrap is stored as `10 %` and later added to `80 kg`.
