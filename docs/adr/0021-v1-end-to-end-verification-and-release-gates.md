# ADR-0021: Every V1 capability requires a production-shaped E2E proof; stubs cannot satisfy completion

**Status:** Accepted for V1  
**Date:** 2026-08-18

## Context

Zoen will be implemented substantially by autonomous agents. Ambiguous plans invite agents to replace hard integrations with mocks, in-memory stores, temporary APIs or TODO-compatible seams, then declare the ticket complete because unit tests are green. The research phase already showed that nominal green suites can miss semantic attacks. For V1, completion must be defined through externally observable production behavior.

## Decision

A capability is not complete until its declared production path passes an E2E release proof using the real architectural components that the V1 will ship.

Test doubles are allowed only for focused unit/property tests and deliberate fault injection. They cannot be the sole acceptance implementation for a capability that has a selected production dependency.

Every BUILD ticket must contain these mandatory sections:

```text
Production path
Failure path
Restart/recovery path
Security/isolation path
E2E command
Observable assertions
Forbidden shortcuts
Produced evidence/artifacts
Blockers
```

A ticket lacking these sections is not implementation-ready.

## Production-shaped verification environment

The full self-hosted release suite uses real V1 components:

- real Rust `zoend` binaries;
- real PostgreSQL 18;
- embedded real DataFusion execution;
- real S3-compatible object storage;
- real Cedar policy evaluation;
- real compiled Wasmtime Components;
- real Restate self-hosted runtime;
- real OIDC identity provider in the reference environment;
- real TypeScript ontology compiler/SDK/harness;
- real PostgreSQL FTS + pgvector Company Brain indexes;
- real React/TanStack web application exercised by a browser automation runner;
- at least one real configured external LLM for AI release suites;
- real vendor sandbox/homologation calls for integrations whose completion depends on external systems, including fiscal integrations.

The self-hosted core suite must run without Zoen Cloud.

## E2E layers

### Component integration proof

A selected third-party mechanism is exercised through the Zoen-owned deep port and its real runtime. Example: Cedar policy evaluation, Wasmtime resource limits, Restate restart recovery.

### Semantic vertical proof

A user-visible/agent-visible operation crosses multiple real modules and persists observable semantic outcomes. Example: author ontology -> publish -> query -> propose -> Cedar authorization -> commit -> effect -> reconcile -> explain.

### Deployment proof

The same signed artifacts are installed in shared, dedicated and self-hosted profiles and run the conformance suite.

### Release proof

`verify-v1` composes all required E2E scenarios, security attacks, recovery drills, target-scale tests and live external integration suites required for the release candidate.

## No-stub law

Forbidden as ticket-completion shortcuts:

- in-memory authority store when PostgreSQL is the V1 backend;
- fake/deterministic model as the only AI acceptance path;
- fake connector as the only proof of the effect/integration capability;
- JSON/REST temporary API when the V1 protocol contract is Connect/Protobuf;
- bypassing Cedar with hard-coded permit logic;
- replacing DataFusion/materialization with direct vector/list scans and calling query complete;
- bypassing Restate with an in-process retry loop for a capability whose final path is durable orchestration;
- bypassing Wasmtime by executing organization code natively;
- UI tests that mock the semantic API for release acceptance;
- fiscal integration declared complete without live sandbox/homologation evidence;
- TODO/panic/unimplemented code on a production path exercised by the ticket.

A black-box failure harness or simulated external service may be used to deterministically produce timeout/reordering/crash conditions that a real provider cannot safely reproduce. It supplements; it does not replace the real production integration proof.

## Required failure/recovery dimensions

Each applicable subsystem must prove:

- process death and restart;
- lost response after possible commit/delivery;
- duplicate request/replay;
- concurrency/conflict;
- dependency unavailability/timeouts;
- malformed/adversarial input;
- authorization/tenant isolation attack;
- stale data/projection/evidence;
- upgrade/schema/protocol compatibility where relevant;
- backup/restore for durable state;
- observability sufficient to identify the failed semantic operation without exposing secrets.

## Semantic mutant requirement

High-risk laws maintain deliberately weakened mutants or equivalent mutation/property tests. At minimum the release suite must demonstrate detection of mutants for:

- foreign namespace/operation commit;
- intent mismatch replay;
- stale-basis omission;
- child delegation escalation;
- partial multi-record commit;
- live mutation of published executable definition material;
- missing rival/computational lineage;
- unsafe retry after ambiguous external effect;
- tenant-crossing query/cache key;
- projection served below requested freshness cut;
- direct agent/UI bypass of Action authority.

## Evidence artifact

Every release E2E run emits a machine-readable manifest containing:

```text
source commit
signed artifact digests
ontology definition digests
protocol schema digest
component versions
scenario IDs
start/end timestamps
pass/fail outcomes
observed commit/effect IDs
failure injections used
benchmark/SLO results
live integration environment class (sandbox/homolog/prod)
```

Secrets and unrestricted customer/model content are excluded/redacted.

This manifest is the evidence that a V1 candidate satisfies the architecture; prose status is not sufficient.

## Definition of done

A ticket is done only when:

1. implementation follows the declared production path;
2. its E2E command is reproducible from a clean environment;
3. observable assertions prove semantic behavior, not merely HTTP 200;
4. applicable failure/restart/security paths pass;
5. conformance mutants are killed;
6. docs/protocol/generated artifacts are consistent;
7. no forbidden shortcut remains on the production path;
8. the ticket's evidence is included in the release verification graph.

## Agent execution rule

If implementation requires a same-shape deviation from the architecture in two independent places, the agent must stop adding workarounds and trigger `/architect` redesign. It may not solve repeated architectural friction with `any`, unchecked JSON, generic maps, hidden feature flags, vendor IDs in core, or pass-through layers.

## Invariants

- Unit tests can prove a function; only E2E can close a product capability.
- Real dependency integration begins when the capability first claims that dependency, not in a later hardening phase.
- Failure behavior is part of the feature contract.
- Observability and recovery are part of the E2E path, not post-V1 polish.
- The final full-company vertical reuses production implementations from subsystem tickets; it cannot introduce a test-only second runtime.

## Revisit if

A third-party vendor does not provide a reproducible sandbox. In that case live homologation evidence may move to a controlled release gate while CI uses contract/fault harnesses, but the capability still cannot be declared release-complete without recorded live evidence.
