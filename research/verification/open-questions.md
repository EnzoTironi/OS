# Open questions and downstream handoff

**Issue:** #46  
**Status:** explicit verification debt, not hidden uncertainty.

# What #46 can decide now

## Q-V46-01 — should every semantic claim use formal methods?

**Answer:** no.

Use the cheapest mechanism that can actually expose the failure class. Formal bounded models are high-value for authorization relations and concurrent protocols; real backends are necessary for isolation/durability claims; differential business scenarios are necessary for ontology coverage.

## Q-V46-02 — should random fuzzing replace adversarial scenario design?

**Answer:** no.

The 370 reviewed scenarios are seeds/dimensions/oracles. Generators expand their neighborhood; shrinking turns discovered failures back into minimal fixtures.

## Q-V46-03 — does a formal model eliminate implementation tests?

**Answer:** no.

The model proves/checks the specification under bounds/assumptions. Conformance tests prove that one implementation realizes the modeled transition/authority semantics.

## Q-V46-04 — can all scenario records be maintained manually?

**Answer:** no reason to.

The registry is derived from canonical Markdown and count-checked. Extra metadata/coverage can be maintained separately without copying scenario identity/title text.

# High-priority coverage debt

## Q-V46-10 — generated ontology worlds

#51 still needs generators for actual ontology constructs:

```text
ObjectTypes / Interfaces / Properties / Links
Actions / Functions / Invariants / Policies
Events / Commitments? / Processes?
ontology revisions
source mappings/bindings
actors/grants/tenants
```

Generators must produce both valid and minimally-invalid worlds and shrink without destroying the semantic precondition that made a failure meaningful.

## Q-V46-11 — ingest/entity-resolution state machine

Build a generated model for:

```text
source records
pairwise candidate relations
cluster proposals
exact binding decisions
merge / split / rebind
mapping revision
source-key reuse
lineage copy
```

Properties:

- threshold change cannot silently rewrite committed exact binding;
- reprocessing M2 cannot mutate M1 lineage;
- split preserves historical basis;
- source-copy invariance;
- unresolved evidence never forces fake target identity.

## Q-V46-12 — authorization temporal model

Current SMT proves static bounded non-escalation/SoD. Add time/state transitions:

```text
grant create -> delegate -> approve -> revoke -> commit/effect
vested authority
current-at-commit policy
emergency deny
agent/subagent task grant expiry
```

Use explicit model checking and/or TLA+/Apalache after dependency review.

## Q-V46-13 — provider-specific effect protocols

Generic #41 model should be instantiated for real connectors:

```text
Stripe-like idempotency window/readback
marketplace listing mutation
ERP create/update with returned ID
NF-e external authorization
email/message provider acceptance
non-idempotent legacy endpoint
```

Each connector must document what constitutes definitely-not-sent, accepted, terminal, authoritative read-back, and safe retry.

## Q-V46-14 — real orchestration backend fault matrix

Once #43 shortlists a backend, run:

```text
worker kill before/after semantic commit
worker kill before/after remote send
signal early/duplicate/out-of-order
stale timer after domain change
workflow definition upgrade
runtime store outage
fork/redrive/continue-as-new
```

The semantic oracle comes from #40/#41/#42/#45, not engine status.

## Q-V46-15 — storage destructive/DR tests

Execute #39's unresolved highest-risk tests:

- projection destruction + semantic-equivalent rebuild;
- PITR before/after confirmed remote effect;
- erase PII then restore old backup and reapply erasure state;
- hot contention benchmark;
- dynamic ontology physical layouts;
- FoundationDB/XTDB comparison.

## Q-V46-16 — differential ERP/business corpus

Turn ERPNext/Odoo/Moqui/REA mining into structured scenarios:

```text
initial business state
operation/intent
expected invariants
accepted outcomes
cancellation/reversal semantics
source provenance
```

Then run each candidate ontology against the same corpus.

This is the strongest path to falsify “our ontology is elegant but wrong about real business”.

## Q-V46-17 — TLA+/Alloy toolchain in CI

Current CI already has:

- explicit exhaustive state explorer;
- Z3 SMT;
- Hypothesis stateful fuzzing.

TLA+/TLC and Alloy remain useful external models for larger distributed/relational specifications and visualization. Before adding them to required CI:

1. pin official distribution/version/source;
2. record license/dependency provenance;
3. make model execution deterministic in CI;
4. keep the Python/Z3 oracle or cross-check where practical;
5. do not add a Java/toolchain dependency merely for the label “formal”.

## Q-V46-18 — implementation conformance architecture

When production runtime exists, each semantic service should expose a test adapter so the same abstract operation traces can run against:

```text
reference model
PostgreSQL implementation
alternate storage backend
real effect connector sandbox
orchestration backend
agent/tool execution layer
```

Differential mismatches become counterexamples.

## Q-V46-19 — coverage scoring

Do not use raw percentage of 370 scenarios as the sole metric.

A reasonable risk-weighted model should track:

```text
P0 law families
verification level reached
number of independent mechanisms
backend reality evidence
counterexample sensitivity tests
unresolved assumptions
```

A single untested #40 safety law matters more than dozens of UI/low-risk scenarios.

## Q-V46-20 — production invariant monitoring

Define executable queries/monitors for properties whose assumptions include external data/configuration:

- one LocalOperationId -> one intent digest;
- no exact binding spans incompatible tenants/types;
- no child Grant exceeds parent bounds;
- no high-risk Action cites stale derived projection as live basis;
- no confirmed external effect is “rolled back” by local restore;
- no projection watermark exceeds consumed source watermark;
- no ontology historical Action loses referenced revision.

# Handoff to #47 — safe code execution

Verification must test the capability sandbox, not merely document it:

```text
replay cannot access production network
pure Function cannot perform I/O
Effect executor only calls declared capability
agent cannot invoke hidden/admin DB path
migration capability separate from business actor
secrets unavailable to untrusted code
resource exhaustion bounded
```

Use adversarial code and generated tool-call traces.

# Handoff to #49 — observability

Every failed property/model should be observable as a causal trace with the same IDs production uses:

```text
scenario/property id
seed/model bound
LocalOperationId
EffectRequestId
ObservationId
Grant/policy revision
ontology revision
execution/run identity
projection watermark
```

This makes production incidents promotable into regression fixtures.

# Handoff to #53 — agent operating model

Agent verification needs stateful traces over:

```text
plan -> tool proposal -> approval -> commit -> effect -> observation
subagent delegation
context loss/recovery
model retry
human intervention
```

Properties:

- model confidence never grants authority;
- retry never changes semantic operation identity accidentally;
- subagent authority is monotone/narrowed;
- context reconstruction preserves revision/evidence basis;
- agent completion does not imply external outcome.

# Handoff to #63 — modules/composition

Module/package boundaries need contract tests:

- version compatibility;
- dependency resolution;
- no semantic ID rewrite on package install/upgrade;
- projection/backends replaceable without ontology changes;
- module cannot escalate runtime capabilities implicitly.

# Handoff to #70 — primitive reduction and metamodel synthesis

#70 should not choose primitives solely from prose convergence. For each candidate primitive, require:

```text
what law becomes impossible/unsafe without it?
what smaller composition competes with it?
which scenario defeats the smaller composition?
which executable/formal model reproduces that defeat?
what new invalid states does the primitive itself introduce?
```

Candidate `Process`, `Commitment`, `Effect`, `Observation`, `Binding`, `Projection`, `Policy`, `Invariant`, `Workflow` etc. should therefore arrive at #70 with **counterexample evidence**, not aesthetic preference.

# Exit state for this first #46 pass

The first pass can land once:

- 370 scenarios / 163 laws are machine-discovered and guarded;
- Hypothesis stateful fuzzing runs;
- custom seeded traces/shrinking run;
- bounded commit/effect model checker runs and catches its buggy variant;
- Z3 authorization models run and catch their buggy variants;
- known regressions are versioned and executable;
- CI enforces all of the above;
- remaining coverage debt above is explicit.
