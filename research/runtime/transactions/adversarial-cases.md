# Adversarial cases — transaction and commit semantics

**Issue:** #40  
**Purpose:** attack the commit contract before runtime/database selection.

A candidate implementation should pass these cases without hard-coded domain branches in the generic engine.

## S-TX-01 — concurrent reservation write skew

Stock has 10 units available across several lots. T1 and T2 each compute availability 10 and each reserve 7 using separate reservation records.

**Required:** at most one commit (or another serializable valid outcome); committed total reservation cannot exceed availability under the domain's availability semantics.

**Fails if:** both commit because no shared row version changed.

## S-TX-02 — CAS sufficient for single-row edit

Object R at version 5 is edited by two clients. Both propose a direct value replacement that depends only on R=5.

**Required:** an exact version/CAS guard is sufficient; do not require whole-database serializable machinery merely by convention.

**Purpose:** prevents overfitting every operation to predicate serializability.

## S-TX-03 — phantom uniqueness

Two transactions both observe no active payment for invoice I, then insert separate payment records.

**Required:** unique/predicate/serializable enforcement prevents two successful active payments when the domain rule requires one.

**Fails if:** root invoice version is never written and both inserts commit.

## S-TX-04 — accounting atomicity

Posting one journal requires 12 lines and posting-state transition. The 11th line insert fails a constraint.

**Required:** no posted/partially visible authoritative journal exists; entire defined local commit aborts.

## S-TX-05 — accounting rule remains domain semantics

A different domain transaction has no debit/credit concept.

**Required:** generic transaction engine does not demand debit==credit. Accounting ontology/evaluator supplies that invariant only for journal posting.

## S-TX-06 — approved amount mutated after approval

Proposal P: pay R$40k. A approves P. Caller mutates request to R$80k but reuses A and operation id.

**Required:** reject as outside approved intent/parameters/idempotency identity; require new proposal/authority.

## S-TX-07 — live-at-commit stock approval

Manager approves `reserve up to 7 units if availability remains >=7`. Availability falls from 10 to 5 before commit.

**Required:** commit fails/reproposes; approval does not freeze old availability.

## S-TX-08 — frozen commercial quote

Customer accepts quote Q calculated at price-rule R1 and valid until 18:00. R2 raises price at 17:00. Commit at 17:15.

**Required:** if contract binds frozen Q and no other guard fails, use Q rather than silently recalculating under R2.

**Fails if:** global `always latest state` rule invalidates contractually frozen basis.

## S-TX-09 — frozen quote plus current sanctions block

Same as S-TX-08, but customer becomes legally blocked before commit.

**Required:** frozen commercial basis does not waive non-waivable current compliance/authorization check.

## S-TX-10 — approver authority revoked after historical approval

Approver A had authority at approval time and validly approved proposal. A later loses role. Operation contract says approval remains valid once issued, while executing agent's delegation must still be active.

**Required:** historical approval need not be retroactively invalidated merely because approver later lost role; current executing authority still checked according to contract.

## S-TX-11 — approval policy changed while pending

Proposal was approved under policy v1 requiring one approver. Before commit policy v2 requires two approvers for this operation and is defined as current-at-commit.

**Required:** v1 approval history remains explainable; commit under v2 requires second approval/reproposal as configured.

## S-TX-12 — policy intentionally pinned

A regulated historical calculation must use tax/rule revision effective on operation date even though newer rule exists now.

**Required:** commit uses the legally pinned/effective rule, not `latest policy everywhere`.

## S-TX-13 — ontology Action parameter semantics change

Proposal P was created under Action v1 where `amount` means gross amount. v2 redefines the parameter to net amount.

**Required:** P cannot silently execute under v2. Commit under pinned v1 if supported/allowed, migrate explicitly, or invalidate/reproposal.

## S-TX-14 — Function implementation optimization with same semantic revision

Physical evaluator implementation changes but declared Function semantics/revision are compatible and result is equivalent.

**Required:** proposal need not be invalidated merely due replaceable physical implementation change.

**Purpose:** prevents pinning irrelevant mechanism revisions into business meaning.

## S-TX-15 — known serialization failure and transparent retry

T1 conflicts and is definitely aborted. Retried T2 sees a changed internal row but recomputes the same result within approved bounds.

**Required:** same semantic operation id; complete logic reruns; commit may succeed without new approval if contract allows.

## S-TX-16 — retry recomputes outside approval bounds

Proposal approves supplier choice among A/B up to R$50k. T1 aborts. T2 sees price R$70k.

**Required:** stop transparent retry and return `NeedsReproposal`; do not commit R$70k using old approval.

## S-TX-17 — retry changes selected lot but remains allowed

Approval permits any non-quarantined lot satisfying exact spec and expiry constraints. T1 selected lot L1 but conflicts; T2 selects L2 within approved predicate.

**Required:** may remain same semantic operation if approval explicitly authorized bounded recomputation.

## S-TX-18 — generated operation id inside retry loop

T1 uses operation id O1; commit result becomes unknown. Retry generates O2 and commits.

**Required:** research model/implementation flags design as unsafe; operation id should have been stable outside attempts.

**Fails if:** both O1 and O2 can produce duplicate semantic effects with no dedupe relation.

## S-TX-19 — FoundationDB-like unknown commit then retry

T1 sends commit and client loses response. Durable store may already contain operation marker O. Client retries same O.

**Required:** retry detects O's committed marker/result and returns it without double-applying domain mutation.

## S-TX-20 — unknown commit with non-idempotent blind increment

Operation increments balance with no stable operation marker. Commit result is unknown and caller retries.

**Required:** system cannot claim safe automatic retry; remain/reconcile or use idempotent operation design.

## S-TX-21 — known abort versus unknown outcome

T1 receives a serialization conflict known to mean no commit. T2 receives transport timeout after commit submission with no proof either way.

**Required:** different typed outcomes/recovery paths; do not put both under generic `retryable error` without semantics.

## S-TX-22 — timeout before transaction execution begins

Request validation rejects before authoritative transaction begins.

**Required:** idempotency key may remain reusable according to operation contract; no committed operation marker is fabricated.

## S-TX-23 — same idempotency key, changed amount

Client sends O1 amount=100, then O1 amount=1000.

**Required:** reject idempotency mismatch. Never replay/merge as same semantic operation.

## S-TX-24 — same idempotency key, semantically equivalent serialization

Parameters arrive with map fields reordered but canonical intent is identical.

**Required:** equivalence should be based on canonical semantic request/digest, not raw JSON byte equality if contract defines semantic equivalence.

## S-TX-25 — idempotency retention expiry

A short-lived API operation key expires per declared policy. Client reuses it years later for an unrelated operation.

**Required:** behavior follows explicit namespace/retention contract; do not assume keys are globally eternal or always reusable.

## S-TX-26 — permanent business uniqueness exceeds API retry window

Supplier invoice external ID must never be posted twice for same legal entity/supplier, even after API idempotency key retention expires.

**Required:** domain uniqueness invariant is separate from short API idempotency retention.

## S-TX-27 — external HTTP call inside serialization retry loop

Transaction reads state, sends supplier order HTTP request, then database commit aborts with serialization failure and retries.

**Required:** runtime/design treats remote call as outside local rollback; cannot blindly rerun unless #41 idempotency/reconciliation contract proves safety.

## S-TX-28 — external effect intent committed atomically

Local Action commits business state plus durable effect-request/outbox record in same atomic transaction; executor crashes before remote send.

**Required:** local commit remains complete; effect intent remains discoverable for later execution. No remote success is falsely asserted.

## S-TX-29 — notification side effect fails after local commit

Local business edit commits; notification delivery fails.

**Required:** do not roll back/lie about local commit solely because non-authoritative notification failed unless operation contract explicitly makes notification a precondition through a stronger transactional protocol.

## S-TX-30 — source identity binding becomes stale before commit

#45 proposal binds source counterparty X exactly to Party A based on evidence set E1. New legal identifier evidence E2 arrives before commit and contradicts A. Binding operation uses current-at-commit `no contradictory legal identity evidence` guard.

**Required:** commit fails/reproposes; old approval cannot silently establish exact binding.

## S-TX-31 — binding proposal intentionally freezes evidence set

A low-risk adjudication contract explicitly approves exact binding based on immutable signed evidence set E and allows later unrelated observations without invalidation.

**Required:** commit validates E identity/integrity plus configured current guards; does not require all world evidence to be byte-identical.

## S-TX-32 — direct CRUD bypass violates invariant

Normal Action path protects `no duplicate active invoice`. Admin/API direct write inserts duplicate without same guard.

**Required:** if both are OS-owned authoritative mutation paths, architecture fails L-TX-15. Bypass must be removed, privileged repair semantics made explicit, or invariant enforced below both paths.

## S-TX-33 — privileged repair operation

Operator needs to repair corrupted authoritative data after incident.

**Required:** do not force ordinary business Action semantics if repair is a distinct privileged maintenance operation, but repair must explicitly preserve/audit invariant exceptions/corrections according to governance. No hidden raw SQL backdoor as normal behavior.

## S-TX-34 — concurrent membership invariant

At least one active approver must remain. A and B each read both active; A deactivates A, B deactivates B in separate rows.

**Required:** both cannot commit if invariant requires >=1 active. Demonstrates write skew/predicate dependency beyond same-row CAS.

## S-TX-35 — concurrent MRP/read-only calculation is advisory

Two planning calculations use same snapshot and produce proposals while source demand changes. Neither commits authoritative reservations.

**Required:** calculations may coexist; no need for write conflicts merely because advisory proposals were computed. Commit later validates required basis.

## S-TX-36 — long human approval

Proposal opened Monday, approved Friday. Database transaction cannot remain open all week.

**Required:** proposal/approval/basis are durable business/governance records; Friday commit opens a fresh short transaction and validates its contract.

## S-TX-37 — read result from transaction later aborted

Serializable transaction computes `available=7`, returns result to UI before commit; transaction is then aborted by serialization failure.

**Required:** UI must not treat 7 as authoritative committed result. It may be labelled tentative/preview and replaced after retry.

## S-TX-38 — sequence/side channel not rolled back

Physical storage allocates sequence number or mutates a nontransactional side channel, then transaction aborts.

**Required:** gaps/nonrolled-back mechanism state cannot be interpreted as proof a business operation committed.

## S-TX-39 — unique violation is persistent input error

User tries to create supplier invoice with exact duplicate business key already committed long before this transaction.

**Required:** do not blindly retry forever merely because unique violations can sometimes be concurrency-related. Classify using operation/invariant context.

## S-TX-40 — unique violation caused by concurrent key selection

Two operations inspect available candidate key and choose same key concurrently.

**Required:** one may retry/recompute if semantics allow; distinguish from persistent duplicate-business-key error.

## S-TX-41 — current permission revoked during retry

T1 is definitely aborted by conflict. Before T2, executing agent's delegation is revoked and operation requires current delegation.

**Required:** retry reauthorizes and stops; physical retry cannot inherit stale authorization from T1.

## S-TX-42 — historical approver deleted/deactivated

Approved proposal committed while approver was valid. Years later approver account is disabled/deleted from active IAM.

**Required:** historical commit witness still attributes approval to historical principal identity/evidence; current IAM state does not rewrite past authorization result.

## S-TX-43 — snapshot read deliberately weakens conflict dependency

High-churn diagnostic metric is read for display but does not affect mutation correctness. Physical runtime uses non-conflicting snapshot read.

**Required:** no unnecessary semantic dependency/abort is introduced; audit can still record the displayed observation if relevant.

## S-TX-44 — apparently irrelevant read accidentally influences decision

Code reads a diagnostic metric, then hidden branch uses it to select mutation while runtime treats read as non-conflicting snapshot.

**Required:** verification/review should detect dependency mismatch; operation cannot claim serializable semantic correctness if a decision-relevant read is omitted from guards.

## S-TX-45 — two independent Action instances with identical parameters

User intentionally makes two separate deposits of R$100. Parameters are identical but operation IDs differ.

**Required:** both can commit. Idempotency cannot dedupe solely by parameter equality.

## S-TX-46 — duplicate delivery of same Action invocation

Network delivers exact same operation O twice concurrently.

**Required:** at most one semantic commit; loser returns/reconstructs O result or conflicts safely.

## S-TX-47 — result replay after projection changes

Operation O committed when object state was X. Years later projections/current state changed. Duplicate request for O arrives.

**Required:** idempotent replay must not re-execute against current world merely because current projection differs. Return historical committed result/evidence according to contract.

## S-TX-48 — operation cancellation before commit

User cancels proposal before any authoritative commit attempt.

**Required:** mark proposal cancelled; no domain mutation. Reusing same operation id later depends on explicit cancellation/idempotency semantics, not guessed.

## S-TX-49 — cancellation races with commit

Cancel request and commit attempt race concurrently.

**Required:** serializable/atomic operation state machine yields one allowed outcome: either cancellation wins before commit or commit wins and later cancellation becomes a distinct correction/reversal request if domain permits. No state claiming both `cancelled-before-commit` and committed mutation without causal explanation.

## S-TX-50 — eventually consistent invariant is not a commit invariant

Analytics materialization may temporarily lag source by seconds. A candidate mistakenly declares `projection must equal source at every commit` as hard invariant.

**Required:** reject/move such property to convergence/SLA semantics if eventual lag is intentional. Generic transaction engine should not make every derived projection atomically current.

# Coverage dimensions

```text
state basis: exact-version / predicate / set-absence / immutable-ref / frozen-snapshot / live-current / none
operation lifecycle: direct / preview / approved / cancelled / retried
concurrency: lost-update / write-skew / phantom / aggregate / duplicate delivery
retry: known-abort / changed-result / reapproval / unknown-commit
idempotency: same request / mismatched intent / expiry / distinct identical params
revision: ontology / action / function / policy / irrelevant implementation
policy time: pinned / current / effective-date
side effects: none / intent only / remote in retry / notification failure
outcome knowledge: committed / definitely-aborted / indeterminate
mutation authority: Action / privileged repair / invalid bypass
```

Passing only single-row lost-update tests is not evidence that the commit semantics are enterprise-safe.
