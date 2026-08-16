# Value system under Properties and Functions

**Track:** foundation  
**Issue:** [#62](https://github.com/EnzoTironi/OS/issues/62)  
**Fetched:** 2026-08-16  
**Decision:** none accepted. States below are `hypothesis`, `supported`, `rejected`, or `undetermined`.  
**Contract:** Agent output contract in `docs/swarm-research-backlog.md` (issue 74 not on `origin/main`).

This folder is Wave A evidence for the type and value system under Properties and Function inputs or outputs. It is not a type-system specification.

## Question

What value kinds must the engine distinguish so that money, physical quantity, civil time, measurement, and absence stay legally composable, and which of those kinds are ordinary domain types?

RFC-0001 already asks how units, currency, uncertainty, intervals, and validity attach to Property. Open question 15 asks what belongs in the ontology versus the runtime. This note attacks those questions from first-party money, unit, temporal, and measurement sources.

## File map

| File | Contract sections |
| --- | --- |
| [sources.md](sources.md) | Sources |
| [evidence.md](evidence.md) | Evidence, source artifacts, convergence, divergence |
| [types.md](types.md) | Candidate value types and engine versus domain cut |
| [candidate-laws.md](candidate-laws.md) | Candidate laws and runtime pressure |
| [adversarial.md](adversarial.md) | Counterexamples and adversarial tests |
| [open-questions.md](open-questions.md) | Unresolved uncertainty |

## Decision state snapshot

| Claim | State |
| --- | --- |
| Binary floating point is not a legal semantic type for money | `supported` |
| Exact decimal is the number kind for money and counted commercial quantity | `supported` |
| Display format, stored scale, and circulating coin are three different facts | `supported` |
| Money is amount plus currency plus an explicit rounding policy, not a bare number | `supported` |
| An exchange rate is a dated, directional fact, not a property of Currency | `supported` |
| Quantity is magnitude plus unit. Commensurable conversion is not the same as a business pack factor | `supported` |
| Currency is not the same kind of unit as kilogram | `hypothesis` |
| Instant, civil date, zoned civil datetime, timeline duration, and calendar period are distinct types | `supported` |
| Business-day arithmetic is a domain Function over Calendar facts | `hypothesis` |
| Measurement result is estimate plus uncertainty, not a point | `supported` as metrology. `undetermined` as a kernel Property shape |
| Absent, unknown, and not-applicable are distinct from each other and from zero | `hypothesis` |
| Closed enums and evolving reference catalogs are different | `supported` |
| Uncertainty, FX context, and holiday calendars are kernel primitives | `rejected` as primitives. They remain representable values or facts |

## Engine versus domain, one paragraph

The engine needs a small set of value constructions that make illegal mixes unrepresentable. Exact decimal, branded identifier, quantity with unit, money with currency, the java.time-shaped temporal split, and an explicit absence sum type are the current candidates. Currency catalogs, UoM conversion tables, exchange-rate series, holiday calendars, and GUM uncertainty budgets are domain objects or facts. Treating them as kernel nodes would bake ERP schema into the engine.

## Licensing

OS is MIT. ERPNext and Odoo notes record documented behavior only. No implementation was copied.
