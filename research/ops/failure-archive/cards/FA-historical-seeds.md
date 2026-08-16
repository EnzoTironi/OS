# Historical hypothesis dispositions

**Issue:** <https://github.com/EnzoTironi/OS/issues/81>  
**Primary source:** `docs/hypothesis-history.md` on `main`  
**Purpose:** preserve what happened to earlier ideas without rewriting a withdrawal of an assumption as a falsification.

A historical disposition is not necessarily an epistemic verdict. This file distinguishes:

- `rejected/falsified` — the scoped claim was actually defeated;
- `superseded` — a later framing replaced it without proving the earlier one false in every scope;
- `assumption-withdrawn` — OS stopped taking it as a starting assumption;
- `not-promoted` — it may remain a useful implementation mechanism or local pattern but did not earn semantic-primitive status;
- `scope-limited` — the idea remains live in a narrower context;
- `undetermined` — evidence is insufficient.

Do not infer the negation of a rejected claim. Do not infer a rejection from `not-promoted` or `assumption-withdrawn`.

## H0 — modern ERP replacement

**Hypothesis.** Replace a traditional ERP with a more modern ERP as the top-level product, with agents/ontology around it.

**Historical disposition:** `rejected/falsified` **as the top-level OS product framing**.

**What survived:** mature ERPs remain primary empirical corpora and may still be deployed as external systems/adapters.

**Why the framing lost:** it assumed ERP modules/forms/records were the fundamental product before asking what enterprise software would look like if ontology and agents were native.

**Revival test:** a future comparison may re-open the framing only if an ERP-centered architecture demonstrably produces the best semantics, governance and operation for the target system. ERP feature coverage alone is not that proof.

## H1 — ERP plus operational ontology

**Hypothesis.** Keep a traditional transaction system as one semantic authority and place an operational ontology/governed action layer above it.

**Historical disposition:** `assumption-withdrawn` **as the ideal greenfield starting architecture**; `scope-limited` and still `hypothesis` for brownfield integration.

This is **not archived as a falsified idea**. `docs/hypothesis-history.md` explicitly says it remains plausible as integration and is merely no longer assumed as the greenfield ideal.

**Pressure against it:** duplicating Product, Order, lifecycle, permission or action meaning across two independently writable authorities creates drift. Later kill tests attack that failure mode, not every possible ERP+ontology integration.

**Revival/validation test:** demonstrate an architecture where semantic ownership is explicit, duplicated representations are projections/adapters rather than rival authorities, and the integration preserves provenance and action semantics without drift.

## H2a — semantic Packs

**Hypothesis.** ManufacturingPack, AccountingPack, BrazilPack, etc. are fundamental business/ontology entities.

**Historical disposition:** `not-promoted` as a semantic primitive; the assumption was withdrawn.

A business contains manufacturing, accounting and Brazilian fiscal concepts. It does not follow that `Pack` is itself a real-world entity. Namespaces, modules, dependency graphs, distribution bundles and installable packages remain open implementation/toolchain choices.

**Falsification bar still open:** if a future domain actually requires a package/module itself to have business identity, lifecycle or authority, the semantic question can be re-opened. Choosing package-based software distribution does not do so.

## H2b — visible Compiler

**Hypothesis.** Compiler is a visible business/ontology primitive through which definitions become UI/API/MCP/runtime artifacts.

**Historical disposition:** `not-promoted` as a semantic primitive; `undetermined` as implementation architecture.

Interpretation, ahead-of-time compilation, code generation, schema generation, materialization and caching all remain legal techniques. The shared requirement is one semantic definition feeding multiple surfaces; it does not by itself make `Compiler` part of the business model.

## H2c — separate deterministic business kernels

**Hypothesis.** Accounting, inventory, manufacturing and fiscal each sit in a semantic `Deterministic Kernel` below the ontology and own the hard business rules.

**Historical disposition:** `assumption-withdrawn` / `not-promoted` as a second semantic authority. Specialized **physical evaluators/enforcement mechanisms remain live**.

The pressure that survived is determinism where invariants demand it. The current research hypothesis is that domain meaning such as balanced journals, valuation rules, BOM explosion or tax rules should remain explicit in the executable business model, while optimized evaluators may execute/enforce those definitions. External authorities are a separate case and need not compile OS-owned definitions.

Issue #58 is adversarial evidence, not a final proof that every domain can be reduced to one generic evaluator.

## H3 — Frappe/ERPNext as assumed foundation

**Hypothesis.** Make Frappe/ERPNext the core of the Business OS and enrich it with links, actions, agents, provenance, temporal semantics and policy.

**Historical disposition:** `rejected/falsified` **as the assumed greenfield foundation in this research program**.

**What survived:** ERPNext was promoted to a primary archaeology corpus. Its domain behavior, invariants, migrations, tests and edge cases remain high-value evidence.

**Scope warning:** this does not prove Frappe can never host or implement an eventual OS contract. A later implementation-neutral conformance test may re-open reuse. It only rejects inheriting its application/schema/runtime assumptions *before* they survive the semantic research.

## H4 and H5

H4 (executable ontology as primary-system hypothesis) and H5 (mature systems as empirical corpora) are **not failures in this archive**. H4 remains falsifiable and under active kill tests; H5 is the current research method. A failed attempt to kill H4 is not proof that H4 is true.
