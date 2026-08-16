# Open questions

**Kind:** unresolved uncertainty  
**Decision:** `undetermined` unless a row says otherwise  
**Rule:** Do not write answers into `docs/open-questions.md`. Cite a research artifact or leave the question open.

These are questions this Wave A pass did not close. A synthesis agent should not treat silence as a default.

## Q-62-01. Is currency a Unit?

Moqui models currency as a `Uom` type with dated conversions. ERPNext, Odoo, UCUM, and JSR 354 keep money beside physical units. L-MNY-02 is `hypothesis`. FIBO MonetaryAmount was not fetched. Until that page and at least one more independent financial ontology agree, do not collapse Money into Quantity.

## Q-62-02. Integer minor units versus ExactDecimal

ISO 4217 states a 100 or 1000 relationship for currencies that have minor units. Some ledgers store integer cents. JSR 354 allows multiple amount implementations. This folder did not compare overflow, allocation, and tax-split behavior of the two representations. Storage is open question 18 in `docs/open-questions.md`. This note does not answer it.

## Q-62-03. Does every Quantity carry a QuantityKind?

QUDT says kind and unit are different. UCUM recovers dimension from the unit term. ERP UoM names often have no kind. Whether OS stores kind explicitly, derives it, or only checks dimension vectors is `undetermined`.

## Q-62-04. How are commercial packs identified?

L-QTY-03 is `hypothesis`. The pack might be a Product-linked Fact, a Relator, or a conversion Function with a product argument. Identity and lifecycle of "Box of 6 for Item X" belong to product and inventory issues, not to this folder.

## Q-62-05. Is uncertainty a Property wrapper, a provenance payload, or both?

GUM requires uncertainty on measurement results. RFC-0001 lists confidence under provenance. Constitution rule 8 and open question 8 ask the same thing. L-UNC-02 stays `hypothesis`. Issue 62 must not close open question 8.

## Q-62-06. May ordinary commercial quantities omit uncertainty?

Invoice qty 10 Nos is usually a commitment, not a measurement. GUM Part 1 targets a well-characterised physical quantity. Whether a committed quantity is allowed to be a point is `undetermined`. A-UNC-01 is the wedge.

## Q-62-07. What is the interval type?

OWL-Time ProperInterval, start-plus-duration, and quantity ranges (min or max price) are three shapes. Type-system discipline prefers start plus duration for a time range. Quantity ranges may be a different type. Not decided.

## Q-62-08. Which calendars are first-class values?

`java.time` keeps non-ISO calendars at the UI. OWL-Time first-classes a temporal reference system. Fiscal calendars, 4-4-5 retail calendars, and Hijri dates were not fetched. L-TME-01 does not pick a calendar algebra.

## Q-62-09. Business-day conventions

ISDA, FpML, and central-bank holiday lists were not fetched. L-TME-04 remains `hypothesis`. Do not invent a convention list here.

## Q-62-10. Absence versus SQL NULL versus RDF

E-ABS-01 is `hypothesis`. No SQL standard page and no RDF missing-value note was fetched this session. Open question 5 (`unknown` after timeout) is not answered. S-004 still stands as the scenario.

## Q-62-11. Percent, basis points, and "rate"

No first-party interest-rate or tax-rate standard was fetched beyond UCUM `%` and ERP FX rates. L-PCT-01 is `hypothesis`. Do not add a Rate primitive from aesthetics.

## Q-62-12. Leap seconds and smearing

RFC 3339 admits `23:59:60`. `java.time` Instant is a POSIX-like timeline in common implementations. Which Instant OS means is `undetermined`. A-TZ-06 is the test.

## Q-62-13. Are value kinds a new RFC-0001 primitive?

L-ENG-01 says no. That is `hypothesis`. Independent sources converge on the distinctions, not on a new kernel node. Do not edit RFC-0001 from this branch.

## Q-62-14. Function purity when conversion consults a catalog

Open question 9 asks whether a Function that depends on external state is still reproducible. Unit factors and FX rates are that state. This folder says the rate or factor must be an input or a pinned Fact. It does not decide Function determinism. See `docs/open-questions.md` question 9. Undetermined here.

## Q-62-15. Locale number parse

ERPNext warns that users enter values according to locale and must verify the parsed value. Parse-at-boundary is a type-system rule. Which locales and which parse failures are engine versus surface is `undetermined`.

## Questions from `docs/open-questions.md` that this folder must not answer

| Doc question | Why this folder stays silent |
| --- | --- |
| 3. Truth when sources disagree | Needs provenance research. Values can be labeled. Authority is not a value type. |
| 5. Unknown after timeout | L-ABS-01 is only a hypothesis. No SQL or effect-model close. |
| 7. Bitemporality | Valid time can use the temporal types. Whether every Fact carries both dimensions is not a value-system decision. |
| 8. Provenance and confidence | Q-62-05. |
| 9. Function versus Constraint versus Policy | Conversion Functions are examples, not a collapse proof. |
| 15. Ontology versus runtime | L-ENG-02 restates constitution 12. It does not choose a compiler or a store. |
| 18. Physical data model | PostgreSQL `numeric` is evidence that exact types exist. It is not a storage choice. |

If a later agent writes an answer into `docs/open-questions.md`, it must cite a path under `research/` and a decision state. Invented defaults are out of scope.

## Follow-ups that stay in this track

1. Fetch FIBO MonetaryAmount and ValueFlows Measure.
2. Fetch an ISDA or FpML business-day page.
3. Fetch a SQL NULL or three-valued-logic primary page and a W3C missing-value note.
4. Read ERPNext and Odoo tests for currency rounding and UoM conversion as behavior evidence, without copying code.
5. Cross-link corpus issues 32, 33, 34, 37 when those folders exist on `main`.
