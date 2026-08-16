# Candidate commit contract

**Issue:** #40  
**Status:** Wave B hypothesis.  
**Goal:** state what a governed business commit must mean independent of storage/runtime implementation.

The vocabulary below (`Operation`, `Proposal`, `StateBasis`, `CommitWitness`, etc.) names semantic jobs. It is not a proposed metamodel syntax.

# 1. Separate four identities

A robust runtime should not collapse these identities:

## 1.1 User/business goal

Example:

```text
"reserve 7 units for order O"
"approve supplier payment"
"bind source counterparty to Party P"
```

A user may retry this goal manually several times. The goal is not yet an execution identity.

## 1.2 Semantic operation identity

One invocation/decision intended to happen at most once according to its idempotency contract.

Candidate properties:

```text
operation_id
operation/action type revision
tenant/authority namespace
parameters or intent digest
initiating actor/delegation
created/proposed time
```

This identity persists across **physical transaction retries**.

## 1.3 Proposal/approval identity

Where preview/approval exists, it identifies the exact candidate decision being reviewed:

```text
proposal_id
operation_id
computed outputs
parameters/intent digest
state basis
semantic-definition revisions
expiry/validity
```

An approval refers to the proposal/decision scope, not to a mutable UI form.

## 1.4 Physical transaction attempt identity

Each database/commit attempt has its own attempt identity and outcome evidence:

```text
attempt_id
operation_id
storage transaction/version/session info
started_at
finished/failed_at
outcome evidence
```

One semantic operation may have attempts T1, T2, T3 after known-abort conflicts.

# 2. Operation semantic envelope

Before commit, enough durable/input information should exist to know what operation is being attempted.

Conceptually:

```text
OperationEnvelope {
  operationIdentity
  actionDefinitionRevision
  intent / parameters
  actorPrincipal
  delegationContext
  ontology/module revision references required for interpretation
  idempotencyContract
  proposalReference?       // optional
  approvalReference(s)?    // optional
  stateBasis
}
```

The engine does **not** need to persist this exact JSON/object. It must be able to reconstruct equivalent evidence for governed operations.

# 3. State basis

`StateBasis` answers:

> Which facts/state assumptions does the legitimacy/correctness of this operation depend on, and how must they behave between proposal/approval and commit?

It is more precise than `expectedVersion` and narrower than `reread everything`.

## 3.1 Exact version dependency

```text
resource R must still be revision V
```

Useful for:

- editing an exact document/object revision;
- high-risk exact identity binding;
- updating one configuration whose whole revision matters.

Possible enforcement: version column CAS, etcd `mod_revision`, object-version check.

## 3.2 Value/predicate dependency

```text
available(product=P, warehouse=W) >= 7
invoice.unpaid_amount == 1000
no active payment exists for invoice I
period P is open
```

The exact rows producing the result are implementation details. The semantic dependency is the predicate/result.

Possible enforcement: serializable query/read set, explicit predicate/range locks, constraint/index, generated conflict ranges, specialized evaluator.

## 3.3 Set-membership/cardinality dependency

```text
there is no supplier invoice with (entity, supplier, external_invoice_id)
this lot belongs to allowed set S
no conflicting approver exists
```

This is where simple object-version checks frequently miss write skew/phantom-like races.

## 3.4 Immutable reference dependency

```text
quote revision Q
signed source evidence E
published price rule revision R
approved BOM/spec revision B
```

Commit validates identity/integrity of the pinned immutable reference, not its equality with the newest/current definition.

## 3.5 Frozen snapshot dependency

A proposal deliberately binds a coherent snapshot of inputs/state for a validity window.

Example:

```text
customer accepted quoted price calculated from snapshot S until 18:00
```

Commit validates that S is the approved/pinned snapshot and that any explicitly non-waivable current constraints still hold. It does **not** recalculate the quote under today's price rule unless the contract says so.

## 3.6 Current-at-commit dependency

The operation intentionally depends on the current state when committing.

Example:

```text
reserve only if availability >= 7 *now*
agent delegation must still be active
sanctions/freeze policy must still allow payment
```

The check should occur inside/causally bound to the authoritative commit, not minutes earlier in the UI.

## 3.7 No relevant mutable dependency

Some operations are valid from immutable inputs alone or are append-only observations that do not claim exclusivity.

Do not invent version checks merely to make every operation look the same.

# 4. Proposal and preview semantics

A preview is a **candidate result under a stated basis**, never a promise that commit will yield the same state/result unless the contract intentionally freezes the relevant inputs.

Preview output should be able to identify:

```text
proposal id
operation id
parameters/intent
result/plan/derived effects
state basis
semantic revisions
warnings/uncertainty
expiry if applicable
```

A UI may render only part of this evidence, but approval/audit cannot depend on invisible mutable state it does not bind.

## 4.1 Preview consistency classes

### Advisory preview

No guarantee the result survives to commit. Commit recomputes and can return `needs_reproposal` if materially different.

### Live-basis proposal

The proposal fixes intent/parameters but expects selected state predicates to be reevaluated at commit. Approval authorizes that bounded reevaluation.

Example:

```text
approve purchase up to 100 units / R$ 50k,
commit selects exact lot/current stock under those approved limits
```

### Frozen-basis proposal

Approval applies to exact snapshot/reference/result. Commit may use it without recomputation so long as its validity and non-waivable current guards remain satisfied.

These are not base sorts; they demonstrate that approval semantics need an explicit contract.

# 5. Approval semantics

Approval is not `approved=true` on a mutable operation.

It needs to answer:

```text
who approved?
under whose/delegated authority?
what proposal/intent/parameters?
which limits/conditions?
which state basis?
which semantic/policy revision governed approval?
when does it expire/revoke?
does approval authorize bounded recomputation or exact frozen result?
which later changes invalidate it?
```

## 5.1 Parameter mutation after approval

If a material parameter changes, the previous approval cannot automatically follow the mutable object.

Example:

```text
approved amount = R$ 40k
operation changed to R$ 80k
```

The new request is outside the approved proposal/limits and requires new authority/reapproval.

## 5.2 Approval versus current authorization

An approval can remain historical evidence while the authority to commit may still require current checks.

Examples:

- approver legitimately approved yesterday but initiating agent's delegation is revoked before commit;
- payment approval exists but a legal/compliance freeze appears before execution;
- quote was approved/frozen and remains valid even though a normal current price rule changed.

Therefore the contract should distinguish:

```text
historical approval validity
current non-waivable authorization/policy
operation-specific frozen/current business assumptions
```

# 6. Commit algorithm — semantic form

The engine should behave *as if* one atomic local commit performs the required guards and mutations together.

Conceptual sequence:

```text
commit(OperationEnvelope O):
  1. resolve semantic definitions/revisions required by O
  2. verify operation/idempotency identity
  3. detect already-committed duplicate/replay
  4. validate proposal/approval integrity if applicable
  5. evaluate current authorization checks required by O
  6. validate declared StateBasis
  7. evaluate domain invariants / constraints
  8. compute or verify final mutations/result
  9. atomically persist:
       - dedupe/operation result marker
       - all local authoritative mutations
       - causal domain occurrence/decision records required by model
       - commit witness/audit evidence
       - external-effect intents causally created by this commit, if applicable
 10. return committed receipt/result
```

Physical runtimes may interleave/recompute steps to preserve serializability. The semantic guarantee is that no committed result can exist where required guards were false in the commit's declared basis/serialization.

# 7. Invariant enforcement

## 7.1 Invariant definition stays in the domain ontology

Examples:

```text
journal debits == credits
exclusive reserved quantity <= available quantity under defined semantics
invoice business key unique in scope
lot disposition forbids shipment
```

These do **not** become hard-coded generic-engine business rules.

## 7.2 Generic engine owns atomic enforcement facility

The engine/runtime must be able to ensure domain-defined invariants cannot be bypassed by a different mutation path.

Possible physical enforcement:

```text
serializable transaction
unique/exclusion/check constraint
explicit locking
CAS/version predicate
generated conflict range
specialized physical evaluator inside same transaction boundary
```

The physical choice may differ per invariant without changing domain semantics.

## 7.3 No partial local commit

If one local mutation in the defined atomic operation fails an invariant, the operation is definitely not committed locally. There must be no semantically visible half-posted journal or half-applied reservation merely because several storage rows were involved.

# 8. Retry taxonomy

## 8.1 Known-abort physical retry

Examples:

```text
serialization_failure
known optimistic conflict
CAS predicate false where operation contract allows recompute
```

The prior attempt definitely did not commit.

The runtime may retry under the **same semantic operation identity** if:

- intent/parameters are unchanged;
- authority/approval contract allows reevaluation;
- retry recomputes all state-dependent logic needed for correctness;
- the new result remains inside approved bounds/frozen constraints.

## 8.2 Conflict that requires semantic re-proposal

A physical retry sees a world where the final decision would materially differ outside the approved proposal/limits.

Examples:

- price increased above approved cap;
- supplier identity candidate changed due new legal evidence;
- requested inventory lot substituted with materially different regulated lot;
- policy revision changes required approvers.

Return a typed outcome such as:

```text
NeedsReproposal(reason, new_candidate)
```

Do not silently retry to a different business decision under the old approval.

## 8.3 Duplicate replay after known commit

Same operation identity arrives again with the same permitted semantic request.

Return/reconstruct the committed result; do not apply the operation again.

If the key/request identity conflicts with different intent/parameters, reject as idempotency misuse rather than guessing.

## 8.4 Indeterminate commit retry

If the caller cannot know whether T1 committed, blindly executing T2 can duplicate the semantic operation.

Recovery sequence:

```text
1. use operation identity / durable completion marker to query/reconcile
2. if committed -> return committed result
3. if definitely absent/aborted -> retry if contract permits
4. if still indeterminate -> remain indeterminate / escalate according to risk
```

If the underlying transaction is provably idempotent under stable operation identity, retry can itself be the reconciliation mechanism. That safety must be explicit, not assumed.

# 9. Idempotency contract

Idempotency answers:

> Which repeated requests are considered attempts to perform **the same semantic operation**, and what happens when they are replayed?

A candidate contract needs:

```text
operation namespace/type
idempotency key / operation id
tenant/account/authority scope
intent/parameter digest or comparison rule
semantic revision compatibility policy
retention/replay window
result replay behavior
unknown/partial-attempt behavior
```

## 9.1 Same key, different intent is an error

Never treat:

```text
PAY-123 amount=100
PAY-123 amount=1000
```

as a harmless retry.

## 9.2 Idempotency retention is semantic/operational policy

A key may need retention:

- only around a short API retry window;
- for the lifetime of an accounting/payment business identifier;
- indefinitely while a regulated operation must remain unique;
- until source-system dedupe guarantees supersede it.

Do not copy Stripe's 24h/30-day windows as OS law.

## 9.3 Operation identity should normally be allocated before retryable work

Generating a new operation/deposit/payment ID inside each transaction retry defeats dedupe under unknown results. FoundationDB makes this failure mode explicit.

# 10. Commit outcome evidence

The **actual** durable state and the caller's **knowledge** of it are distinct.

Candidate outcomes:

## Committed

Durable receipt proves the operation's local commit happened.

Possible evidence:

```text
operation marker/result row
commit/database revision
journal/occurrence id
transaction receipt
```

## DefinitelyNotCommitted

Evidence proves no local authoritative mutation from this attempt committed.

Examples:

```text
serialization conflict
failed CAS before write
constraint/policy/invariant rejected transaction
validation failed before transaction began
```

This is not necessarily a business failure; it may be retryable/reproposal-required.

## CommitOutcomeIndeterminate

The caller cannot prove success or abort from the interaction.

This is distinct from:

```text
ExternalEffectOutcomeUnknown   // #41 remote system
```

although both need reconciliation/idempotency patterns.

The semantic engine should not emit `Failed` merely because a transport/session timed out after commit submission.

# 11. Semantic revision binding

An operation can span changes to ontology/action/function/policy definitions.

The commit contract needs an explicit rule for which revisions are:

```text
pinned from proposal/approval
required to be current at commit
compatible through a declared version range
irrelevant implementation changes
```

## 11.1 Definition changes that affect interpretation

If `ActionType PayInvoice v2` changes parameter meaning, invariant, authority or output semantics while v1 proposal P is waiting, commit cannot silently run P under v2.

Options:

```text
commit under pinned v1 if still allowed and executable
migrate/reproposal P to v2 explicitly
invalidate P
```

## 11.2 Policy changes

Not every policy should freeze with approval.

Examples:

- approval routing/threshold rule may be pinned as evidence of what approval was valid then;
- sanctions/security freeze may be non-waivable current-at-commit policy;
- tax calculation rule may be pinned by legal effective date rather than wall-clock "latest".

The operation/domain policy defines this, not a global rule `all latest` or `all pinned`.

# 12. Concurrency dependency shapes

## 12.1 Single-record lost update

CAS/version check is often enough.

## 12.2 Write skew over two/many records

Example:

```text
two concurrent doctors/approvers each see another active
both deactivate themselves
invariant requires >=1 active
```

No single same-row write conflict exists. Requires predicate/set invariant enforcement, serializability, or explicit locking/constraint.

## 12.3 Phantom/absence dependency

Example:

```text
no payment exists for invoice I
```

Two transactions can both see absence and insert unless a unique constraint/predicate guard/serializable mechanism protects the absence.

## 12.4 Aggregate resource allocation

Example:

```text
sum(reserved over eligible lots) + requested <= available
```

Dependency can span sets/ranges and changes in membership, not only one balance row.

## 12.5 Immutable snapshot

No concurrency check is needed on the immutable referenced content itself; the operation may still require current authorization/other predicates.

# 13. Long-running business process is not an open transaction

Human approvals, procurement, manufacturing and reconciliation can last days/months. The database transaction should remain short.

Persist:

```text
proposal/process/approval state
pinned references/state basis
```

Then perform the final authoritative local commit as a fresh short transaction that validates the declared contract.

# 14. External side effects boundary

Never infer:

```text
inside transaction callback => remote effect atomic with DB
```

A retryable transaction can execute client code more than once; a remote system is outside the local rollback boundary.

Possible safe pattern, subject to #41:

```text
local commit atomically writes EffectRequest/Outbox intent
separate executor performs remote effect with idempotency/reconciliation
```

But this is a **candidate mechanism**, not the only architecture. A remote transactional resource/2PC-like protocol could create another physical contract. #41 must compare them against effect semantics.

# 15. Minimal runtime contract

If this research survives, any runtime must support:

1. stable semantic operation identity across attempts;
2. typed/durable operation result or dedupe evidence;
3. state dependencies richer than one row version;
4. atomic domain-invariant enforcement;
5. current and pinned semantic-definition references;
6. optional proposal/approval integrity binding;
7. explicit current-at-commit authorization/policy gates;
8. known-abort versus indeterminate commit outcomes;
9. retry of complete state-dependent logic after known conflicts;
10. a mechanism to escalate materially changed recomputation to re-proposal;
11. idempotent replay detection with intent/parameter protection;
12. durable causal link from operation commit to resulting domain changes/effect intents;
13. no generic bypass write path that evades these guarantees for OS-owned authoritative mutations.

None of these requirements says the runtime must be one database engine or that `Transaction` must be a domain primitive.
