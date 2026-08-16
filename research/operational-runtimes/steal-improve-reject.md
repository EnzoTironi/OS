# Steal, improve, reject

**Status:** Wave A implications, 2026-08-15.  
**Kind:** candidate law plus runtime consequence.  
**Decision:** hypothesis unless a row says otherwise.

This list is for a later synthesis agent. It is not an implementation plan. Wave B runtime picks wait for more Wave A pressure. Nothing here edits RFC-0001.

## Steal

**Propose, approve, revalidate, execute.** Ontologiq is the only inspected system that implements the full loop with hashed arguments, pinned actor claims, a single-claimer execute, and no approve tool on the agent surface. Steal the protocol, not the Python.

**Unknown as a first-class effect outcome.** Same source. Pair it with an idempotency key that is not a license to retry after `unknown`.

**Intent recorded before the call.** Ontologiq writes `effect_intent` before the webhook. A crash mid-call still leaves a trace.

**Authority line on the edit plan.** gura105 refuses mixed source-and-ontology plans and refuses undeclared source writes. Steal the distinction. Improve the crash window they documented.

**Tool-contract IR below any protocol.** Arkhe ADR 0003. MCP, OpenAPI, and UI are emitters. If an emitter needs new meaning, the IR is missing a field.

**`ai.exposed` as a second gate.** ObjectStack. Author opt-in is not implied by human permission. An action safe as a button can be unsafe as a tool.

**Submit-time versus entry-time in long flows.** ObjectStack approval expressions force `current.*` or `trigger.*`. Steal the refusal to let "the record" mean two times.

**Fail-closed missing actor claims.** Ontologiq compiles a missing `actor.*` attribute to NULL so the comparison is not true. Steal that. Do not default missing claims to pass.

**Identity uniqueness as a read-time refusal.** Ontologiq returns `ambiguous_identity` instead of picking a row. Steal that for any get-by-identity path.

## Improve

**Commit-then-webhook.** Open Foundry (`syzygyhack`) is honest about the split and then tries to repair it with compensation. Improve by making the unknown interval visible, or by adopting Ontologiq's "we do not own the write" stance, or by adopting gura105's write-back-first stance. Do not pretend `ROLLBACK_ALL` restored the outside world.

**Trusted action bodies.** ObjectStack documents the leak. Improve by carrying caller authority through the effect, or by making elevation a named principal with a recorded reason. "SECURITY DEFINER because convert-lead needs it" is a smell that the Action is doing two jobs.

**`isSystem` as a boolean.** ObjectStack's own census says the flag skips provenance and approval locks. Improve by replacing a boolean with a typed system principal and an explicit skipped-check list.

**Confirmation flags.** `u485349-coder/OpenFoundry` stores `confirmation_required` and never reads it. Improve by deleting unused gates or by making validate fail when a stored gate has no enforcer.

**Optional action schemas.** OpenCrab treats a missing YAML as valid. Improve by fail-closed unknown actions.

**Live computed state without history.** Ontologiq is right that stored status goes stale. It is wrong if OS must later answer S-007 (backdated stock) or S-012 (why was this discount legal). Improve by keeping live projection and pinning the definition digest, then adding valid time where the domain requires it.

**OpenBKN evidence chain.** The intent-to-source-to-invocation story is the right shape. Improve by making the chain authoritative for policy, not only a trace after the fact. The current inspection did not prove which of those it is.

**UOSE progressive disclosure.** L0 through L4 context is a good agent-operating idea. Improve by tracing it to code before treating it as a law. The docs are ahead of this session's implementation evidence.

## Reject

**Reuse of AGPL or OpenBKN-licensed implementation in the MIT core.** **State:** rejected. Extract behavior. Do not vendor Xpert or BKN Safe.

**Arkhe as a runtime to adopt.** **State:** rejected. The project refuses to be one. Take the IR idea.

**open-ontologies as the OS action engine.** **State:** rejected for this track. It is an OWL workbench. Situation-calculus ticks on triples are a different research question.

**OpenCrab SaaS as a mutation authority.** **State:** rejected for now. The public repo is a crawl-and-pack factory. Hosted behavior is closed.

**Przyval OpenFoundry as semantic evidence.** **State:** rejected as a donor for gates. Keep it only if someone needs Palantir API-shape fixtures.

**Shadowfax OpenFoundry as the issue-36 target.** **State:** rejected. Wrong kind of project.

**README feature count as a score.** **State:** rejected. OpenBKN and Xpert READMEs claim percentages and coverage this session did not verify.

**MCP as a metamodel primitive.** **State:** rejected, following Arkhe. MCP is a surface.

**Silent accept of RFC-0001 Fact from this corpus.** **State:** rejected. No inspected runtime made Fact the storage unit. Several run without it.

**Treating "Open Foundry" as one system.** **State:** rejected. See E-020.

## Leave undetermined

Whether OS should own operational writes, like Open Foundry, or only govern decisions, like Ontologiq.

Whether Relator needs a native category. None of these runtimes implement UFO relators. Object-backed links appear as ordinary objects plus two foreign keys.

Whether CDC belongs in the semantic core. Open Foundry names Debezium. The connector was not opened.

Whether UOSE affordances are Actions, Interfaces, or a third thing.

Whether Open Ontology's Lisp triple store is a real counterexample to a record-shaped ontology. The public Git tree was not confirmed.

## Cross-link

Issue 35 (Palantir) owns the closed-source prior art. This folder owns the open imitators and the agentic runtimes.

Issue 37 (formal ontologies) should take open-ontologies and Arkhe's CEL guards if it wants formal action laws.

Issue 4 (Action) and issue 5 (Action versus Event versus Effect) should consume E-002, E-003, E-005, and E-019 before anyone codes a kernel.

Issue 69 (licensing) should consume the OpenBKN additional conditions and the Xpert AGPL line.
