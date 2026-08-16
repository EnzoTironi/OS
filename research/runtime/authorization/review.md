# Adversarial review — issue #42 authorization/delegation

**Date:** 2026-08-16  
**Disposition:** review-clean once final CI passes; research remains non-normative.

This review attacks the authorization/delegation contract, one-engine-first comparison, and executable toy model before integration.

## R-AUTH-01 — a stored grant is not proof that the grant was legitimately issued

The executable reference model begins with root `Grant` records already present in `AuthorityWorld`. That is an intentional simplification, not a semantic law.

A real root grant must itself have an issuance basis:

```text
grantor held delegable authority
issuance Action/decision was authorized
scope/limits were valid
policy/revision/evidence were recorded
```

A grant can be syntactically well-formed yet illegitimate because the grantor never possessed or could not delegate the authority.

**Correction/interpretation:** the toy model proves only **exercise and child-subdelegation invariants after a root grant has been admitted by a governed issuance path**. Grant issuance/revocation are first-class governed operations and must consume the same #40 authorization/commit discipline.

## R-AUTH-02 — per-request amount limit is not a cumulative budget

The toy model checks:

```text
request.amount <= grant.amount_limit
```

That is insufficient for grants such as:

```text
"spend at most R$ 50k total across this task"
"invoke this expensive Action at most 10 times"
```

Parallel agents/subgrants can each satisfy a per-request limit while collectively exceeding a parent budget.

**Required runtime pressure:** hard cumulative usage/call/monetary budgets require transactional shared state/invariants under #40. Child-grant limits do not automatically partition or reserve the parent budget unless the grant contract says so.

Scenario S-AUTH-53/54 is therefore not implemented by the toy model and remains a required #40/#46 test.

## R-AUTH-03 — independent grants are not automatically additive

An actor can hold several independent grants. The first draft correctly avoids summing them, but this must be explicit because authorization systems often accumulate permissions monotonically.

Examples:

```text
G1: spend <= 30k from Manager A
G2: spend <= 30k from Manager B
```

must **not** imply `spend <= 60k` unless the authority model explicitly permits aggregation.

Likewise, two grants can combine action/resource capabilities if policy permits, or be deliberately non-composable.

**Surviving law:** grant-combination semantics are explicit policy. `union all permissions` and `sum all limits` are not safe defaults.

## R-AUTH-04 — SoD “same effective authority” cannot be reduced to actor or represented-principal equality

The toy model demonstrates two useful cases:

```text
same actor
same represented principal
```

but real separation-of-duties can depend on:

- same parent grant/authority chain;
- same manager/controller;
- same organizational unit/reporting chain;
- beneficial ownership/control;
- same service principal despite different agent labels;
- identity uncertainty/merge discovered later;
- explicit control-specific independence definition.

Therefore `authorize_independent_approval()` is a test fixture, not the generic SoD semantics.

**Required model:** GRC/control ontology defines the independence predicate; authorization runtime evaluates/enforces it over durable participation/identity/grant evidence.

## R-AUTH-05 — Cedar entity assembly can be data projection or a hidden PDP; the boundary must be testable

Cedar is not disqualified merely because the application supplies entity data. The application necessarily retrieves/project semantic state.

The architecture becomes dishonest only when the assembly code starts deciding authorization semantics itself, for example:

```text
if risk > 80: omit membership tuple
if actor is suspended: refuse to include parent relation
pre-filter candidate resources to only those app code thinks are allowed
```

and Cedar then receives a pre-decided world.

**Pass criterion for Cedar-only:** entity/context construction is a deterministic, inspectable projection of authoritative OS state plus request context. Policy meaning remains in Cedar/declared OS grant semantics, not arbitrary application branching.

Performance/graph-size remains an empirical benchmark, not a semantic rejection.

## R-AUTH-06 — OpenFGA conditions/exclusions make it more than “just ReBAC”, but that does not prove it is sufficient

Current OpenFGA supports contextual tuples and typed conditions, and relationship models can express exclusions/differences. It is therefore wrong to reject OpenFGA solely as incapable of contextual policy.

The real kill test is operational/semantic:

- can emergency/non-waivable denies remain explicit and explainable?
- can numeric/purpose/risk limits remain first-class rather than app-side prechecks?
- can SoD over historical participation be modeled without a second interpreter?
- can grant revision/currentness and bounded-staleness semantics remain precise?

OpenFGA-only fails only if those concrete scenarios require hidden external policy decisions, not because of a category label.

## R-AUTH-07 — explicit deny semantics are contract semantics, not necessarily a `forbid` keyword

Cedar has native `forbid` with deny-overrides-permit behavior. Another evaluator may implement equivalent non-waivable restrictions through difference/exclusion/conditions or compiled policy.

The semantic requirement is:

```text
positive entitlement + matching non-waivable restriction -> deterministic deny
```

with clear precedence, revision and explanation.

Do not make the eventual backend syntax part of the OS ontology.

## R-AUTH-08 — authorization evaluator error is epistemic/operational; enforcement still fails closed

The toy result `INDETERMINATE` does **not** mean the caller receives a third permissive authorization state. It means:

```text
OS could not establish an allow decision
```

and the enforcement point must not execute the protected operation.

This distinction is useful for observability/retry and operator diagnosis:

```text
Denied        policy/grant says no
Indeterminate evaluator/data/verification failed; no allow established
Allowed       authority contract satisfied
```

## R-AUTH-09 — revocation semantics are limited by the claimed consistency mechanism

A system using:

- a short-lived signed capability;
- a cached PDP decision;
- an eventually replicated relationship store;
- an online linearizable grant revision;

cannot all truthfully claim the same `instant revocation` guarantee.

**Required law:** every operation class states its acceptable currentness/revocation contract, and the implementation must provide evidence strong enough for that claim. Emergency blocks may require a stronger online path than ordinary task-grant expiry.

## R-AUTH-10 — effect execution authority must distinguish vested business authority from current safety controls

A locally committed EffectRequest can legitimately vest authority to execute later, otherwise long-running durable work would depend on ephemeral sessions.

But vested business authority need not waive current controls such as:

```text
production environment kill switch
credential/account disabled
sanctions/compliance freeze
connector tenant mismatch
```

#41/#42 therefore need two independently expressible dimensions:

```text
business authority vested/current?
non-waivable attempt-time controls satisfied?
```

## R-AUTH-11 — AuthZEN and SPIFFE remain intentionally narrower than the OS authority model

AuthZEN can standardize the PEP↔PDP API; SPIFFE can strongly authenticate workloads. Neither should be stretched into the business grant/delegation ontology.

A backend/adaptor can preserve richer OS request evidence around a standardized wire request without making the wire schema the enterprise metamodel.

## R-AUTH-12 — multiple PDPs remain a burden-of-proof architecture

A Cedar + OpenFGA composition is only justified if a single backend fails concrete requirements.

If multiple PDPs are used, the architecture must define and test:

```text
which facts/policies each owns
allow/deny combination
failures/indeterminate decisions
model/policy revision compatibility
atomic rollout expectations
cache/currentness semantics
one auditable explanation
```

Otherwise two good authorization products become one weak authority contract.

# Surviving contract after review

```text
authenticated Workload W
        ↓ explicit binding
semantic Actor A
        ↓ explicit delegation/representation chain
Represented Principal H/O + Grants G*
        ↓
Action X / Resource R / Context C
        ↓
one hard authorization boundary / PDP where possible
        ↓
optional business Approval/GRC preconditions
        ↓
#40 commit authority basis
        ↓
#41 later effect authority basis if applicable
```

The strongest current semantic hypothesis remains ordinary typed actors/grants/relationships plus a generic authorization enforcement boundary (`M-AUTH2`).

No reviewed evidence yet proves `Principal`, `Role`, `Grant`, or a Cedar/OpenFGA-specific construct should be a root OS metamodel primitive.