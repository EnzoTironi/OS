# ADR-0017: Cedar, Wasmtime and Restate implement replaceable mechanisms under Zoen semantic authority

**Status:** Accepted for V1  
**Date:** 2026-08-18

## Context

V1 needs expressive authorization, safe execution of organization-authored logic, durable external effects, timers and long-lived agent/process work. Implementing all of these inside the semantic kernel would create a large security/runtime substrate; delegating semantic meaning to third-party runtimes would create multiple authorities. The boundary must therefore distinguish Zoen-owned laws from replaceable mechanisms.

## Decision

Zoen V1 uses:

- **Cedar** as the primary policy-evaluation mechanism;
- **Wasmtime Component Model** as the execution runtime for untrusted/custom executable logic;
- **Restate** as the durable orchestration mechanism for external effects, long waits, timers, scheduled work and durable agent/process execution.

All three live behind deep ports. None may become semantic authority.

## Cedar boundary

Zoen owns trusted identity/context, delegation proof, semantic Action identity, resource identity, policy revision and historical authority meaning. The policy adapter maps that trusted semantic request into Cedar's principal/action/resource/context model and returns a structured evaluation result including determining policy identities and evaluator errors.

```text
TrustedExecutionContext + ActionRef + ResourceRef + PolicyRevision
        -> Zoen authority/delegation checks
        -> Cedar evaluation
        -> AuthorityProof / Deny / EvaluationError
```

Rules:

- delegation is intersected before/with policy evaluation and can never be expanded by Cedar;
- `Deny` is distinct from evaluator/configuration error;
- policy artifacts are immutable/versioned and linked to the semantic definition/revision that produced or referenced them;
- commit-time authority is re-evaluated according to the Action contract; preview/approval does not permanently vest authority unless the definition explicitly models vested authority semantics;
- Cedar entity graphs are evaluation artifacts, not a second organizational Relation store.

OpenFGA and OPA are not V1 dependencies. OpenFGA would duplicate a substantial relationship tuple graph; OPA is not selected because Cedar's typed authorization model fits the current principal/action/resource/context contract more directly. These may be reconsidered only behind `PolicyEvaluator`.

## Wasmtime boundary

V1 has explicit computation trust tiers:

```text
Tier 0: built-in declarative/canonical expressions interpreted by Rust
Tier 1: deterministic Wasm Component Computation/Action planner
Tier 2: capability-mediated Wasm component for approved non-pure work
```

A Wasm component never receives ambient capabilities. Filesystem, network, environment variables, secrets, wall clock, randomness and raw database access are unavailable unless a narrowly declared host interface grants a capability.

Pure/deterministic execution uses fixed resource budgets and deterministic fuel exhaustion. Memory/table/instance limits are explicit. Non-deterministic capabilities are recorded in execution evidence and cannot be used where deterministic replay is required.

Effectful organization logic does not directly mutate remote systems or semantic authority. It returns typed semantic results/EffectRequests or uses explicitly mediated capabilities whose outcomes re-enter Zoen as evidence.

Published definitions reference Wasm components by immutable content digest plus interface/capability manifest.

## Restate boundary

Restate owns durable execution mechanics such as journal/replay, timers, retries, durable invocations and signals. Zoen owns whether an Action committed and what an external outcome means.

```text
Action commit
  -> durable EffectRequest + outbox
  -> Restate durable invocation
  -> connector attempt
  -> attempt/evidence recorded in Zoen
  -> reconciliation
```

Restate retry guarantees must never collapse an externally ambiguous outcome into success/failure. A connector timeout after possible delivery remains `unknown` in Zoen until evidence reconciles it.

Long human approvals, scheduled jobs and durable agent sessions may use Restate, but business state transitions still enter through the same Zoen Action/evidence APIs.

## No architectural stubs

The first ticket claiming policy, Wasm or orchestration capability must use the real production dependency in E2E. In-memory/fake implementations may exist for unit tests or deliberate fault injection, but they cannot be the release acceptance path and cannot define an alternate semantic behavior.

## E2E verification

Release gates include:

- real Cedar permit/deny/error cases with historical policy revision and determining-policy evidence;
- delegation escalation attacks that fail independently of UI/agent behavior;
- real compiled Wasm Components exercising allowed host capabilities;
- Wasm attempts at undeclared network/filesystem/secret access that fail;
- memory/fuel exhaustion producing typed bounded failures rather than process instability;
- Restate process/node restart during a pending effect without losing the durable invocation;
- an external ambiguous timeout that remains unknown despite orchestration retry capability;
- later independent reconciliation that confirms/contradicts the effect without rerunning the business Action;
- policy/sandbox/orchestration adapters replaced in tests without modifying `zoen-core` types or semantic laws.

## Invariants

- Intelligence cannot grant authority.
- Policy evaluator cannot expand delegation.
- Wasm cannot directly write authority storage.
- Restate cannot declare external business success on behalf of reconciliation.
- Third-party runtime IDs are adapter evidence, not semantic primary identities.
- Semantic history pins exact policy/computation/component revisions used.

## Revisit if

A chosen mechanism becomes unmaintained, fails the E2E/security workload, or a materially deeper replacement exists. The Zoen-owned ports and semantic laws remain the migration boundary.
