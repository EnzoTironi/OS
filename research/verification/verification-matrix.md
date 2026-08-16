# Verification matrix — law family → falsifier → evidence

**Issue:** #46  
**Status:** first executable coverage map. `current` means evidence exists in the repository/CI; it does not mean every law in the family is proved.

## Coverage vocabulary

```text
DESIGNED     falsifier/scenario exists, no executable evidence yet
EXECUTABLE   deterministic/property/model/backend test exists
FORMAL       bounded solver/model-check evidence exists
INTEGRATION  real backend/runtime experiment exists
SHADOW       production-like/shadow invariant exists
```

One property can have several evidence levels.

# Family matrix

| Family | Highest-risk claims | Preferred mechanisms | Current evidence | Main debt |
| --- | --- | --- | --- | --- |
| #45 ingest/entity resolution | source identity != business identity; candidate cluster != exact identity; reprocessing non-mutation; source-copy invariance | property, state-machine, metamorphic, differential | registry + cross-family duplicate-observation model | dedicated generated cluster/merge/split/rebind model; spreadsheet/document differential corpus |
| #40 commit | stable operation identity; StateBasis; predicate concurrency; indeterminate commit | deterministic, state-machine, model-check, backend concurrency | reference model; #46 operation replay; bounded commit/effect checker; PostgreSQL 18 write-skew integration | hot contention, commit-unknown transport/DB fault injection, FoundationDB comparison |
| #41 effects | sent/no-response; retry safety; optional provider identity; reconciliation; compensation | state-machine, model-check, fault injection | #41 reference model; #46 property; #46 exhaustive blind-retry counterexample | connector-specific protocol models; delayed webhook/read-back fault tests |
| #42 authorization | delegation non-escalation; tenant confinement; SoD; current vs vested authority | SMT, generated chains, state-machine, model-check | #46 Hypothesis delegation; Z3 transitive scope/tenant/limit/SoD | time/revocation/vesting races; OpenFGA/Cedar differential policy fixtures |
| #43 orchestration | runtime state != business state; timers/signals; replay; cancellation; revision independence | state-machine, model-check, fault injection | #43 reference model; #46 timer/operation/effect properties | real Temporal/Restate/DBOS crash-replay experiments after backend shortlist |
| #39 storage | one authority per statement family; serializable dependencies; derived rebuild; PITR non-world-rewind | backend concurrency, destructive rebuild, DR/fault injection | real PostgreSQL 18 integration; #46 derived-store property | ontology layout benchmark; projection rebuild; PITR+external-effect drill; FDB/XTDB comparison |
| #51 semantic fuzzing | generated cross-ontology scenarios + shrinking | Hypothesis state machine, custom seeded traces, fixture regression | #46 seeded harness + RuleBasedStateMachine + ddmin sensitivity test | richer typed ontology generators; generated Actions/Links/Interfaces/values; domain-specific shrinkers |

# Critical cross-family properties

## V46-P01 — semantic operation replay safety

**Claim:** same LocalOperationId + same intent cannot apply twice; same ID + changed intent cannot silently mutate.

Evidence:

```text
#40 executable reference model
#39 PostgreSQL 18 operation marker experiment
#46 SafetyModel + Hypothesis state machine
```

Next escalation: crash/kill DB client at every commit/result boundary.

## V46-P02 — effect uncertainty is not erasable by later weaker attempt evidence

**Claim:** `sent_no_response` followed by `definitely_not_sent` remains indeterminate unless independent reconciliation changes knowledge.

Evidence:

```text
#41 executable reference model
#46 deterministic property
#46 custom ddmin against deliberately naive last-write-wins model
#46 bounded commit/effect model checker
```

The checker also proves its sensitivity by finding a duplicate remote effect when blind non-idempotent retry is enabled.

## V46-P03 — scheduler timer has no direct business authority

**Claim:** timer/wake can trigger reevaluation but cannot itself fulfill/breach/commit domain state.

Evidence:

```text
#43 executable reference model
#46 SafetyModel/Hypothesis timer rule
```

Next escalation: real orchestration backend stale timer after deadline/fulfillment change.

## V46-P04 — delegation is monotone under one authority source

**Claim:** child/grandchild scopes/amount bounds stay within parent/root and tenant does not change absent independent authority.

Evidence:

```text
#46 Hypothesis generated scope subsets
#46 Z3 bounded transitive scope proof
#46 Z3 bounded tenant proof
#46 Z3 bounded numeric limit proof
```

Sensitivity: removing subset/independence constraints yields SAT witness.

## V46-P05 — SoD independent participant constraint

**Claim:** when policy requires independent principals, initiator and approver cannot resolve to the same effective principal.

Evidence:

```text
#46 Z3 UNSAT model under independence constraint
#46 Z3 SAT witness when constraint is removed
```

Next escalation: delegation/represented-principal resolution graph rather than raw principal ID equality.

## V46-P06 — duplicate delivery != duplicate occurrence

**Claim:** transport deliveries of one ObservationId do not create multiple business occurrences.

Evidence:

```text
#46 Hypothesis list property
#46 state machine
```

Next escalation: source-copy lineage and exact/candidate correlation combinations from #45.

## V46-P07 — derived write cannot silently author business state

**Claim:** a rebuildable derived projection is not a write authority.

Evidence:

```text
#46 Hypothesis property separates derived_values from authoritative_values
```

Next escalation: actual Postgres -> graph/search/ClickHouse projector with destructive rebuild and attempted direct writeback.

## V46-P08 — external reality survives local restore/cancel

**Claim:** confirmed remote outcome is not undone by local database rollback/restore or runtime cancellation.

Evidence:

```text
#46 SafetyModel property
#41/#43 reference models
```

Next escalation: Q-STO-12 actual PITR + mock/provider effect reconciliation drill.

## V46-P09 — revision fidelity

**Claim:** historical Action keeps the ontology/policy revision it used even after current revisions change.

Evidence:

```text
#46 deterministic property
```

Next escalation: ontology migration fixtures and historical replay/query across physical schema changes.

# Verification selection rules

1. A property is not marked `FORMAL` merely because a solver appears somewhere in the family.
2. A bounded UNSAT result includes its assumptions/bounds in the source model.
3. Every deliberately buggy sensitivity model must return a counterexample; otherwise the verifier is suspect.
4. Real-backend tests are required before depending on isolation/durability/product guarantees.
5. Random/property tests must print/reproduce seeds or rely on framework-provided reproducible/shrunk examples.
6. Counterexamples become permanent regression fixtures before the violated law is called reviewed again.
7. A derived projection test must include freshness/authority semantics, not only equality of rows.
8. Formal models cannot bypass implementation conformance tests.

# What remains mostly `DESIGNED`

The 370-scenario registry is deliberately ahead of executable coverage. Major debt buckets:

- ingest entity-resolution graphs, merge/split/rebind and model-revision fuzzing;
- authorization temporal races (revocation/vesting/emergency policy);
- effect provider-specific retry/idempotency windows;
- orchestration backend crash/replay/version migration;
- storage projection rebuild, PITR and privacy erasure;
- dynamic ontology/type/property/interface generators;
- ERPNext/Odoo/Moqui/REA differential business corpus;
- cross-tenant generated worlds at scale.

This is visible coverage debt, not a hidden claim of completion.
