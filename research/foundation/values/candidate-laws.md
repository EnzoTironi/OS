# Candidate laws

**Kind:** candidate-law  
**Decision:** each law is `hypothesis`, `supported`, `rejected`, or `undetermined`. None is accepted.  
**Falsifiers:** [adversarial.md](adversarial.md)

A law is the smallest claim that explains the evidence. If composition already preserves meaning, constitution rule 1 says not to add a primitive.

## Number and rounding

### L-NUM-01. Binary float is illegal for money

- **Claim:** A Property or Function that represents money or a counted commercial quantity must use exact decimal (or integer minor units), not IEEE 754 binary float.
- **State:** `supported`
- **Evidence:** E-NUM-01, E-NUM-03, PostgreSQL's own money warning, Palantir Decimal as a distinct base type.
- **Falsifier:** A statutory money calculation that is only correct in binary float.
- **Runtime consequence:** The engine rejects `BinaryFloat` where the Property kind is money. Intermediates that widen to float fail the Function.

### L-NUM-02. Rounding is an operation with a name

- **Claim:** Rounding mode, increment, and application point are explicit. They are not an implicit property of the number type.
- **State:** `supported`
- **Evidence:** E-NUM-03, E-MNY-04, E-MNY-06, Odoo cash-rounding strategies.
- **Falsifier:** A domain where all observers agree on one implicit rounding and never need to name it.
- **Runtime consequence:** Posted totals cite the policy. Two policies on one document are two Functions, not one silent coercion.

### L-NUM-03. Display, scale, and coin are three facts

- **Claim:** Number format, stored or calculated scale, and smallest circulating denomination are independent. Setting one does not set the others.
- **State:** `supported`
- **Evidence:** E-MNY-04, ERPNext Currency FAQ, E-NUM-02.
- **Falsifier:** A currency whose legal book, display, and coin increments are always identical and legally required to stay identical.
- **Runtime consequence:** Reports that hide decimals are not evidence of stored precision.

## Money and FX

### L-MNY-01. Money is amount plus currency

- **Claim:** A money value is an exact decimal together with a currency identifier. A bare decimal is not money.
- **State:** `supported`
- **Evidence:** E-MNY-01, E-MNY-06, ERPNext and Odoo document currency fields.
- **Falsifier:** A real operational money that has an amount and no currency, or a currency that is only a display symbol.
- **Runtime consequence:** Adding two Money values with different currencies is a type error.

### L-MNY-02. Currency is not a physical unit

- **Claim:** Currency conversion is a dated economic fact. It is not UCUM commensurability. Currency is not the same kind as kilogram.
- **State:** `hypothesis`
- **Evidence:** E-MNY-07 (Moqui disagrees), E-MNY-05, UCUM's physical algebra, JSR 354's separate API.
- **Why not `supported`:** Moqui's unification is a real independent system. Kill it only after more corpora, including FIBO, are read.
- **Falsifier:** A metrological conversion from USD to EUR that uses only dimension vectors and a constant, with no date and no market or contract rate.
- **Runtime consequence:** The engine may share "magnitude plus code" shape between Quantity and Money. It must not share the conversion Function.

### L-MNY-03. An FX rate is a fact, not a Currency property

- **Claim:** Conversion consumes a rate fact with from, to, at-least-a-date, and optional side. The inverse is not implied. Submitted use of a rate does not change when the catalog changes.
- **State:** `supported`
- **Evidence:** E-MNY-02, E-MNY-05, JSR 354 validity scope.
- **Falsifier:** A system that can always invert a rate without residual and can rewrite history by editing the catalog.
- **Runtime consequence:** `convert(money, target, context)` is a Function. `Money` has no `.as(EUR)` without context.

### L-MNY-04. Realized and unrealized differences are different events

- **Claim:** Settlement at a new rate and period-end revaluation are different facts. Revaluation does not change the foreign amount.
- **State:** `supported` as ERP and Odoo behavior. `hypothesis` as an OS law, because accounting recognition may belong to the accounting domain issue.
- **Evidence:** E-MNY-05.
- **Falsifier:** A domain where revaluation mutates the original foreign amount and remains legally correct.

## Quantity and units

### L-QTY-01. Quantity is magnitude plus unit

- **Claim:** A physical or counted measure is not a bare number. Conversion inside one dimension is a Function. Addition across incommensurable dimensions is a type error.
- **State:** `supported`
- **Evidence:** E-QTY-01, E-QTY-03, ERP and Odoo qty-plus-UoM fields.
- **Falsifier:** A production system that adds kilograms to meters and gets a meaningful result without a hidden convention.

### L-QTY-02. Special and arbitrary units are not ratio-scale units

- **Claim:** Interval-scale and procedure-defined units do not participate in the same multiply-and-divide group as metre. The engine must flag them.
- **State:** `supported` as UCUM. `hypothesis` as an OS kernel flag, because ERP UoM catalogs mostly ignore this.
- **Evidence:** E-QTY-02.
- **Falsifier:** A correct conversion of two IU assay units that uses only UCUM algebra.

### L-QTY-03. Pack conversion is not dimensional conversion

- **Claim:** "1 carton = 10 each" is a commercial fact about a product. "1 kg = 2.20462262185 lb" is a unit fact. They must not share one silent table.
- **State:** `hypothesis`
- **Evidence:** E-QTY-04. Odoo puts both in one category mechanism. ERPNext splits global factors and item factors but still calls both UoM.
- **Falsifier:** A product whose pack factor is a physical dimension conversion and never a negotiated count.
- **Runtime consequence:** Stock ledgers pick one stock unit. Documents may show another. The pair is stored, not inferred at read time from a global table only.

### L-QTY-04. Whole-number units reject fractions

- **Claim:** Some units make a non-integer magnitude illegal.
- **State:** `supported`
- **Evidence:** ERPNext `Must be Whole Number`. Serialized-item note on the selling-UoM page.
- **Falsifier:** A serialized item that is correctly stocked as 0.5 of its identity unit.

## Rates and percents

### L-PCT-01. A rate names its base

- **Claim:** A dimensionless percent, a tax rate, an interest rate, and an FX rate are different types. A `%` glyph does not pick the type.
- **State:** `hypothesis`
- **Evidence:** E-PCT-01, E-PCT-02, the `g%` drift.
- **Falsifier:** A single percent type that serves tax, FX, slope, and concentration without mis-posting.

## Time

### L-TME-01. Instant, civil date, and zoned datetime are different types

- **Claim:** The engine distinguishes Instant, CivilDate, CivilDateTime, OffsetDateTime, and ZonedDateTime. Implicit coercion among them is a type error.
- **State:** `supported`
- **Evidence:** E-TME-01, E-TME-03, scenario S-001's four dates.
- **Falsifier:** A business date that is correctly stored only as a UTC Instant for all observers.

### L-TME-02. Timeline duration is not a calendar period

- **Claim:** `Duration` and `Period` do not add through the same operator.
- **State:** `supported`
- **Evidence:** E-TME-02.
- **Falsifier:** A month that is always the same number of seconds in every civil calendar and zone.

### L-TME-03. A local promise is not an Instant

- **Claim:** "Deliver on 18 August" is a CivilDate or a zoned civil datetime. It becomes an Instant only after zone and offset-resolution policy are bound. DST law can move the Instant without moving the civil promise.
- **State:** `supported`
- **Evidence:** RFC 3339 §1, `java.time` zone warning, S-001.
- **Runtime consequence:** Scenario S-001's requested, promised, planned, and actual dates can share `CivilDate` and still be four Facts.

### L-TME-04. Business-day arithmetic is not a temporal primitive

- **Claim:** Weekend and holiday adjustment is a Function over a Calendar object. The engine does not know "business day" as a base type.
- **State:** `hypothesis`
- **Evidence:** E-TME-04. Financial-calendar primaries not fetched.
- **Falsifier:** A business-day increment that is well-defined with no calendar input in every jurisdiction OS must support.

## Uncertainty and absence

### L-UNC-01. A measurement result includes uncertainty

- **Claim:** When the value is a measurement, the result is estimate plus uncertainty, not a point pretending to be exact.
- **State:** `supported` for metrology. `undetermined` as a required Property wrapper.
- **Evidence:** E-UNC-01.
- **Falsifier:** A measurement standard that treats the point as complete.

### L-UNC-02. Uncertainty is not a kernel primitive

- **Claim:** GUM structure is a domain value wrapper or a provenance payload. It does not join Type, Action, and Fact as a sibling primitive.
- **State:** `hypothesis` leaning reject-as-primitive. Not `rejected` until provenance issue #6 or #8 answers.
- **Evidence:** Constitution 1 and 6. RFC-0001 lists confidence under provenance, not as a base form.

### L-ABS-01. Absent, unknown, and not-applicable are distinct

- **Claim:** Missing, unknown, not-applicable, and zero are four different states. One SQL NULL cannot encode them.
- **State:** `hypothesis`
- **Evidence:** E-ABS-01, S-004, constitution 9.
- **Falsifier:** A single absence token that never changes Action retry, policy, or audit outcomes.

## Identity and classification

### L-ID-01. Identifiers are not magnitudes

- **Claim:** Codes do not admit arithmetic, even when spelled with digits.
- **State:** `supported`
- **Evidence:** E-ID-01, ISO 4217 numeric codes.
- **Falsifier:** A currency numeric code that is correctly averaged.

### L-ID-02. Closed enums are not catalogs

- **Claim:** A ClosedEnum changes only with ontology revision. A CatalogRef can gain rows without revising the value kind.
- **State:** `supported`
- **Evidence:** E-ID-02.
- **Falsifier:** ISO 4217 treated as a ClosedEnum that never needs List 3.

## Engine cut

### L-ENG-01. Value kinds are Property types, not new primitives

- **Claim:** The distinctions above are constructions of Property and Function types. They do not add a primitive to RFC-0001's candidate list.
- **State:** `hypothesis`
- **Evidence:** Constitution 1. RFC-0001 "typed properties cover them".
- **Falsifier:** A value distinction that cannot be enforced without a new kernel node.

### L-ENG-02. Catalogs, rates, and calendars stay in the model

- **Claim:** Currency lists, UoM tables, FX series, and holiday calendars are ontology content. The generic engine has no `if currency == BRL` and no baked weekend list.
- **State:** `supported` as a constitution restatement applied to this evidence.
- **Evidence:** Constitution 12. E-MNY-01. E-TME-04.

## Runtime pressure if the supported laws survive

These are enforcement properties, not storage choices.

1. Type check rejects money stored as `BinaryFloat`.
2. Type check rejects adding incommensurable quantities or different currencies.
3. Conversion Functions declare their rate or unit-factor inputs. They are not methods that hide context.
4. Rounding Functions are named and pinned on the Action revision that posted the total.
5. Temporal coercion is explicit. CivilDate to Instant requires zone and policy.
6. Replay of a historical Action pins the rounding policy, the unit conversion fact, and the FX fact actually used.
7. Surfaces may format numbers. They may not change the value kind.

Physical storage remains open question 18. `numeric` versus integer minor units is an implementation choice after the semantic type is fixed.
