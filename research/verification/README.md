# Cross-ontology verification — counterexamples before architecture

- Artifact ID: `issue-0046-cross-ontology-verification`
- Issue: <https://github.com/EnzoTironi/OS/issues/46>
- Companion issue: #51 executable property-based semantic fuzzing
- Date: 2026-08-16
- Input corpus: reviewed Wave B #45/#40/#41/#42/#43/#39 research
- Decision: none. This work defines **how claims become executable/falsifiable evidence**; it does not select the final ontology, storage or runtime stack.

## Why #46 exists now

Wave B has already produced:

```text
Issue / family       candidate laws    adversarial scenarios
#45 ingest                 19                  40
#40 commit                 24                  50
#41 effects                30                  70
#42 authorization          25                  70
#43 orchestration          30                  70
#39 storage                35                  70
-------------------------------------------------------------
TOTAL                     163                 370
```

At this point, writing more prose without a verification architecture would lower confidence rather than increase it.

The core pipeline is:

```text
LAW / SEMANTIC CLAIM
        │
        ▼
FALSIFIER FAMILY
        │
        ▼
CHEAPEST ADEQUATE VERIFICATION MECHANISM
        │
        ├─ deterministic reference test
        ├─ property/state-machine fuzzing + shrinking
        ├─ real-backend concurrency/fault experiment
        ├─ SMT / bounded relational proof
        ├─ explicit/model checking of concurrent protocol
        ├─ differential domain-corpus testing
        └─ production/shadow invariant monitor
        │
        ▼
COUNTEREXAMPLE
        │
        ▼
MINIMIZED REGRESSION FIXTURE
        │
        ▼
LAW / MODEL / IMPLEMENTATION REFINED
```

The goal is **not proof theater**. A passing test only raises confidence inside the state/input/backend bounds it actually exercised.

## Verification ladder

### L0 — corpus/static consistency

Checks:

- every law/scenario ID unique and contiguous in its source family;
- machine registry covers every reviewed scenario;
- scenario points to existing source artifact;
- regression fixtures point to executable tests/models;
- epistemic status is not silently promoted by test existence.

Best for: research-corpus integrity, not semantic truth.

### L1 — deterministic executable reference models

Small models encode the semantic distinctions directly and run exact examples.

Existing examples:

- #40 operation identity / basis / commit indeterminacy;
- #41 effect attempts / unknown outcomes / reconciliation;
- #43 timer/signal/runtime-state boundary;
- #39 PostgreSQL contract subset.

Best for: precise regression of already discovered counterexamples.

### L2 — property-based + state-machine fuzzing

Generate values **and sequences of operations**, assert invariants after each transition, and shrink failures to minimal traces.

Best for:

- duplicate/reordered source deliveries;
- entity merge/split/rebind sequences;
- retry/replay/cancel/interleaving;
- grant delegation/revocation chains;
- timer/signal/effect state machines;
- metamorphic laws such as source-copy invariance.

Hypothesis is the initial Python mechanism because its stateful API generates sequences of actions and its normal testing phases include shrinking of failures; the verification contract remains tool-independent.

### L3 — real backend concurrency and fault experiments

Run the same semantic law against actual storage/runtime implementations.

Existing evidence:

- PostgreSQL 18 #39 experiment proves the write-skew difference between `REPEATABLE READ` and `SERIALIZABLE`, operation marker atomicity, overlap exclusion, binding history and snapshot-without-event.

Future examples:

- hot reservation contention;
- crash at transaction/outbox/checkpoint boundaries;
- projection destruction/rebuild;
- PITR followed by external-effect reconciliation;
- FoundationDB conflict-range prototype;
- candidate orchestration backend crash/replay.

Best for: assumptions about real isolation, durability, retries and operational failure modes.

### L4 — SMT / bounded relational verification

Encode a finite mathematical model and ask a solver for counterexamples.

Initial targets:

- delegation must never exceed parent bounds;
- grant chain cycles/tenant crossing;
- separation of duties;
- approval participant independence;
- primitive-reduction relational constraints;
- bounded state-basis compatibility.

Z3 is the first executable solver because it can be embedded directly in CI. Alloy remains valuable for relational counterexample exploration and visualization; it is not required for every relational law.

### L5 — concurrent/distributed protocol model checking

Enumerate/reason over all bounded interleavings rather than random samples.

Initial targets:

```text
LocalOperation commit -> EffectRequest -> send -> timeout -> observation -> retry
cancel vs send vs confirmation
workflow replay/checkpoint vs semantic commit
revocation vs commit/effect-attempt
projection lag vs authoritative commit
```

The first CI implementation uses an explicit finite-state explorer in Python so counterexample traces are inspectable and dependency-free. TLA+/TLC is the preferred external notation/checker candidate for larger concurrent protocols because it is designed for modeling concurrent/distributed systems; adding a TLA+ toolchain to CI is a separate reviewed dependency decision.

### L6 — differential/domain-corpus testing

Mine ERPNext/Odoo/Moqui/REA/standards plus HF evidence to generate real business scenarios and compare candidate ontologies/implementations.

Questions:

- can the ontology represent the scenario without semantic escape hatch?
- do invariants/actions/events match independent mature systems?
- do cancellation/reversal/partial cases preserve meaning?
- does another model expose a missing domain concept?

Best for: falsifying the **business ontology**, not merely the runtime protocol.

### L7 — production/shadow invariant monitoring

Even formal/bounded verification cannot prove the deployed system against every external fault/model mismatch.

Examples:

```text
no committed operation ID has two intent digests
no high-risk Action consumed a stale derived projection as live authority
no EffectRequest has incompatible confirmed outcomes without reconciliation case
no child Grant exceeds current/vested parent bounds
projection watermark never claims fresher-than-source state
no tenant-crossing identity/binding relation
```

Best for: assumptions that can be violated by integrations, data corruption, configuration or future code.

## Rule: use the cheapest adequate mechanism

Do not formalize a CSV parser in TLA+. Do not trust random fuzzing to prove a small authorization lattice property. Do not infer database serializability from a reference model.

Examples:

| Claim | Best first mechanism |
| --- | --- |
| source-copy does not create second business occurrence | property/metamorphic test |
| transitive fuzzy cluster must not become exact identity | generated graph/property test |
| same operation ID + changed intent is rejected | deterministic + backend integration |
| aggregate invariant survives concurrent commits | real concurrency test + bounded protocol model |
| sent/no-response cannot be overwritten by later not-sent attempt | state machine + model check |
| child Grant never broadens parent authority | SMT/bounded relational + generated chains |
| timer firing cannot itself breach Commitment | state machine/property test |
| derived graph loss does not lose business truth | destructive rebuild integration test |
| ERP ontology covers partial delivery/return/rework | differential domain corpus |

## Machine-readable registry

[`registry-config.json`](registry-config.json) declares the reviewed source families. [`scenario_registry.py`](scenario_registry.py) parses the canonical Markdown at CI time and emits one registry entry per law/scenario.

This avoids a dangerous second manually maintained list. If #45 gains `S-I45-41`, the #46 checker fails until registry expectations/classification are updated.

Each generated scenario record includes:

```json
{
  "scenario_id": "S-TX-01",
  "issue": 40,
  "source": "research/runtime/transactions/adversarial-cases.md",
  "title": "...",
  "severity": "P0",
  "verification": ["state-machine", "model-check", "backend-concurrency"],
  "status": "designed"
}
```

`status=designed` does **not** mean verified. Executable/formal/regression links are added only when evidence exists.

## Cross-family invariants

The first harness focuses on boundaries that recur across several issues:

1. **semantic-operation replay:** same operation/intent never applies twice;
2. **identity integrity:** same semantic ID cannot silently change intent/tenant/type;
3. **delivery independence:** duplicate transport delivery does not duplicate business occurrence;
4. **evidence monotonicity:** weaker/later transport evidence cannot erase stronger prior uncertainty/effect evidence;
5. **timer non-authority:** scheduler wake does not directly mutate domain truth;
6. **grant monotonicity:** delegated authority is a subset of its parent unless an independent authority source explicitly grants more;
7. **tenant confinement:** identity/grant/binding edges cannot cross tenant boundary absent explicit cross-tenant relation semantics;
8. **derived-store non-authority:** mutating a rebuildable projection cannot commit authoritative business state;
9. **external-world non-rollback:** local restore/cancel cannot erase a confirmed independent external outcome;
10. **revision fidelity:** replay/history retains the ontology/policy/connector/mapping revision actually used.

## Counterexample as a first-class artifact

A verification failure should produce a machine-readable regression fixture:

```json
{
  "property": "effect-uncertainty-not-erased",
  "seed": 138452,
  "initial": {...},
  "operations": [
    {"op": "attempt", "evidence": "sent_no_response"},
    {"op": "attempt", "evidence": "definitely_not_sent"}
  ],
  "minimal": true,
  "source_scenarios": ["S-EFF-..."],
  "observed_violation": "knowledge regressed from indeterminate to not_attempted"
}
```

Counterexamples are more valuable than aggregate fuzz counts. Once found, a minimized fixture becomes permanent regression evidence.

## What formal verification does not prove

- a bounded SMT/Alloy model does not prove behavior outside its scope;
- a TLA+/explicit state model proves the specification, not that production code matches it;
- passing Hypothesis tests does not exhaust all traces;
- a real PostgreSQL experiment proves that tested version/configuration/path, not every database topology;
- differential agreement between ERPs can reveal convergence but does not make the converged model universally correct;
- production monitors detect violations after/developing in reality and are not a substitute for prevention.

#46 therefore requires **traceability between law -> model -> implementation test -> production invariant** where the risk justifies it.

## Files

| File | Purpose |
| --- | --- |
| [`registry-config.json`](registry-config.json) | canonical source-family inventory and expected counts |
| [`scenario_registry.py`](scenario_registry.py) | dynamic machine-readable registry generator/checker |
| [`verification-matrix.md`](verification-matrix.md) | maps families/laws to ladder levels |
| [`harness.py`](harness.py) | deterministic seeded state-machine/property harness with shrinking |
| [`test_harness.py`](test_harness.py) | cross-family executable regression tests |
| [`modelcheck.py`](modelcheck.py) | finite-state exhaustive protocol explorer |
| [`formal/authorization_z3.py`](formal/authorization_z3.py) | bounded SMT authorization/non-escalation models |
| [`regressions/`](regressions/) | minimized historical counterexamples |
| [`open-questions.md`](open-questions.md) | formal/tool/backend handoff |

## Exit criterion for #46

#46 is not “done” when every scenario is formally proved. It is done when:

- all reviewed scenarios are in one machine registry;
- every family has an assigned verification strategy;
- critical cross-family safety laws have executable property/state-machine coverage;
- at least one concurrency/effect protocol is exhaustively model-checked in bounded state;
- critical authorization monotonicity/SoD properties have SMT counterexample checks;
- known historical bugs are permanent minimized regressions;
- CI enforces the registry + executable/formal checks;
- remaining unexecuted scenarios are explicit coverage debt, not invisible prose.
