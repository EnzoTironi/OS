# ADR-0005: Trusted execution context and delegated authority

**Status:** Accepted for Architecture v0  
**Date:** 2026-08-18

## Context

Agents and services act on behalf of organizations, but caller-supplied identity/context can enable confused-deputy and context-substitution attacks. Experimental delegation also showed that validating only the child grant allows privilege expansion.

## Decision

Action inputs are separated from trusted execution context. The server/runtime derives and authenticates tenant, actor, represented principal, workload, environment, session and delegation context; callers do not self-assert authoritative context through business inputs.

Delegation is validated as a proof chain. A child delegation cannot expand the action, resource, temporal, principal, workload or other constrained scope granted by its ancestors.

## Invariants

- `actor` and `principal` are distinct concepts.
- Workload identity is distinct from the human/business actor it may represent.
- Child authority is a subset of parent authority.
- Authorization outcomes distinguish permit, deny and evaluator/error states where the distinction affects safety.
- Historical decisions record the authority basis and relevant definition/policy revisions.
- Agent intelligence never implies permission.

## Consequences

Available agent capabilities can be derived from semantic capability ∩ current authority ∩ delegation ∩ task/session scope. External authorization engines may be adapters/evaluators, but Zoen owns the semantic authority contract and historical attribution.

## Evidence

- Issues #11, #42 and #156.
- RuleBinding reduction experiments exposed trusted-context substitution pressure.
- PR #183 tested child delegation subset enforcement.
- PR #182 demonstrated different human/agent workloads over the same Action.

## Revisit if

A mature external authority model can fully satisfy delegation, historical replay, explanation and agent workload semantics behind a smaller stable interface without weakening these invariants.
