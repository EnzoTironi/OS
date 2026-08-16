# Candidate laws

**Status.** Smallest claims that explain the scorecard.  
**Kind.** candidate law.  
**Decision.** per law. Never `accepted`.

These are not RFC-0001 edits. They are pressure on open question 21 and on the Action / Effect / time questions. A synthesis agent may cite them. It may not treat them as primitives.

Each law names the evidence, a counterexample that would kill it, and a runtime consequence. The consequence is an enforcement property, not a storage engine.

## L-001. Commodity ontology is not the thesis

**Decision.** `supported`.

**Claim.** Typed objects, named actions, and a generated UI or tool surface can exist while the thesis still fails.

**Evidence.** E-021, E-004, E-010, E-013, E-017. Palantir, Open Foundry, ObjectStack, and Frappe all ship that trio.

**Counterexample.** A platform that also enforces P1, P6, P8, and P10 without fighting its own guidance.

**Runtime consequence.** A replace-OS review that stops at "it has Actions and MCP" is incomplete.

## L-002. Merge-to-one-object is a semantic distortion, not a data-quality win

**Decision.** `supported` as Palantir's documented recommendation. `hypothesis` as a general law that OS must refuse.

**Claim.** When sources disagree, forcing a single property with a precedence rule destroys observations that later actions need for authority.

**Evidence.** E-002, V-001 steps 7 and 12, constitution §9 and §11, open question 3 as a question rather than an answer.

**Counterexample.** A production ontology that keeps competing claims first-class and still lets operators act, documented as intended behavior rather than a silo.

**Runtime consequence.** Ingestion may project a working picture. It may not erase the claims that picture was built from if those claims can change a later decision.

## L-003. Approval binds a call at a time. Commit re-reads the world

**Decision.** `supported` by Ontologiq. `supported` as missing in Palantir submit-time criteria and Open Foundry's executor.

**Claim.** A human signature on a stale proposal is not authority to mutate the later world.

**Evidence.** E-011, E-005, E-009, scenario S-003, V-001 steps 6 through 9.

**Counterexample.** A domain where the approved parameters must apply even if the world changed, with the change recorded as a separate fact. Not found in this pass.

**Runtime consequence.** Preview, approve, and commit are different phases. At least commit evaluates live state. Approved arguments need a binding the engine can refuse.

## L-004. Lost I/O after send is unknown, not failed, not succeeded

**Decision.** `supported` as the only inspected behavior that matches S-004. `rejected` that any other named candidate enforces it.

**Claim.** Once bytes have left, a missing response cannot be collapsed to success or failure without lying.

**Evidence.** E-011, E-006, E-009, E-016.

**Counterexample.** A protocol that makes the far side's accept and the near side's commit one atomic outcome, with both sides documented. Palantir writeback is explicitly not that. E-006.

**Runtime consequence.** The action record must be able to stay `unknown`. Retry after send is a new decision, not a default.

## L-005. Local commit and external effect are different authorities

**Decision.** `supported`.

**Claim.** A runtime that commits ontology rows and then fires a webhook, or fires a webhook and then fails the ontology write, has two truths unless it names the split.

**Evidence.** E-006, E-009, S10 E-019. gura105 writes the source first and documents a crash hole that loses the audit.

**Counterexample.** A two-phase protocol both sides implement, opened in code, that never leaves the split unrepresented.

**Runtime consequence.** The model must say which side is authoritative during the window, and must record the window.

## L-006. Surface parity is not authority parity

**Decision.** `supported`.

**Claim.** The same Action name on a button and a tool is unsafe if the effect runs with wider authority than the caller.

**Evidence.** E-013. E-008. Palantir inherits a human or project scope, which is at least named. S10 ObjectStack `isSystem`.

**Counterexample.** A generated tool whose every internal read and write is still the caller's principal, including after approval.

**Runtime consequence.** Policy must hold inside the effect, not only at invoke.

## L-007. Current-row history is not temporal history

**Decision.** `supported` as a distinction. `undetermined` whether OS needs native bitemporality. That is open question 7.

**Claim.** Amendment objects, edit logs, and ledger reversals can explain "what is true now" and still fail "what did we know then?"

**Evidence.** E-003, E-012, E-018, scenario S-007, V-001 steps 11 and 12.

**Counterexample.** A candidate that answers both S-007 questions from the engine, not from a warehouse archaeologist.

**Runtime consequence.** If those questions matter for a domain, changelog-on-the-current-object is not enough. This law does not choose Fact as the storage unit.

## L-008. An extension that fights official guidance is a new core

**Decision.** `hypothesis`.

**Claim.** "Use Palantir and add Observation, Proposal, and unknown Effect types" is not a Palantir satisfaction of the thesis. It is OS hosted on Palantir, against Palantir's published anti-patterns.

**Evidence.** E-002, E-003, E-022, open question 21's own criterion in S03. Reuse when the existing abstraction preserves the best semantics, not because it exists.

**Counterexample.** Official Palantir or Open Foundry guidance that first-class competing observations, hashed stale revalidation, unknown effects, and known-then queries are intended engine behavior.

**Runtime consequence.** Build-versus-reuse decisions should score the engine's refusals, not the app you could write on a generic object store.

## Laws this pass will not make

It will not say Action is a required primitive. Open question 4 stays open.

It will not say Fact is required. Ontologiq ships without it. E-012. RFC-0001 Fact stays a hypothesis.

It will not say one executable ontology is right or wrong. Issue 55 owns that kill. S13.

It will not say specialized kernels are required. Issue 58 owns that kill. S14.
