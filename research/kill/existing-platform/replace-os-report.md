# Replace OS?

**Status.** Kill-test report for issue 68.  
**Kind.** candidate law plus runtime consequence.  
**Decision.** `rejected` that an existing platform already satisfies the thesis cleanly. `rejected` that OS should adopt one of the inspected runtimes as the MIT core. `hypothesis` that a later unopened platform could reopen the question.

Issue 68 asked for this file. If a platform had passed V-001 without distortion, this page would say to use it.

## Answer

Do not replace the OS core with Palantir, Open Foundry, Ontologiq, ObjectStack, Moqui, or Frappe/ERPNext.

Do not treat "we can model the vertical as an application on that platform" as a pass. That test measures developer effort. The issue forbids that measure.

## How the candidates fail the same story

V-001 needs four things at once. Multi-source observations. Stale-state revalidation. An external outcome that can stay unknown. History that can answer what the system knew on 10 August.

Palantir has the mature operational ontology and the shared Action for humans and agents. Official guidance then tells you to merge sources, keep one current object, evaluate rules at submit, and accept that a writeback webhook can succeed while the ontology write fails. Those are not missing checkboxes. They are published semantics. E-002, E-003, E-005, E-006.

Open Foundry copies the Palantir shape in the open and commits local objects before webhooks. Compensation rolls back local state. It does not unbook a carrier. There is no proposal object. E-009.

Ontologiq is the only inspected engine that hashes an approval, re-reads the world, and records lost I/O as `unknown`. It never writes operational truth and never keeps history. It is a governance sidecar. E-011, E-012.

ObjectStack generates the surfaces the thesis wants and then runs script actions as trusted app code. Same button, wider authority. E-013.

Moqui already knew that business writes should be named services with a transaction policy. It also ships implicit entity CRUD and post-commit hooks that are not unknown outcomes. E-015, E-016.

ERPNext already knew that posted work, cancellations, and backdated stock are dangerous. It encodes that as documents, hooks, and repost jobs. It is a GPL corpus, not an ontology runtime. E-017, E-018, E-023.

No column on `scorecard.md` is `enforced` for P1, P6, P8, and P10 together. E-022.

## What to steal, without taking a core

These are concepts. They are not implementation imports.

- From Palantir. Action as the shared verb. Object-backed links when a relationship has its own life. Interfaces as capability contracts. The warning that generated CRUD is Action sprawl. S20.
- From Ontologiq. Propose cannot execute. Approval in another process. Argument digest. Live re-check. `unknown` after send. Fail-closed missing actor claims. Ambiguous identity is a refusal.
- From ObjectStack. `ai.exposed` as a second gate. `current.*` versus `trigger.*` so "the record" cannot mean two times. Explicit `runAs: 'system'`.
- From Moqui. Verb and noun as the API. Transaction policy on the operation. SECA as composition, not as a hidden trigger, if and only if the verb stays visible.
- From ERPNext. Posted versus draft. Close is not cancel. Ledger rows are consequences. Reservation is not on-hand. Backdated movement changes later valuation.
- From ValueFlows. Intent, commitment, plan, and economic event are different classes. E-020.
- From gura105, via S10. One write door. An action sits on one side of the source-versus-ontology line.

Issue 36 already listed most of that steal set. This report adds the replace-OS refusal. It does not copy that folder.

## What not to steal as foundations

- Merge-and-precedence as the multi-source model.
- Time Machine guidance that makes current-row-plus-amendment the only respectable history.
- Commit-then-webhook with best-effort compensation.
- Trusted action bodies after a permission check.
- Implicit CRUD next to named verbs.
- Document submit as the only mutation primitive.
- MCP, GraphQL, or Workshop as metamodel nodes. They are surfaces.

## Build versus reuse

Open question 21 stays unanswered as architecture. This folder answers the narrower kill.

Reuse when the existing abstraction preserves the best semantics. Palantir preserves nouns, verbs, and agent access. It does not preserve competing observations, stale-decision protocol, unknown effects, or known-then history. Extending it until it does is designing OS inside a closed platform that argues against those types.

Reimplementing a generated GraphQL server or an MCP bridge for its own sake would be waste. Those are commodity. The core that is not commodity is the set of refusals in L-002 through L-007.

Wave B runtime shopping should wait for that set to survive more Wave A pressure. This report does not pick a language, a store, or a workflow engine.

## License

Even a semantic pass would not make ERPNext, Odoo Community, Xpert, or OpenBKN a default MIT core. S15. Palantir cannot be vendored. Ontologiq, Open Foundry, and ObjectStack are the only inspected Apache-shaped engines, and they fail the vertical in the engine.

## If this report is wrong

Run the cards in `counterexamples.md`. X-001 through X-005 together would force a rewrite. A single Workshop demo of V-001 would not.
