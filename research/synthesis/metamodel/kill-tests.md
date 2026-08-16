# Metamodel reduction kill tests

**Issue:** #70  
**Rule:** a reduction fails when a required distinction remains representable only by convention, hidden code or a bypassable side channel.

IDs are local to #70. Each case points back to reviewed Wave A/B pressure where relevant.

## A. Type / identity / values

### K70-01 — value equality is not entity identity

Two invoices independently contain `Money(100, BRL)`.

**Required:** equal values need no shared object identity. Two Organizations with the same display name remain different entities.

**Kills:** one universal “everything is an object with UUID” model.

### K70-02 — identifier correction is not entity replacement

Product P has a bad source code corrected after historical Actions reference P.

**Required:** P identity remains stable; source identifier relation changes under governed correction history.

**Kills:** source-primary-key-as-identity core.

### K70-03 — duplicate-record merge is not legal succession

Two records are discovered to be the same supplier; separately, Company A legally merges into Company B.

**Required:** record dedupe and legal succession remain different Actions/relations.

**Kills:** generic `merge(entityA, entityB)` semantics.

## B. Property + Link -> Relation

### K70-04 — scalar target must be statically typed

`planningPrice(Product P) = Organization O` is attempted.

**Required:** reject; relation expects Money value.

**Kills:** untyped predicate/JSON-field relation core.

### K70-05 — entity target remains identity-bearing

`suppliedBy(Product P, Organization O)` is stored and later O changes name.

**Required:** link continues to O identity, not copied display value.

### K70-06 — cardinality is enforced, not documented

A relation declared `Employment -> Person exactly 1` receives a second employee participant.

**Required:** commit rejects.

**Kills:** relation-as-unvalidated-edge encoding.

### K70-07 — simple relation does not need fake relationship-object

`Document mentions Product` has no attributes/actions/lifecycle.

**Required:** express cheaply as Relation without creating a `Mention` entity.

**Kills:** universal Relator/object-backed-edge core.

### K70-08 — lifecycle relationship earns ordinary identity

Employment is suspended then terminated while Person and Organization persist.

**Required:** Actions target Employment identity; person/org identities unchanged.

**Kills:** binary-edge-only model and native Relator necessity if ordinary Type succeeds.

## C. Interface / Role / polymorphism

### K70-09 — shared capability is not Role

Product and FreightQuote both satisfy `Priceable`; Organization becomes Supplier only in relation to Buyer.

**Required:** shape contract can cover Priceable without claiming role dependence; Supplier membership is relation-founded.

**Kills:** Interface-as-Role.

### K70-10 — polymorphic Action input remains statically safe

Action `Reprice(x: Priceable)` accepts Product/FreightQuote but rejects Person.

**Required:** conformance is machine-checkable without a separate Interface base sort.

**Revives Interface:** if Type/shape-contract composition cannot support this across tool/query/action boundaries without per-tool exceptions.

### K70-11 — interface conformance does not supply identity

Car and Boat conform `Locatable`, with unrelated identity schemes.

**Required:** conformance does not merge identity domains.

## D. Event -> Type + enforced occurrence contract

### K70-12 — committed stock movement cannot be edited

StockMovement M has quantity 10. Generic update attempts quantity 20.

**Required:** lifecycle RuleBinding rejects through the same generic mutation boundary used by all Actions/admin APIs.

**Critical:** if any exported mutation path can bypass this, Event demotion fails.

### K70-13 — committed occurrence cannot be deleted to “undo” history

A posted JournalEntry occurrence is cancelled.

**Required:** original remains; reversal/correction is a new governed Action/occurrence.

### K70-14 — correction has explicit causal identity

Correction C references original occurrence O.

**Required:** both remain queryable; `corrects(C,O)` is preserved.

### K70-15 — externally sourced occurrence needs no local Action parent

Marketplace callback proves a remote fulfillment that OS did not initiate.

**Required:** occurrence can exist with external provenance and no fake local Action.

### K70-16 — Action invocation is not occurrence

`ShipOrder(order=1001)` is attempted but carrier rejects before shipment.

**Required:** Action attempt exists; no `ShipmentOccurred` record is fabricated.

**Kills:** Action=Event collapse.

### K70-17 — runtime event is not domain occurrence by default

Workflow timer/activity completes.

**Required:** runtime history can record completion without creating business Event/occurrence unless an independent semantic contract does so.

## E. Computation

### K70-18 — pure computation cannot write authoritative state

`CalculateAccountBalance` attempts database mutation/network side effect.

**Required:** runtime rejects capability use.

**Kills:** purity-as-comment.

### K70-19 — deterministic math is reusable outside Action

Same costing computation is used in preview, query and Action planning.

**Required:** one revision-pinned Computation definition can be reused without copying code into each Action.

**Kills:** no-Computation core.

### K70-20 — solver result algebra is not hidden

Planning solver finds feasible but unproven-optimal plan.

**Required:** result distinguishes feasible vs optimal vs unsat; Action can bind policy to that status.

**Revives Search:** if Computation execution-class/result contracts cannot express this without opaque conventions.

### K70-21 — agent judgment is evidence, not deterministic invariant

Agent estimates supplier risk 0.82 with rationale.

**Required:** result carries provenance/uncertainty; cannot satisfy a non-waivable accounting balance RuleBinding by default.

## F. Constraint / Invariant / Policy -> RuleBinding

### K70-22 — preview pass does not authorize commit

Purchase preview passes while amount is 40k; state changes to 80k before commit.

**Required:** commit-locus binding evaluates declared current dependencies and can deny.

**Kills:** one-time preview gate.

### K70-23 — pinned basis does not silently follow latest

Approved invoice uses pinned FX quote Q. New quote arrives before commit.

**Required:** if contract says pinned, calculation remains Q; unrelated latest state does not reinterpret approval.

**Kills:** “always reread current” RuleBinding semantics.

### K70-24 — false and evaluator error remain distinct

Authorization evaluator can return `Deny` or `Error`.

**Required:** binding applies declared error algebra; audit explains which occurred.

**Kills:** Policy=`Bool Function`.

### K70-25 — authority combination is explicit

One policy permits; another emergency policy forbids.

**Required:** declared authority algebra produces deterministic decision/explanation.

**Kills:** unordered set of boolean functions.

### K70-26 — invariant applies to every authoritative mutation path

Journal balance binding is attached to commit authority. Alternate admin/import Action tries unbalanced mutation.

**Required:** same invariant prevents commit.

**Kills:** Action-local `if balanced` convention.

### K70-27 — database-visible dependency is declared

Inventory reserve depends on aggregate available quantity.

**Required:** RuleBinding/StateBasis exposes the dependency shape so physical layer can enforce via SERIALIZABLE/conflict ranges/locks/etc.

**Kills:** checker that reads stale derived aggregate outside commit basis.

### K70-28 — authorization currentness differs from historical approval

Human approval exists, but task grant is revoked before commit for a rule declared current-at-commit.

**Required:** historical Approval remains; current authority binding denies commit.

### K70-29 — vested effect authority can coexist with current kill switch

Local Action validly vests authority to send later; emergency environment policy becomes deny before external attempt.

**Required:** effect-attempt binding can distinguish vested business authority from current non-waivable restriction.

## G. Action survival

### K70-30 — caller retry does not duplicate same semantic operation

Action O commits; response is lost; caller retries O with same intent digest.

**Required:** replay prior semantic result; mutation count remains one.

**Kills:** mutation as ordinary Computation call without semantic operation identity.

### K70-31 — same operation ID with changed intent is not replay

Retry O changes amount 100 -> 200.

**Required:** reject mismatch/reproposal; never return old result as if same intent.

### K70-32 — actor/represented/workload identities survive

Agent A acts on behalf of H through workload W under Grant G.

**Required:** Action audit preserves all identities; no impersonation collapse.

### K70-33 — Action commit and external effect are separate stages

Action commits EffectRequest; remote request later times out.

**Required:** Action local result remains committed while remote outcome is indeterminate.

### K70-34 — deleting Action recreates it under another name

Candidate reduced model defines `Computation + MutationPlan + operationId + actor + StateBasis + authority + atomic commit + replay`.

**Required synthesis judgment:** this is semantically an Action protocol. Renaming it is not reduction.

## H. Fact / Observation demotion

### K70-35 — contradictory observations coexist

ERP says cost 100; spreadsheet says 105.

**Required:** both immutable observations remain with source/revision; accepted planning cost can be 105 without deleting ERP evidence.

**Kills:** single current property as complete evidence model.

### K70-36 — source snapshot does not fabricate missing event history

PDF states stock position 40 but contains no movements.

**Required:** record observed position; do not create synthetic StockMovement events.

### K70-37 — rerun extractor does not mutate old derivation

LLM extraction M1 and later M2 disagree.

**Required:** new derivation identity/revision; M1 evidence remains explainable.

**Revives Fact/Statement:** if ordinary evidence Types/Relations cannot provide generic competing-assertion query/provenance semantics without repeated bespoke schemas.

## I. Projection demotion

### K70-38 — stale projection cannot satisfy current-at-commit rule silently

Graph/OLAP projection lags rev R by one transaction.

**Required:** Action requiring current authority/invariant reads authoritative basis or checks a sufficient freshness/revision contract.

### K70-39 — pinned analytical snapshot can be valid evidence

Audited Iceberg snapshot S is intentionally bound into a historical analysis Action.

**Required:** derived store can be admitted as pinned evidence under explicit revision/lineage; “derived” does not mean “never authoritative evidence”.

### K70-40 — rebuild preserves semantic deletion state

Projection is rebuilt after PII erasure.

**Required:** tombstone/erasure semantics prevent resurrection.

## J. Effect demotion

### K70-41 — provider has no pre-send idempotency key

EffectRequest E is stable locally; provider assigns receipt only after accepted request.

**Required:** model does not require `remote_operation_id` before send.

### K70-42 — timeout after send is unknown

Worker sends E, gets no response.

**Required:** knowledge becomes indeterminate, not failed.

### K70-43 — blind retry after dedupe guarantee expiry is unsafe

Queued workflow wakes after provider idempotency window has expired.

**Required:** generic retry refuses/reconciles; orchestration policy cannot override effect safety.

### K70-44 — webhook duplicate is evidence duplicate, not second outcome

Same provider event delivered twice.

**Required:** one correlated effect/outcome transition.

**Revives Effect:** if native external-I/O capability plus ordinary typed records cannot enforce all four without connector-specific side channels.

## K. Process / Commitment / Workflow

### K70-45 — business process outlives orchestration run

Manufacturing Process P continues after workflow execution is migrated/replaced.

**Required:** P identity unchanged.

### K70-46 — timer fires after commitment already fulfilled

Old 17:00 timer wakes after fulfillment at 16:55.

**Required:** no overdue status/action unless declared business basis says so.

### K70-47 — workflow succeeds while external effect unresolved

Runtime reaches terminal node after requesting remote payment whose outcome is pending.

**Required:** workflow completion does not claim payment/business completion.

## L. Grant / Approval / StateBasis / CommitWitness demotion

### K70-48 — approval is durable evidence, not PDP permit

Proposal P approved yesterday; current emergency policy denies today.

**Required:** retain approval record and deny current Action if contract requires current policy.

### K70-49 — Action with no proposal stage remains valid

Low-risk deterministic Action commits directly.

**Required:** no universal Proposal object requirement.

### K70-50 — audit graph reconstructs commit without mandatory CommitWitness noun

Given operation, actor/grant, rule decisions, StateBasis references, transaction result, resulting occurrences and EffectRequests.

**Required:** explain exact commit basis/causality. If reconstruction becomes ambiguous or non-retainable without one atomic witness record, promote/materialize it—but distinguish materialization from metamodel primitive.

## Pass/fail criterion

R5 is not accepted because these examples are representable. It survives only if executable models show:

```text
illegal state is unreachable through exported generic operations
required identity/provenance remains reconstructable
weaker reductions produce concrete counterexamples
repairing a failed reduction does not secretly recreate the deleted form
```

The most important sensitivity tests are K70-12, K70-22/24/26, K70-30/31 and K70-41/42/43.
