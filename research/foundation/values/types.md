# Candidate value types

**Kind:** candidate constructions, not an accepted metamodel  
**Decision:** each row carries its own state  
**Related:** RFC-0001 Property and Function. Constitution rules 1 and 6.

Illegal combinations should be unrepresentable. A bag of optional fields that admits `amount` without `currency`, or `LocalDate` stored as `Instant`, fails that test.

## Number kinds

| Type | Meaning | Engine or domain | State | Falsifier |
| --- | --- | --- | --- | --- |
| `Integer` | Whole number. No fractional scale. | Engine | `supported` | A domain that needs fractional integers as a distinct kind. |
| `ExactDecimal` | `i × 10^-n` magnitude. No binary expansion. | Engine | `supported` | A money or stock case that requires binary float for correctness. |
| `BinaryFloat` | IEEE 754 binary, including infinities and NaN. | Engine, scientific and geometry only | `supported` as a restricted kind | A statutory total that is only representable as binary float. |
| `ScaleHint` | Declared maximum fractional digits. Not the magnitude. | Engine annotation or Property metadata | `hypothesis` | Proof that magnitude must carry trailing zeros as meaning. |

`ExactDecimal` does not remember that the user typed `2.00`. If a two-cent display is required, that is a rounding or format policy, not a second number.

## Unit-bearing values

| Type | Construction | Engine or domain | State | Must not admit |
| --- | --- | --- | --- | --- |
| `Unit` | Identified unit expression plus dimension, or an arbitrary-unit flag. | Engine library of unit terms. Catalog rows are domain. | `hypothesis` | Prefix on a non-metric atom. Conversion of two arbitrary units. |
| `Quantity` | `{magnitude: ExactDecimal, unit: Unit}` | Engine | `hypothesis` | Bare number used as a mass. Adding kg to m. |
| `QuantityKind` | Mass, length, currency-amount, dimensionless ratio. | Domain catalog, QUDT-shaped | `hypothesis` | Inferring kind only from a glyph. |
| `CommercialCount` | `{count: Integer or ExactDecimal, pack: CatalogRef}` | Domain | `hypothesis` | Silent conversion through a physical dimension. |
| `WholeQuantity` | Quantity whose unit forbids fractions. | Engine constraint or Unit flag | `supported` as a needed invariant | 1.5 serialized laptops. |

Physical conversion uses dimension and a constant factor, sometimes an offset. Commercial conversion uses an Item or Product fact. See E-QTY-04.

## Money

| Type | Construction | Engine or domain | State | Must not admit |
| --- | --- | --- | --- | --- |
| `CurrencyId` | ISO 4217 alphabetic or numeric code, or a dated historic code. | Engine branded identifier. Membership is domain catalog. | `supported` | Using `USD` as a Unit interchangeable with `kg`. |
| `Money` | `{amount: ExactDecimal, currency: CurrencyId}` | Engine | `supported` | Float amount. Amount without currency. Adding USD to EUR. |
| `RoundingPolicy` | Named mode, increment, and where it applies (line, tax, cash, book). | Engine enum plus increment. Which policy a document uses is domain. | `supported` | Implicit half-even on one path and half-away on another. |
| `FxRate` | `{from, to, factor, at, side?}` | Domain fact | `supported` | Inverse assumed exact. Rate stored on Currency. |
| `FxContext` | The rate fact plus the document date and the role (transaction, price list, revaluation). | Domain | `hypothesis` | Baking FX into the Money type. |

JSR 354's `MonetaryContext` is a source artifact for "amount implementations differ". OS does not need that SPI. It does need the split between amount, currency, and rounding.

## Temporal values

Aligned with `java.time` names so the distinctions stay auditable. These are candidate OS value kinds, not a Java dependency.

| Type | Meaning | Engine or domain | State | Must not admit |
| --- | --- | --- | --- | --- |
| `Instant` | Point on the UTC timeline. | Engine | `supported` | A birthday stored as an Instant. |
| `CivilDate` | Calendar date without time or zone. | Engine | `supported` | Treating it as midnight UTC. |
| `CivilTime` | Clock time without date or zone. | Engine | `supported` | Adding it to an Instant without a date and zone. |
| `CivilDateTime` | Date and time, no zone. | Engine | `supported` | Using it as an Instant. |
| `OffsetDateTime` | Date and time plus a numeric offset. | Engine | `supported` | Treating `+02:00` as `Europe/Paris`. |
| `ZonedDateTime` | Date and time plus a zone id, offset resolved under a named policy. | Engine | `supported` | Resolving DST gaps without a policy. |
| `TimelineDuration` | Exact span on the timeline. | Engine | `supported` | "One month" as 30 days of seconds. |
| `CalendarPeriod` | Years, months, days. | Engine | `supported` | Adding a month as 2.6297e6 seconds. |
| `Interval` | Beginning and end TemporalEntity, or start plus duration. | Engine | `hypothesis` | `end < start`. Instant stored as a zero-width interval without saying so. |
| `UnknownOffsetInstant` | Instant whose local offset is unknown. RFC 3339 `-00:00`. | Engine | `hypothesis` | Collapsing to `Z`. |
| `Calendar` | Holiday and weekend rules. | Domain object | `hypothesis` | Hard-coding "Monday to Friday" in the engine. |
| `BusinessDate` | CivilDate interpreted on a Calendar. | Domain | `undetermined` | Promising "two business days" as TimelineDuration. |

RFC-0001 valid time versus knowledge time is a Fact annotation question. It is not a value-type question. A `CivilDate` can be used as valid time. That does not make every date a Fact.

## Measurement

| Type | Construction | Engine or domain | State |
| --- | --- | --- | --- |
| `Estimate` | Quantity or Money point used as the reported value. | Engine reuse of Quantity or Money | `hypothesis` |
| `StandardUncertainty` | Same dimension as the estimate. | Domain or optional wrapper | `undetermined` as kernel |
| `Coverage` | Factor k and the interval it implies. | Domain | `undetermined` as kernel |
| `Measurement` | `{estimate, uncertainty, coverage, procedure?}` | Domain wrapper. Procedure links to arbitrary-unit meaning. | `hypothesis` |

Do not put GUM on invoice lines by default. A committed order quantity is not a measurement.

## Identity, text, classification, absence

| Type | Meaning | Engine or domain | State |
| --- | --- | --- | --- |
| `Identifier` | Branded opaque code. Not arithmetic. | Engine | `supported` |
| `Text` | Human language string. | Engine | `supported` |
| `Boolean` | Two-valued. | Engine | `supported` |
| `ClosedEnum` | Fixed algebraic set that changes only with ontology revision. | Engine | `supported` |
| `CatalogRef` | Pointer into evolving reference data. Currency list, UoM list, country. | Engine pointer. Catalog is domain. | `supported` |
| `Absent` | Sum of `missing`, `unknown`, `not_applicable`. | Engine | `hypothesis` |

`unknown` is the S-004 timeout case. `missing` is "no value was supplied". `not_applicable` is "this Property does not apply to this individual". Zero is a present value.

## What belongs in the engine type system

Engine, if the claim survives more corpora:

1. Number kinds `Integer`, `ExactDecimal`, `BinaryFloat`.
2. `Identifier`, `Text`, `Boolean`, `ClosedEnum`, `CatalogRef`.
3. `Quantity` and a Unit term language with dimension and the special or arbitrary flags.
4. `Money` and `RoundingPolicy`.
5. The temporal split in the table above, except Calendar and BusinessDate.
6. `Absent` as a sum type usable at any Property.

Not engine primitives:

1. ISO 4217 rows, historic codes, symbols, and coin increments.
2. UoM conversion tables and item pack factors.
3. Exchange-rate series and revaluation journals.
4. Holiday calendars and settlement conventions.
5. GUM Type A or Type B budgets.
6. Tax rounding statutes.
7. Palantir or PostgreSQL storage facets.

Those are Types, Facts, or Functions in the ontology.

## Function input and output pressure

A Function that adds two values is total only when the types match.

- `Money + Money` requires the same `CurrencyId`. Cross-currency add is a type error.
- `Quantity + Quantity` requires commensurable units. The result unit is a defined choice, not "whatever the UI last showed".
- `Money * ExactDecimal` is total. `Money * Money` is not a Money.
- `Money * FxRate` is a Function only when the rate's `from` matches the money's currency and the rate's `at` is in the call's context.
- `CivilDate + CalendarPeriod` is total. `CivilDate + TimelineDuration` is not.
- `ZonedDateTime + TimelineDuration` is total. `ZonedDateTime + CalendarPeriod` needs a DST policy.
- `Absent` infects arithmetic unless the Function names a policy. SQL-style unknown propagation is one policy, not the only one.

## RFC-0001 contact

RFC-0001 asks whether value objects need a separate category or whether typed properties suffice. This folder's hypothesis is that the engine needs value *kinds* and constructions, not a new primitive beside Type, Property, and Function. `Money` is a Property type, not a sibling of Action.

Do not edit RFC-0001 from this branch. Independent sources converge on the number, money, quantity, and temporal splits. They do not yet converge on currency-as-unit or on kernel uncertainty.
