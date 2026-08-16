# Evidence

**Status:** labeled notes, 2026-08-15.  
**Decision:** none.

Each block names its kind. Interpretation is not the source.

Kinds used here:

- domain evidence
- source-system artifact
- candidate law
- counterexample
- runtime consequence

## E-001. Ontologiq action schema binds approval and effect

**Kind:** source-system artifact.  
**Decision state:** supported as a description of that code.  
**Source:** [ontologiq/ontologiq `packages/core/src/ontologiq/schema/action.py`](https://github.com/ontologiq/ontologiq/blob/5a087250f5ee0c7ab354d27fbafd53694a8ec366/packages/core/src/ontologiq/schema/action.py) at `5a087250f5ee`.

`Action` carries `requires`, `params`, `policy`, `approval`, `audit`, `dry_run`, and `effect`. `Effect.type` is only `webhook` or `handler`. The class docstring says preconditions are re-evaluated at execution because approval windows are long. `audit: false` is reserved and rejected by validate rather than accepted as a switch the runtime does not honor.

**Interpretation.** The format makes "who, when, and what happens" one record. It also refuses a direct SQL write as an effect.

## E-002. Ontologiq propose cannot execute a gated action

**Kind:** source-system artifact.  
**Decision state:** supported.  
**Source:** [serve/actions.py](https://github.com/ontologiq/ontologiq/blob/5a087250f5ee0c7ab354d27fbafd53694a8ec366/packages/core/src/ontologiq/serve/actions.py) `propose` and `execute_approved`.

`propose` checks role, then evaluates policy and precondition in one warehouse query that also fetches the row. A dry run returns `would` and never writes. A gated call stores a proposal with `digest` and `actor_claims`. The MCP note says the model cannot approve it.

`execute_approved` claims the proposal with a single conditional update. It compares `args_digest(identity, params)` to `args_sha256`. It re-runs `evaluate` on live data with the pinned claims. Optional `fresh_actor_attrs` must also pass. A failed precondition after approval finishes the proposal as failed and does not fire the effect.

**Interpretation.** Approval authorizes a hashed call, not a later world.

## E-003. Ontologiq lost I/O is unknown

**Kind:** source-system artifact.  
**Decision state:** supported.  
**Source:** [serve/effects.py](https://github.com/ontologiq/ontologiq/blob/5a087250f5ee0c7ab354d27fbafd53694a8ec366/packages/core/src/ontologiq/serve/effects.py).

Outcomes are `executed`, `effect_failed`, and `unknown`. Connect errors retry because nothing was sent. After the request is sent, any missing response returns `unknown`. Redirects are failures. 4xx is failure. The execute note for `unknown` says do not retry.

The URL is rebuilt from the ontology template every time. Identity values are percent-encoded. Scheme, host, and port must match the template after substitution.

**Interpretation.** This is the first inspected runtime that matches scenario S-004 in `scenarios/README.md` without collapsing timeout to failure.

## E-004. Ontologiq state is live, not historical

**Kind:** source-system artifact and counterexample.  
**Decision state:** supported as a description of Ontologiq. undetermined for OS.  
**Source:** [docs/concepts.md](https://github.com/ontologiq/ontologiq/blob/5a087250f5ee0c7ab354d27fbafd53694a8ec366/docs/concepts.md).

`state` is an ordered map of predicates compiled into the view. Nothing is stored. The page says a customer can become `churned` because time passed, with no event. History is "deferred, not dropped".

**Interpretation.** An operational ontology can ship without a Fact store. That does not prove Fact is unnecessary for OS. It does prove "executable ontology" and "bitemporal fact kernel" are separable claims.

## E-005. Open Foundry commits, then fires side effects

**Kind:** source-system artifact and counterexample.  
**Decision state:** supported.  
**Source:** [syzygyhack/open-foundry `packages/actions/src/executor/action-executor.ts`](https://github.com/syzygyhack/open-foundry/blob/f29bcb9ed819be76d549183b017316908bab8585/packages/actions/src/executor/action-executor.ts) at `f29bcb9ed819`.

Order in `execute`:

1. validate params
2. `security.checkPermission`
3. optional consent
4. CEL preconditions on resolved objects
5. apply effects in one storage transaction and `commit`
6. run side effects
7. write audit and emit events after commit

If a side effect fails and the manifest says `ROLLBACK_ALL`, the executor opens a new transaction and tries to undo created or updated objects from `beforeStates`. Deleted-object undo is documented as best effort. Audit failure after commit is logged and does not fail the action.

There is no `dryRun` symbol in this file.

**Interpretation.** Local mutation and external notification are not one atomic reality. Compensation is a second story about already-committed rows.

## E-006. ShipOrder keeps going after a failed side effect

**Kind:** source-system artifact.  
**Decision state:** supported.  
**Source:** [domain-packs/supply-chain/actions/ship-order.yaml](https://github.com/syzygyhack/open-foundry/blob/f29bcb9ed819be76d549183b017316908bab8585/domain-packs/supply-chain/actions/ship-order.yaml).

Preconditions require order status `CONFIRMED` or `IN_PRODUCTION`, operational facilities, and a logistics role. Effects set `order.status` to `SHIPPED` and create a `Shipment`. `rollback.onSideEffectFailure` is `LOG_AND_CONTINUE`. `reversible: false`.

**Interpretation.** The domain pack prefers a shipped local order over a consistent event bus. That is a product choice. It is also a counterexample to "action success means the world was told".

## E-007. Open Foundry webhook retries treat HTTP failure as failure

**Kind:** source-system artifact.  
**Decision state:** supported.  
**Source:** [packages/actions/src/sideeffects/side-effect-executor.ts](https://github.com/syzygyhack/open-foundry/blob/f29bcb9ed819be76d549183b017316908bab8585/packages/actions/src/sideeffects/side-effect-executor.ts).

Webhooks POST, retry with backoff, and throw on status `>= 400`. `RETRY_INDEFINITELY` caps at 100 attempts. There is no `unknown` state. A timeout is an error string.

**Runtime consequence.** A carrier API that accepted the pickup and then dropped the socket can be retried into a duplicate pickup unless the far side is idempotent. The executor does not say so.

## E-008. u485349 confirmation flag is storage, not a gate

**Kind:** counterexample.  
**Decision state:** supported.  
**Source:** [action_type.rs](https://github.com/u485349-coder/OpenFoundry/blob/37cf492b2cc8d2b5bb83c9a0d48979ecceb8ccda/services/ontology-service/src/models/action_type.rs) and [handlers/actions.rs](https://github.com/u485349-coder/OpenFoundry/blob/37cf492b2cc8d2b5bb83c9a0d48979ecceb8ccda/services/ontology-service/src/handlers/actions.rs) at `37cf492b2cc8`.

`ActionType` has `confirmation_required`. `execute_action` plans, then updates, links, deletes, or invokes HTTP. `rg confirmation_required` on that handler hits only SQL bind columns. The execute function never reads the flag.

`ActionOperationKind` includes `UpdateObject`, `CreateLink`, `DeleteObject`, `InvokeFunction`, and `InvokeWebhook`. Function responses can request further ontology mutations after the HTTP call returns.

**Interpretation.** A schema field named like a gate is not a gate. Function-then-mutate also splits local truth from the external call without an unknown outcome.

## E-009. Przyval apply is param validation plus a handler

**Kind:** source-system artifact.  
**Decision state:** supported.  
**Source:** [services/svc-actions/src/routes/v2/actions.ts](https://github.com/Przyval/openfoundry/blob/580410bb35d5be89f6825c53495ecfb63280e33e/services/svc-actions/src/routes/v2/actions.ts) at `580410bb35d5`.

`apply` requires `actions:execute`, validates parameters against the registered action, runs `action.handler`, and logs success or failure. `validate` is the same parameter check with no live-state precondition.

**Interpretation.** Palantir API shape can exist without Palantir mutation semantics. Useful as an SDK compatibility test harness. Weak as a donor for OS gates.

## E-010. ObjectStack script actions run trusted after invoke

**Kind:** source-system artifact and counterexample.  
**Decision state:** supported as documented behavior. the runtime `.ts` files were not opened this session.  
**Source:** [content/docs/ai/actions-as-tools.mdx](https://github.com/objectstack-ai/objectstack/blob/716ac9bf8f7419d134d7d90f2ecfc460b84bb2b5/content/docs/ai/actions-as-tools.mdx) at `716ac9bf8f74`.

The page states that a `script` or `body` handler executes with the app's full data authority. Internal `engine.insert` and `update` calls carry no caller context and bypass RLS and FLS. The boundary is invoke time. `ai.exposed` plus `requiredPermissions` decide whether the agent may trigger the action. Flow actions honor `runAs`.

Object CRUD tools stay inside the caller's `ExecutionContext`. Business actions do not, once they fire.

**Candidate law this attacks.** "One Action for humans and agents" does not imply equal authority through the effect.

## E-011. ObjectStack isSystem is total elevation

**Kind:** source-system artifact and runtime consequence.  
**Decision state:** supported as documented.  
**Source:** [content/docs/permissions/system-context.mdx](https://github.com/objectstack-ai/objectstack/blob/716ac9bf8f7419d134d7d90f2ecfc460b84bb2b5/content/docs/permissions/system-context.mdx).

`ExecutionContext.isSystem` is read at 80 sites across 18 packages. It short-circuits authorization, ownership stamping, read-only protection, referential integrity, sharing materialization, approval locks, and provenance stamping. HTTP and action bodies cannot set it. An absent context defaults to false.

**Interpretation.** Elevation that skips provenance is a semantic event, not an implementation convenience. OS should treat a missing actor as a refusal unless a named system principal is bound.

## E-012. ObjectStack approval nodes re-read live fields

**Kind:** domain evidence inside a source doc.  
**Decision state:** supported as documented.  
**Source:** [content/docs/automation/approvals.mdx](https://github.com/objectstack-ai/objectstack/blob/716ac9bf8f7419d134d7d90f2ecfc460b84bb2b5/content/docs/automation/approvals.mdx).

`field` and `expression` approvers bind at node entry, not at submit. The expression roots are `current.*`, `trigger.*`, and `vars.*`. Bare `record` is refused because "the record" is ambiguous across two times. `runAs: 'user'` is refused when there is no triggering user, so approval-outcome flows must declare `runAs: 'system'` explicitly.

**Interpretation.** The product already hit the stale-routing problem and split submit-time from entry-time. It did not apply the same split to script-action arguments.

## E-013. OpenBKN models Object, Action, Rule, Constraint in Markdown

**Kind:** source-system artifact.  
**Decision state:** partial. examples exist. the execute loop was not opened.  
**Source:** [restart_pod.bkn](https://github.com/openbkn-ai/bkn-foundry/blob/ebec618d2108767bc7d695e48be91e1bdf2a2b4c/adp/bkn/bkn-backend/server/bkn-specification/examples/k8s-network/action_types/restart_pod.bkn) and [README.md](https://github.com/openbkn-ai/bkn-foundry/blob/ebec618d2108767bc7d695e48be91e1bdf2a2b4c/README.md) at `ebec618d2108`.

The example binds `restart_pod` to object `pod`, a trigger on `pod_status in (Unknown, Failed)`, a tool `kubectl_delete_pod`, and an impact contract `expected_operation: modify`. The README describes `Object -> Action -> Rule -> Constraint` and an evidence chain from intent to invocation.

README accuracy percentages and TCO claims are marketing. They are not evidence.

**License.** `LICENSE` splits Apache-2.0 upstream files from OpenBKN net-new modules. `LICENSE-OPENBKN.txt` adds commercial-entitlement and restricted-hosted-service conditions. BKN Safe is listed as a fully OpenBKN component.

**Interpretation.** Steal the four-element graph as a vocabulary hypothesis. Do not reuse the code in an MIT core.

## E-014. OpenBKN permission check is an HTTP decision

**Kind:** source-system artifact.  
**Decision state:** supported for the adapter. undetermined for fail-closed semantics on transport error.  
**Source:** [permission_access.go](https://github.com/openbkn-ai/bkn-foundry/blob/ebec618d2108767bc7d695e48be91e1bdf2a2b4c/adp/bkn/bkn-backend/server/drivenadapters/permission/permission_access.go).

`CheckPermission` POSTs to `{permissionUrl}/operation-check`. A transport error returns `(false, error)`. A 200 body unmarshals `checkResult.Result`.

**Open question.** Callers of this adapter were not read. Whether a transport error denies the action or aborts the request is undetermined.

## E-015. Xpert UOSE is a documented loop, not a traced function

**Kind:** source-system artifact. declared design.  
**Decision state:** undetermined as implementation.  
**Source:** [xpert-ai/docs `en/data/overview/uose-theory.mdx`](https://github.com/xpert-ai/docs/blob/2f38fe1ad46a/en/data/overview/uose-theory.mdx) at `2f38fe1ad46a`, and [xpert-ai/xpert README](https://github.com/xpert-ai/xpert/blob/8980047c48cec26889521cd1901465cfed9d96a7/README.md).

The theory page names Entity, Relation, Attribute, Affordance, and Policy. The required path is intent, object location, neighborhood, action discovery, simulation, then execution. Fail-closed reasons include missing unique entity, policy deny, and high-risk action without an approved request. Semantics and facts are separated. Adapters own real reads and writes.

`gh search code "UOSE" --repo xpert-ai/xpert` returned fixture type names. `simulateAction` was not reached. The platform README does implement agent and workflow hybrid execution, workbenches, MCP, and approvals at product level.

**Interpretation.** Treat UOSE as a candidate vocabulary. Do not mark the loop implemented until a later session opens the adapter and approval code. AGPL. concepts only.

## E-016. Arkhe is a contract, never a runtime

**Kind:** source-system artifact.  
**Decision state:** supported.  
**Source:** [arkhelang/arkhelang README](https://github.com/arkhelang/arkhelang/blob/aed2eaa8645b591518cb64f2de01719b95f6d05e/README.md) and [ADR 0003](https://github.com/arkhelang/arkhelang/blob/aed2eaa8645b591518cb64f2de01719b95f6d05e/docs/adr/0003-tool-contract-ir-protocols-are-emitters.md) at `aed2eaa8645b`.

The README refuses execution, storage, metrics, workflow, policy evaluation, inference, and protocol dependence. The compiler emits a tool-contract IR with resolved CEL guard, authority, approval escalation, audit obligation, effects, and provenance hashes. MCP is an emitter, not the metamodel.

**Interpretation.** This is the cleanest statement that OS toolchain generation should sit below semantics. It is also a warning against making MCP a primitive.

## E-017. open-ontologies is a knowledge-graph engine

**Kind:** source-system artifact.  
**Decision state:** supported as a classification.  
**Source:** [fabio-rovai/open-ontologies README](https://github.com/fabio-rovai/open-ontologies/blob/26a7572c9479eb99f2df32e4ae436812bfa7cc47/README.md) at `26a7572c9479`.

The product is a Rust MCP server over Oxigraph with OWL-RL, SHACL, SPARQL, and a Dynamics `ActionSchema` for concurrent ticks and ramifications. `onto_policy_check` composes with `onto_certify_action`. This is formal ontology engineering, not an ERP mutation runtime.

**Interpretation.** Useful later for issue 37. Weak donor for Action as a business intervention. Do not score it as an operational-ontology runtime by README tool count.

## E-018. OpenCrab approval queue does not revalidate

**Kind:** source-system artifact and counterexample.  
**Decision state:** supported.  
**Source:** [opencrab/execution/approvals.py](https://github.com/AlexAI-MCP/OpenCrab/blob/d34352cec9d99c755c1e891f811911461a460280/opencrab/execution/approvals.py) and [action_registry.py](https://github.com/AlexAI-MCP/OpenCrab/blob/d34352cec9d99c755c1e891f811911461a460280/opencrab/execution/action_registry.py) at `d34352cec9d9`.

`ApprovalEngine.resolve` updates `pending` to `approved` or `rejected`. It does not reload the subject or re-check a precondition. `validate_action_params` returns valid when no YAML schema exists.

The README's nine spaces (subject, resource, evidence, concept, claim, community, outcome, lever, policy) are a knowledge-factory grammar. Hosted SaaS code is not in the repo. There is no LICENSE file. The README claims MIT.

**Interpretation.** Evidence-first ontology building is a different job from governed mutation. The approval table is a queue, not a stale-state protocol.

## E-019. gura105 write-back-first and the authority line

**Kind:** source-system artifact, candidate law, and counterexample.  
**Decision state:** supported as a description of that runtime.  
**Source:** [src/core.ts](https://github.com/gura105/operational-ontology/blob/c79aa88c1f5d4fe2ac2b126a5852f1ba434aaa57/src/core.ts) `execute` and [IMPLEMENTATION.md](https://github.com/gura105/operational-ontology/blob/c79aa88c1f5d4fe2ac2b126a5852f1ba434aaa57/IMPLEMENTATION.md) at `c79aa88c1f5d`.

`execute` is the only write API. Params must be plain JSON. Preconditions run. `effects` returns an edit plan and does nothing. The plan is dry-run through the commit code. Authority is then checked.

Refusals include `UNDECLARED_SOURCE_WRITE`, `MISDECLARED_WRITEBACK`, `MIXED_AUTHORITY`, and `SOURCE_CREATE_UNSUPPORTED`. Write-back runs before local commit. `WRITEBACK_FAILED` keeps the ontology unchanged. `COMMIT_FAILED` after a successful adapter call is a divergence. A process death between those two steps loses both the edit and the audit entry. The implementation says so.

Visibility treats a hidden target as `TARGET_NOT_FOUND`.

**Candidate law.** An action must sit on one side of the source-versus-ontology line, or the runtime must refuse.

**Counterexample to audit completeness.** "Every attempt is audited" is false across a crash window the authors documented.

## E-020. Name collision is itself evidence

**Kind:** domain evidence.  
**Decision state:** supported.  
**Source:** the search list in [`sources.md`](sources.md).

At least five public repos answer to "Open Foundry". One is a digital-twin ontology platform. One is a Rust service sketch with an empty LICENSE. One is a Palantir API emulator. One is an agent notebook stack. One is empty.

**Interpretation.** Do not bind OS research to a product name. Bind it to a commit and a file.

## Candidate laws restated

1. **Kind:** candidate law. **State:** supported by E-001, E-005, E-009, E-019. A meaningful business write is a named action with a typed plan, not an implicit row update.
2. **Kind:** candidate law. **State:** supported by E-002, E-012. Approval binds a call at a time. Commit must re-evaluate that call against live state.
3. **Kind:** candidate law. **State:** supported by E-003. **Counterexample pressure from E-007.** A lost response after send is `unknown`.
4. **Kind:** candidate law. **State:** supported by E-005, E-019. Local edits and source writes are different authorities.
5. **Kind:** candidate law. **State:** supported by E-010, E-011. Surface parity is not authority parity.

RFC-0001 was not changed. These laws attack it. They do not replace it.
