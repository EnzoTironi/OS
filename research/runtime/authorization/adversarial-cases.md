# Adversarial cases — authorization and delegation

**Issue:** #42  
**Purpose:** attack the authority contract and one-PDP candidates before stack selection.

## S-AUTH-01 — authenticated workload, no actor binding

Workload W presents a valid SPIFFE SVID but no OS binding allows W to execute as Agent A.

**Required:** deny/fail closed. Authentication alone is insufficient.

## S-AUTH-02 — workload bound to wrong tenant

W can execute Agent A only for tenant T1, request targets T2.

**Required:** deny cross-tenant access unless an explicit cross-tenant capability exists.

## S-AUTH-03 — agent acts for human under bounded task grant

H grants A `Purchase.Quote.negotiate` for RFQ-7 up to R$50k until 18:00.

**Required:** allow matching operation; preserve actor=A, represented=H, grant=G, workload=W.

## S-AUTH-04 — same agent tries unrelated action

A under RFQ grant invokes `Payment.Approve`.

**Required:** deny; no role-copy/impersonation expansion.

## S-AUTH-05 — same task but amount exceeds grant

Grant max 50k; Action amount 80k.

**Required:** deny or require new grant/governance step; cannot silently use H's broader personal authority.

## S-AUTH-06 — purpose mismatch

Grant allows negotiation for RFQ-7; A uses it for unrelated supplier onboarding.

**Required:** deny.

## S-AUTH-07 — grant expired

Current-at-commit task grant expires before #40 commit.

**Required:** commit authorization fails according to declared currentness contract.

## S-AUTH-08 — proposal made before expiry, commit after expiry

Grant does not vest merely on proposal creation.

**Required:** if contract requires current grant at commit, fail/re-authorize; historical proposal remains evidence.

## S-AUTH-09 — authority intentionally vested at local commit for later effect

A validly commits Payment EffectRequest E; task session ends before executor sends E; contract says send authority vested at commit.

**Required:** executor may send E under vested EffectRequest authority, subject to attempt-time non-waivable controls.

## S-AUTH-10 — emergency kill switch after vested effect request

Same as S-AUTH-09, but organization activates non-waivable production payment freeze before send.

**Required:** if freeze is current-at-attempt control, executor blocks despite vested business authority.

## S-AUTH-11 — service-owned automation no human represented

Nightly inventory sync acts under organization service authority.

**Required:** allow if service/workload grant permits; do not invent a Person impersonation.

## S-AUTH-12 — agent spawns subagent with no child grant

A has task grant G; framework launches B and passes tool access implicitly.

**Required:** B cannot exercise G unless an explicit delegated/bound child authority path permits it.

## S-AUTH-13 — valid narrowed subgrant

G allows A actions {quote, select} up to 50k. A may subdelegate depth 1. Child grant GB gives B only `quote` up to 10k until earlier expiry.

**Required:** allow B within GB.

## S-AUTH-14 — subgrant expands amount

Parent 50k, child 100k.

**Required:** child issuance/use invalid.

## S-AUTH-15 — subgrant adds action

Parent grants quote only; child adds approve.

**Required:** invalid unless a second independent authority path grants approve.

## S-AUTH-16 — subgrant extends expiry

Parent expires 18:00; child says midnight.

**Required:** child cannot remain valid beyond parent-delegable authority.

## S-AUTH-17 — independent second grant broadens effective authority

A has G1 from H for quoting and G2 independently from Procurement Director for selecting suppliers.

**Required:** both authority paths can coexist; do not mislabel G2 as illegal expansion of G1.

## S-AUTH-18 — agent requests more authority

A proposes grant extension from 50k to 100k.

**Required:** proposal itself can be allowed, but A cannot self-issue/activate expanded grant without authorized grantor/governance.

## S-AUTH-19 — proposer cannot self-approve

A is individually allowed `Payment.Propose` and `Payment.Approve`; control requires independent approver for payment P that A proposed.

**Required:** deny A as required approver for P.

## S-AUTH-20 — two agents represent same human under four-eyes rule

Agent A proposes and Agent B approves, but both exercise the same human H's delegated authority. Control defines independence by represented principal.

**Required:** deny if effective-authority rule requires distinct represented principals.

## S-AUTH-21 — two agents owned by same org but independent employees

A represents employee H1; B represents H2. Control requires distinct persons, not distinct organizations.

**Required:** allow if all other requirements pass.

## S-AUTH-22 — SoD exception/waiver

Normally proposer cannot approve, but emergency waiver W explicitly permits named actor for one case/time.

**Required:** allow only if waiver itself is valid/governed; preserve exception evidence.

## S-AUTH-23 — hard SoD no exception

Control is a hard non-waivable invariant.

**Required:** waiver cannot override it merely because a generic exception object exists.

## S-AUTH-24 — approver role removed years later

Historical payment was approved while M had valid authority; M later leaves company.

**Required:** historical approval remains explainable and does not become retroactively unauthorized unless domain law explicitly says otherwise.

## S-AUTH-25 — current executor grant revoked between known-abort retries

T1 is definitely aborted by serialization conflict. Before T2, agent grant G is revoked; operation requires current grant.

**Required:** T2 reauthorizes/fails; cannot inherit T1's old allow result.

## S-AUTH-26 — current policy revision changes between proposal and commit

Proposal was allowed under policy v1; v2 introduces current-at-commit freeze.

**Required:** #40 authority basis determines whether v2 must apply; no implicit `always pinned`/`always latest` rule.

## S-AUTH-27 — pinned commercial delegation plus current tenant isolation

Grant scope/limits intentionally pinned for task; cross-tenant isolation remains current/non-waivable.

**Required:** both semantics coexist.

## S-AUTH-28 — revocation and commit race with same-store revision

Grant revision checked atomically inside authoritative commit; revocation increments revision first.

**Required:** stale commit fails deterministically.

## S-AUTH-29 — revocation and commit race with bounded-staleness token

Agent has signed token valid 5 minutes. Revocation occurs after token issuance; contract explicitly accepts up to 5-minute lag absent emergency kill.

**Required:** behavior follows declared staleness contract; do not claim instantaneous revocation.

## S-AUTH-30 — emergency revocation requires immediate block

Security incident requires no bounded lag.

**Required:** architecture must use a stronger online/fenced check for this operation class or admit it cannot satisfy requirement.

## S-AUTH-31 — PDP unavailable

All identity/grant data valid, but evaluator times out.

**Required:** enforcement fails closed; distinguish operational indeterminate/error from policy/business Denied for observability.

## S-AUTH-32 — missing grant data

Entity/tuple projection omitted parent grant accidentally.

**Required:** fail closed. Data assembly must be observable; no optimistic allow.

## S-AUTH-33 — stale relationship projection permits removed membership

Cedar entity slice/OpenFGA tuple replica is stale beyond declared authority consistency bound.

**Required:** operation requiring stronger currentness must not claim authoritative allow.

## S-AUTH-34 — Cedar-style explicit forbid beats permit

User has broad permit but emergency forbid matches account freeze.

**Required:** deny with explainable precedence.

## S-AUTH-35 — OpenFGA-style exclusion equivalent case

Authorization model encodes access except suspended members.

**Required:** if OpenFGA-only candidate claims equivalence, Check must deny without application code separately deciding suspension.

## S-AUTH-36 — numeric amount condition in OpenFGA-only candidate

Tuple/grant relation is valid only when request amount <= 50k.

**Required:** backend model/condition handles it clearly or candidate is marked insufficient; no hidden app-side allow check.

## S-AUTH-37 — graph membership in Cedar-only candidate

Resource access depends on nested team/org relationship.

**Required:** Cedar-only candidate can evaluate if OS supplies deterministic authoritative entity graph; application must not pre-decide allow while assembling it.

## S-AUTH-38 — large relationship traversal pressure

User access depends on deeply nested/dynamic group graph.

**Required:** measure/validate operational feasibility of Cedar entity projection; do not reject semantics solely from theoretical expressiveness.

## S-AUTH-39 — contextual tuple only for one request

Ephemeral task relationship should not become permanent authorization data.

**Required:** OpenFGA-only candidate can use contextual tuples/another explicit ephemeral mechanism without durable overgrant.

## S-AUTH-40 — contextual tuple used to fabricate unauthorized grant

Caller supplies contextual tuple claiming itself admin.

**Required:** only trusted enforcement/runtime code may construct authority-bearing contextual data; user input is not self-authenticating authorization fact.

## S-AUTH-41 — workload credential stolen/copied to different environment

Credential/audience/trust-domain/environment binding fails.

**Required:** deny before business Action/effect.

## S-AUTH-42 — test workload tries production effect

Same semantic Agent code in test environment has production connector target.

**Required:** production capability denied by environment/workload policy regardless of agent's business task grant.

## S-AUTH-43 — represented principal lacks delegable authority

Human H asks agent A to approve payment but H does not itself have/hold delegable approval authority.

**Required:** grant invalid; delegation cannot create authority from preference/request alone.

## S-AUTH-44 — grantor has authority but not right to subdelegate

H may perform X personally but policy says X is nondelegable.

**Required:** issuing G for X fails.

## S-AUTH-45 — delegated resource scope is a dynamic object set

Grant covers `all open cases assigned to queue Q`, whose membership changes.

**Required:** authorization uses declared set/predicate semantics at the required time; snapshot vs live membership must be explicit.

## S-AUTH-46 — grant covers frozen object set

Audit task grant covers exact case list S as of assignment.

**Required:** new cases entering queue do not silently enter frozen grant.

## S-AUTH-47 — policy decision allowed, business approval missing

PDP permits high-risk payment Action invocation but domain requires Manager Approval record.

**Required:** request cannot commit until governance precondition is satisfied; PDP allow is not substitute approval.

## S-AUTH-48 — approval exists, PDP denies current execution

Valid Manager Approval exists, but executing agent's task grant expired.

**Required:** deny current invocation while preserving approval history.

## S-AUTH-49 — agent can propose but not commit

Grant allows `Purchase.Propose` but not final `Purchase.Commit`.

**Required:** tools/surfaces expose only permitted semantic Actions; no generic mutation path bypass.

## S-AUTH-50 — agent tool cache is stale

Agent discovered tool X while grant was valid; grant later revoked but cached tool remains in model context.

**Required:** actual invocation reauthorizes at operation boundary; tool discovery cache is not authority.

## S-AUTH-51 — authorization check uses stale resource state

Policy allows refund only while case status=open; status closes before commit.

**Required:** #40 state/authority basis specifies currentness; early PDP decision cannot be sticky if resource state is commit dependency.

## S-AUTH-52 — authorization condition uses immutable approved snapshot

Policy intentionally authorizes action based on signed frozen contract revision.

**Required:** use pinned immutable reference, not forced current-state recalculation.

## S-AUTH-53 — call budget exhausted concurrently

Grant allows at most 10 expensive Actions; two concurrent attempts both see 9 used.

**Required:** usage-budget enforcement is transactional/concurrency-safe under #40 if it is a hard authority limit.

## S-AUTH-54 — monetary budget shared across subagents

Parent grant total spend cap 50k; child agents each see independent 30k sublimit.

**Required:** aggregate parent constraint cannot be exceeded through parallel children if parent cap is hard.

## S-AUTH-55 — separate grants combine to satisfy threshold?

A has two independent 30k grants from different grantors; Action costs 50k.

**Required:** combination semantics must be explicit. Do not sum grants automatically unless authority model permits aggregation.

## S-AUTH-56 — contradictory allow and deny paths

One relationship path permits, one emergency restriction denies.

**Required:** explicit precedence/combination rule yields deterministic fail-safe result and explanation.

## S-AUTH-57 — same user represented through two identities

Identity resolution later merges two accounts that participated in four-eyes approval.

**Required:** SoD/audit can detect that apparent two-actor independence may collapse after identity correction; preserve historical evidence and route review rather than rewrite blindly.

## S-AUTH-58 — fuzzy identity candidate cannot satisfy high-risk independence

Two approvers might be same Person at 0.7 identity confidence.

**Required:** high-risk SoD can require exact/stronger identity assurance before confirming independent approval; consume #45 relation assurance.

## S-AUTH-59 — human requests action in chat but chat endpoint identity uncertain

WhatsApp sender mapping to employee H is only candidate relation.

**Required:** do not authorize payment solely from fuzzy sender→Person correlation if operation demands exact identity assurance.

## S-AUTH-60 — workload acts as organization service with no user session

Reconciliation service queries provider status and updates derived effect knowledge.

**Required:** service authority can permit observation/reconciliation without inventing on-behalf-of human.

## S-AUTH-61 — same workload hosts multiple agents/tenants

Shared worker process executes tasks for A/T1 and B/T2.

**Required:** workload identity alone cannot become authorization principal; task/actor/tenant binding isolates each invocation.

## S-AUTH-62 — downstream connector uses shared service credential

Remote API sees one service account, but OS operations originate from many actors.

**Required:** local audit retains actor/grant lineage; remote credential identity is not substituted as business actor.

## S-AUTH-63 — external system supports per-user delegation token

Provider token explicitly represents H→A delegated scope.

**Required:** connector can preserve/map that stronger remote authority evidence; no need to erase it into shared-service semantics.

## S-AUTH-64 — delegation revoked after effect send but before remote completion

Remote async job already accepted under valid authority; local grant revoked.

**Required:** do not assume revocation cancels external job. Effect/domain contract decides whether remote cancellation is required/possible.

## S-AUTH-65 — actor changes role but old task grant remains valid by contract

Grant is an independent explicit delegation valid until expiry despite employment role change.

**Required:** if grant semantics allow this and no current policy denies, do not silently recalculate from latest role only.

## S-AUTH-66 — role-derived grant should track role currentness

Grant is defined as `while employee is Manager of U`.

**Required:** role change invalidates authorization according to live relationship dependency.

## S-AUTH-67 — authorization decision cached past policy revision

PDP permit cached; emergency policy update occurs.

**Required:** cache TTL/revision semantics cannot exceed required currentness; high-risk current deny invalidates stale cache.

## S-AUTH-68 — AuthZEN adapter swaps PDP backend

Request semantics remain same while backend changes from Cedar to another PDP.

**Required:** adapter preserves OS authority contract; no hidden loss of grant/represented/workload semantics to fit wire format.

## S-AUTH-69 — evaluator returns allow but explanation misses grant path

High-risk Action later audited.

**Required:** OS still has enough durable evidence (grant/model/request basis) to reconstruct why allow was valid; boolean alone is insufficient.

## S-AUTH-70 — multiple evaluator disagreement

If architecture uses Cedar + OpenFGA, FGA allows relationship while Cedar denies contextual freeze.

**Required:** deterministic documented combination rule, atomic revision compatibility, and explanation. If these cannot be made simple/reliable, multi-PDP candidate fails.

# Coverage dimensions

```text
identity: human / agent / service / workload / represented principal
delegation: direct / child / independent / expired / revoked / nondelegable
scope: action / resource / dynamic set / frozen set / purpose / amount / budget / time
currentness: pinned / live / vested-at-commit / attempt-time / bounded stale
SoD: same actor / same represented / same grant chain / exception / hard deny
evaluator: Cedar-only / OpenFGA-only / adapter / multiple PDPs
failure: deny / missing data / PDP unavailable / stale cache / revision race
execution: local commit / later effect / test vs production
identity assurance: exact / fuzzy candidate
```

Passing static role-membership tests is not evidence that the authority model is agent-safe.