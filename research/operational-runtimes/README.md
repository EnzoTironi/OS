# Operational ontology and agentic business runtimes

**Status:** Wave A corpus notes for issue 36. Partial. Session date 2026-08-15.  
**Decision:** none.  
**Track:** corpus.  
**Question:** which modern operational-ontology and agentic-business runtimes implement object, link, action, approval, policy, time, side-effect, tool, UI, evolution, federation, and audit semantics in inspectable code, and which of those abstractions OS should steal, improve, or reject.

This folder is evidence, not a product shortlist. License and maturity are recorded separately from conceptual quality. Copyleft and mixed-license systems were read for behavior only. No source was vendored.

The name "Open Foundry" is a collision. This audit treats [syzygyhack/open-foundry](https://github.com/syzygyhack/open-foundry) as the inspectable Palantir-like platform named in `docs/research-program.md`. Two other public repos reuse the name and are scored on their own rows.

## Overview

The shared vocabulary is now cheap. Independent projects keep rediscovering object types, link types, named actions, and some permission check. The hard part is what happens after someone says yes.

The projects that actually enforce a business mutation split into two families.

One family owns local object state and then tries to tell the world. [syzygyhack/open-foundry](https://github.com/syzygyhack/open-foundry) commits object and link edits first, then fires webhooks and events. Compensation is a second transaction. A lost webhook is a failed side effect, not an unknown outcome.

The other family refuses to own the write. [ontologiq/ontologiq](https://github.com/ontologiq/ontologiq) treats the warehouse as read-only, stores a hashed proposal, and lets only a separate human process fire a webhook. Preconditions and ABAC run again at execution. A request that left the process with no response is `unknown`.

Those two designs answer the same OS questions in opposite ways. That contrast is the main finding.

## Key concepts

**Capability class.** `implemented` means a code path was read this session and it enforces the behavior. `partial` means some of the behavior exists. `declared-only` means a README, schema field, or doc claims it and the inspected path does not enforce it. `absent` means the inspected tree has no such path. `undetermined` means the search did not reach inspectable code.

**Evidence kinds.** Every block in [`evidence.md`](evidence.md) is labeled as domain evidence, source-system artifact, candidate law, counterexample, or runtime consequence.

**Decision state.** Claims in this folder are `hypothesis`, `supported`, `rejected`, or `undetermined`. Nothing here is silently accepted. RFC-0001 was not edited.

## How the audit worked

Search used `gh search repos`, `gh repo view`, recursive Git trees, and raw files at pinned commits. Marketing copy was not treated as implementation. Xpert UOSE theory pages were read as declared design. The `simulateAction` path was not found in `xpert-ai/xpert` during this session.

Files in this folder:

- [`sources.md`](sources.md) lists exact repos, commits, and files.
- [`matrix.md`](matrix.md) is the capability and enforcement grid.
- [`evidence.md`](evidence.md) holds labeled excerpts and interpretations.
- [`steal-improve-reject.md`](steal-improve-reject.md) is the OS implication list.
- [`open-questions.md`](open-questions.md) is what this session did not settle.

## Convergence

Independent sources treat a business mutation as a named action with typed inputs, not as a generic row update.

Independent sources also treat human, API, and agent callers as surfaces over that action. ObjectStack documents this as MCP `run_action` sharing the REST dispatcher. Ontologiq compiles the same YAML into SQL views and MCP tools. Arkhe compiles actions to a protocol-neutral tool-contract IR.

Three sources independently refuse to let an agent be the last word on a gated write. Ontologiq keeps approve off the MCP surface. ObjectStack requires `ai.exposed` plus an invoke-time permission check. Xpert docs describe fail-closed simulation and approval before adapter execution.

## Divergence

Who owns current state. Ontologiq computes `state` from live source rows and never writes SQL for an action. Open Foundry and ObjectStack persist objects and then emit side effects. gura105's reference runtime writes the source first when `writeback: true`, then commits the local overlay.

What approval authorizes. Ontologiq binds hashed arguments and re-reads the live row. ObjectStack approval nodes re-read live routing fields at node entry, then a `script` action body runs with the app's full data authority. Open Foundry's `confirmation_required` field on `u485349-coder/OpenFoundry` is stored and never read by `execute_action`.

What a lost external call means. Ontologiq records `unknown` and tells the caller not to retry. Open Foundry retries the webhook and, on `ROLLBACK_ALL`, tries to undo already-committed objects. Most other inspected executors collapse the outcome to success or failure.

## Candidate laws

1. Named actions are the mutation gate. Generic object CRUD is a different, narrower administrative path.
2. Approval of a proposal is not authorization of the world at commit time. Commit must re-evaluate the bound arguments against live state.
3. A timeout after bytes leave the process is not a known failure.
4. Local ontology edits and source-system writes are not one atomic fact. An action must declare which side it is on, or the runtime must say the outcome is unknown.
5. "Same action for humans and agents" is only as safe as the authority that still holds inside the effect.

## Counterexamples

ObjectStack `script` and `body` actions pass the invoke-time gate, then run trusted engine calls that skip caller RLS. That falsifies the claim that sharing an Action name is enough for human and agent parity.

`u485349-coder/OpenFoundry` stores `confirmation_required` on the action type and executes without reading it. A confirmation flag is not a gate.

Open Foundry (`syzygyhack`) commits effects, then runs side effects. `ShipOrder` sets `onSideEffectFailure: LOG_AND_CONTINUE`. Local truth can move while the outside world does not.

Ontologiq `state` is a live CASE over source columns. There is no valid-time history in the inspected runtime. An operational ontology can exist without a temporal store. That is a warning for RFC-0001 Fact, not a proof against it.

## Runtime pressure

If law 2 survives, the runtime needs a durable proposal record, an argument digest, an ontology digest, and a single-claimer execute step.

If law 3 survives, effect outcomes need at least `executed`, `effect_failed`, and `unknown`, plus an idempotency key that is not a retry invitation after `unknown`.

If law 4 survives, the engine needs an authority line on each edit plan. Mixed local-and-source plans should be refused or split.

If law 5 survives, elevation (`isSystem`, trusted script bodies, `--allow-auto-effects`) must be server-constructed, greppable, and fail-closed when missing.

## Open questions

See [`open-questions.md`](open-questions.md). None of those answers were written into `docs/open-questions.md`.

## Decision state

| Claim | State |
| --- | --- |
| Object, link, and named action are a shared donor vocabulary | supported |
| Approval-then-revalidate is a serious candidate protocol | supported as a pattern in Ontologiq. undetermined as an OS primitive |
| Lost external I/O must be representable as unknown | supported as a pattern in Ontologiq. undetermined as an OS primitive |
| Fact or bitemporal storage is required for an operational ontology | undetermined. Ontologiq currently works without it |
| UOSE is a fully traced implementation of that loop | undetermined |
| OpenBKN or Xpert code should be reused in the MIT core | rejected on license grounds. concepts remain usable |
| Arkhe is a runtime OS could adopt | rejected. it is a language and compiler by design |
| RFC-0001 should change from this corpus alone | rejected. independent sources converge on actions and gates, not on the Fact primitive |

## Licensing note

OS is MIT. This folder extracts concepts and observed behavior. Xpert Community Edition is AGPL-3.0. OpenBKN Foundry is multi-licensed, Apache-2.0 on upstream files and an OpenBKN license with extra commercial conditions on net-new modules. Do not copy implementation from either into the OS repo.
