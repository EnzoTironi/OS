# Action, event, effect, and outcome boundaries

- Artifact ID: `issue-0007-action-event-effect`
- Issue: `https://github.com/EnzoTironi/OS/issues/7`
- Parent: `https://github.com/EnzoTironi/OS/issues/2`
- Research angle: Comparative semantics of intended intervention, internal commit, external effect attempt, and observed outcome.
- Decision states present: `hypothesis`, `supported`, `undetermined`
- Accessed: 2026-08-15
- Contract: Wave A sections from `docs/swarm-research-backlog.md`. File layout follows the unmerged PR 84 contract so a later index can ingest this note. `docs/swarm-result-contract.md` is not on `origin/main`.

## Question

What exact semantic boundaries separate an intended intervention, a committed internal state transition, an external side effect, and an observed outcome? Which of those need a distinct kernel type, and which are ordinary typed objects?

This note does not answer `docs/open-questions.md` item 5 as settled architecture. Claims below stay inside their evidence scope.

## Source scope

Examined:

- Palantir Foundry Action Types official docs, accessed 2026-08-15. Overview, webhooks, submission criteria, Validate Action API.
- Ontologiq `5a087250f5ee0c7ab354d27fbafd53694a8ec366` (2026-08-07). README, `docs/security.md`, `docs/concepts.md`, `packages/core/src/ontologiq/serve/effects.py`.
- Open Foundry `f29bcb9ed819be76d549183b017316908bab8585` (2026-08-08). README, `packages/actions/src/executor/action-executor.ts`, `packages/actions/src/executor/types.ts`.
- Stripe Idempotent requests and Advanced error handling, accessed 2026-08-15.
- ValueFlows Flows, Diagram explanations, and Actions pages, accessed 2026-08-15.
- ERPNext Immutable Ledger, updated 2026-08-14.
- Chris Richardson, Transactional outbox, accessed 2026-08-15.
- Wade Waldron / Confluent, dual-write problem, accessed 2026-08-15.

Not examined in this pass:

- Ontologiq approval-store implementation beyond the cited docs and effect executor.
- Open Foundry side-effect handler and dry-run path beyond the executor and types.
- Palantir Function-backed actions and Ontology Scenarios beyond the cited pages.
- A payment-network specification other than Stripe.
- Moqui services, Odoo stock moves, GS1 EPCIS, W3C PROV-O, or ISA-95.
- RFC-0001 as evidence. Thesis and RFC statements are hypotheses to attack, not observations.

## Evidence

### E-001 Palantir action type versus apply

- Grade: `official-doc`
- Claim supported: An action type is a definition. Applying it is a later transaction.
- Citation: Palantir, Action types overview, accessed 2026-08-15, `https://palantir.com/docs/foundry/action-types/overview/`
- Observation: "An action type is the definition of a set of changes or edits to objects, property values, and links that a user can take at once. It also includes the side effect behaviors that occur with action submission." Applying an action is "a single transaction that changes the properties of one or more objects."
- Limits: Product documentation, not runtime source. "Transaction" here is Foundry's object-edit transaction, not a claim about external systems.

### E-002 Palantir validate is not a world-state preview

- Grade: `official-doc`
- Claim supported: Validate checks parameters and submission criteria. It does not re-read existing objects.
- Citation: Palantir, Validate Action, accessed 2026-08-15, `https://palantir.com/docs/foundry/api/v1/ontology-resources/actions/validate-action/`
- Observation: The endpoint returns `VALID` or `INVALID` from parameter evaluation and submission criteria. "For performance reasons, validations will not consider existing objects or other data in Foundry. For example, the uniqueness of a primary key or the existence of a user ID will not be checked."
- Limits: V1 API. A later apply can still fail for reasons validate never saw.

### E-003 Palantir writeback versus side-effect webhook

- Grade: `official-doc`
- Claim supported: Internal object edits and external calls are ordered, not jointly atomic.
- Citation: Palantir, Action types webhooks, accessed 2026-08-15, `https://palantir.com/docs/foundry/action-types/webhooks/`
- Observation: Writeback runs before object changes. Failure is shown to the user. Only one writeback webhook is allowed. Side-effect webhooks run after object changes, may run after the user sees success, and do not show failure. Palantir states writeback gives "some degree of transactionality" and then states the remaining hole. "It is still possible that the external request may succeed but Ontology changes could fail."
- Limits: Docs do not define an `unknown` outcome when the webhook times out after the request left.

### E-004 Palantir submission criteria bind the moment of submit

- Grade: `official-doc`
- Claim supported: Permission and business conditions are re-evaluated when the action is submitted, not only when it was configured.
- Citation: Palantir, Submission criteria, accessed 2026-08-15, `https://palantir.com/docs/foundry/action-types/submission-criteria/`
- Observation: Criteria "determine whether an action can be submitted" and "can only be submitted if all the submission criteria are met." The aircraft example requires the airplane's operating status "at the moment that the action is submitted."
- Limits: This is submit-time gating, not a durable proposal object with a later revalidation step.

### E-005 Ontologiq splits propose, approve, and execute

- Grade: `official-doc`
- Claim supported: Action definition, proposal, approval, and effect execution are different records and different processes.
- Citation: `ontologiq/ontologiq@5a087250f5ee0c7ab354d27fbafd53694a8ec366:README.md`
- Observation: An agent tool `propose_order_cancel` "cannot execute anything." It returns `outcome: pending_approval` and a `proposal_id`. Approval is a separate CLI or workbench process. "The precondition is evaluated twice, when proposing, and again at the moment of execution." "The arguments a human approved are hashed and re-verified before the effect fires; exactly one execution can ever win; a lost response is recorded `unknown`, never `failed`."
- Limits: Alpha product. Ontologiq does not write the warehouse. The effect is a webhook or handler in another system.

### E-006 Ontologiq security model pins unknown and no auto-approve

- Grade: `official-doc`
- Claim supported: Timeout after dispatch is `unknown`. Approval does not become allow on timeout.
- Citation: `ontologiq/ontologiq@5a087250f5ee0c7ab354d27fbafd53694a8ec366:docs/security.md`
- Observation: "A lost response is `unknown`, never `failed`." "If the request left and no response came back, whether the effect applied is genuinely unknown. Reporting failure invites a second refund." Retries are limited to a connect error, which "provably sent nothing," and to 5xx with the same `Idempotency-Key`. "A 4xx or a redirect ends the attempt immediately." "There is no approve tool on the MCP surface" and "no auto-approval on timeout." Proposals expire and "an expired proposal can never be approved." A single conditional `UPDATE` claims the proposal.
- Limits: Normative for Ontologiq's runtime. Not a general payment-network law by itself.

### E-007 Ontologiq effect executor implements three outcomes

- Grade: `implemented-code`
- Claim supported: Effect attempt outcomes are `executed`, `effect_failed`, and `unknown`.
- Citation: `ontologiq/ontologiq@5a087250f5ee0c7ab354d27fbafd53694a8ec366:packages/core/src/ontologiq/serve/effects.py#L11-L42` and `#L169-L196`
- Observation: Constants are `EXECUTED`, `FAILED` (`effect_failed`), and `UNKNOWN`. Connect errors retry. Any other transport exception after the request was sent returns `UNKNOWN` and does not retry. HTTP 2xx is `executed`. Redirect and 4xx are `effect_failed`. Every POST carries `Idempotency-Key`.
- Limits: Handler effects map any exception to `effect_failed` in one attempt. That path does not implement `unknown`.

### E-008 Open Foundry commits local effects, then runs side effects

- Grade: `implemented-code`
- Claim supported: Local object and link edits commit before external side effects. A later "rollback" is a new compensating transaction.
- Citation: `syzygyhack/open-foundry@f29bcb9ed819be76d549183b017316908bab8585:packages/actions/src/executor/action-executor.ts#L228-L357`
- Observation: Step 5 applies manifest effects in one SPI transaction and commits. Step 6 then runs side effects. On side-effect failure, `rollback.onSideEffectFailure` defaults to `LOG_AND_CONTINUE`. `ROLLBACK_ALL` opens a new transaction and tries to undo committed object and link edits from `beforeStates`. Deleted-object undo is documented as best-effort. Steps 7 and 8 say audit and event publish run after commit and "must not cause the action to appear failed."
- Limits: Compensation restores Open Foundry objects. It cannot un-call an HTTP webhook that already succeeded.

### E-009 Open Foundry action pipeline and incomplete dry-run

- Grade: `official-doc` plus `implemented-code`
- Claim supported: Action execution is a pipeline. Dry-run is partial validation, not a second semantic world.
- Citation: `syzygyhack/open-foundry@f29bcb9ed819be76d549183b017316908bab8585:README.md` Action Framework section. `packages/actions/src/executor/types.ts` `ActionResult.warnings` documents "dry-run partial validation."
- Observation: README pipeline is "validate, authorise, consent, preconditions, execute, side-effects, audit, emit." Mutations run "in a single SPI transaction." Side-effect executor is "HTTP webhooks and event bus notifications triggered post-commit."
- Limits: Dry-run implementation was not fully traced in this pass.

### E-010 Stripe treats lost responses and 500s as indeterminate

- Grade: `official-doc`
- Claim supported: A missing HTTP response is not proof of failure. A 500 is indeterminate and may have side effects.
- Citation: Stripe, Advanced error handling, accessed 2026-08-15, `https://docs.stripe.com/error-low-level`. Stripe, Idempotent requests, accessed 2026-08-15, `https://docs.stripe.com/api/idempotent_requests`
- Observation: On network errors, "clients are usually left in a state where they don’t know whether or not the server received the request." Retry the same idempotency key and the same parameters until a result returns. "You should treat the result of a `500` request as indeterminate." Stripe may later fire webhooks for objects created during reconciliation. Retrying a 500 with a new key is advised against because the original key "may have produced side effects." Keys are remembered at least 24 hours. Results are saved only after endpoint execution begins.
- Limits: Stripe-specific cache and webhook behavior. The semantic split between network-unknown and server-indeterminate generalizes.

### E-011 Dual write and transactional outbox

- Grade: `official-doc`
- Claim supported: A database commit and an external message are not one atomic fact. An outbox makes the *intent to notify* atomic with the commit. Delivery remains at-least-once.
- Citation: Chris Richardson, Pattern: Transactional outbox, accessed 2026-08-15, `https://microservices.io/patterns/data/transactional-outbox.html`. Wade Waldron, Understanding the Dual-Write Problem, Confluent, accessed 2026-08-15, `https://www.confluent.io/blog/dual-write-problem/`
- Observation: Updating a database and sending a broker message without a shared transaction leaves a window where one write exists and the other does not. Reordering the two writes only flips which side is missing. The outbox writes the message row in the same local transaction as the business update. A relay publishes later. The relay "might publish a message more than once," so consumers must be idempotent.
- Limits: This is a messaging pattern, not an ontology. It does not create an observed business event by itself.

### E-012 ValueFlows separates intent, commitment, and observed event

- Grade: `official-doc`
- Claim supported: An observed economic flow is a past occurrence. It is not a plan and not a request.
- Citation: ValueFlows, Flows, accessed 2026-08-15, `https://www.valueflo.ws/concepts/flows/`. ValueFlows, Diagram explanations, accessed 2026-08-15, `https://www.valueflo.ws/specification/model-text/`
- Observation: "Economic Events describe past flows, something observed, never some potential future event." They can fulfill Commitments or satisfy Intents when no Commitment exists. "An EconomicEvent is the 'real' flow, one that actually happened." "An actual EconomicResource is created only by EconomicEvents." "An EconomicEvent can correct a previous EconomicEvent, or reverse it completely." Intent has one agent, not both. Commitment is a promised or scheduled flow between agents.
- Limits: ValueFlows `Action` is a flow verb such as `produce` or `transfer`. It is not Palantir's or Ontologiq's mutation type. See D-001.

### E-013 ValueFlows corrections are later events

- Grade: `official-doc`
- Claim supported: Correction and reversal are new observed events related to an earlier event. They are not in-place mutation of the original occurrence.
- Citation: ValueFlows, Flows, "Correcting Events," accessed 2026-08-15, `https://www.valueflo.ws/concepts/flows/`
- Observation: "Economic events are immutable in accounting practice, since at any time they could have been reported formally. To correct economic implications of an economic event, you need another economic event, which can be related to the first one with the relationship `corrects`. The correcting event can have a negative number. It can either completely back out the original event or adjust it."
- Limits: Accounting practice cited as the reason. Operational sensor events may need a different correction story. Not examined here.

### E-014 ERPNext cancel, reverse, and amend are different operations

- Grade: `official-doc`
- Claim supported: After submit, ERPNext does not delete history. Cancel posts reversals. Amend creates a new document. Return and reverse-journal are other follow-up documents.
- Citation: ERPNext, Immutable Ledger, updated 2026-08-14, `https://docs.frappe.io/erpnext/immutable-ledger-in-erpnext`
- Observation: Cancel keeps original ledger rows and adds opposite rows. "Does cancelling a document erase its original accounting entry? No." Drafts may be edited or deleted. Submitted invoices are cancelled and amended when period and links permit. Customer returns use a return or credit note. A journal can be reversed without cancelling the source. "Cancellation removes the active business and accounting effect through reversal logic. Reposting regenerates ledger entries from a source document that remains submitted and valid."
- Limits: GPL product. Concepts and documented behavior only. No implementation copied.

### E-015 Ontologiq action is a governed decision, not an occurrence

- Grade: `official-doc`
- Claim supported: Ontologiq's action answers who may act, what must be true, whether a human signs, and what call is attempted. It does not record that the warehouse changed.
- Citation: `ontologiq/ontologiq@5a087250f5ee0c7ab354d27fbafd53694a8ec366:docs/concepts.md`
- Observation: "An effect is a webhook or a Python handler. It is never a database write." "It governs the decision, your systems perform the change."
- Limits: This is Ontologiq's adoption constraint. A greenfield OS that owns operational truth may commit internal facts in the same engine. The decision-versus-occurrence split still stands.

## Domain evidence

Independent sources keep splitting four real-world questions that ERP screens often collapse into one status field.

1. What did someone try to do, under which parameters and authority?
2. What did this system itself accept as a committed change?
3. What call or physical act was dispatched at another system or agent?
4. What was later observed to have happened?

ValueFlows answers 1 as Intent or Commitment, and 4 as EconomicEvent. It can skip 2 and 3 because it is an economic language, not an integration runtime.

Palantir, Ontologiq, and Open Foundry answer 1 as an action type plus an invocation. They answer 2 as object edits. They answer 3 as webhooks or handlers. They are weak or silent on 4 except where a later action or sync writes objects again.

Stripe and the outbox literature exist because 2 and 3 cannot be one fact once a process boundary is crossed. A timeout after dispatch is a fact about knowledge, not a fact about the payment or the supplier order.

ERPNext's submit, cancel, amend, return, and reverse-journal exist because a later operational decision is not the same kind of thing as rewriting the original occurrence.

## Source-system artifacts

These names are local. Do not map them onto OS types.

- Palantir `Action type`, `apply`, `validate`, writeback webhook, side-effect webhook, submission criteria, Ontology Scenario.
- Ontologiq YAML `actions[]`, MCP `propose_*` tool, `proposal_id`, CLI `approvals approve`, outcomes `executed` / `effect_failed` / `unknown`, warehouse-read-only rule.
- Open Foundry ODL `@actionType`, YAML manifest `effects` versus `sideEffects`, SPI transaction, `LOG_AND_CONTINUE`, `ROLLBACK_ALL`, CloudEvents emit, 5-minute idempotency cache.
- Stripe `Idempotency-Key`, 24-hour cache, `Stripe-Should-Retry`, PaymentIntent objects, webhooks as later truth.
- Outbox table and message relay.
- ValueFlows `Intent`, `Commitment`, `EconomicEvent`, `Claim`, flow `Action` verbs, `corrects`.
- ERPNext `docstatus`, Cancel, Amend, Amended From, Credit Note, Reverse Journal Entry, Repost Item Valuation.

## Concepts

### C-001 Action definition

- Source term: Palantir action type. Ontologiq `actions[]`. Open Foundry `@actionType` plus YAML manifest.
- Domain distinction: The reusable verb and its rules. Who may call it, which parameters it takes, which preconditions apply, which internal edits it may attempt, which external calls it may attempt.
- Evidence: `E-001`, `E-005`, `E-009`, `E-015`
- Source-specific form: YAML versus Ontology Manager configuration versus ODL.
- Alternative interpretations: A function plus policy metadata. A service in a Moqui-style framework.
- Decision state: `supported` as a real distinction from a single invocation. Whether it is a kernel type remains `undetermined`. See open question 4.

### C-002 Action invocation

- Source term: Palantir apply. Ontologiq proposal. Open Foundry `actionId` execution.
- Domain distinction: One attempt to perform a defined action with bound arguments, actor, and time.
- Evidence: `E-001`, `E-005`, `E-008`
- Source-specific form: Palantir has no durable proposal object in the cited docs. Ontologiq does.
- Alternative interpretations: A command message. A workflow task.
- Decision state: `supported` as distinct from the definition. Ordinary typed object is enough on current evidence.

### C-003 Proposal and approval

- Source term: Ontologiq proposal. Palantir validate and submission criteria.
- Domain distinction: A reviewed intent that is not yet a commit. Approval authorizes a digest of arguments and assumptions, not "whatever the world looks like later."
- Evidence: `E-002`, `E-004`, `E-005`, `E-006`
- Source-specific form: Ontologiq hashes arguments and rechecks live preconditions. Palantir validate skips existing objects.
- Alternative interpretations: Workflow human-task. Policy `require_approval` in an agent-governance toolkit. Not treated as OS evidence here.
- Decision state: `supported` that preview, approval, and commit are different stages. Durable proposal-as-object is `hypothesis` for OS.

### C-004 Internal commit

- Source term: Palantir object edits. Open Foundry SPI transaction commit. ERPNext submit.
- Domain distinction: This system accepted a state transition under its own invariants.
- Evidence: `E-001`, `E-008`, `E-014`
- Source-specific form: Foundry object storage. Open Foundry SPI. ERPNext submitted document plus ledger rows.
- Alternative interpretations: A set of Facts. An event-sourced fold. Not chosen here.
- Decision state: `supported` as distinct from both intent and external outcome.

### C-005 External effect attempt

- Source term: Palantir webhook. Ontologiq effect. Open Foundry side effect. Stripe POST.
- Domain distinction: A dispatched attempt to change or notify another system or agent. Intent to call, bytes on the wire, and observed reply are different facts.
- Evidence: `E-003`, `E-007`, `E-008`, `E-010`, `E-011`
- Source-specific form: HTTP webhook is the common implementation. Not the domain.
- Alternative interpretations: Treat the attempt as just another Action invocation on a connector principal.
- Decision state: `supported` as a distinction. Whether it needs its own kernel type is `L-008`, still `hypothesis`.

### C-006 Observed outcome

- Source term: ValueFlows EconomicEvent. Stripe webhook object. ERPNext ledger row. Carrier pickup acceptance.
- Domain distinction: A claim that something occurred in the modeled world, with time and provenance. It can arrive with no OS action, late, or in conflict with an earlier attempt.
- Evidence: `E-010`, `E-012`, `E-013`, `E-014`
- Source-specific form: VF EconomicEvent updates EconomicResource. ERPNext ledger rows are posting evidence.
- Alternative interpretations: Outcome is only a status enum on the invocation. That collapses late observations and external-origin events.
- Decision state: `supported` as distinct from Action. Whether `Event` is a kernel type, an interface, or a Fact shape is `undetermined`.

### C-007 Unknown

- Source term: Ontologiq `unknown`. Stripe indeterminate 500 and lost response.
- Domain distinction: After dispatch, the system does not know whether the other side applied the change. This is not pending, and it is not failed.
- Evidence: `E-006`, `E-007`, `E-010`
- Source-specific form: Ontologiq stores it on the attempt. Stripe tells the client to reconcile via retry and webhooks.
- Alternative interpretations: A missing response could be modeled as a timeout event plus later observation. The three-way split still remains.
- Decision state: `supported`

### C-008 Compensation, reversal, and correction

- Source term: Open Foundry `ROLLBACK_ALL`. ValueFlows `corrects`. ERPNext Cancel, Reverse Journal Entry, Amend, return.
- Domain distinction: Compensation tries to undo a *local* commit after a later step failed. Reversal posts an opposite economic or ledger effect and keeps the original. Correction records that a prior observation was wrong or incomplete. Amendment replaces a cancelled document with a new one.
- Evidence: `E-008`, `E-013`, `E-014`
- Source-specific form: Open Foundry compensation cannot recall an external HTTP success. ERPNext cancel is blocked by closed periods and linked documents.
- Alternative interpretations: One "undo" verb. The sources refuse that collapse.
- Decision state: `supported`

## Invariants

### I-001 Requested is not happened

- Statement: An action invocation, even an approved one, does not by itself establish an observed outcome.
- Scope: Any action that can fail, be denied, stay unknown, or depend on another system.
- Evidence: `E-003`, `E-005`, `E-007`, `E-010`, `E-012`
- Failure case: Agents retry refunds. Integrations treat timeout as failure and duplicate supplier orders.
- Falsifier: A production domain where intent and occurrence are safely the same record with no escape hatch.
- Decision state: `supported`

### I-002 Dispatch-unknown is not failed

- Statement: If a request may have been received, the attempt outcome is `unknown` until reconciliation. Failed is allowed only when the other side refused, or when the request provably never left.
- Scope: External calls and any process boundary with at-most-once business effects.
- Evidence: `E-006`, `E-007`, `E-010`
- Failure case: A second refund after a lost 200.
- Falsifier: A protocol that can prove non-receipt after bytes left the client.
- Decision state: `supported`

### I-003 Approval does not freeze the world

- Statement: Commit must re-evaluate live preconditions and the approved argument digest. A stale approval cannot execute.
- Scope: Any propose-then-later-execute path. Scenario S-003.
- Evidence: `E-002`, `E-004`, `E-005`, `E-006`
- Failure case: Inventory arrives between propose and approve. The approved purchase still fires.
- Falsifier: An approval model that binds a snapshot and treats later world-change as in-scope without revalidation, and that still preserves authority. Not seen.
- Decision state: `supported`

### I-004 Internal commit and external effect are not one atomic fact

- Statement: Crossing a process or organization boundary creates a dual-write. The model must record both sides and reconcile.
- Scope: Webhooks, payment APIs, ERP writeback, message brokers, email.
- Evidence: `E-003`, `E-008`, `E-010`, `E-011`
- Failure case: Ontology says ordered, supplier never got the call, or the reverse.
- Falsifier: A widely used stack where ontology edits and foreign-system writes abort together with no remaining unknown. Palantir writeback does not meet this.
- Decision state: `supported`

### I-005 Occurrences can exist without an OS action

- Statement: An observed event may arrive from a carrier, a bank, a sensor, or a person with no prior OS invocation.
- Scope: Ingestion, async callbacks, economic observation.
- Evidence: `E-012`, `E-010`
- Failure case: Forcing every stock move or payment capture to mint a fake Action destroys provenance.
- Falsifier: A domain where every occurrence is caused by exactly one OS action and no external-origin event exists.
- Decision state: `supported`

### I-006 History is not rewritten in place

- Statement: After an occurrence or posting is accepted, correction and reversal add later records. They do not delete the original.
- Scope: Accounting, stock ledgers, formally reported economic events.
- Evidence: `E-013`, `E-014`
- Failure case: Silent ledger edits make "why does the world look like this?" unanswerable.
- Falsifier: A regulated domain that treats in-place mutation of posted history as correct. Not found in the cited sources.
- Decision state: `supported` inside accounting and VF observation. `undetermined` for ephemeral UI state.

## Candidate laws

### L-001 Four-place split

- Statement: Intended intervention, internal commit, external effect attempt, and observed outcome are four different questions. A single status field cannot answer all four.
- Evidence: `E-001`, `E-003`, `E-005`, `E-007`, `E-010`, `E-012`, `E-014`
- Independent convergence: Palantir, Ontologiq, Open Foundry, Stripe, ValueFlows, ERPNext, outbox literature.
- Known limits: Some local admin edits may have no external effect and no separate observation. That is a degenerate case of the same split, not a counterexample.
- Counterexamples: `X-001`
- Decision state: `supported`

### L-002 Unknown after dispatch

- Statement: After an attempt is dispatched, missing confirmation is `unknown`. Retry is safe only with the same idempotency key, or after a provider lookup that cannot create a second effect.
- Evidence: `E-006`, `E-007`, `E-010`
- Independent convergence: Ontologiq implemented code and Stripe official docs.
- Known limits: Connect-level failure may be retried without lookup because nothing was sent. That is a narrower case.
- Counterexamples: `X-002`
- Decision state: `supported`

### L-003 Revalidate at commit

- Statement: Preview and approval bind a digest. Commit re-reads state. Mismatch denies or requires a new proposal.
- Evidence: `E-002`, `E-004`, `E-005`, `E-006`
- Independent convergence: Ontologiq. Palantir submit-time criteria are a weaker form. Palantir validate is a negative example of preview that skips world state.
- Known limits: How much of the world the digest must include is open. Ontology revision, policy revision, and assumed stock are candidates. Not proven here.
- Counterexamples: `X-003`
- Decision state: `supported` for revalidation. `undetermined` for the exact digest contents.

### L-004 Dual-write is domain-visible

- Statement: The gap between internal commit and external delivery is a business state, not only an infrastructure worry. Outbox, writeback, and compensation are tactics. They do not erase the gap.
- Evidence: `E-003`, `E-008`, `E-011`
- Independent convergence: Palantir docs, Open Foundry executor, Richardson, Confluent.
- Known limits: If OS never calls another system, the gap moves to humans and paper. It does not disappear.
- Counterexamples: `X-004`
- Decision state: `supported`

### L-005 Event is not Action

- Statement: An occurrence can fulfill, correct, or ignore prior actions. An action can produce zero, one, or many occurrences, or only an attempt record.
- Evidence: `E-001`, `E-008`, `E-012`, `E-015`
- Independent convergence: ValueFlows versus every operational-ontology action runtime cited.
- Known limits: Naming collision. VF `Action` is a verb on a flow. See D-001.
- Counterexamples: `X-005`
- Decision state: `supported`

### L-006 Undo is not one verb

- Statement: Compensation, reversal, correction, and amendment are different follow-up operations with different authority and different traces.
- Evidence: `E-008`, `E-013`, `E-014`
- Independent convergence: Open Foundry, ValueFlows, ERPNext.
- Known limits: Everyday speech uses "cancel" for all four. The sources do not.
- Counterexamples: `X-006`
- Decision state: `supported`

### L-007 Definition is not invocation

- Statement: The action type is a definition under an ontology revision. The invocation is a dated attempt. They must not share one identity.
- Evidence: `E-001`, `E-005`, `E-009`
- Independent convergence: Palantir, Ontologiq, Open Foundry.
- Known limits: Version pinning of the definition on the invocation is hypothesized in RFC-0001 and not evidenced here.
- Counterexamples: `X-007`
- Decision state: `supported` for the split. `undetermined` for revision pinning.

### L-008 Effect is not a kernel type

- Statement: External effect is an attempt record plus later observations. Those are ordinary typed objects, or Action invocations on a connector, plus Events. A third sibling type beside Action and Event is not required by the evidence.
- Evidence: `E-007`, `E-010`, `E-011`, `E-015`
- Independent convergence: Ontologiq and Stripe store outcomes on the attempt and learn the rest from later webhooks or lookups. Neither introduces a peer primitive named Effect.
- Known limits: A runtime may still want a first-class *record* of attempts. Record is not kernel type.
- Counterexamples: `X-008`
- Decision state: `hypothesis`

## Counterexamples

### X-001 One status field is enough

- Targets: `L-001`
- Setup: Model supplier order as `status = requested | accepted | failed`.
- Falsifying result: Lost HTTP after accept is representable without collapsing accept and unknown.
- Observed result: not run. Palantir and Stripe both need extra states or later webhooks. `E-003`, `E-010`
- Consequence: leaves `L-001` supported
- Decision state: `supported` as a failed collapse

### X-002 Timeout means failed

- Targets: `L-002`, `I-002`
- Setup: Payment POST times out. Client marks failed and offers retry with a new key.
- Falsifying result: No double charge in Stripe's own guidance.
- Observed result: Stripe forbids that reading. `E-010`. Ontologiq encodes the opposite. `E-007`
- Consequence: leaves `L-002` supported
- Decision state: `supported` as a failed collapse

### X-003 Approve once, execute later without reread

- Targets: `L-003`, `I-003`
- Setup: Scenario S-003. Receipt posts between propose and approve.
- Falsifying result: Executing the stale purchase is still authorized.
- Observed result: not run against OS. Ontologiq refuses by rechecking. `E-005`. Palantir validate would not even see the receipt. `E-002`
- Consequence: leaves `L-003` supported
- Decision state: `hypothesis` as a live kill test for any OS implementation

### X-004 Writeback webhook is a distributed transaction

- Targets: `L-004`, `I-004`
- Setup: Palantir writeback to ERP, then ontology edits.
- Falsifying result: Docs claim both sides abort together in every failure mode.
- Observed result: Docs admit the opposite hole. `E-003`. Open Foundry commits first, then compensates. `E-008`
- Consequence: leaves `L-004` supported
- Decision state: `supported` as a failed collapse

### X-005 Every event is an action result

- Targets: `L-005`, `I-005`
- Setup: Carrier accepts pickup hours later with no user clicking Ship.
- Falsifying result: The pickup cannot be recorded unless OS mints a Ship action.
- Observed result: ValueFlows records EconomicEvents that satisfy intents with no commitment. `E-012`. Stripe webhooks create objects the client never saw. `E-010`
- Consequence: leaves `L-005` supported
- Decision state: `supported` as a failed collapse

### X-006 Cancel covers compensation, reversal, and correction

- Targets: `L-006`, `C-008`
- Setup: Posted invoice already allocated to a payment. User hits Cancel.
- Falsifying result: One cancel verb is enough in ERPNext and ValueFlows.
- Observed result: ERPNext splits cancel, amend, return, reverse-journal, and repost. `E-014`. ValueFlows uses a later `corrects` event. `E-013`. Open Foundry compensation is a local undo after a side-effect miss, not a fiscal reversal. `E-008`
- Consequence: leaves `L-006` supported
- Decision state: `supported` as a failed collapse

### X-007 Store only the latest action type

- Targets: `L-007`
- Setup: Ontology revision changes discount rules after an approved invocation.
- Falsifying result: Historical explanation needs only the current type.
- Observed result: not run. Scenario S-012 remains open. Ontologiq refuses approve across an ontology change without `--force`. `E-006`
- Consequence: `L-007` split stays supported. Revision pinning stays `undetermined`
- Decision state: `undetermined`

### X-008 Effect must be a peer type

- Targets: `L-008`
- Setup: Name Effect beside Action and Event in the kernel.
- Falsifying result: A distinction that cannot be represented as attempt record plus later Event or Fact.
- Observed result: not run. Current sources implement Effect as execution mechanics. `E-007`, `E-009`
- Consequence: `L-008` remains `hypothesis`
- Decision state: `undetermined`

## Disagreements

### D-001 The word Action

- Claim A: `issue-0007-action-event-effect#C-001` Palantir, Ontologiq, and Open Foundry Action is a governed mutation or decision.
- Claim B: `issue-0007-action-event-effect#E-012` ValueFlows Action is a verb on a flow. The same verb sits on Intent, Commitment, and EconomicEvent.
- Conflict: terminology
- Evidence for A: `E-001`, `E-005`, `E-009`
- Evidence for B: `E-012` plus ValueFlows Actions page, accessed 2026-08-15, `https://www.valueflo.ws/concepts/actions/`
- Possible explanation: Different traditions. Operational ontology versus REA flow language.
- Resolution test: Keep both senses in research notes. Do not reuse one OS token for both without a qualifier.
- Status: `open`
- Resolution: unresolved

### D-002 What to do after a failed side effect

- Claim A: `issue-0007-action-event-effect#E-008` Open Foundry may compensate local state after a side-effect failure.
- Claim B: `issue-0007-action-event-effect#L-002` Ontologiq and Stripe refuse to treat a lost or failed-looking external call as a license to invent a second business effect, including a blind undo that may itself be unknown.
- Conflict: interpretation of failure
- Evidence for A: `E-008`
- Evidence for B: `E-006`, `E-007`, `E-010`
- Possible explanation: Open Foundry compensation targets *local* objects after a reported side-effect failure. It is not a claim about payment-network undo. Blind compensation of an `unknown` external call would still be wrong.
- Resolution test: Run S-004 against both policies. If the webhook accepted the supplier order and the client saw a timeout, compensation would create a worse split.
- Status: `open`
- Resolution: unresolved

### D-003 Palantir writeback versus Palantir's own hole

- Claim A: `issue-0007-action-event-effect#E-003` Writeback is sold as transactional with the external system.
- Claim B: Same page. External success plus ontology failure remains possible.
- Conflict: official-doc internal tension
- Evidence for A: `E-003`
- Evidence for B: `E-003`
- Possible explanation: Writeback prevents the cheap failure, ontology-changed-and-ERP-refused. It does not prevent the expensive one, ERP-accepted-and-ontology-refused.
- Resolution test: None needed. Both sentences stand. The hole is the finding.
- Status: `resolved`
- Resolution: Writeback is ordering plus fail-closed on *reported* webhook failure. It is not atomicity.

## Runtime consequences

### R-001 Attempt outcomes are a closed sum

- If claim survives: `C-007`, `L-002`
- Required property: An effect attempt must be representable as not-dispatched, confirmed, refused, or unknown. Unknown must be first-class.
- Evidence: `E-007`, `E-010`
- Non-requirement: A particular HTTP client, queue, or database.
- Decision state: `supported`

### R-002 Idempotency keys are stored before dispatch

- If claim survives: `L-002`
- Required property: The correlation key for an attempt exists in durable storage before the request is sent. Retries reuse it. Lookups can find it.
- Evidence: `E-006`, `E-007`, `E-010`
- Non-requirement: Stripe's 24-hour cache as OS policy.
- Decision state: `supported`

### R-003 Commit revalidation is in the execution path

- If claim survives: `L-003`
- Required property: The path from approval to effect evaluates live preconditions and the approved digest. Failure is deny or re-propose, not silent execute.
- Evidence: `E-005`, `E-006`
- Non-requirement: MCP, CLI approval, or a human-in-the-loop product.
- Decision state: `supported`

### R-004 Outbox-class delivery is at-least-once

- If claim survives: `L-004`, `E-011`
- Required property: If OS emits notifications or connector calls after an internal commit, consumers and the other side must tolerate duplicates. Dedup is by attempt id or idempotency key.
- Evidence: `E-011`, `E-008`
- Non-requirement: Kafka, Debezium, or a particular relay.
- Decision state: `supported`

### R-005 Compensation cannot be the only undo

- If claim survives: `L-006`, `D-002`
- Required property: A runtime that undoes local rows after an external call must still record the original commit, the attempt, and the compensation as separate facts. It must not run compensation on `unknown` without reconciliation.
- Evidence: `E-008`, `E-010`, `E-014`
- Non-requirement: Saga engines or 2PC.
- Decision state: `hypothesis`

## Candidate lifecycle

Two machines, not one. Principle applied: model the domain as state machines rather than a bag of status booleans.

### Invocation machine

```text
defined
  -> proposed                  preview or durable proposal
  -> denied | expired | withdrawn
  -> approved                  digest bound, world not frozen
  -> commit_revalidating
  -> rejected_at_commit        world or digest mismatch
  -> internally_committed      C-004
  -> attempting_effects        zero or more C-005 records
  -> terminal_for_invocation   see attempt machine for each effect
```

An invocation can stop at `internally_committed` with no effect. Notification-only work can skip a business Event. That is allowed by `L-005`.

### Attempt machine

```text
not_dispatched
  -> dispatch_failed_unsent    connect error, safe to retry same key
  -> dispatched
  -> confirmed                 observed success from the other side
  -> refused                   observed rejection from the other side
  -> unknown                   dispatched, no trustworthy reply
  -> reconciled_confirmed | reconciled_refused
```

`unknown` is not `not_dispatched`. Reconciliation is a later observation, often an Event, not a rewrite of the attempt into "failed."

### Occurrence machine

```text
observed                     immutable occurrence
  -> corrected_by later occurrence
  -> reversed_by later occurrence
```

No `cancelled` flag that erases the first observation.

## Adversarial cases

| Case | Machine reading | Law |
| --- | --- | --- |
| Lost HTTP after supplier accepted | Attempt `unknown`. No second POST without the same key or a supplier lookup. | `L-002` |
| Payment processor timeout | Same. Stripe 500 is also indeterminate. Webhook may arrive later. | `L-002`, `E-010` |
| ERP write succeeds, callback fails | Internal commit and observed ERP event can diverge. Outbox or later poll. Do not mark the ERP write failed. | `L-004` |
| Carrier accepts pickup later | Occurrence with no new Ship action, or a later observation linked to the earlier invocation. | `L-005` |
| Duplicate invocation | Second call hits the same idempotency key or the claimed proposal. Same attempt, not a second effect. | `R-002`, `E-006` |
| Stale approval after receipt | `rejected_at_commit` or new proposal. | `L-003`, S-003 |

## Kernel type versus ordinary object

| Concept | Verdict on current evidence | Decision state |
| --- | --- | --- |
| Action definition | Already a candidate in RFC-0001. Evidence supports keeping it. This note does not promote it. | `undetermined` as kernel type |
| Action invocation | Ordinary typed object with the invocation machine | `hypothesis` |
| Proposal and approval | Ordinary typed object or a stage of invocation. Durable proposal is useful, not proven necessary as its own kernel type | `hypothesis` |
| Internal commit | Mechanism plus resulting Facts or object versions. Not a new kernel type | `hypothesis` |
| External effect | Ordinary attempt record. See `L-008` | `hypothesis` |
| Unknown | State of an attempt, not a type | `supported` |
| Observed Event | Distinction from Action is `supported`. Kernel versus interface versus Fact is open question 5 | `undetermined` |
| Compensation, reversal, correction | Kinds of later Actions or Events | `supported` |
| Idempotency key, correlation id | Attributes on attempts and messages | `supported` |

## Dependent research

- Consumes repo framing only. `docs/thesis.md` "Action is not event." `docs/constitution.md` items 8 and 9. `scenarios/README.md` S-003, S-004, S-010. Not used as evidence.
- No other `research/notes/` artifacts existed on this branch.
- Related open questions that stay `undetermined` here: item 4, what exactly is an Action, and item 5, Action versus Event versus Effect.

## Open questions

- What exact digest must approval bind? Parameters, ontology revision, policy revision, assumed stock, actor claims. `undetermined`
- Is Event a kernel type, an interface, or a Fact? `undetermined`. Do not treat this note as an answer to open question 5.
- Can a connector Action replace a dedicated effect record? `undetermined`
- When is a purely internal admin edit allowed to skip named Actions? `undetermined`. Open question 4.
- How should async "accepted, not yet happened" sit relative to Commitment versus unknown attempt? Carrier pickup is an Event. A payment `processing` status may be an observation of the processor, not OS unknown. `undetermined`
- Do sensor streams and fiscal postings share one occurrence type? `undetermined`

## Licensing

Concepts and documented behavior only. Ontologiq and Open Foundry are Apache-2.0. ERPNext is GPL. No implementation was copied or translated. Stripe and Palantir text is quoted at the minimum needed to identify the claim.

## Sources

1. Palantir Action types overview, webhooks, submission criteria, Validate Action. Accessed 2026-08-15.
2. `ontologiq/ontologiq@5a087250f5ee0c7ab354d27fbafd53694a8ec366`
3. `syzygyhack/open-foundry@f29bcb9ed819be76d549183b017316908bab8585`
4. Stripe Idempotent requests and Advanced error handling. Accessed 2026-08-15.
5. ValueFlows Flows, Diagram explanations, Actions. Accessed 2026-08-15.
6. ERPNext Immutable Ledger. Updated 2026-08-14.
7. Chris Richardson, Transactional outbox. Accessed 2026-08-15.
8. Wade Waldron, Confluent dual-write problem. Accessed 2026-08-15.
